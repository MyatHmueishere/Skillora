import type {
  KnowledgeCheckAdaptiveRecommendation,
  KnowledgeCheckInstantFeedback,
  KnowledgeCheckStartResponse,
  LessonKnowledgeCheckAttemptRecord,
} from '../types';
import { getSupabaseClient } from './supabase';

export class KnowledgeCheckClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'KnowledgeCheckClientError';
    this.status = status;
    this.code = code;
  }
}

async function getVerifiedAccessToken(): Promise<string> {
  const supabase = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new KnowledgeCheckClientError(
      401,
      'SESSION_ERROR',
      'Could not verify your session. Please sign in again.'
    );
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new KnowledgeCheckClientError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with an active Skillora account to take Knowledge Checks.'
    );
  }
  return accessToken;
}

const KC_START_TIMEOUT_MS = 40_000;
const KC_FAST_TIMEOUT_MS = 15_000;
const KC_PREFETCH_TTL_MS = 10 * 60_000;

const prefetchedQuizCache = new Map<
  string,
  { expiresAt: number; quiz: KnowledgeCheckStartResponse }
>();
const inFlightQuizStarts = new Map<string, Promise<KnowledgeCheckStartResponse>>();

function quizCacheKey(roadmapId: string, stageId: string, lessonId: string): string {
  return `${roadmapId}:${stageId}:${lessonId}`;
}

export function clearPrefetchedKnowledgeCheck(
  roadmapId?: string,
  stageId?: string,
  lessonId?: string
): void {
  if (roadmapId && stageId && lessonId) {
    prefetchedQuizCache.delete(quizCacheKey(roadmapId, stageId, lessonId));
  } else {
    prefetchedQuizCache.clear();
  }
}

async function fetchKnowledgeCheckEndpoint(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
  networkMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new KnowledgeCheckClientError(408, 'REQUEST_TIMEOUT', timeoutMessage);
    }
    throw new KnowledgeCheckClientError(0, 'NETWORK_ERROR', networkMessage);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function startLessonKnowledgeCheck(params: {
  roadmapId: string;
  stageId: string;
  lessonId: string;
  questionCount?: number;
}): Promise<KnowledgeCheckStartResponse> {
  const key = quizCacheKey(params.roadmapId, params.stageId, params.lessonId);
  const cached = prefetchedQuizCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    prefetchedQuizCache.delete(key);
    return cached.quiz;
  }

  const existingFlight = inFlightQuizStarts.get(key);
  if (existingFlight) {
    return existingFlight;
  }

  const task = (async (): Promise<KnowledgeCheckStartResponse> => {
    const accessToken = await getVerifiedAccessToken();

    const response = await fetchKnowledgeCheckEndpoint(
      '/api/knowledge-checks/start',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          roadmapId: params.roadmapId,
          stageId: params.stageId,
          lessonId: params.lessonId,
          questionCount: params.questionCount,
        }),
      },
      KC_START_TIMEOUT_MS,
      'Preparing your Knowledge Check took too long. Please retry.',
      'Network connection interrupted while starting Knowledge Check. Please try again.'
    );

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new KnowledgeCheckClientError(
        response.status,
        typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error
          : 'Unable to start Knowledge Check right now. Please try again.'
      );
    }

    const quiz = payload.quiz as KnowledgeCheckStartResponse | undefined;
    if (!quiz || !quiz.quizToken || !Array.isArray(quiz.questions)) {
      throw new KnowledgeCheckClientError(
        502,
        'INVALID_SERVER_PAYLOAD',
        'The server returned an unexpected Knowledge Check payload.'
      );
    }

    return quiz;
  })();

  inFlightQuizStarts.set(key, task);
  try {
    return await task;
  } finally {
    if (inFlightQuizStarts.get(key) === task) {
      inFlightQuizStarts.delete(key);
    }
  }
}

export async function prefetchLessonKnowledgeCheck(params: {
  roadmapId: string;
  stageId: string;
  lessonId: string;
  questionCount?: number;
}): Promise<void> {
  const key = quizCacheKey(params.roadmapId, params.stageId, params.lessonId);
  const existing = prefetchedQuizCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return;
  if (inFlightQuizStarts.has(key)) return;

  try {
    const quiz = await startLessonKnowledgeCheck(params);
    prefetchedQuizCache.set(key, {
      expiresAt: Date.now() + KC_PREFETCH_TTL_MS,
      quiz,
    });
  } catch {
    // Non-blocking background warm-up; ignore transient errors cleanly
  }
}

export async function checkKnowledgeCheckAnswer(params: {
  quizToken: string;
  questionId: string;
  selectedOptionIndex: number;
}): Promise<KnowledgeCheckInstantFeedback> {
  const accessToken = await getVerifiedAccessToken();

  const response = await fetchKnowledgeCheckEndpoint(
    '/api/knowledge-checks/check-answer',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(params),
    },
    KC_FAST_TIMEOUT_MS,
    'Checking your answer took too long. Please try again.',
    'Network error while checking your answer. Please try again.'
  );

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new KnowledgeCheckClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error
        : 'Could not verify your answer right now.'
    );
  }

  const feedback = payload.feedback as KnowledgeCheckInstantFeedback | undefined;
  if (!feedback || typeof feedback.isCorrect !== 'boolean') {
    throw new KnowledgeCheckClientError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'Unexpected answer verification response from server.'
    );
  }

  return feedback;
}

