import { parseGithubUrl, fetchDefaultBranch, fetchFileTree, fetchFileContent } from "../services/github.service.js";
import { extractImports } from "../lib/ast.js";

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error("Usage: tsx src/scripts/test-ast.ts <github-repo-url>");
    process.exit(1);
  }

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);
  const files = await fetchFileTree(owner, name, branch);

  const jsFiles = files.filter((f) => JS_TS_EXTENSIONS.some((ext) => f.path.endsWith(ext)));
  console.log(`[test] Found ${jsFiles.length} JS/TS files out of ${files.length} total\n`);

  if (jsFiles.length === 0) {
    console.log("[test] No JS/TS files found in this repo — nothing to parse. Try a JS/TS repo instead.");
    return;
  }

  let totalEdges = 0;
  let failedFiles = 0;

  for (const file of jsFiles.slice(0, 15)) { // cap at 15 files for a quick console-readable test
    const content = await fetchFileContent(owner, name, branch, file.path);
    const edges = extractImports(file.path, content);

    if (edges.length === 0 && content.trim().length > 0) {
      // Could be a genuinely import-free file, or a silent parse failure — worth eyeballing
    }

    console.log(`[test] ${file.path} → ${edges.length} import(s)`);
    edges.forEach((e) =>
      console.log(`    - "${e.importedPath}" ${e.isRelative ? "(relative)" : "(package)"}`)
    );
    totalEdges += edges.length;
  }

  console.log(`\n[test] Total edges extracted: ${totalEdges}`);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});