import crypto from 'crypto';
import { Content, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  buildExploreResourcesForContext,
  ExploreResourceResponseItem,
} from './exploreResourcesService';
import {
  containsWholeTerm,
  ExploreResourceCatalogEntry,
  getExploreResourceCatalog,
  tokenize,
} from './verifiedResources';

export interface AssistantRecommendedResource {
  id: string;
  title: string;
  provider: string;
  type: string;
  tabCategory: 'video' | 'documentation' | 'course';
  subjectLabel: string;
  url: string;
}

export interface AssistantConversationRecord {
  id: string;
  title: string;
  activeRoadmapId?: string | null;
  activeStageId?: string | null;
  activeLessonId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessageRecord {
  id: string;
  conversationId: string;
  sender: 'user' | 'assistant';
  text: string;
  createdAt: string;
  codeSnippet?: string;
  language?: string;
  recommendedResources?: AssistantRecommendedResource[];
  suggestedFollowUps?: string[];
}

export interface AssistantLessonContextInput {
  roadmapId?: string;
  stageId?: string;
  lessonId?: string;
}

export interface AssistantHistoryTurnInput {
  sender: 'user' | 'assistant';
  text: string;
}

export interface AuthenticatedStudentContext {
  userId: string;
  supabase: SupabaseClient;
  studentName: string;
  educationLevel: string;
  fieldOfStudy: string;
  primaryDirection: string;
  careerGoal: string;
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  currentSkills: string[];
  learningInterests: string[];
  preferredHoursPerDay: number;
  activeRoadmapId: string | null;
  activeRoadmapTitle: string | null;
  activeRoadmapCareerGoal: string | null;
  activeRoadmapData: Record<string, unknown> | null;
  roadmapProgressPercent: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  stagesSummary: {
    id: string;
    title: string;
    difficulty: string;
    completedCount: number;
    totalCount: number;
  }[];
  isExplicitStudyLesson: boolean;
  currentLesson: {
    roadmapId: string;
    stageId: string;
    stageTitle: string;
    lessonId: string;
    lessonTitle: string;
    lessonDescription: string;
    learningObjectives: string[];
    completed: boolean;
  } | null;
  attemptSummaries: {
    subject: string;
    difficulty: string;
    scorePercent: number;
    strengths: string[];
    gaps: string[];
    createdAt: string;
  }[];
  knowledgeCheckSummaries: {
    lessonId: string;
    lessonTitle: string;
    score: number;
    knowledgeGaps: string[];
    actionType: string;
    completedAt: string;
  }[];
  allKnowledgeGaps: string[];
  personalizedResources: ExploreResourceResponseItem[];
}

export class AssistantApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AssistantApiError';
    this.status = status;
    this.code = code;
  }
}

const chatHistoryByUser = new Map<string, number[]>();
const CHAT_COOLDOWN_MS = 2_500;
const CHAT_WINDOW_MS = 10 * 60_000;
const MAX_CHAT_PER_WINDOW = 30;
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_TURNS = 12;

function enforceSlidingRateLimit(userId: string) {
  const now = Date.now();
  const timestamps = (chatHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < CHAT_WINDOW_MS
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < CHAT_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((CHAT_COOLDOWN_MS - (now - lastTs)) / 1000);
    throw new AssistantApiError(
      429,
      'RATE_LIMITED_COOLDOWN',
      `Please wait ${waitSeconds}s before sending another message.`
    );
  }
  if (timestamps.length >= MAX_CHAT_PER_WINDOW) {
    throw new AssistantApiError(
      429,
      'RATE_LIMITED_WINDOW',
      'You have sent many messages recently. Please wait a few minutes before continuing.'
    );
  }
  chatHistoryByUser.set(userId, timestamps);
}

function recordChatUsage(userId: string) {
  const now = Date.now();
  const timestamps = (chatHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < CHAT_WINDOW_MS
  );
  timestamps.push(now);
  chatHistoryByUser.set(userId, timestamps);
}

function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new AssistantApiError(
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

const AUTH_TIMEOUT_MS = 6_000;
const PERSONALIZATION_QUERY_TIMEOUT_MS = 3_500;
const PERSISTENCE_TIMEOUT_MS = 5_000;
const GEMINI_HTTP_TIMEOUT_MS = 45_000;

const PRIMARY_GEMINI_MODEL = 'gemini-4-hydrogen';
const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const PRIMARY_STREAM_FIRST_TOKEN_TIMEOUT_MS = 8_500;
const FALLBACK_STREAM_FIRST_TOKEN_TIMEOUT_MS = 18_000;
const PRIMARY_JSON_TIMEOUT_MS = 12_000;
const FALLBACK_JSON_TIMEOUT_MS = 22_000;
const STREAM_IDLE_TIMEOUT_MS = 25_000;
const STREAM_MAX_TOTAL_MS = 55_000;
const JSON_MAX_TOTAL_MS = 40_000;

// Shared upstream circuit breaker for the primary model so degraded upstream latency
// does not stall every student account simultaneously.
const PRIMARY_CIRCUIT_COOLDOWN_MS = 120_000;
let primaryCircuitOpenUntil = 0;
let primaryCircuitReason = '';
let halfOpenProbeInFlight = false;

// Concurrency guards: isolate per-user bursts and bound global parallel AI calls safely.
const MAX_CONCURRENT_PER_USER = 2;
const MAX_CONCURRENT_GLOBAL_AI = 16;
const GLOBAL_QUEUE_WAIT_MS = 3_500;
const activeRequestsByUser = new Map<string, number>();
let activeGlobalAiCalls = 0;
const globalAiWaiters: Array<() => void> = [];

function createRequestId(provided?: string): string {
  const clean = provided?.trim();
  if (clean && /^[a-zA-Z0-9_-]{6,40}$/.test(clean)) return clean;
  return `req_${crypto.randomUUID().slice(0, 8)}`;
}

function acquireUserConcurrencySlot(userId: string) {
  const current = activeRequestsByUser.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_PER_USER) {
    throw new AssistantApiError(
      429,
      'CONCURRENT_REQUEST_LIMIT',
      'Your previous question is still finishing. Please wait a moment before sending another.'
    );
  }
  activeRequestsByUser.set(userId, current + 1);
  return () => {
    const next = (activeRequestsByUser.get(userId) ?? 1) - 1;
    if (next <= 0) activeRequestsByUser.delete(userId);
    else activeRequestsByUser.set(userId, next);
  };
}

async function acquireGlobalAiSlot(signal?: AbortSignal): Promise<() => void> {
  if (activeGlobalAiCalls < MAX_CONCURRENT_GLOBAL_AI) {
    activeGlobalAiCalls += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeGlobalAiCalls = Math.max(0, activeGlobalAiCalls - 1);
      const next = globalAiWaiters.shift();
      if (next) next();
    };
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const onWake = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (activeGlobalAiCalls < MAX_CONCURRENT_GLOBAL_AI) {
        activeGlobalAiCalls += 1;
        resolve();
      } else {
        reject(
          new AssistantApiError(
            503,
            'AI_CAPACITY_BUSY',
            'The AI Study Companion is handling high demand right now. Please retry in a few seconds.'
          )
        );
      }
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const idx = globalAiWaiters.indexOf(onWake);
      if (idx !== -1) globalAiWaiters.splice(idx, 1);
      reject(new AssistantApiError(499, 'CLIENT_ABORTED', 'Request was cancelled.'));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      const idx = globalAiWaiters.indexOf(onWake);
      if (idx !== -1) globalAiWaiters.splice(idx, 1);
      reject(
        new AssistantApiError(
          503,
          'AI_CAPACITY_BUSY',
          'The AI Study Companion is handling high demand right now. Please retry in a few seconds.'
        )
      );
    }, GLOBAL_QUEUE_WAIT_MS);

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    globalAiWaiters.push(onWake);
  });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeGlobalAiCalls = Math.max(0, activeGlobalAiCalls - 1);
    const next = globalAiWaiters.shift();
    if (next) next();
  };
}

function shouldTryPrimaryModel(): { usePrimary: boolean; isHalfOpenProbe: boolean } {
  const now = Date.now();
  if (now < primaryCircuitOpenUntil) {
    return { usePrimary: false, isHalfOpenProbe: false };
  }
  if (primaryCircuitOpenUntil > 0) {
    if (halfOpenProbeInFlight) {
      return { usePrimary: false, isHalfOpenProbe: false };
    }
    halfOpenProbeInFlight = true;
    return { usePrimary: true, isHalfOpenProbe: true };
  }
  return { usePrimary: true, isHalfOpenProbe: false };
}

export function recordPrimarySuccess(wasHalfOpenProbe: boolean) {
  if (wasHalfOpenProbe) {
    halfOpenProbeInFlight = false;
  }
  primaryCircuitOpenUntil = 0;
  primaryCircuitReason = '';
}

export function recordPrimaryFailure(reason: string, wasHalfOpenProbe: boolean) {
  if (wasHalfOpenProbe) {
    halfOpenProbeInFlight = false;
  }
  primaryCircuitOpenUntil = Date.now() + PRIMARY_CIRCUIT_COOLDOWN_MS;
  primaryCircuitReason = reason.slice(0, 80);
  console.warn(
    `[Skillora][Assistant] Circuit opened for ${PRIMARY_GEMINI_MODEL} (${PRIMARY_CIRCUIT_COOLDOWN_MS}ms, reason=${primaryCircuitReason}); routing to ${FALLBACK_GEMINI_MODEL}.`
  );
}

export function getGeminiCircuitDiagnostics() {
  return {
    primaryModel: PRIMARY_GEMINI_MODEL,
    fallbackModel: FALLBACK_GEMINI_MODEL,
    circuitOpen: Date.now() < primaryCircuitOpenUntil,
    cooldownRemainingMs: Math.max(0, primaryCircuitOpenUntil - Date.now()),
    lastReason: primaryCircuitReason || null,
    activeGlobalAiCalls,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
  timeoutMessage: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new AssistantApiError(504, timeoutCode, timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function settledWithinBudget<T, F = T>(
  promiseLike: PromiseLike<T>,
  timeoutMs: number,
  fallbackValue: F
): Promise<T | F> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promiseLike).catch(() => fallbackValue),
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let cachedGeminiKeyHash = '';
let cachedGeminiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AssistantApiError(
      503,
      'GEMINI_KEY_MISSING',
      'AI Learning Assistant is unavailable because GEMINI_API_KEY is not configured on the server.'
    );
  }
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  if (!cachedGeminiClient || cachedGeminiKeyHash !== keyHash) {
    cachedGeminiKeyHash = keyHash;
    cachedGeminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        timeout: GEMINI_HTTP_TIMEOUT_MS,
      },
    });
  }
  return cachedGeminiClient;
}

function isPermanentGeminiError(err: unknown): boolean {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();
  return (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('403') ||
    lower.includes('invalid_argument')
  );
}

export function isTransientOrFallbackEligibleError(err: unknown): boolean {
  if (isPermanentGeminiError(err)) return false;
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('404') ||
    lower.includes('not_found') ||
    lower.includes('internal') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('aborterror') ||
    lower.includes('aborted')
  );
}

