import { eq } from "drizzle-orm";
import { db } from "../db/postgres.js";
import { repos as reposTable, files as filesTable } from "../db/schema.js";
import { fetchFileContent } from "../services/github.service.js";
import { summarizeAndStoreFile } from "../agents/summarizer.agent.js";

async function main() {
  const repoId = process.argv[2];
  if (!repoId) {
    console.error("Usage: tsx src/scripts/test-guide-setup.ts <repoId>");
    process.exit(1);
  }

  const [repoRow] = await db.select().from(reposTable).where(eq(reposTable.id, repoId));
  if (!repoRow) {
    console.error(`No repo found for id ${repoId}`);
    process.exit(1);
  }

  const topFiles = await db
    .select({ id: filesTable.id, path: filesTable.path, readingOrder: filesTable.readingOrder })
    .from(filesTable)
    .where(eq(filesTable.repoId, repoId))
    .orderBy(filesTable.readingOrder)
    .limit(15);

  console.log(`[setup] Summarizing top ${topFiles.length} files for ${repoRow.owner}/${repoRow.name}...`);

  for (const file of topFiles) {
    console.log(`[setup] Summarizing ${file.path}...`);
    const content = await fetchFileContent(repoRow.owner, repoRow.name, repoRow.defaultBranch ?? "main", file.path);
    // Note: this creates a *second* files row for the same path (summarizeAndStoreFile
    // always inserts) — acceptable for this one-off setup script, not for production agent code.
    await summarizeAndStoreFile(repoId, repoRow.owner, repoRow.name, file.path, content, `setup-${file.id}`);
  }

  console.log(`[setup] Done. Ready to run Guide Agent for repoId ${repoId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[setup] Failed:", err);
  process.exit(1);
});