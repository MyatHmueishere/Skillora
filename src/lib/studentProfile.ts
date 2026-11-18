import { SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile } from '../types';
import { getSupabasePublicConfig } from './supabase';

export const DEFAULT_AVATAR_URL = '/src/assets/images/avatar_alex_chen_1794403312992.jpg';

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
const TARGET_AVATAR_DIMENSION = 256;

let cachedTableColumns: Set<string> | null | undefined = undefined;
const excludedUnknownColumns = new Set<string>();
const ensureProfileInFlight = new Map<string, Promise<EnsureStudentProfileResult>>();

export interface StudentProfileDiagnostic {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
  authUserId?: string;
}

export class StudentProfileDbError extends Error {
  code: string;
  details?: string | null;
  hint?: string | null;
  authUserId?: string;
  userMessage: string;

  constructor(params: {
    userMessage: string;
    code: string;
    message: string;
    details?: string | null;
    hint?: string | null;
    authUserId?: string;
  }) {
    super(params.message);
    this.name = 'StudentProfileDbError';
    this.userMessage = params.userMessage;
    this.code = params.code;
    this.details = params.details;
    this.hint = params.hint;
    this.authUserId = params.authUserId;
  }

  toDiagnosticText(): string {
    const parts = [
      `Code: ${this.code || 'UNKNOWN'}`,
      `Message: ${this.message}`,
    ];
    if (this.authUserId) parts.push(`User ID: ${this.authUserId}`);
    if (this.details) parts.push(`Details: ${this.details}`);
    if (this.hint) parts.push(`Hint: ${this.hint}`);
    return parts.join(' | ');
  }
}

export function resetStudentProfileSchemaCache() {
  cachedTableColumns = undefined;
  excludedUnknownColumns.clear();
}

export function createEmptyUserProfile(authUser?: User | null): UserProfile {
  const meta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    typeof meta.full_name === 'string' && meta.full_name.trim()
      ? meta.full_name.trim()
      : '';

  const metaAvatar =
    typeof meta.avatar_url === 'string' && meta.avatar_url.trim()
      ? meta.avatar_url.trim()
      : DEFAULT_AVATAR_URL;

  return {
    name: metaName,
    email: authUser?.email ?? '',
    avatarUrl: metaAvatar,
    educationLevel: '',
    university: '',
    fieldOfStudy: '',
    careerGoal: '',
    primaryDirection:
      typeof meta.primary_direction === 'string' && meta.primary_direction.trim()
        ? meta.primary_direction.trim()
        : '',
    preferredHoursPerDay: 2,
    knowledgeLevel: 'Beginner',
    currentSkills: [],
    learningInterests: [],
    currentStreak: 0,
    totalHours: 0,
    completedCoursesCount: 0,
    overallProgress: 0,
    onboardingCompleted: false,
  };
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
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
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
    return value;
  }
  return 'Beginner';
}

export function mapDbRowToUserProfile(
  row: Record<string, unknown>,
  authUser?: User | null
): UserProfile {
  const base = createEmptyUserProfile(authUser);

  const dbName =
    typeof row.full_name === 'string' && row.full_name.trim()
      ? row.full_name.trim()
      : typeof row.name === 'string' && row.name.trim()
      ? row.name.trim()
      : base.name;

  const dbEmail =
    typeof row.email === 'string' && row.email.trim() ? row.email.trim() : base.email;

  const dbAvatar =
    typeof row.avatar_url === 'string' && row.avatar_url.trim()
      ? row.avatar_url.trim()
      : base.avatarUrl;

  const dbHoursRaw = row.preferred_hours_per_day ?? row.daily_study_hours;
  const dbHours =
    typeof dbHoursRaw === 'number' && !Number.isNaN(dbHoursRaw)
      ? dbHoursRaw
      : typeof dbHoursRaw === 'string' && dbHoursRaw.trim() && !Number.isNaN(Number(dbHoursRaw))
      ? Number(dbHoursRaw)
      : base.preferredHoursPerDay;

  const onboardingCompleted = Object.prototype.hasOwnProperty.call(
    row,
    'onboarding_completed'
  )
    ? row.onboarding_completed === true
    : Boolean(
        typeof row.university === 'string' &&
          row.university.trim() &&
          typeof row.career_goal === 'string' &&
          row.career_goal.trim()
      );

  const dbPrimary =
    typeof row.primary_direction === 'string' ? row.primary_direction.trim() : '';
  const primaryDirection = dbPrimary || (base.primaryDirection ?? '');

  return {
    ...base,
    name: dbName,
    email: dbEmail,
    avatarUrl: dbAvatar,
    educationLevel:
      typeof row.education_level === 'string' ? row.education_level : '',
    university: typeof row.university === 'string' ? row.university : '',
    fieldOfStudy:
      typeof row.field_of_study === 'string' ? row.field_of_study : '',
    careerGoal: typeof row.career_goal === 'string' ? row.career_goal : '',
    primaryDirection,
    preferredHoursPerDay: dbHours,
    knowledgeLevel: parseKnowledgeLevel(row.knowledge_level),
    currentSkills: parseStringArray(row.current_skills),
    learningInterests: parseStringArray(row.learning_interests),
    onboardingCompleted,
  };
}

