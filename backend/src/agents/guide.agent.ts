import { eq } from "drizzle-orm";
import { db } from "../db/postgres.js";
import { repos as reposTable, files as filesTable, summaries as summariesTable, guides as guidesTable } from "../db/schema.js";
import { callOllama, SUMMARIZER_LOCAL_MODEL } from "../lib/llm.js";

const TOP_FILES_FOR_GUIDE = 15; // how many highest-ranked files' summaries get fed into the synthesis prompt

export interface OnboardingGuide {
  overview: string;
  architectureSummary: string;
  entryPoints: string[];
  commonTasksGuidance: string;
  quickStart: string;
}

export async function runGuideAgent(repoId: string): Promise<OnboardingGuide> {
  const [repoRow] = await db.select().from(reposTable).where(eq(reposTable.id, repoId));
  if (!repoRow) throw new Error(`[guide] No repo found for repoId ${repoId}`);

  const topFiles = await db
    .select({
      path: filesTable.path,
      readingOrder: filesTable.readingOrder,
      overview: summariesTable.overview,
    })
    .from(filesTable)
    .innerJoin(summariesTable, eq(summariesTable.fileId, filesTable.id))
    .where(eq(filesTable.repoId, repoId))
    .orderBy(filesTable.readingOrder)
    .limit(TOP_FILES_FOR_GUIDE);

  if (topFiles.length === 0) {
    throw new Error(`[guide] No summarized, ranked files found for repoId ${repoId} — run Cartographer, Summarizer, and Prioritizer first.`);
  }

  const [{ count: totalFileCount }] = await db
    .select({ count: filesTable.id })
    .from(filesTable)
    .where(eq(filesTable.repoId, repoId));

  const digest = topFiles
    .map((f) => `- ${f.path} (reading order ${f.readingOrder}): ${f.overview}`)
    .join("\n");

  const prompt = `You are writing an onboarding guide for a new contributor to the repository "${repoRow.owner}/${repoRow.name}".

Below is a list of its ${topFiles.length} most foundational files (the ones most other files depend on), each with a real summary of what it does. This is REAL data from actual analysis of the repository — do not invent files, features, or technologies not mentioned below.

${digest}

Total files in repo: ${totalFileCount}

Using ONLY the information above, write an onboarding guide with exactly these 5 sections, each clearly labeled. Follow the format instructions in each section exactly.

OVERVIEW: <2-3 sentences on what this repository is and does, based only on the files above>
ARCHITECTURE: <2-4 sentences describing how the pieces above relate to each other>
ENTRY_POINTS: <exactly 2-4 file paths from the list above, separated only by commas, nothing else — example format: index.js, lib/express.js>
COMMON_TASKS: <2-3 sentences on what a contributor would likely touch for typical changes — you MUST only reference file paths that appear in the list above, do not mention any file not explicitly listed>
QUICK_START: <2-3 sentences of practical advice for a new contributor's first steps in this specific repo>`;

  console.log(`[guide] Synthesizing onboarding guide from top ${topFiles.length} files...`);
  const raw = await callOllama(
    SUMMARIZER_LOCAL_MODEL,
    "You write clear, accurate onboarding documentation for software repositories. You only describe what is explicitly given to you — you never invent files, frameworks, or features not mentioned in your input. If you are unsure which file is relevant to a task, refer only to files that were explicitly listed.",
    prompt
  );

  const parsed = parseGuideResponse(raw);

  await db.insert(guidesTable).values({
    repoId,
    overview: parsed.overview,
    architectureSummary: parsed.architectureSummary,
    entryPoints: parsed.entryPoints,
    commonTasksGuidance: parsed.commonTasksGuidance,
    quickStart: parsed.quickStart,
  });

  console.log(`[guide] Guide saved for repoId ${repoId}`);
  return parsed;
}

function parseGuideResponse(raw: string): OnboardingGuide {
  const section = (label: string) => {
    const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, "s");
    const match = raw.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  const entryPointsRaw = section("ENTRY_POINTS");
  const entryPoints = entryPointsRaw
    .split(/[,\n]/) // handle both "a, b, c" and bullet-list "- a\n- b" formats
    .map((p) => p.replace(/^[-*\s]+/, "").trim()) // strip leading bullet markers/dashes
    .filter((p) => p.length > 0);

  return {
    overview: section("OVERVIEW"),
    architectureSummary: section("ARCHITECTURE"),
    entryPoints,
    commonTasksGuidance: section("COMMON_TASKS"),
    quickStart: section("QUICK_START"),
  };
}