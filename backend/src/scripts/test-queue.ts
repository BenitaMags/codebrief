import { parseGithubUrl, fetchDefaultBranch } from "../services/github.service.js";
import { db } from "../db/postgres.js";
import { repos as reposTable } from "../db/schema.js";
import { analyzeQueue } from "../queue/analyze.queue.js";

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error("Usage: tsx src/scripts/test-queue.ts <github-repo-url>");
    process.exit(1);
  }

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);

  const [repoRow] = await db
    .insert(reposTable)
    .values({ githubUrl: repoUrl, owner, name, defaultBranch: branch, status: "pending" })
    .returning();

  console.log(`[test] Created repo row: ${repoRow.id}`);

  const job = await analyzeQueue.add("analyze", {
    repoId: repoRow.id,
    githubUrl: repoUrl,
    owner,
    name,
    branch,
  });

  console.log(`[test] Enqueued job ${job.id}. Watch the worker container logs to see it process:`);
  console.log(`  docker-compose logs worker -f`);
  console.log(`\n[test] Or poll the repo status yourself:`);
  console.log(`  docker-compose exec postgres psql -U codebrief -d codebrief -c "SELECT id, status, file_count FROM repos WHERE id = '${repoRow.id}';"`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});