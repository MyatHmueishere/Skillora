import type {
  AssessmentAttemptRecord,
  AssessmentPerformanceAnalytics,
  DailyStudyActivityPoint,
  LearningActivityMetrics,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
  PersonalizedLearningInsight,
  WeeklyStudyActivityPoint,
} from '../types';
import type { ComputedRoadmapStats } from './learningRoadmaps';

export function toLocalDateKey(dateInput: Date | string): string | null {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysLocal(date: Date, deltaDays: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + deltaDays);
  return copy;
}

export function formatStudyDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  if (safeSeconds === 0) return '0m';
  const totalMinutes = Math.round(safeSeconds / 60);
  if (totalMinutes < 1) return '<1m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = totalSeconds / 3600;
  if (hours >= 10) return `${Math.round(hours)}h`;
  return `${Number(hours.toFixed(1))}h`;
}

export function formatSessionDateTime(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function computeLearningActivityMetrics(
  sessions: LearningSessionRecord[],
  options?: { now?: Date }
): LearningActivityMetrics {
  const now = options?.now ? new Date(options.now) : new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = toLocalDateKey(todayLocal)!;
  const yesterdayKey = toLocalDateKey(addDaysLocal(todayLocal, -1))!;

  // A session counts as meaningful study activity if it is explicitly completed
  // (e.g., assessment, knowledge check, or lesson completion) or has >= 10s of tracked study.
  const validSessions = sessions.filter(
    (s) => s.completed || s.durationSeconds >= 10
  );

  const minutesByDay = new Map<string, number>();
  const secondsByDay = new Map<string, number>();
  const sessionsByDay = new Map<string, number>();
  const activeDateKeys = new Set<string>();

  let totalStudySeconds = 0;

  for (const session of validSessions) {
    const safeSessionSeconds = Math.max(0, Math.round(session.durationSeconds));
    totalStudySeconds += safeSessionSeconds;
    const dateKey = toLocalDateKey(session.startedAt || session.endedAt);
    if (!dateKey) continue;
    activeDateKeys.add(dateKey);
    secondsByDay.set(dateKey, (secondsByDay.get(dateKey) ?? 0) + safeSessionSeconds);
    minutesByDay.set(
      dateKey,
      (minutesByDay.get(dateKey) ?? 0) + safeSessionSeconds / 60
    );
    sessionsByDay.set(dateKey, (sessionsByDay.get(dateKey) ?? 0) + 1);
  }

  // Compute current consecutive day streak ending today (or yesterday if not yet active today)
  let currentStreakDays = 0;
  const activeToday = activeDateKeys.has(todayKey);
  if (activeToday || activeDateKeys.has(yesterdayKey)) {
    let cursor = activeToday ? todayLocal : addDaysLocal(todayLocal, -1);
    while (true) {
      const key = toLocalDateKey(cursor);
      if (!key || !activeDateKeys.has(key)) break;
      currentStreakDays += 1;
      cursor = addDaysLocal(cursor, -1);
    }
  }

  // Compute longest historical streak across all active date keys
  let longestStreakDays = 0;
  if (activeDateKeys.size > 0) {
    const sortedKeys = Array.from(activeDateKeys).sort();
    let run = 0;
    let prevDate: Date | null = null;
    for (const key of sortedKeys) {
      const [y, m, d] = key.split('-').map(Number);
      const current = new Date(y, (m || 1) - 1, d || 1);
      if (prevDate) {
        const diffDays = Math.round(
          (current.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        run = diffDays === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longestStreakDays) longestStreakDays = run;
      prevDate = current;
    }
  }

  // Build daily activity for the last 7 days (oldest -> today)
  const dailyActivity: DailyStudyActivityPoint[] = [];
  let thisWeekSeconds = 0;
  for (let offset = -6; offset <= 0; offset += 1) {
    const dayDate = addDaysLocal(todayLocal, offset);
    const key = toLocalDateKey(dayDate)!;
    const rawMinutes = minutesByDay.get(key) ?? 0;
    thisWeekSeconds += secondsByDay.get(key) ?? 0;
    dailyActivity.push({
      dateKey: key,
      dayLabel: dayDate.toLocaleDateString(undefined, { weekday: 'short' }),
      shortDate: dayDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      minutes: Math.round(rawMinutes),
      sessionsCount: sessionsByDay.get(key) ?? 0,
      isToday: key === todayKey,
    });
  }

  // Compute rolling 30-day seconds consistently
  let last30DaysSeconds = 0;
  for (let offset = -29; offset <= 0; offset += 1) {
    const key = toLocalDateKey(addDaysLocal(todayLocal, offset))!;
    last30DaysSeconds += secondsByDay.get(key) ?? 0;
  }

  // Build weekly activity for the last 4 rolling 7-day windows (oldest -> this week)
  const weeklyActivity: WeeklyStudyActivityPoint[] = [];
  for (let w = 3; w >= 0; w -= 1) {
    const endOffset = -(w * 7);
    const startOffset = endOffset - 6;
    let weekMinutesFloat = 0;
    let weekSessions = 0;
    for (let d = startOffset; d <= endOffset; d += 1) {
      const key = toLocalDateKey(addDaysLocal(todayLocal, d))!;
      weekMinutesFloat += minutesByDay.get(key) ?? 0;
      weekSessions += sessionsByDay.get(key) ?? 0;
    }
    const startDate = addDaysLocal(todayLocal, startOffset);
    const endDate = addDaysLocal(todayLocal, endOffset);
    const label =
      w === 0
        ? 'This Week'
        : w === 1
        ? 'Last Week'
        : `${startDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })} – ${endDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}`;
    weeklyActivity.push({
      weekKey: `week-${w}`,
      label,
      minutes: Math.round(weekMinutesFloat),
      sessionsCount: weekSessions,
    });
  }

  const todaySeconds = secondsByDay.get(todayKey) ?? 0;
  const todayMinutes = dailyActivity[dailyActivity.length - 1]?.minutes ?? 0;
  const thisWeek = weeklyActivity[weeklyActivity.length - 1];

  return {
    currentStreakDays,
    longestStreakDays,
    totalCompletedSessions: validSessions.length,
    totalStudySeconds,
    totalStudyMinutes: Math.round(totalStudySeconds / 60),
    totalStudyHoursFormatted: formatStudyDuration(totalStudySeconds),
    todaySeconds,
    todayMinutes,
    todayHoursFormatted: formatStudyDuration(todaySeconds),
    thisWeekSeconds,
    thisWeekMinutes: Math.round(thisWeekSeconds / 60),
    thisWeekHoursFormatted: formatStudyDuration(thisWeekSeconds),
    thisWeekSessions: thisWeek?.sessionsCount ?? 0,
    last30DaysSeconds,
    last30DaysHoursFormatted: formatStudyDuration(last30DaysSeconds),
    activeToday,
    dailyActivity,
    weeklyActivity,
  };
}

export function computeAssessmentPerformanceAnalytics(
  diagnosticAttempts: AssessmentAttemptRecord[],
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[]
): AssessmentPerformanceAnalytics {
  const sortedDiagnostics = diagnosticAttempts
    .slice()
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  const sortedKcs = knowledgeCheckAttempts
    .slice()
    .sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

  const latestDiagnosticScore =
    sortedDiagnostics.length > 0 ? sortedDiagnostics[0].scorePercent : null;
  const bestDiagnosticScore =
    sortedDiagnostics.length > 0
      ? Math.max(...sortedDiagnostics.map((a) => a.scorePercent))
      : null;
  const averageDiagnosticScore =
    sortedDiagnostics.length > 0
      ? Math.round(
          sortedDiagnostics.reduce((s, a) => s + a.scorePercent, 0) /
            sortedDiagnostics.length
        )
      : null;

  const latestKnowledgeCheckScore =
    sortedKcs.length > 0 ? sortedKcs[0].score : null;
  const bestKnowledgeCheckScore =
    sortedKcs.length > 0 ? Math.max(...sortedKcs.map((a) => a.score)) : null;
  const averageKnowledgeCheckScore =
    sortedKcs.length > 0
      ? Math.round(
          sortedKcs.reduce((s, a) => s + a.score, 0) / sortedKcs.length
        )
      : null;

  // Combine both diagnostic attempts & lesson knowledge checks chronologically for overall stats
  const combinedTimeline = [
    ...sortedDiagnostics.map((d) => ({
      score: d.scorePercent,
      timestamp: new Date(d.createdAt).getTime(),
      label: d.subject,
    })),
    ...sortedKcs.map((k) => ({
      score: k.score,
      timestamp: new Date(k.completedAt).getTime(),
      label: k.lessonTitle || 'Lesson Quiz',
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const latestOverallScore =
    combinedTimeline.length > 0 ? combinedTimeline[0].score : null;
  const bestOverallScore =
    combinedTimeline.length > 0
      ? Math.max(...combinedTimeline.map((item) => item.score))
      : null;
  const totalAttempts = sortedDiagnostics.length + sortedKcs.length;

  // Calculate meaningful improvement delta:
  // 1) Same-subject diagnostic improvement if student has 2+ attempts on same subject
  // 2) Same-lesson knowledge check improvement if student has 2+ quizzes on same lesson
  // 3) Overall diagnostic score progression (latest vs earliest)
  let scoreImprovementDelta: number | null = null;
  let improvementLabel: string | null = null;

  const subjectGroups = new Map<string, AssessmentAttemptRecord[]>();
  for (const d of sortedDiagnostics) {
    const key = d.subject.trim();
    const list = subjectGroups.get(key) ?? [];
    list.push(d);
    subjectGroups.set(key, list);
  }
  for (const [subject, group] of subjectGroups.entries()) {
    if (group.length >= 2) {
      const chronological = group
        .slice()
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      const delta =
        chronological[chronological.length - 1].scorePercent -
        chronological[0].scorePercent;
      if (scoreImprovementDelta === null || delta > scoreImprovementDelta) {
        scoreImprovementDelta = delta;
        improvementLabel = subject;
      }
    }
  }

  if (scoreImprovementDelta === null) {
    const lessonGroups = new Map<string, LessonKnowledgeCheckAttemptRecord[]>();
    for (const k of sortedKcs) {
      const key = k.lessonId || k.lessonTitle;
      const list = lessonGroups.get(key) ?? [];
      list.push(k);
      lessonGroups.set(key, list);
    }
    for (const group of lessonGroups.values()) {
      if (group.length >= 2) {
        const chronological = group
          .slice()
          .sort(
            (a, b) =>
              new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
          );
        const delta =
          chronological[chronological.length - 1].score -
          chronological[0].score;
        if (scoreImprovementDelta === null || delta > scoreImprovementDelta) {
          scoreImprovementDelta = delta;
          improvementLabel =
            chronological[chronological.length - 1].lessonTitle || 'Lesson Quiz';
        }
      }
    }
  }

  if (scoreImprovementDelta === null && combinedTimeline.length >= 2) {
    const oldest = combinedTimeline[combinedTimeline.length - 1];
    const newest = combinedTimeline[0];
    scoreImprovementDelta = newest.score - oldest.score;
    improvementLabel = newest.label;
  }

  // Build weak topics (from most recent attempts per subject/lesson so mastered retakes clear old gaps)
  const weakTopicMap = new Map<string, string>();
  const strongTopicMap = new Map<string, string>();

  // Latest diagnostic attempt per subject determines active strengths/gaps for that subject
  const latestDiagnosticBySubject = new Map<string, AssessmentAttemptRecord>();
  for (const attempt of sortedDiagnostics) {
    const key = attempt.subject.trim().toLowerCase();
    if (!latestDiagnosticBySubject.has(key)) {
      latestDiagnosticBySubject.set(key, attempt);
    }
  }
  for (const attempt of latestDiagnosticBySubject.values()) {
    for (const gap of attempt.knowledgeGaps) {
      const clean = gap.trim();
      if (clean) weakTopicMap.set(clean.toLowerCase(), clean);
    }
    for (const strength of attempt.strengths) {
      const clean = strength.trim();
      if (clean && !weakTopicMap.has(clean.toLowerCase())) {
        strongTopicMap.set(clean.toLowerCase(), clean);
      }
    }
  }

  // Latest knowledge check per lesson determines active gaps/strong topics for that lesson
  const latestKcByLesson = new Map<string, LessonKnowledgeCheckAttemptRecord>();
  for (const kc of sortedKcs) {
    const key = `${kc.roadmapId}:${kc.lessonId}`;
    if (!latestKcByLesson.has(key)) {
      latestKcByLesson.set(key, kc);
    }
  }
  for (const kc of latestKcByLesson.values()) {
    for (const gap of kc.knowledgeGaps) {
      const clean = gap.trim();
      if (clean) weakTopicMap.set(clean.toLowerCase(), clean);
    }
    for (const tb of kc.topicBreakdown) {
      const clean = tb.topic.trim();
      if (!clean) continue;
      if (tb.proficiency === 'Strong' && !weakTopicMap.has(clean.toLowerCase())) {
        strongTopicMap.set(clean.toLowerCase(), clean);
      } else if (tb.proficiency === 'Needs Improvement') {
        weakTopicMap.set(clean.toLowerCase(), clean);
      }
    }
  }

  // Ensure a topic listed in weakTopics does not simultaneously appear in strongTopics
  for (const weakKey of weakTopicMap.keys()) {
    strongTopicMap.delete(weakKey);
  }

  return {
    latestDiagnosticScore,
    bestDiagnosticScore,
    averageDiagnosticScore,
    totalDiagnosticAttempts: sortedDiagnostics.length,
    latestKnowledgeCheckScore,
    bestKnowledgeCheckScore,
    averageKnowledgeCheckScore,
    totalKnowledgeChecks: sortedKcs.length,
    latestOverallScore,
    bestOverallScore,
    totalAttempts,
    scoreImprovementDelta,
    improvementLabel,
    strongTopics: Array.from(strongTopicMap.values()).slice(0, 8),
    weakTopics: Array.from(weakTopicMap.values()).slice(0, 8),
  };
}

export function generatePersonalizedLearningInsights(params: {
  activeRoadmap: LearningRoadmapRecord | null;
  roadmapStats: ComputedRoadmapStats;
  assessmentPerf: AssessmentPerformanceAnalytics;
  activityMetrics: LearningActivityMetrics;
}): PersonalizedLearningInsight[] {
  const { activeRoadmap, roadmapStats, assessmentPerf, activityMetrics } = params;
  const insights: PersonalizedLearningInsight[] = [];

  // 1. Stage Completion Progress Insight
  if (activeRoadmap && roadmapStats.totalLessons > 0) {
    const inProgressStage =
      roadmapStats.stageStats.find((s) => s.status === 'in_progress') ??
      roadmapStats.stageStats.find((s) => s.status === 'upcoming') ??
      roadmapStats.stageStats[roadmapStats.stageStats.length - 1];

    if (roadmapStats.completedLessons === roadmapStats.totalLessons) {
      insights.push({
        id: 'insight-path-complete',
        category: 'stage_progress',
        title: `You completed 100% of ${activeRoadmap.title}`,
        description: `All ${roadmapStats.totalLessons} lessons across ${roadmapStats.totalStages} stages are complete. Validate mastery with a diagnostic assessment or explore advanced resources.`,
        tone: 'mint',
        actionLabel: 'Take Skill Assessment',
        targetView: 'assessment',
      });
    } else if (inProgressStage) {
      insights.push({
        id: `insight-stage-${inProgressStage.stageId}`,
        category: 'stage_progress',
        title: `You have completed ${inProgressStage.progressPercent}% of Stage ${
          inProgressStage.stageIndex + 1
        }: ${inProgressStage.title}`,
        description: `${inProgressStage.completedLessons} of ${inProgressStage.totalLessons} lessons completed (${inProgressStage.remainingLessons} remaining in this stage).`,
        tone: 'lavender',
        actionLabel: 'Continue Learning',
        targetView: 'roadmap',
        targetStageId: roadmapStats.nextIncompleteStageId ?? undefined,
        targetLessonId: roadmapStats.nextIncompleteLessonId ?? undefined,
      });
    }
  } else {
    insights.push({
      id: 'insight-no-roadmap',
      category: 'next_step',
      title: 'Create your personalized learning roadmap',
      description:
        'Generate your AI-tailored roadmap in My Learning Path so Skillora can track stage completion, lessons remaining, and milestones automatically.',
      tone: 'lavender',
      actionLabel: 'Go to My Learning Path',
      targetView: 'roadmap',
    });
  }

  // 2. Score Improvement Over Time Insight
  if (
    assessmentPerf.scoreImprovementDelta !== null &&
    assessmentPerf.improvementLabel
  ) {
    if (assessmentPerf.scoreImprovementDelta > 0) {
      insights.push({
        id: 'insight-score-improvement',
        category: 'improvement',
        title: `Your performance in ${assessmentPerf.improvementLabel} has improved (+${assessmentPerf.scoreImprovementDelta}%)`,
        description: `Across your saved attempts, your latest score increased by ${assessmentPerf.scoreImprovementDelta} percentage points.`,
        tone: 'mint',
        actionLabel: 'View Score History',
        targetView: 'assessment',
      });
    } else if (assessmentPerf.bestOverallScore !== null) {
      insights.push({
        id: 'insight-score-best',
        category: 'improvement',
        title: `Personal best score: ${assessmentPerf.bestOverallScore}%`,
        description: `You have completed ${assessmentPerf.totalAttempts} saved ${
          assessmentPerf.totalAttempts === 1 ? 'assessment' : 'assessments & quizzes'
        }. Retake quizzes in weaker topics to push your mastery above 80%.`,
        tone: 'mint',
      });
    }
  }

  // 3. Topic Requiring Improvement Insight
  if (assessmentPerf.weakTopics.length > 0) {
    const primaryWeak = assessmentPerf.weakTopics[0];
    // Try to locate a matching lesson in activeRoadmap for direct navigation
    let matchedStageId: string | undefined;
    let matchedLessonId: string | undefined;
    const weakLower = primaryWeak.toLowerCase();
    if (activeRoadmap) {
      for (const stage of activeRoadmap.roadmapData.stages) {
        const hit = stage.lessons.find(
          (l) =>
            l.title.toLowerCase().includes(weakLower) ||
            weakLower.includes(l.title.toLowerCase()) ||
            l.learningObjectives.some((o) => o.toLowerCase().includes(weakLower))
        );
        if (hit) {
          matchedStageId = stage.id;
          matchedLessonId = hit.id;
          break;
        }
      }
    }

    insights.push({
      id: 'insight-review-topic',
      category: 'review_topic',
      title: `You should review ${primaryWeak}`,
      description:
        assessmentPerf.weakTopics.length > 1
          ? `Detected in your recent quiz/assessment results alongside ${assessmentPerf.weakTopics
              .slice(1, 3)
              .join(', ')}. Focused review will boost retention.`
          : 'Flagged in your recent assessment or lesson knowledge check results.',
      tone: 'yellow',
      actionLabel: matchedLessonId ? 'Review Lesson' : 'Practice Topic',
      targetView: matchedLessonId ? 'roadmap' : 'assessment',
      targetStageId: matchedStageId,
      targetLessonId: matchedLessonId,
    });
  }

  // 4. Readiness to Continue to Next Stage Insight
  if (
    activeRoadmap &&
    roadmapStats.completedStages > 0 &&
    roadmapStats.remainingLessons > 0 &&
    roadmapStats.nextIncompleteStageId &&
    roadmapStats.nextIncompleteLessonId
  ) {
    const nextStage = roadmapStats.stageStats.find(
      (s) => s.stageId === roadmapStats.nextIncompleteStageId
    );
    if (nextStage && nextStage.completedLessons === 0) {
      insights.push({
        id: 'insight-next-stage-ready',
        category: 'next_step',
        title: `You are ready to continue to Stage ${nextStage.stageIndex + 1}: ${
          nextStage.title
        }`,
        description: `With ${roadmapStats.completedStages} ${
          roadmapStats.completedStages === 1 ? 'stage' : 'stages'
        } completed, start "${roadmapStats.nextIncompleteLessonTitle || 'the first lesson'}" next.`,
        tone: 'peach',
        actionLabel: 'Open Next Lesson',
        targetView: 'roadmap',
        targetStageId: roadmapStats.nextIncompleteStageId,
        targetLessonId: roadmapStats.nextIncompleteLessonId,
      });
    }
  }

  // 5. Real Study Activity / Streak Insight
  if (activityMetrics.totalCompletedSessions > 0) {
    insights.push({
      id: 'insight-activity-streak',
      category: 'streak',
      title:
        activityMetrics.currentStreakDays > 0
          ? `${activityMetrics.currentStreakDays}-day learning streak active`
          : `${activityMetrics.totalCompletedSessions} learning ${
              activityMetrics.totalCompletedSessions === 1 ? 'session' : 'sessions'
            } recorded`,
      description: `You have logged ${activityMetrics.totalStudyHoursFormatted} of tracked study time (${activityMetrics.thisWeekMinutes}m this week). Keep up steady daily sessions!`,
      tone: 'mint',
    });
  } else if (activeRoadmap && roadmapStats.nextIncompleteStageId && roadmapStats.nextIncompleteLessonId) {
    insights.push({
      id: 'insight-start-tracking',
      category: 'streak',
      title: 'Start a lesson to build your study streak',
      description:
        'Skillora automatically records active lesson study time, Knowledge Checks, and assessments here as you learn.',
      tone: 'peach',
      actionLabel: 'Start Next Lesson',
      targetView: 'roadmap',
      targetStageId: roadmapStats.nextIncompleteStageId,
      targetLessonId: roadmapStats.nextIncompleteLessonId,
    });
  }

  return insights.slice(0, 5);
}
