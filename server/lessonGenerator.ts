import { Content, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  KnowledgeLevel,
  matchTrustedResourcesForCourse,
  matchTrustedResourcesForLesson,
  MatchedVerifiedResource,
  TrustedResourcesBundle,
} from './verifiedResources';

export interface LessonLearnStep {
  stepNumber: number;
  title: string;
  explanation: string;
  keyPoint: string;
}

export interface LessonExample {
  title: string;
  context: string;
  explanation: string;
  codeSnippet?: string;
  language?: string;
  expectedOutput?: string;
}

export interface LessonGuidedExercise {
  title: string;
  prompt: string;
  steps: string[];
  expectedOutcome: string;
  hint: string;
}

export interface LessonPracticeQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface LessonTerminologyItem {
  term: string;
  definition: string;
}

export interface LessonCommonMistake {
  mistake: string;
  howToAvoid: string;
}

export interface GeneratedLessonContent {
  contentVersion?: number;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  lessonTitle: string;
  stageTitle: string;
  isProgrammingTopic: boolean;
  overview: string;
  personalizationNote: string;
  prerequisites?: string[];
  completionCriteria: string;
  keyTakeaways: string[];
  learnSteps: LessonLearnStep[];
  examples: LessonExample[];
  practicalApplications?: string[];
  keyTerminology?: LessonTerminologyItem[];
  commonMistakes?: LessonCommonMistake[];
  summary?: string;
  whatToLearnNext?: string;
  nextLessonTitle?: string;
  nextLessonStageTitle?: string;
  guidedExercises: LessonGuidedExercise[];
  practiceQuestions: LessonPracticeQuestion[];
  verifiedResources: MatchedVerifiedResource[];
  trustedResources: TrustedResourcesBundle;
  generatedAt: string;
}

export interface LessonClarificationResponse {
  answer: string;
  exampleSnippet?: string;
  exampleLanguage?: string;
}

export class LessonApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'LessonApiError';
    this.status = status;
    this.code = code;
  }
}

// Per-(user, roadmap, lesson) in-flight deduplication, server LRU/TTL cache, and per-user rate limiters
const inFlightLessonRequests = new Map<string, Promise<GeneratedLessonContent>>();
const inFlightCourseResources = new Map<string, Promise<TrustedResourcesBundle>>();
const serverLessonCache = new Map<
  string,
  { expiresAt: number; content: GeneratedLessonContent }
>();
const courseResourcesCache = new Map<
  string,
  { expiresAt: number; bundle: TrustedResourcesBundle }
>();
const SERVER_LESSON_CACHE_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours
const MAX_SERVER_LESSON_CACHE_ENTRIES = 250;
const COURSE_RESOURCES_CACHE_TTL_MS = 1000 * 60 * 30; // 30 mins

const lessonHistoryByUser = new Map<string, number[]>();
const clarifyHistoryByUser = new Map<string, number[]>();

const LESSON_COOLDOWN_MS = 1_200;
const LESSON_WINDOW_MS = 10 * 60_000;
const MAX_LESSONS_PER_WINDOW = 35;

const CLARIFY_COOLDOWN_MS = 2_000;
const CLARIFY_WINDOW_MS = 10 * 60_000;
const MAX_CLARIFIES_PER_WINDOW = 30;

const PRIMARY_LESSON_MODEL = 'gemini-4-hydrogen';
const FALLBACK_LESSON_MODEL = 'gemini-3.1-flash-lite';
const PRIMARY_LESSON_TIMEOUT_MS = 32_000;
const FALLBACK_LESSON_TIMEOUT_MS = 24_000;
const CURRENT_LESSON_CONTENT_VERSION = 2;

function getCachedServerLesson(cacheKey: string): GeneratedLessonContent | null {
  const hit = serverLessonCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    serverLessonCache.delete(cacheKey);
    return null;
  }
  // Refresh LRU order
  serverLessonCache.delete(cacheKey);
  serverLessonCache.set(cacheKey, hit);
  return hit.content;
}

function setCachedServerLesson(cacheKey: string, content: GeneratedLessonContent): void {
  if (serverLessonCache.has(cacheKey)) {
    serverLessonCache.delete(cacheKey);
  }
  while (serverLessonCache.size >= MAX_SERVER_LESSON_CACHE_ENTRIES) {
    const oldestKey = serverLessonCache.keys().next().value;
    if (!oldestKey) break;
    serverLessonCache.delete(oldestKey);
  }
  serverLessonCache.set(cacheKey, {
    expiresAt: Date.now() + SERVER_LESSON_CACHE_TTL_MS,
    content,
  });
}

async function generateJsonWithTimeoutAndFallback(params: {
  ai: GoogleGenAI;
  contents: string | Content[];
  systemInstruction: string;
  responseSchema: unknown;
}): Promise<string> {
  const attemptModel = async (
    model: string,
    timeoutMs: number,
    useLowThinking: boolean
  ): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await params.ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
          abortSignal: controller.signal,
          ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });
      return (response.text ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const primaryText = await attemptModel(PRIMARY_LESSON_MODEL, PRIMARY_LESSON_TIMEOUT_MS, true);
    if (primaryText) return primaryText;
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    const isAuthOrKeyFatal =
      msg.includes('api_key_invalid') ||
      msg.includes('api key not valid') ||
      msg.includes('permission_denied') ||
      msg.includes('invalid_argument') ||
      msg.includes('403');
    if (isAuthOrKeyFatal) {
      throw err;
    }
    // Fall through cleanly to fast fallback model on timeout / transient upstream error
  }

  return attemptModel(FALLBACK_LESSON_MODEL, FALLBACK_LESSON_TIMEOUT_MS, false);
}

function enforceSlidingRateLimit(
  historyMap: Map<string, number[]>,
  userId: string,
  cooldownMs: number,
  windowMs: number,
  maxCount: number,
  actionLabel: string
) {
  const now = Date.now();
  const timestamps = (historyMap.get(userId) ?? []).filter(
    (ts) => now - ts < windowMs
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (now - lastTs)) / 1000);
    throw new LessonApiError(
      429,
      'RATE_LIMITED_COOLDOWN',
      `Please wait ${waitSeconds}s before requesting another ${actionLabel}.`
    );
  }
  if (timestamps.length >= maxCount) {
    throw new LessonApiError(
      429,
      'RATE_LIMITED_WINDOW',
      `You have made many ${actionLabel} requests recently. Please wait a few minutes and try again.`
    );
  }
  historyMap.set(userId, timestamps);
}

function recordHistory(historyMap: Map<string, number[]>, userId: string, windowMs: number) {
  const now = Date.now();
  const timestamps = (historyMap.get(userId) ?? []).filter(
    (ts) => now - ts < windowMs
  );
  timestamps.push(now);
  historyMap.set(userId, timestamps);
}

