import { SupabaseClient } from '@supabase/supabase-js';
import { AssessmentAttemptRecord } from '../types';

export class AssessmentDbError extends Error {
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
    this.name = 'AssessmentDbError';
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

function buildFriendlyAssessmentDbMessage(code: string, rawMessage: string): string {
  if (code === '42501') {
    return 'Permission denied by database security policy (RLS). Please verify you are signed in with your account.';
  }
  if (code === '23502') {
    return 'A required assessment field was missing. Please try saving again.';
  }
  if (code === '23514') {
    return 'One of the assessment values violated a database check constraint.';
  }
  if (code === '42P01') {
    return 'The assessment_attempts table could not be found in Supabase.';
  }
  return rawMessage || 'Failed to communicate with the assessment database.';
}

function toAssessmentDbError(err: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}): AssessmentDbError {
  const code = err.code || 'DB_ERROR';
  const message = err.message || 'Unknown Supabase assessment error.';
  return new AssessmentDbError({
    userMessage: buildFriendlyAssessmentDbMessage(code, message),
    code,
    message,
    details: err.details,
    hint: err.hint,
  });
}

function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

function parseDifficulty(value: unknown): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
    return value;
  }
  return 'Intermediate';
}

export function mapDbRowToAssessmentAttempt(
  row: Record<string, unknown>
): AssessmentAttemptRecord {
  const totalQuestions =
    typeof row.total_questions === 'number'
      ? row.total_questions
      : Number(row.total_questions) || 0;
  const correctAnswers =
    typeof row.correct_answers === 'number'
      ? row.correct_answers
      : Number(row.correct_answers) || 0;

  const rawScore = row.score_percent;
  const parsedScore =
    typeof rawScore === 'number' && !Number.isNaN(rawScore)
      ? Math.round(rawScore)
      : typeof rawScore === 'string' && rawScore.trim() !== '' && !Number.isNaN(Number(rawScore))
      ? Math.round(Number(rawScore))
      : totalQuestions > 0
      ? Math.round((correctAnswers / totalQuestions) * 100)
      : 0;

  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    userId: typeof row.user_id === 'string' ? row.user_id : String(row.user_id ?? ''),
    subject: typeof row.subject === 'string' ? row.subject : 'Skill Assessment',
    difficulty: parseDifficulty(row.difficulty),
    totalQuestions,
    correctAnswers,
    scorePercent: parsedScore,
    strengths: parseTextArray(row.strengths),
    knowledgeGaps: parseTextArray(row.knowledge_gaps),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

export interface SaveAssessmentAttemptInput {
  subject: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  totalQuestions: number;
  correctAnswers: number;
  strengths: string[];
  knowledgeGaps: string[];
}

export async function saveAssessmentAttempt(
  supabase: SupabaseClient,
  input: SaveAssessmentAttemptInput
): Promise<AssessmentAttemptRecord> {
  // 1. Verify active session and authenticated student UUID
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw toAssessmentDbError(sessionError);
  }
  if (!sessionData.session) {
    throw new AssessmentDbError({
      userMessage: 'Please sign in with an active account session to save assessment results.',
      code: 'NO_ACTIVE_SESSION',
      message: 'supabase.auth.getSession() returned null.',
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toAssessmentDbError(
      userError ?? { code: 'NO_AUTH_USER', message: 'Authenticated user UUID not available.' }
    );
  }

  const authUser = userData.user;

  // 2. Insert one new attempt (do NOT manually insert id, score_percent, or created_at)
  const payload = {
    user_id: authUser.id,
    subject: input.subject.trim(),
    difficulty: input.difficulty,
    total_questions: input.totalQuestions,
    correct_answers: input.correctAnswers,
    strengths: input.strengths,
    knowledge_gaps: input.knowledgeGaps,
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from('assessment_attempts')
    .insert(payload)
    .select('*')
    .single();

  if (insertError || !insertedRow) {
    throw toAssessmentDbError(
      insertError ?? {
        code: 'INSERT_EMPTY',
        message: 'Insert completed without returning a confirmation row.',
      }
    );
  }

  return mapDbRowToAssessmentAttempt(insertedRow as Record<string, unknown>);
}

export async function loadAssessmentAttempts(
  supabase: SupabaseClient
): Promise<AssessmentAttemptRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw toAssessmentDbError(sessionError);
  }
  if (!sessionData.session) {
    return [];
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toAssessmentDbError(
      userError ?? { code: 'NO_AUTH_USER', message: 'Authenticated user UUID not available.' }
    );
  }

  const authUser = userData.user;

  const { data, error } = await supabase
    .from('assessment_attempts')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw toAssessmentDbError(error);
  }

  return (data ?? []).map((row) =>
    mapDbRowToAssessmentAttempt(row as Record<string, unknown>)
  );
}

export function formatAssessmentDate(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
