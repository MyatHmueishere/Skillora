export {
  computeRoadmapStats,
  resolveResumeLearningTarget,
  type ComputedRoadmapStats,
  type ResumeLearningTarget,
  type RoadmapStageStat,
} from '../../lib/learningRoadmaps';

export function formatRoadmapDateSafe(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatLessonCompletedTimestamp(isoString?: string | null): string {
  if (!isoString) return '';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
