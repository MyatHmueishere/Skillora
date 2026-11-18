import type {
  AssessmentAttemptRecord,
  LearningActivityMetrics,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
  RecentLearningActivityItem,
  UserProfile,
} from '../types';
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  isMeaningfulLearningActivity,
  MeaningfulActivityEvent,
  resolveSafeTimeZone,
} from '../../shared/inactivityEngine';
import { computeRoadmapStats, resolveResumeLearningTarget } from './learningRoadmaps';
import { computeLearningActivityMetrics, formatStudyDuration } from './progressAnalytics';

export interface DashboardJourneySummary {
  primaryDirection: string;
  hasExplicitDirection: boolean;
  directionMatchesActiveRoadmap: boolean;
  matchingArchivedRoadmap: LearningRoadmapRecord | null;
  preservedPreviousRoadmap: {
    id: string;
    title: string;
    careerGoal: string;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
  } | null;
  isNewLearner: boolean;
  currentStageNumber: number;
  totalStages: number;
  currentStageId: string | null;
  currentStageTitle: string;
  completedStages: number;
  completedLessons: number;
  totalLessons: number;
  overallProgressPercent: number;
  nextLesson: {
    stageId: string;
    stageTitle: string;
    stageIndex: number;
    lessonId: string;
    lessonTitle: string;
    estimatedTime: string;
    isAllCompleted: boolean;
  } | null;
  upcomingMilestone: {
    title: string;
    stageLabel: string;
    remainingLessonsInStage: number;
  } | null;
  currentStreakDays: number;
  activeToday: boolean;
  weeklyGoal: {
    dailyGoalHours: number;
    weeklyGoalHours: number;
    weeklyCompletedSeconds: number;
    weeklyCompletedFormatted: string;
    weeklyGoalFormatted: string;
    progressPercent: number;
    activeDaysThisWeek: number;
    sessionsThisWeek: number;
  };
  meaningfulEvents: MeaningfulActivityEvent[];
  lastMeaningfulActivityAt: string | null;
  recentActivity: RecentLearningActivityItem[];
  activityMetrics: LearningActivityMetrics;
}

function normalizeDirectionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DIRECTION_STOPWORDS = new Set([
  'in',
  'of',
  'to',
  'as',
  'at',
  'by',
  'for',
  'and',
  'the',
  'or',
  'on',
  'with',
  'from',
  'become',
  'job',
  'ready',
  'path',
  'learning',
  'roadmap',
  'career',
  'goal',
  'track',
  'personalized',
  'complete',
  'course',
  'courses',
  'level',
  'a',
  'an',
]);

function extractDirectionTokens(value: string): string[] {
  const normalized = normalizeDirectionText(value);
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(' ')
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !DIRECTION_STOPWORDS.has(t))
    )
  );
}

function tokensShareConcept(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5) {
    return a.slice(0, 5) === b.slice(0, 5);
  }
  return false;
}

export function doesRoadmapMatchDirection(
  roadmap: LearningRoadmapRecord | null | undefined,
  direction: string
): boolean {
  if (!roadmap) return false;
  const cleanDir = normalizeDirectionText(direction);
  if (!cleanDir) return true;

  const cleanRoadmapPrimary = normalizeDirectionText(
    roadmap.roadmapData?.primaryDirection || ''
  );
  if (cleanRoadmapPrimary) {
    if (cleanRoadmapPrimary === cleanDir) return true;
    const dirTokens = extractDirectionTokens(cleanDir);
    const rmTokens = extractDirectionTokens(cleanRoadmapPrimary);
    if (dirTokens.length > 0 && rmTokens.length > 0) {
      const dirCovered = dirTokens.every((dt) =>
        rmTokens.some((rt) => tokensShareConcept(dt, rt))
      );
      const rmCovered = rmTokens.every((rt) =>
        dirTokens.some((dt) => tokensShareConcept(dt, rt))
      );
      if (dirCovered && rmCovered) return true;
      return false;
    }
    return false;
  }

  const cleanGoal = normalizeDirectionText(roadmap.careerGoal || '');
  const cleanTitle = normalizeDirectionText(roadmap.title || '');
  if (!cleanGoal && !cleanTitle) return false;
  if (cleanGoal === cleanDir || cleanTitle === cleanDir) return true;

  const dirTokens = extractDirectionTokens(cleanDir);
  if (dirTokens.length === 0) return false;

  const targetTokens = extractDirectionTokens(`${cleanGoal} ${cleanTitle}`);
  if (targetTokens.length === 0) return false;

  const matchedCount = dirTokens.filter((dt) =>
    targetTokens.some((tt) => tokensShareConcept(dt, tt))
  ).length;

  // Require all tokens for concise 1-2 word directions (e.g., "AI Engineer" vs "Software Engineer"),
  // and strict majority + domain specificity for longer phrases.
  if (dirTokens.length <= 2) {
    return matchedCount === dirTokens.length;
  }
  return matchedCount >= Math.ceil(dirTokens.length * 0.75);
}

