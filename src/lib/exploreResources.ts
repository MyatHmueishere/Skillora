import { ExploreResourcesPayload } from '../types';
import { getSupabaseClient } from './supabase';

export class ExploreResourcesClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ExploreResourcesClientError';
    this.status = status;
    this.code = code;
  }
}

const CLIENT_CACHE_TTL_MS = 5 * 60_000;
const SESSION_CACHE_PREFIX = 'skillora_explore_cache_v1:';

interface CachedExploreEntry {
  expiresAt: number;
  payload: ExploreResourcesPayload;
}

const exploreClientCache = new Map<string, CachedExploreEntry>();
const exploreClientInFlight = new Map<string, Promise<ExploreResourcesPayload>>();
const pendingServerRefreshKeys = new Set<string>();

function readSessionExploreCache(cacheKey: string): CachedExploreEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedExploreEntry>;
    if (
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > Date.now() &&
      parsed.payload &&
      Array.isArray(parsed.payload.forYou) &&
      Array.isArray(parsed.payload.all)
    ) {
      return parsed as CachedExploreEntry;
    }
    window.sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${cacheKey}`);
  } catch {
    // Ignore storage read errors
  }
  return null;
}

function writeSessionExploreCache(cacheKey: string, entry: CachedExploreEntry): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedExploreResources(
  userId?: string | null
): ExploreResourcesPayload | null {
  const cacheKey = userId ? `user:${userId}` : 'guest';
  if (pendingServerRefreshKeys.has(cacheKey) || pendingServerRefreshKeys.has('*')) {
    return null;
  }
  const inMem = exploreClientCache.get(cacheKey);
  if (inMem && inMem.expiresAt > Date.now()) {
    return inMem.payload;
  }
  const fromSession = readSessionExploreCache(cacheKey);
  if (fromSession) {
    exploreClientCache.set(cacheKey, fromSession);
    return fromSession.payload;
  }
  return null;
}

export function clearExploreResourcesCache(
  userId?: string | null,
  options?: { bypassServerCacheOnNextFetch?: boolean }
): void {
  const bypassServer = options?.bypassServerCacheOnNextFetch ?? Boolean(userId);
  if (userId) {
    const key = `user:${userId}`;
    exploreClientCache.delete(key);
    exploreClientInFlight.delete(key);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${key}`);
      } catch {
        // Ignore storage errors
      }
    }
    if (bypassServer) {
      pendingServerRefreshKeys.add(key);
    }
  } else {
    exploreClientCache.clear();
    exploreClientInFlight.clear();
    if (typeof window !== 'undefined') {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i += 1) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {
        // Ignore storage errors
      }
    }
    if (bypassServer) {
      pendingServerRefreshKeys.add('*');
    } else {
      pendingServerRefreshKeys.clear();
    }
  }
}

export async function fetchExploreResources(options?: {
  userId?: string | null;
  forceRefresh?: boolean;
}): Promise<ExploreResourcesPayload> {
  let accessToken: string | undefined;
  let sessionUserId: string | null = options?.userId ?? null;

  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
    sessionUserId = data.session?.user?.id ?? null;
  } catch {
    accessToken = undefined;
    sessionUserId = null;
  }

  const cacheKey = sessionUserId ? `user:${sessionUserId}` : 'guest';
  const shouldBypassForMutation =
    pendingServerRefreshKeys.delete(cacheKey) || pendingServerRefreshKeys.delete('*');
  const forceRefresh = Boolean(options?.forceRefresh || shouldBypassForMutation);

  if (!forceRefresh) {
    const cached = getCachedExploreResources(sessionUserId);
    if (cached) {
      return cached;
    }

    const existingFlight = exploreClientInFlight.get(cacheKey);
    if (existingFlight) {
      return existingFlight;
    }
  }

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const endpoint = forceRefresh
    ? '/api/resources/explore?refresh=1'
    : '/api/resources/explore';

  const requestPromise = (async (): Promise<ExploreResourcesPayload> => {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
    } catch {
      throw new ExploreResourcesClientError(
        0,
        'NETWORK_ERROR',
        'Could not connect to load Explore Resources. Please try again.'
      );
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
          : 'Unable to load Explore Resources right now.';
      throw new ExploreResourcesClientError(response.status, code, message);
    }

    const typed = payload as unknown as ExploreResourcesPayload;
    const entry: CachedExploreEntry = {
      expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
      payload: typed,
    };
    exploreClientCache.set(cacheKey, entry);
    writeSessionExploreCache(cacheKey, entry);
    return typed;
  })().finally(() => {
    exploreClientInFlight.delete(cacheKey);
  });

  exploreClientInFlight.set(cacheKey, requestPromise);
  return requestPromise;
}
