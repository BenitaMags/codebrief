import { db } from "../db/postgres.js";
import { repos as reposTable, files as filesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { parseGithubUrl, fetchDefaultBranch, fetchFileTree } from "../services/github.service.js";
import { runCartographerAgent } from "../agents/cartographer.agent.js";
import { runPrioritizerAgent } from "../agents/prioritizer.agent.js";

async function main() {
  const repoUrl = process.argv[2] ?? "https://github.com/expressjs/express";

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);
  const files = await fetchFileTree(owner, name, branch);

  // Fresh repo row + fresh Cartographer run, so this test is self-contained
  // and doesn't depend on state left over from earlier test runs.
  const [repoRow] = await db
    .insert(reposTable)
    .values({ githubUrl: repoUrl, owner, name, defaultBranch: branch })
    .returning();

  console.log(`[test] repoId: ${repoRow.id}`);
  console.log(`[test] Running Cartographer first (Prioritizer needs graph data to rank)...`);
  await runCartographerAgent(repoRow.id, owner, name, branch, files);

  // Prioritizer also needs File rows to exist in Postgres to write reading_order onto —
  // Cartographer only writes to Neo4j, so we insert matching Postgres file rows here.
  const jsFiles = files.filter((f) => [".ts", ".tsx", ".js", ".jsx"].some((ext) => f.path.endsWith(ext)));
  for (const f of jsFiles) {
    await db.insert(filesTable).values({ repoId: repoRow.id, path: f.path });
  }

  console.log(`\n[test] Running Prioritizer...`);
  const readingOrder = await runPrioritizerAgent(repoRow.id);

  console.log(`\n[test] Top 15 reading order:`);
  readingOrder.slice(0, 15).forEach((entry) => {
    console.log(`  ${entry.order}. ${entry.path} — ${entry.reasoning}`);
  });

  console.log(`\n[test] Verifying Postgres was updated correctly...`);
  const stored = await db
    .select({ path: filesTable.path, readingOrder: filesTable.readingOrder })
    .from(filesTable)
    .where(eq(filesTable.repoId, repoRow.id));

  const distinctOrders = new Set(stored.map((s) => s.readingOrder)).size;
  console.log(`[test] ${stored.length} file rows, ${distinctOrders} distinct reading_order values`);
  if (distinctOrders === 1 && stored.length > 1) {
    console.error(`[test] BUG DETECTED: all files have the same reading_order — the WHERE clause fix didn't take effect!`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});