import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { setVapidDetails, sendNotification } from 'web-push';
import {
  evaluateInactivityReminder,
  MeaningfulActivityEvent,
  normalizePreferredTime,
  resolveSafeTimeZone,
} from '../shared/inactivityEngine';

export class NotificationApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'NotificationApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ServerNotificationPreferences {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  preferredTime: string;
  timezone: string;
  paused: boolean;
  pausedUntil: string | null;
  streakReminders: boolean;
  inactivityReminders: boolean;
  weeklyDigest: boolean;
  aiInsightAlerts: boolean;
  lastMeaningfulActivityAt: string | null;
  updatedAt?: string;
}

export interface PushPublicConfigPayload {
  pushConfigured: boolean;
  vapidPublicKey: string;
  schedulerConfigured: boolean;
  serviceRoleConfigured: boolean;
}

function getSupabaseEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  };
}

function getVapidEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@skillora.app';
  return { publicKey, privateKey, subject };
}

let vapidConfiguredSuccessfully: boolean | null = null;

function ensureWebPushConfigured(): { configured: boolean; publicKey: string } {
  const { publicKey, privateKey, subject } = getVapidEnv();
  if (!publicKey || !privateKey) {
    return { configured: false, publicKey: '' };
  }
  if (vapidConfiguredSuccessfully === true) {
    return { configured: true, publicKey };
  }
  try {
    setVapidDetails(subject, publicKey, privateKey);
    vapidConfiguredSuccessfully = true;
    return { configured: true, publicKey };
  } catch (err) {
    vapidConfiguredSuccessfully = false;
    console.warn(
      '[Skillora][Notifications] Invalid VAPID configuration; Web Push disabled:',
      err instanceof Error ? err.message : String(err)
    );
    return { configured: false, publicKey: '' };
  }
}

export function getPushPublicConfig(): PushPublicConfigPayload {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  const vapid = ensureWebPushConfigured();
  const serviceRoleConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);
  return {
    pushConfigured: vapid.configured,
    vapidPublicKey: vapid.configured ? vapid.publicKey : '',
    serviceRoleConfigured,
    schedulerConfigured: vapid.configured && serviceRoleConfigured,
  };
}

function createUserScopedClient(accessToken: string): SupabaseClient {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new NotificationApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase configuration is missing on the server.'
    );
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function createServiceRoleClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function authenticateRequest(authorizationHeader?: string): Promise<{
  userId: string;
  supabase: SupabaseClient;
}> {
  const header = authorizationHeader?.trim() || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    throw new NotificationApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with an active Skillora session.'
    );
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    throw new NotificationApiError(401, 'INVALID_AUTH_TOKEN', 'Missing access token.');
  }
  const supabase = createUserScopedClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    throw new NotificationApiError(
      401,
      'UNAUTHORIZED',
      'Your session is invalid or expired. Please sign in again.'
    );
  }
  return { userId: data.user.id, supabase };
}

function isMissingNotificationTableError(err: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code ?? '').toUpperCase();
  const msg = (err.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    ((msg.includes('notification_preferences') ||
      msg.includes('push_subscriptions') ||
      msg.includes('notification_deliveries')) &&
      (msg.includes('does not exist') ||
        msg.includes('could not find the table') ||
        msg.includes('schema cache')))
  );
}

function defaultNotificationPreferences(timezone = 'UTC'): ServerNotificationPreferences {
  return {
    inAppEnabled: true,
    pushEnabled: false,
    preferredTime: '18:00',
    timezone: resolveSafeTimeZone(timezone),
    paused: false,
    pausedUntil: null,
    streakReminders: true,
    inactivityReminders: true,
    weeklyDigest: true,
    aiInsightAlerts: true,
    lastMeaningfulActivityAt: null,
  };
}