function computeExponentialBackoffMs(attemptIndex: number): number {
  const base = Math.min(2_400, 600 * Math.pow(2, Math.max(0, attemptIndex - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export function classifyGeminiErrorCategory(err: unknown): string {
  if (err instanceof AssistantApiError) return err.code;
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) return 'GEMINI_CONFIG_ERROR';
  if (lower.includes('permission_denied') || lower.includes('403')) return 'GEMINI_PERMISSION_DENIED';
  if (lower.includes('resource_exhausted') || lower.includes('429')) return 'GEMINI_QUOTA_EXCEEDED';
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) return 'GEMINI_HIGH_DEMAND';
  if (lower.includes('deadline_exceeded') || lower.includes('timeout') || lower.includes('etimedout') || lower.includes('abort')) return 'GEMINI_TIMEOUT';
  if (lower.includes('500') || lower.includes('502') || lower.includes('504')) return 'GEMINI_UPSTREAM_5XX';
  if (lower.includes('not_found') || lower.includes('404')) return 'GEMINI_MODEL_UNAVAILABLE';
  if (lower.includes('fetch failed') || lower.includes('econnreset') || lower.includes('enotfound') || lower.includes('network')) return 'GEMINI_NETWORK_ERROR';
  return 'GEMINI_CHAT_FAILED';
}

export function mapGeminiError(err: unknown): AssistantApiError {
  if (err instanceof AssistantApiError) return err;

  const category = classifyGeminiErrorCategory(err);

  switch (category) {
    case 'GEMINI_TIMEOUT':
      return new AssistantApiError(
        504,
        category,
        'The AI Study Companion took too long to respond. Please retry.'
      );
    case 'GEMINI_CONFIG_ERROR':
      return new AssistantApiError(
        502,
        category,
        'The AI service key is invalid. Please check GEMINI_API_KEY in Settings > Secrets.'
      );
    case 'GEMINI_PERMISSION_DENIED':
      return new AssistantApiError(
        502,
        category,
        'AI Study Companion request could not be authorized. Please verify GEMINI_API_KEY in Settings > Secrets.'
      );
    case 'GEMINI_QUOTA_EXCEEDED':
      return new AssistantApiError(
        429,
        category,
        'The AI Study Companion is temporarily busy due to quota limits. Please wait a moment and try again.'
      );
    case 'GEMINI_HIGH_DEMAND':
    case 'GEMINI_UPSTREAM_5XX':
      return new AssistantApiError(
        503,
        category,
        'The AI Study Companion is experiencing temporary high demand. Please retry in a few seconds.'
      );
    case 'GEMINI_MODEL_UNAVAILABLE':
      return new AssistantApiError(
        502,
        category,
        'The configured AI model is currently unavailable. Please try again shortly.'
      );
    case 'GEMINI_NETWORK_ERROR':
      return new AssistantApiError(
        503,
        category,
        'Temporary network issue reaching the AI service. Please retry.'
      );
    default:
      return new AssistantApiError(
        502,
        'GEMINI_CHAT_FAILED',
        'Could not reach your AI Study Companion right now. Please try again.'
      );
  }
}

function isMissingAssistantTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = (err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('assistant_conversations') ||
    msg.includes('assistant_messages') ||
    msg.includes('schema cache')
  );
}

function sanitizeTextNoUrls(text: unknown, fallback = ''): string {
  if (typeof text !== 'string') return fallback;
  const cleaned = text
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\bwww\.[^\s)]+/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return cleaned || fallback;
}

function buildConversationTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Study Conversation';
  return cleaned.length > 64 ? `${cleaned.slice(0, 61).trim()}...` : cleaned;
}

function isValidUuid(id: string | undefined): id is string {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim()
  );
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim());
      }
    } catch {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function parseKnowledgeLevel(value: unknown): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (typeof value !== 'string') return 'Beginner';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'advanced') return 'Advanced';
  if (normalized === 'intermediate') return 'Intermediate';
  return 'Beginner';
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

async function authenticateAssistantUser(authorizationHeader?: string): Promise<{
  userId: string;
  supabase: SupabaseClient;
  authMeta: Record<string, unknown>;
}> {
  const authHeader = authorizationHeader?.trim() || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new AssistantApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with your Skillora account to use the AI Study Companion.'
    );
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new AssistantApiError(
      401,
      'INVALID_AUTH_TOKEN',
      'Missing authentication token. Please sign in again.'
    );
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(accessToken),
    AUTH_TIMEOUT_MS,
    'AUTH_TIMEOUT',
    'Authentication verification timed out. Please try again.'
  );
  if (userError || !userData.user?.id) {
    throw new AssistantApiError(
      401,
      'UNAUTHORIZED',
      'Your session has expired or is invalid. Please sign in again.'
    );
  }

  return {
    userId: userData.user.id,
    supabase,
    authMeta: (userData.user.user_metadata ?? {}) as Record<string, unknown>,
  };
}

