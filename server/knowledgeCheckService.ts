import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AdaptiveThresholdsConfig,
  DEFAULT_ADAPTIVE_THRESHOLDS,
  classifyTopicProficiency,
  getAdaptiveRecommendationTier,
  normalizeAdaptiveThresholds,
} from '../shared/knowledgeCheckConfig';
import type {
  KnowledgeCheckAdaptiveRecommendation,
  KnowledgeCheckAnswerDetail,
  KnowledgeCheckInstantFeedback,
  KnowledgeCheckStartResponse,
  KnowledgeCheckTopicBreakdown,
  LessonKnowledgeCheckAttemptRecord,
} from '../src/types';

export interface ServerQuizQuestion {
  id: string;
  topic: string;
  objective: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  optionExplanations: string[];
  conceptExplanation: string;
}

export interface NextLessonTarget {
  stageId: string;
  lessonId: string;
  lessonTitle: string;
}

interface SignedQuizSessionPayload {
  submissionId: string;
  userId: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  lessonTitle: string;
  nextLesson: NextLessonTarget | null;
  issuedAt: number;
  questions: ServerQuizQuestion[];
}

export class KnowledgeCheckApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'KnowledgeCheckApiError';
    this.status = status;
    this.code = code;
  }
}

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Track first-checked answers per submissionId so instant feedback cannot be gamed
const checkedAnswersBySubmission = new Map<
  string,
  { createdAt: number; answers: Map<string, number> }
>();

// Coalesce concurrent submit requests for the same (userId, submissionId)
const inFlightSubmissions = new Map<
  string,
  Promise<{
    attempt: LessonKnowledgeCheckAttemptRecord;
    duplicatePrevented: boolean;
    storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
  }>
>();

const completedSubmissionsCache = new Map<
  string,
  {
    createdAt: number;
    attempt: LessonKnowledgeCheckAttemptRecord;
    storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
  }
>();

// Rate limit quiz generation requests per user
const quizStartHistoryByUser = new Map<string, number[]>();
const QUIZ_COOLDOWN_MS = 2_000;
const QUIZ_WINDOW_MS = 10 * 60_000;
const MAX_QUIZZES_PER_WINDOW = 40;

function cleanupMemoryStores() {
  const now = Date.now();
  for (const [key, entry] of checkedAnswersBySubmission.entries()) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      checkedAnswersBySubmission.delete(key);
    }
  }
  for (const [key, entry] of completedSubmissionsCache.entries()) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      completedSubmissionsCache.delete(key);
    }
  }
}

function getQuizSigningSecret(): string {
  const explicit = process.env.KNOWLEDGE_CHECK_SIGNING_SECRET?.trim();
  if (explicit) return explicit;
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) {
    return crypto
      .createHash('sha256')
      .update(`skillora-kc:${gemini}`)
      .digest('hex');
  }
  return EPHEMERAL_SECRET;
}

export function signQuizSessionToken(payload: SignedQuizSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getQuizSigningSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifyQuizSessionToken(
  token: string,
  expectedUserId: string
): SignedQuizSessionPayload {
  const trimmed = token?.trim() || '';
  const parts = trimmed.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new KnowledgeCheckApiError(
      400,
      'INVALID_QUIZ_TOKEN',
      'Quiz session token is invalid. Please start a fresh Knowledge Check.'
    );
  }

  const [body, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getQuizSigningSecret())
    .update(body)
    .digest('base64url');

  const sigBufA = Buffer.from(providedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (
    sigBufA.length !== sigBufB.length ||
    !crypto.timingSafeEqual(sigBufA, sigBufB)
  ) {
    throw new KnowledgeCheckApiError(
      403,
      'QUIZ_TOKEN_SIGNATURE_INVALID',
      'Quiz verification failed. Please restart the Knowledge Check.'
    );
  }

  let parsed: SignedQuizSessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new KnowledgeCheckApiError(
      400,
      'QUIZ_TOKEN_MALFORMED',
      'Could not read your active quiz session. Please restart the Knowledge Check.'
    );
  }

  if (parsed.userId !== expectedUserId) {
    throw new KnowledgeCheckApiError(
      403,
      'QUIZ_USER_MISMATCH',
      'This Knowledge Check session belongs to a different account.'
    );
  }

  if (
    !parsed.submissionId ||
    !parsed.roadmapId ||
    !parsed.lessonId ||
    !Array.isArray(parsed.questions) ||
    parsed.questions.length === 0
  ) {
    throw new KnowledgeCheckApiError(
      400,
      'QUIZ_TOKEN_INCOMPLETE',
      'Quiz session payload is incomplete. Please restart the Knowledge Check.'
    );
  }

  if (Date.now() - Number(parsed.issuedAt || 0) > SESSION_TTL_MS) {
    throw new KnowledgeCheckApiError(
      410,
      'QUIZ_TOKEN_EXPIRED',
      'This Knowledge Check session expired. Please start a new attempt.'
    );
  }

  return parsed;
}

export function getServerAdaptiveThresholds(
  overrides?: Partial<AdaptiveThresholdsConfig>
): AdaptiveThresholdsConfig {
  const envAdvance = Number(process.env.KNOWLEDGE_CHECK_ADVANCE_MIN_PERCENT);
  const envPractice = Number(process.env.KNOWLEDGE_CHECK_PRACTICE_MIN_PERCENT);
  const envTopicStrong = Number(process.env.KNOWLEDGE_CHECK_TOPIC_STRONG_MIN_PERCENT);
  const envTopicMod = Number(process.env.KNOWLEDGE_CHECK_TOPIC_MODERATE_MIN_PERCENT);

  return normalizeAdaptiveThresholds({
    advanceMinPercent:
      overrides?.advanceMinPercent ??
      (Number.isFinite(envAdvance) ? envAdvance : DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent),
    practiceMinPercent:
      overrides?.practiceMinPercent ??
      (Number.isFinite(envPractice) ? envPractice : DEFAULT_ADAPTIVE_THRESHOLDS.practiceMinPercent),
    topicStrongMinPercent:
      overrides?.topicStrongMinPercent ??
      (Number.isFinite(envTopicStrong)
        ? envTopicStrong
        : DEFAULT_ADAPTIVE_THRESHOLDS.topicStrongMinPercent),
    topicModerateMinPercent:
      overrides?.topicModerateMinPercent ??
      (Number.isFinite(envTopicMod)
        ? envTopicMod
        : DEFAULT_ADAPTIVE_THRESHOLDS.topicModerateMinPercent),
  });
}

