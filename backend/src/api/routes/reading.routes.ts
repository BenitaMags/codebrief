import { Router } from "express";
import { eq, isNotNull, asc } from "drizzle-orm";
import { db } from "../../db/postgres.js";
import { files as filesTable } from "../../db/schema.js";
import { getFileRankings } from "../../services/neo4j.service.js";

const router = Router();

router.get("/:id/reading-order", async (req, res) => {
  try {
    const repoId = req.params.id;

    const rows = await db
      .select({ path: filesTable.path, order: filesTable.readingOrder })
      .from(filesTable)
      .where(eq(filesTable.repoId, repoId))
      .orderBy(asc(filesTable.readingOrder));

    const rankings = await getFileRankings(repoId);
    const dependentCountByPath = new Map(rankings.map((r) => [r.path, r.dependentCount]));

    const readingOrder = rows
      .filter((r) => r.order !== null)
      .map((r) => {
        const dependentCount = dependentCountByPath.get(r.path) ?? 0;
        return {
          path: r.path,
          order: r.order,
          dependentCount,
          reasoning:
            dependentCount > 0
              ? `${dependentCount} other file${dependentCount === 1 ? "" : "s"} import${dependentCount === 1 ? "s" : ""} this file`
              : "No other files in this repo import this file directly",
        };
      });

    res.json(readingOrder);
  } catch (err) {
    console.error("[reading.routes] failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;