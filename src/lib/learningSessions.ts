import { SupabaseClient } from '@supabase/supabase-js';
import type {
  LearningSessionActivityType,
  LearningSessionRecord,
} from '../types';

export class LearningSessionDbError extends Error {
  code: string;
  userMessage: string;

  constructor(code: string, message: string, userMessage?: string) {
    super(message);
    this.name = 'LearningSessionDbError';
    this.code = code;
    this.userMessage =
      userMessage ?? (message || 'Could not sync study activity with Supabase.');
  }
}

export interface UpsertLearningSessionInput {
  clientSessionId: string;
  roadmapId?: string | null;
  stageId?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  activityType: LearningSessionActivityType;
  durationSeconds: number;
  startedAt?: string;
  endedAt?: string;
  completed?: boolean;
}

export interface LoadedLearningSessionsResult {
  sessions: LearningSessionRecord[];
  storageMode: 'learning_sessions' | 'roadmap_jsonb_fallback';
  schemaMigrationRequired: boolean;
}

const VALID_ACTIVITY_TYPES: ReadonlySet<LearningSessionActivityType> = new Set([
  'lesson_study',
  'knowledge_check',
  'assessment',
]);

function isMissingSessionsTableError(err: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code ?? '').toUpperCase();
  const message = (err.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('learning_sessions') &&
      (message.includes('does not exist') ||
        message.includes('could not find the table') ||
        message.includes('schema cache'))
  );
}

function parseActivityType(value: unknown): LearningSessionActivityType {
  if (
    typeof value === 'string' &&
    VALID_ACTIVITY_TYPES.has(value as LearningSessionActivityType)
  ) {
    return value as LearningSessionActivityType;
  }
  return 'lesson_study';
}

function clampDurationSeconds(value: unknown): number {
  const num =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(43200, Math.round(num));
}

function mapDbRowToLearningSession(
  row: Record<string, unknown>
): LearningSessionRecord {
  const startedAt =
    typeof row.started_at === 'string' && row.started_at
      ? row.started_at
      : typeof row.startedAt === 'string' && row.startedAt
      ? row.startedAt
      : new Date().toISOString();
  const endedAt =
    typeof row.ended_at === 'string' && row.ended_at
      ? row.ended_at
      : typeof row.endedAt === 'string' && row.endedAt
      ? row.endedAt
      : startedAt;

  return {
    id:
      typeof row.id === 'string' && row.id
        ? row.id
        : String(row.client_session_id ?? row.clientSessionId ?? `${startedAt}`),
    userId: typeof row.user_id === 'string' ? row.user_id : String(row.userId ?? ''),
    clientSessionId:
      typeof row.client_session_id === 'string' && row.client_session_id
        ? row.client_session_id
        : typeof row.clientSessionId === 'string'
        ? row.clientSessionId
        : String(row.id ?? `${startedAt}`),
    roadmapId:
      typeof row.roadmap_id === 'string'
        ? row.roadmap_id
        : typeof row.roadmapId === 'string'
        ? row.roadmapId
        : null,
    stageId:
      typeof row.stage_id === 'string'
        ? row.stage_id
        : typeof row.stageId === 'string'
        ? row.stageId
        : null,
    lessonId:
      typeof row.lesson_id === 'string'
        ? row.lesson_id
        : typeof row.lessonId === 'string'
        ? row.lessonId
        : null,
    lessonTitle:
      typeof row.lesson_title === 'string'
        ? row.lesson_title
        : typeof row.lessonTitle === 'string'
        ? row.lessonTitle
        : null,
    activityType: parseActivityType(row.activity_type ?? row.activityType),
    durationSeconds: clampDurationSeconds(
      row.duration_seconds ?? row.durationSeconds
    ),
    startedAt,
    endedAt,
    completed: row.completed !== false,
  };
}