export async function fetchAuthenticatedStudentContext(params: {
  authorizationHeader?: string;
  lessonContext?: AssistantLessonContextInput;
}): Promise<AuthenticatedStudentContext> {
  const { userId, supabase, authMeta } = await authenticateAssistantUser(
    params.authorizationHeader
  );
  const requestedRoadmapId = isValidUuid(params.lessonContext?.roadmapId)
    ? params.lessonContext!.roadmapId!.trim()
    : null;

  const emptySingle = { data: null, error: null };
  const emptyList = { data: [] as never[], error: null };

  // Avoid duplicate roadmap queries: fetch specific requested roadmap if supplied, otherwise active roadmap.
  const roadmapPromise = requestedRoadmapId
    ? settledWithinBudget(
        supabase
          .from('learning_roadmaps')
          .select('id, title, career_goal, status, roadmap_data, updated_at')
          .eq('id', requestedRoadmapId)
          .eq('user_id', userId)
          .maybeSingle(),
        PERSONALIZATION_QUERY_TIMEOUT_MS,
        emptySingle
      )
    : settledWithinBudget(
        supabase
          .from('learning_roadmaps')
          .select('id, title, career_goal, status, roadmap_data, updated_at')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        PERSONALIZATION_QUERY_TIMEOUT_MS,
        emptySingle
      );

  const [profileRes, primaryRoadmapRes, attemptsRes, quizRes] = await Promise.all([
    settledWithinBudget(
      supabase
        .from('student_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptySingle
    ),
    roadmapPromise,
    settledWithinBudget(
      supabase
        .from('assessment_attempts')
        .select('subject, difficulty, score_percent, strengths, knowledge_gaps, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptyList
    ),
    settledWithinBudget(
      supabase
        .from('lesson_knowledge_checks')
        .select('lesson_id, lesson_title, score, knowledge_gaps, recommendation, completed_at')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(8),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptyList
    ),
  ]);

  if (profileRes.error?.code === '42501') {
    throw new AssistantApiError(
      403,
      'RLS_DENIED',
      'Access to student profile was denied.'
    );
  }

  let resolvedRoadmapRow = (primaryRoadmapRes.data as Record<string, unknown> | null) ?? null;
  if (!resolvedRoadmapRow && requestedRoadmapId) {
    const fallbackActiveRes = await settledWithinBudget(
      supabase
        .from('learning_roadmaps')
        .select('id, title, career_goal, status, roadmap_data, updated_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptySingle
    );
    resolvedRoadmapRow = (fallbackActiveRes.data as Record<string, unknown> | null) ?? null;
  }

  const profileRow = (profileRes.data ?? {}) as Record<string, unknown>;

  const studentName =
    (typeof profileRow.full_name === 'string' && profileRow.full_name.trim()) ||
    (typeof profileRow.name === 'string' && profileRow.name.trim()) ||
    (typeof authMeta.full_name === 'string' && authMeta.full_name.trim()) ||
    (typeof authMeta.name === 'string' && authMeta.name.trim()) ||
    'Student';

  const educationLevel =
    (typeof profileRow.education_level === 'string' && profileRow.education_level.trim()) ||
    (typeof authMeta.education_level === 'string' && authMeta.education_level.trim()) ||
    '';

  const fieldOfStudy =
    (typeof profileRow.field_of_study === 'string' && profileRow.field_of_study.trim()) ||
    (typeof authMeta.field_of_study === 'string' && authMeta.field_of_study.trim()) ||
    '';

  const roadmapRow = resolvedRoadmapRow;
  const activeRoadmapData =
    roadmapRow && roadmapRow.roadmap_data && typeof roadmapRow.roadmap_data === 'object'
      ? (roadmapRow.roadmap_data as Record<string, unknown>)
      : null;

  const dbPrimaryDirection =
    typeof profileRow.primary_direction === 'string'
      ? profileRow.primary_direction.trim()
      : '';
  const metaPrimaryDirection =
    typeof authMeta.primary_direction === 'string'
      ? authMeta.primary_direction.trim()
      : '';
  const primaryDirection = dbPrimaryDirection || metaPrimaryDirection;

  const careerGoal =
    (typeof profileRow.career_goal === 'string' && profileRow.career_goal.trim()) ||
    (typeof authMeta.career_goal === 'string' && authMeta.career_goal.trim()) ||
    (typeof roadmapRow?.career_goal === 'string' && roadmapRow.career_goal.trim()) ||
    '';

  const knowledgeLevel = parseKnowledgeLevel(
    profileRow.knowledge_level ?? authMeta.knowledge_level
  );

  const dbSkills = parseStringArray(profileRow.current_skills);
  const currentSkills =
    dbSkills.length > 0 ? dbSkills : parseStringArray(authMeta.current_skills);

  const dbInterests = parseStringArray(profileRow.learning_interests);
  const learningInterests =
    dbInterests.length > 0 ? dbInterests : parseStringArray(authMeta.learning_interests);

  const preferredHoursPerDay = parsePositiveNumber(
    profileRow.preferred_hours_per_day ??
      profileRow.daily_study_hours ??
      authMeta.preferred_hours_per_day,
    2
  );

  const activeRoadmapId = roadmapRow ? String(roadmapRow.id) : null;
  const activeRoadmapTitle =
    roadmapRow && typeof roadmapRow.title === 'string' && roadmapRow.title.trim()
      ? roadmapRow.title.trim()
      : null;
  const activeRoadmapCareerGoal =
    roadmapRow && typeof roadmapRow.career_goal === 'string' && roadmapRow.career_goal.trim()
      ? roadmapRow.career_goal.trim()
      : null;

  // Parse roadmap stages & locate active/current lesson
  const rawStages = Array.isArray(activeRoadmapData?.stages)
    ? (activeRoadmapData!.stages as Record<string, unknown>[])
    : [];

  let totalLessonsCount = 0;
  let completedLessonsCount = 0;
  const stagesSummary: AuthenticatedStudentContext['stagesSummary'] = [];
  const roadmapTopicTokens: string[] = [];
  if (activeRoadmapTitle) roadmapTopicTokens.push(activeRoadmapTitle);
  if (activeRoadmapCareerGoal) roadmapTopicTokens.push(activeRoadmapCareerGoal);

  let matchedRequestedLesson: AuthenticatedStudentContext['currentLesson'] = null;
  let firstIncompleteLesson: AuthenticatedStudentContext['currentLesson'] = null;
  let firstLessonFallback: AuthenticatedStudentContext['currentLesson'] = null;

  for (const st of rawStages) {
    if (!st || typeof st !== 'object') continue;
    const stageId = typeof st.id === 'string' ? st.id : '';
    const stageTitle = typeof st.title === 'string' ? st.title : 'Learning Stage';
    const stageDifficulty =
      typeof st.difficulty === 'string' ? st.difficulty : knowledgeLevel;
    roadmapTopicTokens.push(stageTitle);

    const lessons = Array.isArray(st.lessons) ? (st.lessons as Record<string, unknown>[]) : [];
    let stageCompleted = 0;

    for (const l of lessons) {
      if (!l || typeof l !== 'object') continue;
      totalLessonsCount += 1;
      const isCompleted = l.completed === true;
      if (isCompleted) {
        completedLessonsCount += 1;
        stageCompleted += 1;
      }

      const lessonId = typeof l.id === 'string' ? l.id : '';
      const lessonTitle = typeof l.title === 'string' ? l.title : 'Lesson';
      const lessonDescription = typeof l.description === 'string' ? l.description : '';
      const learningObjectives = Array.isArray(l.learningObjectives)
        ? l.learningObjectives.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
        : [];

      if (!isCompleted) {
        roadmapTopicTokens.push(lessonTitle);
      }

      const candidateLesson = activeRoadmapId
        ? {
            roadmapId: activeRoadmapId,
            stageId,
            stageTitle,
            lessonId,
            lessonTitle,
            lessonDescription,
            learningObjectives,
            completed: isCompleted,
          }
        : null;

      if (candidateLesson && !firstLessonFallback) {
        firstLessonFallback = candidateLesson;
      }
      if (candidateLesson && !isCompleted && !firstIncompleteLesson) {
        firstIncompleteLesson = candidateLesson;
      }
      if (
        candidateLesson &&
        params.lessonContext?.lessonId &&
        lessonId === params.lessonContext.lessonId &&
        (!params.lessonContext.stageId || stageId === params.lessonContext.stageId)
      ) {
        matchedRequestedLesson = candidateLesson;
      }
    }

    stagesSummary.push({
      id: stageId,
      title: stageTitle,
      difficulty: stageDifficulty,
      completedCount: stageCompleted,
      totalCount: lessons.length,
    });
  }

  const roadmapProgressPercent =
    totalLessonsCount > 0 ? Math.round((completedLessonsCount / totalLessonsCount) * 100) : 0;

  const currentLesson =
    matchedRequestedLesson ?? firstIncompleteLesson ?? firstLessonFallback;

  const attemptSummaries = (Array.isArray(attemptsRes.data) ? attemptsRes.data : []).map((row) => {
    const r = row as Record<string, unknown>;
    const rawScore = Number(r.score_percent);
    return {
      subject: typeof r.subject === 'string' && r.subject.trim() ? r.subject.trim() : 'Assessment',
      difficulty:
        typeof r.difficulty === 'string' && r.difficulty.trim()
          ? r.difficulty.trim()
          : 'Intermediate',
      scorePercent: Number.isFinite(rawScore) ? rawScore : 0,
      strengths: parseStringArray(r.strengths),
      gaps: parseStringArray(r.knowledge_gaps),
      createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    };
  });

  const tableQuizSummaries =
    !quizRes.error && Array.isArray(quizRes.data)
      ? quizRes.data.map((row) => {
          const r = row as Record<string, unknown>;
          const rec =
            r.recommendation && typeof r.recommendation === 'object'
              ? (r.recommendation as Record<string, unknown>)
              : {};
          const rawScore = Number(r.score);
          return {
            lessonId: typeof r.lesson_id === 'string' ? r.lesson_id : '',
            lessonTitle:
              typeof r.lesson_title === 'string' && r.lesson_title.trim()
                ? r.lesson_title.trim()
                : 'Lesson Check',
            score: Number.isFinite(rawScore) ? rawScore : 0,
            knowledgeGaps: parseStringArray(r.knowledge_gaps),
            actionType: typeof rec.actionType === 'string' ? rec.actionType : '',
            completedAt: typeof r.completed_at === 'string' ? r.completed_at : '',
          };
        })
      : [];

  const embeddedQuizSummaries = Array.isArray(activeRoadmapData?.knowledgeCheckAttempts)
    ? (activeRoadmapData!.knowledgeCheckAttempts as Record<string, unknown>[]).map((attempt) => {
        const rec =
          attempt.recommendation && typeof attempt.recommendation === 'object'
            ? (attempt.recommendation as Record<string, unknown>)
            : {};
        const gaps = attempt.knowledgeGaps ?? attempt.knowledge_gaps;
        const rawScore = Number(attempt.score);
        return {
          lessonId: String(attempt.lessonId ?? attempt.lesson_id ?? ''),
          lessonTitle: String(attempt.lessonTitle ?? attempt.lesson_title ?? 'Lesson Check'),
          score: Number.isFinite(rawScore) ? rawScore : 0,
          knowledgeGaps: parseStringArray(gaps),
          actionType: typeof rec.actionType === 'string' ? rec.actionType : '',
          completedAt: String(attempt.completedAt ?? attempt.completed_at ?? ''),
        };
      })
    : [];

  const knowledgeCheckSummaries =
    tableQuizSummaries.length > 0 ? tableQuizSummaries : embeddedQuizSummaries;

  const lowScoreSubjects = attemptSummaries
    .filter((a) => a.scorePercent < 70)
    .map((a) => a.subject);

  const allKnowledgeGaps = Array.from(
    new Set([
      ...knowledgeCheckSummaries.flatMap((q) => q.knowledgeGaps),
      ...attemptSummaries.flatMap((a) => a.gaps),
    ])
  ).slice(0, 12);

  const explorePayload = buildExploreResourcesForContext(
    {
      primaryDirection,
      learningInterests,
      careerGoal,
      knowledgeLevel,
      fieldOfStudy,
      currentSkills,
      activeRoadmapTitle,
      activeRoadmapCareerGoal,
      roadmapSubjectsText: roadmapTopicTokens.join(' '),
      knowledgeGaps: allKnowledgeGaps,
      lowScoreSubjects,
      recentAssessmentsCount: attemptSummaries.length + knowledgeCheckSummaries.length,
    },
    true
  );

  return {
    userId,
    supabase,
    studentName,
    educationLevel,
    fieldOfStudy,
    primaryDirection,
    careerGoal,
    knowledgeLevel,
    currentSkills,
    learningInterests,
    preferredHoursPerDay,
    activeRoadmapId,
    activeRoadmapTitle,
    activeRoadmapCareerGoal,
    activeRoadmapData,
    roadmapProgressPercent,
    completedLessonsCount,
    totalLessonsCount,
    stagesSummary,
    isExplicitStudyLesson: Boolean(matchedRequestedLesson),
    currentLesson,
    attemptSummaries: attemptSummaries.slice(0, 6),
    knowledgeCheckSummaries: knowledgeCheckSummaries.slice(0, 6),
    allKnowledgeGaps,
    personalizedResources: explorePayload.forYou,
  };
}

// ---------- Persistence Helpers (Dedicated Tables + Roadmap JSONB Fallback) ----------

interface FallbackConversationStore {
  conversation: AssistantConversationRecord;
  messages: AssistantMessageRecord[];
}

function readFallbackStore(ctx: AuthenticatedStudentContext): FallbackConversationStore[] {
  const raw = ctx.activeRoadmapData?.assistantConversations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is FallbackConversationStore => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      conversation: {
        id: String(item.conversation?.id ?? crypto.randomUUID()),
        title: String(item.conversation?.title ?? 'Study Conversation'),
        activeRoadmapId: item.conversation?.activeRoadmapId ?? null,
        activeStageId: item.conversation?.activeStageId ?? null,
        activeLessonId: item.conversation?.activeLessonId ?? null,
        createdAt: String(item.conversation?.createdAt ?? new Date().toISOString()),
        updatedAt: String(item.conversation?.updatedAt ?? new Date().toISOString()),
      },
      messages: Array.isArray(item.messages) ? item.messages : [],
    }));
}

async function writeFallbackStore(
  ctx: AuthenticatedStudentContext,
  entries: FallbackConversationStore[]
): Promise<'roadmap_fallback' | 'ephemeral'> {
  if (!ctx.activeRoadmapId || !ctx.activeRoadmapData) {
    return 'ephemeral';
  }
  // Re-read fresh roadmap_data before writing so concurrent requests/lesson toggles do not overwrite sibling fields.
  const { data: latestRow } = await settledWithinBudget(
    ctx.supabase
      .from('learning_roadmaps')
      .select('roadmap_data')
      .eq('id', ctx.activeRoadmapId)
      .eq('user_id', ctx.userId)
      .maybeSingle(),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    { data: null, error: null }
  );
  const latestData =
    latestRow &&
    typeof latestRow === 'object' &&
    (latestRow as Record<string, unknown>).roadmap_data &&
    typeof (latestRow as Record<string, unknown>).roadmap_data === 'object'
      ? ((latestRow as Record<string, unknown>).roadmap_data as Record<string, unknown>)
      : ctx.activeRoadmapData;

  const trimmed = entries.slice(0, 10).map((entry) => {
    const seenIds = new Set<string>();
    const dedupedMessages = entry.messages.filter((m) => {
      if (!m?.id || seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    return {
      ...entry,
      messages: dedupedMessages.slice(-40),
    };
  });
  const nextData = {
    ...latestData,
    assistantConversations: trimmed,
  };
  const { error } = await ctx.supabase
    .from('learning_roadmaps')
    .update({
      roadmap_data: nextData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.activeRoadmapId)
    .eq('user_id', ctx.userId);

  if (error) {
    return 'ephemeral';
  }
  ctx.activeRoadmapData = nextData;
  return 'roadmap_fallback';
}

function mapCatalogEntriesToRecommended(
  entries: ExploreResourceCatalogEntry[] | ExploreResourceResponseItem[]
): AssistantRecommendedResource[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    provider: e.provider,
    type: e.type,
    tabCategory: e.tabCategory,
    subjectLabel: 'subjectLabel' in e ? e.subjectLabel : String(e.primarySubject),
    url: e.url,
  }));
}

const ASSISTANT_QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'beginner', 'by', 'can', 'could',
  'do', 'does', 'explain', 'for', 'from', 'give', 'help', 'how', 'i', 'in',
  'into', 'is', 'it', 'its', 'learn', 'me', 'more', 'my', 'of', 'on', 'or',
  'please', 'step', 'tell', 'that', 'the', 'this', 'to', 'understand', 'want',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your',
]);

function extractTopicTokens(text: string): string[] {
  return Array.from(
    new Set(
      tokenize(text.toLowerCase()).filter(
        (t) => t.length >= 2 && !ASSISTANT_QUERY_STOP_WORDS.has(t)
      )
    )
  );
}

