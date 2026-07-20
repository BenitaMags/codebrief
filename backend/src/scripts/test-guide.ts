import { runGuideAgent } from "../agents/guide.agent.js";

async function main() {
  const repoId = process.argv[2];
  if (!repoId) {
    console.error("Usage: tsx src/scripts/test-guide.ts <repoId>");
    console.error("Use a repoId that already has Cartographer + Summarizer + Prioritizer data (e.g. from test-prioritizer.ts output)");
    process.exit(1);
  }

  const guide = await runGuideAgent(repoId);

  console.log(`\n=== ONBOARDING GUIDE ===\n`);
  console.log(`OVERVIEW:\n${guide.overview}\n`);
  console.log(`ARCHITECTURE:\n${guide.architectureSummary}\n`);
  console.log(`ENTRY POINTS:\n${guide.entryPoints.map((p) => `  - ${p}`).join("\n")}\n`);
  console.log(`COMMON TASKS:\n${guide.commonTasksGuidance}\n`);
  console.log(`QUICK START:\n${guide.quickStart}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[test] Failed:", err);
  process.exit(1);
});