function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new KnowledgeCheckApiError(
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

async function authenticateBearerRequest(authorizationHeader?: string): Promise<{
  userId: string;
  supabase: SupabaseClient;
}> {
  const authHeader = authorizationHeader?.trim() || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new KnowledgeCheckApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with an active Skillora session.'
    );
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new KnowledgeCheckApiError(
      401,
      'INVALID_AUTH_TOKEN',
      'Missing authentication token. Please sign in again.'
    );
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new KnowledgeCheckApiError(
      401,
      'UNAUTHORIZED',
      'Your session has expired or is invalid. Please sign in again.'
    );
  }

  return { userId: userData.user.id, supabase };
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new KnowledgeCheckApiError(
      503,
      'GEMINI_KEY_MISSING',
      'GEMINI_API_KEY is not configured on the server.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown): KnowledgeCheckApiError {
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown AI error');
  const lower = rawMessage.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return new KnowledgeCheckApiError(
      502,
      'GEMINI_CONFIG_ERROR',
      'The AI service key is invalid. Please verify GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return new KnowledgeCheckApiError(
      502,
      'GEMINI_PERMISSION_DENIED',
      'AI quiz generation could not be authorized. Please check GEMINI_API_KEY.'
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return new KnowledgeCheckApiError(
      429,
      'GEMINI_QUOTA_EXCEEDED',
      'The AI service is temporarily busy due to quota limits. Please wait a moment and try again.'
    );
  }
  return new KnowledgeCheckApiError(
    502,
    'GEMINI_QUIZ_FAILED',
    'We could not generate your Knowledge Check right now. Please try again.'
  );
}

function sanitizeText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\bwww\.[^\s)]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function enforceQuizRateLimit(userId: string) {
  const now = Date.now();
  const timestamps = (quizStartHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < QUIZ_WINDOW_MS
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < QUIZ_COOLDOWN_MS) {
    const waitSec = Math.ceil((QUIZ_COOLDOWN_MS - (now - lastTs)) / 1000);
    throw new KnowledgeCheckApiError(
      429,
      'RATE_LIMITED_COOLDOWN',
      `Please wait ${waitSec}s before starting another Knowledge Check.`
    );
  }
  if (timestamps.length >= MAX_QUIZZES_PER_WINDOW) {
    throw new KnowledgeCheckApiError(
      429,
      'RATE_LIMITED_WINDOW',
      'You have started many Knowledge Checks recently. Please pause briefly and try again.'
    );
  }
  timestamps.push(now);
  quizStartHistoryByUser.set(userId, timestamps);
}

function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('lesson_knowledge_checks') &&
      (msg.includes('does not exist') || msg.includes('could not find')))
  );
}

const QUIZ_GENERATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      description: 'Generate 4 multiple-choice questions (between 3 and 5) directly testing the lesson learning objectives.',
      items: {
        type: Type.OBJECT,
        properties: {
          topic: {
            type: Type.STRING,
            description: 'Short 2-4 word concept or sub-skill name (e.g., Closures, Array Methods, SQL Joins).',
          },
          objective: {
            type: Type.STRING,
            description: 'The specific lesson learning objective tested by this question.',
          },
          question: {
            type: Type.STRING,
            description: 'Clear, unambiguous multiple-choice question testing comprehension or application.',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 4 distinct multiple-choice answer options.',
          },
          correctAnswerIndex: {
            type: Type.INTEGER,
            description: 'Zero-based index (0 to 3) of the single correct option.',
          },
          optionExplanations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 4 short explanations corresponding index-for-index to each option, stating clearly why that option is correct or incorrect.',
          },
          conceptExplanation: {
            type: Type.STRING,
            description: 'Concise 1-2 sentence explanation of the underlying concept behind this question.',
          },
        },
        required: [
          'topic',
          'objective',
          'question',
          'options',
          'correctAnswerIndex',
          'optionExplanations',
          'conceptExplanation',
        ],
      },
    },
  },
  required: ['questions'],
};

interface RoadmapStageShape {
  id?: unknown;
  title?: unknown;
  difficulty?: unknown;
  lessons?: unknown[];
}

interface RoadmapLessonShape {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  learningObjectives?: unknown;
}

function findNextLessonInRoadmap(
  stages: RoadmapStageShape[],
  currentStageId: string,
  currentLessonId: string
): NextLessonTarget | null {
  const flattened: NextLessonTarget[] = [];
  for (const stage of stages) {
    const sId = typeof stage.id === 'string' ? stage.id : '';
    const lessons = Array.isArray(stage.lessons)
      ? (stage.lessons as RoadmapLessonShape[])
      : [];
    for (const lesson of lessons) {
      const lId = typeof lesson.id === 'string' ? lesson.id : '';
      const lTitle = typeof lesson.title === 'string' ? lesson.title : 'Next Lesson';
      if (sId && lId) {
        flattened.push({ stageId: sId, lessonId: lId, lessonTitle: lTitle });
      }
    }
  }
  const idx = flattened.findIndex(
    (entry) => entry.stageId === currentStageId && entry.lessonId === currentLessonId
  );
  if (idx >= 0 && idx + 1 < flattened.length) {
    return flattened[idx + 1];
  }
  return null;
}

