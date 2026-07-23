import path from "node:path";
import { fetchFileContent } from "../services/github.service.js";
import { extractImports } from "../lib/ast.js";
import { upsertFileNode, upsertImportEdge } from "../services/neo4j.service.js";
import type { GithubFile } from "../services/github.service.js";

const PARSEABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py"];

/**
 * Resolves a relative import ("./utils", "../lib/foo") against the importing
 * file's own path, and matches it against the real file list — since import
 * paths often omit extensions ("./utils" -> "./utils.ts") or point at a
 * directory's index file ("./lib" -> "./lib/index.ts").
 */

function resolveImportPath(
  sourcePath: string,
  importedPath: string,
  allPaths: Set<string>,
  isPython: boolean
): string | null {
  if (isPython) {
    return resolvePythonImportPath(sourcePath, importedPath, allPaths);
  }

  // existing JS/TS resolution logic stays exactly as-is
  const sourceDir = path.posix.dirname(sourcePath);
  let joined = path.posix.normalize(path.posix.join(sourceDir, importedPath));
  joined = joined.replace(/\/$/, "");
  const resolved = joined === "." ? "" : joined;

  const candidates = resolved === ""
    ? JS_TS_EXTENSIONS.map((ext) => `index${ext}`)
    : [
        resolved,
        ...JS_TS_EXTENSIONS.map((ext) => resolved + ext),
        ...JS_TS_EXTENSIONS.map((ext) => `${resolved}/index${ext}`),
      ];

  return candidates.find((c) => allPaths.has(c)) ?? null;
}

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/**
 * Python import resolution: converts dotted module paths to file paths.
 * `myapp.utils` → tries `myapp/utils.py`, `myapp/utils/__init__.py`
 * `.helpers` from `myapp/core/foo.py` → tries `myapp/core/helpers.py`, `myapp/core/helpers/__init__.py`
 * `..helpers` from `myapp/core/foo.py` → tries `myapp/helpers.py`, `myapp/helpers/__init__.py`
 */
function resolvePythonImportPath(
  sourcePath: string,
  importedPath: string,
  allPaths: Set<string>
): string | null {
  let basePath: string;

  if (importedPath.startsWith(".")) {
    // Relative import: count dots, climb directories
    const dots = importedPath.match(/^\.+/)?.[0].length ?? 0;
    const modulePart = importedPath.slice(dots); // the part after the dots
    const sourceDir = path.posix.dirname(sourcePath);
    const parts = sourceDir.split("/");
    const climbedDir = parts.slice(0, Math.max(0, parts.length - (dots - 1))).join("/");
    basePath = modulePart
      ? path.posix.join(climbedDir, modulePart.replace(/\./g, "/"))
      : climbedDir;
  } else {
    // Absolute import: dotted path maps directly to directory structure
    basePath = importedPath.replace(/\./g, "/");
  }

  const candidates = [
    basePath + ".py",
    path.posix.join(basePath, "__init__.py"),
  ];

  return candidates.find((c) => allPaths.has(c)) ?? null;
}

export async function runCartographerAgent(
  repoId: string,
  owner: string,
  name: string,
  branch: string,
  files: GithubFile[]
): Promise<{ nodesCreated: number; edgesCreated: number; unresolvedImports: number }> {
  const parseableFiles = files.filter((f) => PARSEABLE_EXTENSIONS.some((ext) => f.path.endsWith(ext)));
  const allPaths = new Set(parseableFiles.map((f) => f.path));

  console.log(`[cartographer] Creating ${parseableFiles.length} file nodes...`);
  for (const file of parseableFiles) {
    await upsertFileNode({ repoId, path: file.path });
  }

  let edgesCreated = 0;
  let unresolvedImports = 0;

  console.log(`[cartographer] Extracting and storing import edges...`);
  for (const file of parseableFiles) {
    const content = await fetchFileContent(owner, name, branch, file.path);
    const imports = extractImports(file.path, content);

    for (const imp of imports) {
      if (!imp.isRelative) {
        // For Python, dotted paths like "modules.csv_reader" might be intra-project
        // imports, not external packages — try resolving before giving up.
        const isPython = file.path.endsWith(".py");
        if (isPython) {
          const resolved = resolveImportPath(file.path, imp.importedPath, allPaths, true);
          if (resolved) {
            await upsertImportEdge({ repoId, sourcePath: file.path, targetPath: resolved });
            edgesCreated++;
            continue;
          }
        }
        continue; // genuinely external package — skip
      }

      const isPython = file.path.endsWith(".py");
      const resolved = resolveImportPath(file.path, imp.importedPath, allPaths, isPython);
      if (!resolved) {
      console.log(`[cartographer] UNRESOLVED: "${imp.importedPath}" from ${file.path}`);
      unresolvedImports++;
      continue;
    }

      await upsertImportEdge({ repoId, sourcePath: file.path, targetPath: resolved });
      edgesCreated++;
    }
  }

  console.log(
    `[cartographer] Done. Nodes: ${parseableFiles.length}, Edges: ${edgesCreated}, Unresolved: ${unresolvedImports}`
  );

  return { nodesCreated: parseableFiles.length, edgesCreated, unresolvedImports };
}