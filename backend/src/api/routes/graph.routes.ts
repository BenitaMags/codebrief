import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres.js";
import { files as filesTable, summaries as summariesTable } from "../../db/schema.js";
import { getRepoGraph } from "../../services/neo4j.service.js";

const router = Router();

router.get("/:id/graph", async (req, res) => {
  try {
    const repoId = req.params.id;

    const neo4jGraph = await getRepoGraph(repoId);

    // Pull summaries + readingOrder from Postgres to enrich each node —
    // Neo4j only knows structure (nodes/edges), Postgres has the meaning.
    const fileRows = await db
      .select({
        path: filesTable.path,
        readingOrder: filesTable.readingOrder,
        overview: summariesTable.overview,
      })
      .from(filesTable)
      .leftJoin(summariesTable, eq(summariesTable.fileId, filesTable.id))
      .where(eq(filesTable.repoId, repoId));

    const metaByPath = new Map(fileRows.map((f) => [f.path, f]));

    const nodes = neo4jGraph.map((n) => {
      const meta = metaByPath.get(n.path);
      return {
        id: n.path,
        label: n.path.split("/").pop(),
        summary: meta?.overview ?? "",
        readingOrder: meta?.readingOrder ?? null,
      };
    });

    const edges = neo4jGraph.flatMap((n) =>
      n.imports.map((target: string) => ({
        source: n.path,
        target,
        relationship: "imports",
      }))
    );

    res.json({ nodes, edges });
  } catch (err) {
    console.error("[graph.routes] failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;