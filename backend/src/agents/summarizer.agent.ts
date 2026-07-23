import path from "node:path";
import { fetchFileContent } from "../services/github.service.js";
import { callOllama, SUMMARIZER_LOCAL_MODEL } from "../lib/llm.js";
import { generateEmbedding } from "../lib/embeddings.js";
import { getCachedSummary, setCachedSummary } from "../services/cache.service.js";
import { db } from "../db/postgres.js";
import { files as filesTable, summaries as summariesTable } from "../db/schema.js";
import type { GithubFile } from "../services/github.service.js";

const MAX_LINES_BEFORE_CHUNKING = 500;
const CHUNK_SIZE_LINES = 400; // per-chunk size when a file exceeds the threshold
const MAX_FILE_BYTES_FOR_LOCAL_MODEL = 50_000; // ~50KB — files bigger than this are too expensive for CPU-only inference

// Files we never summarize, regardless of extension checks elsewhere —
// lock files and binaries carry no useful "what does this code do" signal.

const SKIP_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "composer.lock",
  "Gemfile.lock",
  ".DS_Store",
  "Thumbs.db",
]);

const SKIP_DIR_PATTERNS = [
  /\.egg-info\//,
  /axiom_logs\//,
  /__pycache__\//,
  /\.pytest_cache\//,
  /\.tox\//,
  /\.mypy_cache\//,
];

const BINARY_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2",
  ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz", ".bz2", ".7z",
  ".exe", ".dll", ".so", ".dylib", ".pyc", ".pyo", ".class",
  ".o", ".obj", ".wasm", ".map",
];

