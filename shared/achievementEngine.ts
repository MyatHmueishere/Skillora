import {
  DEFAULT_ADAPTIVE_THRESHOLDS,
} from './knowledgeCheckConfig';
import {
  getDateKeyInTimeZone,
  isMeaningfulLearningActivity,
  MeaningfulActivityEvent,
  resolveSafeTimeZone,
} from './inactivityEngine';
import type {
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
} from '../src/types';

export const XP_REWARDS = {
  LESSON_FIRST_COMPLETION: 50,
  KNOWLEDGE_CHECK_FIRST_PASS: 25,
  STAGE_FIRST_COMPLETION: 150,
  PATH_FIRST_COMPLETION: 500,
} as const;

export const KNOWLEDGE_CHECK_PASS_MIN_PERCENT =
  DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent; // 80%

export type XpEventType =
  | 'lesson_completed'
  | 'knowledge_check_passed'
  | 'stage_completed'
  | 'path_completed';

export type AchievementBadgeId =
  | 'first_step'
  | 'knowledge_seeker'
  | 'consistent_learner'
  | 'stage_master'
  | 'path_finisher'
  | 'skill_assessor';

export interface XpLedgerEntry {
  id: string;
  eventKey: string;
  eventType: XpEventType;
  xpAmount: number;
  title: string;
  roadmapId?: string | null;
  stageId?: string | null;
  lessonId?: string | null;
  awardedAt: string;
}

export interface AchievementBadgeDefinition {
  id: AchievementBadgeId;
  title: string;
  description: string;
  unlockRequirement: string;
  iconName: 'Zap' | 'ShieldCheck' | 'Flame' | 'Award' | 'Trophy' | 'Cpu';
  category: 'milestone' | 'mastery' | 'consistency';
}

export interface AchievementBadgeState extends AchievementBadgeDefinition {
  unlocked: boolean;
  unlockedAt: string | null;
  progressCurrent: number;
  progressTarget: number;
  progressLabel: string;
}

export interface AchievementLevelInfo {
  level: number;
  title: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelXp: number;
  xpIntoCurrentLevel: number;
  xpNeededForNextLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
}

export interface RecentAchievementItem {
  id: string;
  kind: 'badge' | 'xp';
  badgeId?: AchievementBadgeId;
  eventType?: XpEventType;
  title: string;
  subtitle: string;
  xpAmount?: number;
  timestamp: string;
}

export interface AchievementStatsBreakdown {
  completedLessonsCount: number;
  passedKnowledgeChecksCount: number;
  completedStagesCount: number;
  completedPathsCount: number;
  assessmentsCount: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lessonXp: number;
  knowledgeCheckXp: number;
  stageXp: number;
  pathXp: number;
}

export interface AchievementSummaryPayload {
  authenticated: boolean;
  persistedInDatabase: boolean;
  schemaMigrationRequired: boolean;
  totalXp: number;
  levelInfo: AchievementLevelInfo;
  badges: AchievementBadgeState[];
  unlockedCount: number;
  totalBadgesCount: number;
  recentAchievements: RecentAchievementItem[];
  xpLedger: XpLedgerEntry[];
  newlyAwardedXp: number;
  newlyUnlockedBadgeIds: AchievementBadgeId[];
  stats: AchievementStatsBreakdown;
}

export interface PersistedAchievementBadgeRow {
  badgeId: string;
  unlockedAt: string;
  metadata?: Record<string, unknown>;
}

