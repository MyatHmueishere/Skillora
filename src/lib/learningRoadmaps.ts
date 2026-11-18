import { SupabaseClient } from '@supabase/supabase-js';
import {
  GeneratedRoadmapLesson,
  GeneratedRoadmapStage,
  LearningRoadmapRecord,
  LearningSessionRecord,
  PersonalizedRoadmapData,
} from '../types';
import { getSupabaseClient } from './supabase';

export class RoadmapDbError extends Error {
  code: string;
  details?: string | null;
  hint?: string | null;
  userMessage: string;

  constructor(params: {
    userMessage: string;
    code: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  }) {
    super(params.message);
    this.name = 'RoadmapDbError';
    this.userMessage = params.userMessage;
    this.code = params.code;
    this.details = params.details;
    this.hint = params.hint;
  }

  toDiagnosticText(): string {
    const parts = [`Code: ${this.code || 'UNKNOWN'}`, `Message: ${this.message}`];
    if (this.details) parts.push(`Details: ${this.details}`);
    if (this.hint) parts.push(`Hint: ${this.hint}`);
    return parts.join(' | ');
  }
}

export class RoadmapGenerationError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RoadmapGenerationError';
    this.status = status;
    this.code = code;
  }
}

function buildFriendlyRoadmapDbMessage(code: string, rawMessage: string): string {
  if (code === '42501') {
    return 'Permission denied by database security policy (RLS). Please verify you are signed in with your account.';
  }
  if (code === '23502') {
    return 'A required roadmap field was missing. Please try again.';
  }
  if (code === '42P01') {
    return 'The learning_roadmaps table could not be found in Supabase.';
  }
  return rawMessage || 'Failed to communicate with the learning roadmaps database.';
}

function toRoadmapDbError(err: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}): RoadmapDbError {
  const code = err.code || 'DB_ERROR';
  const message = err.message || 'Unknown Supabase roadmap database error.';
  return new RoadmapDbError({
    userMessage: buildFriendlyRoadmapDbMessage(code, message),
    code,
    message,
    details: err.details,
    hint: err.hint,
  });
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseDifficulty(value: unknown): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
    return value;
  }
  return 'Intermediate';
}

export function deriveStageStatus(
  lessons: GeneratedRoadmapLesson[]
): 'upcoming' | 'in_progress' | 'completed' {
  if (lessons.length === 0) return 'upcoming';
  const completedCount = lessons.filter((l) => l.completed).length;
  if (completedCount === lessons.length) return 'completed';
  if (completedCount > 0) return 'in_progress';
  return 'upcoming';
}