function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new LessonApiError(
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

function sanitizeTextNoUrls(text: unknown, fallback = ''): string {
  if (typeof text !== 'string') return fallback;
  const cleaned = text
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\bwww\.[^\s)]+/gi, '')
    .replace(/\s+\n/g, '\n')
    .trim();
  return cleaned || fallback;
}

function parseStringArray(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const cleaned = sanitizeTextNoUrls(item);
    if (cleaned) result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new LessonApiError(
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

function stripMarkdownJsonFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function mapGeminiError(err: unknown): LessonApiError {
  if (err instanceof LessonApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown AI error');
  const lower = rawMessage.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return new LessonApiError(
      502,
      'GEMINI_CONFIG_ERROR',
      'The AI service key is invalid. Please check GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return new LessonApiError(
      502,
      'GEMINI_PERMISSION_DENIED',
      'AI lesson generation could not be authorized. Please verify GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return new LessonApiError(
      429,
      'GEMINI_QUOTA_EXCEEDED',
      'The AI service is temporarily busy due to quota limits. Please wait a moment and try again.'
    );
  }
  if (
    (err instanceof Error && err.name === 'AbortError') ||
    lower.includes('abort') ||
    lower.includes('timeout') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('etimedout')
  ) {
    return new LessonApiError(
      504,
      'GEMINI_TIMEOUT',
      'Lesson generation took too long and timed out. Please retry.'
    );
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('network')
  ) {
    return new LessonApiError(
      503,
      'GEMINI_SERVICE_UNAVAILABLE',
      'The AI service is temporarily unavailable due to high demand or a network issue. Please try again in a moment.'
    );
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return new LessonApiError(
      502,
      'GEMINI_MODEL_UNAVAILABLE',
      'The configured AI model is temporarily unavailable. Please try again shortly.'
    );
  }
  return new LessonApiError(
    502,
    'GEMINI_GENERATION_FAILED',
    'We could not generate the lesson content right now. Please try again.'
  );
}

const LESSON_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isProgrammingTopic: {
      type: Type.BOOLEAN,
      description: 'True if the lesson involves programming/SQL/technical code; false otherwise.',
    },
    overview: {
      type: Type.STRING,
      description: 'Clear 2-3 sentence introduction explaining the lesson learning objective and why it matters.',
    },
    personalizationNote: {
      type: Type.STRING,
      description: '1-2 sentences connecting this lesson to the student career goal, level, or assessment knowledge gaps.',
    },
    prerequisites: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 3 specific prerequisite concepts helpful before starting this lesson.',
    },
    completionCriteria: {
      type: Type.STRING,
      description: 'Specific, measurable completion criterion confirming mastery of this lesson.',
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 crisp key takeaways.',
    },
    learnSteps: {
      type: Type.ARRAY,
      description: '4 to 6 substantive, domain-accurate step-by-step teaching sections.',
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          explanation: {
            type: Type.STRING,
            description: 'Substantive, well-structured explanation (4-5 sentences) teaching concepts clearly with zero fluff.',
          },
          keyPoint: {
            type: Type.STRING,
            description: 'One memorable rule of thumb or core insight for this step.',
          },
        },
        required: ['stepNumber', 'title', 'explanation', 'keyPoint'],
      },
    },
    examples: {
      type: Type.ARRAY,
      description: '2 to 3 step-by-step worked examples illustrating how to apply the lesson concepts.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          context: { type: Type.STRING, description: 'When and why this example applies in real work.' },
          explanation: { type: Type.STRING, description: 'Step-by-step walkthrough of how the worked example works.' },
          codeSnippet: {
            type: Type.STRING,
            description: 'Clean runnable code snippet if programming/technical; empty string if non-programming.',
          },
          language: {
            type: Type.STRING,
            description: 'Programming language name (e.g. python, javascript, sql) or empty string.',
          },
          expectedOutput: {
            type: Type.STRING,
            description: 'Expected output or concrete real-world result.',
          },
        },
        required: ['title', 'context', 'explanation'],
      },
    },
    practicalApplications: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 4 concrete real-world applications or workplace use cases for these concepts.',
    },
    keyTerminology: {
      type: Type.ARRAY,
      description: '3 to 5 essential terms or concepts defined clearly for this lesson.',
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          definition: { type: Type.STRING },
        },
        required: ['term', 'definition'],
      },
    },
    commonMistakes: {
      type: Type.ARRAY,
      description: '2 to 4 common student mistakes or misconceptions and how to avoid them.',
      items: {
        type: Type.OBJECT,
        properties: {
          mistake: { type: Type.STRING },
          howToAvoid: { type: Type.STRING },
        },
        required: ['mistake', 'howToAvoid'],
      },
    },
    summary: {
      type: Type.STRING,
      description: '2-3 sentence synthesis summarizing what the student learned and can now apply.',
    },
    whatToLearnNext: {
      type: Type.STRING,
      description: '1-2 sentence guidance explaining what to study next and how this lesson bridges forward.',
    },
    guidedExercises: {
      type: Type.ARRAY,
      description: '1 to 2 substantive domain-authentic hands-on tasks with clear steps and expected outcomes.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          prompt: { type: Type.STRING, description: 'Clear task prompt for the student.' },
          steps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 to 5 actionable steps to complete the task.',
          },
          expectedOutcome: {
            type: Type.STRING,
            description: 'What a strong completed deliverable or output should look like.',
          },
          hint: {
            type: Type.STRING,
            description: 'A helpful hint without giving away the entire answer.',
          },
        },
        required: ['title', 'prompt', 'steps', 'expectedOutcome', 'hint'],
      },
    },
    practiceQuestions: {
      type: Type.ARRAY,
      description: '3 to 5 multiple-choice knowledge check questions strictly testing the generated lesson material.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          question: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 4 clear answer choices.',
          },
          correctAnswerIndex: {
            type: Type.INTEGER,
            description: 'Zero-based index (0 to 3) of the correct option.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Clear explanation of why the correct option is right and common pitfalls.',
          },
        },
        required: ['id', 'question', 'options', 'correctAnswerIndex', 'explanation'],
      },
    },
  },
  required: [
    'isProgrammingTopic',
    'overview',
    'personalizationNote',
    'prerequisites',
    'completionCriteria',
    'keyTakeaways',
    'learnSteps',
    'examples',
    'practicalApplications',
    'keyTerminology',
    'commonMistakes',
    'summary',
    'whatToLearnNext',
    'guidedExercises',
    'practiceQuestions',
  ],
};

