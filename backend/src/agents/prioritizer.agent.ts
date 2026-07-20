import { and, eq } from "drizzle-orm";
import { db } from "../db/postgres.js";
import { files as filesTable } from "../db/schema.js";
import { getFileRankings } from "../services/neo4j.service.js";

export interface ReadingOrderEntry {
  path: string;
  order: number;
  dependentCount: number;
  reasoning: string;
}

/**
 * Runs the ranking query against Neo4j, then writes the resulting
 * reading_order back onto each file's row in Postgres — so the API
 * doesn't need to hit Neo4j on every request for the reading list.
 */
export async function runPrioritizerAgent(repoId: string): Promise<ReadingOrderEntry[]> {
  const rankings = await getFileRankings(repoId);

  if (rankings.length === 0) {
    console.log(`[prioritizer] No File nodes found in Neo4j for repoId ${repoId} — nothing to rank.`);
    return [];
  }

  const readingOrder: ReadingOrderEntry[] = rankings.map((r, i) => ({
    path: r.path,
    order: i + 1,
    dependentCount: r.dependentCount,
    reasoning:
      r.dependentCount > 0
        ? `${r.dependentCount} other file${r.dependentCount === 1 ? "" : "s"} import${r.dependentCount === 1 ? "s" : ""} this file`
        : "No other files in this repo import this file directly",
  }));

  console.log(`[prioritizer] Ranked ${readingOrder.length} files. Writing reading_order to Postgres...`);

  for (const entry of readingOrder) {
  await db
    .update(filesTable)
    .set({ readingOrder: entry.order })
    .where(and(eq(filesTable.repoId, repoId), eq(filesTable.path, entry.path)));
 }

  return readingOrder;
}