export async function handleStartKnowledgeCheck(params: {
  authorizationHeader?: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  questionCount?: number;
}): Promise<KnowledgeCheckStartResponse> {
  cleanupMemoryStores();
  if (!params.roadmapId || !params.stageId || !params.lessonId) {
    throw new KnowledgeCheckApiError(
      400,
      'MISSING_LESSON_IDENTIFIERS',
      'Roadmap ID, stage ID, and lesson ID are required to start a Knowledge Check.'
    );
  }

  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  enforceQuizRateLimit(userId);

  const [roadmapRes, profileRes, priorGapsRes] = await Promise.all([
    supabase
      .from('learning_roadmaps')
      .select('id, title, career_goal, roadmap_data')
      .eq('id', params.roadmapId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('student_profiles')
      .select('career_goal, knowledge_level, field_of_study')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('lesson_knowledge_checks')
      .select('knowledge_gaps, completed_at')
      .eq('user_id', userId)
      .eq('lesson_id', params.lessonId)
      .order('completed_at', { ascending: false })
      .limit(5),
  ]);

  if (roadmapRes.error) {
    throw new KnowledgeCheckApiError(
      roadmapRes.error.code === '42501' ? 403 : 500,
      roadmapRes.error.code || 'ROADMAP_FETCH_FAILED',
      'Could not load your roadmap from Supabase.'
    );
  }
  if (!roadmapRes.data) {
    throw new KnowledgeCheckApiError(
      404,
      'ROADMAP_NOT_FOUND',
      'The selected learning roadmap could not be found.'
    );
  }

  const roadmapRow = roadmapRes.data as Record<string, unknown>;
  const roadmapData = (roadmapRow.roadmap_data ?? {}) as Record<string, unknown>;
  const stages = Array.isArray(roadmapData.stages)
    ? (roadmapData.stages as RoadmapStageShape[])
    : [];

  const stage = stages.find((s) => s.id === params.stageId);
  if (!stage) {
    throw new KnowledgeCheckApiError(404, 'STAGE_NOT_FOUND', 'Stage not found in this roadmap.');
  }

  const lessons = Array.isArray(stage.lessons)
    ? (stage.lessons as RoadmapLessonShape[])
    : [];
  const lesson = lessons.find((l) => l.id === params.lessonId);
  if (!lesson) {
    throw new KnowledgeCheckApiError(404, 'LESSON_NOT_FOUND', 'Lesson not found in this stage.');
  }

  const lessonTitle = sanitizeText(lesson.title, 'Lesson');
  const lessonDescription = sanitizeText(lesson.description, '');
  const stageTitle = sanitizeText(stage.title, 'Learning Stage');
  const lessonObjectives = Array.isArray(lesson.learningObjectives)
    ? lesson.learningObjectives
        .filter((o): o is string => typeof o === 'string')
        .map((o) => sanitizeText(o))
        .filter(Boolean)
    : [];

  // Collect recent weak topics for this student/lesson from the parallel lightweight query + roadmap fallback
  const tableLessonGaps =
    !priorGapsRes.error && Array.isArray(priorGapsRes.data)
      ? priorGapsRes.data.flatMap((row) => {
          const gaps = (row as Record<string, unknown>).knowledge_gaps;
          return Array.isArray(gaps)
            ? gaps.filter((g): g is string => typeof g === 'string')
            : [];
        })
      : [];
  const fallbackLessonGaps = Array.isArray(roadmapData.knowledgeCheckAttempts)
    ? (roadmapData.knowledgeCheckAttempts as Record<string, unknown>[])
        .filter((a) => (a.lessonId ?? a.lesson_id) === params.lessonId)
        .flatMap((a) => {
          const gaps = a.knowledgeGaps ?? a.knowledge_gaps;
          return Array.isArray(gaps)
            ? gaps.filter((g): g is string => typeof g === 'string')
            : [];
        })
    : [];
  const priorLessonGaps = Array.from(
    new Set([...tableLessonGaps, ...fallbackLessonGaps].filter(Boolean))
  ).slice(0, 6);

  const profileRow = (profileRes.data ?? {}) as Record<string, unknown>;
  const knowledgeLevel =
    profileRow.knowledge_level === 'Beginner' ||
    profileRow.knowledge_level === 'Intermediate' ||
    profileRow.knowledge_level === 'Advanced'
      ? profileRow.knowledge_level
      : typeof stage.difficulty === 'string'
      ? stage.difficulty
      : 'Intermediate';

  const targetCount = Math.min(5, Math.max(3, Number(params.questionCount) || 4));
  const ai = createGeminiClient();

  const systemInstruction = [
    'You are Skillora’s assessment specialist generating a Lesson Knowledge Check.',
    `Generate exactly ${targetCount} multiple-choice questions strictly tailored to the current lesson and its learning objectives.`,
    'Rules:',
    '- Each question must map to a concise 2-4 word topic tag (e.g., "Variable Scope", "Async Promises", "Index Design") so Skillora can detect topic-level knowledge gaps.',
    '- Provide exactly 4 clear, distinct answer options.',
    '- Set correctAnswerIndex (0 to 3) accurately.',
    '- Provide optionExplanations as a 4-item array aligned 1-to-1 with options[0..3], keeping each explanation to 1 clear, concise sentence.',
    '- Provide conceptExplanation summarizing the core underlying principle in 1 concise sentence.',
    '- Never include URLs.',
    '- Vary correctAnswerIndex across questions so answers are not all index 0.',
    '- Return strictly valid JSON matching the schema.',
  ].join('\n');

  const prompt = [
    `Stage: ${stageTitle} (${knowledgeLevel} level)`,
    `Lesson Title: ${lessonTitle}`,
    `Lesson Summary: ${lessonDescription || 'Core concepts and applied skills'}`,
    `Learning Objectives:\n${
      lessonObjectives.length > 0
        ? lessonObjectives.map((o, i) => `${i + 1}. ${o}`).join('\n')
        : `1. Master the core concepts of ${lessonTitle}`
    }`,
    priorLessonGaps.length > 0
      ? `Student Prior Knowledge Gaps in this lesson (reinforce with clear diagnostic questions): ${priorLessonGaps.join(', ')}`
      : 'Student Prior Knowledge Gaps: None recorded yet for this lesson.',
  ].join('\n\n');

  const generateQuizWithModel = async (
    model: string,
    timeoutMs: number,
    useLowThinking: boolean
  ): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: QUIZ_GENERATION_SCHEMA,
          abortSignal: controller.signal,
          ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });
      return (response.text ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  };

  let responseText = '';
  try {
    responseText = await generateQuizWithModel('gemini-4-hydrogen', 20_000, true);
    if (!responseText) {
      responseText = await generateQuizWithModel('gemini-3.1-flash-lite', 18_000, false);
    }
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message.toLowerCase() : '';
    const isAuthOrKeyFatal =
      msg.includes('api_key_invalid') ||
      msg.includes('api key not valid') ||
      msg.includes('permission_denied') ||
      msg.includes('403');
    if (isAuthOrKeyFatal) {
      throw mapGeminiError(primaryErr);
    }
    try {
      responseText = await generateQuizWithModel('gemini-3.1-flash-lite', 18_000, false);
    } catch (fallbackErr) {
      throw mapGeminiError(fallbackErr);
    }
  }

  let parsed: { questions?: unknown[] } = {};
  try {
    parsed = JSON.parse(responseText || '{}') as { questions?: unknown[] };
  } catch {
    throw new KnowledgeCheckApiError(
      502,
      'AI_QUIZ_PARSE_ERROR',
      'Could not read the generated Knowledge Check questions. Please retry.'
    );
  }

  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawQuestions.length < 3) {
    throw new KnowledgeCheckApiError(
      502,
      'AI_QUIZ_TOO_FEW_QUESTIONS',
      'The AI service generated too few questions. Please retry.'
    );
  }

  const normalizedQuestions: ServerQuizQuestion[] = rawQuestions
    .slice(0, 5)
    .map((qRaw, idx) => {
      const q = (qRaw && typeof qRaw === 'object' ? qRaw : {}) as Record<string, unknown>;
      const rawOptions = Array.isArray(q.options)
        ? q.options.map((o) => sanitizeText(o)).filter(Boolean).slice(0, 4)
        : [];
      while (rawOptions.length < 4) {
        rawOptions.push(`Option ${String.fromCharCode(65 + rawOptions.length)}`);
      }

      const rawCorrect = Number(q.correctAnswerIndex);
      const correctAnswerIndex =
        Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < 4 ? rawCorrect : 0;

      const rawOptionExps = Array.isArray(q.optionExplanations)
        ? q.optionExplanations.map((e) => sanitizeText(e))
        : [];
      const conceptExplanation = sanitizeText(
        q.conceptExplanation,
        `Understanding how ${lessonTitle} applies to ${sanitizeText(q.topic, lessonTitle)} helps prevent common mistakes.`
      );

      const optionExplanations = rawOptions.map((_, oIdx) => {
        const exp = rawOptionExps[oIdx];
        if (exp) return exp;
        if (oIdx === correctAnswerIndex) {
          return 'This option accurately applies the concept taught in this lesson.';
        }
        return 'This option misses a key requirement of the underlying concept.';
      });

      const fallbackObj =
        lessonObjectives[idx % Math.max(1, lessonObjectives.length)] ||
        `Apply ${lessonTitle}`;

      return {
        id: `kc-${params.lessonId}-q${idx + 1}-${crypto.randomBytes(3).toString('hex')}`,
        topic: sanitizeText(q.topic, `Objective ${idx + 1}`),
        objective: sanitizeText(q.objective, fallbackObj),
        question: sanitizeText(q.question, `Question ${idx + 1} on ${lessonTitle}`),
        options: rawOptions,
        correctAnswerIndex,
        optionExplanations,
        conceptExplanation,
      };
    });

  const submissionId = crypto.randomUUID();
  const nextLesson = findNextLessonInRoadmap(stages, params.stageId, params.lessonId);

  const sessionPayload: SignedQuizSessionPayload = {
    submissionId,
    userId,
    roadmapId: String(roadmapRow.id),
    stageId: params.stageId,
    lessonId: params.lessonId,
    lessonTitle,
    nextLesson,
    issuedAt: Date.now(),
    questions: normalizedQuestions,
  };

  const quizToken = signQuizSessionToken(sessionPayload);

  // Strip answer keys & explanations before sending to the browser
  const clientQuestions = normalizedQuestions.map((q) => ({
    id: q.id,
    topic: q.topic,
    objective: q.objective,
    question: q.question,
    options: q.options,
  }));

  return {
    submissionId,
    quizToken,
    roadmapId: sessionPayload.roadmapId,
    stageId: sessionPayload.stageId,
    lessonId: sessionPayload.lessonId,
    lessonTitle: sessionPayload.lessonTitle,
    questions: clientQuestions,
  };
}

