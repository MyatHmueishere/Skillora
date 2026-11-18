export type InactivityTier = 'gentle_1d' | 'followup_2_3d' | 'restart_7d';

export type MeaningfulActivityType =
  | 'lesson_completed'
  | 'lesson_study'
  | 'knowledge_check'
  | 'assessment'
  | 'practical_exercise';

export interface MeaningfulActivityEvent {
  id?: string;
  timestamp: string;
  type: MeaningfulActivityType;
  title?: string;
  durationSeconds?: number;
  completed?: boolean;
  roadmapId?: string | null;
  stageId?: string | null;
  lessonId?: string | null;
}

export interface SentNotificationRecord {
  dedupeKey: string;
  tier: string;
  sentAt: string;
}

export interface InactivityEvaluationInput {
  events: MeaningfulActivityEvent[];
  now?: Date;
  timeZone?: string;
  preferredTime?: string;
  paused?: boolean;
  pausedUntil?: string | null;
  inactivityRemindersEnabled?: boolean;
  sentHistory?: SentNotificationRecord[];
  primaryDirection?: string;
  nextLessonTitle?: string;
  enforcePreferredTimeWindow?: boolean;
}

export type InactivitySuppressionReason =
  | 'no_meaningful_activity'
  | 'active_recently'
  | 'disabled'
  | 'paused'
  | 'before_preferred_time'
  | 'already_sent_for_cycle'
  | 'cooldown_active';

export interface InactivityEvaluationResult {
  shouldNotify: boolean;
  tier: InactivityTier | null;
  suppressedReason: InactivitySuppressionReason | null;
  lastMeaningfulActivityAt: string | null;
  inactiveDays: number;
  elapsedHours: number;
  cycleKey: string | null;
  dedupeKey: string | null;
  title: string | null;
  body: string | null;
  resolvedTimeZone: string;
  localDateKey: string;
}

/**
 * Only genuine learning progress resets inactivity:
 * - completing a lesson
 * - completing a knowledge check or diagnostic assessment
 * - completing a practical exercise
 * - active lesson study (>= 10 seconds)
 * Merely opening the website or viewing a dashboard does NOT count.
 */
export function isMeaningfulLearningActivity(event: MeaningfulActivityEvent): boolean {
  if (!event || !event.timestamp) return false;
  const parsedMs = new Date(event.timestamp).getTime();
  if (!Number.isFinite(parsedMs)) return false;

  switch (event.type) {
    case 'lesson_completed':
    case 'knowledge_check':
    case 'assessment':
    case 'practical_exercise':
      return true;
    case 'lesson_study': {
      const dur = Number(event.durationSeconds ?? 0);
      if (Number.isFinite(dur) && dur >= 10) return true;
      return event.completed === true && Number.isFinite(dur) && dur >= 1;
    }
    default:
      return false;
  }
}

export function resolveSafeTimeZone(timeZone?: string | null): string {
  const candidate = (timeZone ?? '').trim();
  if (candidate) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      // Invalid IANA timezone string; fallback below
    }
  }
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      new Intl.DateTimeFormat('en-US', { timeZone: detected }).format(new Date());
      return detected;
    }
  } catch {
    // Ignore
  }
  return 'UTC';
}

export function getLocalDateAndClockInTimeZone(
  date: Date,
  timeZone: string
): { dateKey: string; hour: number; minute: number; totalMinutes: number } {
  const safeTz = resolveSafeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  const year = map.year || '1970';
  const month = map.month || '01';
  const day = map.day || '01';
  const rawHour = Number(map.hour ?? 0);
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 0;
  const rawMinute = Number(map.minute ?? 0);
  const minute = Number.isFinite(rawMinute) ? rawMinute % 60 : 0;
  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

export function getDateKeyInTimeZone(dateInput: Date | string, timeZone: string): string | null {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return null;
  return getLocalDateAndClockInTimeZone(date, timeZone).dateKey;
}

export function diffDateKeysDays(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function normalizePreferredTime(value?: string | null): {
  normalized: string;
  hour: number;
  minute: number;
  totalMinutes: number;
} {
  const match = (value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2])));
    return {
      normalized: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      hour,
      minute,
      totalMinutes: hour * 60 + minute,
    };
  }
  return { normalized: '18:00', hour: 18, minute: 0, totalMinutes: 18 * 60 };
}

export function isNotificationsPausedAt(
  prefs: { paused?: boolean; pausedUntil?: string | null },
  now: Date = new Date()
): boolean {
  if (prefs.paused) return true;
  if (prefs.pausedUntil) {
    const untilMs = new Date(prefs.pausedUntil).getTime();
    if (Number.isFinite(untilMs) && untilMs > now.getTime()) {
      return true;
    }
  }
  return false;
}