function buildFriendlyDbMessage(code: string, rawMessage: string): string {
  if (code === '42501') {
    return 'Permission denied by database security policy (RLS). Please verify you are signed in with the matching account.';
  }
  if (code === '23502') {
    return 'A required profile column cannot be empty. Please check all required fields and try again.';
  }
  if (code === '23514') {
    return 'One of the profile values did not satisfy a database constraint. Please review your entries.';
  }
  if (code === 'PGRST204') {
    return 'Database schema mismatch while saving profile fields.';
  }
  return rawMessage || 'Failed to save your student profile to the database.';
}

function toStudentProfileDbError(
  err: { code?: string; message?: string; details?: string | null; hint?: string | null },
  authUserId?: string
): StudentProfileDbError {
  const code = err.code || 'DB_ERROR';
  const message = err.message || 'Unknown Supabase database error.';
  return new StudentProfileDbError({
    userMessage: buildFriendlyDbMessage(code, message),
    code,
    message,
    details: err.details,
    hint: err.hint,
    authUserId,
  });
}

async function discoverColumnsFromOpenApi(accessToken: string): Promise<Set<string> | null> {
  if (cachedTableColumns !== undefined) return cachedTableColumns;

  try {
    const { supabaseUrl, supabasePublishableKey } = await getSupabasePublicConfig();
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/openapi+json',
      },
    });
    if (!res.ok) {
      cachedTableColumns = null;
      return null;
    }
    const spec = (await res.json()) as {
      definitions?: Record<string, { properties?: Record<string, unknown> }>;
    };
    const props = spec?.definitions?.student_profiles?.properties;
    if (props && typeof props === 'object') {
      cachedTableColumns = new Set(Object.keys(props));
      return cachedTableColumns;
    }
  } catch {
    // OpenAPI introspection unavailable; fall back to runtime query/PGRST204 handling
  }

  cachedTableColumns = null;
  return null;
}

export interface LoadStudentProfileResult {
  exists: boolean;
  profile: UserProfile;
  row: Record<string, unknown> | null;
}

export async function loadStudentProfile(
  supabase: SupabaseClient,
  authUser: User
): Promise<LoadStudentProfileResult> {
  if (!authUser?.id) {
    throw new StudentProfileDbError({
      userMessage: 'No authenticated user found while loading profile.',
      code: 'NO_AUTH_USER',
      message: 'authUser.id is missing.',
    });
  }

  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) {
    throw toStudentProfileDbError(error, authUser.id);
  }

  if (!data) {
    return {
      exists: false,
      profile: createEmptyUserProfile(authUser),
      row: null,
    };
  }

  const row = data as Record<string, unknown>;
  cachedTableColumns = new Set(Object.keys(row));

  return {
    exists: true,
    profile: mapDbRowToUserProfile(row, authUser),
    row,
  };
}

export interface SaveStudentProfileInput {
  name?: string;
  email?: string;
  avatarUrl?: string;
  educationLevel?: string;
  university?: string;
  fieldOfStudy?: string;
  careerGoal?: string;
  primaryDirection?: string;
  preferredHoursPerDay?: number;
  knowledgeLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
  currentSkills?: string[];
  learningInterests?: string[];
  onboardingCompleted?: boolean;
}

