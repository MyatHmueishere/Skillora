import {
  AchievementSummaryPayload,
  evaluateVerifiedAchievements,
} from '../../shared/achievementEngine';
import { resolveSafeTimeZone } from '../../shared/inactivityEngine';
import type {
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
} from '../types';
import { getSupabaseClient } from './supabase';

export class AchievementsClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AchievementsClientError';
    this.status = status;
    this.code = code;
  }
}

async function getAccessToken(): Promise<string> {
  const supabase = await getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new AchievementsClientError(
      401,
      'NOT_AUTHENTICATED',
      'Please sign in to view and save your Achievement Badges and XP.'
    );
  }
  return session.access_token;
}

export async function fetchAchievementsSummary(
  timeZone?: string
): Promise<AchievementSummaryPayload> {
  const accessToken = await getAccessToken();
  const resolvedTz = resolveSafeTimeZone(timeZone);
  const query = new URLSearchParams({ timeZone: resolvedTz });

  const response = await fetch(`/api/achievements?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<AchievementSummaryPayload> & {
    code?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new AchievementsClientError(
      response.status,
      payload.code || 'ACHIEVEMENTS_FETCH_FAILED',
      payload.error || 'Could not load your Achievement Badges and XP.'
    );
  }

  return payload as AchievementSummaryPayload;
}

export async function syncAchievementsSummary(
  timeZone?: string
): Promise<AchievementSummaryPayload> {
  const accessToken = await getAccessToken();
  const resolvedTz = resolveSafeTimeZone(timeZone);

  const response = await fetch('/api/achievements/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ timeZone: resolvedTz }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<AchievementSummaryPayload> & {
    code?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new AchievementsClientError(
      response.status,
      payload.code || 'ACHIEVEMENTS_SYNC_FAILED',
      payload.error || 'Could not synchronize your Achievement Badges and XP.'
    );
  }

  return payload as AchievementSummaryPayload;
}

export function buildComputedAchievementsFallback(params: {
  authenticated: boolean;
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  timeZone?: string;
  schemaMigrationRequired?: boolean;
}): AchievementSummaryPayload {
  const evaluated = evaluateVerifiedAchievements({
    roadmaps: params.roadmaps,
    knowledgeCheckAttempts: params.knowledgeCheckAttempts,
    learningSessions: params.learningSessions,
    assessmentAttempts: params.assessmentAttempts,
    timeZone: resolveSafeTimeZone(params.timeZone),
  });

  return {
    authenticated: params.authenticated,
    persistedInDatabase: false,
    schemaMigrationRequired: Boolean(params.schemaMigrationRequired),
    ...evaluated.summary,
    newlyAwardedXp: 0,
    newlyUnlockedBadgeIds: [],
  };
}

export function formatAchievementDate(isoString?: string | null): string {
  if (!isoString) return '';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