export async function handleCheckSingleAnswer(params: {
  authorizationHeader?: string;
  quizToken: string;
  questionId: string;
  selectedOptionIndex: number;
}): Promise<KnowledgeCheckInstantFeedback> {
  cleanupMemoryStores();
  const { userId } = await authenticateBearerRequest(params.authorizationHeader);
  const session = verifyQuizSessionToken(params.quizToken, userId);

  const question = session.questions.find((q) => q.id === params.questionId);
  if (!question) {
    throw new KnowledgeCheckApiError(
      404,
      'QUESTION_NOT_FOUND',
      'That question does not belong to your current Knowledge Check.'
    );
  }

  const chosen = Number(params.selectedOptionIndex);
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= question.options.length) {
    throw new KnowledgeCheckApiError(
      400,
      'INVALID_OPTION_INDEX',
      'Please select a valid multiple-choice option.'
    );
  }

  // Lock first checked answer on the server for this submissionId + questionId
  let lockedEntry = checkedAnswersBySubmission.get(session.submissionId);
  if (!lockedEntry) {
    lockedEntry = { createdAt: Date.now(), answers: new Map<string, number>() };
    checkedAnswersBySubmission.set(session.submissionId, lockedEntry);
  }
  const finalSelectedIdx = lockedEntry.answers.has(question.id)
    ? lockedEntry.answers.get(question.id)!
    : chosen;
  if (!lockedEntry.answers.has(question.id)) {
    lockedEntry.answers.set(question.id, finalSelectedIdx);
  }

  const isCorrect = finalSelectedIdx === question.correctAnswerIndex;

  return {
    questionId: question.id,
    selectedOptionIndex: finalSelectedIdx,
    correctAnswerIndex: question.correctAnswerIndex,
    isCorrect,
    answerExplanation: question.optionExplanations[finalSelectedIdx] || '',
    correctOptionExplanation:
      question.optionExplanations[question.correctAnswerIndex] || '',
    conceptExplanation: question.conceptExplanation,
  };
}

