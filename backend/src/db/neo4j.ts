import neo4j, { Driver } from "neo4j-driver";

const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000; // 3s between attempts — Neo4j's own healthcheck interval is similar, so this gives it a fair chance to finish booting

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function setupConstraints() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = driver.session();
    try {
      await session.run(`
        CREATE CONSTRAINT file_path_repo_unique IF NOT EXISTS
        FOR (f:File)
        REQUIRE (f.repoId, f.path) IS UNIQUE
      `);
      console.log("[neo4j] constraints ready");
      return; // success — exit the retry loop
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.warn(
        `[neo4j] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${(err as Error).message}`
      );
      if (isLastAttempt) {
        throw new Error(
          `[neo4j] Failed to connect after ${MAX_RETRIES} attempts. Is the neo4j container healthy? (${(err as Error).message})`
        );
      }
      await sleep(RETRY_DELAY_MS);
    } finally {
      await session.close();
    }
  }
}

export { driver };