export function mapDbRowToLearningRoadmap(
  row: Record<string, unknown>
): LearningRoadmapRecord {
  const rawData =
    row.roadmap_data && typeof row.roadmap_data === 'object'
      ? (row.roadmap_data as Record<string, unknown>)
      : {};

  const rawStages = Array.isArray(rawData.stages) ? rawData.stages : [];
  const stages: GeneratedRoadmapStage[] = rawStages.map((sRaw, sIdx) => {
    const s = (sRaw && typeof sRaw === 'object' ? sRaw : {}) as Record<string, unknown>;
    const stageId = typeof s.id === 'string' && s.id.trim() ? s.id : `stage-${sIdx + 1}`;
    const rawLessons = Array.isArray(s.lessons) ? s.lessons : [];
    const seenLessonIds = new Set<string>();
    const lessons: GeneratedRoadmapLesson[] = [];

    rawLessons.forEach((lRaw, lIdx) => {
      const l = (lRaw && typeof lRaw === 'object' ? lRaw : {}) as Record<string, unknown>;
      const lessonId =
        typeof l.id === 'string' && l.id.trim()
          ? l.id
          : `${stageId}-lesson-${lIdx + 1}`;

      if (seenLessonIds.has(lessonId)) {
        return;
      }
      seenLessonIds.add(lessonId);

      const isCompleted = l.completed === true;
      const rawCompletedAt =
        typeof l.completedAt === 'string' && l.completedAt.trim()
          ? l.completedAt
          : typeof l.completed_at === 'string' && l.completed_at.trim()
          ? l.completed_at
          : null;

      lessons.push({
        id: lessonId,
        title: typeof l.title === 'string' ? l.title : `Lesson ${lIdx + 1}`,
        description: typeof l.description === 'string' ? l.description : '',
        estimatedTime:
          typeof l.estimatedTime === 'string' ? l.estimatedTime : '45 mins',
        learningObjectives: parseStringArray(l.learningObjectives),
        completionCriteria:
          typeof l.completionCriteria === 'string' && l.completionCriteria.trim()
            ? l.completionCriteria.trim()
            : undefined,
        completed: isCompleted,
        completedAt: isCompleted ? rawCompletedAt : null,
      });
    });

    return {
      id: stageId,
      title: typeof s.title === 'string' ? s.title : `Stage ${sIdx + 1}`,
      description: typeof s.description === 'string' ? s.description : '',
      learningObjectives: parseStringArray(s.learningObjectives),
      estimatedDuration:
        typeof s.estimatedDuration === 'string' ? s.estimatedDuration : '2 weeks',
      difficulty: parseDifficulty(s.difficulty),
      prerequisites: parseStringArray(s.prerequisites),
      lessons,
      practiceActivities: parseStringArray(s.practiceActivities),
      suggestedMiniProject:
        typeof s.suggestedMiniProject === 'string' ? s.suggestedMiniProject : '',
      milestone:
        typeof s.milestone === 'string' && s.milestone.trim()
          ? s.milestone.trim()
          : undefined,
      completionCriteria:
        typeof s.completionCriteria === 'string' && s.completionCriteria.trim()
          ? s.completionCriteria.trim()
          : undefined,
      status: deriveStageStatus(lessons),
    };
  });

  const title =
    typeof row.title === 'string' && row.title.trim()
      ? row.title
      : typeof rawData.title === 'string'
      ? rawData.title
      : 'Personalized Learning Roadmap';

  const careerGoal =
    typeof row.career_goal === 'string' && row.career_goal.trim()
      ? row.career_goal
      : typeof rawData.careerGoal === 'string'
      ? rawData.careerGoal
      : '';

  const description =
    typeof row.description === 'string' && row.description.trim()
      ? row.description
      : typeof rawData.description === 'string'
      ? rawData.description
      : '';

  const roadmapData: PersonalizedRoadmapData = {
    title,
    careerGoal,
    ...(typeof rawData.primaryDirection === 'string' && rawData.primaryDirection.trim()
      ? { primaryDirection: rawData.primaryDirection.trim() }
      : {}),
    description,
    estimatedTotalDuration:
      typeof rawData.estimatedTotalDuration === 'string'
        ? rawData.estimatedTotalDuration
        : '8–12 weeks',
    personalizationExplanation:
      typeof rawData.personalizationExplanation === 'string'
        ? rawData.personalizationExplanation
        : '',
    assessmentValidated: rawData.assessmentValidated === true,
    confirmed: rawData.confirmed !== false,
    milestones: parseStringArray(rawData.milestones),
    completionCriteria: parseStringArray(rawData.completionCriteria),
    stages,
  };

  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    userId: typeof row.user_id === 'string' ? row.user_id : String(row.user_id ?? ''),
    title,
    careerGoal,
    description,
    sourceAssessmentId:
      typeof row.source_assessment_id === 'string' ? row.source_assessment_id : null,
    roadmapData,
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt:
      typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
}

export interface LoadedRoadmapsResult {
  activeRoadmap: LearningRoadmapRecord | null;
  archivedRoadmaps: LearningRoadmapRecord[];
}