export function evaluateKnowledgeCheckSubmission(params: {
  userId: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  lessonTitle: string;
  submissionId: string;
  questions: ServerQuizQuestion[];
  submittedAnswers: Record<string, number>;
  nextLesson: NextLessonTarget | null;
  thresholds?: AdaptiveThresholdsConfig;
  completedAt?: string;
}): Omit<LessonKnowledgeCheckAttemptRecord, 'id'> {
  const thresholds = normalizeAdaptiveThresholds(params.thresholds);

  const answerDetails: KnowledgeCheckAnswerDetail[] = params.questions.map((q) => {
    const rawChosen = params.submittedAnswers[q.id];
    const selectedOptionIndex =
      typeof rawChosen === 'number' &&
      Number.isInteger(rawChosen) &&
      rawChosen >= 0 &&
      rawChosen < q.options.length
        ? rawChosen
        : -1;

    if (selectedOptionIndex < 0) {
      throw new KnowledgeCheckApiError(
        400,
        'UNANSWERED_QUESTIONS',
        'Please answer every question before submitting your Knowledge Check.'
      );
    }

    const isCorrect = selectedOptionIndex === q.correctAnswerIndex;
    return {
      questionId: q.id,
      topic: q.topic,
      objective: q.objective,
      question: q.question,
      options: q.options,
      selectedOptionIndex,
      correctAnswerIndex: q.correctAnswerIndex,
      isCorrect,
      answerExplanation: q.optionExplanations[selectedOptionIndex] || '',
      correctOptionExplanation: q.optionExplanations[q.correctAnswerIndex] || '',
      conceptExplanation: q.conceptExplanation,
    };
  });

  const totalQuestions = answerDetails.length;
  const correctAnswers = answerDetails.filter((a) => a.isCorrect).length;
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  // Group by topic (preserving encounter order) for Knowledge Gap Detection
  const topicBuckets = new Map<
    string,
    { topic: string; totalQuestions: number; correctAnswers: number }
  >();
  for (const ans of answerDetails) {
    const normalizedKey = ans.topic.trim().toLowerCase();
    const bucket = topicBuckets.get(normalizedKey) ?? {
      topic: ans.topic.trim() || 'Lesson Concept',
      totalQuestions: 0,
      correctAnswers: 0,
    };
    bucket.totalQuestions += 1;
    if (ans.isCorrect) bucket.correctAnswers += 1;
    topicBuckets.set(normalizedKey, bucket);
  }

  const topicBreakdown: KnowledgeCheckTopicBreakdown[] = Array.from(
    topicBuckets.values()
  ).map((b) => {
    const accuracyPercent = Math.round((b.correctAnswers / b.totalQuestions) * 100);
    return {
      topic: b.topic,
      totalQuestions: b.totalQuestions,
      correctAnswers: b.correctAnswers,
      accuracyPercent,
      proficiency: classifyTopicProficiency(accuracyPercent, thresholds),
    };
  });

  const needsImprovementTopics = topicBreakdown
    .filter((t) => t.proficiency === 'Needs Improvement')
    .map((t) => t.topic);
  const moderateTopics = topicBreakdown
    .filter((t) => t.proficiency === 'Moderate')
    .map((t) => t.topic);

  const focusTopics =
    needsImprovementTopics.length > 0 ? needsImprovementTopics : moderateTopics;

  const action = getAdaptiveRecommendationTier(score, thresholds);

  let recommendation: KnowledgeCheckAdaptiveRecommendation;
  if (action === 'next_lesson') {
    recommendation = {
      action,
      title: params.nextLesson
        ? `Ready for Next Lesson: ${params.nextLesson.lessonTitle}`
        : 'Strong Mastery Achieved',
      description: params.nextLesson
        ? `You scored ${score}% (at or above the ${thresholds.advanceMinPercent}% mastery threshold). Move on to "${params.nextLesson.lessonTitle}" next${
            focusTopics.length > 0
              ? `, while keeping an eye on: ${focusTopics.join(', ')}.`
              : '.'
          }`
        : `You scored ${score}% and demonstrated strong command of ${params.lessonTitle}.`,
      thresholdsUsed: {
        advanceMinPercent: thresholds.advanceMinPercent,
        practiceMinPercent: thresholds.practiceMinPercent,
      },
      targetStageId: params.nextLesson?.stageId ?? null,
      targetLessonId: params.nextLesson?.lessonId ?? null,
      targetLessonTitle: params.nextLesson?.lessonTitle ?? null,
      focusTopics,
    };
  } else if (action === 'additional_practice') {
    recommendation = {
      action,
      title: 'Recommended: Additional Practice',
      description: `You scored ${score}% (${thresholds.practiceMinPercent}–${
        thresholds.advanceMinPercent - 1
      }% range). Work through the Guided Practice Exercises or external labs${
        focusTopics.length > 0 ? ` focusing on ${focusTopics.join(', ')}` : ''
      }, then retake the Knowledge Check.`,
      thresholdsUsed: {
        advanceMinPercent: thresholds.advanceMinPercent,
        practiceMinPercent: thresholds.practiceMinPercent,
      },
      targetStageId: params.stageId,
      targetLessonId: params.lessonId,
      targetLessonTitle: params.lessonTitle,
      focusTopics,
    };
  } else {
    recommendation = {
      action,
      title: 'Recommended: Review Lesson & Fundamentals',
      description: `You scored ${score}% (below ${thresholds.practiceMinPercent}%). Revisit the Learn step-by-step explanations and video resources${
        focusTopics.length > 0 ? ` for ${focusTopics.join(', ')}` : ''
      } before retaking the Knowledge Check.`,
      thresholdsUsed: {
        advanceMinPercent: thresholds.advanceMinPercent,
        practiceMinPercent: thresholds.practiceMinPercent,
      },
      targetStageId: params.stageId,
      targetLessonId: params.lessonId,
      targetLessonTitle: params.lessonTitle,
      focusTopics,
    };
  }

  return {
    userId: params.userId,
    roadmapId: params.roadmapId,
    stageId: params.stageId,
    lessonId: params.lessonId,
    lessonTitle: params.lessonTitle,
    submissionId: params.submissionId,
    score,
    totalQuestions,
    correctAnswers,
    answers: answerDetails,
    topicBreakdown,
    knowledgeGaps: needsImprovementTopics,
    recommendation,
    completedAt: params.completedAt ?? new Date().toISOString(),
  };
}

