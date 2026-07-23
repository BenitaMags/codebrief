import { searchSimilarFiles } from "./vector.service.js";
import { callOllama, SUMMARIZER_LOCAL_MODEL } from "../lib/llm.js";

export interface ChatResponse {
  answer: string;
  citations: { path: string; overview: string; similarity: number }[];
}

export async function ragChat(repoId: string, question: string): Promise<ChatResponse> {
  const results = await searchSimilarFiles(repoId, question, 5);

  if (results.length === 0) {
    return {
      answer: "I don't have any analyzed files for this repository yet. Please wait for the analysis to complete.",
      citations: [],
    };
  }

  const context = results
    .map((r, i) => `[${i + 1}] ${r.path}: ${r.overview}`)
    .join("\n\n");

  const prompt = `You are answering questions about a codebase. Below are the most relevant files from the repository, each with a summary of what it does. Answer the user's question using ONLY the information provided below. Reference specific files by their path when relevant. If the answer cannot be determined from the provided context, say so honestly.

CONTEXT:
${context}

QUESTION: ${question}

Answer concisely, referencing file paths like [1], [2] etc. to cite your sources:`;

  const answer = await callOllama(
    SUMMARIZER_LOCAL_MODEL,
    "You answer questions about codebases based only on provided file summaries. You cite sources using bracket notation like [1], [2]. You never invent files or features not mentioned in the context.",
    prompt
  );

  return {
    answer,
    citations: results.map((r) => ({
      path: r.path,
      overview: r.overview,
      similarity: r.similarity,
    })),
  };
}