import { env } from "../config/env.js";

const GITHUB_API = "https://api.github.com";

export interface GithubFile {
  path: string;
  size: number;
  sha: string;
}

interface ParsedRepoUrl {
  owner: string;
  name: string;
}

/**
 * Parses "https://github.com/owner/repo" (with or without .git, trailing slash)
 * into { owner, name }. Throws on anything that isn't a github.com repo URL.
 */
export function parseGithubUrl(url: string): ParsedRepoUrl {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const match = cleaned.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`[github] Not a valid GitHub repo URL: ${url}`);
  }
  return { owner: match[1], name: match[2] };
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${env.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Looks up the repo's default branch (main, master, or something custom).
 * We need this before fetching the tree, since the tree endpoint requires a branch/ref.
 */
export async function fetchDefaultBranch(owner: string, name: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}`, {
    headers: githubHeaders(),
  });
  if (!res.ok) {
    throw new Error(`[github] Failed to fetch repo metadata: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.default_branch;
}

/**
 * Fetches the full recursive file tree for a repo at a given branch.
 * Returns only blobs (files) — tree entries (directories) are filtered out
 * since we only care about actual files to analyze.
 * Also skips common noise: .git, node_modules, and other vendored/build dirs,
 * so we're not wasting API calls or storage on files we'd never summarize anyway.
 */
export async function fetchFileTree(
  owner: string,
  name: string,
  branch: string
): Promise<GithubFile[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders() }
  );
  if (!res.ok) {
    throw new Error(`[github] Failed to fetch file tree: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  if (data.truncated) {
    console.warn(
      `[github] Warning: tree for ${owner}/${name} was truncated by GitHub's API (repo too large for a single response). Some files may be missing.`
    );
  }

  const IGNORED_DIR_PATTERNS = [
    /(^|\/)node_modules\//,
    /(^|\/)\.git\//,
    /(^|\/)dist\//,
    /(^|\/)build\//,
    /(^|\/)\.next\//,
    /(^|\/)vendor\//,
  ];

  return data.tree
    .filter((entry: any) => entry.type === "blob")
    .filter((entry: any) => !IGNORED_DIR_PATTERNS.some((pattern) => pattern.test(entry.path)))
    .map((entry: any) => ({
      path: entry.path,
      size: entry.size ?? 0,
      sha: entry.sha,
    }));
}

/**
 * Fetches the raw text content of a single file via the raw.githubusercontent.com
 * CDN rather than the GitHub Contents API — this avoids base64 decoding and
 * doesn't count against the same rate limit bucket as the REST API calls above.
 */
export async function fetchFileContent(
  owner: string,
  name: string,
  branch: string,
  path: string
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${encodeURI(path)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.githubToken}` } });
  if (!res.ok) {
    throw new Error(`[github] Failed to fetch file content for ${path}: ${res.status}`);
  }
  return res.text();
}