function mapDbRowToAttemptRecord(row: Record<string, unknown>): LessonKnowledgeCheckAttemptRecord {
  const answers = Array.isArray(row.answers)
    ? (row.answers as KnowledgeCheckAnswerDetail[])
    : [];
  const topicBreakdown = Array.isArray(row.topic_breakdown)
    ? (row.topic_breakdown as KnowledgeCheckTopicBreakdown[])
    : Array.isArray(row.topicBreakdown)
    ? (row.topicBreakdown as KnowledgeCheckTopicBreakdown[])
    : [];
  const knowledgeGaps = Array.isArray(row.knowledge_gaps)
    ? row.knowledge_gaps.filter((g): g is string => typeof g === 'string')
    : Array.isArray(row.knowledgeGaps)
    ? row.knowledgeGaps.filter((g): g is string => typeof g === 'string')
    : [];

  const recRaw = (row.recommendation ?? {}) as Record<string, unknown>;
  const thresholds = getServerAdaptiveThresholds();
  const score = Number(row.score) || 0;
  const action =
    recRaw.action === 'next_lesson' ||
    recRaw.action === 'additional_practice' ||
    recRaw.action === 'review_fundamentals'
      ? recRaw.action
      : getAdaptiveRecommendationTier(score, thresholds);

  const recommendation: KnowledgeCheckAdaptiveRecommendation = {
    action,
    title:
      typeof recRaw.title === 'string' && recRaw.title
        ? recRaw.title
        : 'Adaptive Recommendation',
    description: typeof recRaw.description === 'string' ? recRaw.description : '',
    thresholdsUsed:
      recRaw.thresholdsUsed && typeof recRaw.thresholdsUsed === 'object'
        ? {
            advanceMinPercent:
              Number((recRaw.thresholdsUsed as Record<string, unknown>).advanceMinPercent) ||
              thresholds.advanceMinPercent,
            practiceMinPercent:
              Number((recRaw.thresholdsUsed as Record<string, unknown>).practiceMinPercent) ||
              thresholds.practiceMinPercent,
          }
        : {
            advanceMinPercent: thresholds.advanceMinPercent,
            practiceMinPercent: thresholds.practiceMinPercent,
          },
    targetStageId:
      typeof recRaw.targetStageId === 'string' ? recRaw.targetStageId : null,
    targetLessonId:
      typeof recRaw.targetLessonId === 'string' ? recRaw.targetLessonId : null,
    targetLessonTitle:
      typeof recRaw.targetLessonTitle === 'string' ? recRaw.targetLessonTitle : null,
    focusTopics: Array.isArray(recRaw.focusTopics)
      ? recRaw.focusTopics.filter((t): t is string => typeof t === 'string')
      : knowledgeGaps,
  };

  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    userId:
      typeof row.user_id === 'string'
        ? row.user_id
        : typeof row.userId === 'string'
        ? row.userId
        : '',
    roadmapId:
      typeof row.roadmap_id === 'string'
        ? row.roadmap_id
        : typeof row.roadmapId === 'string'
        ? row.roadmapId
        : '',
    stageId:
      typeof row.stage_id === 'string'
        ? row.stage_id
        : typeof row.stageId === 'string'
        ? row.stageId
        : '',
    lessonId:
      typeof row.lesson_id === 'string'
        ? row.lesson_id
        : typeof row.lessonId === 'string'
        ? row.lessonId
        : '',
    lessonTitle:
      typeof row.lesson_title === 'string'
        ? row.lesson_title
        : typeof row.lessonTitle === 'string'
        ? row.lessonTitle
        : 'Lesson Knowledge Check',
    submissionId:
      typeof row.submission_id === 'string'
        ? row.submission_id
        : typeof row.submissionId === 'string'
        ? row.submissionId
        : '',
    score,
    totalQuestions: Number(row.total_questions ?? row.totalQuestions) || answers.length,
    correctAnswers: Number(row.correct_answers ?? row.correctAnswers) || 0,
    answers,
    topicBreakdown,
    knowledgeGaps,
    recommendation,
    completedAt:
      typeof row.completed_at === 'string'
        ? row.completed_at
        : typeof row.completedAt === 'string'
        ? row.completedAt
        : new Date().toISOString(),
  };
}