interface RoadmapStageShape {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  difficulty?: unknown;
  prerequisites?: unknown;
  learningObjectives?: unknown;
  lessons?: unknown[];
}

interface RoadmapLessonShape {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  estimatedTime?: unknown;
  learningObjectives?: unknown;
  completionCriteria?: unknown;
}

async function fetchVerifiedUserAndContext(params: {
  authorizationHeader?: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
}) {
  const authHeader = params.authorizationHeader?.trim() || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new LessonApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with an active Skillora session to study lessons.'
    );
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new LessonApiError(
      401,
      'INVALID_AUTH_TOKEN',
      'Missing authentication token. Please sign in again.'
    );
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new LessonApiError(
      401,
      'UNAUTHORIZED',
      'Your session has expired or is invalid. Please sign in again.'
    );
  }

  const userId = userData.user.id;

  // Fetch recent assessment attempts & roadmap ownership in parallel
  const [roadmapResult, profileResult, attemptsResult, quizGapsResult] = await Promise.all([
    supabase
      .from('learning_roadmaps')
      .select('id, title, career_goal, roadmap_data')
      .eq('id', params.roadmapId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('student_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('assessment_attempts')
      .select('subject, difficulty, score_percent, strengths, knowledge_gaps, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('lesson_knowledge_checks')
      .select('lesson_title, knowledge_gaps, score, completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(8),
  ]);

  if (roadmapResult.error) {
    throw new LessonApiError(
      roadmapResult.error.code === '42501' ? 403 : 500,
      roadmapResult.error.code || 'ROADMAP_FETCH_FAILED',
      'Could not load your roadmap from Supabase.'
    );
  }

  if (!roadmapResult.data) {
    throw new LessonApiError(
      404,
      'ROADMAP_NOT_FOUND',
      'The selected learning roadmap could not be found.'
    );
  }

  const roadmapRow = roadmapResult.data as Record<string, unknown>;
  const roadmapData = (roadmapRow.roadmap_data ?? {}) as Record<string, unknown>;
  const stages = Array.isArray(roadmapData.stages)
    ? (roadmapData.stages as RoadmapStageShape[])
    : [];

  const stage = stages.find((s) => s.id === params.stageId);
  if (!stage) {
    throw new LessonApiError(404, 'STAGE_NOT_FOUND', 'The selected stage was not found in this roadmap.');
  }

  const lessons = Array.isArray(stage.lessons)
    ? (stage.lessons as RoadmapLessonShape[])
    : [];
  const lesson = lessons.find((l) => l.id === params.lessonId);
  if (!lesson) {
    throw new LessonApiError(404, 'LESSON_NOT_FOUND', 'The selected lesson was not found in this stage.');
  }

  const profileRow = (profileResult.data ?? {}) as Record<string, unknown>;
  const userMeta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
  const dbPrimary =
    typeof profileRow.primary_direction === 'string'
      ? profileRow.primary_direction.trim()
      : '';
  const metaPrimary =
    typeof userMeta.primary_direction === 'string'
      ? userMeta.primary_direction.trim()
      : '';
  const primaryDirection = dbPrimary || metaPrimary;
  const careerGoal =
    (typeof roadmapRow.career_goal === 'string' && roadmapRow.career_goal.trim()) ||
    primaryDirection ||
    (typeof profileRow.career_goal === 'string' && profileRow.career_goal.trim()) ||
    'Career Skill Mastery';

  const knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced' =
    profileRow.knowledge_level === 'Beginner' ||
    profileRow.knowledge_level === 'Intermediate' ||
    profileRow.knowledge_level === 'Advanced'
      ? profileRow.knowledge_level
      : 'Beginner';

  const fieldOfStudy =
    typeof profileRow.field_of_study === 'string' ? profileRow.field_of_study.trim() : '';

  const currentSkills = Array.isArray(profileRow.current_skills)
    ? profileRow.current_skills.filter((s): s is string => typeof s === 'string')
    : [];

  const learningInterests = Array.isArray(profileRow.learning_interests)
    ? profileRow.learning_interests.filter((s): s is string => typeof s === 'string')
    : [];

  const attemptSummaries = (attemptsResult.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const strengths = Array.isArray(r.strengths)
      ? r.strengths.filter((s): s is string => typeof s === 'string')
      : [];
    const gaps = Array.isArray(r.knowledge_gaps)
      ? r.knowledge_gaps.filter((s): s is string => typeof s === 'string')
      : [];
    return {
      subject: typeof r.subject === 'string' ? r.subject : 'Assessment',
      difficulty: typeof r.difficulty === 'string' ? r.difficulty : 'Intermediate',
      scorePercent: Number(r.score_percent) || 0,
      strengths,
      gaps,
    };
  });

  const tableQuizGaps = !quizGapsResult.error && Array.isArray(quizGapsResult.data)
    ? quizGapsResult.data.flatMap((row) => {
        const gaps = (row as Record<string, unknown>).knowledge_gaps;
        return Array.isArray(gaps)
          ? gaps.filter((g): g is string => typeof g === 'string')
          : [];
      })
    : [];

  const fallbackQuizGaps = Array.isArray(roadmapData.knowledgeCheckAttempts)
    ? (roadmapData.knowledgeCheckAttempts as Record<string, unknown>[]).flatMap((attempt) => {
        const gaps = attempt.knowledgeGaps ?? attempt.knowledge_gaps;
        return Array.isArray(gaps)
          ? gaps.filter((g): g is string => typeof g === 'string')
          : [];
      })
    : [];

  const allKnowledgeGaps = Array.from(
    new Set([
      ...tableQuizGaps,
      ...fallbackQuizGaps,
      ...attemptSummaries.flatMap((a) => a.gaps),
    ].filter(Boolean))
  ).slice(0, 10);

  const siblingLessonTitles = lessons
    .filter((l) => l.id !== params.lessonId && typeof l.title === 'string')
    .map((l) => String(l.title).trim())
    .filter(Boolean);

  // Compute exact next lesson across the ordered roadmap stages
  const flatLessons: { stageTitle: string; lessonId: string; lessonTitle: string }[] = [];
  for (const s of stages) {
    const stTitle = typeof s.title === 'string' ? s.title : 'Learning Stage';
    const stLessons = Array.isArray(s.lessons) ? (s.lessons as RoadmapLessonShape[]) : [];
    for (const l of stLessons) {
      flatLessons.push({
        stageTitle: stTitle,
        lessonId: typeof l.id === 'string' ? l.id : '',
        lessonTitle: typeof l.title === 'string' ? l.title : 'Lesson',
      });
    }
  }
  const currentFlatIndex = flatLessons.findIndex((item) => item.lessonId === params.lessonId);
  const nextFlatItem =
    currentFlatIndex >= 0 && currentFlatIndex < flatLessons.length - 1
      ? flatLessons[currentFlatIndex + 1]
      : null;

  const generatedLessonsMap =
    roadmapData.generatedLessons &&
    typeof roadmapData.generatedLessons === 'object' &&
    !Array.isArray(roadmapData.generatedLessons)
      ? (roadmapData.generatedLessons as Record<string, GeneratedLessonContent>)
      : {};
  const persistedLesson = generatedLessonsMap[params.lessonId] ?? null;

  return {
    supabase,
    userId,
    roadmapId: String(roadmapRow.id),
    persistedLesson,
    careerGoal,
    knowledgeLevel,
    fieldOfStudy,
    currentSkills,
    learningInterests,
    attemptSummaries: attemptSummaries.slice(0, 5),
    allKnowledgeGaps,
    stageTitle: typeof stage.title === 'string' ? stage.title : 'Learning Stage',
    stageId: params.stageId,
    lessonId: params.lessonId,
    stageDifficulty: typeof stage.difficulty === 'string' ? stage.difficulty : knowledgeLevel,
    stagePrerequisites: Array.isArray(stage.prerequisites)
      ? stage.prerequisites.filter((p): p is string => typeof p === 'string')
      : [],
    lessonTitle: typeof lesson.title === 'string' ? lesson.title : 'Lesson',
    lessonDescription: typeof lesson.description === 'string' ? lesson.description : '',
    lessonEstimatedTime:
      typeof lesson.estimatedTime === 'string' ? lesson.estimatedTime : '45 mins',
    lessonObjectives: Array.isArray(lesson.learningObjectives)
      ? lesson.learningObjectives.filter((o): o is string => typeof o === 'string')
      : [],
    lessonCompletionCriteria:
      typeof lesson.completionCriteria === 'string' ? lesson.completionCriteria.trim() : '',
    siblingLessonTitles,
    nextLessonTitle: nextFlatItem?.lessonTitle,
    nextLessonStageTitle: nextFlatItem?.stageTitle,
  };
}

async function persistGeneratedLessonToRoadmap(params: {
  supabase: SupabaseClient;
  userId: string;
  roadmapId: string;
  lessonId: string;
  content: GeneratedLessonContent;
}): Promise<void> {
  try {
    const { data, error } = await params.supabase
      .from('learning_roadmaps')
      .select('roadmap_data')
      .eq('id', params.roadmapId)
      .eq('user_id', params.userId)
      .maybeSingle();

    if (error || !data) return;
    const currentData = ((data as { roadmap_data?: unknown }).roadmap_data ?? {}) as Record<
      string,
      unknown
    >;
    const existingMap =
      currentData.generatedLessons &&
      typeof currentData.generatedLessons === 'object' &&
      !Array.isArray(currentData.generatedLessons)
        ? (currentData.generatedLessons as Record<string, unknown>)
        : {};

    const updatedRoadmapData = {
      ...currentData,
      generatedLessons: {
        ...existingMap,
        [params.lessonId]: params.content,
      },
    };

    await params.supabase
      .from('learning_roadmaps')
      .update({
        roadmap_data: updatedRoadmapData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.roadmapId)
      .eq('user_id', params.userId);
  } catch (err) {
    console.warn(
      '[Skillora][Lesson] Non-fatal error persisting lesson to Supabase:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function validateAndNormalizeLessonContent(
  raw: unknown,
  ctx: Awaited<ReturnType<typeof fetchVerifiedUserAndContext>>,
  precomputedTrustedResources?: TrustedResourcesBundle
): Promise<GeneratedLessonContent> {
  if (!raw || typeof raw !== 'object') {
    throw new LessonApiError(
      502,
      'AI_INVALID_LESSON',
      'The AI service returned an unreadable lesson structure. Please try again.'
    );
  }

  const obj = raw as Record<string, unknown>;
  const rawSteps = Array.isArray(obj.learnSteps) ? obj.learnSteps : [];
  if (rawSteps.length < 2) {
    throw new LessonApiError(
      502,
      'AI_INCOMPLETE_LESSON',
      'Generated lesson explanations were too brief. Please try again.'
    );
  }

  const learnSteps: LessonLearnStep[] = rawSteps.slice(0, 6).map((sRaw, idx) => {
    const s = (sRaw && typeof sRaw === 'object' ? sRaw : {}) as Record<string, unknown>;
    return {
      stepNumber: idx + 1,
      title: sanitizeTextNoUrls(s.title, `Step ${idx + 1}`),
      explanation: sanitizeTextNoUrls(
        s.explanation,
        `Core explanation for ${ctx.lessonTitle}.`
      ),
      keyPoint: sanitizeTextNoUrls(s.keyPoint, 'Focus on understanding the underlying principle.'),
    };
  });

  const rawExamples = Array.isArray(obj.examples) ? obj.examples : [];
  const examples: LessonExample[] = rawExamples.slice(0, 3).map((eRaw, idx) => {
    const e = (eRaw && typeof eRaw === 'object' ? eRaw : {}) as Record<string, unknown>;
    const codeSnippet =
      typeof e.codeSnippet === 'string' && e.codeSnippet.trim()
        ? e.codeSnippet.trim()
        : undefined;
    const language =
      codeSnippet && typeof e.language === 'string' && e.language.trim()
        ? e.language.trim().toLowerCase()
        : undefined;
    const expectedOutput = sanitizeTextNoUrls(e.expectedOutput);

    return {
      title: sanitizeTextNoUrls(e.title, `Example ${idx + 1}`),
      context: sanitizeTextNoUrls(e.context, 'Practical application context.'),
      explanation: sanitizeTextNoUrls(e.explanation, 'Step-by-step walkthrough.'),
      codeSnippet,
      language,
      expectedOutput: expectedOutput || undefined,
    };
  });

  const rawExercises = Array.isArray(obj.guidedExercises) ? obj.guidedExercises : [];
  const guidedExercises: LessonGuidedExercise[] = rawExercises.slice(0, 2).map((gRaw, idx) => {
    const g = (gRaw && typeof gRaw === 'object' ? gRaw : {}) as Record<string, unknown>;
    const steps = parseStringArray(g.steps, 5);
    return {
      title: sanitizeTextNoUrls(g.title, `Guided Exercise ${idx + 1}`),
      prompt: sanitizeTextNoUrls(g.prompt, `Apply ${ctx.lessonTitle} in a focused practice task.`),
      steps:
        steps.length > 0
          ? steps
          : [
              'Review the lesson concepts and examples.',
              'Draft your solution step by step.',
              'Compare your result against the expected outcome.',
            ],
      expectedOutcome: sanitizeTextNoUrls(
        g.expectedOutcome,
        'A clear, accurate solution aligned with the lesson learning objectives.'
      ),
      hint: sanitizeTextNoUrls(
        g.hint,
        'Revisit the key points in the Learn tab before finalizing your approach.'
      ),
    };
  });

  const rawQuestions = Array.isArray(obj.practiceQuestions) ? obj.practiceQuestions : [];
  if (rawQuestions.length < 3) {
    throw new LessonApiError(
      502,
      'AI_INCOMPLETE_QUIZ',
      'Generated practice questions were incomplete. Please retry.'
    );
  }

  const practiceQuestions: LessonPracticeQuestion[] = rawQuestions
    .slice(0, 5)
    .map((qRaw, idx) => {
      const q = (qRaw && typeof qRaw === 'object' ? qRaw : {}) as Record<string, unknown>;
      const options = parseStringArray(q.options, 4);
      const normalizedOptions =
        options.length >= 2
          ? options
          : ['Concept A', 'Concept B', 'Concept C', 'Concept D'];

      const rawCorrect = Number(q.correctAnswerIndex);
      const correctAnswerIndex =
        Number.isInteger(rawCorrect) &&
        rawCorrect >= 0 &&
        rawCorrect < normalizedOptions.length
          ? rawCorrect
          : 0;

      return {
        id: `${ctx.lessonId}-q-${idx + 1}`,
        question: sanitizeTextNoUrls(q.question, `Knowledge check question ${idx + 1}`),
        options: normalizedOptions,
        correctAnswerIndex,
        explanation: sanitizeTextNoUrls(
          q.explanation,
          'Review the Learn section to verify how this concept works.'
        ),
      };
    });

  // Match verified YouTube videos, written tutorials, and interactive exercises tailored to this lesson
  const trustedResources =
    precomputedTrustedResources ??
    (await matchTrustedResourcesForLesson({
      lessonTitle: ctx.lessonTitle,
      lessonDescription: ctx.lessonDescription,
      learningObjectives: ctx.lessonObjectives,
      stageTitle: ctx.stageTitle,
      careerGoal: ctx.careerGoal,
      knowledgeLevel: ctx.knowledgeLevel,
      knowledgeGaps: ctx.allKnowledgeGaps,
      learningInterests: ctx.learningInterests,
      currentSkills: ctx.currentSkills,
      preferredLanguage: 'en',
    }));

  const verifiedResources: MatchedVerifiedResource[] = [
    ...trustedResources.tutorials,
    ...trustedResources.practice,
    ...trustedResources.videos,
  ].map((item) => ({
    id: item.id,
    title: item.title,
    provider: item.provider,
    type: item.type,
    url: item.url,
    description: item.description,
  }));

  const keyTakeaways = parseStringArray(obj.keyTakeaways, 5);
  const prerequisites = parseStringArray(obj.prerequisites, 4);
  const practicalApplications = parseStringArray(obj.practicalApplications, 4);

  const rawTerms = Array.isArray(obj.keyTerminology) ? obj.keyTerminology : [];
  const keyTerminology: LessonTerminologyItem[] = rawTerms
    .slice(0, 6)
    .map((tRaw) => {
      const t = (tRaw && typeof tRaw === 'object' ? tRaw : {}) as Record<string, unknown>;
      return {
        term: sanitizeTextNoUrls(t.term),
        definition: sanitizeTextNoUrls(t.definition),
      };
    })
    .filter((item) => Boolean(item.term && item.definition));

  const rawMistakes = Array.isArray(obj.commonMistakes) ? obj.commonMistakes : [];
  const commonMistakes: LessonCommonMistake[] = rawMistakes
    .slice(0, 4)
    .map((mRaw) => {
      const m = (mRaw && typeof mRaw === 'object' ? mRaw : {}) as Record<string, unknown>;
      return {
        mistake: sanitizeTextNoUrls(m.mistake),
        howToAvoid: sanitizeTextNoUrls(m.howToAvoid),
      };
    })
    .filter((item) => Boolean(item.mistake && item.howToAvoid));

  const summary = sanitizeTextNoUrls(
    obj.summary,
    `In this lesson on ${ctx.lessonTitle}, you explored core concepts, worked examples, and practical execution strategies tailored to ${ctx.careerGoal}.`
  );

  const defaultNext = ctx.nextLessonTitle
    ? `Next, continue to "${ctx.nextLessonTitle}"${
        ctx.nextLessonStageTitle && ctx.nextLessonStageTitle !== ctx.stageTitle
          ? ` (${ctx.nextLessonStageTitle})`
          : ''
      } to build on these foundations.`
    : `Review your Knowledge Check results and apply ${ctx.lessonTitle} in your stage mini-project.`;

  const whatToLearnNext = sanitizeTextNoUrls(obj.whatToLearnNext, defaultNext);

  return {
    contentVersion: CURRENT_LESSON_CONTENT_VERSION,
    roadmapId: ctx.roadmapId,
    stageId: String(ctx.stageId),
    lessonId: String(ctx.lessonId),
    lessonTitle: ctx.lessonTitle,
    stageTitle: ctx.stageTitle,
    isProgrammingTopic: obj.isProgrammingTopic === true,
    overview: sanitizeTextNoUrls(
      obj.overview,
      ctx.lessonDescription || `Focused study module on ${ctx.lessonTitle}.`
    ),
    personalizationNote: sanitizeTextNoUrls(
      obj.personalizationNote,
      `Tailored to your ${ctx.knowledgeLevel} level and goal: ${ctx.careerGoal}.`
    ),
    prerequisites:
      prerequisites.length > 0
        ? prerequisites
        : ctx.stagePrerequisites.length > 0
        ? ctx.stagePrerequisites.slice(0, 3)
        : [`Core familiarity with ${ctx.stageTitle} foundations`],
    completionCriteria: sanitizeTextNoUrls(
      obj.completionCriteria,
      ctx.lessonCompletionCriteria ||
        `Complete the guided practice task and pass the ${ctx.lessonTitle} Knowledge Check.`
    ),
    keyTakeaways:
      keyTakeaways.length > 0
        ? keyTakeaways
        : ctx.lessonObjectives.length > 0
        ? ctx.lessonObjectives.slice(0, 4)
        : [`Core principles of ${ctx.lessonTitle}`],
    learnSteps,
    examples:
      examples.length > 0
        ? examples
        : [
            {
              title: `Applying ${ctx.lessonTitle}`,
              context: `Real-world scenario aligned with ${ctx.careerGoal}.`,
              explanation:
                'Break the problem into small steps, apply the core concept, and verify the outcome.',
            },
          ],
    practicalApplications:
      practicalApplications.length > 0
        ? practicalApplications
        : [`Applying ${ctx.lessonTitle} workflows in real ${ctx.careerGoal} deliverables.`],
    keyTerminology,
    commonMistakes,
    summary,
    whatToLearnNext,
    ...(ctx.nextLessonTitle ? { nextLessonTitle: ctx.nextLessonTitle } : {}),
    ...(ctx.nextLessonStageTitle ? { nextLessonStageTitle: ctx.nextLessonStageTitle } : {}),
    guidedExercises:
      guidedExercises.length > 0
        ? guidedExercises
        : [
            {
              title: `Practice: ${ctx.lessonTitle}`,
              prompt: `Apply the principles of ${ctx.lessonTitle} to a small real-world scenario.`,
              steps: [
                'Identify the input or goal.',
                'Apply the core technique covered in the Learn steps.',
                'Verify your result against the expected outcome.',
              ],
              expectedOutcome: 'Clear, repeatable solution demonstrating the core concept.',
              hint: 'Focus on one step at a time and check edge cases.',
            },
          ],
    practiceQuestions,
    verifiedResources,
    trustedResources,
    generatedAt: new Date().toISOString(),
  };
}

export async function handleGenerateLessonContentRequest(params: {
  authorizationHeader?: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  forceRegenerate?: boolean;
}): Promise<GeneratedLessonContent> {
  if (!params.roadmapId || !params.stageId || !params.lessonId) {
    throw new LessonApiError(
      400,
      'MISSING_LESSON_IDENTIFIERS',
      'Roadmap ID, stage ID, and lesson ID are required.'
    );
  }

  const ctx = await fetchVerifiedUserAndContext(params);
  const gapSignature = ctx.allKnowledgeGaps.slice(0, 6).join('|');
  const cacheKey = `${ctx.userId}:${ctx.roadmapId}:${ctx.stageId}:${ctx.lessonId}:${ctx.knowledgeLevel}:${gapSignature}`;
  const lockKey = `${ctx.userId}:${ctx.roadmapId}:${ctx.lessonId}`;

  if (!params.forceRegenerate) {
    const cached = getCachedServerLesson(cacheKey);
    if (cached && (cached.contentVersion ?? 1) >= CURRENT_LESSON_CONTENT_VERSION) {
      return cached;
    }

    // Reuse persisted lesson saved inside Supabase roadmap_data.generatedLessons across sessions/restarts
    if (
      ctx.persistedLesson &&
      (ctx.persistedLesson.contentVersion ?? 1) >= CURRENT_LESSON_CONTENT_VERSION &&
      Array.isArray(ctx.persistedLesson.learnSteps) &&
      ctx.persistedLesson.learnSteps.length > 0
    ) {
      let hydrated = ctx.persistedLesson;
      const existingVideos = hydrated.trustedResources?.videos?.length ?? 0;
      const existingTutorials = hydrated.trustedResources?.tutorials?.length ?? 0;
      if (!hydrated.trustedResources || (existingVideos === 0 && existingTutorials === 0)) {
        const refreshedResources = await matchTrustedResourcesForLesson({
          lessonTitle: ctx.lessonTitle,
          lessonDescription: ctx.lessonDescription,
          learningObjectives: ctx.lessonObjectives,
          stageTitle: ctx.stageTitle,
          careerGoal: ctx.careerGoal,
          knowledgeLevel: ctx.knowledgeLevel,
          knowledgeGaps: ctx.allKnowledgeGaps,
          learningInterests: ctx.learningInterests,
          currentSkills: ctx.currentSkills,
          preferredLanguage: 'en',
        });
        hydrated = {
          ...hydrated,
          trustedResources: refreshedResources,
          verifiedResources: [
            ...refreshedResources.tutorials,
            ...refreshedResources.practice,
            ...refreshedResources.videos,
          ].map((item) => ({
            id: item.id,
            title: item.title,
            provider: item.provider,
            type: item.type,
            url: item.url,
            description: item.description,
          })),
        };
      }
      setCachedServerLesson(cacheKey, hydrated);
      return hydrated;
    }
  }

  const existingInFlight = inFlightLessonRequests.get(lockKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  enforceSlidingRateLimit(
    lessonHistoryByUser,
    ctx.userId,
    LESSON_COOLDOWN_MS,
    LESSON_WINDOW_MS,
    MAX_LESSONS_PER_WINDOW,
    'lesson generation'
  );

  const task = (async (): Promise<GeneratedLessonContent> => {
    const ai = createGeminiClient();

    const systemInstruction = [
      'You are Skillora’s personalized AI educator.',
      'Generate comprehensive, well-structured, accurate study material for a single lesson.',
      'Rules:',
      '- Include substantive depth: 4 to 6 learnSteps (4-5 focused sentences each), 2 to 3 worked examples with concrete walkthroughs, 2 to 4 practicalApplications, 3 to 5 keyTerminology entries, 2 to 4 commonMistakes with fixes, a concise summary, whatToLearnNext guidance, 1 to 2 guidedExercises, and 3 to 5 practiceQuestions.',
      '- If the lesson is a programming/technical topic, include clean, accurate code examples and practical expected outputs.',
      '- If the lesson is non-programming (UI/UX design, product, business, marketing, finance, communication, geography, engineering, academic writing, languages, etc.), set isProgrammingTopic=false, omit codeSnippet, and provide rich domain-authentic frameworks, critiques, scenarios, and exercises.',
      '- Do NOT repeat generic boilerplate or duplicate material from sibling lessons in the same course; focus strictly on this specific lesson topic.',
      '- Never invent URLs, links, video IDs, course titles, or claims of live code execution or guaranteed job outcomes.',
      '- Ground all practice questions directly in the concepts taught in learnSteps and examples.',
      '- Return strictly valid JSON matching the schema.',
    ].join('\n');

    const promptLines = [
      'Create personalized educational content for this lesson (student PII omitted):',
      '',
      `- Career Goal / Primary Direction: ${ctx.careerGoal}`,
      `- Field of Study: ${ctx.fieldOfStudy || 'Not specified'}`,
      `- Knowledge Level: ${ctx.knowledgeLevel} (Stage Difficulty: ${ctx.stageDifficulty})`,
      `- Stage: ${ctx.stageTitle}`,
      `- Lesson Title: ${ctx.lessonTitle}`,
      `- Lesson Summary: ${ctx.lessonDescription || 'Core lesson in this stage'}`,
      `- Learning Objectives: ${
        ctx.lessonObjectives.length > 0 ? ctx.lessonObjectives.join('; ') : 'Master core concepts'
      }`,
      `- Completion Criteria: ${
        ctx.lessonCompletionCriteria || 'Demonstrate concept understanding via guided practice and quiz'
      }`,
      `- Prerequisites: ${
        ctx.stagePrerequisites.length > 0 ? ctx.stagePrerequisites.join('; ') : 'None'
      }`,
      ...(ctx.siblingLessonTitles.length > 0
        ? [
            `- Other Lessons in This Course (do NOT duplicate their topics here): ${ctx.siblingLessonTitles.join(
              '; '
            )}`,
          ]
        : []),
      ...(ctx.nextLessonTitle
        ? [
            `- Next Lesson in Sequence (bridge to this in whatToLearnNext): ${ctx.nextLessonTitle}`,
          ]
        : []),
      `- Self-Reported Skills: ${
        ctx.currentSkills.length > 0 ? ctx.currentSkills.join(', ') : 'None listed'
      }`,
      `- Identified Assessment Knowledge Gaps: ${
        ctx.allKnowledgeGaps.length > 0
          ? ctx.allKnowledgeGaps.join(', ')
          : 'No prior gaps recorded yet'
      }`,
    ];

    if (ctx.attemptSummaries.length > 0) {
      promptLines.push('- Recent Assessment Context:');
      for (const a of ctx.attemptSummaries) {
        promptLines.push(
          `  * ${a.subject} (${a.difficulty}): ${a.scorePercent}% | Gaps: ${
            a.gaps.length > 0 ? a.gaps.join(', ') : 'None'
          }`
        );
      }
    }

    // Match verified resources IN PARALLEL with Gemini lesson generation to minimize latency
    const trustedResourcesPromise = matchTrustedResourcesForLesson({
      lessonTitle: ctx.lessonTitle,
      lessonDescription: ctx.lessonDescription,
      learningObjectives: ctx.lessonObjectives,
      stageTitle: ctx.stageTitle,
      careerGoal: ctx.careerGoal,
      knowledgeLevel: ctx.knowledgeLevel,
      knowledgeGaps: ctx.allKnowledgeGaps,
      learningInterests: ctx.learningInterests,
      currentSkills: ctx.currentSkills,
      preferredLanguage: 'en',
    });

    let responseText = '';
    try {
      responseText = await generateJsonWithTimeoutAndFallback({
        ai,
        contents: promptLines.join('\n'),
        systemInstruction,
        responseSchema: LESSON_RESPONSE_SCHEMA,
      });
    } catch (err) {
      throw mapGeminiError(err);
    }

    if (!responseText) {
      throw new LessonApiError(
        502,
        'AI_EMPTY_RESPONSE',
        'The AI service returned an empty lesson response. Please retry.'
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripMarkdownJsonFence(responseText));
    } catch {
      throw new LessonApiError(
        502,
        'AI_JSON_PARSE_ERROR',
        'Could not parse the generated lesson structure. Please retry.'
      );
    }

    const trustedResources = await trustedResourcesPromise;
    const validated = await validateAndNormalizeLessonContent(parsed, ctx, trustedResources);
    setCachedServerLesson(cacheKey, validated);
    await persistGeneratedLessonToRoadmap({
      supabase: ctx.supabase,
      userId: ctx.userId,
      roadmapId: ctx.roadmapId,
      lessonId: ctx.lessonId,
      content: validated,
    });
    recordHistory(lessonHistoryByUser, ctx.userId, LESSON_WINDOW_MS);
    return validated;
  })();

  inFlightLessonRequests.set(lockKey, task);
  try {
    return await task;
  } finally {
    inFlightLessonRequests.delete(lockKey);
  }
}

export async function handleGetCourseResourcesRequest(params: {
  authorizationHeader?: string;
  roadmapId: string;
  stageId: string;
}): Promise<TrustedResourcesBundle> {
  if (!params.roadmapId || !params.stageId) {
    throw new LessonApiError(
      400,
      'MISSING_COURSE_IDENTIFIERS',
      'Roadmap ID and stage ID are required.'
    );
  }

  const authHeader = params.authorizationHeader?.trim() || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new LessonApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with an active Skillora session to view course resources.'
    );
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new LessonApiError(401, 'INVALID_AUTH_TOKEN', 'Missing authentication token.');
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new LessonApiError(
      401,
      'UNAUTHORIZED',
      'Your session has expired or is invalid. Please sign in again.'
    );
  }

  const userId = userData.user.id;
  const cacheKey = `${userId}:${params.roadmapId}:${params.stageId}`;
  const cached = courseResourcesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bundle;
  }

  const existingInFlight = inFlightCourseResources.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const task = (async (): Promise<TrustedResourcesBundle> => {
    const [roadmapResult, profileResult] = await Promise.all([
      supabase
        .from('learning_roadmaps')
        .select('id, career_goal, roadmap_data')
        .eq('id', params.roadmapId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('student_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (roadmapResult.error) {
      throw new LessonApiError(
        roadmapResult.error.code === '42501' ? 403 : 500,
        roadmapResult.error.code || 'ROADMAP_FETCH_FAILED',
        'Could not load course details from Supabase.'
      );
    }
    if (!roadmapResult.data) {
      throw new LessonApiError(404, 'ROADMAP_NOT_FOUND', 'Learning roadmap not found.');
    }

    const roadmapRow = roadmapResult.data as Record<string, unknown>;
    const roadmapData = (roadmapRow.roadmap_data ?? {}) as Record<string, unknown>;
    const stages = Array.isArray(roadmapData.stages)
      ? (roadmapData.stages as RoadmapStageShape[])
      : [];
    const stage = stages.find((s) => s.id === params.stageId);
    if (!stage) {
      throw new LessonApiError(404, 'STAGE_NOT_FOUND', 'Course not found in this roadmap.');
    }

    const profileRow = (profileResult.data ?? {}) as Record<string, unknown>;
    const rawLevel = profileRow.knowledge_level ?? stage.difficulty;
    const knowledgeLevel: KnowledgeLevel =
      rawLevel === 'Beginner' || rawLevel === 'Intermediate' || rawLevel === 'Advanced'
        ? rawLevel
        : 'Intermediate';

    const lessons = Array.isArray(stage.lessons)
      ? (stage.lessons as RoadmapLessonShape[])
      : [];

    const courseUserMeta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
    const courseDbPrimary =
      typeof profileRow.primary_direction === 'string'
        ? profileRow.primary_direction.trim()
        : '';
    const courseMetaPrimary =
      typeof courseUserMeta.primary_direction === 'string'
        ? courseUserMeta.primary_direction.trim()
        : '';
    const coursePrimaryDirection = courseDbPrimary || courseMetaPrimary;

    const bundle = await matchTrustedResourcesForCourse({
      courseTitle: typeof stage.title === 'string' ? stage.title : 'Course',
      courseDescription: typeof stage.description === 'string' ? stage.description : '',
      learningObjectives: Array.isArray(stage.learningObjectives)
        ? stage.learningObjectives.filter((o): o is string => typeof o === 'string')
        : [],
      lessonTitles: lessons
        .map((l) => (typeof l.title === 'string' ? l.title : ''))
        .filter(Boolean),
      knowledgeLevel,
      careerGoal:
        (typeof roadmapRow.career_goal === 'string' && roadmapRow.career_goal.trim()) ||
        coursePrimaryDirection ||
        (typeof profileRow.career_goal === 'string' && profileRow.career_goal.trim()) ||
        '',
    });

    courseResourcesCache.set(cacheKey, {
      expiresAt: Date.now() + COURSE_RESOURCES_CACHE_TTL_MS,
      bundle,
    });

    return bundle;
  })();

  inFlightCourseResources.set(cacheKey, task);
  try {
    return await task;
  } finally {
    if (inFlightCourseResources.get(cacheKey) === task) {
      inFlightCourseResources.delete(cacheKey);
    }
  }
}

const CLARIFY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: 'Clear, encouraging, concise explanation answering the student question.',
    },
    exampleSnippet: {
      type: Type.STRING,
      description: 'Optional short code snippet or concrete mini-example if helpful, otherwise empty string.',
    },
    exampleLanguage: {
      type: Type.STRING,
      description: 'Programming language if exampleSnippet is code, otherwise empty string.',
    },
  },
  required: ['answer'],
};

export interface ClarifyHistoryTurn {
  sender: 'user' | 'assistant';
  text: string;
}

export async function handleClarifyLessonRequest(params: {
  authorizationHeader?: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  question: string;
  currentSection?: string;
  history?: ClarifyHistoryTurn[];
}): Promise<LessonClarificationResponse> {
  const trimmedQuestion = params.question?.trim() || '';
  if (!trimmedQuestion || trimmedQuestion.length < 3) {
    throw new LessonApiError(
      400,
      'INVALID_QUESTION',
      'Please enter a clear question about this lesson.'
    );
  }
  if (trimmedQuestion.length > 600) {
    throw new LessonApiError(
      400,
      'QUESTION_TOO_LONG',
      'Please keep your clarification question under 600 characters.'
    );
  }

  const ctx = await fetchVerifiedUserAndContext(params);

  enforceSlidingRateLimit(
    clarifyHistoryByUser,
    ctx.userId,
    CLARIFY_COOLDOWN_MS,
    CLARIFY_WINDOW_MS,
    MAX_CLARIFIES_PER_WINDOW,
    'clarification'
  );

  const ai = createGeminiClient();
  const attemptLines =
    ctx.attemptSummaries.length > 0
      ? ctx.attemptSummaries
          .map(
            (a) =>
              `${a.subject} (${a.difficulty}): ${a.scorePercent}%${a.gaps.length ? ` [Gaps: ${a.gaps.join(', ')}]` : ''}`
          )
          .join('; ')
      : 'None recorded yet';

  const systemInstruction = [
    'You are a supportive Skillora tutor helping an authenticated student clarify concepts inside their active lesson.',
    'Adapt depth, terminology, and examples directly to their knowledge level, field of study, career goal, and knowledge gaps.',
    'Support step-by-step explanations, practical examples, practice exercises (give hints before full answers unless checking their submitted answer), and discipline-accurate guidance.',
    'Never assume programming unless the lesson or student context involves coding/software.',
    'Always resolve follow-up questions using prior conversation turns.',
    'Never invent URLs or claim code was executed.',
    'Return valid JSON matching the schema.',
    '',
    `STUDENT CONTEXT:`,
    `- Field of Study: ${ctx.fieldOfStudy || 'General'}`,
    `- Knowledge Level: ${ctx.knowledgeLevel}`,
    `- Career Goal: ${ctx.careerGoal}`,
    `- Current Skills: ${ctx.currentSkills.join(', ') || 'None listed'}`,
    `- Learning Interests: ${ctx.learningInterests.join(', ') || 'None listed'}`,
    `- Recent Assessments: ${attemptLines}`,
    `- Knowledge Gaps: ${ctx.allKnowledgeGaps.join(', ') || 'None recorded'}`,
    '',
    `LESSON CONTEXT:`,
    `- Stage: ${ctx.stageTitle} (${ctx.stageDifficulty})`,
    `- Lesson: ${ctx.lessonTitle}`,
    `- Description: ${ctx.lessonDescription || 'Focused curriculum lesson'}`,
    `- Objectives: ${ctx.lessonObjectives.join('; ') || 'Master core lesson concepts'}`,
    `- Active Study Tab: ${params.currentSection || 'Learn'}`,
  ].join('\n');

  const sanitizedHistory = Array.isArray(params.history)
    ? params.history
        .filter(
          (h): h is ClarifyHistoryTurn =>
            Boolean(h) &&
            (h.sender === 'user' || h.sender === 'assistant') &&
            typeof h.text === 'string' &&
            h.text.trim().length > 0
        )
        .slice(-8)
    : [];

  const contents: Content[] = [
    ...sanitizedHistory.map((h) => ({
      role: h.sender === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: h.text.trim().slice(0, 1200) }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: trimmedQuestion }],
    },
  ];

  let responseText = '';
  try {
    responseText = await generateJsonWithTimeoutAndFallback({
      ai,
      contents,
      systemInstruction,
      responseSchema: CLARIFY_RESPONSE_SCHEMA,
    });
  } catch (err) {
    throw mapGeminiError(err);
  }

  if (!responseText) {
    throw new LessonApiError(
      502,
      'AI_EMPTY_RESPONSE',
      'The AI tutor returned an empty response. Please try again.'
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(responseText)) as Record<string, unknown>;
  } catch {
    throw new LessonApiError(
      502,
      'AI_CLARIFY_PARSE_ERROR',
      'Could not read the clarification response. Please try again.'
    );
  }

  recordHistory(clarifyHistoryByUser, ctx.userId, CLARIFY_WINDOW_MS);

  const answer = sanitizeTextNoUrls(
    parsed.answer,
    'Try breaking this concept into smaller steps and reviewing the example in this lesson.'
  );
  const exampleSnippet =
    typeof parsed.exampleSnippet === 'string' && parsed.exampleSnippet.trim()
      ? parsed.exampleSnippet.trim()
      : undefined;
  const exampleLanguage =
    exampleSnippet &&
    typeof parsed.exampleLanguage === 'string' &&
    parsed.exampleLanguage.trim()
      ? parsed.exampleLanguage.trim().toLowerCase()
      : undefined;

  return {
    answer,
    exampleSnippet,
    exampleLanguage,
  };
}