function mapRowToPreferences(row: Record<string, unknown>): ServerNotificationPreferences {
  const pausedUntilRaw =
    typeof row.paused_until === 'string' && row.paused_until.trim() ? row.paused_until : null;
  return {
    inAppEnabled: row.in_app_enabled !== false,
    pushEnabled: row.push_enabled === true,
    preferredTime: normalizePreferredTime(
      typeof row.preferred_time === 'string' ? row.preferred_time : '18:00'
    ).normalized,
    timezone: resolveSafeTimeZone(typeof row.timezone === 'string' ? row.timezone : 'UTC'),
    paused: row.paused === true,
    pausedUntil: pausedUntilRaw,
    streakReminders: row.streak_reminders !== false,
    inactivityReminders: row.inactivity_reminders !== false,
    weeklyDigest: row.weekly_digest !== false,
    aiInsightAlerts: row.ai_insight_alerts !== false,
    lastMeaningfulActivityAt:
      typeof row.last_meaningful_activity_at === 'string'
        ? row.last_meaningful_activity_at
        : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

async function fetchUserMeaningfulContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  events: MeaningfulActivityEvent[];
  primaryDirection: string;
  nextLessonTitle: string;
  nextLessonTargetUrl: string;
}> {
  const [profileRes, roadmapsRes, sessionsRes, kcRes, assessRes] = await Promise.all([
    supabase
      .from('student_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('learning_roadmaps')
      .select('id, status, career_goal, roadmap_data')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('learning_sessions')
      .select('client_session_id, activity_type, duration_seconds, started_at, ended_at, completed, lesson_title')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(200),
    supabase
      .from('lesson_knowledge_checks')
      .select('id, lesson_title, score, completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(100),
    supabase
      .from('assessment_attempts')
      .select('id, subject, score_percent, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const events: MeaningfulActivityEvent[] = [];
  let primaryDirection = '';
  if (profileRes.data && typeof profileRes.data === 'object') {
    const p = profileRes.data as Record<string, unknown>;
    primaryDirection =
      (typeof p.primary_direction === 'string' && p.primary_direction.trim()) ||
      (typeof p.career_goal === 'string' && p.career_goal.trim()) ||
      '';
  }

  let nextLessonTitle = '';
  let nextLessonTargetUrl = '/#/dashboard';

  if (Array.isArray(roadmapsRes.data)) {
    for (const rRow of roadmapsRes.data) {
      const r = rRow as Record<string, unknown>;
      const data =
        r.roadmap_data && typeof r.roadmap_data === 'object'
          ? (r.roadmap_data as Record<string, unknown>)
          : null;
      const stages = data && Array.isArray(data.stages) ? data.stages : [];
      for (const sRaw of stages) {
        if (!sRaw || typeof sRaw !== 'object') continue;
        const stage = sRaw as Record<string, unknown>;
        const lessons = Array.isArray(stage.lessons) ? stage.lessons : [];
        for (const lRaw of lessons) {
          if (!lRaw || typeof lRaw !== 'object') continue;
          const lesson = lRaw as Record<string, unknown>;
          if (lesson.completed === true && typeof lesson.completedAt === 'string' && lesson.completedAt) {
            events.push({
              type: 'lesson_completed',
              timestamp: lesson.completedAt,
              title: typeof lesson.title === 'string' ? lesson.title : 'Completed Lesson',
              completed: true,
            });
          } else if (
            !nextLessonTitle &&
            r.status === 'active' &&
            lesson.completed !== true &&
            typeof lesson.title === 'string'
          ) {
            nextLessonTitle = lesson.title;
            nextLessonTargetUrl = '/#/roadmap';
          }
        }
      }
      if (!primaryDirection && r.status === 'active') {
        const roadmapDir =
          data && typeof data.primaryDirection === 'string' && data.primaryDirection.trim()
            ? data.primaryDirection.trim()
            : typeof r.career_goal === 'string'
            ? r.career_goal.trim()
            : '';
        if (roadmapDir) {
          primaryDirection = roadmapDir;
        }
      }
    }
  }

  if (Array.isArray(sessionsRes.data)) {
    for (const sRaw of sessionsRes.data) {
      const s = sRaw as Record<string, unknown>;
      const ts =
        (typeof s.ended_at === 'string' && s.ended_at) ||
        (typeof s.started_at === 'string' && s.started_at) ||
        '';
      if (!ts) continue;
      events.push({
        type:
          s.activity_type === 'knowledge_check'
            ? 'knowledge_check'
            : s.activity_type === 'assessment'
            ? 'assessment'
            : 'lesson_study',
        timestamp: ts,
        durationSeconds: Number(s.duration_seconds ?? 0),
        completed: s.completed !== false,
        title: typeof s.lesson_title === 'string' ? s.lesson_title : undefined,
      });
    }
  }

  if (Array.isArray(kcRes.data)) {
    for (const kRaw of kcRes.data) {
      const k = kRaw as Record<string, unknown>;
      if (typeof k.completed_at === 'string' && k.completed_at) {
        events.push({
          type: 'knowledge_check',
          timestamp: k.completed_at,
          title: typeof k.lesson_title === 'string' ? k.lesson_title : undefined,
          completed: true,
        });
      }
    }
  }

  if (Array.isArray(assessRes.data)) {
    for (const aRaw of assessRes.data) {
      const a = aRaw as Record<string, unknown>;
      if (typeof a.created_at === 'string' && a.created_at) {
        events.push({
          type: 'assessment',
          timestamp: a.created_at,
          title: typeof a.subject === 'string' ? a.subject : undefined,
          completed: true,
        });
      }
    }
  }

  return {
    events,
    primaryDirection,
    nextLessonTitle,
    nextLessonTargetUrl,
  };
}

export async function handleGetNotificationPreferences(params: {
  authorizationHeader?: string;
}): Promise<{
  preferences: ServerNotificationPreferences;
  activeSubscriptionCount: number;
  schemaMigrationRequired: boolean;
}> {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);

  const [prefRes, subRes] = await Promise.all([
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);

  if (prefRes.error) {
    if (isMissingNotificationTableError(prefRes.error)) {
      return {
        preferences: defaultNotificationPreferences(),
        activeSubscriptionCount: 0,
        schemaMigrationRequired: true,
      };
    }
    throw new NotificationApiError(
      500,
      prefRes.error.code || 'PREFS_LOAD_ERROR',
      prefRes.error.message || 'Could not load notification preferences.'
    );
  }

  const preferences = prefRes.data
    ? mapRowToPreferences(prefRes.data as Record<string, unknown>)
    : defaultNotificationPreferences();

  return {
    preferences,
    activeSubscriptionCount: subRes.error ? 0 : subRes.count ?? 0,
    schemaMigrationRequired: false,
  };
}

export async function handleUpdateNotificationPreferences(params: {
  authorizationHeader?: string;
  updates: Partial<ServerNotificationPreferences>;
}): Promise<{
  preferences: ServerNotificationPreferences;
  schemaMigrationRequired: boolean;
}> {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);

  const existing = await handleGetNotificationPreferences({
    authorizationHeader: params.authorizationHeader,
  });

  const merged: ServerNotificationPreferences = {
    ...existing.preferences,
    ...params.updates,
    preferredTime: normalizePreferredTime(
      params.updates.preferredTime ?? existing.preferences.preferredTime
    ).normalized,
    timezone: resolveSafeTimeZone(params.updates.timezone ?? existing.preferences.timezone),
    updatedAt: new Date().toISOString(),
  };

  if (existing.schemaMigrationRequired) {
    return {
      preferences: merged,
      schemaMigrationRequired: true,
    };
  }

  const dbPayload = {
    user_id: userId,
    in_app_enabled: merged.inAppEnabled,
    push_enabled: merged.pushEnabled,
    preferred_time: merged.preferredTime,
    timezone: merged.timezone,
    paused: merged.paused,
    paused_until: merged.pausedUntil,
    streak_reminders: merged.streakReminders,
    inactivity_reminders: merged.inactivityReminders,
    weekly_digest: merged.weeklyDigest,
    ai_insight_alerts: merged.aiInsightAlerts,
    last_meaningful_activity_at: merged.lastMeaningfulActivityAt,
    updated_at: merged.updatedAt,
  };

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(dbPayload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { preferences: merged, schemaMigrationRequired: true };
    }
    throw new NotificationApiError(
      error.code === '42501' ? 403 : 500,
      error.code || 'PREFS_SAVE_ERROR',
      error.message || 'Could not save notification preferences.'
    );
  }

  return {
    preferences: mapRowToPreferences(data as Record<string, unknown>),
    schemaMigrationRequired: false,
  };
}

export async function handleRegisterPushSubscription(params: {
  authorizationHeader?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ saved: boolean; schemaMigrationRequired: boolean }> {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);

  const endpoint = params.endpoint.trim();
  const p256dh = params.p256dh.trim();
  const auth = params.auth.trim();

  if (!endpoint || !p256dh || !auth) {
    throw new NotificationApiError(
      400,
      'INVALID_SUBSCRIPTION',
      'Push subscription endpoint and encryption keys are required.'
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    throw new NotificationApiError(400, 'INVALID_ENDPOINT', 'Invalid push endpoint URL.');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new NotificationApiError(
      400,
      'INSECURE_ENDPOINT',
      'Push subscription endpoint must use HTTPS.'
    );
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: (params.userAgent ?? '').slice(0, 240) || null,
        is_active: true,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { saved: false, schemaMigrationRequired: true };
    }
    throw new NotificationApiError(
      error.code === '42501' ? 403 : 500,
      error.code || 'SUBSCRIPTION_SAVE_ERROR',
      error.message || 'Failed to save push subscription.'
    );
  }

  return { saved: true, schemaMigrationRequired: false };
}

export async function handleRemovePushSubscription(params: {
  authorizationHeader?: string;
  endpoint?: string;
}): Promise<{ removed: boolean; schemaMigrationRequired: boolean }> {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);

  let query = supabase
    .from('push_subscriptions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (params.endpoint?.trim()) {
    query = query.eq('endpoint', params.endpoint.trim());
  }

  const { error } = await query;
  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { removed: false, schemaMigrationRequired: true };
    }
    throw new NotificationApiError(
      500,
      error.code || 'SUBSCRIPTION_REMOVE_ERROR',
      error.message || 'Could not remove push subscription.'
    );
  }

  return { removed: true, schemaMigrationRequired: false };
}

async function sendWebPushToSubscriptions(params: {
  supabase: SupabaseClient;
  userId: string;
  subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
  };
}): Promise<{ sentCount: number; failedCount: number; lastError: string | null }> {
  let sentCount = 0;
  let failedCount = 0;
  let lastError: string | null = null;
  const nowIso = new Date().toISOString();

  for (const sub of params.subscriptions) {
    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(params.payload),
        { TTL: 3600 }
      );
      sentCount += 1;
      await params.supabase
        .from('push_subscriptions')
        .update({ last_used_at: nowIso, updated_at: nowIso })
        .eq('id', sub.id)
        .eq('user_id', params.userId);
    } catch (err) {
      failedCount += 1;
      const statusCode =
        typeof err === 'object' && err !== null && 'statusCode' in err
          ? Number((err as { statusCode?: unknown }).statusCode)
          : 0;
      lastError = err instanceof Error ? err.message : String(err ?? 'Push send error');
      if (statusCode === 404 || statusCode === 410) {
        await params.supabase
          .from('push_subscriptions')
          .update({ is_active: false, updated_at: nowIso })
          .eq('id', sub.id)
          .eq('user_id', params.userId);
      }
    }
  }

  return { sentCount, failedCount, lastError };
}

