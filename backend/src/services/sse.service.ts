import { Response } from "express";
import Redis from "ioredis";
import { env } from "../config/env.js";

interface SSEClient {
  repoId: string;
  res: Response;
}

const clients: SSEClient[] = [];
const subscriber = new Redis(env.redisUrl);

subscriber.subscribe("agent-progress");
subscriber.on("message", (_channel, message) => {
  try {
    const { repoId, eventName, data } = JSON.parse(message);
    const relevant = clients.filter((c) => c.repoId === repoId);
    for (const client of relevant) {
      client.res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  } catch (err) {
    console.error("[sse] Failed to parse Redis pub/sub message:", err);
  }
});

export function registerSSEClient(repoId: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const client: SSEClient = { repoId, res };
  clients.push(client);

  res.write(`event: connected\ndata: ${JSON.stringify({ repoId })}\n\n`);

  res.on("close", () => {
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
  });
}