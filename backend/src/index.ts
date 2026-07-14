import express from "express";

const app = express();
const port = process.env.BACKEND_PORT ? 4000 : 4000; // always listen on 4000 inside container

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "codebrief-backend",
    timestamp: new Date().toISOString(),
  });
});

app.listen(4000, () => {
  console.log(`[backend] listening on port 4000`);
});
