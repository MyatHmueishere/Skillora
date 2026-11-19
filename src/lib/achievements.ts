import {
  AchievementSummaryPayload,
  CertificatePublicNameVisibility,
  CertificateTemplateId,
  evaluateVerifiedAchievements,
  IssuedCertificateRecord,
  PublicCertificateVerificationResult,
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
      'Please sign in to view and save your Achievement Badges, XP, and Certificates.'
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

export async function verifyCertificateById(
  certificateNumber: string
): Promise<PublicCertificateVerificationResult> {
  const cleaned = certificateNumber.trim();
  if (!cleaned) {
    return {
      found: false,
      authentic: false,
      certificateNumber: '',
    };
  }

  const response = await fetch(
    `/api/certificates/verify/${encodeURIComponent(cleaned)}`,
    { method: 'GET' }
  );

  const payload = (await response.json().catch(() => ({}))) as
    | PublicCertificateVerificationResult
    | { code?: string; error?: string };

  if (!response.ok) {
    const errPayload = payload as { code?: string; error?: string };
    throw new AchievementsClientError(
      response.status,
      errPayload.code || 'CERTIFICATE_VERIFY_FAILED',
      errPayload.error || 'Could not verify certificate ID right now.'
    );
  }

  return payload as PublicCertificateVerificationResult;
}

export async function updateCertificateDisplayPreferences(
  certificateId: string,
  updates: {
    templateId?: CertificateTemplateId;
    publicNameVisibility?: CertificatePublicNameVisibility;
  }
): Promise<IssuedCertificateRecord> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `/api/certificates/${encodeURIComponent(certificateId)}/preferences`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(updates),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    certificate?: IssuedCertificateRecord;
    code?: string;
    error?: string;
  };

  if (!response.ok || !payload.certificate) {
    throw new AchievementsClientError(
      response.status,
      payload.code || 'CERTIFICATE_PREFS_UPDATE_FAILED',
      payload.error || 'Could not save certificate template preference.'
    );
  }

  return payload.certificate;
}

export function buildComputedAchievementsFallback(params: {
  authenticated: boolean;
  userId?: string;
  studentName?: string;
  activeDirection?: string;
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  timeZone?: string;
  schemaMigrationRequired?: boolean;
  certificatesSchemaMigrationRequired?: boolean;
}): AchievementSummaryPayload {
  const evaluated = evaluateVerifiedAchievements({
    userId: params.userId,
    studentName: params.studentName,
    activeDirection: params.activeDirection,
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
    certificatesSchemaMigrationRequired: Boolean(
      params.certificatesSchemaMigrationRequired
    ),
    ...evaluated.summary,
    newlyAwardedXp: 0,
    newlyUnlockedBadgeIds: [],
    newlyIssuedCertificateIds: [],
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

export function formatCertificateFullDate(isoString?: string | null): string {
  if (!isoString) return '';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