export const BADGE_DEFINITIONS: readonly AchievementBadgeDefinition[] = [
  {
    id: 'first_step',
    title: 'First Step',
    description: 'Complete your first lesson in a personalized Learning Path.',
    unlockRequirement: 'Complete 1 lesson',
    iconName: 'Zap',
    category: 'milestone',
  },
  {
    id: 'knowledge_seeker',
    title: 'Knowledge Seeker',
    description: `Pass your first Lesson Knowledge Check with a score of ${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}% or higher.`,
    unlockRequirement: `Pass 1 knowledge check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
    iconName: 'ShieldCheck',
    category: 'mastery',
  },
  {
    id: 'consistent_learner',
    title: 'Consistent Learner',
    description: 'Build momentum with 7 consecutive days of meaningful learning activity.',
    unlockRequirement: 'Achieve a 7-day study streak',
    iconName: 'Flame',
    category: 'consistency',
  },
  {
    id: 'stage_master',
    title: 'Stage Master',
    description: 'Finish every lesson inside a complete Learning Path stage.',
    unlockRequirement: 'Complete 1 full learning stage',
    iconName: 'Award',
    category: 'milestone',
  },
  {
    id: 'path_finisher',
    title: 'Path Finisher',
    description: 'Complete every stage and lesson across an entire Learning Path.',
    unlockRequirement: 'Complete 1 full learning path',
    iconName: 'Trophy',
    category: 'milestone',
  },
  {
    id: 'skill_assessor',
    title: 'Skill Assessor',
    description: 'Complete a diagnostic skill assessment to benchmark your strengths and gaps.',
    unlockRequirement: 'Complete 1 diagnostic assessment',
    iconName: 'Cpu',
    category: 'mastery',
  },
] as const;

const LEVEL_THRESHOLDS: ReadonlyArray<{ level: number; minXp: number; title: string }> = [
  { level: 1, minXp: 0, title: 'Curious Explorer' },
  { level: 2, minXp: 150, title: 'Active Learner' },
  { level: 3, minXp: 350, title: 'Skill Builder' },
  { level: 4, minXp: 650, title: 'Stage Navigator' },
  { level: 5, minXp: 1050, title: 'Path Achiever' },
  { level: 6, minXp: 1600, title: 'Domain Specialist' },
  { level: 7, minXp: 2300, title: 'Master Scholar' },
  { level: 8, minXp: 3200, title: 'Skillora Fellow' },
];

export function computeLevelInfo(totalXpInput: number): AchievementLevelInfo {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(totalXpInput) ? totalXpInput : 0));

  let current = LEVEL_THRESHOLDS[0];
  let nextMinXp = LEVEL_THRESHOLDS[1].minXp;

  if (totalXp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].minXp) {
    const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const step = 1000;
    const extraLevels = Math.floor((totalXp - last.minXp) / step);
    const level = last.level + extraLevels;
    const minXp = last.minXp + extraLevels * step;
    nextMinXp = minXp + step;
    current = {
      level,
      minXp,
      title: extraLevels === 0 ? last.title : `Skillora Fellow Tier ${extraLevels + 1}`,
    };
  } else {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
      const candidate = LEVEL_THRESHOLDS[i];
      const next = LEVEL_THRESHOLDS[i + 1];
      if (!next || totalXp < next.minXp) {
        current = candidate;
        nextMinXp = next ? next.minXp : candidate.minXp + 1000;
        break;
      }
    }
  }

  const xpIntoCurrentLevel = Math.max(0, totalXp - current.minXp);
  const xpNeededForNextLevel = Math.max(1, nextMinXp - current.minXp);
  const xpToNextLevel = Math.max(0, nextMinXp - totalXp);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((xpIntoCurrentLevel / xpNeededForNextLevel) * 100))
  );

  return {
    level: current.level,
    title: current.title,
    totalXp,
    currentLevelMinXp: current.minXp,
    nextLevelXp: nextMinXp,
    xpIntoCurrentLevel,
    xpNeededForNextLevel,
    xpToNextLevel,
    progressPercent,
  };
}

export function buildLessonEventKey(
  roadmapId: string,
  stageId: string,
  lessonId: string
): string {
  return `lesson:${roadmapId}:${stageId}:${lessonId}`;
}

export function buildKnowledgeCheckPassEventKey(
  roadmapId: string,
  stageId: string,
  lessonId: string
): string {
  return `kc_pass:${roadmapId}:${stageId}:${lessonId}`;
}

export function buildStageEventKey(roadmapId: string, stageId: string): string {
  return `stage:${roadmapId}:${stageId}`;
}

export function buildPathEventKey(roadmapId: string): string {
  return `path:${roadmapId}`;
}

function addDaysUtc(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

function diffDateKeysUtc(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function computeStreakSummaryForAchievements(params: {
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  timeZone?: string;
  now?: Date;
}): { currentStreakDays: number; longestStreakDays: number; maxStreakEndTimestamp: string | null } {
  const safeTz = resolveSafeTimeZone(params.timeZone);
  const now = params.now ?? new Date();
  const events: MeaningfulActivityEvent[] = [];

  for (const rm of params.roadmaps) {
    for (const stage of rm.roadmapData?.stages ?? []) {
      for (const lesson of stage.lessons ?? []) {
        if (lesson.completed && lesson.completedAt) {
          events.push({
            type: 'lesson_completed',
            timestamp: lesson.completedAt,
            completed: true,
          });
        }
      }
    }
  }

  for (const kc of params.knowledgeCheckAttempts) {
    if (kc.completedAt) {
      events.push({
        type: 'knowledge_check',
        timestamp: kc.completedAt,
        completed: true,
      });
    }
  }

  for (const att of params.assessmentAttempts) {
    if (att.createdAt) {
      events.push({
        type: 'assessment',
        timestamp: att.createdAt,
        completed: true,
      });
    }
  }

  for (const sess of params.learningSessions) {
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    const candidate: MeaningfulActivityEvent = {
      type:
        sess.activityType === 'knowledge_check'
          ? 'knowledge_check'
          : sess.activityType === 'assessment'
          ? 'assessment'
          : 'lesson_study',
      timestamp: ts,
      durationSeconds: sess.durationSeconds,
      completed: sess.completed,
    };
    if (isMeaningfulLearningActivity(candidate)) {
      events.push(candidate);
    }
  }

  const latestTsByDateKey = new Map<string, string>();
  for (const evt of events) {
    if (!isMeaningfulLearningActivity(evt)) continue;
    const dateKey = getDateKeyInTimeZone(evt.timestamp, safeTz);
    if (!dateKey) continue;
    const existing = latestTsByDateKey.get(dateKey);
    if (!existing || new Date(evt.timestamp).getTime() > new Date(existing).getTime()) {
      latestTsByDateKey.set(dateKey, evt.timestamp);
    }
  }

  const sortedDateKeys = Array.from(latestTsByDateKey.keys()).sort();
  if (sortedDateKeys.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0, maxStreakEndTimestamp: null };
  }

  let longestStreakDays = 0;
  let run = 0;
  let prevKey: string | null = null;
  let sevenDayReachedAt: string | null = null;

  for (const key of sortedDateKeys) {
    if (prevKey && diffDateKeysUtc(prevKey, key) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreakDays) {
      longestStreakDays = run;
    }
    if (run >= 7 && !sevenDayReachedAt) {
      sevenDayReachedAt = latestTsByDateKey.get(key) ?? null;
    }
    prevKey = key;
  }

  const todayKey = getDateKeyInTimeZone(now, safeTz) ?? '';
  const yesterdayKey = todayKey ? addDaysUtc(todayKey, -1) : '';
  let currentStreakDays = 0;
  if ((todayKey && latestTsByDateKey.has(todayKey)) || (yesterdayKey && latestTsByDateKey.has(yesterdayKey))) {
    let cursor = latestTsByDateKey.has(todayKey) ? todayKey : yesterdayKey;
    while (cursor && latestTsByDateKey.has(cursor)) {
      currentStreakDays += 1;
      cursor = addDaysUtc(cursor, -1);
    }
  }

  return {
    currentStreakDays,
    longestStreakDays,
    maxStreakEndTimestamp: sevenDayReachedAt,
  };
}

function safeIsoOrFallback(candidate?: string | null, fallback?: string): string {
  if (candidate) {
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (fallback) {
    const ms = new Date(fallback).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function pickLatestIso(timestamps: Array<string | null | undefined>, fallback: string): string {
  let bestMs = -Infinity;
  let bestIso = fallback;
  for (const ts of timestamps) {
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestIso = new Date(ms).toISOString();
    }
  }
  return Number.isFinite(bestMs) ? bestIso : safeIsoOrFallback(fallback);
}

export interface EvaluateAchievementsInput {
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  persistedLedger?: XpLedgerEntry[];
  persistedBadges?: PersistedAchievementBadgeRow[];
  timeZone?: string;
  now?: Date;
}

export interface EvaluatedAchievementsResult {
  summary: Omit<
    AchievementSummaryPayload,
    'authenticated' | 'persistedInDatabase' | 'schemaMigrationRequired' | 'newlyAwardedXp' | 'newlyUnlockedBadgeIds'
  >;
  verifiedEventsToPersist: XpLedgerEntry[];
  newlyEligibleEvents: XpLedgerEntry[];
  verifiedBadgesToPersist: Array<{
    badgeId: AchievementBadgeId;
    unlockedAt: string;
    metadata: Record<string, unknown>;
  }>;
  newlyUnlockedBadges: Array<{
    badgeId: AchievementBadgeId;
    unlockedAt: string;
    metadata: Record<string, unknown>;
  }>;
}

/**
 * Pure deterministic server/client evaluator that computes verified XP and
 * achievement badges strictly from canonical user progress records (both active
 * and archived roadmaps) and merges idempotently with persisted database rows.
 */
export function evaluateVerifiedAchievements(
  input: EvaluateAchievementsInput
): EvaluatedAchievementsResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const persistedLedgerMap = new Map<string, XpLedgerEntry>();
  for (const entry of input.persistedLedger ?? []) {
    if (entry.eventKey && !persistedLedgerMap.has(entry.eventKey)) {
      persistedLedgerMap.set(entry.eventKey, entry);
    }
  }

  const persistedBadgeMap = new Map<AchievementBadgeId, PersistedAchievementBadgeRow>();
  for (const badgeRow of input.persistedBadges ?? []) {
    const id = badgeRow.badgeId as AchievementBadgeId;
    if (!persistedBadgeMap.has(id)) {
      persistedBadgeMap.set(id, badgeRow);
    }
  }

  const derivedEventsMap = new Map<string, XpLedgerEntry>();

  const registerDerivedEvent = (candidate: Omit<XpLedgerEntry, 'id'>) => {
    if (derivedEventsMap.has(candidate.eventKey)) return;
    const existing = persistedLedgerMap.get(candidate.eventKey);
    derivedEventsMap.set(candidate.eventKey, {
      id: existing?.id ?? candidate.eventKey,
      eventKey: candidate.eventKey,
      eventType: candidate.eventType,
      xpAmount: existing?.xpAmount ?? candidate.xpAmount,
      title: existing?.title ?? candidate.title,
      roadmapId: existing?.roadmapId ?? candidate.roadmapId ?? null,
      stageId: existing?.stageId ?? candidate.stageId ?? null,
      lessonId: existing?.lessonId ?? candidate.lessonId ?? null,
      awardedAt: existing?.awardedAt ?? candidate.awardedAt,
    });
  };

  let activeCompletedLessons = 0;
  let activeCompletedStages = 0;
  let activeCompletedPaths = 0;

  // 1. Evaluate Lessons, Stages, and Paths across ALL roadmaps (active + archived)
  for (const roadmap of input.roadmaps) {
    if (!roadmap?.id) continue;
    const roadmapFallbackTs = safeIsoOrFallback(roadmap.updatedAt || roadmap.createdAt, nowIso);
    const stages = roadmap.roadmapData?.stages ?? [];
    let totalLessonsInRoadmap = 0;
    let completedLessonsInRoadmap = 0;
    const roadmapCompletionTimestamps: Array<string | null | undefined> = [];

    for (const stage of stages) {
      if (!stage?.id) continue;
      const lessons = stage.lessons ?? [];
      totalLessonsInRoadmap += lessons.length;
      let stageCompletedLessons = 0;
      const stageCompletionTimestamps: Array<string | null | undefined> = [];

      for (const lesson of lessons) {
        if (!lesson?.id) continue;
        if (lesson.completed === true) {
          completedLessonsInRoadmap += 1;
          stageCompletedLessons += 1;
          activeCompletedLessons += 1;
          const lessonTs = safeIsoOrFallback(lesson.completedAt, roadmapFallbackTs);
          stageCompletionTimestamps.push(lessonTs);
          roadmapCompletionTimestamps.push(lessonTs);

          registerDerivedEvent({
            eventKey: buildLessonEventKey(roadmap.id, stage.id, lesson.id),
            eventType: 'lesson_completed',
            xpAmount: XP_REWARDS.LESSON_FIRST_COMPLETION,
            title: `Completed lesson: ${lesson.title || 'Lesson'}`,
            roadmapId: roadmap.id,
            stageId: stage.id,
            lessonId: lesson.id,
            awardedAt: lessonTs,
          });
        }
      }

      if (lessons.length > 0 && stageCompletedLessons === lessons.length) {
        activeCompletedStages += 1;
        registerDerivedEvent({
          eventKey: buildStageEventKey(roadmap.id, stage.id),
          eventType: 'stage_completed',
          xpAmount: XP_REWARDS.STAGE_FIRST_COMPLETION,
          title: `Completed stage: ${stage.title || 'Learning Stage'}`,
          roadmapId: roadmap.id,
          stageId: stage.id,
          lessonId: null,
          awardedAt: pickLatestIso(stageCompletionTimestamps, roadmapFallbackTs),
        });
      }
    }

    if (
      stages.length > 0 &&
      totalLessonsInRoadmap > 0 &&
      completedLessonsInRoadmap === totalLessonsInRoadmap
    ) {
      activeCompletedPaths += 1;
      registerDerivedEvent({
        eventKey: buildPathEventKey(roadmap.id),
        eventType: 'path_completed',
        xpAmount: XP_REWARDS.PATH_FIRST_COMPLETION,
        title: `Completed learning path: ${roadmap.title || roadmap.careerGoal || 'Learning Path'}`,
        roadmapId: roadmap.id,
        stageId: null,
        lessonId: null,
        awardedAt: pickLatestIso(roadmapCompletionTimestamps, roadmapFallbackTs),
      });
    }
  }

  // 2. Evaluate Passing Knowledge Checks (>= 80% score) — earliest passing attempt awards 25 XP once per lesson
  const sortedPassingKcs = input.knowledgeCheckAttempts
    .filter((kc) => Number(kc.score) >= KNOWLEDGE_CHECK_PASS_MIN_PERCENT)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()
    );

  const passedLessonKeys = new Set<string>();
  for (const kc of sortedPassingKcs) {
    if (!kc.roadmapId || !kc.stageId || !kc.lessonId) continue;
    const eventKey = buildKnowledgeCheckPassEventKey(kc.roadmapId, kc.stageId, kc.lessonId);
    passedLessonKeys.add(eventKey);
    registerDerivedEvent({
      eventKey,
      eventType: 'knowledge_check_passed',
      xpAmount: XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS,
      title: `Passed Knowledge Check: ${kc.lessonTitle || 'Lesson Quiz'} (${kc.score}%)`,
      roadmapId: kc.roadmapId,
      stageId: kc.stageId,
      lessonId: kc.lessonId,
      awardedAt: safeIsoOrFallback(kc.completedAt, nowIso),
    });
  }

  // 3. Merge any previously persisted ledger items (so earned XP is never lost)
  for (const persisted of persistedLedgerMap.values()) {
    if (!derivedEventsMap.has(persisted.eventKey)) {
      derivedEventsMap.set(persisted.eventKey, persisted);
    }
  }

  const allLedgerEntries = Array.from(derivedEventsMap.values()).sort(
    (a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
  );

  const newlyEligibleEvents = Array.from(derivedEventsMap.values()).filter(
    (evt) => !persistedLedgerMap.has(evt.eventKey)
  );

  let totalXp = 0;
  let lessonXp = 0;
  let knowledgeCheckXp = 0;
  let stageXp = 0;
  let pathXp = 0;
  let ledgerLessonsCount = 0;
  let ledgerPassedKcCount = 0;
  let ledgerStagesCount = 0;
  let ledgerPathsCount = 0;

  for (const entry of allLedgerEntries) {
    totalXp += entry.xpAmount;
    switch (entry.eventType) {
      case 'lesson_completed':
        lessonXp += entry.xpAmount;
        ledgerLessonsCount += 1;
        break;
      case 'knowledge_check_passed':
        knowledgeCheckXp += entry.xpAmount;
        ledgerPassedKcCount += 1;
        break;
      case 'stage_completed':
        stageXp += entry.xpAmount;
        ledgerStagesCount += 1;
        break;
      case 'path_completed':
        pathXp += entry.xpAmount;
        ledgerPathsCount += 1;
        break;
    }
  }

  const completedLessonsCount = Math.max(activeCompletedLessons, ledgerLessonsCount);
  const passedKnowledgeChecksCount = Math.max(passedLessonKeys.size, ledgerPassedKcCount);
  const completedStagesCount = Math.max(activeCompletedStages, ledgerStagesCount);
  const completedPathsCount = Math.max(activeCompletedPaths, ledgerPathsCount);
  const assessmentsCount = input.assessmentAttempts.length;

  const streakSummary = computeStreakSummaryForAchievements({
    roadmaps: input.roadmaps,
    knowledgeCheckAttempts: input.knowledgeCheckAttempts,
    learningSessions: input.learningSessions,
    assessmentAttempts: input.assessmentAttempts,
    timeZone: input.timeZone,
    now,
  });

  const maxObservedStreak = Math.max(
    streakSummary.currentStreakDays,
    streakSummary.longestStreakDays
  );

  const earliestForType = (type: XpEventType): string => {
    const matches = allLedgerEntries
      .filter((e) => e.eventType === type)
      .sort((a, b) => new Date(a.awardedAt).getTime() - new Date(b.awardedAt).getTime());
    return matches[0]?.awardedAt ?? nowIso;
  };

  const earliestAssessmentTs = (() => {
    const sorted = input.assessmentAttempts
      .filter((a) => Boolean(a.createdAt))
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted[0]?.createdAt ? safeIsoOrFallback(sorted[0].createdAt, nowIso) : nowIso;
  })();

  const badges: AchievementBadgeState[] = BADGE_DEFINITIONS.map((def) => {
    const persisted = persistedBadgeMap.get(def.id);
    let unlockedNow = false;
    let progressCurrent = 0;
    let progressTarget = 1;
    let progressLabel = '';
    let derivedUnlockedAt: string | null = null;

    switch (def.id) {
      case 'first_step':
        progressTarget = 1;
        progressCurrent = Math.min(1, completedLessonsCount);
        unlockedNow = completedLessonsCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 lesson' : '0 / 1 lesson';
        if (unlockedNow) derivedUnlockedAt = earliestForType('lesson_completed');
        break;
      case 'knowledge_seeker':
        progressTarget = 1;
        progressCurrent = Math.min(1, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 passed quiz' : '0 / 1 passed quiz';
        if (unlockedNow) derivedUnlockedAt = earliestForType('knowledge_check_passed');
        break;
      case 'consistent_learner':
        progressTarget = 7;
        progressCurrent = Math.min(7, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 7;
        progressLabel = unlockedNow
          ? '7 / 7 day streak'
          : `${progressCurrent} / 7 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.maxStreakEndTimestamp, nowIso);
        }
        break;
      case 'stage_master':
        progressTarget = 1;
        progressCurrent = Math.min(1, completedStagesCount);
        unlockedNow = completedStagesCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 stage' : '0 / 1 stage';
        if (unlockedNow) derivedUnlockedAt = earliestForType('stage_completed');
        break;
      case 'path_finisher':
        progressTarget = 1;
        progressCurrent = Math.min(1, completedPathsCount);
        unlockedNow = completedPathsCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 learning path' : '0 / 1 learning path';
        if (unlockedNow) derivedUnlockedAt = earliestForType('path_completed');
        break;
      case 'skill_assessor':
        progressTarget = 1;
        progressCurrent = Math.min(1, assessmentsCount);
        unlockedNow = assessmentsCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 assessment' : '0 / 1 assessment';
        if (unlockedNow) derivedUnlockedAt = earliestAssessmentTs;
        break;
    }

    const isUnlocked = Boolean(persisted) || unlockedNow;
    const unlockedAt = persisted?.unlockedAt
      ? safeIsoOrFallback(persisted.unlockedAt, nowIso)
      : isUnlocked
      ? derivedUnlockedAt ?? nowIso
      : null;

    if (isUnlocked && progressCurrent < progressTarget) {
      progressCurrent = progressTarget;
    }

    return {
      ...def,
      unlocked: isUnlocked,
      unlockedAt,
      progressCurrent,
      progressTarget,
      progressLabel: isUnlocked && def.id === 'consistent_learner'
        ? '7 / 7 day streak'
        : progressLabel,
    };
  });

  const verifiedBadgesToPersist = badges
    .filter((b) => b.unlocked)
    .map((b) => ({
      badgeId: b.id,
      unlockedAt: b.unlockedAt ?? nowIso,
      metadata: {
        title: b.title,
        unlockRequirement: b.unlockRequirement,
      },
    }));

  const newlyUnlockedBadges = verifiedBadgesToPersist.filter(
    (b) => !persistedBadgeMap.has(b.badgeId)
  );

  // Recent achievements combine unlocked badges + recent XP awards ordered newest-first
  const recentAchievements: RecentAchievementItem[] = [
    ...badges
      .filter((b) => b.unlocked && b.unlockedAt)
      .map((b) => ({
        id: `badge-${b.id}`,
        kind: 'badge' as const,
        badgeId: b.id,
        title: `Badge Unlocked: ${b.title}`,
        subtitle: b.unlockRequirement,
        timestamp: b.unlockedAt!,
      })),
    ...allLedgerEntries.slice(0, 12).map((entry) => ({
      id: `xp-${entry.eventKey}`,
      kind: 'xp' as const,
      eventType: entry.eventType,
      title: entry.title,
      subtitle: `+${entry.xpAmount} XP awarded`,
      xpAmount: entry.xpAmount,
      timestamp: entry.awardedAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12);

  const levelInfo = computeLevelInfo(totalXp);

  return {
    summary: {
      totalXp,
      levelInfo,
      badges,
      unlockedCount: badges.filter((b) => b.unlocked).length,
      totalBadgesCount: badges.length,
      recentAchievements,
      xpLedger: allLedgerEntries.slice(0, 40),
      stats: {
        completedLessonsCount,
        passedKnowledgeChecksCount,
        completedStagesCount,
        completedPathsCount,
        assessmentsCount,
        currentStreakDays: streakSummary.currentStreakDays,
        longestStreakDays: maxObservedStreak,
        lessonXp,
        knowledgeCheckXp,
        stageXp,
        pathXp,
      },
    },
    verifiedEventsToPersist: allLedgerEntries,
    newlyEligibleEvents,
    verifiedBadgesToPersist,
    newlyUnlockedBadges,
  };
}
