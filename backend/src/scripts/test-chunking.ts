import { randomUUID } from "crypto";
import { parseGithubUrl, fetchDefaultBranch, fetchFileContent } from "../services/github.service.js";
import { db } from "../db/postgres.js";
import { files as filesTable, summaries as summariesTable, repos as reposTable } from "../db/schema.js";

// Exported from summarizer.agent.ts for direct testing — see note below.
import { summarizeAndStoreFile } from "../agents/summarizer.agent.js";

async function main() {
  const repoUrl = process.argv[2] ?? "https://github.com/expressjs/express";
  const targetPath = process.argv[3] ?? "lib/response.js";

  const { owner, name } = parseGithubUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, name);

  const content = await fetchFileContent(owner, name, branch, targetPath);
  const lineCount = content.split("\n").length;
  console.log(`[test] ${targetPath} is ${lineCount} lines`);

  if (lineCount <= 500) {
    console.log(`[test] WARNING: this file is under the 500-line chunking threshold — won't test chunking. Pick a bigger file.`);
  }

  const [repoRow] = await db
    .insert(reposTable)
    .values({ githubUrl: repoUrl, owner, name, defaultBranch: branch })
    .returning();

  const sha = "test-" + randomUUID().slice(0, 8); // fake sha, fine for a one-off test
  const result = await summarizeAndStoreFile(repoRow.id, owner, name, targetPath, content, sha);

  console.log(`\n[test] Summary result:`);
  console.log(`OVERVIEW: ${result.overview}`);
  result.keyPoints.forEach((kp) => console.log(`  - ${kp}`));

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});