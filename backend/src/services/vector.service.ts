import { db, pool } from "../db/postgres.js";
import { generateEmbedding } from "../lib/embeddings.js";

export interface SearchResult {
  fileId: string;
  path: string;
  overview: string;
  similarity: number;
}

/**
 * Embeds the user's question, then finds the most semantically similar
 * file summaries via pgvector's cosine distance operator (<=>).
 * Returns the top N most relevant files — these become the "context"
 * that grounds the LLM's answer in real repo data.
 */
export async function searchSimilarFiles(
  repoId: string,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const result = await pool.query(
    `SELECT
       f.id AS file_id,
       f.path,
       s.overview,
       1 - (s.embedding <=> $1::vector) AS similarity
     FROM summaries s
     JOIN files f ON f.id = s.file_id
     WHERE f.repo_id = $2
       AND s.embedding IS NOT NULL
     ORDER BY s.embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, repoId, topK]
  );

  return result.rows.map((r: any) => ({
    fileId: r.file_id,
    path: r.path,
    overview: r.overview,
    similarity: parseFloat(r.similarity),
  }));
}