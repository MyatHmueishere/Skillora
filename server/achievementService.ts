import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AchievementBadgeId,
  AchievementSummaryPayload,
  CertificatePublicNameVisibility,
  CertificateStatus,
  CertificateTemplateId,
  CertificateType,
  defaultTemplateForCertificateType,
  evaluateVerifiedAchievements,
  formatCertificateTypeLabel,
  IssuedCertificateRecord,
  maskStudentNameForPrivacy,
  PersistedAchievementBadgeRow,
  PublicCertificateVerificationResult,
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

const PHASE8_BADGE_IDS = new Set<string>([
  'first_step',
  'knowledge_seeker',
  'consistent_learner',
  'stage_master',
  'path_finisher',
  'skill_assessor',
]);

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

function createAnonPublicClient(): SupabaseClient {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new AchievementApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase configuration is missing on the server.'
    );
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
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
  authFullName: string;
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
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const authFullName =
    typeof meta.full_name === 'string' && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta.name === 'string' && meta.name.trim()
      ? meta.name.trim()
      : '';
  return { userId: data.user.id, authFullName, supabase };
}

function isMissingSchemaError(err?: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = (err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('could not find the') ||
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
    direction: typeof row.direction === 'string' && row.direction.trim() ? row.direction.trim() : null,
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

function mapCertificateRow(row: Record<string, unknown>): IssuedCertificateRecord {
  const rawType = String(row.certificate_type ?? 'course_completion');
  const certificateType: CertificateType =
    rawType === 'path_completion' || rawType === 'excellence'
      ? rawType
      : 'course_completion';

  const rawTemplate = String(row.template_id ?? '');
  const templateId: CertificateTemplateId =
    rawTemplate === 'classic_academic' ||
    rawTemplate === 'modern_professional' ||
    rawTemplate === 'excellence_award'
      ? rawTemplate
      : defaultTemplateForCertificateType(certificateType);

  const publicNameVisibility: CertificatePublicNameVisibility =
    row.public_name_visibility === 'initials' ? 'initials' : 'full_name';

  const status: CertificateStatus = row.status === 'revoked' ? 'revoked' : 'valid';

  return {
    id: String(row.id ?? row.certificate_key ?? ''),
    certificateNumber: String(row.certificate_number ?? ''),
    certificateKey: String(row.certificate_key ?? ''),
    certificateType,
    certificateTypeLabel: formatCertificateTypeLabel(certificateType),
    title: String(row.title ?? 'Skillora Certificate'),
    direction: String(row.direction ?? 'General Learning'),
    studentName: String(row.student_name ?? 'Skillora Learner'),
    roadmapId: typeof row.roadmap_id === 'string' ? row.roadmap_id : null,
    stageId: typeof row.stage_id === 'string' ? row.stage_id : null,
    templateId,
    publicNameVisibility,
    issuerName: typeof row.issuer_name === 'string' ? row.issuer_name : 'Skillora',
    issuerDesignation:
      typeof row.issuer_designation === 'string'
        ? row.issuer_designation
        : 'Academic & Curriculum Verification Board',
    status,
    completionDate:
      typeof row.completion_date === 'string' ? row.completion_date : new Date().toISOString(),
    issuedAt: typeof row.issued_at === 'string' ? row.issued_at : new Date().toISOString(),
    verificationDigest: typeof row.verification_digest === 'string' ? row.verification_digest : '',
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

async function fetchCanonicalUserProgressSources(
  supabase: SupabaseClient,
  userId: string,
  authFullName: string,
  requestedTimeZone?: string
): Promise<{
  studentName: string;
  activeDirection: string;
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  resolvedTimeZone: string;
}> {
  const [roadmapsRes, kcRes, sessionsRes, assessmentsRes, notifPrefsRes, profileRes] =
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
      supabase
        .from('student_profiles')
        .select('*')
        .eq('id', userId)
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
      ? (notifPrefsRes.data as { timezone: string }).timezone
      : undefined;

  const profileRow =
    !profileRes.error && profileRes.data
      ? (profileRes.data as {
          full_name?: unknown;
          name?: unknown;
          primary_direction?: unknown;
          career_goal?: unknown;
        })
      : null;

  const profileName =
    profileRow && typeof profileRow.full_name === 'string' && profileRow.full_name.trim()
      ? profileRow.full_name.trim()
      : profileRow && typeof profileRow.name === 'string' && profileRow.name.trim()
      ? profileRow.name.trim()
      : '';
  const studentName = profileName || authFullName || 'Skillora Learner';

  const activeDirection =
    (profileRow && typeof profileRow.primary_direction === 'string'
      ? profileRow.primary_direction.trim()
      : '') ||
    (profileRow && typeof profileRow.career_goal === 'string'
      ? profileRow.career_goal.trim()
      : '');

  const resolvedTimeZone = resolveSafeTimeZone(requestedTimeZone || dbTimeZone);

  return {
    studentName,
    activeDirection,
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
  certificates: IssuedCertificateRecord[];
  schemaMigrationRequired: boolean;
  certificatesSchemaMigrationRequired: boolean;
}> {
  const [ledgerRes, badgesRes, certsRes] = await Promise.all([
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
    client
      .from('certificates')
      .select('*')
      .eq('user_id', userId)
      .order('issued_at', { ascending: false }),
  ]);

  if (
    isMissingSchemaError(ledgerRes.error) ||
    isMissingSchemaError(badgesRes.error)
  ) {
    return {
      ledger: [],
      badges: [],
      certificates: [],
      schemaMigrationRequired: true,
      certificatesSchemaMigrationRequired: true,
    };
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

  const certificatesSchemaMigrationRequired = isMissingSchemaError(certsRes.error);
  if (certsRes.error && !certificatesSchemaMigrationRequired) {
    throw new AchievementApiError(
      certsRes.error.code === '42501' ? 403 : 500,
      certsRes.error.code || 'CERTIFICATES_LOAD_FAILED',
      'Failed to load certificates from Supabase.'
    );
  }

  return {
    ledger: (ledgerRes.data ?? []).map((r) => mapXpLedgerRow(r as Record<string, unknown>)),
    badges: (badgesRes.data ?? []).map((r) =>
      mapPersistedBadgeRow(r as Record<string, unknown>)
    ),
    certificates: certificatesSchemaMigrationRequired
      ? []
      : (certsRes.data ?? []).map((r) => mapCertificateRow(r as Record<string, unknown>)),
    schemaMigrationRequired: false,
    certificatesSchemaMigrationRequired,
  };
}

export async function handleSyncUserAchievements(params: {
  authorizationHeader?: string;
  timeZone?: string;
}): Promise<AchievementSummaryPayload> {
  const { userId, authFullName, supabase } = await authenticateBearerRequest(
    params.authorizationHeader
  );
  const sources = await fetchCanonicalUserProgressSources(
    supabase,
    userId,
    authFullName,
    params.timeZone
  );

  // Check existing persisted state first so we accurately detect newly awarded XP/badges/certificates
  const beforePersisted = await readPersistedAchievementRows(supabase, userId);
  let schemaMigrationRequired = beforePersisted.schemaMigrationRequired;
  let certificatesSchemaMigrationRequired =
    beforePersisted.certificatesSchemaMigrationRequired;
  let persistedInDatabase = !schemaMigrationRequired;

  let persistedLedger = beforePersisted.ledger;
  let persistedBadges = beforePersisted.badges;
  let persistedCertificates = beforePersisted.certificates;

  if (!schemaMigrationRequired) {
    const serviceClient = createServiceRoleClient();

    if (serviceClient) {
      const preEval = evaluateVerifiedAchievements({
        userId,
        studentName: sources.studentName,
        activeDirection: sources.activeDirection,
        roadmaps: sources.roadmaps,
        knowledgeCheckAttempts: sources.knowledgeCheckAttempts,
        learningSessions: sources.learningSessions,
        assessmentAttempts: sources.assessmentAttempts,
        persistedLedger: beforePersisted.ledger,
        persistedBadges: beforePersisted.badges,
        persistedCertificates: beforePersisted.certificates,
        timeZone: sources.resolvedTimeZone,
      });

      if (preEval.newlyEligibleEvents.length > 0) {
        const ledgerRowsWithDir = preEval.newlyEligibleEvents.map((evt) => ({
          user_id: userId,
          event_key: evt.eventKey,
          event_type: evt.eventType,
          xp_amount: evt.xpAmount,
          title: evt.title,
          direction: evt.direction || 'General Learning',
          roadmap_id: evt.roadmapId ?? null,
          stage_id: evt.stageId ?? null,
          lesson_id: evt.lessonId ?? null,
          awarded_at: evt.awardedAt,
        }));
        let { error: upsertLedgerErr } = await serviceClient
          .from('achievement_xp_ledger')
          .upsert(ledgerRowsWithDir, {
            onConflict: 'user_id,event_key',
            ignoreDuplicates: true,
          });

        // Graceful fallback if Phase 9 `direction` column hasn't been added yet
        if (upsertLedgerErr && isMissingSchemaError(upsertLedgerErr)) {
          certificatesSchemaMigrationRequired = true;
          const legacyRows = preEval.newlyEligibleEvents.map((evt) => ({
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
          const retry = await serviceClient
            .from('achievement_xp_ledger')
            .upsert(legacyRows, {
              onConflict: 'user_id,event_key',
              ignoreDuplicates: true,
            });
          upsertLedgerErr = retry.error;
        }

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
        let { error: upsertBadgeErr } = await serviceClient
          .from('user_achievements')
          .upsert(badgeRowsToInsert, {
            onConflict: 'user_id,badge_id',
            ignoreDuplicates: true,
          });

        // Graceful fallback if Phase 9 CHECK constraint hasn't been expanded yet
        if (upsertBadgeErr && upsertBadgeErr.code === '23514') {
          certificatesSchemaMigrationRequired = true;
          const legacyBadges = badgeRowsToInsert.filter((b) =>
            PHASE8_BADGE_IDS.has(b.badge_id)
          );
          if (legacyBadges.length > 0) {
            const retry = await serviceClient
              .from('user_achievements')
              .upsert(legacyBadges, {
                onConflict: 'user_id,badge_id',
                ignoreDuplicates: true,
              });
            upsertBadgeErr = retry.error;
          } else {
            upsertBadgeErr = null;
          }
        }

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

      if (
        !schemaMigrationRequired &&
        !certificatesSchemaMigrationRequired &&
        preEval.newlyEligibleCertificates.length > 0
      ) {
        const certRowsToInsert = preEval.newlyEligibleCertificates.map((c) => ({
          user_id: userId,
          certificate_number: c.certificateNumber,
          certificate_key: c.certificateKey,
          certificate_type: c.certificateType,
          title: c.title,
          direction: c.direction,
          student_name: c.studentName,
          roadmap_id: c.roadmapId,
          stage_id: c.stageId,
          template_id: c.templateId,
          public_name_visibility: c.publicNameVisibility,
          issuer_name: c.issuerName,
          issuer_designation: c.issuerDesignation,
          status: c.status,
          completion_date: c.completionDate,
          issued_at: c.issuedAt,
          verification_digest: c.verificationDigest,
          metadata: c.metadata ?? {},
        }));
        const { error: upsertCertErr } = await serviceClient
          .from('certificates')
          .upsert(certRowsToInsert, {
            onConflict: 'user_id,certificate_key',
            ignoreDuplicates: true,
          });

        if (upsertCertErr) {
          if (isMissingSchemaError(upsertCertErr)) {
            certificatesSchemaMigrationRequired = true;
          } else {
            throw new AchievementApiError(
              500,
              upsertCertErr.code || 'CERTIFICATES_PERSIST_FAILED',
              'Failed to persist issued certificates.'
            );
          }
        }
      }
    } else {
      // Trusted DB-side SECURITY DEFINER reconciliation
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
      persistedCertificates = afterPersisted.certificates;
      certificatesSchemaMigrationRequired =
        certificatesSchemaMigrationRequired ||
        afterPersisted.certificatesSchemaMigrationRequired;
    }
  }

  const finalEval = evaluateVerifiedAchievements({
    userId,
    studentName: sources.studentName,
    activeDirection: sources.activeDirection,
    roadmaps: sources.roadmaps,
    knowledgeCheckAttempts: sources.knowledgeCheckAttempts,
    learningSessions: sources.learningSessions,
    assessmentAttempts: sources.assessmentAttempts,
    persistedLedger,
    persistedBadges,
    persistedCertificates,
    timeZone: sources.resolvedTimeZone,
  });

  const beforeKeys = new Set(beforePersisted.ledger.map((e) => e.eventKey));
  const beforeBadgeIds = new Set(beforePersisted.badges.map((b) => b.badgeId));
  const beforeCertKeys = new Set(beforePersisted.certificates.map((c) => c.certificateKey));

  const newlyAwardedEvents = persistedInDatabase
    ? persistedLedger.filter((e) => !beforeKeys.has(e.eventKey))
    : [];
  const newlyAwardedXp = newlyAwardedEvents.reduce((sum, e) => sum + e.xpAmount, 0);

  const newlyUnlockedBadgeIds: AchievementBadgeId[] = persistedInDatabase
    ? (persistedBadges
        .filter((b) => !beforeBadgeIds.has(b.badgeId))
        .map((b) => b.badgeId) as AchievementBadgeId[])
    : [];

  const newlyIssuedCertificateIds: string[] =
    persistedInDatabase && !certificatesSchemaMigrationRequired
      ? persistedCertificates
          .filter((c) => !beforeCertKeys.has(c.certificateKey))
          .map((c) => c.id)
      : [];

  return {
    authenticated: true,
    persistedInDatabase,
    schemaMigrationRequired,
    certificatesSchemaMigrationRequired,
    ...finalEval.summary,
    newlyAwardedXp,
    newlyUnlockedBadgeIds,
    newlyIssuedCertificateIds,
  };
}

export async function handleVerifyCertificatePublic(
  rawCertificateNumber: string
): Promise<PublicCertificateVerificationResult> {
  const cleaned = rawCertificateNumber.trim().toUpperCase();
  if (!cleaned) {
    return {
      found: false,
      authentic: false,
      certificateNumber: '',
    };
  }

  const serviceClient = createServiceRoleClient();
  if (serviceClient) {
    const { data, error } = await serviceClient
      .from('certificates')
      .select(
        'certificate_number, certificate_type, title, direction, student_name, public_name_visibility, issuer_name, issuer_designation, status, completion_date, issued_at, verification_digest'
      )
      .ilike('certificate_number', cleaned)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        return {
          found: false,
          authentic: false,
          certificateNumber: cleaned,
        };
      }
      throw new AchievementApiError(
        500,
        error.code || 'CERTIFICATE_VERIFY_FAILED',
        'Could not verify certificate ID.'
      );
    }

    if (!data) {
      return {
        found: false,
        authentic: false,
        certificateNumber: cleaned,
      };
    }

    const row = data as Record<string, unknown>;
    const certType: CertificateType =
      row.certificate_type === 'path_completion' || row.certificate_type === 'excellence'
        ? row.certificate_type
        : 'course_completion';
    const privacyMode: CertificatePublicNameVisibility =
      row.public_name_visibility === 'initials' ? 'initials' : 'full_name';
    const status: CertificateStatus = row.status === 'revoked' ? 'revoked' : 'valid';

    return {
      found: true,
      authentic: status === 'valid',
      certificateNumber: String(row.certificate_number ?? cleaned),
      certificateType: certType,
      certificateTypeLabel: formatCertificateTypeLabel(certType),
      title: String(row.title ?? 'Skillora Certificate'),
      direction: String(row.direction ?? 'General Learning'),
      studentDisplayName: maskStudentNameForPrivacy(
        String(row.student_name ?? 'Skillora Learner'),
        privacyMode
      ),
      privacyMode,
      issuedAt: typeof row.issued_at === 'string' ? row.issued_at : undefined,
      completionDate:
        typeof row.completion_date === 'string' ? row.completion_date : undefined,
      status,
      issuerName: typeof row.issuer_name === 'string' ? row.issuer_name : 'Skillora',
      issuerDesignation:
        typeof row.issuer_designation === 'string'
          ? row.issuer_designation
          : 'Academic & Curriculum Verification Board',
      verificationDigest:
        typeof row.verification_digest === 'string' ? row.verification_digest : undefined,
    };
  }

  // Fallback to SECURITY DEFINER public verification RPC
  const anon = createAnonPublicClient();
  const { data, error } = await anon.rpc('verify_certificate_public', {
    p_certificate_number: cleaned,
  });

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        found: false,
        authentic: false,
        certificateNumber: cleaned,
      };
    }
    throw new AchievementApiError(
      500,
      error.code || 'CERTIFICATE_VERIFY_RPC_FAILED',
      'Could not verify certificate ID.'
    );
  }

  if (!data || typeof data !== 'object') {
    return {
      found: false,
      authentic: false,
      certificateNumber: cleaned,
    };
  }

  return data as PublicCertificateVerificationResult;
}

export async function handleUpdateCertificatePreferences(params: {
  authorizationHeader?: string;
  certificateId: string;
  templateId?: CertificateTemplateId;
  publicNameVisibility?: CertificatePublicNameVisibility;
}): Promise<IssuedCertificateRecord> {
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  const certificateId = params.certificateId.trim();
  if (!certificateId) {
    throw new AchievementApiError(400, 'INVALID_CERTIFICATE_ID', 'Certificate ID is required.');
  }

  if (
    params.templateId !== undefined &&
    params.templateId !== 'classic_academic' &&
    params.templateId !== 'modern_professional' &&
    params.templateId !== 'excellence_award'
  ) {
    throw new AchievementApiError(400, 'INVALID_TEMPLATE', 'Unsupported certificate template.');
  }

  if (
    params.publicNameVisibility !== undefined &&
    params.publicNameVisibility !== 'full_name' &&
    params.publicNameVisibility !== 'initials'
  ) {
    throw new AchievementApiError(
      400,
      'INVALID_PRIVACY_MODE',
      'Unsupported privacy visibility setting.'
    );
  }

  const serviceClient = createServiceRoleClient();
  if (serviceClient) {
    const updates: Record<string, string> = {};
    if (params.templateId) updates.template_id = params.templateId;
    if (params.publicNameVisibility) {
      updates.public_name_visibility = params.publicNameVisibility;
    }

    const { data, error } = await serviceClient
      .from('certificates')
      .update(updates)
      .eq('id', certificateId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        throw new AchievementApiError(
          409,
          'CERTIFICATES_MIGRATION_REQUIRED',
          'Run the Phase 9 certificates migration in Supabase to save display preferences.'
        );
      }
      throw new AchievementApiError(
        500,
        error.code || 'CERTIFICATE_PREFS_UPDATE_FAILED',
        'Could not update certificate display preferences.'
      );
    }

    if (!data) {
      throw new AchievementApiError(
        404,
        'CERTIFICATE_NOT_FOUND',
        'Certificate not found or you do not have permission to update it.'
      );
    }

    return mapCertificateRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase.rpc('update_certificate_display_preferences', {
    p_certificate_id: certificateId,
    p_template_id: params.templateId ?? null,
    p_public_name_visibility: params.publicNameVisibility ?? null,
  });

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new AchievementApiError(
        409,
        'CERTIFICATES_MIGRATION_REQUIRED',
        'Run the Phase 9 certificates migration in Supabase to save display preferences.'
      );
    }
    throw new AchievementApiError(
      400,
      error.code || 'CERTIFICATE_PREFS_UPDATE_FAILED',
      error.message || 'Could not update certificate display preferences.'
    );
  }

  return mapCertificateRow(data as Record<string, unknown>);
}
