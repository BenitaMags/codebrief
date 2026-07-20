export const EMBEDDING_MODEL_LOCAL = "nomic-embed-text"; // free, local, 768 dims — was OpenAI text-embedding-3-small (1536 dims)

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("http://ollama:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL_LOCAL, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(`[embeddings] Ollama request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.embedding;
}