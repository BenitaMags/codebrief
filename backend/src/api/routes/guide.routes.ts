import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/postgres.js";
import { guides as guidesTable } from "../../db/schema.js";

const router = Router();

router.get("/:id/guide", async (req, res) => {
  try {
    const [guide] = await db
      .select()
      .from(guidesTable)
      .where(eq(guidesTable.repoId, req.params.id))
      .orderBy(desc(guidesTable.createdAt))
      .limit(1);

    if (!guide) return res.status(404).json({ error: "Guide not found for this repo" });
    res.json(guide);
  } catch (err) {
    console.error("[guide.routes] failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;