import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { runCartographerAgent } from "./cartographer.agent.js";
import { runSummarizerAgent } from "./summarizer.agent.js";
import { runPrioritizerAgent } from "./prioritizer.agent.js";
import { runGuideAgent } from "./guide.agent.js";
import { publishProgress } from "../services/progress.service.js";
import type { GithubFile } from "../services/github.service.js";

// Defines the shared state that flows through every node in the graph.
// Each node reads the current state and returns a partial update — LangGraph
// merges that into the running state before passing it to the next node.
const AnalysisState = Annotation.Root({
  repoId: Annotation<string>,
  owner: Annotation<string>,
  name: Annotation<string>,
  branch: Annotation<string>,
  files: Annotation<GithubFile[]>,
  cartographerResult: Annotation<Awaited<ReturnType<typeof runCartographerAgent>> | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  summarizerResult: Annotation<Awaited<ReturnType<typeof runSummarizerAgent>> | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  prioritizerResult: Annotation<Awaited<ReturnType<typeof runPrioritizerAgent>> | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  guideResult: Annotation<Awaited<ReturnType<typeof runGuideAgent>> | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

type AnalysisStateType = typeof AnalysisState.State;

async function cartographerNode(state: AnalysisStateType) {
  await publishProgress(state.repoId, "status", {
    stage: "cartographer",
    message: `Mapping ${state.files.length} files...`,
  });
  const result = await runCartographerAgent(state.repoId, state.owner, state.name, state.branch, state.files);
  await publishProgress(state.repoId, "status", {
    stage: "cartographer_done",
    message: `Cartographer done: ${result.nodesCreated} files, ${result.edgesCreated} edges`,
  });
  return { cartographerResult: result };
}

async function summarizerNode(state: AnalysisStateType) {
  await publishProgress(state.repoId, "status", { stage: "summarizer", message: "Summarizing files..." });
  const result = await runSummarizerAgent(state.repoId, state.owner, state.name, state.branch, state.files);
  await publishProgress(state.repoId, "status", {
    stage: "summarizer_done",
    message: `Summarizer done: ${result.summarized} summarized, ${result.cached} cached, ${result.skipped} skipped`,
  });
  return { summarizerResult: result };
}

async function prioritizerNode(state: AnalysisStateType) {
  await publishProgress(state.repoId, "status", { stage: "prioritizer", message: "Ranking reading order..." });
  const result = await runPrioritizerAgent(state.repoId);
  return { prioritizerResult: result };
}

async function guideNode(state: AnalysisStateType) {
  await publishProgress(state.repoId, "status", { stage: "guide", message: "Writing onboarding guide..." });
  const result = await runGuideAgent(state.repoId);
  return { guideResult: result };
}

// The actual graph: 4 nodes, wired sequentially. Each node's real output
// becomes part of the shared state for the next — e.g. the Guide node's
// runGuideAgent reads reading_order values that the Prioritizer node just wrote.
const graph = new StateGraph(AnalysisState)
  .addNode("cartographer", cartographerNode)
  .addNode("summarizer", summarizerNode)
  .addNode("prioritizer", prioritizerNode)
  .addNode("guide", guideNode)
  .addEdge(START, "cartographer")
  .addEdge("cartographer", "summarizer")
  .addEdge("summarizer", "prioritizer")
  .addEdge("prioritizer", "guide")
  .addEdge("guide", END);

export const analysisGraph = graph.compile();

export interface AnalysisPipelineInput {
  repoId: string;
  owner: string;
  name: string;
  branch: string;
  files: GithubFile[];
}

export async function runAnalysisPipeline(input: AnalysisPipelineInput) {
  return analysisGraph.invoke(input);
}