export function findBestMatchingRoadmapForDirection(
  roadmaps: LearningRoadmapRecord[],
  direction: string
): LearningRoadmapRecord | null {
  const cleanDir = normalizeDirectionText(direction);
  if (!cleanDir) return null;

  const matches = roadmaps.filter((r) => doesRoadmapMatchDirection(r, direction));
  if (matches.length === 0) return null;

  return matches
    .slice()
    .sort((a, b) => {
      const aExact =
        normalizeDirectionText(a.roadmapData?.primaryDirection || a.careerGoal) === cleanDir
          ? 1
          : 0;
      const bExact =
        normalizeDirectionText(b.roadmapData?.primaryDirection || b.careerGoal) === cleanDir
          ? 1
          : 0;
      if (bExact !== aExact) return bExact - aExact;

      const aDone = computeRoadmapStats(a).completedLessons;
      const bDone = computeRoadmapStats(b).completedLessons;
      if (bDone !== aDone) return bDone - aDone;

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })[0];
}

export function collectMeaningfulLearningEvents(params: {
  activeRoadmap: LearningRoadmapRecord | null;
  archivedRoadmaps?: LearningRoadmapRecord[];
  learningSessions: LearningSessionRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
}): MeaningfulActivityEvent[] {
  const {
    activeRoadmap,
    archivedRoadmaps = [],
    learningSessions,
    knowledgeCheckAttempts,
    assessmentAttempts,
  } = params;

  const events: MeaningfulActivityEvent[] = [];
  const allRoadmaps = [activeRoadmap, ...archivedRoadmaps].filter(
    (r): r is LearningRoadmapRecord => Boolean(r)
  );

  for (const roadmap of allRoadmaps) {
    for (const stage of roadmap.roadmapData.stages) {
      for (const lesson of stage.lessons) {
        if (lesson.completed && lesson.completedAt) {
          events.push({
            id: `lesson-${roadmap.id}-${stage.id}-${lesson.id}`,
            type: 'lesson_completed',
            timestamp: lesson.completedAt,
            title: lesson.title,
            roadmapId: roadmap.id,
            stageId: stage.id,
            lessonId: lesson.id,
            completed: true,
          });
        }
      }
    }
  }

  for (const kc of knowledgeCheckAttempts) {
    if (!kc.completedAt) continue;
    events.push({
      id: `kc-${kc.id}`,
      type: 'knowledge_check',
      timestamp: kc.completedAt,
      title: `${kc.lessonTitle} Quiz (${kc.score}%)`,
      roadmapId: kc.roadmapId,
      stageId: kc.stageId,
      lessonId: kc.lessonId,
      completed: true,
    });
  }

  for (const attempt of assessmentAttempts) {
    if (!attempt.createdAt) continue;
    events.push({
      id: `assess-${attempt.id}`,
      type: 'assessment',
      timestamp: attempt.createdAt,
      title: `${attempt.subject} Assessment (${attempt.scorePercent}%)`,
      completed: true,
    });
  }

  for (const session of learningSessions) {
    const timestamp = session.endedAt || session.startedAt;
    if (!timestamp) continue;
    const candidate: MeaningfulActivityEvent = {
      id: `sess-${session.clientSessionId || session.id}`,
      type:
        session.activityType === 'knowledge_check'
          ? 'knowledge_check'
          : session.activityType === 'assessment'
          ? 'assessment'
          : 'lesson_study',
      timestamp,
      title: session.lessonTitle || 'Study Session',
      durationSeconds: session.durationSeconds,
      completed: session.completed,
      roadmapId: session.roadmapId ?? null,
      stageId: session.stageId ?? null,
      lessonId: session.lessonId ?? null,
    };
    if (isMeaningfulLearningActivity(candidate)) {
      events.push(candidate);
    }
  }

  return events.filter(isMeaningfulLearningActivity);
}

