import {
  GeneratedLessonContent,
  LessonClarificationResponse,
  TrustedResourcesBundle,
} from '../types';
import { getSupabaseClient } from './supabase';

export class LessonContentClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'LessonContentClientError';
    this.status = status;
    this.code = code;
  }
}

const LESSON_CACHE_PREFIX = 'skillora_lesson_content_v4:';
const COURSE_RES_CACHE_PREFIX = 'skillora_course_res_v2:';
const LESSON_LOCAL_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours across reloads
const COURSE_RESOURCES_TTL_MS = 30 * 60 * 1000; // 30 minutes
const LESSON_REQUEST_TIMEOUT_MS = 55_000;
const CLARIFY_REQUEST_TIMEOUT_MS = 28_000;
const COURSE_RESOURCES_TIMEOUT_MS = 20_000;

interface StoredLessonEnvelope {
  cachedAt: number;
  content: GeneratedLessonContent;
}

const memoryLessonCache = new Map<string, GeneratedLessonContent>();
const inFlightLessonLoads = new Map<string, Promise<GeneratedLessonContent>>();
const courseResourcesCache = new Map<
  string,
  { expiresAt: number; bundle: TrustedResourcesBundle }
>();
const inFlightCourseResources = new Map<string, Promise<TrustedResourcesBundle>>();

function buildCacheKey(userId: string, roadmapId: string, lessonId: string): string {
  return `${LESSON_CACHE_PREFIX}${userId}:${roadmapId}:${lessonId}`;
}

export function getCachedCourseTrustedResources(
  userId: string,
  roadmapId: string,
  stageId: string
): TrustedResourcesBundle | null {
  if (!userId || !roadmapId || !stageId) return null;
  const cacheKey = `${userId}:${roadmapId}:${stageId}`;
  const inMem = courseResourcesCache.get(cacheKey);
  if (inMem && inMem.expiresAt > Date.now()) {
    return inMem.bundle;
  }
  try {
    const raw = window.sessionStorage.getItem(`${COURSE_RES_CACHE_PREFIX}${cacheKey}`);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        expiresAt?: number;
        bundle?: TrustedResourcesBundle;
      };
      if (
        typeof parsed.expiresAt === 'number' &&
        parsed.expiresAt > Date.now() &&
        parsed.bundle &&
        Array.isArray(parsed.bundle.videos)
      ) {
        const entry = { expiresAt: parsed.expiresAt, bundle: parsed.bundle };
        courseResourcesCache.set(cacheKey, entry);
        return parsed.bundle;
      }
      window.sessionStorage.removeItem(`${COURSE_RES_CACHE_PREFIX}${cacheKey}`);
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

function isValidLessonContentShape(
  parsed: unknown,
  roadmapId: string,
  lessonId: string
): parsed is GeneratedLessonContent {
  if (!parsed || typeof parsed !== 'object') return false;
  const candidate = parsed as Partial<GeneratedLessonContent>;
  return (
    candidate.roadmapId === roadmapId &&
    candidate.lessonId === lessonId &&
    Array.isArray(candidate.learnSteps)
  );
}

export function getCachedLessonContent(
  userId: string,
  roadmapId: string,
  lessonId: string
): GeneratedLessonContent | null {
  const key = buildCacheKey(userId, roadmapId, lessonId);
  const inMem = memoryLessonCache.get(key);
  if (inMem) return inMem;

  try {
    const rawSession = window.sessionStorage.getItem(key);
    if (rawSession) {
      const parsed = JSON.parse(rawSession) as unknown;
      if (isValidLessonContentShape(parsed, roadmapId, lessonId)) {
        memoryLessonCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignore sessionStorage read failures
  }

  try {
    const rawLocal = window.localStorage.getItem(key);
    if (rawLocal) {
      const envelope = JSON.parse(rawLocal) as Partial<StoredLessonEnvelope>;
      if (
        typeof envelope.cachedAt === 'number' &&
        Date.now() - envelope.cachedAt < LESSON_LOCAL_TTL_MS &&
        isValidLessonContentShape(envelope.content, roadmapId, lessonId)
      ) {
        memoryLessonCache.set(key, envelope.content);
        return envelope.content;
      }
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore localStorage read failures
  }

  return null;
}

export function cacheLessonContent(
  userId: string,
  content: GeneratedLessonContent
): void {
  const key = buildCacheKey(userId, content.roadmapId, content.lessonId);
  memoryLessonCache.set(key, content);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(content));
  } catch {
    // Ignore storage quota failures
  }
  try {
    const envelope: StoredLessonEnvelope = {
      cachedAt: Date.now(),
      content,
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore localStorage quota failures
  }
}

export function clearLessonContentCache(): void {
  memoryLessonCache.clear();
  courseResourcesCache.clear();
  inFlightLessonLoads.clear();
  inFlightCourseResources.clear();

  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (k.startsWith(LESSON_CACHE_PREFIX) || k.startsWith(COURSE_RES_CACHE_PREFIX))) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        storage.removeItem(k);
      }
    } catch {
      // Ignore storage errors
    }
  }
}

