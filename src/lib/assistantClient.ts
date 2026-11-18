import {
  AssistantConversationSummary,
  AssistantRecommendedResource,
  ChatMessage,
} from '../types';
import { getSupabaseClient } from './supabase';

export class AssistantClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AssistantClientError';
    this.status = status;
    this.code = code;
  }
}

export interface AssistantLessonContext {
  roadmapId?: string;
  stageId?: string;
  lessonId?: string;
}

export interface ServerAssistantMessage {
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

export interface LoadConversationsResult {
  conversations: AssistantConversationSummary[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
}

export interface SendAssistantMessageResult {
  conversation: AssistantConversationSummary;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
}

export interface LocalAssistantCachePayload {
  conversations: AssistantConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
  draftByConversation?: Record<string, string>;
}

const ASSISTANT_SESSION_CACHE_PREFIX = 'skillora_assistant_cache_v1:';
const SESSION_LOOKUP_TIMEOUT_MS = 6_000;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TOTAL_STREAM_TIMEOUT_MS = 70_000;

export function generateClientTurnId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatMessageTimestamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function mapServerMessageToChatMessage(msg: ServerAssistantMessage): ChatMessage {
  return {
    id: msg.id,
    sender: msg.sender,
    text: msg.text,
    timestamp: formatMessageTimestamp(msg.createdAt),
    createdAt: msg.createdAt,
    ...(msg.codeSnippet ? { codeSnippet: msg.codeSnippet } : {}),
    ...(msg.language ? { language: msg.language } : {}),
    ...(Array.isArray(msg.recommendedResources) && msg.recommendedResources.length > 0
      ? { recommendedResources: msg.recommendedResources }
      : {}),
    ...(Array.isArray(msg.suggestedFollowUps) && msg.suggestedFollowUps.length > 0
      ? { suggestedFollowUps: msg.suggestedFollowUps }
      : {}),
  };
}

export function clearAllAssistantCaches(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(ASSISTANT_SESSION_CACHE_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) {
      window.sessionStorage.removeItem(k);
    }
  } catch {
    // Ignore storage unavailability
  }
}

export function loadEphemeralAssistantState(userId: string): LocalAssistantCachePayload | null {
  try {
    const raw = window.sessionStorage.getItem(`${ASSISTANT_SESSION_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAssistantCachePayload>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      activeConversationId: parsed.activeConversationId ?? null,
      messagesByConversation:
        parsed.messagesByConversation && typeof parsed.messagesByConversation === 'object'
          ? parsed.messagesByConversation
          : {},
      draftByConversation:
        parsed.draftByConversation && typeof parsed.draftByConversation === 'object'
          ? parsed.draftByConversation
          : {},
    };
  } catch {
    return null;
  }
}

export function saveEphemeralAssistantState(
  userId: string,
  state: LocalAssistantCachePayload
): void {
  try {
    window.sessionStorage.setItem(
      `${ASSISTANT_SESSION_CACHE_PREFIX}${userId}`,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota errors
  }
}

function isJwtExpiringSoon(token: string, bufferMs = 30_000): boolean {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return false;
    }
    return payload.exp * 1000 <= Date.now() + bufferMs;
  } catch {
    return true;
  }
}

async function getAccessTokenOrThrow(
  providedToken?: string | null,
  forceRefresh = false
): Promise<string> {
  const trimmedProvided = providedToken?.trim() || '';
  if (!forceRefresh && trimmedProvided && !isJwtExpiringSoon(trimmedProvided)) {
    return trimmedProvided;
  }

  let timer: number | undefined;
  try {
    const supabase = await getSupabaseClient();
    const raceTimeout = <T,>(promise: Promise<T>): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = window.setTimeout(() => {
            reject(
              new AssistantClientError(
                408,
                'SESSION_LOOKUP_TIMEOUT',
                'Session check took too long. Please refresh or try sending again.'
              )
            );
          }, SESSION_LOOKUP_TIMEOUT_MS);
        }),
      ]);

    if (!forceRefresh) {
      const sessionRes = await raceTimeout(supabase.auth.getSession());
      const currentToken = sessionRes.data.session?.access_token?.trim();
      if (!sessionRes.error && currentToken && !isJwtExpiringSoon(currentToken)) {
        return currentToken;
      }
    }

    const refreshedRes = await raceTimeout(supabase.auth.refreshSession());
    const refreshedToken = refreshedRes.data.session?.access_token?.trim();
    if (!refreshedRes.error && refreshedToken) {
      return refreshedToken;
    }

    if (trimmedProvided) {
      return trimmedProvided;
    }

    throw new AssistantClientError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with your Skillora account to use the AI Study Companion.'
    );
  } catch (err) {
    if (err instanceof AssistantClientError) throw err;
    throw new AssistantClientError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with your Skillora account to use the AI Study Companion.'
    );
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

function createLinkedTimeoutController(
  externalSignal?: AbortSignal,
  idleTimeoutMs = REQUEST_TIMEOUT_MS,
  maxTotalTimeoutMs = MAX_TOTAL_STREAM_TIMEOUT_MS
): {
  signal: AbortSignal;
  wasTimedOut: () => boolean;
  cleanup: () => void;
  resetTimer: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  let idleTimer: number | undefined;
  let totalTimer: number | undefined;

  const triggerTimeout = () => {
    timedOut = true;
    controller.abort();
  };

  const scheduleIdleTimer = () => {
    if (idleTimer !== undefined) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(triggerTimeout, idleTimeoutMs);
  };

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  scheduleIdleTimer();
  totalTimer = window.setTimeout(triggerTimeout, maxTotalTimeoutMs);

  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    resetTimer: scheduleIdleTimer,
    cleanup: () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      if (totalTimer !== undefined) window.clearTimeout(totalTimer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchAssistantConversations(
  conversationId?: string,
  signal?: AbortSignal,
  accessToken?: string | null
): Promise<LoadConversationsResult> {
  const query = conversationId
    ? `?conversationId=${encodeURIComponent(conversationId)}`
    : '';

  const runOnce = async (forceRefresh: boolean) => {
    const token = await getAccessTokenOrThrow(accessToken, forceRefresh);
    const linked = createLinkedTimeoutController(signal, 15_000);

    let response: Response;
    try {
      response = await fetch(`/api/assistant/conversations${query}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: linked.signal,
      });
    } catch (err) {
      if (linked.wasTimedOut()) {
        throw new AssistantClientError(
          504,
          'REQUEST_TIMEOUT',
          'Loading your conversation history timed out. Please try again.'
        );
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new AssistantClientError(
        0,
        'NETWORK_ERROR',
        'Could not connect to load your saved conversations.'
      );
    } finally {
      linked.cleanup();
    }

    const payload = await parseJsonSafe(response);
    return { response, payload };
  };

