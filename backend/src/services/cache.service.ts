import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const SUMMARY_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Cache key is scoped to owner/repo/filePath/sha — the sha changes whenever
 * file content changes, so this cache naturally invalidates itself on any
 * edit without needing manual invalidation logic.
 */
function summaryCacheKey(owner: string, name: string, filePath: string, sha: string): string {
  return `summary:${owner}/${name}:${filePath}:${sha}`;
}

export async function getCachedSummary(owner: string, name: string, filePath: string, sha: string) {
  const raw = await redis.get(summaryCacheKey(owner, name, filePath, sha));
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedSummary(
  owner: string,
  name: string,
  filePath: string,
  sha: string,
  data: { overview: string; keyPoints: string[]; embedding: number[] }
) {
  await redis.set(
    summaryCacheKey(owner, name, filePath, sha),
    JSON.stringify(data),
    "EX",
    SUMMARY_CACHE_TTL_SECONDS
  );
}

export { redis };