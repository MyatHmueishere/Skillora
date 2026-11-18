import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AchievementBadgeId,
  AchievementSummaryPayload,
  evaluateVerifiedAchievements,
  PersistedAchievementBadgeRow,
  XpEventType,
  XpLedgerEntry,
} from '../shared/achievementEngine';
import { resolveSafeTimeZone } from '../shared/inactivityEngine';
import type {
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
  PersonalizedRoadmapData,
} from '../src/types';

export class AchievementApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AchievementApiError';
    this.status = status;
    this.code = code;
  }
}

function getSupabaseEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  };
}

function createUserScopedClient(accessToken: string): SupabaseClient {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new AchievementApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase configuration is missing on the server.'
    );
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function createServiceRoleClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function authenticateBearerRequest(authorizationHeader?: string): Promise<{
  userId: string;
  supabase: SupabaseClient;
}> {
  const header = authorizationHeader?.trim() || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    throw new AchievementApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with an active Skillora session.'
    );
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    throw new AchievementApiError(401, 'INVALID_AUTH_TOKEN', 'Missing access token.');
  }
  const supabase = createUserScopedClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    throw new AchievementApiError(
      401,
      'UNAUTHORIZED',
      'Your session is invalid or expired. Please sign in again.'
    );
  }
  return { userId: data.user.id, supabase };
}

