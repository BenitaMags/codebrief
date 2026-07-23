import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/postgres.js";
import { repos as reposTable } from "../db/schema.js";
import { fetchFileTree } from "../services/github.service.js";
import type { AnalyzeJobData } from "../queue/analyze.queue.js";
import { publishProgress } from "../services/progress.service.js";
import { runAnalysisPipeline } from "../agents/orchestrator.js";

const connection = { url: env.redisUrl };



async function processAnalyzeJob(job: Job<AnalyzeJobData>) {
  const { repoId, owner, name, branch } = job.data;
  console.log(`[worker] Starting analysis for ${owner}/${name} (repoId: ${repoId})`);

  await db.update(reposTable).set({ status: "analyzing" }).where(eq(reposTable.id, repoId));
  await publishProgress(repoId, "status", { stage: "analyzing", message: `Starting analysis of ${owner}/${name}...` });

  try {
    const files = await fetchFileTree(owner, name, branch);
    await job.updateProgress(10);

    const result = await runAnalysisPipeline({ repoId, owner, name, branch, files });
    await job.updateProgress(100);

    await db
      .update(reposTable)
      .set({ status: "ready", fileCount: files.length, updatedAt: new Date() })
      .where(eq(reposTable.id, repoId));

    await publishProgress(repoId, "status", { stage: "ready", message: "Analysis complete!" });

    console.log(`[worker] Done.`, {
      cartographer: result.cartographerResult,
      summarizer: result.summarizerResult,
      prioritizer: result.prioritizerResult ? "ranked" : null,
      guide: result.guideResult ? "generated" : null,
    });
    return result;
  } catch (err) {
    await db.update(reposTable).set({ status: "failed" }).where(eq(reposTable.id, repoId));
    await publishProgress(repoId, "status", { stage: "failed", message: `Analysis failed: ${(err as Error).message}` });
    console.error(`[worker] Analysis failed for repoId ${repoId}:`, err);
    throw err;
  }
}

export const analyzeWorker = new Worker<AnalyzeJobData>("analyze-repo", processAnalyzeJob, {
  connection,
  concurrency: 1, // Ollama can only really process one generation at a time on CPU — see Step 6 notes
});

analyzeWorker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

analyzeWorker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

console.log("[worker] Listening for analyze-repo jobs...");