function dedupeAndSortSessions(
  sessions: LearningSessionRecord[]
): LearningSessionRecord[] {
  const byClientId = new Map<string, LearningSessionRecord>();
  for (const session of sessions) {
    const key = session.clientSessionId || session.id;
    const existing = byClientId.get(key);
    if (!existing) {
      byClientId.set(key, session);
      continue;
    }
    const existingMs = new Date(existing.endedAt || existing.startedAt).getTime();
    const candidateMs = new Date(session.endedAt || session.startedAt).getTime();
    if (
      session.durationSeconds > existing.durationSeconds ||
      candidateMs > existingMs
    ) {
      byClientId.set(key, session);
    }
  }
  return Array.from(byClientId.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

async function loadFallbackSessionsFromRoadmaps(
  supabase: SupabaseClient,
  userId: string
): Promise<LearningSessionRecord[]> {
  const { data, error } = await supabase
    .from('learning_roadmaps')
    .select('id, user_id, roadmap_data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !Array.isArray(data)) {
    return [];
  }

  const collected: LearningSessionRecord[] = [];
  for (const row of data) {
    const record = row as Record<string, unknown>;
    const rawData =
      record.roadmap_data && typeof record.roadmap_data === 'object'
        ? (record.roadmap_data as Record<string, unknown>)
        : null;
    if (!rawData || !Array.isArray(rawData.learningSessions)) continue;
    for (const item of rawData.learningSessions) {
      if (!item || typeof item !== 'object') continue;
      collected.push(
        mapDbRowToLearningSession({
          ...(item as Record<string, unknown>),
          userId,
          roadmapId:
            (item as Record<string, unknown>).roadmapId ??
            (typeof record.id === 'string' ? record.id : null),
        })
      );
    }
  }
  return dedupeAndSortSessions(collected);
}

// Serialize fallback roadmap writes per user so periodic timer flushes never race.
const fallbackSessionWriteQueue = new Map<string, Promise<unknown>>();

function enqueueFallbackSessionWrite<T>(
  userId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = fallbackSessionWriteQueue.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  fallbackSessionWriteQueue.set(userId, settled);
  void settled.then(() => {
    if (fallbackSessionWriteQueue.get(userId) === settled) {
      fallbackSessionWriteQueue.delete(userId);
    }
  });
  return next;
}

async function saveFallbackSessionToRoadmap(
  supabase: SupabaseClient,
  userId: string,
  record: LearningSessionRecord
): Promise<LearningSessionRecord> {
  return enqueueFallbackSessionWrite(userId, async () => {
    let targetRoadmapQuery = supabase
      .from('learning_roadmaps')
      .select('id, roadmap_data')
      .eq('user_id', userId);

    if (record.roadmapId) {
      targetRoadmapQuery = targetRoadmapQuery.eq('id', record.roadmapId);
    } else {
      targetRoadmapQuery = targetRoadmapQuery
        .order('status', { ascending: true })
        .order('updated_at', { ascending: false })
        .limit(1);
    }

    const { data: rows, error: fetchError } = await targetRoadmapQuery;
    if (fetchError) {
      throw new LearningSessionDbError(
        fetchError.code || 'FALLBACK_LOAD_ERROR',
        fetchError.message || 'Could not locate roadmap for study session fallback.'
      );
    }

    const targetRow = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    if (!targetRow || typeof targetRow.id !== 'string') {
      // No roadmap exists yet to hold JSONB fallback; return record safely without crashing UI
      return record;
    }

    const rawData =
      targetRow.roadmap_data && typeof targetRow.roadmap_data === 'object'
        ? { ...(targetRow.roadmap_data as Record<string, unknown>) }
        : {};

    const existingList = Array.isArray(rawData.learningSessions)
      ? rawData.learningSessions
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item) => mapDbRowToLearningSession({ ...item, userId }))
      : [];

    const merged = dedupeAndSortSessions([
      { ...record, roadmapId: record.roadmapId ?? targetRow.id },
      ...existingList.filter((item) => item.clientSessionId !== record.clientSessionId),
    ]).slice(0, 250);

    rawData.learningSessions = merged;

    const { error: updateError } = await supabase
      .from('learning_roadmaps')
      .update({
        roadmap_data: rawData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetRow.id)
      .eq('user_id', userId);

    if (updateError) {
      throw new LearningSessionDbError(
        updateError.code || 'FALLBACK_SAVE_ERROR',
        updateError.message || 'Failed to persist study session.'
      );
    }

    return { ...record, roadmapId: record.roadmapId ?? targetRow.id };
  });
}

export async function loadLearningSessions(
  supabase: SupabaseClient
): Promise<LoadedLearningSessionsResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new LearningSessionDbError(
      'SESSION_ERROR',
      sessionError.message || 'Could not verify session.'
    );
  }
  if (!sessionData.session) {
    return {
      sessions: [],
      storageMode: 'learning_sessions',
      schemaMigrationRequired: false,
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw new LearningSessionDbError(
      'NO_AUTH_USER',
      userError?.message || 'Authenticated user UUID not available.'
    );
  }
  const userId = userData.user.id;

  const { data, error } = await supabase
    .from('learning_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingSessionsTableError(error)) {
      const fallback = await loadFallbackSessionsFromRoadmaps(supabase, userId);
      return {
        sessions: fallback,
        storageMode: 'roadmap_jsonb_fallback',
        schemaMigrationRequired: true,
      };
    }
    throw new LearningSessionDbError(
      error.code || 'DB_ERROR',
      error.message || 'Could not load learning sessions.'
    );
  }

  const primary = (data ?? []).map((row) =>
    mapDbRowToLearningSession(row as Record<string, unknown>)
  );
  const fallback = await loadFallbackSessionsFromRoadmaps(supabase, userId);

  return {
    sessions: dedupeAndSortSessions([...primary, ...fallback]),
    storageMode: 'learning_sessions',
    schemaMigrationRequired: false,
  };
}

