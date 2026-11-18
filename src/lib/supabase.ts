import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile } from '../types';

let cachedClient: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;
let cachedConfig: PublicSupabaseConfig | null = null;

export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export async function getSupabasePublicConfig(): Promise<PublicSupabaseConfig> {
  if (cachedConfig) return cachedConfig;

  let supabaseUrl = '';
  let supabasePublishableKey = '';

  try {
    const response = await fetch('/api/config/supabase', { cache: 'no-store' });
    if (response.ok) {
      const data = (await response.json()) as Partial<PublicSupabaseConfig>;
      supabaseUrl = data.supabaseUrl?.trim() || '';
      supabasePublishableKey = data.supabasePublishableKey?.trim() || '';
    }
  } catch {
    // Fallback to Vite client env vars if available
  }

  if (!supabaseUrl) {
    supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
  }
  if (!supabasePublishableKey) {
    supabasePublishableKey =
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || '';
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase authentication is not configured yet. Please check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Secrets.'
    );
  }

  cachedConfig = { supabaseUrl, supabasePublishableKey };
  return cachedConfig;
}

export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (cachedClient) return cachedClient;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      const { supabaseUrl, supabasePublishableKey } = await getSupabasePublicConfig();

      cachedClient = createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });

      return cachedClient;
    } catch (err) {
      clientPromise = null;
      throw err;
    }
  })();

  return clientPromise;
}

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_MIN_LENGTH_ERROR = 'Password must be at least 8 characters.';

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return PASSWORD_MIN_LENGTH_ERROR;
  }
  return null;
}

export function formatAuthError(error: unknown): string {
  const errObj =
    typeof error === 'object' && error !== null
      ? (error as {
          message?: unknown;
          msg?: unknown;
          error_description?: unknown;
          error_code?: unknown;
          code?: unknown;
        })
      : null;

  const rawMessage =
    error instanceof Error
      ? error.message
      : errObj && typeof errObj.message === 'string' && errObj.message
      ? errObj.message
      : errObj && typeof errObj.msg === 'string' && errObj.msg
      ? errObj.msg
      : errObj && typeof errObj.error_description === 'string' && errObj.error_description
      ? errObj.error_description
      : 'Something went wrong during authentication. Please try again.';

  const errorCode =
    errObj && typeof errObj.error_code === 'string'
      ? errObj.error_code.toLowerCase()
      : errObj && typeof errObj.code === 'string'
      ? errObj.code.toLowerCase()
      : '';

  const lower = rawMessage.toLowerCase();

  if (lower.includes('invalid login credentials') || errorCode === 'invalid_credentials') {
    return 'Incorrect email or password. Please double-check your credentials and try again.';
  }
  if (lower.includes('email not confirmed') || errorCode === 'email_not_confirmed') {
    return 'Please verify your email address before signing in. Check your inbox or spam folder for the confirmation link.';
  }
  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered') ||
    errorCode === 'user_already_exists'
  ) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (
    lower.includes('password should be at least') ||
    lower.includes('at least 8 characters') ||
    lower.includes('at least 6 characters') ||
    lower.includes('password_too_short') ||
    errorCode === 'weak_password' ||
    (lower.includes('weak') && lower.includes('password'))
  ) {
    return PASSWORD_MIN_LENGTH_ERROR;
  }
  if (lower.includes('rate limit') || lower.includes('security purposes')) {
    return 'Too many email requests in a short time. Please wait a moment before trying again.';
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('new password should be different')) {
    return 'Your new password must be different from your current password.';
  }

  return rawMessage;
}

export function mapSupabaseUserToProfile(supabaseUser: User): Partial<UserProfile> {
  const meta = (supabaseUser.user_metadata ?? {}) as Record<string, unknown>;
  const updates: Partial<UserProfile> = {};

  if (supabaseUser.email) {
    updates.email = supabaseUser.email;
  }

  if (typeof meta.full_name === 'string' && meta.full_name.trim()) {
    updates.name = meta.full_name.trim();
  } else if (supabaseUser.email) {
    updates.name = supabaseUser.email.split('@')[0];
  }

  if (typeof meta.education_level === 'string' && meta.education_level.trim()) {
    updates.educationLevel = meta.education_level;
  }
  if (typeof meta.university === 'string' && meta.university.trim()) {
    updates.university = meta.university;
  }
  if (typeof meta.field_of_study === 'string' && meta.field_of_study.trim()) {
    updates.fieldOfStudy = meta.field_of_study;
  }
  if (typeof meta.career_goal === 'string' && meta.career_goal.trim()) {
    updates.careerGoal = meta.career_goal;
  }
  if (typeof meta.preferred_hours_per_day === 'number') {
    updates.preferredHoursPerDay = meta.preferred_hours_per_day;
  }
  if (
    meta.knowledge_level === 'Beginner' ||
    meta.knowledge_level === 'Intermediate' ||
    meta.knowledge_level === 'Advanced'
  ) {
    updates.knowledgeLevel = meta.knowledge_level;
  }
  if (Array.isArray(meta.current_skills)) {
    updates.currentSkills = meta.current_skills.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(meta.learning_interests)) {
    updates.learningInterests = meta.learning_interests.filter(
      (i): i is string => typeof i === 'string'
    );
  }

  return updates;
}