export async function saveStudentProfile(
  supabase: SupabaseClient,
  input: SaveStudentProfileInput
): Promise<UserProfile> {
  // 1 & 2. Retrieve authenticated user & confirm active session
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw toStudentProfileDbError(sessionError);
  }
  const activeSession = sessionData.session;
  if (!activeSession) {
    throw new StudentProfileDbError({
      userMessage: 'You must be signed in with an active session to save your profile.',
      code: 'NO_ACTIVE_SESSION',
      message: 'supabase.auth.getSession() returned null.',
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw toStudentProfileDbError(
      userError ?? { code: 'NO_AUTH_USER', message: 'Authenticated user UUID not available.' }
    );
  }

  const authUser = userData.user;

  // 3. Discover real columns on student_profiles if not yet cached
  const knownCols =
    cachedTableColumns ?? (await discoverColumnsFromOpenApi(activeSession.access_token));

  // Build candidate column map using authUser.id as student_profiles.id
  const candidateFields: Record<string, unknown> = {
    id: authUser.id,
  };

  if (input.email !== undefined) {
    candidateFields.email = input.email.trim();
  } else if (authUser.email) {
    candidateFields.email = authUser.email;
  }

  if (input.name !== undefined) {
    candidateFields.full_name = input.name.trim();
  }
  if (input.avatarUrl !== undefined) {
    candidateFields.avatar_url = input.avatarUrl.trim();
  }
  if (input.educationLevel !== undefined) {
    candidateFields.education_level = input.educationLevel.trim();
  }
  if (input.university !== undefined) {
    candidateFields.university = input.university.trim();
  }
  if (input.fieldOfStudy !== undefined) {
    candidateFields.field_of_study = input.fieldOfStudy.trim();
  }
  if (input.careerGoal !== undefined) {
    candidateFields.career_goal = input.careerGoal.trim();
  }
  if (input.primaryDirection !== undefined) {
    candidateFields.primary_direction = input.primaryDirection.trim();
  }
  if (input.preferredHoursPerDay !== undefined) {
    candidateFields.preferred_hours_per_day = input.preferredHoursPerDay;
  }
  if (input.knowledgeLevel !== undefined) {
    candidateFields.knowledge_level = input.knowledgeLevel;
  }
  if (input.currentSkills !== undefined) {
    candidateFields.current_skills = input.currentSkills;
  }
  if (input.learningInterests !== undefined) {
    candidateFields.learning_interests = input.learningInterests;
  }
  if (input.onboardingCompleted !== undefined) {
    candidateFields.onboarding_completed = input.onboardingCompleted;
  }
  candidateFields.updated_at = new Date().toISOString();

  // Filter strictly to existing columns when schema is known
  let payload: Record<string, unknown> = {};
  if (knownCols) {
    for (const [key, val] of Object.entries(candidateFields)) {
      if (knownCols.has(key)) {
        payload[key] = val;
      }
    }
    // Support tables using `name` instead of `full_name`
    if (!knownCols.has('full_name') && knownCols.has('name') && input.name !== undefined) {
      payload.name = input.name.trim();
    }
    // Never silently drop explicit avatar_url updates; let Supabase verify the column directly
    if (input.avatarUrl !== undefined) {
      payload.avatar_url = input.avatarUrl.trim();
    }
    payload.id = authUser.id;
  } else {
    for (const [key, val] of Object.entries(candidateFields)) {
      if (!excludedUnknownColumns.has(key)) {
        payload[key] = val;
      }
    }
    if (
      excludedUnknownColumns.has('full_name') &&
      !excludedUnknownColumns.has('name') &&
      input.name !== undefined
    ) {
      payload.name = input.name.trim();
    }
    if (input.avatarUrl !== undefined) {
      payload.avatar_url = input.avatarUrl.trim();
    }
  }

  // 4 & 5. Upsert profile and handle schema column mismatches if OpenAPI wasn't exposed
  let upsertConfirmedRow: Record<string, unknown> | null = null;
  const maxAttempts = 14;

  const extractMissingColumnName = (err: { code?: string; message?: string }): string | null => {
    const msg = err.message || '';
    if (err.code === 'PGRST204') {
      const m = msg.match(/Could not find the '([^']+)' column/);
      return m?.[1] ?? null;
    }
    if (err.code === '42703') {
      const m = msg.match(/column (?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"? does not exist/i);
      return m?.[1] ?? null;
    }
    return null;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: savedRow, error: upsertError } = await supabase
      .from('student_profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (!upsertError && savedRow) {
      upsertConfirmedRow = savedRow as Record<string, unknown>;
      cachedTableColumns = new Set(Object.keys(upsertConfirmedRow));
      break;
    }

    const missingCol = upsertError ? extractMissingColumnName(upsertError) : null;

    // Never silently drop critical core columns; allow optional/alias/migrated columns to fall back safely
    if (
      missingCol &&
      missingCol !== 'id' &&
      missingCol !== 'university' &&
      missingCol !== 'career_goal' &&
      missingCol !== 'avatar_url' &&
      Object.prototype.hasOwnProperty.call(payload, missingCol)
    ) {
      excludedUnknownColumns.add(missingCol);
      const nextPayload = { ...payload };
      delete nextPayload[missingCol];

      // If `full_name` doesn't exist, try `name` alias once
      if (
        missingCol === 'full_name' &&
        !excludedUnknownColumns.has('name') &&
        input.name !== undefined
      ) {
        nextPayload.name = input.name.trim();
      }

      payload = nextPayload;
      continue;
    }

    // Handle integer-typed preferred_hours_per_day column rejecting fractional hours like 0.5 / 1.5
    if (
      upsertError?.code === '22P02' &&
      typeof payload.preferred_hours_per_day === 'number' &&
      !Number.isInteger(payload.preferred_hours_per_day)
    ) {
      payload = {
        ...payload,
        preferred_hours_per_day: Math.max(1, Math.round(payload.preferred_hours_per_day)),
      };
      continue;
    }

    throw toStudentProfileDbError(
      upsertError ?? { code: 'UPSERT_EMPTY', message: 'Upsert returned no confirmation row.' },
      authUser.id
    );
  }

  if (!upsertConfirmedRow) {
    throw new StudentProfileDbError({
      userMessage: 'Could not match your profile fields to the student_profiles table columns.',
      code: 'SCHEMA_MISMATCH',
      message: 'Exceeded maximum column resolution retries on student_profiles.',
      authUserId: authUser.id,
    });
  }

  // 8. Reload the saved profile directly from Supabase to confirm persistence
  const { data: reloadedRow, error: reloadError } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (reloadError || !reloadedRow) {
    throw toStudentProfileDbError(
      reloadError ?? { code: 'RELOAD_FAILED', message: 'Saved profile could not be reloaded.' },
      authUser.id
    );
  }

  const confirmedRow = reloadedRow as Record<string, unknown>;
  cachedTableColumns = new Set(Object.keys(confirmedRow));

  const hasPrimaryColInDb = Object.prototype.hasOwnProperty.call(
    confirmedRow,
    'primary_direction'
  );
  const nextPrimary =
    input.primaryDirection !== undefined ? input.primaryDirection.trim() : undefined;

  if (hasPrimaryColInDb && nextPrimary !== undefined) {
    const dbSavedPrimary =
      typeof confirmedRow.primary_direction === 'string'
        ? confirmedRow.primary_direction.trim()
        : '';
    if (dbSavedPrimary !== nextPrimary) {
      throw new StudentProfileDbError({
        userMessage:
          'Your Primary Learning Direction change could not be verified in the database. Please try again.',
        code: 'PRIMARY_DIRECTION_VERIFY_FAILED',
        message: `Expected primary_direction="${nextPrimary}" after reload, got "${dbSavedPrimary}".`,
        authUserId: authUser.id,
      });
    }
  }

  // Synchronize auth user_metadata (authoritative fallback when primary_direction column is not yet migrated,
  // and keeps metadata in lockstep when the DB column exists).
  let effectiveAuthUser: User = authUser;
  const shouldSyncAuthMeta =
    nextPrimary !== undefined ||
    input.name !== undefined ||
    input.onboardingCompleted !== undefined;

  if (shouldSyncAuthMeta) {
    const metaPatch: Record<string, unknown> = {};
    if (input.name !== undefined && input.name.trim()) {
      metaPatch.full_name = input.name.trim();
    }
    if (nextPrimary !== undefined) {
      metaPatch.primary_direction = nextPrimary;
    }
    if (input.onboardingCompleted !== undefined) {
      metaPatch.onboarding_completed = input.onboardingCompleted;
    }

    const { data: updatedAuthData, error: authMetaError } = await supabase.auth.updateUser({
      data: metaPatch,
    });

    if (authMetaError) {
      // If student_profiles lacks primary_direction column and auth metadata failed too, fail loudly!
      if (!hasPrimaryColInDb && nextPrimary !== undefined) {
        throw new StudentProfileDbError({
          userMessage:
            'Could not persist your Primary Learning Direction update. Please verify your connection and try again.',
          code: authMetaError.code || 'AUTH_METADATA_SAVE_FAILED',
          message: authMetaError.message || 'supabase.auth.updateUser failed.',
          authUserId: authUser.id,
        });
      }
    } else if (updatedAuthData?.user) {
      effectiveAuthUser = updatedAuthData.user;
    }
  }

  return mapDbRowToUserProfile(confirmedRow, effectiveAuthUser);
}

export interface EnsureStudentProfileDefaults {
  name?: string;
  email?: string;
}

export interface EnsureStudentProfileResult {
  created: boolean;
  profile: UserProfile;
}

export async function ensureStudentProfile(
  supabase: SupabaseClient,
  authUser: User,
  defaults?: EnsureStudentProfileDefaults
): Promise<EnsureStudentProfileResult> {
  if (!authUser?.id) {
    throw new StudentProfileDbError({
      userMessage: 'No authenticated user found while initializing profile.',
      code: 'NO_AUTH_USER',
      message: 'authUser.id is missing.',
    });
  }

  const existingPromise = ensureProfileInFlight.get(authUser.id);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async (): Promise<EnsureStudentProfileResult> => {
    const loaded = await loadStudentProfile(supabase, authUser);
    if (loaded.exists) {
      return {
        created: false,
        profile: loaded.profile,
      };
    }

    const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const metaName =
      typeof meta.full_name === 'string' && meta.full_name.trim()
        ? meta.full_name.trim()
        : '';
    const fallbackName =
      defaults?.name?.trim() ||
      metaName ||
      authUser.email?.split('@')[0]?.trim() ||
      'Student';
    const fallbackEmail = (defaults?.email?.trim() || authUser.email || '').trim();

    const knowledgeLevel =
      meta.knowledge_level === 'Beginner' ||
      meta.knowledge_level === 'Intermediate' ||
      meta.knowledge_level === 'Advanced'
        ? meta.knowledge_level
        : 'Beginner';

    const preferredHours =
      typeof meta.preferred_hours_per_day === 'number' &&
      !Number.isNaN(meta.preferred_hours_per_day) &&
      meta.preferred_hours_per_day > 0
        ? meta.preferred_hours_per_day
        : 2;

    const savedProfile = await saveStudentProfile(supabase, {
      name: fallbackName,
      email: fallbackEmail,
      educationLevel:
        typeof meta.education_level === 'string' ? meta.education_level.trim() : '',
      university: typeof meta.university === 'string' ? meta.university.trim() : '',
      fieldOfStudy:
        typeof meta.field_of_study === 'string' ? meta.field_of_study.trim() : '',
      careerGoal: typeof meta.career_goal === 'string' ? meta.career_goal.trim() : '',
      primaryDirection:
        typeof meta.primary_direction === 'string' ? meta.primary_direction.trim() : '',
      preferredHoursPerDay: preferredHours,
      knowledgeLevel,
      currentSkills: Array.isArray(meta.current_skills)
        ? meta.current_skills.filter((s): s is string => typeof s === 'string')
        : [],
      learningInterests: Array.isArray(meta.learning_interests)
        ? meta.learning_interests.filter((i): i is string => typeof i === 'string')
        : [],
      onboardingCompleted: meta.onboarding_completed === true,
    });

    return {
      created: true,
      profile: savedProfile,
    };
  })().finally(() => {
    ensureProfileInFlight.delete(authUser.id);
  });

  ensureProfileInFlight.set(authUser.id, promise);
  return promise;
}

