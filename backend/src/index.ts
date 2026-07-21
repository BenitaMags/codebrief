import express from "express";
import cors from "cors";
import { setupConstraints } from "./db/neo4j.js";
import sseRoutes from "./api/routes/sse.routes.js";
import repoRoutes from "./api/routes/repo.routes.js";
import graphRoutes from "./api/routes/graph.routes.js";
import readingRoutes from "./api/routes/reading.routes.js";
import guideRoutes from "./api/routes/guide.routes.js";

const app = express();

app.use(cors()); // wide open for hackathon speed — tighten to specific origin before any real production use
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "codebrief-backend",
    timestamp: new Date().toISOString(),
  });
});

app.use("/repos", repoRoutes);
app.use("/repos", graphRoutes);
app.use("/repos", readingRoutes);
app.use("/repos", guideRoutes);
app.use("/repos", sseRoutes);

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