export async function loadLearningRoadmaps(
  supabase: SupabaseClient
): Promise<LoadedRoadmapsResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw toRoadmapDbError(sessionError);
  }
  if (!sessionData.session) {
    return { activeRoadmap: null, archivedRoadmaps: [] };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toRoadmapDbError(
      userError ?? {
        code: 'NO_AUTH_USER',
        message: 'Authenticated user UUID not available.',
      }
    );
  }

  const { data, error } = await supabase
    .from('learning_roadmaps')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw toRoadmapDbError(error);
  }

  const mapped = (data ?? []).map((row) =>
    mapDbRowToLearningRoadmap(row as Record<string, unknown>)
  );

  const activeRoadmap = mapped.find((r) => r.status === 'active') ?? null;
  const archivedRoadmaps = mapped.filter(
    (r) => r.status === 'archived' || (activeRoadmap && r.id !== activeRoadmap.id)
  );

  return { activeRoadmap, archivedRoadmaps };
}

export async function activateExistingRoadmap(
  supabase: SupabaseClient,
  roadmapId: string
): Promise<LoadedRoadmapsResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw toRoadmapDbError(sessionError);
  if (!sessionData.session) {
    throw new RoadmapDbError({
      userMessage: 'Please sign in with an active session to switch roadmaps.',
      code: 'NO_ACTIVE_SESSION',
      message: 'supabase.auth.getSession() returned null.',
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toRoadmapDbError(
      userError ?? {
        code: 'NO_AUTH_USER',
        message: 'Authenticated user UUID not available.',
      }
    );
  }

  const userId = userData.user.id;
  const nowIso = new Date().toISOString();

  // Archive other active roadmaps first ONLY after confirming target roadmap exists for user
  const { data: targetRow, error: targetError } = await supabase
    .from('learning_roadmaps')
    .select('id')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .single();

  if (targetError || !targetRow) {
    throw toRoadmapDbError(
      targetError ?? {
        code: 'ROADMAP_NOT_FOUND',
        message: 'Preserved learning roadmap not found.',
      }
    );
  }

  const { error: archiveErr } = await supabase
    .from('learning_roadmaps')
    .update({ status: 'archived', updated_at: nowIso })
    .eq('user_id', userId)
    .eq('status', 'active')
    .neq('id', roadmapId);

  if (archiveErr) {
    throw toRoadmapDbError(archiveErr);
  }

  const { error: activateErr } = await supabase
    .from('learning_roadmaps')
    .update({ status: 'active', updated_at: nowIso })
    .eq('id', roadmapId)
    .eq('user_id', userId);

  if (activateErr) {
    throw toRoadmapDbError(activateErr);
  }

  return loadLearningRoadmaps(supabase);
}

export async function archiveActiveRoadmaps(
  supabase: SupabaseClient
): Promise<LoadedRoadmapsResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw toRoadmapDbError(sessionError);
  if (!sessionData.session) {
    throw new RoadmapDbError({
      userMessage: 'Please sign in with an active session to update your roadmaps.',
      code: 'NO_ACTIVE_SESSION',
      message: 'supabase.auth.getSession() returned null.',
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toRoadmapDbError(
      userError ?? {
        code: 'NO_AUTH_USER',
        message: 'Authenticated user UUID not available.',
      }
    );
  }

  const { error: archiveErr } = await supabase
    .from('learning_roadmaps')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('user_id', userData.user.id)
    .eq('status', 'active');

  if (archiveErr) {
    throw toRoadmapDbError(archiveErr);
  }

  return loadLearningRoadmaps(supabase);
}

export async function generatePersonalizedRoadmap(options?: {
  replaceActive?: boolean;
}): Promise<LearningRoadmapRecord> {
  const supabase = await getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new RoadmapGenerationError(
      401,
      'SESSION_ERROR',
      'Could not verify your authentication session. Please sign in again.'
    );
  }

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new RoadmapGenerationError(
      401,
      'NO_ACTIVE_SESSION',
      'Please sign in with an active Skillora account to generate a personalized roadmap.'
    );
  }

  let response: Response;
  try {
    response = await fetch('/api/roadmaps/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replaceActive: options?.replaceActive === true,
      }),
    });
  } catch {
    throw new RoadmapGenerationError(
      0,
      'NETWORK_ERROR',
      'Network connection interrupted while generating your roadmap. Please check your connection and try again.'
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
        : 'Unable to generate your personalized roadmap right now. Please try again.';
    throw new RoadmapGenerationError(response.status, code, message);
  }

  if (!payload.roadmap || typeof payload.roadmap !== 'object') {
    throw new RoadmapGenerationError(
      502,
      'INVALID_SERVER_PAYLOAD',
      'The server returned an unexpected response while saving your roadmap.'
    );
  }

  return mapDbRowToLearningRoadmap(payload.roadmap as Record<string, unknown>);
}

