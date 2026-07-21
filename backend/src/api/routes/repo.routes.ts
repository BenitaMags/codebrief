import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres.js";
import { repos as reposTable } from "../../db/schema.js";
import { parseGithubUrl, fetchDefaultBranch } from "../../services/github.service.js";
import { analyzeQueue } from "../../queue/analyze.queue.js";

const router = Router();

router.post("/analyze", async (req, res) => {
  try {
    const { githubUrl } = req.body;
    if (!githubUrl || typeof githubUrl !== "string") {
      return res.status(400).json({ error: "githubUrl is required" });
    }

    const { owner, name } = parseGithubUrl(githubUrl);
    const branch = await fetchDefaultBranch(owner, name);

    const [repoRow] = await db
      .insert(reposTable)
      .values({ githubUrl, owner, name, defaultBranch: branch, status: "pending" })
      .returning();

    await analyzeQueue.add("analyze", {
      repoId: repoRow.id,
      githubUrl,
      owner,
      name,
      branch,
    });

    res.status(201).json({ repoId: repoRow.id });
  } catch (err) {
    console.error("[repo.routes] /analyze failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [repo] = await db.select().from(reposTable).where(eq(reposTable.id, req.params.id));
    if (!repo) return res.status(404).json({ error: "Repo not found" });
    res.json(repo);
  } catch (err) {
    console.error("[repo.routes] GET /:id failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;