export function buildInactivityReminderMessage(params: {
  tier: InactivityTier;
  inactiveDays: number;
  primaryDirection?: string;
  nextLessonTitle?: string;
}): { title: string; body: string } {
  const direction = (params.primaryDirection ?? '').trim();
  const nextLesson = (params.nextLessonTitle ?? '').trim();

  if (params.tier === 'gentle_1d') {
    return {
      title: 'Keep your Skillora momentum going',
      body: nextLesson
        ? `Ready for a short session? Continue "${nextLesson}"${
            direction ? ` in your ${direction} path` : ''
          }.`
        : `A focused 15-minute study session today keeps your${
            direction ? ` ${direction}` : ''
          } skills sharp.`,
    };
  }

  if (params.tier === 'followup_2_3d') {
    return {
      title: `Pick up where you left off (${params.inactiveDays} days away)`,
      body: nextLesson
        ? `Your next lesson "${nextLesson}" is ready whenever you have a few minutes today.`
        : `Even one lesson or Knowledge Check today gets your${
            direction ? ` ${direction}` : ''
          } streak rolling again.`,
    };
  }

  return {
    title: 'Ready for a fresh restart on Skillora?',
    body: nextLesson
      ? `It’s been ${params.inactiveDays} days—jump back into "${nextLesson}" at your own pace. Your progress is saved.`
      : `Your learning path${
          direction ? ` for ${direction}` : ''
        } and all completed progress are waiting whenever you’re ready to restart.`,
  };
}

export function evaluateInactivityReminder(
  input: InactivityEvaluationInput
): InactivityEvaluationResult {
  const now = input.now ? new Date(input.now) : new Date();
  const resolvedTimeZone = resolveSafeTimeZone(input.timeZone);
  const localClock = getLocalDateAndClockInTimeZone(now, resolvedTimeZone);
  const preferred = normalizePreferredTime(input.preferredTime);

  const meaningful = input.events
    .filter(isMeaningfulLearningActivity)
    .map((evt) => ({
      event: evt,
      ms: new Date(evt.timestamp).getTime(),
    }))
    .sort((a, b) => b.ms - a.ms);

  if (meaningful.length === 0) {
    return {
      shouldNotify: false,
      tier: null,
      suppressedReason: 'no_meaningful_activity',
      lastMeaningfulActivityAt: null,
      inactiveDays: 0,
      elapsedHours: 0,
      cycleKey: null,
      dedupeKey: null,
      title: null,
      body: null,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  const latest = meaningful[0];
  const lastActivityMs = latest.ms;
  const lastMeaningfulActivityAt = new Date(lastActivityMs).toISOString();
  const lastDateKey =
    getDateKeyInTimeZone(new Date(lastActivityMs), resolvedTimeZone) ?? localClock.dateKey;
  const calendarDaysInactive = Math.max(0, diffDateKeysDays(lastDateKey, localClock.dateKey));
  const elapsedMs = Math.max(0, now.getTime() - lastActivityMs);
  const elapsedHours = elapsedMs / 3_600_000;

  // Determine inactivity tier:
  // - 1 full day (>= 24h and >= 1 local day, < 2 days) -> gentle_1d
  // - 2-3+ inactive days (>= 48h and >= 2 local days, < 7 days) -> followup_2_3d
  // - 7+ inactive days (>= 168h and >= 7 local days) -> restart_7d
  let tier: InactivityTier | null = null;
  if (elapsedHours >= 168 && calendarDaysInactive >= 7) {
    tier = 'restart_7d';
  } else if (elapsedHours >= 48 && calendarDaysInactive >= 2) {
    tier = 'followup_2_3d';
  } else if (elapsedHours >= 24 && calendarDaysInactive >= 1) {
    tier = 'gentle_1d';
  }

  if (!tier) {
    return {
      shouldNotify: false,
      tier: null,
      suppressedReason: 'active_recently',
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey: null,
      dedupeKey: null,
      title: null,
      body: null,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  const cycleKey = String(Math.floor(lastActivityMs / 1000));
  const dedupeKey = `inactivity:${cycleKey}:${tier}`;
  const { title, body } = buildInactivityReminderMessage({
    tier,
    inactiveDays: Math.max(1, calendarDaysInactive),
    primaryDirection: input.primaryDirection,
    nextLessonTitle: input.nextLessonTitle,
  });

  if (input.inactivityRemindersEnabled === false) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: 'disabled',
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  if (isNotificationsPausedAt({ paused: input.paused, pausedUntil: input.pausedUntil }, now)) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: 'paused',
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  if (input.enforcePreferredTimeWindow && localClock.totalMinutes < preferred.totalMinutes) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: 'before_preferred_time',
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  const history = input.sentHistory ?? [];
  if (history.some((entry) => entry.dedupeKey === dedupeKey)) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: 'already_sent_for_cycle',
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  // Prevent excessive notifications within the same inactivity cycle (< 20 hours apart)
  const cooldownMs = 20 * 3_600_000;
  const tooRecentInCycle = history.some((entry) => {
    if (!entry.dedupeKey.startsWith(`inactivity:${cycleKey}:`)) return false;
    const sentMs = new Date(entry.sentAt).getTime();
    return Number.isFinite(sentMs) && now.getTime() - sentMs >= 0 && now.getTime() - sentMs < cooldownMs;
  });

  if (tooRecentInCycle) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: 'cooldown_active',
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey,
    };
  }

  return {
    shouldNotify: true,
    tier,
    suppressedReason: null,
    lastMeaningfulActivityAt,
    inactiveDays: calendarDaysInactive,
    elapsedHours: Number(elapsedHours.toFixed(1)),
    cycleKey,
    dedupeKey,
    title,
    body,
    resolvedTimeZone,
    localDateKey: localClock.dateKey,
  };
}