export function selectCatalogResourcesForTurn(
  ctx: AuthenticatedStudentContext,
  userMessage: string
): AssistantRecommendedResource[] {
  const catalog = getExploreResourceCatalog();
  const byId = new Map(catalog.map((c) => [c.id, c]));

  const queryLower = userMessage.toLowerCase();
  const queryTokens = extractTopicTokens(queryLower);
  const lessonTitleLower = (ctx.currentLesson?.lessonTitle ?? '').toLowerCase();
  const lessonTokens = lessonTitleLower ? extractTopicTokens(lessonTitleLower) : [];
  const lessonOverlapsQuery =
    ctx.isExplicitStudyLesson ||
    queryTokens.length === 0 ||
    queryTokens.some((tok) => lessonTokens.includes(tok) || lessonTitleLower.includes(tok));

  const queryScored: { entry: ExploreResourceCatalogEntry; score: number }[] = [];
  for (const entry of catalog) {
    const haystack = `${entry.title} ${entry.description} ${entry.keywords.join(' ')} ${entry.domains.join(' ')}`.toLowerCase();
    const hayTokens = new Set(tokenize(haystack));
    let hits = 0;
    for (const tok of queryTokens) {
      if (containsWholeTerm(haystack, hayTokens, tok)) {
        hits += 2;
      }
    }
    if (lessonTitleLower && lessonOverlapsQuery) {
      for (const kw of entry.keywords) {
        if (lessonTitleLower.includes(kw.toLowerCase())) {
          hits += 1.5;
        }
      }
    }
    if (hits > 0) {
      queryScored.push({ entry, score: hits });
    }
  }
  queryScored.sort((a, b) => b.score - a.score);

  const combined: AssistantRecommendedResource[] = [];
  const seen = new Set<string>();

  // If the student's current message mentions specific catalog topics, surface those FIRST
  // so profile-level resources never crowd out resources directly answering the question.
  if (queryScored.length > 0) {
    for (const q of queryScored.slice(0, 6)) {
      if (!seen.has(q.entry.id)) {
        seen.add(q.entry.id);
        combined.push(...mapCatalogEntriesToRecommended([q.entry]));
      }
    }
  }

  // Fill remaining slots with personalized For You resources tailored to Primary Direction
  for (const item of ctx.personalizedResources.slice(0, 8)) {
    if (!seen.has(item.id) && byId.has(item.id)) {
      seen.add(item.id);
      combined.push({
        id: item.id,
        title: item.title,
        provider: item.provider,
        type: item.type,
        tabCategory: item.tabCategory,
        subjectLabel: item.subjectLabel,
        url: item.url,
      });
    }
  }

  return combined.slice(0, 12);
}

// ---------- Gemini Response Schema & Prompt Builder ----------

export const ASSISTANT_CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description:
        'Clear, personalized, encouraging study companion response. Explain step-by-step when teaching concepts, provide hints before full answers during practice, and keep explanations tailored to the student level and discipline.',
    },
    codeSnippet: {
      type: Type.STRING,
      description:
        'Optional short runnable code/query/syntax snippet ONLY when the topic involves programming, HTML/CSS, SQL, or technical syntax. Leave empty string for non-programming subjects like Academic Writing, Public Speaking, Geography, or Management.',
    },
    language: {
      type: Type.STRING,
      description:
        'Code language label (e.g. python, javascript, css, sql, typescript) if codeSnippet is provided; otherwise empty string.',
    },
    recommendedResourceIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Up to 3 exact resource IDs from the VERIFIED RESOURCE CANDIDATES list when recommending study resources or when helpful for weak topics/career goal. Leave empty array if none are relevant.',
    },
    suggestedFollowUps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '2 or 3 short natural follow-up prompts the student might want to ask next based on this turn.',
    },
  },
  required: ['answer', 'recommendedResourceIds', 'suggestedFollowUps'],
};

