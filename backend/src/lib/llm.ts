import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const SUMMARIZER_MODEL = "claude-haiku-4-5"; // intended production model — swap back once Anthropic credits are added
export const SUMMARIZER_FALLBACK_MODEL = "gpt-4o-mini"; // temporary stand-in, same job, OpenAI billing instead
export const SUMMARIZER_LOCAL_MODEL = "qwen2.5-coder:3b"; // free, local, zero-cost — current default while no paid API credits are available

/**
 * Same job as callClaude/callOpenAIChat, but hits a local Ollama instance
 * running in its own container — no API key, no billing, fully self-hosted.
 * Slower on CPU than a hosted API, but $0 regardless of volume.
 */
const OLLAMA_MAX_RETRIES = 2;

export async function callOllama(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= OLLAMA_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("http://ollama:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(300_000),
      });

      if (!res.ok) {
        throw new Error(`[llm] Ollama request failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      return data.message?.content ?? "";
    } catch (err) {
      lastError = err as Error;
      console.warn(`[llm] Ollama call attempt ${attempt}/${OLLAMA_MAX_RETRIES} failed: ${lastError.message}`);
      if (attempt < OLLAMA_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // give the llama-server subprocess time to recover/reload
      }
    }
  }

  throw new Error(`[llm] Ollama call failed after ${OLLAMA_MAX_RETRIES} attempts: ${lastError?.message}`);
}

export async function callClaude(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[llm] Claude response contained no text block");
  }
  return textBlock.text;
}

/**
 * Same job as callClaude (system + user prompt -> text), but via OpenAI's
 * chat completions API. Used as a temporary stand-in for the Summarizer
 * Agent while Anthropic credits are unavailable — same prompt structure,
 * different billing account. Swap callClaude back in once resolved.
 */
export async function callOpenAIChat(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    max_tokens: 500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("[llm] OpenAI response contained no text content");
  }
  return text;
}