import { Queue } from "bullmq";
import { env } from "../config/env.js";

export interface AnalyzeJobData {
  repoId: string;
  githubUrl: string;
  owner: string;
  name: string;
  branch: string;
}

const connection = { url: env.redisUrl };

export const analyzeQueue = new Queue<AnalyzeJobData>("analyze-repo", {
  connection,
  defaultJobOptions: {
    attempts: 1, // don't auto-retry — a timeout on a CPU-bound local model job usually means the same file will time out again
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});