function isMissingSchemaError(err?: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = (err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

function mapRoadmapRow(row: Record<string, unknown>): LearningRoadmapRecord {
  const roadmapDataRaw =
    row.roadmap_data && typeof row.roadmap_data === 'object'
      ? (row.roadmap_data as PersonalizedRoadmapData)
      : ({
          title: typeof row.title === 'string' ? row.title : 'Learning Path',
          careerGoal: typeof row.career_goal === 'string' ? row.career_goal : '',
          description: typeof row.description === 'string' ? row.description : '',
          estimatedTotalDuration: '',
          personalizationExplanation: '',
          assessmentValidated: false,
          stages: [],
        } as PersonalizedRoadmapData);

  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    title: typeof row.title === 'string' ? row.title : roadmapDataRaw.title || 'Learning Path',
    careerGoal:
      typeof row.career_goal === 'string' ? row.career_goal : roadmapDataRaw.careerGoal || '',
    description:
      typeof row.description === 'string' ? row.description : roadmapDataRaw.description || '',
    sourceAssessmentId:
      typeof row.source_assessment_id === 'string' ? row.source_assessment_id : null,
    roadmapData: {
      ...roadmapDataRaw,
      stages: Array.isArray(roadmapDataRaw.stages) ? roadmapDataRaw.stages : [],
    },
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt:
      typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
}

function mapKnowledgeCheckRow(
  row: Record<string, unknown>,
  fallbackUserId: string
): LessonKnowledgeCheckAttemptRecord {
  return {
    id: String(row.id ?? row.submission_id ?? ''),
    userId: typeof row.user_id === 'string' ? row.user_id : fallbackUserId,
    roadmapId: String(row.roadmap_id ?? row.roadmapId ?? ''),
    stageId: String(row.stage_id ?? row.stageId ?? ''),
    lessonId: String(row.lesson_id ?? row.lessonId ?? ''),
    lessonTitle: String(row.lesson_title ?? row.lessonTitle ?? 'Lesson Quiz'),
    submissionId: String(row.submission_id ?? row.submissionId ?? row.id ?? ''),
    score: Number(row.score) || 0,
    totalQuestions: Number(row.total_questions ?? row.totalQuestions) || 1,
    correctAnswers: Number(row.correct_answers ?? row.correctAnswers) || 0,
    answers: Array.isArray(row.answers) ? row.answers : [],
    topicBreakdown: Array.isArray(row.topic_breakdown) ? row.topic_breakdown : [],
    knowledgeGaps: Array.isArray(row.knowledge_gaps)
      ? row.knowledge_gaps.filter((g): g is string => typeof g === 'string')
      : [],
    recommendation:
      row.recommendation && typeof row.recommendation === 'object'
        ? (row.recommendation as LessonKnowledgeCheckAttemptRecord['recommendation'])
        : {
            action: 'additional_practice',
            title: '',
            description: '',
            thresholdsUsed: { advanceMinPercent: 80, practiceMinPercent: 50 },
            focusTopics: [],
          },
    completedAt:
      typeof row.completed_at === 'string'
        ? row.completed_at
        : typeof row.completedAt === 'string'
        ? row.completedAt
        : new Date().toISOString(),
  };
}

function mapSessionRow(row: Record<string, unknown>): LearningSessionRecord {
  const rawType = row.activity_type;
  const activityType: LearningSessionRecord['activityType'] =
    rawType === 'knowledge_check'
      ? 'knowledge_check'
      : rawType === 'assessment'
      ? 'assessment'
      : 'lesson_study';

  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    clientSessionId: String(row.client_session_id ?? row.id ?? ''),
    roadmapId: typeof row.roadmap_id === 'string' ? row.roadmap_id : null,
    stageId: typeof row.stage_id === 'string' ? row.stage_id : null,
    lessonId: typeof row.lesson_id === 'string' ? row.lesson_id : null,
    lessonTitle: typeof row.lesson_title === 'string' ? row.lesson_title : null,
    activityType,
    durationSeconds: Number(row.duration_seconds) || 0,
    startedAt:
      typeof row.started_at === 'string' ? row.started_at : new Date().toISOString(),
    endedAt:
      typeof row.ended_at === 'string'
        ? row.ended_at
        : typeof row.started_at === 'string'
        ? row.started_at
        : new Date().toISOString(),
    completed: row.completed !== false,
  };
}

function mapAssessmentRow(row: Record<string, unknown>): AssessmentAttemptRecord {
  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    subject: typeof row.subject === 'string' ? row.subject : 'Skill Assessment',
    difficulty:
      row.difficulty === 'Beginner' ||
      row.difficulty === 'Intermediate' ||
      row.difficulty === 'Advanced'
        ? row.difficulty
        : 'Intermediate',
    totalQuestions: Number(row.total_questions) || 0,
    correctAnswers: Number(row.correct_answers) || 0,
    scorePercent: Number(row.score_percent) || 0,
    strengths: Array.isArray(row.strengths)
      ? row.strengths.filter((s): s is string => typeof s === 'string')
      : [],
    knowledgeGaps: Array.isArray(row.knowledge_gaps)
      ? row.knowledge_gaps.filter((s): s is string => typeof s === 'string')
      : [],
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function mapXpLedgerRow(row: Record<string, unknown>): XpLedgerEntry {
  const rawType = String(row.event_type ?? 'lesson_completed');
  const eventType: XpEventType =
    rawType === 'knowledge_check_passed' ||
    rawType === 'stage_completed' ||
    rawType === 'path_completed'
      ? rawType
      : 'lesson_completed';

  return {
    id: String(row.id ?? row.event_key ?? ''),
    eventKey: String(row.event_key ?? ''),
    eventType,
    xpAmount: Number(row.xp_amount) || 0,
    title: String(row.title ?? 'Verified Learning Milestone'),
    roadmapId: typeof row.roadmap_id === 'string' ? row.roadmap_id : null,
    stageId: typeof row.stage_id === 'string' ? row.stage_id : null,
    lessonId: typeof row.lesson_id === 'string' ? row.lesson_id : null,
    awardedAt:
      typeof row.awarded_at === 'string' ? row.awarded_at : new Date().toISOString(),
  };
}

function mapPersistedBadgeRow(row: Record<string, unknown>): PersistedAchievementBadgeRow {
  return {
    badgeId: String(row.badge_id ?? ''),
    unlockedAt:
      typeof row.unlocked_at === 'string' ? row.unlocked_at : new Date().toISOString(),
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

async function fetchCanonicalUserProgressSources(
  supabase: SupabaseClient,
  userId: string,
  requestedTimeZone?: string
): Promise<{
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  resolvedTimeZone: string;
}> {
  const [roadmapsRes, kcRes, sessionsRes, assessmentsRes, notifPrefsRes] =
    await Promise.all([
      supabase
        .from('learning_roadmaps')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('lesson_knowledge_checks')
        .select('*')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false }),
      supabase
        .from('learning_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(1000),
      supabase
        .from('assessment_attempts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('notification_preferences')
        .select('timezone')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (roadmapsRes.error && !isMissingSchemaError(roadmapsRes.error)) {
    throw new AchievementApiError(
      roadmapsRes.error.code === '42501' ? 403 : 500,
      roadmapsRes.error.code || 'ROADMAP_LOAD_FAILED',
      'Could not load your learning roadmaps to verify achievements.'
    );
  }

  const roadmaps: LearningRoadmapRecord[] = (roadmapsRes.data ?? []).map((row) =>
    mapRoadmapRow(row as Record<string, unknown>)
  );

  // Merge table knowledge checks + roadmap JSONB fallback attempts cleanly
  const kcByKey = new Map<string, LessonKnowledgeCheckAttemptRecord>();
  if (!kcRes.error && Array.isArray(kcRes.data)) {
    for (const row of kcRes.data) {
      const mapped = mapKnowledgeCheckRow(row as Record<string, unknown>, userId);
      const key = mapped.submissionId || mapped.id;
      if (key && !kcByKey.has(key)) kcByKey.set(key, mapped);
    }
  }
  for (const row of (roadmapsRes.data ?? []) as Array<Record<string, unknown>>) {
    const rmId = String(row.id ?? '');
    const rmData =
      row.roadmap_data && typeof row.roadmap_data === 'object'
        ? (row.roadmap_data as Record<string, unknown>)
        : {};
    const fallbackList = Array.isArray(rmData.knowledgeCheckAttempts)
      ? (rmData.knowledgeCheckAttempts as Array<Record<string, unknown>>)
      : [];
    for (const rawAttempt of fallbackList) {
      const mapped = mapKnowledgeCheckRow(
        { ...rawAttempt, roadmap_id: rawAttempt.roadmapId ?? rmId },
        userId
      );
      const key = mapped.submissionId || mapped.id;
      if (key && !kcByKey.has(key)) kcByKey.set(key, mapped);
    }
  }

  const learningSessions: LearningSessionRecord[] =
    !sessionsRes.error && Array.isArray(sessionsRes.data)
      ? sessionsRes.data.map((row) => mapSessionRow(row as Record<string, unknown>))
      : [];

  const assessmentAttempts: AssessmentAttemptRecord[] =
    !assessmentsRes.error && Array.isArray(assessmentsRes.data)
      ? assessmentsRes.data.map((row) => mapAssessmentRow(row as Record<string, unknown>))
      : [];

  const dbTimeZone =
    !notifPrefsRes.error &&
    notifPrefsRes.data &&
    typeof (notifPrefsRes.data as { timezone?: unknown }).timezone === 'string'
      ? ((notifPrefsRes.data as { timezone: string }).timezone)
      : undefined;

  const resolvedTimeZone = resolveSafeTimeZone(requestedTimeZone || dbTimeZone);

  return {
    roadmaps,
    knowledgeCheckAttempts: Array.from(kcByKey.values()),
    learningSessions,
    assessmentAttempts,
    resolvedTimeZone,
  };
}

async function readPersistedAchievementRows(
  client: SupabaseClient,
  userId: string
): Promise<{
  ledger: XpLedgerEntry[];
  badges: PersistedAchievementBadgeRow[];
  schemaMigrationRequired: boolean;
}> {
  const [ledgerRes, badgesRes] = await Promise.all([
    client
      .from('achievement_xp_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false }),
    client
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false }),
  ]);

  if (
    isMissingSchemaError(ledgerRes.error) ||
    isMissingSchemaError(badgesRes.error)
  ) {
    return { ledger: [], badges: [], schemaMigrationRequired: true };
  }

  if (ledgerRes.error) {
    throw new AchievementApiError(
      ledgerRes.error.code === '42501' ? 403 : 500,
      ledgerRes.error.code || 'ACHIEVEMENT_LEDGER_LOAD_FAILED',
      'Failed to load XP ledger from Supabase.'
    );
  }
  if (badgesRes.error) {
    throw new AchievementApiError(
      badgesRes.error.code === '42501' ? 403 : 500,
      badgesRes.error.code || 'ACHIEVEMENT_BADGES_LOAD_FAILED',
      'Failed to load achievement badges from Supabase.'
    );
  }

  return {
    ledger: (ledgerRes.data ?? []).map((r) => mapXpLedgerRow(r as Record<string, unknown>)),
    badges: (badgesRes.data ?? []).map((r) =>
      mapPersistedBadgeRow(r as Record<string, unknown>)
    ),
    schemaMigrationRequired: false,
  };
}

export async function handleSyncUserAchievements(params: {
  authorizationHeader?: string;
  timeZone?: string;
}): Promise<AchievementSummaryPayload> {
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  const sources = await fetchCanonicalUserProgressSources(
    supabase,
    userId,
    params.timeZone
  );

  // Check existing persisted state first so we accurately detect newly awarded XP/badges
  const beforePersisted = await readPersistedAchievementRows(supabase, userId);
  let schemaMigrationRequired = beforePersisted.schemaMigrationRequired;
  let persistedInDatabase = !schemaMigrationRequired;

  let persistedLedger = beforePersisted.ledger;
  let persistedBadges = beforePersisted.badges;

  if (!schemaMigrationRequired) {
    const serviceClient = createServiceRoleClient();

    if (serviceClient) {
      // Trusted server-side service-role write path
      const preEval = evaluateVerifiedAchievements({
        roadmaps: sources.roadmaps,
        knowledgeCheckAttempts: sources.knowledgeCheckAttempts,
        learningSessions: sources.learningSessions,
        assessmentAttempts: sources.assessmentAttempts,
        persistedLedger: beforePersisted.ledger,
        persistedBadges: beforePersisted.badges,
        timeZone: sources.resolvedTimeZone,
      });

      if (preEval.newlyEligibleEvents.length > 0) {
        const ledgerRowsToInsert = preEval.newlyEligibleEvents.map((evt) => ({
          user_id: userId,
          event_key: evt.eventKey,
          event_type: evt.eventType,
          xp_amount: evt.xpAmount,
          title: evt.title,
          roadmap_id: evt.roadmapId ?? null,
          stage_id: evt.stageId ?? null,
          lesson_id: evt.lessonId ?? null,
          awarded_at: evt.awardedAt,
        }));
        const { error: upsertLedgerErr } = await serviceClient
          .from('achievement_xp_ledger')
          .upsert(ledgerRowsToInsert, {
            onConflict: 'user_id,event_key',
            ignoreDuplicates: true,
          });
        if (upsertLedgerErr) {
          if (isMissingSchemaError(upsertLedgerErr)) {
            schemaMigrationRequired = true;
            persistedInDatabase = false;
          } else {
            throw new AchievementApiError(
              500,
              upsertLedgerErr.code || 'ACHIEVEMENT_LEDGER_PERSIST_FAILED',
              'Failed to persist verified XP events.'
            );
          }
        }
      }

      if (!schemaMigrationRequired && preEval.newlyUnlockedBadges.length > 0) {
        const badgeRowsToInsert = preEval.newlyUnlockedBadges.map((b) => ({
          user_id: userId,
          badge_id: b.badgeId,
          unlocked_at: b.unlockedAt,
          metadata: b.metadata,
        }));
        const { error: upsertBadgeErr } = await serviceClient
          .from('user_achievements')
          .upsert(badgeRowsToInsert, {
            onConflict: 'user_id,badge_id',
            ignoreDuplicates: true,
          });
        if (upsertBadgeErr) {
          if (isMissingSchemaError(upsertBadgeErr)) {
            schemaMigrationRequired = true;
            persistedInDatabase = false;
          } else {
            throw new AchievementApiError(
              500,
              upsertBadgeErr.code || 'ACHIEVEMENT_BADGES_PERSIST_FAILED',
              'Failed to persist unlocked achievement badges.'
            );
          }
        }
      }
    } else {
      // Trusted DB-side SECURITY DEFINER reconciliation (accepts zero client XP/badge parameters)
      const { error: rpcError } = await supabase.rpc('sync_verified_user_achievements', {
        p_timezone: sources.resolvedTimeZone,
      });

      if (rpcError) {
        if (isMissingSchemaError(rpcError)) {
          schemaMigrationRequired = true;
          persistedInDatabase = false;
        } else {
          console.warn(
            '[Skillora][Achievements] sync_verified_user_achievements RPC warning:',
            rpcError.message
          );
          persistedInDatabase = false;
        }
      }
    }

    if (!schemaMigrationRequired && persistedInDatabase) {
      const afterPersisted = await readPersistedAchievementRows(supabase, userId);
      persistedLedger = afterPersisted.ledger;
      persistedBadges = afterPersisted.badges;
    }
  }

  const finalEval = evaluateVerifiedAchievements({
    roadmaps: sources.roadmaps,
    knowledgeCheckAttempts: sources.knowledgeCheckAttempts,
    learningSessions: sources.learningSessions,
    assessmentAttempts: sources.assessmentAttempts,
    persistedLedger,
    persistedBadges,
    timeZone: sources.resolvedTimeZone,
  });

  const beforeKeys = new Set(beforePersisted.ledger.map((e) => e.eventKey));
  const beforeBadgeIds = new Set(beforePersisted.badges.map((b) => b.badgeId));

  const newlyAwardedEvents = persistedInDatabase
    ? persistedLedger.filter((e) => !beforeKeys.has(e.eventKey))
    : [];
  const newlyAwardedXp = newlyAwardedEvents.reduce((sum, e) => sum + e.xpAmount, 0);

  const newlyUnlockedBadgeIds: AchievementBadgeId[] = persistedInDatabase
    ? (persistedBadges
        .filter((b) => !beforeBadgeIds.has(b.badgeId))
        .map((b) => b.badgeId) as AchievementBadgeId[])
    : [];

  return {
    authenticated: true,
    persistedInDatabase,
    schemaMigrationRequired,
    ...finalEval.summary,
    newlyAwardedXp,
    newlyUnlockedBadgeIds,
  };
}
