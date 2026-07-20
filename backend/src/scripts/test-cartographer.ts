import { randomUUID } from "crypto";
import { parseGithubUrl, fetchDefaultBranch, fetchFileTree } from "../services/github.service.js";
import { runCartographerAgent } from "../agents/cartographer.agent.js";
import { getRepoGraph } from "../services/neo4j.service.js";

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error("Usage: tsx src/scripts/test-cartographer.ts <github-repo-url>");
    process.exit(1);
  }

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);
  const files = await fetchFileTree(owner, name, branch);

  const repoId = randomUUID(); // fake repo id for this test — real ones come from the `repos` table later
  console.log(`[test] Using test repoId: ${repoId}`);

  const result = await runCartographerAgent(repoId, owner, name, branch, files);
  console.log(`\n[test] Cartographer result:`, result);

  const graph = await getRepoGraph(repoId);
  console.log(`\n[test] Graph readback (${graph.length} nodes):`);
  graph
    .filter((n) => n.imports.length > 0)
    .slice(0, 10)
    .forEach((n) => {
      console.log(`  ${n.path}`);
      n.imports.forEach((imp: string) => console.log(`    → ${imp}`));
    });

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});