export async function upsertLearningSession(
  supabase: SupabaseClient,
  input: UpsertLearningSessionInput
): Promise<{
  session: LearningSessionRecord;
  storageMode: 'learning_sessions' | 'roadmap_jsonb_fallback';
}> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new LearningSessionDbError(
      'NO_ACTIVE_SESSION',
      'Sign in with an active session to save study activity.'
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw new LearningSessionDbError(
      'NO_AUTH_USER',
      userError?.message || 'Authenticated user UUID not available.'
    );
  }
  const userId = userData.user.id;

  const nowIso = new Date().toISOString();
  const endedAt = input.endedAt || nowIso;
  const startedAt = input.startedAt || endedAt;
  const durationSeconds = clampDurationSeconds(input.durationSeconds);

  const dbPayload = {
    user_id: userId,
    client_session_id: input.clientSessionId,
    roadmap_id: input.roadmapId ?? null,
    stage_id: input.stageId ?? null,
    lesson_id: input.lessonId ?? null,
    lesson_title: input.lessonTitle ?? null,
    activity_type: input.activityType,
    duration_seconds: durationSeconds,
    started_at: startedAt,
    ended_at: endedAt,
    completed: input.completed !== false,
  };

  const { data: upsertedRow, error } = await supabase
    .from('learning_sessions')
    .upsert(dbPayload, { onConflict: 'user_id,client_session_id' })
    .select('*')
    .single();

  if (error) {
    if (isMissingSessionsTableError(error)) {
      const localRecord: LearningSessionRecord = {
        id: input.clientSessionId,
        userId,
        clientSessionId: input.clientSessionId,
        roadmapId: input.roadmapId ?? null,
        stageId: input.stageId ?? null,
        lessonId: input.lessonId ?? null,
        lessonTitle: input.lessonTitle ?? null,
        activityType: input.activityType,
        durationSeconds,
        startedAt,
        endedAt,
        completed: input.completed !== false,
      };
      const savedFallback = await saveFallbackSessionToRoadmap(
        supabase,
        userId,
        localRecord
      );
      return {
        session: savedFallback,
        storageMode: 'roadmap_jsonb_fallback',
      };
    }
    throw new LearningSessionDbError(
      error.code || 'DB_ERROR',
      error.message || 'Could not save study session.'
    );
  }

  return {
    session: mapDbRowToLearningSession(upsertedRow as Record<string, unknown>),
    storageMode: 'learning_sessions',
  };
}
