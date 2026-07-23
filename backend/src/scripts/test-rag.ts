import { ragChat } from "../services/rag.service.js";

async function main() {
  const repoId = process.argv[2];
  const question = process.argv[3];

  if (!repoId || !question) {
    console.error("Usage: tsx src/scripts/test-rag.ts <repoId> <question>");
    process.exit(1);
  }

  console.log(`[test] Asking: "${question}" about repo ${repoId}\n`);
  const result = await ragChat(repoId, question);

  console.log(`Answer:\n${result.answer}\n`);
  console.log(`Citations:`);
  result.citations.forEach((c, i) => {
    console.log(`  [${i + 1}] ${c.path} (similarity: ${c.similarity.toFixed(3)})`);
    console.log(`      ${c.overview.slice(0, 100)}...`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});