export async function handleSendTestPush(params: {
  authorizationHeader?: string;
}): Promise<{ sentCount: number; failedCount: number }> {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);
  const vapid = ensureWebPushConfigured();
  if (!vapid.configured) {
    throw new NotificationApiError(
      503,
      'VAPID_NOT_CONFIGURED',
      'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured on the server yet.'
    );
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    if (isMissingNotificationTableError(error)) {
      throw new NotificationApiError(
        503,
        'MIGRATION_REQUIRED',
        'Run the notifications Supabase migration before sending push notifications.'
      );
    }
    throw new NotificationApiError(500, error.code || 'SUB_LOAD_ERROR', error.message);
  }

  const activeSubs = (subs ?? []) as Array<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;

  if (activeSubs.length === 0) {
    throw new NotificationApiError(
      400,
      'NO_PUSH_SUBSCRIPTION',
      'Enable browser notifications in this browser first so a push subscription is registered.'
    );
  }

  const result = await sendWebPushToSubscriptions({
    supabase,
    userId,
    subscriptions: activeSubs,
    payload: {
      title: 'Skillora Study Reminder Ready',
      body: 'External browser notifications are connected for your account.',
      url: '/#/dashboard',
      tag: 'skillora-test-push',
    },
  });

  if (result.sentCount === 0 && result.failedCount > 0) {
    throw new NotificationApiError(
      502,
      'PUSH_DELIVERY_FAILED',
      result.lastError || 'Push service rejected the notification.'
    );
  }

  return { sentCount: result.sentCount, failedCount: result.failedCount };
}

