import { randomUUID } from "crypto";
import { parseGithubUrl, fetchDefaultBranch, fetchFileTree } from "../services/github.service.js";
import { runSummarizerAgent } from "../agents/summarizer.agent.js";
import { db } from "../db/postgres.js";
import { files as filesTable, summaries as summariesTable, repos as reposTable } from "../db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  const repoUrl = process.argv[2];
  const limit = process.argv[3] ? parseInt(process.argv[3]) : 5;

  if (!repoUrl) {
    console.error("Usage: tsx src/scripts/test-summarizer.ts <github-repo-url> [file-limit]");
    process.exit(1);
  }

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);
  const allFiles = await fetchFileTree(owner, name, branch);
  const testFiles = allFiles.slice(0, limit);

  // Insert a real repos row first — files.repo_id has a foreign key
  // constraint pointing at repos.id, so a repo row must exist before
  // any file/summary rows can reference it.
  const [repoRow] = await db
    .insert(reposTable)
    .values({ githubUrl: repoUrl, owner, name, defaultBranch: branch })
    .returning();

  const repoId = repoRow.id;
  console.log(`[test] repoId: ${repoId}, testing ${testFiles.length} files`);

  const result = await runSummarizerAgent(repoId, owner, name, branch, testFiles);
  console.log(`\n[test] Result:`, result);

  const rows = await db
    .select({
      path: filesTable.path,
      overview: summariesTable.overview,
      keyPoints: summariesTable.keyPoints,
    })
    .from(summariesTable)
    .innerJoin(filesTable, eq(summariesTable.fileId, filesTable.id))
    .where(eq(filesTable.repoId, repoId));

  console.log(`\n[test] Stored summaries:`);
  rows.forEach((r) => {
    console.log(`\n📄 ${r.path}`);
    console.log(`   ${r.overview}`);
    (r.keyPoints as string[]).forEach((kp) => console.log(`   - ${kp}`));
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});