export function shouldSkipFile(filePath: string): boolean {
  const filename = path.basename(filePath);
  if (SKIP_FILENAMES.has(filename)) return true;
  if (BINARY_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return true;
  if (SKIP_DIR_PATTERNS.some((pattern) => pattern.test(filePath))) return true;
  return false;
}


interface SummaryResult {
  overview: string;
  keyPoints: string[];
}

function parseSummaryResponse(raw: string): SummaryResult {
  // Expect Claude to respond in a simple, parseable format:
  // OVERVIEW: <paragraph>
  // - <bullet 1>
  // - <bullet 2>
  // - <bullet 3>
  const overviewMatch = raw.match(/OVERVIEW:\s*(.+?)(?=\n-|\n\n|$)/s);
  const bullets = [...raw.matchAll(/^-\s*(.+)$/gm)]
  .map((m) => m[1].trim())
  .filter((b) => !/^-+$/.test(b) && b.length > 0); // drop lines that are just dashes (markdown separators)
  
  return {
    overview: overviewMatch?.[1]?.trim() ?? raw.trim(),
    keyPoints: bullets.slice(0, 3),
  };
}

async function summarizeWholeFile(filePath: string, content: string): Promise<SummaryResult> {
  const raw = await callOllama(
    SUMMARIZER_LOCAL_MODEL,
    "You summarize source code files for developer onboarding. Be concise and concrete.",
    `File: ${filePath}\n\nSummarize ONLY the content below. Do not invent files, code, or examples that are not shown. If the file is short or just configuration, describe exactly what it configures.\n\nRespond in this exact format:\nOVERVIEW: <one paragraph explaining what this file does>\n- <key point 1>\n- <key point 2>\n- <key point 3>\n\n--- FILE CONTENT START ---\n${content}\n--- FILE CONTENT END ---`
  );
  return parseSummaryResponse(raw);
}

/**
 * For files over the line threshold: split into chunks, summarize each chunk
 * briefly, then run one more Claude call to merge the chunk summaries into a
 * single coherent file-level overview + 3 bullets. This keeps the per-call
 * token cost bounded regardless of how large the file is, per the $5/month
 * budget constraint — a 3000-line file costs roughly the same as 8 small
 * chunk calls plus one merge call, not one massive single call.
 */
async function summarizeChunkedFile(filePath: string, content: string): Promise<SummaryResult> {
  const lines = content.split("\n");
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE_LINES) {
    chunks.push(lines.slice(i, i + CHUNK_SIZE_LINES).join("\n"));
  }

  console.log(`[summarizer] ${filePath} is ${lines.length} lines — chunking into ${chunks.length} pieces`);

  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[summarizer]   summarizing chunk ${i + 1}/${chunks.length}...`);
    const summary = await callOllama(
      SUMMARIZER_LOCAL_MODEL,
      "You summarize a fragment of a larger source code file in 1-2 sentences. Be concise. Only describe what is actually shown — do not invent content.",
      `File: ${filePath} (part ${i + 1} of ${chunks.length})\n\n--- CONTENT START ---\n${chunks[i]}\n--- CONTENT END ---`
    );
    chunkSummaries.push(summary);
  }

  const merged = await callOllama(
    SUMMARIZER_LOCAL_MODEL,
    "You merge fragment summaries of a large source code file into one coherent file-level summary. Only describe what is actually shown in the fragment summaries — do not invent content.",
    `File: ${filePath}\n\nHere are summaries of this file's ${chunks.length} sequential parts:\n\n${chunkSummaries
      .map((s, i) => `Part ${i + 1}: ${s}`)
      .join("\n\n")}\n\nRespond in this exact format:\nOVERVIEW: <one paragraph summarizing the whole file>\n- <key point 1>\n- <key point 2>\n- <key point 3>`
  );

  return parseSummaryResponse(merged);
}

export async function summarizeAndStoreFile(
  repoId: string,
  owner: string,
  name: string,
  filePath: string,
  content: string,
  sha: string
): Promise<{ overview: string; keyPoints: string[] }> {
  const cachedResult = await getCachedSummary(owner, name, filePath, sha);

  let result: { overview: string; keyPoints: string[]; embedding: number[] };

  if (cachedResult) {
    result = cachedResult;
  } else {
    const lineCount = content.split("\n").length;
    let summary: SummaryResult;

    if (content.length > MAX_FILE_BYTES_FOR_LOCAL_MODEL) {
      console.log(`[summarizer] ${filePath} is ${content.length} bytes — too large for local model, using metadata summary`);
      const extension = path.extname(filePath);
      summary = {
        overview: `${filePath} is a ${lineCount}-line ${extension || "text"} file. It was too large to summarize with the current local model and should be reviewed manually for detailed understanding.`,
        keyPoints: [
          `File size: ${lineCount} lines, ${content.length} bytes`,
          `Language: ${extension || "unknown"}`,
          "Skipped by auto-summarizer due to size — review manually for details",
        ],
      };
    } else if (lineCount > MAX_LINES_BEFORE_CHUNKING) {
      summary = await summarizeChunkedFile(filePath, content);
    } else {
      summary = await summarizeWholeFile(filePath, content);
    }

    const embedding = await generateEmbedding(summary.overview);

    result = { ...summary, embedding };
    await setCachedSummary(owner, name, filePath, sha, result);
  }

  const [fileRow] = await db
    .insert(filesTable)
    .values({ repoId, path: filePath })
    .returning();

  await db.insert(summariesTable).values({
    fileId: fileRow.id,
    overview: result.overview,
    keyPoints: result.keyPoints,
    embedding: result.embedding,
  });

  return { overview: result.overview, keyPoints: result.keyPoints };
}

export async function runSummarizerAgent(
  repoId: string,
  owner: string,
  name: string,
  branch: string,
  files: GithubFile[]
): Promise<{ summarized: number; skipped: number; cached: number }> {
  let summarized = 0;
  let skipped = 0;
  let cached = 0;

  for (const file of files) {
    if (shouldSkipFile(file.path)) {
      skipped++;
      continue;
    }

    const cachedResult = await getCachedSummary(owner, name, file.path, file.sha);

    if (cachedResult) {
      const [fileRow] = await db
        .insert(filesTable)
        .values({ repoId, path: file.path })
        .returning();

      await db.insert(summariesTable).values({
        fileId: fileRow.id,
        overview: cachedResult.overview,
        keyPoints: cachedResult.keyPoints,
        embedding: cachedResult.embedding,
      });

      cached++;
      continue;
    }

    // Cache miss — fetch content and run the full summarize + embed + store pipeline
    const content = await fetchFileContent(owner, name, branch, file.path);
    await summarizeAndStoreFile(repoId, owner, name, file.path, content, file.sha);
    summarized++;
  }

  console.log(`[summarizer] Done. Summarized: ${summarized}, Cached: ${cached}, Skipped: ${skipped}`);
  return { summarized, skipped, cached };
}