async function compressAvatarImage(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new StudentProfileDbError({
      userMessage: 'Image processing is only available in the browser.',
      code: 'UNSUPPORTED_ENV',
      message: 'window/document unavailable',
    });
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image file.'));
      el.src = objectUrl;
    });

    const srcWidth = img.naturalWidth || img.width || TARGET_AVATAR_DIMENSION;
    const srcHeight = img.naturalHeight || img.height || TARGET_AVATAR_DIMENSION;
    const size = Math.min(srcWidth, srcHeight);
    const sx = Math.max(0, Math.floor((srcWidth - size) / 2));
    const sy = Math.max(0, Math.floor((srcHeight - size) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_AVATAR_DIMENSION;
    canvas.height = TARGET_AVATAR_DIMENSION;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable.');
    }

    ctx.fillStyle = '#FFFCFA';
    ctx.fillRect(0, 0, TARGET_AVATAR_DIMENSION, TARGET_AVATAR_DIMENSION);
    ctx.drawImage(
      img,
      sx,
      sy,
      size,
      size,
      0,
      0,
      TARGET_AVATAR_DIMENSION,
      TARGET_AVATAR_DIMENSION
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Failed to encode compressed avatar image.'));
        },
        'image/jpeg',
        0.86
      );
    });

    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadStudentAvatar(
  supabase: SupabaseClient,
  file: File
): Promise<string> {
  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    throw new StudentProfileDbError({
      userMessage: 'Please select a JPG, PNG, WebP, or GIF image.',
      code: 'INVALID_FILE_TYPE',
      message: `Unsupported image MIME type: ${file.type || 'unknown'}`,
    });
  }

  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new StudentProfileDbError({
      userMessage: 'Profile photo must be 5 MB or smaller.',
      code: 'FILE_TOO_LARGE',
      message: `File size ${file.size} exceeds 5 MB limit.`,
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw new StudentProfileDbError({
      userMessage: 'Please sign in with your Skillora account to upload a profile photo.',
      code: 'NO_AUTH_USER',
      message: userError?.message || 'Authenticated user UUID not available.',
    });
  }

  const authUser = userData.user;
  const { blob, dataUrl } = await compressAvatarImage(file);

  // Attempt Supabase Storage upload first when the 'avatars' bucket is provisioned
  const storagePath = `${authUser.id}/avatar-${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (!uploadError) {
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(storagePath);
    if (publicUrlData?.publicUrl) {
      return `${publicUrlData.publicUrl}?v=${Date.now()}`;
    }
  }

  // Fallback when storage bucket is not provisioned: return compact compressed JPEG data URL
  // so it persists cleanly in public.student_profiles.avatar_url.
  return dataUrl;
}

export interface ProfileCompletionStatus {
  percent: number;
  completedCount: number;
  totalCount: number;
  completedItems: string[];
  missingItems: string[];
}

export function computeProfileCompletion(user: UserProfile): ProfileCompletionStatus {
  const checks: { label: string; done: boolean }[] = [
    { label: 'Full Name', done: Boolean(user.name.trim()) },
    { label: 'Profile Photo', done: Boolean(user.avatarUrl.trim() && user.avatarUrl !== DEFAULT_AVATAR_URL) },
    {
      label: 'Academic Background',
      done: Boolean(user.university.trim() && user.fieldOfStudy.trim()),
    },
    {
      label: 'Primary Learning Direction',
      done: Boolean((user.primaryDirection ?? '').trim()),
    },
    { label: 'Career Goal', done: Boolean(user.careerGoal.trim()) },
    { label: 'Current Skills', done: user.currentSkills.length > 0 },
    { label: 'Supporting Interests', done: user.learningInterests.length > 0 },
  ];

  const completedItems = checks.filter((c) => c.done).map((c) => c.label);
  const missingItems = checks.filter((c) => !c.done).map((c) => c.label);
  const totalCount = checks.length;
  const completedCount = completedItems.length;
  const percent = Math.round((completedCount / totalCount) * 100);

  return {
    percent,
    completedCount,
    totalCount,
    completedItems,
    missingItems,
  };
}

