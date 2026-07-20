import { publishProgress } from "../services/progress.service.js";

async function main() {
  const repoId = process.argv[2];
  if (!repoId) {
    console.error("Usage: tsx src/scripts/test-sse-synthetic.ts <repoId>");
    console.error("Use any string — this doesn't touch the database, just publishes fake events for that id.");
    process.exit(1);
  }

  const stages = [
    { stage: "analyzing", message: "Starting analysis..." },
    { stage: "cartographer", message: "Mapping 42 files..." },
    { stage: "cartographer_done", message: "Cartographer done: 42 files, 17 edges" },
    { stage: "summarizer", message: "Summarizing files..." },
    { stage: "ready", message: "Analysis complete!" },
  ];

  for (const s of stages) {
    console.log(`[test] Publishing:`, s);
    await publishProgress(repoId, "status", s);
    await new Promise((resolve) => setTimeout(resolve, 1500)); // small delay so events are visibly separate in curl output
  }

  console.log(`[test] Done publishing all stages.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});