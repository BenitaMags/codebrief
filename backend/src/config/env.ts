function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[env] Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  githubToken: requireEnv("GITHUB_TOKEN"),
  databaseUrl: requireEnv("DATABASE_URL"),
  neo4jUri: requireEnv("NEO4J_URI"),
  neo4jUser: requireEnv("NEO4J_USER"),
  neo4jPassword: requireEnv("NEO4J_PASSWORD"),
  redisUrl: requireEnv("REDIS_URL"),
};