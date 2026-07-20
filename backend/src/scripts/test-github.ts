import { parseGithubUrl, fetchDefaultBranch, fetchFileTree, fetchFileContent } from "../services/github.service.js";

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error("Usage: tsx src/scripts/test-github.ts <github-repo-url>");
    process.exit(1);
  }

  const { owner, name } = parseGithubUrl(repoUrl);
  console.log(`[test] Parsed: owner=${owner} name=${name}`);

  const branch = await fetchDefaultBranch(owner, name);
  console.log(`[test] Default branch: ${branch}`);

  const files = await fetchFileTree(owner, name, branch);
  console.log(`[test] Found ${files.length} files (after filtering ignored dirs)`);
  console.log(`[test] First 10 files:`);
  files.slice(0, 10).forEach((f) => console.log(`  - ${f.path} (${f.size} bytes)`));

  const firstFile = files[0];
  console.log(`\n[test] Fetching content of: ${firstFile.path}`);
  const content = await fetchFileContent(owner, name, branch, firstFile.path);
  console.log(`[test] Content length: ${content.length} chars`);
  console.log(`[test] First 200 chars:\n${content.slice(0, 200)}`);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});