async function persistToRoadmapFallback(
  supabase: SupabaseClient,
  userId: string,
  payload: Omit<LessonKnowledgeCheckAttemptRecord, 'id'>
): Promise<{
  attempt: LessonKnowledgeCheckAttemptRecord;
  duplicatePrevented: boolean;
}> {
  const { data: roadmapRow, error: fetchErr } = await supabase
    .from('learning_roadmaps')
    .select('id, roadmap_data')
    .eq('id', payload.roadmapId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !roadmapRow) {
    throw new KnowledgeCheckApiError(
      fetchErr?.code === '42501' ? 403 : 404,
      fetchErr?.code || 'ROADMAP_NOT_FOUND',
      'Could not locate your roadmap record to save the Knowledge Check result.'
    );
  }

  const rawData = ((roadmapRow as Record<string, unknown>).roadmap_data ??
    {}) as Record<string, unknown>;
  const existingList = Array.isArray(rawData.knowledgeCheckAttempts)
    ? (rawData.knowledgeCheckAttempts as Record<string, unknown>[])
    : [];

  const duplicate = existingList.find(
    (item) =>
      (item.submissionId === payload.submissionId ||
        item.submission_id === payload.submissionId) &&
      typeof payload.submissionId === 'string'
  );
  if (duplicate) {
    return {
      attempt: mapDbRowToAttemptRecord({ ...duplicate, user_id: userId }),
      duplicatePrevented: true,
    };
  }

  const savedRecord: LessonKnowledgeCheckAttemptRecord = {
    ...payload,
    id: `kc-attempt-${payload.submissionId}`,
  };

  // Save in roadmap_data.knowledgeCheckAttempts WITHOUT modifying stages[].lessons[].completed
  const updatedRoadmapData = {
    ...rawData,
    knowledgeCheckAttempts: [savedRecord, ...existingList].slice(0, 150),
  };

  const { error: updateErr } = await supabase
    .from('learning_roadmaps')
    .update({
      roadmap_data: updatedRoadmapData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.roadmapId)
    .eq('user_id', userId);

  if (updateErr) {
    throw new KnowledgeCheckApiError(
      updateErr.code === '42501' ? 403 : 500,
      updateErr.code || 'KNOWLEDGE_CHECK_SAVE_FAILED',
      'Could not save your Knowledge Check attempt to Supabase.'
    );
  }

  return { attempt: savedRecord, duplicatePrevented: false };
}

async function fetchUserKnowledgeCheckAttemptsInternal(
  supabase: SupabaseClient,
  userId: string
): Promise<LessonKnowledgeCheckAttemptRecord[]> {
  const { attempts } = await fetchUserKnowledgeCheckHistoryWithMeta(supabase, userId);
  return attempts;
}

async function fetchUserKnowledgeCheckHistoryWithMeta(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  attempts: LessonKnowledgeCheckAttemptRecord[];
  storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
  schemaMigrationRequired: boolean;
}> {
  let tableAttempts: LessonKnowledgeCheckAttemptRecord[] = [];
  let storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback' =
    'lesson_knowledge_checks';
  let schemaMigrationRequired = false;

  const { data: tableRows, error: tableError } = await supabase
    .from('lesson_knowledge_checks')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(200);

  if (tableError) {
    if (isMissingTableError(tableError)) {
      storageMode = 'roadmap_jsonb_fallback';
      schemaMigrationRequired = true;
    } else {
      throw new KnowledgeCheckApiError(
        tableError.code === '42501' ? 403 : 500,
        tableError.code || 'HISTORY_FETCH_FAILED',
        'Could not load your Knowledge Check history from Supabase.'
      );
    }
  } else {
    tableAttempts = (tableRows ?? []).map((row) =>
      mapDbRowToAttemptRecord(row as Record<string, unknown>)
    );
  }

  // Also read any roadmap JSONB fallback records (ensuring zero history loss across migration)
  const { data: roadmapRows, error: roadmapError } = await supabase
    .from('learning_roadmaps')
    .select('id, user_id, roadmap_data')
    .eq('user_id', userId)
    .limit(25);

  if (roadmapError && storageMode === 'roadmap_jsonb_fallback') {
    throw new KnowledgeCheckApiError(
      roadmapError.code === '42501' ? 403 : 500,
      roadmapError.code || 'HISTORY_FALLBACK_FAILED',
      'Could not load your Knowledge Check history.'
    );
  }

  const fallbackAttempts: LessonKnowledgeCheckAttemptRecord[] = [];
  for (const r of roadmapRows ?? []) {
    const row = r as Record<string, unknown>;
    const rData = (row.roadmap_data ?? {}) as Record<string, unknown>;
    const list = Array.isArray(rData.knowledgeCheckAttempts)
      ? (rData.knowledgeCheckAttempts as Record<string, unknown>[])
      : [];
    for (const item of list) {
      fallbackAttempts.push(
        mapDbRowToAttemptRecord({
          ...item,
          user_id: userId,
          roadmap_id: String(row.id ?? item.roadmapId ?? ''),
        })
      );
    }
  }

  // Deduplicate by submissionId (preferring canonical table rows)
  const bySubmissionId = new Map<string, LessonKnowledgeCheckAttemptRecord>();
  for (const attempt of [...tableAttempts, ...fallbackAttempts]) {
    const key = attempt.submissionId || attempt.id;
    if (!key) continue;
    if (!bySubmissionId.has(key)) {
      bySubmissionId.set(key, attempt);
    }
  }

  const merged = Array.from(bySubmissionId.values()).sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return { attempts: merged, storageMode, schemaMigrationRequired };
}

export async function handleSubmitKnowledgeCheck(params: {
  authorizationHeader?: string;
  quizToken: string;
  answers: Record<string, number>;
}): Promise<{
  attempt: LessonKnowledgeCheckAttemptRecord;
  duplicatePrevented: boolean;
  storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
}> {
  cleanupMemoryStores();
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  const session = verifyQuizSessionToken(params.quizToken, userId);

  const dedupeKey = `${userId}:${session.submissionId}`;

  const cached = completedSubmissionsCache.get(dedupeKey);
  if (cached) {
    return {
      attempt: cached.attempt,
      duplicatePrevented: true,
      storageMode: cached.storageMode,
    };
  }

  const existingInFlight = inFlightSubmissions.get(dedupeKey);
  if (existingInFlight) {
    const res = await existingInFlight;
    return { ...res, duplicatePrevented: true };
  }

  const task = (async () => {
    // Merge server-locked checked answers so client cannot alter an already-checked answer
    const lockedAnswers = checkedAnswersBySubmission.get(session.submissionId)?.answers;
    const mergedAnswers: Record<string, number> = {
      ...(params.answers ?? {}),
    };
    if (lockedAnswers) {
      for (const [qId, chosenIdx] of lockedAnswers.entries()) {
        mergedAnswers[qId] = chosenIdx;
      }
    }

    const evaluated = evaluateKnowledgeCheckSubmission({
      userId,
      roadmapId: session.roadmapId,
      stageId: session.stageId,
      lessonId: session.lessonId,
      lessonTitle: session.lessonTitle,
      submissionId: session.submissionId,
      questions: session.questions,
      submittedAnswers: mergedAnswers,
      nextLesson: session.nextLesson,
      thresholds: getServerAdaptiveThresholds(),
    });

    // 1. Check canonical table first for duplicate submission_id
    const { data: existingRow, error: lookupError } = await supabase
      .from('lesson_knowledge_checks')
      .select('*')
      .eq('user_id', userId)
      .eq('submission_id', session.submissionId)
      .maybeSingle();

    if (!lookupError && existingRow) {
      const existingAttempt = mapDbRowToAttemptRecord(
        existingRow as Record<string, unknown>
      );
      completedSubmissionsCache.set(dedupeKey, {
        createdAt: Date.now(),
        attempt: existingAttempt,
        storageMode: 'lesson_knowledge_checks',
      });
      return {
        attempt: existingAttempt,
        duplicatePrevented: true,
        storageMode: 'lesson_knowledge_checks' as const,
      };
    }

    if (lookupError && isMissingTableError(lookupError)) {
      const fallbackResult = await persistToRoadmapFallback(
        supabase,
        userId,
        evaluated
      );
      completedSubmissionsCache.set(dedupeKey, {
        createdAt: Date.now(),
        attempt: fallbackResult.attempt,
        storageMode: 'roadmap_jsonb_fallback',
      });
      return {
        ...fallbackResult,
        storageMode: 'roadmap_jsonb_fallback' as const,
      };
    }

    if (lookupError) {
      throw new KnowledgeCheckApiError(
        lookupError.code === '42501' ? 403 : 500,
        lookupError.code || 'KNOWLEDGE_CHECK_LOOKUP_FAILED',
        'Could not verify existing quiz submissions in Supabase.'
      );
    }

    // 2. Insert new attempt in public.lesson_knowledge_checks
    const insertPayload = {
      user_id: userId,
      roadmap_id: evaluated.roadmapId,
      stage_id: evaluated.stageId,
      lesson_id: evaluated.lessonId,
      lesson_title: evaluated.lessonTitle,
      submission_id: evaluated.submissionId,
      score: evaluated.score,
      total_questions: evaluated.totalQuestions,
      correct_answers: evaluated.correctAnswers,
      answers: evaluated.answers,
      topic_breakdown: evaluated.topicBreakdown,
      knowledge_gaps: evaluated.knowledgeGaps,
      recommendation: evaluated.recommendation,
      completed_at: evaluated.completedAt,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('lesson_knowledge_checks')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      // Unique violation from concurrent double-submit -> load existing row safely
      if (insertError.code === '23505') {
        const { data: raceRow } = await supabase
          .from('lesson_knowledge_checks')
          .select('*')
          .eq('user_id', userId)
          .eq('submission_id', session.submissionId)
          .maybeSingle();

        if (raceRow) {
          const raceAttempt = mapDbRowToAttemptRecord(
            raceRow as Record<string, unknown>
          );
          completedSubmissionsCache.set(dedupeKey, {
            createdAt: Date.now(),
            attempt: raceAttempt,
            storageMode: 'lesson_knowledge_checks',
          });
          return {
            attempt: raceAttempt,
            duplicatePrevented: true,
            storageMode: 'lesson_knowledge_checks' as const,
          };
        }
      }

      if (isMissingTableError(insertError)) {
        const fallbackResult = await persistToRoadmapFallback(
          supabase,
          userId,
          evaluated
        );
        completedSubmissionsCache.set(dedupeKey, {
          createdAt: Date.now(),
          attempt: fallbackResult.attempt,
          storageMode: 'roadmap_jsonb_fallback',
        });
        return {
          ...fallbackResult,
          storageMode: 'roadmap_jsonb_fallback' as const,
        };
      }

      throw new KnowledgeCheckApiError(
        insertError.code === '42501' ? 403 : 500,
        insertError.code || 'KNOWLEDGE_CHECK_INSERT_FAILED',
        'Could not save your Knowledge Check attempt to Supabase.'
      );
    }

    const savedAttempt = mapDbRowToAttemptRecord(
      insertedRow as Record<string, unknown>
    );
    completedSubmissionsCache.set(dedupeKey, {
      createdAt: Date.now(),
      attempt: savedAttempt,
      storageMode: 'lesson_knowledge_checks',
    });
    return {
      attempt: savedAttempt,
      duplicatePrevented: false,
      storageMode: 'lesson_knowledge_checks' as const,
    };
  })();

  inFlightSubmissions.set(dedupeKey, task);
  try {
    return await task;
  } finally {
    inFlightSubmissions.delete(dedupeKey);
  }
}

export async function handleGetKnowledgeCheckHistory(params: {
  authorizationHeader?: string;
}): Promise<{
  attempts: LessonKnowledgeCheckAttemptRecord[];
  storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
  schemaMigrationRequired: boolean;
}> {
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  return fetchUserKnowledgeCheckHistoryWithMeta(supabase, userId);
}
