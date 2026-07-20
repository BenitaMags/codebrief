import express from "express";
import { setupConstraints } from "./db/neo4j.js";
import sseRoutes from "./api/routes/sse.routes.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "codebrief-backend",
    timestamp: new Date().toISOString(),
  });
});

async function start() {
  await setupConstraints();
  app.listen(4000, () => {
    console.log(`[backend] listening on port 4000`);
  });
}

start().catch((err) => {
  console.error("[backend] failed to start:", err);
  process.exit(1);
});

app.use("/repos", sseRoutes);