export interface ScheduledDispatchSummary {
  evaluatedUsers: number;
  triggeredReminders: number;
  pushSentCount: number;
  pushFailedCount: number;
  inAppRecordedCount: number;
  skippedReasons: Record<string, number>;
}

export async function dispatchScheduledInactivityNotifications(
  now: Date = new Date()
): Promise<ScheduledDispatchSummary> {
  const admin = createServiceRoleClient();
  if (!admin) {
    throw new NotificationApiError(
      503,
      'SERVICE_ROLE_NOT_CONFIGURED',
      'SUPABASE_SERVICE_ROLE_KEY is required on the server for scheduled background dispatch.'
    );
  }

  const { data: prefRows, error: prefError } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('inactivity_reminders', true)
    .limit(500);

  if (prefError) {
    if (isMissingNotificationTableError(prefError)) {
      throw new NotificationApiError(
        503,
        'MIGRATION_REQUIRED',
        'notification_preferences table is not provisioned in Supabase yet.'
      );
    }
    throw new NotificationApiError(500, prefError.code || 'DISPATCH_LOAD_ERROR', prefError.message);
  }

  const rows = (prefRows ?? []) as Array<Record<string, unknown>>;
  const vapid = ensureWebPushConfigured();
  const skippedReasons: Record<string, number> = {};
  let triggeredReminders = 0;
  let pushSentCount = 0;
  let pushFailedCount = 0;
  let inAppRecordedCount = 0;

  for (const row of rows) {
    const userId = typeof row.user_id === 'string' ? row.user_id : '';
    if (!userId) continue;
    const prefs = mapRowToPreferences(row);
    if (!prefs.inAppEnabled && !prefs.pushEnabled) {
      skippedReasons.all_channels_disabled = (skippedReasons.all_channels_disabled ?? 0) + 1;
      continue;
    }

    const [context, deliveriesRes] = await Promise.all([
      fetchUserMeaningfulContext(admin, userId),
      admin
        .from('notification_deliveries')
        .select('dedupe_key, tier, sent_at')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(30),
    ]);

    const sentHistory = ((deliveriesRes.data ?? []) as Array<Record<string, unknown>>).map((d) => ({
      dedupeKey: typeof d.dedupe_key === 'string' ? d.dedupe_key : '',
      tier: typeof d.tier === 'string' ? d.tier : '',
      sentAt: typeof d.sent_at === 'string' ? d.sent_at : '',
    }));

    const evaluation = evaluateInactivityReminder({
      events: context.events,
      now,
      timeZone: prefs.timezone,
      preferredTime: prefs.preferredTime,
      paused: prefs.paused,
      pausedUntil: prefs.pausedUntil,
      inactivityRemindersEnabled: prefs.inactivityReminders,
      sentHistory,
      primaryDirection: context.primaryDirection,
      nextLessonTitle: context.nextLessonTitle,
      enforcePreferredTimeWindow: true,
    });

    if (!evaluation.shouldNotify || !evaluation.tier || !evaluation.dedupeKey || !evaluation.title || !evaluation.body) {
      const reason = evaluation.suppressedReason || 'skipped';
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
      continue;
    }

    triggeredReminders += 1;

    if (prefs.inAppEnabled) {
      const { error: inAppErr } = await admin.from('notification_deliveries').upsert(
        {
          user_id: userId,
          dedupe_key: evaluation.dedupeKey,
          tier: evaluation.tier,
          channel: 'in_app',
          title: evaluation.title,
          body: evaluation.body,
          target_url: context.nextLessonTargetUrl,
          status: 'sent',
          sent_at: now.toISOString(),
        },
        { onConflict: 'user_id,dedupe_key,channel', ignoreDuplicates: true }
      );
      if (!inAppErr) {
        inAppRecordedCount += 1;
      }
    }

    if (prefs.pushEnabled && vapid.configured) {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId)
        .eq('is_active', true);

      const activeSubs = (subs ?? []) as Array<{
        id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
      }>;

      if (activeSubs.length > 0) {
        const pushRes = await sendWebPushToSubscriptions({
          supabase: admin,
          userId,
          subscriptions: activeSubs,
          payload: {
            title: evaluation.title,
            body: evaluation.body,
            url: context.nextLessonTargetUrl,
            tag: evaluation.dedupeKey,
          },
        });
        pushSentCount += pushRes.sentCount;
        pushFailedCount += pushRes.failedCount;

        await admin.from('notification_deliveries').upsert(
          {
            user_id: userId,
            dedupe_key: evaluation.dedupeKey,
            tier: evaluation.tier,
            channel: 'push',
            title: evaluation.title,
            body: evaluation.body,
            target_url: context.nextLessonTargetUrl,
            status: pushRes.sentCount > 0 ? 'sent' : 'failed',
            error_message: pushRes.sentCount > 0 ? null : pushRes.lastError,
            sent_at: now.toISOString(),
          },
          { onConflict: 'user_id,dedupe_key,channel', ignoreDuplicates: true }
        );
      }
    }
  }

  return {
    evaluatedUsers: rows.length,
    triggeredReminders,
    pushSentCount,
    pushFailedCount,
    inAppRecordedCount,
    skippedReasons,
  };
}

