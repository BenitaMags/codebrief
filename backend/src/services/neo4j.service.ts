import { driver } from "../db/neo4j.js";

export interface FileNode {
  repoId: string;
  path: string;
}

export interface ImportRelationship {
  repoId: string;
  sourcePath: string;
  targetPath: string;
}

/**
 * Upserts a File node. MERGE (not CREATE) so re-running analysis on the
 * same repo/path updates the existing node instead of creating a duplicate —
 * this is what the file_path_repo_unique constraint from Step 2 protects.
 */
export async function upsertFileNode(node: FileNode): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MERGE (f:File {repoId: $repoId, path: $path})
       ON CREATE SET f.createdAt = datetime()
       RETURN f`,
      { repoId: node.repoId, path: node.path }
    );
  } finally {
    await session.close();
  }
}

/**
 * Creates an IMPORTS relationship between two File nodes in the same repo.
 * MERGE on the relationship too, so re-analysis doesn't create duplicate edges.
 * Both nodes must already exist (created via upsertFileNode) before this runs.
 */
export async function upsertImportEdge(edge: ImportRelationship): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (source:File {repoId: $repoId, path: $sourcePath})
       MATCH (target:File {repoId: $repoId, path: $targetPath})
       MERGE (source)-[:IMPORTS]->(target)`,
      { repoId: edge.repoId, sourcePath: edge.sourcePath, targetPath: edge.targetPath }
    );
  } finally {
    await session.close();
  }
}

/**
 * Reads back the full graph for a repo — used for verification and later
 * by the graph.routes.ts endpoint that feeds the frontend's Cytoscape.js map.
 */
export async function getRepoGraph(repoId: string) {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (f:File {repoId: $repoId})
       OPTIONAL MATCH (f)-[:IMPORTS]->(target:File {repoId: $repoId})
       RETURN f.path AS source, collect(target.path) AS imports`,
      { repoId }
    );
    return result.records.map((r) => ({
      path: r.get("source"),
      imports: r.get("imports").filter((p: string | null) => p !== null),
    }));
  } finally {
    await session.close();
  }
}