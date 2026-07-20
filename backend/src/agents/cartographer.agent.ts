import { fetchFileContent } from "../services/github.service.js";
import { extractImports } from "../lib/ast.js";
import { upsertFileNode, upsertImportEdge } from "../services/neo4j.service.js";
import type { GithubFile } from "../services/github.service.js";

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/**
 * Resolves a relative import ("./utils", "../lib/foo") against the importing
 * file's own path, and matches it against the real file list — since import
 * paths often omit extensions ("./utils" -> "./utils.ts") or point at a
 * directory's index file ("./lib" -> "./lib/index.ts").
 */
import path from "node:path";

function resolveImportPath(sourcePath: string, importedPath: string, allPaths: Set<string>): string | null {
  const sourceDir = path.posix.dirname(sourcePath);
  let joined = path.posix.normalize(path.posix.join(sourceDir, importedPath));
  joined = joined.replace(/\/$/, ""); // strip any trailing slash left by normalize
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

export async function runCartographerAgent(
  repoId: string,
  owner: string,
  name: string,
  branch: string,
  files: GithubFile[]
): Promise<{ nodesCreated: number; edgesCreated: number; unresolvedImports: number }> {
  const jsFiles = files.filter((f) => JS_TS_EXTENSIONS.some((ext) => f.path.endsWith(ext)));
  const allPaths = new Set(jsFiles.map((f) => f.path));

  console.log(`[cartographer] Creating ${jsFiles.length} file nodes...`);
  for (const file of jsFiles) {
    await upsertFileNode({ repoId, path: file.path });
  }

  let edgesCreated = 0;
  let unresolvedImports = 0;

  console.log(`[cartographer] Extracting and storing import edges...`);
  for (const file of jsFiles) {
    const content = await fetchFileContent(owner, name, branch, file.path);
    const imports = extractImports(file.path, content);

    for (const imp of imports) {
      if (!imp.isRelative) continue; // package imports don't become graph edges

      const resolved = resolveImportPath(file.path, imp.importedPath, allPaths);
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
    `[cartographer] Done. Nodes: ${jsFiles.length}, Edges: ${edgesCreated}, Unresolved: ${unresolvedImports}`
  );

  return { nodesCreated: jsFiles.length, edgesCreated, unresolvedImports };
}