  let { response, payload } = await runOnce(false);
  if (response.status === 401 && !signal?.aborted) {
    ({ response, payload } = await runOnce(true));
  }

  if (!response.ok) {
    throw new AssistantClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : 'Could not load your AI Study Companion conversations.'
    );
  }

  const rawConversations = Array.isArray(payload.conversations)
    ? (payload.conversations as AssistantConversationSummary[])
    : [];
  const rawMessages = Array.isArray(payload.messages)
    ? (payload.messages as ServerAssistantMessage[]).map(mapServerMessageToChatMessage)
    : [];

  return {
    conversations: rawConversations,
    activeConversationId:
      typeof payload.activeConversationId === 'string' ? payload.activeConversationId : null,
    messages: rawMessages,
    storageMode:
      payload.storageMode === 'table' ||
      payload.storageMode === 'roadmap_fallback' ||
      payload.storageMode === 'ephemeral'
        ? payload.storageMode
        : 'table',
  };
}

export async function createAssistantConversation(
  params?: {
    title?: string;
    lessonContext?: AssistantLessonContext;
    accessToken?: string | null;
  },
  signal?: AbortSignal
): Promise<{
  conversation: AssistantConversationSummary;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
}> {
  const runOnce = async (forceRefresh: boolean) => {
    const token = await getAccessTokenOrThrow(params?.accessToken, forceRefresh);
    const linked = createLinkedTimeoutController(signal, 15_000);

    let response: Response;
    try {
      response = await fetch('/api/assistant/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: params?.title,
          lessonContext: params?.lessonContext,
        }),
        signal: linked.signal,
      });
    } catch (err) {
      if (linked.wasTimedOut()) {
        throw new AssistantClientError(
          504,
          'REQUEST_TIMEOUT',
          'Starting a new conversation timed out. Please try again.'
        );
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new AssistantClientError(
        0,
        'NETWORK_ERROR',
        'Network error while starting a new conversation.'
      );
    } finally {
      linked.cleanup();
    }

    const payload = await parseJsonSafe(response);
    return { response, payload };
  };

  let { response, payload } = await runOnce(false);
  if (response.status === 401 && !signal?.aborted) {
    ({ response, payload } = await runOnce(true));
  }

  if (!response.ok) {
    throw new AssistantClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : 'Could not start a new conversation right now.'
    );
  }

  const conversation = payload.conversation as AssistantConversationSummary | undefined;
  if (!conversation?.id) {
    throw new AssistantClientError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'Server did not return a valid conversation.'
    );
  }

  return {
    conversation,
    storageMode:
      payload.storageMode === 'table' ||
      payload.storageMode === 'roadmap_fallback' ||
      payload.storageMode === 'ephemeral'
        ? payload.storageMode
        : 'table',
  };
}