function createAbortError(): Error {
  const err = new Error('The request was cancelled.');
  err.name = 'AbortError';
  return err;
}

function raceWithCallerSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

export async function fetchOrGenerateLessonContent(params: {
  roadmapId: string;
  stageId: string;
  lessonId: string;
  forceRegenerate?: boolean;
  signal?: AbortSignal;
}): Promise<GeneratedLessonContent> {
  if (params.signal?.aborted) {
    throw createAbortError();
  }

  const supabase = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new LessonContentClientError(
      401,
      'SESSION_ERROR',
      'Could not verify your session. Please sign in again.'
    );
  }

  const session = sessionData.session;
  const accessToken = session?.access_token;
  const userId = session?.user?.id;
  if (!accessToken || !userId) {
    throw new LessonContentClientError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with your Skillora account to access interactive lessons.'
    );
  }

  const force = Boolean(params.forceRegenerate);
  if (!force) {
    const cached = getCachedLessonContent(userId, params.roadmapId, params.lessonId);
    if (cached) {
      return cached;
    }
  }

  const inFlightKey = `${userId}:${params.roadmapId}:${params.lessonId}`;
  const existingFlight = !force ? inFlightLessonLoads.get(inFlightKey) : undefined;
  if (existingFlight) {
    return raceWithCallerSignal(existingFlight, params.signal);
  }

  const requestTask = (async (): Promise<GeneratedLessonContent> => {
    const timeoutController = new AbortController();
    const timer = window.setTimeout(() => {
      timeoutController.abort();
    }, LESSON_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: timeoutController.signal,
        body: JSON.stringify({
          roadmapId: params.roadmapId,
          stageId: params.stageId,
          lessonId: params.lessonId,
          forceRegenerate: force,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LessonContentClientError(
          408,
          'REQUEST_TIMEOUT',
          'Loading lesson content took too long. Please tap Retry to try again.'
        );
      }
      throw new LessonContentClientError(
        0,
        'NETWORK_ERROR',
        'Network connection interrupted while loading lesson content. Please try again.'
      );
    } finally {
      window.clearTimeout(timer);
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const code = typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`;
      const message =
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error
          : 'Unable to generate lesson content right now. Please try again.';
      throw new LessonContentClientError(response.status, code, message);
    }

    const content = payload.lessonContent as GeneratedLessonContent | undefined;
    if (!content || !Array.isArray(content.learnSteps)) {
      throw new LessonContentClientError(
        502,
        'INVALID_SERVER_PAYLOAD',
        'The server returned an unexpected lesson payload.'
      );
    }

    cacheLessonContent(userId, content);
    return content;
  })();

  if (!force) {
    inFlightLessonLoads.set(inFlightKey, requestTask);
  }

  try {
    return await raceWithCallerSignal(requestTask, params.signal);
  } finally {
    if (!force && inFlightLessonLoads.get(inFlightKey) === requestTask) {
      inFlightLessonLoads.delete(inFlightKey);
    }
  }
}

export async function fetchCourseTrustedResources(params: {
  roadmapId: string;
  stageId: string;
  signal?: AbortSignal;
}): Promise<TrustedResourcesBundle> {
  if (params.signal?.aborted) {
    throw createAbortError();
  }

  const supabase = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token || !sessionData.session.user?.id) {
    throw new LessonContentClientError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with an active Skillora session to view course resources.'
    );
  }

  const accessToken = sessionData.session.access_token;
  const userId = sessionData.session.user.id;
  const cacheKey = `${userId}:${params.roadmapId}:${params.stageId}`;
  const cached = getCachedCourseTrustedResources(userId, params.roadmapId, params.stageId);
  if (cached) {
    return cached;
  }

  const existingFlight = inFlightCourseResources.get(cacheKey);
  if (existingFlight) {
    return raceWithCallerSignal(existingFlight, params.signal);
  }

  const requestTask = (async (): Promise<TrustedResourcesBundle> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      controller.abort();
    }, COURSE_RESOURCES_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch('/api/courses/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          roadmapId: params.roadmapId,
          stageId: params.stageId,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LessonContentClientError(
          408,
          'REQUEST_TIMEOUT',
          'Loading course resources took too long. Please try again.'
        );
      }
      throw new LessonContentClientError(
        0,
        'NETWORK_ERROR',
        'Network connection interrupted while loading course resources.'
      );
    } finally {
      window.clearTimeout(timer);
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const code = typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`;
      const message =
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error
          : 'Unable to load course resources right now.';
      throw new LessonContentClientError(response.status, code, message);
    }

    const resources = payload.resources as TrustedResourcesBundle | undefined;
    if (
      !resources ||
      !Array.isArray(resources.videos) ||
      !Array.isArray(resources.tutorials) ||
      !Array.isArray(resources.practice)
    ) {
      throw new LessonContentClientError(
        502,
        'INVALID_SERVER_PAYLOAD',
        'The server returned an unexpected course resources payload.'
      );
    }

    const cacheEntry = {
      expiresAt: Date.now() + COURSE_RESOURCES_TTL_MS,
      bundle: resources,
    };
    courseResourcesCache.set(cacheKey, cacheEntry);
    try {
      window.sessionStorage.setItem(
        `${COURSE_RES_CACHE_PREFIX}${cacheKey}`,
        JSON.stringify(cacheEntry)
      );
    } catch {
      // Ignore storage quota errors
    }

    return resources;
  })();

  inFlightCourseResources.set(cacheKey, requestTask);
  try {
    return await raceWithCallerSignal(requestTask, params.signal);
  } finally {
    if (inFlightCourseResources.get(cacheKey) === requestTask) {
      inFlightCourseResources.delete(cacheKey);
    }
  }
}

