import type {
  AssessmentAttemptRecord,
  LearningActivityMetrics,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
  NotificationItem,
  NotificationPreferences,
  UserProfile,
} from '../types';
import {
  evaluateInactivityReminder,
  isNotificationsPausedAt,
} from '../../shared/inactivityEngine';
import {
  collectMeaningfulLearningEvents,
  computeTimezoneAwareStreak,
} from './dashboardJourney';
import { computeRoadmapStats, resolveResumeLearningTarget } from './learningRoadmaps';

interface NotificationStateRecord {
  readIds: string[];
  clearedIds: string[];
}

const NOTIF_STORAGE_PREFIX = 'skillora_notif_state_v1:';

function readNotificationState(userId: string): NotificationStateRecord {
  if (typeof window === 'undefined' || !userId) {
    return { readIds: [], clearedIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(`${NOTIF_STORAGE_PREFIX}${userId}`);
    if (!raw) return { readIds: [], clearedIds: [] };
    const parsed = JSON.parse(raw) as Partial<NotificationStateRecord>;
    return {
      readIds: Array.isArray(parsed.readIds)
        ? parsed.readIds.filter((x): x is string => typeof x === 'string')
        : [],
      clearedIds: Array.isArray(parsed.clearedIds)
        ? parsed.clearedIds.filter((x): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return { readIds: [], clearedIds: [] };
  }
}

function writeNotificationState(userId: string, state: NotificationStateRecord): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(`${NOTIF_STORAGE_PREFIX}${userId}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function markNotificationReadForUser(userId: string, notificationId: string): void {
  if (!userId || !notificationId) return;
  const state = readNotificationState(userId);
  if (!state.readIds.includes(notificationId)) {
    state.readIds = [...state.readIds, notificationId].slice(-60);
    writeNotificationState(userId, state);
  }
}

export function markAllNotificationsReadForUser(
  userId: string,
  notificationIds: string[]
): void {
  if (!userId) return;
  const state = readNotificationState(userId);
  const merged = new Set([...state.readIds, ...notificationIds]);
  state.readIds = Array.from(merged).slice(-80);
  writeNotificationState(userId, state);
}

export function clearNotificationsForUser(
  userId: string,
  notificationIds: string[]
): void {
  if (!userId) return;
  const state = readNotificationState(userId);
  const mergedCleared = new Set([...state.clearedIds, ...notificationIds]);
  state.clearedIds = Array.from(mergedCleared).slice(-80);
  writeNotificationState(userId, state);
}

export function buildStudentNotifications(params: {
  userId: string;
  user: UserProfile;
  activeRoadmap: LearningRoadmapRecord | null;
  archivedRoadmaps?: LearningRoadmapRecord[];
  learningSessions?: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  activityMetrics: LearningActivityMetrics;
  notificationPreferences?: NotificationPreferences | null;
  now?: Date;
}): NotificationItem[] {
  const {
    userId,
    user,
    activeRoadmap,
    archivedRoadmaps = [],
    learningSessions = [],
    assessmentAttempts,
    knowledgeCheckAttempts,
    activityMetrics,
    notificationPreferences,
    now = new Date(),
  } = params;

  if (notificationPreferences && !notificationPreferences.inAppEnabled) {
    return [];
  }
  if (notificationPreferences && isNotificationsPausedAt(notificationPreferences, now)) {
    return [];
  }

  const state = readNotificationState(userId);
  const readSet = new Set(state.readIds);
  const clearedSet = new Set(state.clearedIds);
  const rawItems: Omit<NotificationItem, 'read'>[] = [];

  const direction = (user.primaryDirection ?? '').trim() || user.careerGoal.trim();
  const resumeTarget = resolveResumeLearningTarget(activeRoadmap, learningSessions);

  // 0. Smart inactivity reminder based strictly on meaningful learning activity
  const meaningfulEvents = collectMeaningfulLearningEvents({
    activeRoadmap,
    archivedRoadmaps,
    learningSessions,
    knowledgeCheckAttempts,
    assessmentAttempts,
  });

  if (notificationPreferences?.lastMeaningfulActivityAt) {
    const prefTs = new Date(notificationPreferences.lastMeaningfulActivityAt).getTime();
    const maxEventTs = meaningfulEvents.reduce(
      (max, evt) => Math.max(max, new Date(evt.timestamp).getTime() || 0),
      0
    );
    if (Number.isFinite(prefTs) && prefTs > maxEventTs) {
      meaningfulEvents.push({
        id: 'pref-last-meaningful',
        type: 'lesson_completed',
        timestamp: notificationPreferences.lastMeaningfulActivityAt,
        completed: true,
      });
    }
  }

  const inactivityEval = evaluateInactivityReminder({
    events: meaningfulEvents,
    now,
    timeZone: notificationPreferences?.timezone,
    preferredTime: notificationPreferences?.preferredTime,
    paused: notificationPreferences?.paused,
    pausedUntil: notificationPreferences?.pausedUntil,
    inactivityRemindersEnabled: notificationPreferences?.inactivityReminders ?? true,
    primaryDirection: direction,
    nextLessonTitle: resumeTarget?.lessonTitle ?? '',
    enforcePreferredTimeWindow: false,
  });

  if (
    inactivityEval.shouldNotify &&
    inactivityEval.dedupeKey &&
    inactivityEval.title &&
    inactivityEval.body
  ) {
    rawItems.push({
      id: inactivityEval.dedupeKey,
      title: inactivityEval.title,
      message: inactivityEval.body,
      timestamp:
        inactivityEval.inactiveDays <= 1
          ? '1d inactive'
          : `${inactivityEval.inactiveDays}d inactive`,
      type: 'reminder',
    });
  }

  // Compute timezone-aware meaningful streak across lessons, quizzes, diagnostics & sessions
  const tzStreak = computeTimezoneAwareStreak(
    meaningfulEvents,
    notificationPreferences?.timezone ?? 'UTC',
    now
  );
  const streakDays = Math.max(activityMetrics.currentStreakDays, tzStreak.currentStreakDays);
  const activeToday = activityMetrics.activeToday || tzStreak.activeToday;

  // 1. Streak / Daily study reminder
  if (notificationPreferences?.streakReminders !== false) {
    if (streakDays >= 2) {
      const streakLabel = `${streakDays}-Day Learning Streak!`;
      rawItems.push({
        id: `streak-${streakDays}-${activeToday ? 'today' : 'keep'}`,
        title: streakLabel,
        message: activeToday
          ? `You studied ${activityMetrics.todayHoursFormatted} today. Great consistency toward your ${user.preferredHoursPerDay}h/day goal!`
          : `You have a ${streakDays}-day streak waiting—complete a quick lesson today to extend it.`,
        timestamp: activeToday ? 'Today' : 'Active streak',
        type: 'achievement',
      });
    } else if (meaningfulEvents.length > 0 && activeToday) {
      rawItems.push({
        id: `daily-study-${activityMetrics.todayMinutes > 0 ? activityMetrics.todayMinutes : 'done'}`,
        title: 'Daily Study Logged',
        message:
          activityMetrics.todayMinutes > 0
            ? `Tracked ${activityMetrics.todayHoursFormatted} of active learning today (${activityMetrics.thisWeekHoursFormatted} this week).`
            : `Great job completing a learning milestone today toward your ${user.preferredHoursPerDay}h/day goal.`,
        timestamp: 'Today',
        type: 'achievement',
      });
    } else if (!inactivityEval.shouldNotify) {
      rawItems.push({
        id: 'start-daily-goal',
        title: 'Today’s Study Target',
        message: `Aim for ${user.preferredHoursPerDay}h of focused learning today${direction ? ` in ${direction}` : ''}.`,
        timestamp: 'Today',
        type: 'reminder',
      });
    }
  }

  // 2. Active Learning Path next step or milestone
  const roadmapStats = computeRoadmapStats(activeRoadmap);
  if (activeRoadmap) {
    if (roadmapStats.completedLessons === roadmapStats.totalLessons && roadmapStats.totalLessons > 0) {
      rawItems.push({
        id: `roadmap-complete-${activeRoadmap.id}`,
        title: 'Learning Path Complete!',
        message: `You completed all ${roadmapStats.totalLessons} lessons in "${activeRoadmap.title}". Ready for your next challenge!`,
        timestamp: 'Milestone',
        type: 'achievement',
      });
    } else if (roadmapStats.nextIncompleteLessonTitle) {
      rawItems.push({
        id: `next-lesson-${activeRoadmap.id}-${roadmapStats.nextIncompleteLessonId ?? 'first'}`,
        title: `Next Lesson: ${roadmapStats.nextIncompleteLessonTitle}`,
        message: `Stage ${roadmapStats.currentStageNumber} of ${roadmapStats.totalStages} · ${roadmapStats.progressPercent}% overall progress completed.`,
        timestamp: 'Up next',
        type: 'course',
      });
    }
  } else {
    rawItems.push({
      id: `create-roadmap-${direction ? direction.toLowerCase().slice(0, 20) : 'default'}`,
      title: 'Generate Your Learning Path',
      message: direction
        ? `Turn your focus in "${direction}" into structured courses and interactive lessons.`
        : 'Set your Primary Learning Direction in Profile and generate your personalized Learning Path.',
      timestamp: 'Recommended',
      type: 'course',
    });
  }

  // 3. Knowledge gaps / quiz coaching insight
  if (notificationPreferences?.aiInsightAlerts !== false) {
    const latestKc = knowledgeCheckAttempts
      .slice()
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];
    const latestDiag = assessmentAttempts
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (latestKc && latestKc.knowledgeGaps.length > 0) {
      const topGap = latestKc.knowledgeGaps[0];
      rawItems.push({
        id: `kc-gap-${latestKc.id}`,
        title: `Review Gap: ${topGap}`,
        message: `Spotted in "${latestKc.lessonTitle}" (${latestKc.score}%). Ask your AI Assistant for a step-by-step refresher.`,
        timestamp: 'Quiz insight',
        type: 'insight',
      });
    } else if (latestDiag && latestDiag.knowledgeGaps.length > 0) {
      const topGap = latestDiag.knowledgeGaps[0];
      rawItems.push({
        id: `diag-gap-${latestDiag.id}`,
        title: `Focus Area: ${topGap}`,
        message: `Identified in your ${latestDiag.subject} assessment (${latestDiag.scorePercent}%). Practice with step-by-step guidance.`,
        timestamp: 'Assessment',
        type: 'insight',
      });
    } else if (assessmentAttempts.length === 0) {
      rawItems.push({
        id: 'take-first-assessment',
        title: 'Calibrate Your Skill Level',
        message: `Take a quick diagnostic skill assessment${direction ? ` aligned with ${direction}` : ''} to pinpoint strengths and gaps.`,
        timestamp: 'Diagnostic',
        type: 'reminder',
      });
    }
  }

  // 4. Profile completion nudge if key profile details are still missing
  if (!user.primaryDirection?.trim() || !user.university.trim() || user.currentSkills.length === 0) {
    rawItems.push({
      id: 'profile-complete-nudge',
      title: 'Refine Your Learning Profile',
      message:
        'Add your Primary Learning Direction, academic details, and current skills to sharpen every AI recommendation.',
      timestamp: 'Profile',
      type: 'insight',
    });
  }

  return rawItems
    .filter((item) => !clearedSet.has(item.id))
    .slice(0, 6)
    .map((item) => ({
      ...item,
      read: readSet.has(item.id),
    }));
}
