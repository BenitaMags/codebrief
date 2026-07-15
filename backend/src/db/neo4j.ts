import neo4j, { Driver } from "neo4j-driver";

const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

export async function setupConstraints() {
  const session = driver.session();
  try {
    // Ensures each file within a repo is a unique node — prevents duplicate
    // nodes when the Diff Agent re-analyzes the same file on every push.
    await session.run(`
      CREATE CONSTRAINT file_path_repo_unique IF NOT EXISTS
      FOR (f:File)
      REQUIRE (f.repoId, f.path) IS UNIQUE
    `);
    console.log("[neo4j] constraints ready");
  } finally {
    await session.close();
  }
}

export { driver };