// Serialize concurrent lesson completion writes per roadmap so back-to-back saves
// merge against the latest Supabase row and never clobber one another.
const progressWriteQueueByRoadmap = new Map<string, Promise<unknown>>();

function enqueueRoadmapWrite<T>(roadmapId: string, task: () => Promise<T>): Promise<T> {
  const previous = progressWriteQueueByRoadmap.get(roadmapId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  progressWriteQueueByRoadmap.set(roadmapId, settled);
  void settled.then(() => {
    if (progressWriteQueueByRoadmap.get(roadmapId) === settled) {
      progressWriteQueueByRoadmap.delete(roadmapId);
    }
  });
  return next;
}

export function applyLessonCompletionToRoadmapData(
  roadmapData: PersonalizedRoadmapData,
  stageId: string,
  lessonId: string,
  options: { completed: boolean; completedAt?: string }
): PersonalizedRoadmapData {
  const timestamp = options.completedAt ?? new Date().toISOString();

  const updatedStages = roadmapData.stages.map((stage) => {
    if (stage.id !== stageId) return stage;

    const updatedLessons = stage.lessons.map((lesson) => {
      if (lesson.id !== lessonId) return lesson;

      if (options.completed) {
        // Idempotent: if already completed with a valid timestamp, keep existing record
        if (lesson.completed && lesson.completedAt) {
          return lesson;
        }
        return {
          ...lesson,
          completed: true,
          completedAt: lesson.completedAt || timestamp,
        };
      }

      return {
        ...lesson,
        completed: false,
        completedAt: null,
      };
    });

    return {
      ...stage,
      lessons: updatedLessons,
      status: deriveStageStatus(updatedLessons),
    };
  });

  return {
    ...roadmapData,
    stages: updatedStages,
  };
}

export async function saveRoadmapProgress(
  supabase: SupabaseClient,
  roadmapId: string,
  updatedRoadmapData: PersonalizedRoadmapData
): Promise<LearningRoadmapRecord> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw toRoadmapDbError(sessionError);
  }
  if (!sessionData.session) {
    throw new RoadmapDbError({
      userMessage: 'Please sign in with an active session to save roadmap progress.',
      code: 'NO_ACTIVE_SESSION',
      message: 'supabase.auth.getSession() returned null.',
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toRoadmapDbError(
      userError ?? {
        code: 'NO_AUTH_USER',
        message: 'Authenticated user UUID not available.',
      }
    );
  }

  const normalizedStages = updatedRoadmapData.stages.map((stage) => {
    const seenIds = new Set<string>();
    const dedupedLessons = stage.lessons.filter((lesson) => {
      if (seenIds.has(lesson.id)) return false;
      seenIds.add(lesson.id);
      return true;
    });
    return {
      ...stage,
      lessons: dedupedLessons,
      status: deriveStageStatus(dedupedLessons),
    };
  });

  // Preserve any fallback knowledgeCheckAttempts, learningSessions, assistantConversations, and generatedLessons stored inside roadmap_data
  // so toggling lesson completion never erases Knowledge Check, session, AI companion, or cached lesson content.
  const incomingRaw = updatedRoadmapData as unknown as Record<string, unknown>;
  let preservedKnowledgeCheckAttempts: unknown[] | undefined =
    Array.isArray(incomingRaw.knowledgeCheckAttempts) &&
    incomingRaw.knowledgeCheckAttempts.length > 0
      ? incomingRaw.knowledgeCheckAttempts
      : undefined;
  let preservedLearningSessions: unknown[] | undefined =
    Array.isArray(incomingRaw.learningSessions) &&
    incomingRaw.learningSessions.length > 0
      ? incomingRaw.learningSessions
      : undefined;
  let preservedAssistantConversations: unknown[] | undefined =
    Array.isArray(incomingRaw.assistantConversations) &&
    incomingRaw.assistantConversations.length > 0
      ? incomingRaw.assistantConversations
      : undefined;
  let preservedGeneratedLessons: Record<string, unknown> | undefined =
    incomingRaw.generatedLessons &&
    typeof incomingRaw.generatedLessons === 'object' &&
    !Array.isArray(incomingRaw.generatedLessons)
      ? (incomingRaw.generatedLessons as Record<string, unknown>)
      : undefined;

  if (
    !preservedKnowledgeCheckAttempts ||
    !preservedLearningSessions ||
    !preservedAssistantConversations ||
    !preservedGeneratedLessons
  ) {
    const { data: currentRow } = await supabase
      .from('learning_roadmaps')
      .select('roadmap_data')
      .eq('id', roadmapId)
      .eq('user_id', userData.user.id)
      .maybeSingle();
    const existingRawData =
      currentRow &&
      typeof currentRow === 'object' &&
      (currentRow as Record<string, unknown>).roadmap_data &&
      typeof (currentRow as Record<string, unknown>).roadmap_data === 'object'
        ? ((currentRow as Record<string, unknown>).roadmap_data as Record<string, unknown>)
        : null;
    if (
      !preservedKnowledgeCheckAttempts &&
      existingRawData &&
      Array.isArray(existingRawData.knowledgeCheckAttempts)
    ) {
      preservedKnowledgeCheckAttempts = existingRawData.knowledgeCheckAttempts;
    }
    if (
      !preservedLearningSessions &&
      existingRawData &&
      Array.isArray(existingRawData.learningSessions)
    ) {
      preservedLearningSessions = existingRawData.learningSessions;
    }
    if (
      !preservedAssistantConversations &&
      existingRawData &&
      Array.isArray(existingRawData.assistantConversations)
    ) {
      preservedAssistantConversations = existingRawData.assistantConversations;
    }
    if (
      !preservedGeneratedLessons &&
      existingRawData &&
      existingRawData.generatedLessons &&
      typeof existingRawData.generatedLessons === 'object' &&
      !Array.isArray(existingRawData.generatedLessons)
    ) {
      preservedGeneratedLessons = existingRawData.generatedLessons as Record<string, unknown>;
    }
  }

  const normalizedPayload: PersonalizedRoadmapData & {
    knowledgeCheckAttempts?: unknown[];
    learningSessions?: unknown[];
    assistantConversations?: unknown[];
    generatedLessons?: Record<string, unknown>;
  } = {
    ...updatedRoadmapData,
    stages: normalizedStages,
    ...(preservedKnowledgeCheckAttempts
      ? { knowledgeCheckAttempts: preservedKnowledgeCheckAttempts }
      : {}),
    ...(preservedLearningSessions
      ? { learningSessions: preservedLearningSessions }
      : {}),
    ...(preservedAssistantConversations
      ? { assistantConversations: preservedAssistantConversations }
      : {}),
    ...(preservedGeneratedLessons
      ? { generatedLessons: preservedGeneratedLessons }
      : {}),
  };

  const { data: updatedRow, error: updateError } = await supabase
    .from('learning_roadmaps')
    .update({
      roadmap_data: normalizedPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roadmapId)
    .eq('user_id', userData.user.id)
    .select('*')
    .single();

  if (updateError || !updatedRow) {
    throw toRoadmapDbError(
      updateError ?? {
        code: 'UPDATE_EMPTY',
        message: 'Roadmap progress update returned no confirmation row.',
      }
    );
  }

  return mapDbRowToLearningRoadmap(updatedRow as Record<string, unknown>);
}

export async function confirmRoadmapPlan(
  supabase: SupabaseClient,
  roadmapId: string
): Promise<LearningRoadmapRecord> {
  return enqueueRoadmapWrite(roadmapId, async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw toRoadmapDbError(sessionError);
    if (!sessionData.session) {
      throw new RoadmapDbError({
        userMessage: 'Please sign in with an active session to confirm your roadmap.',
        code: 'NO_ACTIVE_SESSION',
        message: 'supabase.auth.getSession() returned null.',
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) {
      throw toRoadmapDbError(
        userError ?? {
          code: 'NO_AUTH_USER',
          message: 'Authenticated user UUID not available.',
        }
      );
    }

    const { data: existingRow, error: fetchError } = await supabase
      .from('learning_roadmaps')
      .select('*')
      .eq('id', roadmapId)
      .eq('user_id', userData.user.id)
      .single();

    if (fetchError || !existingRow) {
      throw toRoadmapDbError(
        fetchError ?? {
          code: 'ROADMAP_NOT_FOUND',
          message: 'Could not locate this learning roadmap.',
        }
      );
    }

    const canonical = mapDbRowToLearningRoadmap(existingRow as Record<string, unknown>);
    if (canonical.roadmapData.confirmed) {
      return canonical;
    }

    return saveRoadmapProgress(supabase, roadmapId, {
      ...canonical.roadmapData,
      confirmed: true,
    });
  });
}

export async function updateRoadmapLessonCompletion(
  supabase: SupabaseClient,
  roadmapId: string,
  stageId: string,
  lessonId: string,
  options: { completed: boolean }
): Promise<LearningRoadmapRecord> {
  return enqueueRoadmapWrite(roadmapId, async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw toRoadmapDbError(sessionError);
    }
    if (!sessionData.session) {
      throw new RoadmapDbError({
        userMessage: 'Please sign in with an active session to save lesson progress.',
        code: 'NO_ACTIVE_SESSION',
        message: 'supabase.auth.getSession() returned null.',
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) {
      throw toRoadmapDbError(
        userError ?? {
          code: 'NO_AUTH_USER',
          message: 'Authenticated user UUID not available.',
        }
      );
    }

    // Fetch canonical roadmap row scoped strictly to auth.uid() via RLS + user_id check
    const { data: existingRow, error: fetchError } = await supabase
      .from('learning_roadmaps')
      .select('*')
      .eq('id', roadmapId)
      .eq('user_id', userData.user.id)
      .single();

    if (fetchError || !existingRow) {
      throw toRoadmapDbError(
        fetchError ?? {
          code: 'ROADMAP_NOT_FOUND',
          message: 'Could not locate this learning roadmap for the signed-in student.',
        }
      );
    }

    const canonical = mapDbRowToLearningRoadmap(existingRow as Record<string, unknown>);
    const targetStage = canonical.roadmapData.stages.find((s) => s.id === stageId);
    const targetLesson = targetStage?.lessons.find((l) => l.id === lessonId);

    if (!targetStage || !targetLesson) {
      throw new RoadmapDbError({
        userMessage: 'This lesson could not be found in your saved learning roadmap.',
        code: 'LESSON_NOT_FOUND',
        message: `Lesson ${lessonId} in stage ${stageId} not found in roadmap ${roadmapId}.`,
      });
    }

    // Prevent duplicate completion writes when lesson is already completed with timestamp
    if (options.completed && targetLesson.completed && targetLesson.completedAt) {
      return canonical;
    }
    if (!options.completed && !targetLesson.completed) {
      return canonical;
    }

    const mergedRoadmapData = applyLessonCompletionToRoadmapData(
      canonical.roadmapData,
      stageId,
      lessonId,
      {
        completed: options.completed,
        completedAt: new Date().toISOString(),
      }
    );

    return saveRoadmapProgress(supabase, roadmapId, mergedRoadmapData);
  });
}

export interface RoadmapStageStat {
  stageId: string;
  stageIndex: number;
  title: string;
  totalLessons: number;
  completedLessons: number;
  remainingLessons: number;
  progressPercent: number;
  status: 'upcoming' | 'in_progress' | 'completed';
}

export interface ComputedRoadmapStats {
  totalLessons: number;
  completedLessons: number;
  remainingLessons: number;
  progressPercent: number;
  totalStages: number;
  completedStages: number;
  currentStageNumber: number;
  currentStageId: string | null;
  currentStageTitle: string;
  nextIncompleteStageId: string | null;
  nextIncompleteLessonId: string | null;
  nextIncompleteLessonTitle: string | null;
  stageStats: RoadmapStageStat[];
}

export function computeRoadmapStats(
  roadmap: LearningRoadmapRecord | null
): ComputedRoadmapStats {
  if (!roadmap) {
    return {
      totalLessons: 0,
      completedLessons: 0,
      remainingLessons: 0,
      progressPercent: 0,
      totalStages: 0,
      completedStages: 0,
      currentStageNumber: 0,
      currentStageId: null,
      currentStageTitle: '',
      nextIncompleteStageId: null,
      nextIncompleteLessonId: null,
      nextIncompleteLessonTitle: null,
      stageStats: [],
    };
  }

  const stages = roadmap.roadmapData.stages;
  const totalStages = stages.length;

  const stageStats: RoadmapStageStat[] = stages.map((stage, stageIndex) => {
    const total = stage.lessons.length;
    const completed = stage.lessons.filter((l) => l.completed).length;
    const remaining = Math.max(0, total - completed);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      stageId: stage.id,
      stageIndex,
      title: stage.title,
      totalLessons: total,
      completedLessons: completed,
      remainingLessons: remaining,
      progressPercent: pct,
      status: deriveStageStatus(stage.lessons),
    };
  });

  const totalLessons = stageStats.reduce((acc, s) => acc + s.totalLessons, 0);
  const completedLessons = stageStats.reduce((acc, s) => acc + s.completedLessons, 0);
  const remainingLessons = Math.max(0, totalLessons - completedLessons);
  const completedStages = stageStats.filter(
    (s) => s.totalLessons > 0 && s.completedLessons === s.totalLessons
  ).length;
  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const inProgressStageIdx = stages.findIndex(
    (s) => deriveStageStatus(s.lessons) === 'in_progress' && s.lessons.some((l) => !l.completed)
  );
  const firstIncompleteStageIdx = stages.findIndex((s) =>
    s.lessons.some((l) => !l.completed)
  );
  const nextStageIdx =
    inProgressStageIdx >= 0
      ? inProgressStageIdx
      : firstIncompleteStageIdx >= 0
      ? firstIncompleteStageIdx
      : -1;

  const targetStageIdx =
    nextStageIdx >= 0 ? nextStageIdx : Math.max(0, totalStages - 1);
  const nextIncompleteStage = nextStageIdx >= 0 ? stages[nextStageIdx] : null;
  const nextIncompleteLesson =
    nextIncompleteStage?.lessons.find((l) => !l.completed) ?? null;

  return {
    totalLessons,
    completedLessons,
    remainingLessons,
    progressPercent,
    totalStages,
    completedStages,
    currentStageNumber: totalStages > 0 ? targetStageIdx + 1 : 0,
    currentStageId: stages[targetStageIdx]?.id ?? null,
    currentStageTitle: stages[targetStageIdx]?.title ?? '',
    nextIncompleteStageId: nextIncompleteStage?.id ?? null,
    nextIncompleteLessonId: nextIncompleteLesson?.id ?? null,
    nextIncompleteLessonTitle: nextIncompleteLesson?.title ?? null,
    stageStats,
  };
}

export interface ResumeLearningTarget {
  roadmapId: string;
  roadmapTitle: string;
  stageId: string;
  stageTitle: string;
  stageIndex: number;
  lessonId: string;
  lessonTitle: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  isAllCompleted: boolean;
  source: 'last_session' | 'next_incomplete' | 'latest_stage';
}

/**
 * Resolves the exact lesson a student should resume in their active Learning Path.
 * Prefers the most recent incomplete lesson studied in learning_sessions for this
 * roadmap, falling back to the next incomplete lesson or final completed lesson.
 */
export function resolveResumeLearningTarget(
  activeRoadmap: LearningRoadmapRecord | null,
  learningSessions: LearningSessionRecord[] = []
): ResumeLearningTarget | null {
  if (!activeRoadmap) return null;
  const stages = activeRoadmap.roadmapData.stages;
  if (stages.length === 0) return null;

  const stats = computeRoadmapStats(activeRoadmap);

  // 1. Check most recent active study session belonging to this roadmap
  const sortedSessions = learningSessions
    .filter(
      (s) =>
        s.roadmapId === activeRoadmap.id &&
        Boolean(s.stageId) &&
        Boolean(s.lessonId)
    )
    .slice()
    .sort((a, b) => {
      const timeA = new Date(a.endedAt || a.startedAt).getTime() || 0;
      const timeB = new Date(b.endedAt || b.startedAt).getTime() || 0;
      return timeB - timeA;
    });

  for (const sess of sortedSessions) {
    const sIdx = stages.findIndex((st) => st.id === sess.stageId);
    if (sIdx < 0) continue;
    const stage = stages[sIdx];
    const lesson = stage.lessons.find((l) => l.id === sess.lessonId);
    if (!lesson) continue;
    if (!lesson.completed) {
      return {
        roadmapId: activeRoadmap.id,
        roadmapTitle: activeRoadmap.title,
        stageId: stage.id,
        stageTitle: stage.title,
        stageIndex: sIdx,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        progressPercent: stats.progressPercent,
        completedLessons: stats.completedLessons,
        totalLessons: stats.totalLessons,
        isAllCompleted: false,
        source: 'last_session',
      };
    }
  }

  // 2. Fallback to computed next incomplete stage/lesson
  if (stats.nextIncompleteStageId && stats.nextIncompleteLessonId) {
    const sIdx = stages.findIndex((st) => st.id === stats.nextIncompleteStageId);
    const stage = sIdx >= 0 ? stages[sIdx] : null;
    const lesson = stage?.lessons.find((l) => l.id === stats.nextIncompleteLessonId);
    if (stage && lesson) {
      return {
        roadmapId: activeRoadmap.id,
        roadmapTitle: activeRoadmap.title,
        stageId: stage.id,
        stageTitle: stage.title,
        stageIndex: sIdx,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        progressPercent: stats.progressPercent,
        completedLessons: stats.completedLessons,
        totalLessons: stats.totalLessons,
        isAllCompleted: false,
        source: 'next_incomplete',
      };
    }
  }

  // 3. All lessons completed — return last studied or last lesson in final stage
  for (const sess of sortedSessions) {
    const sIdx = stages.findIndex((st) => st.id === sess.stageId);
    if (sIdx < 0) continue;
    const stage = stages[sIdx];
    const lesson = stage.lessons.find((l) => l.id === sess.lessonId);
    if (lesson) {
      return {
        roadmapId: activeRoadmap.id,
        roadmapTitle: activeRoadmap.title,
        stageId: stage.id,
        stageTitle: stage.title,
        stageIndex: sIdx,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        progressPercent: stats.progressPercent,
        completedLessons: stats.completedLessons,
        totalLessons: stats.totalLessons,
        isAllCompleted: stats.remainingLessons === 0 && stats.totalLessons > 0,
        source: 'latest_stage',
      };
    }
  }

  for (let sIdx = stages.length - 1; sIdx >= 0; sIdx -= 1) {
    const stage = stages[sIdx];
    if (stage.lessons.length > 0) {
      const lesson = stage.lessons[stage.lessons.length - 1];
      return {
        roadmapId: activeRoadmap.id,
        roadmapTitle: activeRoadmap.title,
        stageId: stage.id,
        stageTitle: stage.title,
        stageIndex: sIdx,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        progressPercent: stats.progressPercent,
        completedLessons: stats.completedLessons,
        totalLessons: stats.totalLessons,
        isAllCompleted: stats.remainingLessons === 0 && stats.totalLessons > 0,
        source: 'latest_stage',
      };
    }
  }

  return null;
}