export function computeTimezoneAwareStreak(
  events: MeaningfulActivityEvent[],
  timeZone: string,
  now: Date = new Date()
): { currentStreakDays: number; activeToday: boolean; activeDateKeys: Set<string> } {
  const safeTz = resolveSafeTimeZone(timeZone);
  const todayKey = getDateKeyInTimeZone(now, safeTz) ?? '';
  const yesterdayKey = todayKey ? addDaysToDateKey(todayKey, -1) : '';

  const activeDateKeys = new Set<string>();
  for (const evt of events) {
    if (!isMeaningfulLearningActivity(evt)) continue;
    const dateKey = getDateKeyInTimeZone(evt.timestamp, safeTz);
    if (dateKey) activeDateKeys.add(dateKey);
  }

  const activeToday = Boolean(todayKey && activeDateKeys.has(todayKey));
  let currentStreakDays = 0;

  if (activeToday || (yesterdayKey && activeDateKeys.has(yesterdayKey))) {
    let cursor = activeToday ? todayKey : yesterdayKey;
    while (cursor && activeDateKeys.has(cursor)) {
      currentStreakDays += 1;
      cursor = addDaysToDateKey(cursor, -1);
    }
  }

  return { currentStreakDays, activeToday, activeDateKeys };
}

export function buildDashboardJourneySummary(params: {
  user: UserProfile;
  activeRoadmap: LearningRoadmapRecord | null;
  archivedRoadmaps?: LearningRoadmapRecord[];
  learningSessions: LearningSessionRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  timeZone?: string;
  now?: Date;
}): DashboardJourneySummary {
  const {
    user,
    activeRoadmap,
    archivedRoadmaps = [],
    learningSessions,
    knowledgeCheckAttempts,
    assessmentAttempts,
    now = new Date(),
  } = params;
  const safeTz = resolveSafeTimeZone(params.timeZone);

  const explicitDirection = (user.primaryDirection ?? '').trim();
  const primaryDirection =
    explicitDirection || activeRoadmap?.careerGoal?.trim() || user.careerGoal.trim();

  const directionMatchesActiveRoadmap =
    !explicitDirection || !activeRoadmap
      ? true
      : doesRoadmapMatchDirection(activeRoadmap, explicitDirection);

  const matchingArchivedRoadmap =
    explicitDirection && !directionMatchesActiveRoadmap
      ? findBestMatchingRoadmapForDirection(archivedRoadmaps, explicitDirection)
      : null;

  const preservedPreviousRoadmap =
    explicitDirection && activeRoadmap && !directionMatchesActiveRoadmap
      ? (() => {
          const prevStats = computeRoadmapStats(activeRoadmap);
          return {
            id: activeRoadmap.id,
            title: activeRoadmap.title,
            careerGoal: activeRoadmap.careerGoal,
            progressPercent: prevStats.progressPercent,
            completedLessons: prevStats.completedLessons,
            totalLessons: prevStats.totalLessons,
          };
        })()
      : null;

  // Never expose an old direction's roadmap stats/stage/lesson as active for a new direction
  const effectiveActiveRoadmap =
    explicitDirection && !directionMatchesActiveRoadmap ? null : activeRoadmap;
  const roadmapStats = computeRoadmapStats(effectiveActiveRoadmap);
  const resumeTarget = resolveResumeLearningTarget(effectiveActiveRoadmap, learningSessions);

  const meaningfulEvents = collectMeaningfulLearningEvents({
    activeRoadmap,
    archivedRoadmaps,
    learningSessions,
    knowledgeCheckAttempts,
    assessmentAttempts,
  });

  const latestMeaningful = meaningfulEvents
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const streakInfo = computeTimezoneAwareStreak(meaningfulEvents, safeTz, now);
  const activityMetrics = computeLearningActivityMetrics(learningSessions, { now });

  // Weekly study goal & real progress
  const dailyGoalHours = Math.max(0.5, Number(user.preferredHoursPerDay) || 2);
  const weeklyGoalHours = Number((dailyGoalHours * 7).toFixed(1));
  const weeklyGoalSeconds = Math.max(60, Math.round(weeklyGoalHours * 3600));

  const todayKey = getDateKeyInTimeZone(now, safeTz) ?? '';
  const weekDateKeys = new Set<string>();
  if (todayKey) {
    for (let d = -6; d <= 0; d += 1) {
      weekDateKeys.add(addDaysToDateKey(todayKey, d));
    }
  }
  const activeDaysThisWeek = Array.from(weekDateKeys).filter((k) =>
    streakInfo.activeDateKeys.has(k)
  ).length;

  const weeklyProgressPercent = Math.min(
    100,
    Math.round((activityMetrics.thisWeekSeconds / weeklyGoalSeconds) * 100)
  );

  // Next incomplete lesson
  let nextLesson: DashboardJourneySummary['nextLesson'] = null;
  if (effectiveActiveRoadmap && resumeTarget) {
    const matchedStage = effectiveActiveRoadmap.roadmapData.stages.find(
      (s) => s.id === resumeTarget.stageId
    );
    const matchedLesson = matchedStage?.lessons.find(
      (l) => l.id === resumeTarget.lessonId
    );
    nextLesson = {
      stageId: resumeTarget.stageId,
      stageTitle: resumeTarget.stageTitle,
      stageIndex: resumeTarget.stageIndex,
      lessonId: resumeTarget.lessonId,
      lessonTitle: resumeTarget.lessonTitle,
      estimatedTime: matchedLesson?.estimatedTime || '45 mins',
      isAllCompleted: resumeTarget.isAllCompleted,
    };
  }

  // Upcoming learning milestone
  let upcomingMilestone: DashboardJourneySummary['upcomingMilestone'] = null;
  if (effectiveActiveRoadmap && effectiveActiveRoadmap.roadmapData.stages.length > 0) {
    const stages = effectiveActiveRoadmap.roadmapData.stages;
    const focusStageIdx = nextLesson
      ? nextLesson.stageIndex
      : Math.max(0, roadmapStats.currentStageNumber - 1);
    const focusStage = stages[focusStageIdx] ?? stages[0];
    const remainingInStage = focusStage.lessons.filter((l) => !l.completed).length;

    const milestoneText =
      roadmapStats.remainingLessons === 0 && roadmapStats.totalLessons > 0
        ? effectiveActiveRoadmap.roadmapData.milestones?.[
            (effectiveActiveRoadmap.roadmapData.milestones?.length ?? 1) - 1
          ] ||
          `Completed all ${roadmapStats.totalStages} stages of ${effectiveActiveRoadmap.title}`
        : focusStage.milestone?.trim() ||
          effectiveActiveRoadmap.roadmapData.milestones?.[focusStageIdx] ||
          focusStage.suggestedMiniProject?.trim() ||
          `Complete Stage ${focusStageIdx + 1}: ${focusStage.title}`;

    upcomingMilestone = {
      title: milestoneText,
      stageLabel:
        roadmapStats.remainingLessons === 0
          ? 'Path Milestone Achieved'
          : `Stage ${focusStageIdx + 1} Milestone · ${focusStage.title}`,
      remainingLessonsInStage: remainingInStage,
    };
  }

  // Recent learning activity feed (deduplicated across sessions & quiz/lesson events)
  const activityFeed: RecentLearningActivityItem[] = [];
  const allRoadmaps = [activeRoadmap, ...archivedRoadmaps].filter(
    (r): r is LearningRoadmapRecord => Boolean(r)
  );

  for (const rm of allRoadmaps) {
    for (const st of rm.roadmapData.stages) {
      for (const ls of st.lessons) {
        if (ls.completed && ls.completedAt) {
          activityFeed.push({
            id: `act-lesson-${rm.id}-${ls.id}`,
            type: 'lesson_completed',
            title: ls.title,
            subtitle: `Completed lesson · ${st.title}`,
            timestamp: ls.completedAt,
            roadmapId: rm.id,
            stageId: st.id,
            lessonId: ls.id,
          });
        }
      }
    }
  }

  for (const kc of knowledgeCheckAttempts) {
    if (!kc.completedAt) continue;
    activityFeed.push({
      id: `act-kc-${kc.id}`,
      type: 'knowledge_check',
      title: `${kc.lessonTitle} Knowledge Check`,
      subtitle: `Scored ${kc.score}% (${kc.correctAnswers}/${kc.totalQuestions})`,
      timestamp: kc.completedAt,
      roadmapId: kc.roadmapId,
      stageId: kc.stageId,
      lessonId: kc.lessonId,
    });
  }

  for (const att of assessmentAttempts) {
    if (!att.createdAt) continue;
    activityFeed.push({
      id: `act-assess-${att.id}`,
      type: 'assessment',
      title: `${att.subject} Diagnostic`,
      subtitle: `Scored ${att.scorePercent}% · ${att.difficulty}`,
      timestamp: att.createdAt,
    });
  }

  for (const sess of learningSessions) {
    if (sess.activityType !== 'lesson_study') continue;
    if (!sess.completed && sess.durationSeconds < 10) continue;
    if (sess.durationSeconds < 15) continue;
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    activityFeed.push({
      id: `act-sess-${sess.clientSessionId || sess.id}`,
      type: 'study_session',
      title: sess.lessonTitle || 'Focused Lesson Study',
      subtitle: `Studied ${formatStudyDuration(sess.durationSeconds)}`,
      timestamp: ts,
      roadmapId: sess.roadmapId ?? null,
      stageId: sess.stageId ?? null,
      lessonId: sess.lessonId ?? null,
    });
  }

  activityFeed.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const isNewLearner =
    !activeRoadmap &&
    archivedRoadmaps.length === 0 &&
    meaningfulEvents.length === 0;

  return {
    primaryDirection,
    hasExplicitDirection: Boolean(explicitDirection),
    directionMatchesActiveRoadmap,
    matchingArchivedRoadmap,
    preservedPreviousRoadmap,
    isNewLearner,
    currentStageNumber: roadmapStats.currentStageNumber,
    totalStages: roadmapStats.totalStages,
    currentStageId: roadmapStats.currentStageId,
    currentStageTitle: roadmapStats.currentStageTitle,
    completedStages: roadmapStats.completedStages,
    completedLessons: roadmapStats.completedLessons,
    totalLessons: roadmapStats.totalLessons,
    overallProgressPercent: roadmapStats.progressPercent,
    nextLesson,
    upcomingMilestone,
    currentStreakDays: streakInfo.currentStreakDays,
    activeToday: streakInfo.activeToday,
    weeklyGoal: {
      dailyGoalHours,
      weeklyGoalHours,
      weeklyCompletedSeconds: activityMetrics.thisWeekSeconds,
      weeklyCompletedFormatted: activityMetrics.thisWeekHoursFormatted,
      weeklyGoalFormatted: `${weeklyGoalHours}h`,
      progressPercent: weeklyProgressPercent,
      activeDaysThisWeek,
      sessionsThisWeek: activityMetrics.thisWeekSessions,
    },
    meaningfulEvents,
    lastMeaningfulActivityAt: latestMeaningful?.timestamp ?? null,
    recentActivity: activityFeed.slice(0, 6),
    activityMetrics: {
      ...activityMetrics,
      currentStreakDays: streakInfo.currentStreakDays,
      activeToday: streakInfo.activeToday,
    },
  };
}
