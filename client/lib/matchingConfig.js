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