export async function deleteAssistantConversation(
  conversationId: string,
  signal?: AbortSignal,
  accessToken?: string | null
): Promise<void> {
  const runOnce = async (forceRefresh: boolean) => {
    const token = await getAccessTokenOrThrow(accessToken, forceRefresh);
    const linked = createLinkedTimeoutController(signal, 15_000);

    let response: Response;
    try {
      response = await fetch(
        `/api/assistant/conversations/${encodeURIComponent(conversationId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: linked.signal,
        }
      );
    } catch (err) {
      if (linked.wasTimedOut()) {
        throw new AssistantClientError(
          504,
          'REQUEST_TIMEOUT',
          'Deleting conversation timed out. Please try again.'
        );
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new AssistantClientError(
        0,
        'NETWORK_ERROR',
        'Network error while deleting conversation.'
      );
    } finally {
      linked.cleanup();
    }

    const payload = await parseJsonSafe(response);
    return { response, payload };
  };

  let { response, payload } = await runOnce(false);
  if (response.status === 401 && !signal?.aborted) {
    ({ response, payload } = await runOnce(true));
  }

  if (!response.ok) {
    throw new AssistantClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : 'Could not delete conversation.'
    );
  }
}

export async function sendAssistantMessage(
  params: {
    conversationId?: string | null;
    message: string;
    history?: { sender: 'user' | 'assistant'; text: string }[];
    lessonContext?: AssistantLessonContext;
    clientTurnId?: string;
    accessToken?: string | null;
  },
  signal?: AbortSignal
): Promise<SendAssistantMessageResult> {
  const runOnce = async (forceRefresh: boolean) => {
    const token = await getAccessTokenOrThrow(params.accessToken, forceRefresh);
    const linked = createLinkedTimeoutController(signal, REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: params.conversationId || undefined,
          message: params.message,
          history: params.history,
          lessonContext: params.lessonContext,
          clientTurnId: params.clientTurnId,
        }),
        signal: linked.signal,
      });
    } catch (err) {
      linked.cleanup();
      if (linked.wasTimedOut()) {
        throw new AssistantClientError(
          504,
          'REQUEST_TIMEOUT',
          'The AI Study Companion took too long to respond. Please retry.'
        );
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new AssistantClientError(
        0,
        'NETWORK_ERROR',
        'Connection interrupted while reaching your AI Study Companion. Please retry.'
      );
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJsonSafe(response);
    } finally {
      linked.cleanup();
    }

    return { response, payload };
  };

  let { response, payload } = await runOnce(false);
  if (response.status === 401 && !signal?.aborted) {
    ({ response, payload } = await runOnce(true));
  }

  if (!response.ok) {
    throw new AssistantClientError(
      response.status,
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : 'Unable to get a response right now. Please try again.'
    );
  }

  const conversation = payload.conversation as AssistantConversationSummary | undefined;
  const rawUserMsg = payload.userMessage as ServerAssistantMessage | undefined;
  const rawAssistantMsg = payload.assistantMessage as ServerAssistantMessage | undefined;

  if (!conversation?.id || !rawUserMsg?.id || !rawAssistantMsg?.id) {
    throw new AssistantClientError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'The AI Study Companion returned an unexpected payload.'
    );
  }

  return {
    conversation,
    userMessage: mapServerMessageToChatMessage(rawUserMsg),
    assistantMessage: mapServerMessageToChatMessage(rawAssistantMsg),
    storageMode:
      payload.storageMode === 'table' ||
      payload.storageMode === 'roadmap_fallback' ||
      payload.storageMode === 'ephemeral'
        ? payload.storageMode
        : 'table',
  };
}

export async function streamAssistantMessage(
  params: {
    conversationId?: string | null;
    message: string;
    history?: { sender: 'user' | 'assistant'; text: string }[];
    lessonContext?: AssistantLessonContext;
    clientTurnId?: string;
    accessToken?: string | null;
    onDelta?: (deltaText: string, accumulatedText: string) => void;
  },
  signal?: AbortSignal
): Promise<SendAssistantMessageResult> {
  const openStream = async (forceRefresh: boolean) => {
    const token = await getAccessTokenOrThrow(params.accessToken, forceRefresh);
    const linked = createLinkedTimeoutController(
      signal,
      REQUEST_TIMEOUT_MS,
      MAX_TOTAL_STREAM_TIMEOUT_MS
    );

    let response: Response;
    try {
      response = await fetch('/api/assistant/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: params.conversationId || undefined,
          message: params.message,
          history: params.history,
          lessonContext: params.lessonContext,
          clientTurnId: params.clientTurnId,
        }),
        signal: linked.signal,
      });
    } catch (err) {
      linked.cleanup();
      if (linked.wasTimedOut()) {
        throw new AssistantClientError(
          504,
          'REQUEST_TIMEOUT',
          'The AI Study Companion took too long to respond. Please retry.'
        );
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new AssistantClientError(
        0,
        'NETWORK_ERROR',
        'Connection interrupted while reaching your AI Study Companion. Please retry.'
      );
    }

    return { response, linked };
  };

  let { response, linked } = await openStream(false);
  if (response.status === 401 && !signal?.aborted) {
    linked.cleanup();
    try {
      await response.body?.cancel();
    } catch {
      // Ignore body cleanup errors
    }
    ({ response, linked } = await openStream(true));
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // Handle non-streaming JSON errors or non-SSE responses
  if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
    let payload: Record<string, unknown> = {};
    try {
      payload = await parseJsonSafe(response);
    } finally {
      linked.cleanup();
    }

    if (!response.ok) {
      throw new AssistantClientError(
        response.status,
        typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
        typeof payload.error === 'string' && payload.error
          ? payload.error
          : 'Unable to get a response right now. Please try again.'
      );
    }

    const conversation = payload.conversation as AssistantConversationSummary | undefined;
    const rawUserMsg = payload.userMessage as ServerAssistantMessage | undefined;
    const rawAssistantMsg = payload.assistantMessage as ServerAssistantMessage | undefined;
    if (conversation?.id && rawUserMsg?.id && rawAssistantMsg?.id) {
      return {
        conversation,
        userMessage: mapServerMessageToChatMessage(rawUserMsg),
        assistantMessage: mapServerMessageToChatMessage(rawAssistantMsg),
        storageMode:
          payload.storageMode === 'table' ||
          payload.storageMode === 'roadmap_fallback' ||
          payload.storageMode === 'ephemeral'
            ? payload.storageMode
            : 'table',
      };
    }
    throw new AssistantClientError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'The AI Study Companion returned an unexpected response.'
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let finalResult: SendAssistantMessageResult | null = null;

  const processEventBlock = (block: string) => {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'delta') {
      const text = typeof parsed.text === 'string' ? parsed.text : '';
      if (text) {
        accumulated += text;
        params.onDelta?.(text, accumulated);
      }
    } else if (eventName === 'error') {
      const status = typeof parsed.status === 'number' ? parsed.status : 502;
      const code = typeof parsed.code === 'string' ? parsed.code : 'STREAM_ERROR';
      const msg =
        typeof parsed.error === 'string' && parsed.error
          ? parsed.error
          : 'Could not reach your AI Study Companion right now. Please retry.';
      throw new AssistantClientError(status, code, msg);
    } else if (eventName === 'done') {
      const conversation = parsed.conversation as AssistantConversationSummary | undefined;
      const rawUserMsg = parsed.userMessage as ServerAssistantMessage | undefined;
      const rawAssistantMsg = parsed.assistantMessage as ServerAssistantMessage | undefined;
      if (conversation?.id && rawUserMsg?.id && rawAssistantMsg?.id) {
        finalResult = {
          conversation,
          userMessage: mapServerMessageToChatMessage(rawUserMsg),
          assistantMessage: mapServerMessageToChatMessage(rawAssistantMsg),
          storageMode:
            parsed.storageMode === 'table' ||
            parsed.storageMode === 'roadmap_fallback' ||
            parsed.storageMode === 'ephemeral'
              ? parsed.storageMode
              : 'table',
        };
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      linked.resetTimer();
      buffer += decoder.decode(value, { stream: true });

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        if (block.trim()) {
          processEventBlock(block);
        }
        sepIdx = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer);
    }
  } catch (err) {
    if (err instanceof AssistantClientError) throw err;
    if (linked.wasTimedOut()) {
      throw new AssistantClientError(
        504,
        'REQUEST_TIMEOUT',
        'The AI Study Companion response timed out. Please retry.'
      );
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new AssistantClientError(
      0,
      'STREAM_INTERRUPTED',
      'The response stream was interrupted. Please retry.'
    );
  } finally {
    linked.cleanup();
    try {
      await reader.cancel();
    } catch {
      // Ignore already-closed reader
    }
  }

  if (!finalResult) {
    throw new AssistantClientError(
      502,
      'INCOMPLETE_STREAM',
      'The AI Study Companion did not finish sending its response. Please retry.'
    );
  }

  return finalResult;
}
