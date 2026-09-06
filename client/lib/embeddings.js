import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768;

let aiClient = null;

/**
 * Get or create the GoogleGenAI client.
 */
function getClient() {
  if (aiClient) return aiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it to your .env.local file."
    );
  }

  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

/**
 * Build embedding text for a schedule activity.
 * Format matches the Python reference: "activity | discipline | location"
 *
 * @param {Object} activity - ScheduleActivity document
 * @returns {string} Formatted text for embedding
 */
export function buildActivityText(activity) {
  const parts = [activity.activityName || ""];

  if (activity.discipline) {
    parts.push(activity.discipline);
  }

  if (activity.location) {
    parts.push(activity.location);
  }

  return parts.join(" | ");
}

/**
 * Build query text for an extracted event description.
 * Uses Gemini's asymmetric retrieval format for better search accuracy.
 *
 * @param {Object} event - ExtractedEvent document
 * @returns {string} Formatted query text
 */
export function buildQueryText(event) {
  const parts = [event.activityDescription || event.rawDescription || ""];

  if (event.discipline) {
    parts.push(event.discipline);
  }

  if (event.location) {
    parts.push(event.location);
  }

  return `task: search result | query: ${parts.join(" | ")}`;
}

/**
 * Generate an embedding for a single text string using Gemini.
 *
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector (768 dimensions)
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("Text for embedding must be a non-empty string");
  }

  const ai = getClient();

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text.trim(),
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });

  if (
    !response ||
    !response.embeddings ||
    !response.embeddings[0] ||
    !response.embeddings[0].values
  ) {
    throw new Error("Invalid or empty embedding response from Gemini");
  }

  return response.embeddings[0].values;
}

/**
 * Generate embeddings for multiple texts sequentially.
 * Gemini embedding-2 produces one embedding per call,
 * so we batch them with small delays to avoid rate limits.
 *
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function generateEmbeddings(texts) {
  const embeddings = [];

  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Calculate confidence score using the Python reference formula:
 *   confidence = (bestScore * 0.7 + margin * 0.3)
 * where margin = bestScore - secondBestScore
 *
 * Returns a value between 0.0 and 1.0 (normalized from the Python 0-100 scale).
 *
 * @param {number} bestScore - Similarity score of best match (0-1 from $vectorSearch)
 * @param {number} secondBestScore - Similarity score of second-best match (0-1)
 * @returns {number} Confidence score between 0.0 and 1.0
 */
export function calculateConfidence(bestScore, secondBestScore = 0) {
  const margin = bestScore - secondBestScore;

  // Python formula: (best * 0.7 + margin * 0.3) * 100 -> normalized to 0-1 range
  let confidence = bestScore * 0.7 + margin * 0.3;

  confidence = Math.max(0, Math.min(confidence, 1));

  return parseFloat(confidence.toFixed(4));
}

/**
 * Calculate cosine similarity between two numeric vectors.
 *
 * @param {number[]} a - Vector A
 * @param {number[]} b - Vector B
 * @returns {number} Cosine similarity between -1 and 1
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