export function verifyCronAuthorization(reqHeaders: {
  authorization?: string;
  'x-cron-secret'?: string | string[];
}): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim() || '';
  if (!configuredSecret) {
    // Allow local/self-hosted dispatch only when CRON_SECRET isn't configured, or require secret in prod
    return process.env.NODE_ENV !== 'production';
  }
  const headerVal =
    (typeof reqHeaders['x-cron-secret'] === 'string' ? reqHeaders['x-cron-secret'] : '') ||
    (reqHeaders.authorization?.startsWith('Bearer ')
      ? reqHeaders.authorization.slice(7).trim()
      : '');
  return headerVal === configuredSecret;
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function startNotificationScheduler(): void {
  if (schedulerInterval) return;
  const config = getPushPublicConfig();
  if (!config.serviceRoleConfigured) {
    return;
  }

  // Run every 15 minutes when server-side SUPABASE_SERVICE_ROLE_KEY is configured
  const intervalMs = 15 * 60_000;
  schedulerInterval = setInterval(() => {
    void dispatchScheduledInactivityNotifications().catch((err) => {
      console.warn(
        '[Skillora][Notifications] Scheduled dispatch cycle skipped/failed:',
        err instanceof Error ? err.message : String(err)
      );
    });
  }, intervalMs);
  schedulerInterval.unref?.();
}