export async function requestLessonClarification(params: {
  roadmapId: string;
  stageId: string;
  lessonId: string;
  question: string;
  currentSection: string;
  history?: { sender: 'user' | 'assistant'; text: string }[];
}): Promise<LessonClarificationResponse> {
  const supabase = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new LessonContentClientError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with an active session to ask a question.'
    );
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CLARIFY_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('/api/lessons/clarify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        roadmapId: params.roadmapId,
        stageId: params.stageId,
        lessonId: params.lessonId,
        question: params.question,
        currentSection: params.currentSection,
        history: params.history,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LessonContentClientError(
        408,
        'REQUEST_TIMEOUT',
        'Tutor response timed out. Please try asking again.'
      );
    }
    throw new LessonContentClientError(
      0,
      'NETWORK_ERROR',
      'Network error while requesting clarification. Please try again.'
    );
  } finally {
    window.clearTimeout(timer);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`;
    const message =
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error
        : 'Could not get a clarification right now. Please try again.';
    throw new LessonContentClientError(response.status, code, message);
  }

  const clarification = payload.clarification as LessonClarificationResponse | undefined;
  if (!clarification || typeof clarification.answer !== 'string') {
    throw new LessonContentClientError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'The server returned an unexpected clarification response.'
    );
  }

  return clarification;
}
