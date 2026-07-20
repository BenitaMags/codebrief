import Redis from "ioredis";
import { env } from "../config/env.js";

const publisher = new Redis(env.redisUrl);

export async function publishProgress(repoId: string, eventName: string, data: unknown) {
  await publisher.publish("agent-progress", JSON.stringify({ repoId, eventName, data }));
}