export function buildStudentSystemInstruction(
  ctx: AuthenticatedStudentContext,
  candidateResources: AssistantRecommendedResource[],
  outputMode: 'json' | 'stream' = 'json'
): string {
  const attemptLines =
    ctx.attemptSummaries.length > 0
      ? ctx.attemptSummaries
          .slice(0, 4)
          .map(
            (a) =>
              `- ${a.subject} (${a.difficulty}): ${a.scorePercent}% | Strengths: ${a.strengths.slice(0, 4).join(', ') || 'None'} | Gaps: ${a.gaps.slice(0, 4).join(', ') || 'None'}`
          )
          .join('\n')
      : 'No diagnostic skill assessments completed yet.';

  const quizLines =
    ctx.knowledgeCheckSummaries.length > 0
      ? ctx.knowledgeCheckSummaries
          .slice(0, 4)
          .map(
            (q) =>
              `- Lesson "${q.lessonTitle}": ${q.score}% (${q.actionType || 'completed'}) | Gaps: ${q.knowledgeGaps.slice(0, 4).join(', ') || 'None'}`
          )
          .join('\n')
      : 'No lesson knowledge checks completed yet.';

  const lessonBlock = ctx.currentLesson
    ? [
        ctx.isExplicitStudyLesson
          ? `Active / Current Lesson (student is studying this lesson now): "${ctx.currentLesson.lessonTitle}"`
          : `Next Suggested Roadmap Lesson (background context only — only reference if relevant to the student's question): "${ctx.currentLesson.lessonTitle}"`,
        `Stage: "${ctx.currentLesson.stageTitle}"`,
        `Status: ${ctx.currentLesson.completed ? 'Completed' : 'In Progress'}`,
        ctx.currentLesson.lessonDescription
          ? `Description: ${ctx.currentLesson.lessonDescription.slice(0, 320)}`
          : null,
        ctx.currentLesson.learningObjectives.length > 0
          ? `Learning Objectives: ${ctx.currentLesson.learningObjectives.slice(0, 4).join('; ')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No active lesson selected yet.';

  const stageLines =
    ctx.stagesSummary.length > 0
      ? ctx.stagesSummary
          .slice(0, 6)
          .map(
            (s, idx) =>
              `${idx + 1}. ${s.title} (${s.difficulty}) — ${s.completedCount}/${s.totalCount} lessons done`
          )
          .join('\n')
      : 'No active roadmap generated yet.';

  const resourceLines =
    candidateResources.length > 0
      ? candidateResources
          .slice(0, 6)
          .map((r) =>
            outputMode === 'json'
              ? `- ID="${r.id}" | ${r.title} (${r.provider}, ${r.type}, Subject: ${r.subjectLabel})`
              : `- ${r.title} (${r.provider}, ${r.type}, Subject: ${r.subjectLabel})`
          )
          .join('\n')
      : 'No matching catalog resources available.';

  const formatRules =
    outputMode === 'json'
      ? [
          '4. VERIFIED RESOURCES ONLY: Never write raw URLs in answer text and never invent external websites. Whenever resources help (or are requested), select up to 3 exact IDs from VERIFIED RESOURCE CANDIDATES in `recommendedResourceIds`.',
          '5. CODE SNIPPETS: Only populate `codeSnippet` and `language` when discussing programming, markup/CSS, SQL, or technical commands. Leave both empty strings for non-coding subjects.',
          '6. OUTPUT FORMAT: Return valid JSON strictly matching the response schema.',
        ]
      : [
          '4. VERIFIED RESOURCES ONLY: Never write raw URLs and never invent external websites. When resources are helpful or requested, mention up to 2 relevant resource titles from the VERIFIED RESOURCE CANDIDATES list naturally by name.',
          '5. CODE SNIPPETS: If and ONLY IF the topic requires programming, markup/CSS, SQL, or technical commands, include at most ONE concise fenced code block (```language ... ```). Omit code blocks for non-coding topics.',
          '6. OUTPUT FORMAT: Write a clear, friendly, readable plain-text response directly for the student. Never output JSON, JSON schemas, internal instructions, or meta commentary.',
        ];

  return [
    'You are the Skillora AI Study Companion — an accurate, empathetic, personalized academic and career mentor.',
    '',
    'AUTHENTICATED STUDENT PROFILE:',
    `- Name: ${ctx.studentName}`,
    `- Education Level: ${ctx.educationLevel || 'Not specified'}`,
    `- Field of Study: ${ctx.fieldOfStudy || 'General'}`,
    `- Knowledge Level: ${ctx.knowledgeLevel}`,
    `- Primary Learning Direction: ${ctx.primaryDirection || ctx.careerGoal || 'Not specified'}`,
    `- Career Goal: ${ctx.careerGoal || 'Not specified'}`,
    `- Current Skills: ${ctx.currentSkills.join(', ') || 'None listed'}`,
    `- Supporting Learning Interests: ${ctx.learningInterests.join(', ') || 'None listed'}`,
    `- Daily Study Availability: ${ctx.preferredHoursPerDay} hours/day`,
    '',
    'CURRENT LEARNING ROADMAP & PROGRESS:',
    `- Active Roadmap: ${ctx.activeRoadmapTitle || 'None generated yet'} (${ctx.completedLessonsCount}/${ctx.totalLessonsCount} lessons completed, ${ctx.roadmapProgressPercent}%)`,
    stageLines,
    '',
    'CURRENT LESSON CONTEXT:',
    lessonBlock,
    '',
    'RECENT DIAGNOSTIC ASSESSMENTS:',
    attemptLines,
    '',
    'RECENT LESSON KNOWLEDGE CHECKS:',
    quizLines,
    '',
    `IDENTIFIED KNOWLEDGE GAPS: ${ctx.allKnowledgeGaps.join(', ') || 'None recorded yet'}`,
    '',
    outputMode === 'json'
      ? 'VERIFIED RESOURCE CANDIDATES (ONLY recommend IDs from this exact list):'
      : 'VERIFIED RESOURCE CANDIDATES (mention by title only if helpful; verified cards are attached separately):',
    resourceLines,
    '',
    'CRITICAL BEHAVIOR RULES:',
    '1. ANSWER THE EXACT QUESTION FIRST: Directly answer what the student actually asked right now — clearly, accurately, and calibrated to their knowledge level. Never hijack general or direct questions with generic greetings, repetitive profile recaps, forced career speeches, or unrelated lesson detours.',
    '2. NATURAL PERSONALIZATION & PEDAGOGICAL MODES:',
    '   - Connect explanations or examples to their Primary Learning Direction, active roadmap, skills, or lesson ONLY when genuinely helpful or when asked about their learning path/study plan.',
    '   - Concept explanations: Break concepts down step-by-step in plain language with practical real-world examples.',
    '   - Practice & weak areas: When asked for practice or help with gaps, generate tailored exercises and give a helpful hint BEFORE giving away answers unless the student already submitted an attempt.',
    '   - Explaining mistakes: Diagnose why a misconception happens and guide them to the right reasoning constructively.',
    '3. MULTI-TURN CONTEXT & TOPIC SHIFTS: Resolve genuine follow-ups ("give a practical example", "make it simpler", "quiz me on that") using recent turns, while letting the student\'s current message cleanly override earlier unrelated topics.',
    ...formatRules,
  ].join('\n');
}

// ---------- Public Handlers ----------

async function loadMinimalRoadmapFallbackStore(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  activeRoadmapId: string | null;
  activeRoadmapData: Record<string, unknown> | null;
  entries: FallbackConversationStore[];
}> {
  const { data: row } = await settledWithinBudget(
    supabase
      .from('learning_roadmaps')
      .select('id, roadmap_data')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    { data: null, error: null }
  );

  const roadmapRow = (row as Record<string, unknown> | null) ?? null;
  const activeRoadmapId = roadmapRow ? String(roadmapRow.id) : null;
  const activeRoadmapData =
    roadmapRow && roadmapRow.roadmap_data && typeof roadmapRow.roadmap_data === 'object'
      ? (roadmapRow.roadmap_data as Record<string, unknown>)
      : null;

  const raw = activeRoadmapData?.assistantConversations;
  const entries: FallbackConversationStore[] = Array.isArray(raw)
    ? raw
        .filter((item): item is FallbackConversationStore => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          conversation: {
            id: String(item.conversation?.id ?? crypto.randomUUID()),
            title: String(item.conversation?.title ?? 'Study Conversation'),
            activeRoadmapId: item.conversation?.activeRoadmapId ?? null,
            activeStageId: item.conversation?.activeStageId ?? null,
            activeLessonId: item.conversation?.activeLessonId ?? null,
            createdAt: String(item.conversation?.createdAt ?? new Date().toISOString()),
            updatedAt: String(item.conversation?.updatedAt ?? new Date().toISOString()),
          },
          messages: Array.isArray(item.messages) ? item.messages : [],
        }))
    : [];

  return { activeRoadmapId, activeRoadmapData, entries };
}

export async function handleListAssistantConversations(params: {
  authorizationHeader?: string;
  conversationId?: string;
}): Promise<{
  conversations: AssistantConversationRecord[];
  activeConversationId: string | null;
  messages: AssistantMessageRecord[];
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
}> {
  const { userId, supabase } = await authenticateAssistantUser(params.authorizationHeader);

  const convRes = await settledWithinBudget(
    supabase
      .from('assistant_conversations')
      .select(
        'id, title, active_roadmap_id, active_stage_id, active_lesson_id, created_at, updated_at'
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    {
      data: null,
      error: { code: 'TIMEOUT', message: 'Conversation list query timed out' },
    }
  );

  const convRows = convRes.data;
  const convErr = convRes.error;

  if (convErr) {
    if (convErr.code !== 'TIMEOUT' && !isMissingAssistantTableError(convErr)) {
      throw new AssistantApiError(
        convErr.code === '42501' ? 403 : 500,
        convErr.code || 'CONVERSATIONS_LOAD_FAILED',
        'Could not load your AI Study Companion conversations.'
      );
    }

    const fallback = await loadMinimalRoadmapFallbackStore(supabase, userId);
    const fallbackStore = fallback.entries.sort((a, b) =>
      b.conversation.updatedAt.localeCompare(a.conversation.updatedAt)
    );
    const conversations = fallbackStore.map((s) => s.conversation);
    const targetId =
      params.conversationId && conversations.some((c) => c.id === params.conversationId)
        ? params.conversationId
        : conversations[0]?.id ?? null;
    const activeEntry = fallbackStore.find((s) => s.conversation.id === targetId);
    return {
      conversations,
      activeConversationId: targetId,
      messages: activeEntry?.messages ?? [],
      storageMode: fallback.activeRoadmapId ? 'roadmap_fallback' : 'ephemeral',
    };
  }

  const conversations: AssistantConversationRecord[] = (convRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      title: typeof r.title === 'string' && r.title.trim() ? r.title : 'Study Conversation',
      activeRoadmapId: typeof r.active_roadmap_id === 'string' ? r.active_roadmap_id : null,
      activeStageId: typeof r.active_stage_id === 'string' ? r.active_stage_id : null,
      activeLessonId: typeof r.active_lesson_id === 'string' ? r.active_lesson_id : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });

  const activeConversationId =
    params.conversationId && conversations.some((c) => c.id === params.conversationId)
      ? params.conversationId
      : conversations[0]?.id ?? null;

  if (!activeConversationId) {
    return {
      conversations,
      activeConversationId: null,
      messages: [],
      storageMode: 'table',
    };
  }

  const msgRes = await settledWithinBudget(
    supabase
      .from('assistant_messages')
      .select(
        'id, conversation_id, sender, content, code_snippet, code_language, recommended_resources, suggested_follow_ups, created_at'
      )
      .eq('conversation_id', activeConversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    {
      data: null,
      error: { code: 'TIMEOUT', message: 'Messages query timed out' },
    }
  );

  const msgRows = msgRes.data;
  const msgErr = msgRes.error;

  if (msgErr) {
    if (msgErr.code === 'TIMEOUT') {
      return {
        conversations,
        activeConversationId,
        messages: [],
        storageMode: 'table',
      };
    }
    throw new AssistantApiError(
      msgErr.code === '42501' ? 403 : 500,
      msgErr.code || 'MESSAGES_LOAD_FAILED',
      'Could not load conversation messages.'
    );
  }

  const messages: AssistantMessageRecord[] = (msgRows ?? [])
    .slice()
    .reverse()
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        conversationId: String(r.conversation_id),
        sender: r.sender === 'user' ? 'user' : 'assistant',
        text: String(r.content ?? ''),
        createdAt: String(r.created_at),
        ...(typeof r.code_snippet === 'string' && r.code_snippet.trim()
          ? { codeSnippet: r.code_snippet }
          : {}),
        ...(typeof r.code_language === 'string' && r.code_language.trim()
          ? { language: r.code_language }
          : {}),
        ...(Array.isArray(r.recommended_resources)
          ? {
              recommendedResources: r.recommended_resources as AssistantRecommendedResource[],
            }
          : {}),
        ...(Array.isArray(r.suggested_follow_ups)
          ? {
              suggestedFollowUps: r.suggested_follow_ups.filter(
                (f): f is string => typeof f === 'string'
              ),
            }
          : {}),
      };
    });

  return {
    conversations,
    activeConversationId,
    messages,
    storageMode: 'table',
  };
}

export async function handleCreateAssistantConversation(params: {
  authorizationHeader?: string;
  title?: string;
  lessonContext?: AssistantLessonContextInput;
}): Promise<{
  conversation: AssistantConversationRecord;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
}> {
  const ctx = await fetchAuthenticatedStudentContext({
    authorizationHeader: params.authorizationHeader,
    lessonContext: params.lessonContext,
  });

  const now = new Date().toISOString();
  const title = params.title?.trim()
    ? buildConversationTitle(params.title.trim())
    : 'New Study Conversation';

  const newConv: AssistantConversationRecord = {
    id: crypto.randomUUID(),
    title,
    activeRoadmapId: ctx.activeRoadmapId,
    activeStageId: ctx.currentLesson?.stageId ?? null,
    activeLessonId: ctx.currentLesson?.lessonId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const { data, error } = await ctx.supabase
    .from('assistant_conversations')
    .insert({
      id: newConv.id,
      user_id: ctx.userId,
      title: newConv.title,
      active_roadmap_id: newConv.activeRoadmapId,
      active_stage_id: newConv.activeStageId,
      active_lesson_id: newConv.activeLessonId,
      created_at: now,
      updated_at: now,
    })
    .select(
      'id, title, active_roadmap_id, active_stage_id, active_lesson_id, created_at, updated_at'
    )
    .single();

  if (error) {
    if (!isMissingAssistantTableError(error)) {
      throw new AssistantApiError(
        error.code === '42501' ? 403 : 500,
        error.code || 'CONVERSATION_CREATE_FAILED',
        'Could not start a new conversation right now.'
      );
    }
    const existing = readFallbackStore(ctx);
    const mode = await writeFallbackStore(ctx, [
      { conversation: newConv, messages: [] },
      ...existing,
    ]);
    return { conversation: newConv, storageMode: mode };
  }

  return {
    conversation: {
      id: String(data.id),
      title: String(data.title),
      activeRoadmapId: data.active_roadmap_id ?? null,
      activeStageId: data.active_stage_id ?? null,
      activeLessonId: data.active_lesson_id ?? null,
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    },
    storageMode: 'table',
  };
}

export async function handleDeleteAssistantConversation(params: {
  authorizationHeader?: string;
  conversationId: string;
}): Promise<{ deleted: boolean }> {
  const convId = params.conversationId?.trim();
  if (!isValidUuid(convId)) {
    throw new AssistantApiError(400, 'INVALID_CONVERSATION_ID', 'Invalid conversation ID.');
  }

  const { userId, supabase } = await authenticateAssistantUser(params.authorizationHeader);

  const { error } = await settledWithinBudget(
    supabase
      .from('assistant_conversations')
      .delete()
      .eq('id', convId)
      .eq('user_id', userId),
    PERSISTENCE_TIMEOUT_MS,
    { error: { code: 'TIMEOUT', message: 'Conversation delete timed out' } }
  );

  if (error) {
    if (error.code !== 'TIMEOUT' && !isMissingAssistantTableError(error)) {
      throw new AssistantApiError(
        error.code === '42501' ? 403 : 500,
        error.code || 'CONVERSATION_DELETE_FAILED',
        'Could not delete conversation.'
      );
    }
    const fallback = await loadMinimalRoadmapFallbackStore(supabase, userId);
    if (fallback.activeRoadmapId && fallback.activeRoadmapData) {
      const filtered = fallback.entries.filter((s) => s.conversation.id !== convId);
      const nextData = {
        ...fallback.activeRoadmapData,
        assistantConversations: filtered.slice(0, 10),
      };
      await settledWithinBudget(
        supabase
          .from('learning_roadmaps')
          .update({
            roadmap_data: nextData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', fallback.activeRoadmapId)
          .eq('user_id', userId),
        PERSISTENCE_TIMEOUT_MS,
        { error: null }
      );
    }
    return { deleted: true };
  }

  return { deleted: true };
}

function resolveRecommendedResourcesFromIds(
  recommendedIds: string[],
  candidateById: Map<string, AssistantRecommendedResource>,
  fullCatalogById: Map<string, ExploreResourceCatalogEntry>
): AssistantRecommendedResource[] {
  const recommendedResources: AssistantRecommendedResource[] = [];
  const seenRecIds = new Set<string>();
  for (const rawId of recommendedIds) {
    const cleanId = rawId.trim();
    if (!cleanId || seenRecIds.has(cleanId)) continue;
    const fromCandidate = candidateById.get(cleanId);
    if (fromCandidate) {
      seenRecIds.add(cleanId);
      recommendedResources.push(fromCandidate);
    } else {
      const fromCatalog = fullCatalogById.get(cleanId);
      if (fromCatalog) {
        seenRecIds.add(cleanId);
        recommendedResources.push(...mapCatalogEntriesToRecommended([fromCatalog]));
      }
    }
    if (recommendedResources.length >= 3) break;
  }
  return recommendedResources;
}

function stripUrlsKeepWhitespace(text: string): string {
  return text.replace(/https?:\/\/[^\s)]+/gi, '').replace(/\bwww\.[^\s)]+/gi, '');
}

function stripJsonCodeFences(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function selectStreamRecommendedResources(
  candidateResources: AssistantRecommendedResource[],
  userMessage: string,
  answerText: string
): AssistantRecommendedResource[] {
  if (candidateResources.length === 0) return [];
  const queryLower = userMessage.toLowerCase();
  const wantsResources =
    /\b(resource|resources|video|videos|tutorial|tutorials|course|courses|docs|documentation|recommend|where can i learn|study material|materials)\b/.test(
      queryLower
    );
  const asksGeneralTrack =
    /\b(track|direction|roadmap|path|plan|focus|for me|my goal)\b/.test(queryLower);

  const queryTokens = extractTopicTokens(queryLower);
  const answerLower = answerText.toLowerCase();
  const scored: { item: AssistantRecommendedResource; score: number }[] = [];

  for (const r of candidateResources) {
    const titleLower = r.title.toLowerCase();
    const subjLower = r.subjectLabel.toLowerCase();
    const metaTokens = new Set(tokenize(`${titleLower} ${subjLower}`));
    let score = 0;

    if (answerLower.includes(titleLower)) score += 5;
    for (const tok of queryTokens) {
      if (containsWholeTerm(`${titleLower} ${subjLower}`, metaTokens, tok)) {
        score += 2;
      }
    }
    if (score >= 2) {
      scored.push({ item: r, score });
    } else if (wantsResources && (asksGeneralTrack || queryTokens.length <= 2)) {
      scored.push({ item: r, score: 1 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, wantsResources ? 3 : 2).map((s) => s.item);
}

function buildStreamSuggestedFollowUps(
  ctx: AuthenticatedStudentContext,
  userMessage: string
): string[] {
  const queryLower = userMessage.toLowerCase();
  const suggestions: string[] = [];

  if (!queryLower.includes('example')) {
    suggestions.push('Can you give me a practical real-world example of this?');
  }
  if (!queryLower.includes('quiz') && !queryLower.includes('practice')) {
    suggestions.push('Give me a quick practice question with a hint.');
  }
  if (ctx.currentLesson?.lessonTitle && !queryLower.includes(ctx.currentLesson.lessonTitle.toLowerCase())) {
    suggestions.push(`How does this connect to "${ctx.currentLesson.lessonTitle}"?`);
  } else {
    suggestions.push('What should I focus on next for my study goal?');
  }

  return suggestions.slice(0, 3);
}

function extractCodeBlockFromMarkdownText(rawText: string): {
  cleanText: string;
  codeSnippet?: string;
  language?: string;
} {
  const match = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/.exec(rawText);
  if (!match) {
    return { cleanText: rawText.trim() };
  }
  const language = match[1]?.trim().toLowerCase() || undefined;
  const codeSnippet = match[2]?.trim() || undefined;
  const cleanText = rawText
    .replace(match[0], '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    cleanText: cleanText || rawText.trim(),
    ...(codeSnippet ? { codeSnippet, language } : {}),
  };
}

const MAX_HISTORY_TURN_CHARS = 1000;
const MAX_HISTORY_TOTAL_CHARS = 5000;

export function trimAndBudgetHistory(
  turns: { sender: 'user' | 'assistant'; text: string }[]
): { sender: 'user' | 'assistant'; text: string }[] {
  const cleaned = turns
    .map((t) => ({
      sender: t.sender,
      text: t.text.trim().slice(0, MAX_HISTORY_TURN_CHARS),
    }))
    .filter((t) => t.text.length > 0)
    .slice(-MAX_CONTEXT_TURNS);

  // Keep newest turns within total character budget to prevent prompt bloat timeouts
  const budgeted: { sender: 'user' | 'assistant'; text: string }[] = [];
  let remainingChars = MAX_HISTORY_TOTAL_CHARS;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const turn = cleaned[i];
    if (turn.text.length > remainingChars && budgeted.length > 0) {
      break;
    }
    const boundedText =
      turn.text.length > remainingChars ? turn.text.slice(0, remainingChars) : turn.text;
    remainingChars -= boundedText.length;
    budgeted.unshift({ sender: turn.sender, text: boundedText });
  }
  return budgeted;
}

export function normalizeGeminiContents(
  priorHistory: { sender: 'user' | 'assistant'; text: string }[],
  currentMessage: string
): Content[] {
  const contents: Content[] = [];
  for (const turn of priorHistory) {
    const role: 'user' | 'model' = turn.sender === 'user' ? 'user' : 'model';
    const text = turn.text.trim();
    if (!text) continue;
    // Gemini multi-turn history must begin with a user turn
    if (contents.length === 0 && role !== 'user') continue;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      const prevText = prev.parts?.[0]?.text ?? '';
      prev.parts = [{ text: `${prevText}\n\n${text}`.slice(-MAX_HISTORY_TURN_CHARS) }];
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  // Merge cleanly if the last stored turn was already a user turn (e.g. an earlier failed turn)
  const last = contents[contents.length - 1];
  if (last && last.role === 'user') {
    const prevText = last.parts?.[0]?.text ?? '';
    if (prevText === currentMessage) {
      return contents;
    }
    last.parts = [{ text: `${prevText}\n\n${currentMessage}`.slice(-MAX_MESSAGE_CHARS) }];
    return contents;
  }

  contents.push({
    role: 'user',
    parts: [{ text: currentMessage }],
  });
  return contents;
}

async function prepareChatContextAndHistory(params: {
  authorizationHeader?: string;
  conversationId?: string;
  message: string;
  history?: AssistantHistoryTurnInput[];
  lessonContext?: AssistantLessonContextInput;
}) {
  const trimmedMessage = typeof params.message === 'string' ? params.message.trim() : '';
  if (!trimmedMessage || trimmedMessage.length < 2) {
    throw new AssistantApiError(
      400,
      'INVALID_MESSAGE',
      'Please enter a clear question or prompt for your AI Study Companion.'
    );
  }
  if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
    throw new AssistantApiError(
      400,
      'MESSAGE_TOO_LONG',
      `Please keep your message under ${MAX_MESSAGE_CHARS} characters.`
    );
  }

  const contextStart = Date.now();
  const ctx = await fetchAuthenticatedStudentContext({
    authorizationHeader: params.authorizationHeader,
    lessonContext: params.lessonContext,
  });
  const contextMs = Date.now() - contextStart;

  enforceSlidingRateLimit(ctx.userId);

  let targetConversationId = isValidUuid(params.conversationId)
    ? params.conversationId.trim()
    : null;

  let priorHistory: { sender: 'user' | 'assistant'; text: string }[] = [];
  let storageMode: 'table' | 'roadmap_fallback' | 'ephemeral' = 'table';
  let activeConversation: AssistantConversationRecord | null = null;

  const historyStart = Date.now();
  if (targetConversationId) {
    const convLookup = await settledWithinBudget(
      ctx.supabase
        .from('assistant_conversations')
        .select(
          'id, title, active_roadmap_id, active_stage_id, active_lesson_id, created_at, updated_at'
        )
        .eq('id', targetConversationId)
        .eq('user_id', ctx.userId)
        .maybeSingle(),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      { data: null, error: { code: 'TIMEOUT', message: 'Lookup timed out' } }
    );

    const convErr = convLookup.error;
    const convRow = convLookup.data;

    if (convErr) {
      if (convErr.code === 'TIMEOUT') {
        storageMode = ctx.activeRoadmapId ? 'roadmap_fallback' : 'ephemeral';
      } else if (!isMissingAssistantTableError(convErr)) {
        throw new AssistantApiError(
          convErr.code === '42501' ? 403 : 500,
          convErr.code || 'CONVERSATION_LOOKUP_FAILED',
          'Could not verify your conversation.'
        );
      } else {
        storageMode = ctx.activeRoadmapId ? 'roadmap_fallback' : 'ephemeral';
      }

      const fallbackEntry = readFallbackStore(ctx).find(
        (s) => s.conversation.id === targetConversationId
      );
      if (fallbackEntry) {
        activeConversation = fallbackEntry.conversation;
        priorHistory = fallbackEntry.messages
          .slice(-MAX_CONTEXT_TURNS)
          .map((m) => ({ sender: m.sender, text: m.text }));
      }
    } else if (convRow) {
      activeConversation = {
        id: String(convRow.id),
        title: String(convRow.title),
        activeRoadmapId: convRow.active_roadmap_id ?? null,
        activeStageId: convRow.active_stage_id ?? null,
        activeLessonId: convRow.active_lesson_id ?? null,
        createdAt: String(convRow.created_at),
        updatedAt: String(convRow.updated_at),
      };
      // Fetch the MOST RECENT MAX_CONTEXT_TURNS turns (descending + reverse), not the oldest ones.
      const priorRes = await settledWithinBudget(
        ctx.supabase
          .from('assistant_messages')
          .select('sender, content')
          .eq('conversation_id', targetConversationId)
          .eq('user_id', ctx.userId)
          .order('created_at', { ascending: false })
          .limit(MAX_CONTEXT_TURNS),
        PERSONALIZATION_QUERY_TIMEOUT_MS,
        { data: [] as { sender: unknown; content: unknown }[], error: null }
      );

      if (Array.isArray(priorRes.data)) {
        priorHistory = priorRes.data
          .slice()
          .reverse()
          .map((r) => ({
            sender: r.sender === 'user' ? 'user' : 'assistant',
            text: String(r.content ?? ''),
          }));
      }
    } else {
      targetConversationId = null;
    }
  }

  if (priorHistory.length === 0 && Array.isArray(params.history)) {
    priorHistory = params.history
      .filter(
        (h): h is AssistantHistoryTurnInput =>
          Boolean(h) &&
          (h.sender === 'user' || h.sender === 'assistant') &&
          typeof h.text === 'string' &&
          h.text.trim().length > 0
      )
      .slice(-MAX_CONTEXT_TURNS)
      .map((h) => ({
        sender: h.sender,
        text: h.text.trim(),
      }));
  }

  // Do not bleed turns from a previous/archived roadmap after the student switches learning direction
  if (
    activeConversation?.activeRoadmapId &&
    ctx.activeRoadmapId &&
    activeConversation.activeRoadmapId !== ctx.activeRoadmapId
  ) {
    priorHistory = [];
  }

  const budgetedHistory = trimAndBudgetHistory(priorHistory);
  const historyMs = Date.now() - historyStart;

  const candidateResources = selectCatalogResourcesForTurn(ctx, trimmedMessage);
  const candidateById = new Map(candidateResources.map((r) => [r.id, r]));
  const fullCatalogById = new Map(
    getExploreResourceCatalog().map((c) => [c.id, c])
  );

  const contents = normalizeGeminiContents(budgetedHistory, trimmedMessage);

  return {
    trimmedMessage,
    ctx,
    targetConversationId,
    activeConversation,
    storageMode,
    candidateResources,
    candidateById,
    fullCatalogById,
    contents,
    timings: { contextMs, historyMs },
  };
}

function deriveDeterministicUuid(seed: string): string {
  const bytes = crypto.createHash('sha256').update(seed).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function persistAssistantTurn(params: {
  ctx: AuthenticatedStudentContext;
  targetConversationId: string | null;
  activeConversation: AssistantConversationRecord | null;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
  trimmedMessage: string;
  answer: string;
  codeSnippet?: string;
  language?: string;
  recommendedResources: AssistantRecommendedResource[];
  suggestedFollowUps: string[];
  clientTurnId?: string;
}) {
  const { ctx, targetConversationId } = params;
  let { activeConversation, storageMode } = params;

  const nowUser = new Date().toISOString();
  const nowAssistant = new Date(Date.now() + 5).toISOString();

  if (!activeConversation) {
    activeConversation = {
      id: targetConversationId ?? crypto.randomUUID(),
      title: buildConversationTitle(params.trimmedMessage),
      activeRoadmapId: ctx.activeRoadmapId,
      activeStageId: ctx.currentLesson?.stageId ?? null,
      activeLessonId: ctx.currentLesson?.lessonId ?? null,
      createdAt: nowUser,
      updatedAt: nowAssistant,
    };
  } else {
    const shouldAutoTitle =
      activeConversation.title === 'New Study Conversation' ||
      activeConversation.title === 'Study Conversation';
    activeConversation = {
      ...activeConversation,
      title: shouldAutoTitle
        ? buildConversationTitle(params.trimmedMessage)
        : activeConversation.title,
      activeRoadmapId: ctx.activeRoadmapId ?? activeConversation.activeRoadmapId ?? null,
      activeStageId: ctx.currentLesson?.stageId ?? activeConversation.activeStageId ?? null,
      activeLessonId: ctx.currentLesson?.lessonId ?? activeConversation.activeLessonId ?? null,
      updatedAt: nowAssistant,
    };
  }

  const validClientTurnId = isValidUuid(params.clientTurnId)
    ? params.clientTurnId.trim()
    : null;
  const userMessageId = validClientTurnId ?? crypto.randomUUID();
  const assistantMessageId = validClientTurnId
    ? deriveDeterministicUuid(`assistant:${validClientTurnId}`)
    : crypto.randomUUID();

  const userMessage: AssistantMessageRecord = {
    id: userMessageId,
    conversationId: activeConversation.id,
    sender: 'user',
    text: params.trimmedMessage,
    createdAt: nowUser,
  };

  const assistantMessage: AssistantMessageRecord = {
    id: assistantMessageId,
    conversationId: activeConversation.id,
    sender: 'assistant',
    text: params.answer,
    createdAt: nowAssistant,
    ...(params.codeSnippet ? { codeSnippet: params.codeSnippet } : {}),
    ...(params.language ? { language: params.language } : {}),
    ...(params.recommendedResources.length > 0
      ? { recommendedResources: params.recommendedResources }
      : {}),
    ...(params.suggestedFollowUps.length > 0
      ? { suggestedFollowUps: params.suggestedFollowUps }
      : {}),
  };

  if (storageMode === 'table') {
    const upsertRes = await settledWithinBudget(
      ctx.supabase
        .from('assistant_conversations')
        .upsert(
          {
            id: activeConversation.id,
            user_id: ctx.userId,
            title: activeConversation.title,
            active_roadmap_id: activeConversation.activeRoadmapId,
            active_stage_id: activeConversation.activeStageId,
            active_lesson_id: activeConversation.activeLessonId,
            created_at: activeConversation.createdAt,
            updated_at: activeConversation.updatedAt,
          },
          { onConflict: 'id' }
        ),
      PERSISTENCE_TIMEOUT_MS,
      { error: { code: 'TIMEOUT', message: 'Persistence timed out' } }
    );

    if (upsertRes.error) {
      if (isMissingAssistantTableError(upsertRes.error) || upsertRes.error.code === 'TIMEOUT') {
        storageMode = ctx.activeRoadmapId ? 'roadmap_fallback' : 'ephemeral';
      } else {
        console.error('[Skillora] Assistant conversation upsert failed:', upsertRes.error.code);
        storageMode = ctx.activeRoadmapId ? 'roadmap_fallback' : 'ephemeral';
      }
    } else {
      // Idempotent upsert ignores duplicate IDs on retries so user/assistant messages are never saved twice.
      const insertMsgsRes = await settledWithinBudget(
        ctx.supabase.from('assistant_messages').upsert(
          [
            {
              id: userMessage.id,
              conversation_id: activeConversation.id,
              user_id: ctx.userId,
              sender: 'user',
              content: userMessage.text,
              created_at: userMessage.createdAt,
            },
            {
              id: assistantMessage.id,
              conversation_id: activeConversation.id,
              user_id: ctx.userId,
              sender: 'assistant',
              content: assistantMessage.text,
              code_snippet: assistantMessage.codeSnippet ?? null,
              code_language: assistantMessage.language ?? null,
              recommended_resources: assistantMessage.recommendedResources ?? [],
              suggested_follow_ups: assistantMessage.suggestedFollowUps ?? [],
              created_at: assistantMessage.createdAt,
            },
          ],
          { onConflict: 'id', ignoreDuplicates: true }
        ),
        PERSISTENCE_TIMEOUT_MS,
        { error: { code: 'TIMEOUT', message: 'Message save timed out' } }
      );

      if (insertMsgsRes.error) {
        storageMode = ctx.activeRoadmapId ? 'roadmap_fallback' : 'ephemeral';
      }
    }
  }

  if (storageMode !== 'table') {
    const existingStore = readFallbackStore(ctx);
    const existingEntry = existingStore.find(
      (e) => e.conversation.id === activeConversation!.id
    );
    const existingMsgs = existingEntry?.messages ?? [];
    const seenIds = new Set(existingMsgs.map((m) => m.id));
    const toAppend = [userMessage, assistantMessage].filter((m) => !seenIds.has(m.id));
    const nextEntry: FallbackConversationStore = {
      conversation: activeConversation,
      messages: [...existingMsgs, ...toAppend],
    };
    const otherEntries = existingStore.filter(
      (e) => e.conversation.id !== activeConversation!.id
    );
    storageMode = await settledWithinBudget(
      writeFallbackStore(ctx, [nextEntry, ...otherEntries]),
      PERSISTENCE_TIMEOUT_MS,
      'ephemeral' as const
    );
  }

  return {
    conversation: activeConversation,
    userMessage,
    assistantMessage,
    storageMode,
  };
}

interface ModelExecutionAttempt {
  model: string;
  thinkingLevel: ThinkingLevel;
  firstTokenTimeoutMs: number;
  isPrimary: boolean;
  isHalfOpenProbe: boolean;
}

export function buildModelExecutionPlan(isStream: boolean): ModelExecutionAttempt[] {
  const { usePrimary, isHalfOpenProbe } = shouldTryPrimaryModel();
  const plan: ModelExecutionAttempt[] = [];

  if (usePrimary) {
    plan.push({
      model: PRIMARY_GEMINI_MODEL,
      thinkingLevel: ThinkingLevel.LOW,
      firstTokenTimeoutMs: isStream
        ? PRIMARY_STREAM_FIRST_TOKEN_TIMEOUT_MS
        : PRIMARY_JSON_TIMEOUT_MS,
      isPrimary: true,
      isHalfOpenProbe,
    });
  }

  // Fallback attempts using verified fast free-tier model (with bounded retry for transient glitches)
  plan.push({
    model: FALLBACK_GEMINI_MODEL,
    thinkingLevel: ThinkingLevel.MINIMAL,
    firstTokenTimeoutMs: isStream
      ? FALLBACK_STREAM_FIRST_TOKEN_TIMEOUT_MS
      : FALLBACK_JSON_TIMEOUT_MS,
    isPrimary: false,
    isHalfOpenProbe: false,
  });
  plan.push({
    model: FALLBACK_GEMINI_MODEL,
    thinkingLevel: ThinkingLevel.MINIMAL,
    firstTokenTimeoutMs: isStream
      ? FALLBACK_STREAM_FIRST_TOKEN_TIMEOUT_MS
      : FALLBACK_JSON_TIMEOUT_MS,
    isPrimary: false,
    isHalfOpenProbe: false,
  });

  return plan;
}

export async function handleAssistantChatRequest(params: {
  authorizationHeader?: string;
  conversationId?: string;
  message: string;
  history?: AssistantHistoryTurnInput[];
  lessonContext?: AssistantLessonContextInput;
  clientTurnId?: string;
  requestId?: string;
}): Promise<{
  requestId: string;
  conversation: AssistantConversationRecord;
  userMessage: AssistantMessageRecord;
  assistantMessage: AssistantMessageRecord;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
  diagnostics: {
    modelUsed: string;
    totalMs: number;
    contextMs: number;
    historyMs: number;
  };
}> {
  const requestId = createRequestId(params.requestId);
  const reqStart = Date.now();
  const prepared = await prepareChatContextAndHistory(params);
  const releaseUserSlot = acquireUserConcurrencySlot(prepared.ctx.userId);
  let releaseGlobalSlot: (() => void) | null = null;

  try {
    const systemInstruction = buildStudentSystemInstruction(
      prepared.ctx,
      prepared.candidateResources,
      'json'
    );

    const ai = getGeminiClient();
    releaseGlobalSlot = await acquireGlobalAiSlot();

    const executionPlan = buildModelExecutionPlan(false);
    let responseText = '';
    let modelUsed = executionPlan[0].model;
    let lastError: unknown = null;

    for (let idx = 0; idx < executionPlan.length; idx += 1) {
      const step = executionPlan[idx];
      const elapsedMs = Date.now() - reqStart;
      const remainingBudgetMs = JSON_MAX_TOTAL_MS - elapsedMs;
      if (remainingBudgetMs <= 1_500) {
        lastError =
          lastError ??
          new AssistantApiError(
            504,
            'GEMINI_TIMEOUT',
            'The AI Study Companion took too long to respond. Please retry.'
          );
        break;
      }

      const attemptTimeoutMs = Math.min(step.firstTokenTimeoutMs, remainingBudgetMs);
      const attemptController = new AbortController();
      let attemptTimedOut = false;
      const attemptTimer = setTimeout(() => {
        attemptTimedOut = true;
        attemptController.abort();
      }, attemptTimeoutMs);

      try {
        const response = await ai.models.generateContent({
          model: step.model,
          contents: prepared.contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: step.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: ASSISTANT_CHAT_SCHEMA,
            abortSignal: attemptController.signal,
          },
        });
        responseText = (response.text ?? '').trim();
        modelUsed = step.model;
        if (step.isPrimary) {
          recordPrimarySuccess(step.isHalfOpenProbe);
        }
        break;
      } catch (innerErr) {
        clearTimeout(attemptTimer);
        const category = attemptTimedOut
          ? 'GEMINI_TIMEOUT'
          : classifyGeminiErrorCategory(innerErr);
        lastError = attemptTimedOut
          ? new AssistantApiError(
              504,
              'GEMINI_TIMEOUT',
              'The AI Study Companion took too long to respond. Please retry.'
            )
          : innerErr;

        if (step.isPrimary) {
          recordPrimaryFailure(category, step.isHalfOpenProbe);
        }

        const hasNext = idx + 1 < executionPlan.length;
        if (!hasNext || (!attemptTimedOut && !isTransientOrFallbackEligibleError(innerErr))) {
          throw mapGeminiError(lastError);
        }

        // Only apply backoff when retrying the same fallback model (immediate switch from primary -> fallback)
        if (!step.isPrimary) {
          const backoffMs = computeExponentialBackoffMs(idx);
          if (Date.now() - reqStart + backoffMs + 1_500 >= JSON_MAX_TOTAL_MS) {
            throw mapGeminiError(lastError);
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      } finally {
        clearTimeout(attemptTimer);
      }
    }

    if (!responseText && lastError) {
      throw mapGeminiError(lastError);
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(stripJsonCodeFences(responseText) || '{}') as Record<string, unknown>;
    } catch {
      const plainFallback = sanitizeTextNoUrls(responseText);
      if (plainFallback && !plainFallback.startsWith('{') && !plainFallback.startsWith('[')) {
        parsed = { answer: plainFallback, recommendedResourceIds: [], suggestedFollowUps: [] };
      } else {
        throw new AssistantApiError(
          502,
          'AI_RESPONSE_PARSE_ERROR',
          'The AI Study Companion returned an unreadable response. Please retry.'
        );
      }
    }

    recordChatUsage(prepared.ctx.userId);

    const answer = sanitizeTextNoUrls(
      parsed.answer,
      'Let us work through this step by step. Could you share which part you would like to focus on first?'
    );

    const codeSnippet =
      typeof parsed.codeSnippet === 'string' && parsed.codeSnippet.trim()
        ? parsed.codeSnippet.trim()
        : undefined;
    const language =
      codeSnippet && typeof parsed.language === 'string' && parsed.language.trim()
        ? parsed.language.trim().toLowerCase()
        : undefined;

    const recommendedIds = Array.isArray(parsed.recommendedResourceIds)
      ? parsed.recommendedResourceIds.filter((id): id is string => typeof id === 'string')
      : [];

    const recommendedResources = resolveRecommendedResourcesFromIds(
      recommendedIds,
      prepared.candidateById,
      prepared.fullCatalogById
    );

    const suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps)
      ? parsed.suggestedFollowUps
          .map((s) => sanitizeTextNoUrls(s))
          .filter((s) => s.length > 0 && s.length <= 110)
          .slice(0, 3)
      : [];

    const saved = await persistAssistantTurn({
      ctx: prepared.ctx,
      targetConversationId: prepared.targetConversationId,
      activeConversation: prepared.activeConversation,
      storageMode: prepared.storageMode,
      trimmedMessage: prepared.trimmedMessage,
      answer,
      codeSnippet,
      language,
      recommendedResources,
      suggestedFollowUps,
      clientTurnId: params.clientTurnId,
    });

    const totalMs = Date.now() - reqStart;
    console.info(
      `[Skillora][Assistant][${requestId}] JSON completed model=${modelUsed} totalMs=${totalMs} contextMs=${prepared.timings.contextMs} historyMs=${prepared.timings.historyMs} turns=${prepared.contents.length} answerLen=${answer.length} storage=${saved.storageMode}`
    );

    return {
      requestId,
      ...saved,
      diagnostics: {
        modelUsed,
        totalMs,
        contextMs: prepared.timings.contextMs,
        historyMs: prepared.timings.historyMs,
      },
    };
  } catch (err) {
    const mapped = mapGeminiError(err);
    console.error(
      `[Skillora][Assistant][${requestId}] JSON failed status=${mapped.status} code=${mapped.code} totalMs=${Date.now() - reqStart}`
    );
    throw mapped;
  } finally {
    releaseGlobalSlot?.();
    releaseUserSlot();
  }
}

export async function handleAssistantChatStreamRequest(params: {
  authorizationHeader?: string;
  conversationId?: string;
  message: string;
  history?: AssistantHistoryTurnInput[];
  lessonContext?: AssistantLessonContextInput;
  clientTurnId?: string;
  requestId?: string;
  signal?: AbortSignal;
  onStart?: (meta: { requestId: string; conversationId: string | null }) => void;
  onDelta: (deltaText: string) => void;
}): Promise<{
  requestId: string;
  conversation: AssistantConversationRecord;
  userMessage: AssistantMessageRecord;
  assistantMessage: AssistantMessageRecord;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
  diagnostics: {
    modelUsed: string;
    firstTokenMs: number;
    totalMs: number;
    contextMs: number;
    historyMs: number;
    chunks: number;
  };
}> {
  const requestId = createRequestId(params.requestId);
  const reqStart = Date.now();
  const prepared = await prepareChatContextAndHistory(params);
  const releaseUserSlot = acquireUserConcurrencySlot(prepared.ctx.userId);
  let releaseGlobalSlot: (() => void) | null = null;

  try {
    const streamInstruction = buildStudentSystemInstruction(
      prepared.ctx,
      prepared.candidateResources,
      'stream'
    );

    const ai = getGeminiClient();
    releaseGlobalSlot = await acquireGlobalAiSlot(params.signal);

    params.onStart?.({
      requestId,
      conversationId: prepared.activeConversation?.id ?? prepared.targetConversationId ?? null,
    });

    const executionPlan = buildModelExecutionPlan(true);
    let fullOutput = '';
    let firstTokenMs: number | null = null;
    let chunkCount = 0;
    let modelUsed = executionPlan[0].model;
    let lastError: unknown = null;

    for (let idx = 0; idx < executionPlan.length; idx += 1) {
      if (params.signal?.aborted) {
        throw new AssistantApiError(499, 'CLIENT_ABORTED', 'Request was cancelled.');
      }

      const step = executionPlan[idx];
      const elapsedMs = Date.now() - reqStart;
      const remainingTotalMs = STREAM_MAX_TOTAL_MS - elapsedMs;
      if (remainingTotalMs <= 1_500) {
        lastError =
          lastError ??
          new AssistantApiError(
            504,
            'GEMINI_TIMEOUT',
            'The AI Study Companion took too long to respond. Please retry.'
          );
        break;
      }

      // Each attempt gets an isolated AbortController so primary timeout never poisons fallback attempts.
      const attemptController = new AbortController();
      let attemptTimedOut = false;
      let firstTokenTimedOut = false;

      const forwardAbort = () => attemptController.abort();
      if (params.signal) {
        params.signal.addEventListener('abort', forwardAbort, { once: true });
      }

      let idleTimer: NodeJS.Timeout | undefined;
      const totalTimer = setTimeout(() => {
        attemptTimedOut = true;
        attemptController.abort();
      }, remainingTotalMs);

      const firstTokenLimit = Math.min(step.firstTokenTimeoutMs, remainingTotalMs);
      const firstTokenTimer = setTimeout(() => {
        if (chunkCount === 0) {
          firstTokenTimedOut = true;
          attemptController.abort();
        }
      }, firstTokenLimit);

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          attemptTimedOut = true;
          attemptController.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      try {
        const stream = await ai.models.generateContentStream({
          model: step.model,
          contents: prepared.contents,
          config: {
            systemInstruction: streamInstruction,
            thinkingConfig: { thinkingLevel: step.thinkingLevel },
            abortSignal: attemptController.signal,
          },
        });

        for await (const chunk of stream) {
          const rawPiece = chunk.text ?? '';
          if (!rawPiece) continue;
          if (chunkCount === 0) {
            clearTimeout(firstTokenTimer);
            firstTokenMs = Date.now() - reqStart;
            if (step.isPrimary) {
              recordPrimarySuccess(step.isHalfOpenProbe);
            }
          }
          resetIdleTimer();
          chunkCount += 1;
          fullOutput += rawPiece;
          const cleanDelta = stripUrlsKeepWhitespace(rawPiece);
          if (cleanDelta) {
            params.onDelta(cleanDelta);
          }
        }

        modelUsed = step.model;
        if (chunkCount === 0) {
          if (step.isPrimary) {
            recordPrimaryFailure('EMPTY_STREAM', step.isHalfOpenProbe);
          }
          if (idx + 1 < executionPlan.length) {
            if (!step.isPrimary) {
              const backoffMs = computeExponentialBackoffMs(idx);
              if (Date.now() - reqStart + backoffMs + 1_500 < STREAM_MAX_TOTAL_MS) {
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
              }
            }
            continue;
          }
        }
        if (chunkCount > 0) {
          break;
        }
      } catch (innerErr) {
        if (params.signal?.aborted) {
          throw new AssistantApiError(499, 'CLIENT_ABORTED', 'Request was cancelled.');
        }

        const timedOutBeforeFirstToken = firstTokenTimedOut || (attemptTimedOut && chunkCount === 0);
        const category = timedOutBeforeFirstToken
          ? 'GEMINI_FIRST_TOKEN_TIMEOUT'
          : attemptTimedOut
          ? 'GEMINI_TIMEOUT'
          : classifyGeminiErrorCategory(innerErr);

        lastError = timedOutBeforeFirstToken || attemptTimedOut
          ? new AssistantApiError(
              504,
              'GEMINI_TIMEOUT',
              'The AI Study Companion took too long to respond. Please retry.'
            )
          : innerErr;

        if (step.isPrimary) {
          recordPrimaryFailure(category, step.isHalfOpenProbe);
        }

        // Never switch/retry mid-stream after chunks have already reached the client.
        if (chunkCount > 0) {
          throw mapGeminiError(lastError);
        }

        const canFailoverOrRetry =
          idx + 1 < executionPlan.length &&
          (timedOutBeforeFirstToken || isTransientOrFallbackEligibleError(innerErr));

        if (!canFailoverOrRetry) {
          throw mapGeminiError(lastError);
        }

        if (!step.isPrimary) {
          const backoffMs = computeExponentialBackoffMs(idx);
          if (Date.now() - reqStart + backoffMs + 1_500 >= STREAM_MAX_TOTAL_MS) {
            throw mapGeminiError(lastError);
          }
          console.warn(
            `[Skillora][Assistant][${requestId}] Transient error on ${step.model} (${category}), retrying in ${backoffMs}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        } else {
          console.warn(
            `[Skillora][Assistant][${requestId}] Failing over from ${step.model} (${category}) to ${FALLBACK_GEMINI_MODEL}.`
          );
        }
      } finally {
        clearTimeout(firstTokenTimer);
        clearTimeout(totalTimer);
        if (idleTimer) clearTimeout(idleTimer);
        if (params.signal) {
          params.signal.removeEventListener('abort', forwardAbort);
        }
      }
    }

    const extracted = extractCodeBlockFromMarkdownText(fullOutput);
    const answer = sanitizeTextNoUrls(extracted.cleanText);

    if (!answer) {
      if (lastError) {
        throw mapGeminiError(lastError);
      }
      throw new AssistantApiError(
        502,
        'AI_EMPTY_RESPONSE',
        'The AI Study Companion returned an empty response. Please retry.'
      );
    }

    recordChatUsage(prepared.ctx.userId);

    const recommendedResources = selectStreamRecommendedResources(
      prepared.candidateResources,
      prepared.trimmedMessage,
      answer
    );
    const suggestedFollowUps = buildStreamSuggestedFollowUps(
      prepared.ctx,
      prepared.trimmedMessage
    );

    const saved = await persistAssistantTurn({
      ctx: prepared.ctx,
      targetConversationId: prepared.targetConversationId,
      activeConversation: prepared.activeConversation,
      storageMode: prepared.storageMode,
      trimmedMessage: prepared.trimmedMessage,
      answer,
      codeSnippet: extracted.codeSnippet,
      language: extracted.language,
      recommendedResources,
      suggestedFollowUps,
      clientTurnId: params.clientTurnId,
    });

    const totalMs = Date.now() - reqStart;
    const resolvedFirstTokenMs = firstTokenMs ?? totalMs;
    console.info(
      `[Skillora][Assistant][${requestId}] Stream completed model=${modelUsed} firstTokenMs=${resolvedFirstTokenMs} totalMs=${totalMs} contextMs=${prepared.timings.contextMs} historyMs=${prepared.timings.historyMs} chunks=${chunkCount} answerLen=${answer.length} storage=${saved.storageMode}`
    );

    return {
      requestId,
      ...saved,
      diagnostics: {
        modelUsed,
        firstTokenMs: resolvedFirstTokenMs,
        totalMs,
        contextMs: prepared.timings.contextMs,
        historyMs: prepared.timings.historyMs,
        chunks: chunkCount,
      },
    };
  } catch (err) {
    if (err instanceof AssistantApiError && err.code === 'CLIENT_ABORTED') {
      console.info(
        `[Skillora][Assistant][${requestId}] Client aborted stream after ${Date.now() - reqStart}ms`
      );
      throw err;
    }
    const mapped = mapGeminiError(err);
    console.error(
      `[Skillora][Assistant][${requestId}] Stream failed status=${mapped.status} code=${mapped.code} totalMs=${Date.now() - reqStart}`
    );
    throw mapped;
  } finally {
    releaseGlobalSlot?.();
    releaseUserSlot();
  }
}

