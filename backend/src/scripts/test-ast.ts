import { parseGithubUrl, fetchDefaultBranch, fetchFileTree, fetchFileContent } from "../services/github.service.js";
import { extractImports, ImportEdge } from "../lib/ast.js";

const PARSEABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py"];

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error("Usage: tsx src/scripts/test-ast.ts <github-repo-url>");
    process.exit(1);
  }

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);
  const files = await fetchFileTree(owner, name, branch);

  const parseableFiles = files.filter((f) => PARSEABLE_EXTENSIONS.some((ext) => f.path.endsWith(ext)));
  console.log(`[test] Found ${parseableFiles.length} parseable files out of ${files.length} total\n`);

  if (parseableFiles.length === 0) {
    console.log("[test] No parseable files found in this repo.");
    return;
  }

  let totalEdges = 0;

  for (const file of parseableFiles.slice(0, 15)) {
    const content = await fetchFileContent(owner, name, branch, file.path);
    const edges = extractImports(file.path, content);

    console.log(`[test] ${file.path} → ${edges.length} import(s)`);
    edges.forEach((e: ImportEdge) =>
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