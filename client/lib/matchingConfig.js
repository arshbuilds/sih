/**
 * Centralized confidence thresholds for the activity matching pipeline.
 *
 * Rules:
 * - score >= HIGH_CONFIDENCE: Automatically updates ScheduleActivity, status = 'matched', creates AuditLog
 * - score >= MEDIUM_CONFIDENCE and < HIGH_CONFIDENCE: status = 'review_required', human in the loop
 * - score < MEDIUM_CONFIDENCE: status = 'unmatched', rejected
 */
export const MATCHING_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.85,
  MEDIUM_CONFIDENCE: 0.50,
};

/**
 * Evaluates a match confidence score against defined thresholds.
 *
 * @param {number} score - Confidence score between 0.0 and 1.0
 * @returns {{ matchingStatus: string, autoUpdate: boolean }} Decision outcome
 */
export function evaluateMatchConfidence(score) {
  if (typeof score !== "number" || isNaN(score)) {
    throw new Error("Match confidence score must be a valid number");
  }

  if (score >= MATCHING_THRESHOLDS.HIGH_CONFIDENCE) {
    return {
      matchingStatus: "matched",
      autoUpdate: true,
    };
  }

  if (score >= MATCHING_THRESHOLDS.MEDIUM_CONFIDENCE) {
    return {
      matchingStatus: "review_required",
      autoUpdate: false,
    };
  }

  return {
    matchingStatus: "unmatched",
    autoUpdate: false,
  };
}

/**
 * Calculate confidence score from vector search results.
 * Ported from Python reference:
 *   confidence = (bestScore * 0.7 + margin * 0.3)
 *   where margin = bestScore - secondBestScore
 *
 * The Python code multiplied by 100 for percentage; we keep 0-1 range
 * to stay compatible with our threshold system.
 *
 * @param {Array<{score: number}>} candidates - Sorted candidates (highest score first)
 * @returns {number} Confidence score between 0.0 and 1.0
 */
export function calculateMatchConfidence(candidates) {
  if (!candidates || candidates.length === 0) {
    return 0;
  }

  const bestScore = candidates[0].score || 0;
  const secondBestScore = candidates.length > 1 ? (candidates[1].score || 0) : 0;
  const margin = bestScore - secondBestScore;

  let confidence = bestScore * 0.7 + margin * 0.3;

  // Clamp between 0 and 1
  confidence = Math.max(0, Math.min(confidence, 1));

  return parseFloat(confidence.toFixed(4));
}