export async function submitLessonKnowledgeCheck(params: {
  quizToken: string;
  answers: Record<string, number>;
}): Promise<{
  attempt: LessonKnowledgeCheckAttemptRecord;
  duplicatePrevented: boolean;
  storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
}> {
  const accessToken = await getVerifiedAccessToken();

  const response = await fetchKnowledgeCheckEndpoint(
    '/api/knowledge-checks/submit',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(params),
    },
    KC_FAST_TIMEOUT_MS,
    'Submitting your Knowledge Check took too long. Please retry.',
    'Network connection interrupted while submitting your Knowledge Check. Please retry.'
  );

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new KnowledgeCheckClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error
        : 'Unable to submit your Knowledge Check right now. Please try again.'
    );
  }

  const attempt = payload.attempt as LessonKnowledgeCheckAttemptRecord | undefined;
  if (!attempt || !attempt.id) {
    throw new KnowledgeCheckClientError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'The server did not return a saved Knowledge Check result.'
    );
  }

  clearPrefetchedKnowledgeCheck(attempt.roadmapId, attempt.stageId, attempt.lessonId);

  return {
    attempt,
    duplicatePrevented: payload.duplicatePrevented === true,
    storageMode:
      payload.storageMode === 'roadmap_jsonb_fallback'
        ? 'roadmap_jsonb_fallback'
        : 'lesson_knowledge_checks',
  };
}

export async function loadKnowledgeCheckHistory(): Promise<{
  attempts: LessonKnowledgeCheckAttemptRecord[];
  storageMode: 'lesson_knowledge_checks' | 'roadmap_jsonb_fallback';
  schemaMigrationRequired: boolean;
}> {
  const supabase = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new KnowledgeCheckClientError(
      401,
      'SESSION_ERROR',
      'Could not verify session while loading Knowledge Check history.'
    );
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return {
      attempts: [],
      storageMode: 'lesson_knowledge_checks',
      schemaMigrationRequired: false,
    };
  }

  const response = await fetchKnowledgeCheckEndpoint(
    '/api/knowledge-checks/history',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    KC_FAST_TIMEOUT_MS,
    'Loading Knowledge Check history timed out. Please retry.',
    'Network connection interrupted while loading Knowledge Check history.'
  );

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new KnowledgeCheckClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error
        : 'Could not load Knowledge Check history.'
    );
  }

  const attempts = Array.isArray(payload.attempts)
    ? (payload.attempts as LessonKnowledgeCheckAttemptRecord[])
    : [];

  return {
    attempts,
    storageMode:
      payload.storageMode === 'roadmap_jsonb_fallback'
        ? 'roadmap_jsonb_fallback'
        : 'lesson_knowledge_checks',
    schemaMigrationRequired: payload.schemaMigrationRequired === true,
  };
}

export interface AttemptImprovementStats {
  attemptNumber: number;
  totalAttemptsForLesson: number;
  previousScore: number | null;
  deltaPercent: number | null;
  deltaFromFirst: number | null;
}

export function computeAttemptImprovement(
  attempt: LessonKnowledgeCheckAttemptRecord,
  allAttempts: LessonKnowledgeCheckAttemptRecord[]
): AttemptImprovementStats {
  const sameLessonAttempts = allAttempts
    .filter(
      (item) =>
        item.lessonId === attempt.lessonId &&
        (!attempt.roadmapId || !item.roadmapId || item.roadmapId === attempt.roadmapId)
    )
    .slice()
    .sort(
      (a, b) =>
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );

  const idx = sameLessonAttempts.findIndex((item) => item.id === attempt.id);
  if (idx < 0) {
    return {
      attemptNumber: 1,
      totalAttemptsForLesson: Math.max(1, sameLessonAttempts.length),
      previousScore: null,
      deltaPercent: null,
      deltaFromFirst: null,
    };
  }

  const prev = idx > 0 ? sameLessonAttempts[idx - 1] : null;
  const first = idx > 0 ? sameLessonAttempts[0] : null;

  return {
    attemptNumber: idx + 1,
    totalAttemptsForLesson: sameLessonAttempts.length,
    previousScore: prev ? prev.score : null,
    deltaPercent: prev ? attempt.score - prev.score : null,
    deltaFromFirst: first ? attempt.score - first.score : null,
  };
}

export interface KnowledgeCheckDashboardSummary {
  totalQuizzes: number;
  averageScore: number | null;
  recentAttempt: LessonKnowledgeCheckAttemptRecord | null;
  weakTopics: string[];
  recommendedNextActivity: KnowledgeCheckAdaptiveRecommendation | null;
}

export function computeKnowledgeCheckSummary(
  attempts: LessonKnowledgeCheckAttemptRecord[]
): KnowledgeCheckDashboardSummary {
  if (attempts.length === 0) {
    return {
      totalQuizzes: 0,
      averageScore: null,
      recentAttempt: null,
      weakTopics: [],
      recommendedNextActivity: null,
    };
  }

  const sorted = attempts
    .slice()
    .sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

  const totalQuizzes = sorted.length;
  const averageScore = Math.round(
    sorted.reduce((sum, item) => sum + item.score, 0) / totalQuizzes
  );
  const recentAttempt = sorted[0];

  const weakTopicSet = new Set<string>();
  for (const item of sorted.slice(0, 8)) {
    for (const gap of item.knowledgeGaps) {
      if (gap.trim()) weakTopicSet.add(gap.trim());
    }
  }

  return {
    totalQuizzes,
    averageScore,
    recentAttempt,
    weakTopics: Array.from(weakTopicSet).slice(0, 5),
    recommendedNextActivity: recentAttempt.recommendation ?? null,
  };
}

export function formatKnowledgeCheckDate(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
