export type TopicProficiencyLevel = 'Strong' | 'Moderate' | 'Needs Improvement';

export type AdaptiveRecommendationAction =
  | 'next_lesson'
  | 'additional_practice'
  | 'review_fundamentals';

export interface AdaptiveThresholdsConfig {
  /** Score >= advanceMinPercent recommends moving to the next lesson (default: 80) */
  advanceMinPercent: number;
  /** Score >= practiceMinPercent recommends additional practice; below recommends reviewing fundamentals (default: 50) */
  practiceMinPercent: number;
  /** Topic accuracy >= topicStrongMinPercent is classified as 'Strong' (default: 80) */
  topicStrongMinPercent: number;
  /** Topic accuracy >= topicModerateMinPercent is 'Moderate'; below is 'Needs Improvement' (default: 50) */
  topicModerateMinPercent: number;
}

export const DEFAULT_ADAPTIVE_THRESHOLDS: AdaptiveThresholdsConfig = {
  advanceMinPercent: 80,
  practiceMinPercent: 50,
  topicStrongMinPercent: 80,
  topicModerateMinPercent: 50,
};

export function normalizeAdaptiveThresholds(
  overrides?: Partial<AdaptiveThresholdsConfig>
): AdaptiveThresholdsConfig {
  const practiceRaw = Number(overrides?.practiceMinPercent);
  const advanceRaw = Number(overrides?.advanceMinPercent);
  const topicModRaw = Number(overrides?.topicModerateMinPercent);
  const topicStrongRaw = Number(overrides?.topicStrongMinPercent);

  const practiceMinPercent =
    Number.isFinite(practiceRaw) && practiceRaw >= 1 && practiceRaw <= 95
      ? Math.round(practiceRaw)
      : DEFAULT_ADAPTIVE_THRESHOLDS.practiceMinPercent;

  const advanceMinPercent =
    Number.isFinite(advanceRaw) &&
    advanceRaw > practiceMinPercent &&
    advanceRaw <= 100
      ? Math.round(advanceRaw)
      : Math.max(practiceMinPercent + 1, DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent);

  const topicModerateMinPercent =
    Number.isFinite(topicModRaw) && topicModRaw >= 1 && topicModRaw <= 95
      ? Math.round(topicModRaw)
      : DEFAULT_ADAPTIVE_THRESHOLDS.topicModerateMinPercent;

  const topicStrongMinPercent =
    Number.isFinite(topicStrongRaw) &&
    topicStrongRaw > topicModerateMinPercent &&
    topicStrongRaw <= 100
      ? Math.round(topicStrongRaw)
      : Math.max(
          topicModerateMinPercent + 1,
          DEFAULT_ADAPTIVE_THRESHOLDS.topicStrongMinPercent
        );

  return {
    advanceMinPercent,
    practiceMinPercent,
    topicStrongMinPercent,
    topicModerateMinPercent,
  };
}

export function classifyTopicProficiency(
  accuracyPercent: number,
  thresholds: AdaptiveThresholdsConfig = DEFAULT_ADAPTIVE_THRESHOLDS
): TopicProficiencyLevel {
  if (accuracyPercent >= thresholds.topicStrongMinPercent) return 'Strong';
  if (accuracyPercent >= thresholds.topicModerateMinPercent) return 'Moderate';
  return 'Needs Improvement';
}

export function getAdaptiveRecommendationTier(
  scorePercent: number,
  thresholds: AdaptiveThresholdsConfig = DEFAULT_ADAPTIVE_THRESHOLDS
): AdaptiveRecommendationAction {
  if (scorePercent >= thresholds.advanceMinPercent) return 'next_lesson';
  if (scorePercent >= thresholds.practiceMinPercent) return 'additional_practice';
  return 'review_fundamentals';
}
