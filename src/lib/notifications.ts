import type { NotificationPreferences, PushPublicConfig } from '../types';
import { getSupabaseClient } from './supabase';
import {
  normalizePreferredTime,
  resolveSafeTimeZone,
} from '../../shared/inactivityEngine';

const PREFS_STORAGE_PREFIX = 'skillora_notif_prefs_v1:';

export type BrowserNotificationPermissionState =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

export interface BrowserPushSupportStatus {
  supported: boolean;
  permission: BrowserNotificationPermissionState;
  subscribed: boolean;
}

export function createDefaultNotificationPreferences(
  timeZone?: string
): NotificationPreferences {
  return {
    inAppEnabled: true,
    pushEnabled: false,
    preferredTime: '18:00',
    timezone: resolveSafeTimeZone(timeZone),
    paused: false,
    pausedUntil: null,
    streakReminders: true,
    inactivityReminders: true,
    weeklyDigest: true,
    aiInsightAlerts: true,
    lastMeaningfulActivityAt: null,
  };
}

function normalizePreferences(
  input: Partial<NotificationPreferences> | null | undefined,
  fallbackTz?: string
): NotificationPreferences {
  const base = createDefaultNotificationPreferences(fallbackTz);
  if (!input) return base;
  return {
    inAppEnabled: input.inAppEnabled !== false,
    pushEnabled: input.pushEnabled === true,
    preferredTime: normalizePreferredTime(input.preferredTime ?? base.preferredTime).normalized,
    timezone: resolveSafeTimeZone(input.timezone ?? base.timezone),
    paused: input.paused === true,
    pausedUntil:
      typeof input.pausedUntil === 'string' && input.pausedUntil.trim()
        ? input.pausedUntil
        : null,
    streakReminders: input.streakReminders !== false,
    inactivityReminders: input.inactivityReminders !== false,
    weeklyDigest: input.weeklyDigest !== false,
    aiInsightAlerts: input.aiInsightAlerts !== false,
    lastMeaningfulActivityAt:
      typeof input.lastMeaningfulActivityAt === 'string' &&
      input.lastMeaningfulActivityAt.trim()
        ? input.lastMeaningfulActivityAt
        : null,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : undefined,
  };
}

function readLocalPreferences(userId?: string | null): NotificationPreferences | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(`${PREFS_STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    return normalizePreferences(JSON.parse(raw) as Partial<NotificationPreferences>);
  } catch {
    return null;
  }
}

function writeLocalPreferences(
  userId: string | null | undefined,
  prefs: NotificationPreferences
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(`${PREFS_STORAGE_PREFIX}${userId}`, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function fetchPushPublicConfig(): Promise<PushPublicConfig> {
  try {
    const res = await fetch('/api/notifications/config', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        pushConfigured: false,
        vapidPublicKey: '',
        schedulerConfigured: false,
        serviceRoleConfigured: false,
      };
    }
    const json = (await res.json()) as Partial<PushPublicConfig>;
    return {
      pushConfigured: json.pushConfigured === true,
      vapidPublicKey: typeof json.vapidPublicKey === 'string' ? json.vapidPublicKey : '',
      schedulerConfigured: json.schedulerConfigured === true,
      serviceRoleConfigured: json.serviceRoleConfigured === true,
    };
  } catch {
    return {
      pushConfigured: false,
      vapidPublicKey: '',
      schedulerConfigured: false,
      serviceRoleConfigured: false,
    };
  }
}

export async function loadNotificationPreferences(userId?: string | null): Promise<{
  preferences: NotificationPreferences;
  activeSubscriptionCount: number;
  schemaMigrationRequired: boolean;
}> {
  const localCached = readLocalPreferences(userId);
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      preferences: localCached ?? createDefaultNotificationPreferences(),
      activeSubscriptionCount: 0,
      schemaMigrationRequired: false,
    };
  }

  try {
    const res = await fetch('/api/notifications/preferences', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const json = (await res.json().catch(() => ({}))) as {
      preferences?: Partial<NotificationPreferences>;
      activeSubscriptionCount?: number;
      schemaMigrationRequired?: boolean;
    };

    if (!res.ok) {
      return {
        preferences: localCached ?? createDefaultNotificationPreferences(),
        activeSubscriptionCount: 0,
        schemaMigrationRequired: false,
      };
    }

    const migrationRequired = json.schemaMigrationRequired === true;
    const serverPrefs = normalizePreferences(json.preferences);
    // When migration hasn't been applied on DB yet, prefer any persisted local overrides
    const resolvedPrefs =
      migrationRequired && localCached ? localCached : serverPrefs;
    writeLocalPreferences(userId, resolvedPrefs);

    return {
      preferences: resolvedPrefs,
      activeSubscriptionCount: Number(json.activeSubscriptionCount ?? 0),
      schemaMigrationRequired: migrationRequired,
    };
  } catch {
    return {
      preferences: localCached ?? createDefaultNotificationPreferences(),
      activeSubscriptionCount: 0,
      schemaMigrationRequired: false,
    };
  }
}

export async function saveNotificationPreferences(
  userId: string | null | undefined,
  updates: Partial<NotificationPreferences>,
  current?: NotificationPreferences | null
): Promise<{
  preferences: NotificationPreferences;
  schemaMigrationRequired: boolean;
}> {
  const localCurrent = current ?? readLocalPreferences(userId) ?? createDefaultNotificationPreferences();
  const optimistic = normalizePreferences({
    ...localCurrent,
    ...updates,
    updatedAt: new Date().toISOString(),
  });
  writeLocalPreferences(userId, optimistic);

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      preferences: optimistic,
      schemaMigrationRequired: false,
    };
  }

  const res = await fetch('/api/notifications/preferences', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(optimistic),
  });

  const json = (await res.json().catch(() => ({}))) as {
    preferences?: Partial<NotificationPreferences>;
    schemaMigrationRequired?: boolean;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(json.error || 'Could not save notification preferences.');
  }

  const saved = normalizePreferences(json.preferences ?? optimistic);
  writeLocalPreferences(userId, saved);
  return {
    preferences: saved,
    schemaMigrationRequired: json.schemaMigrationRequired === true,
  };
}

export async function recordMeaningfulActivityForNotifications(
  userId: string | null | undefined,
  timestampIso: string,
  current?: NotificationPreferences | null
): Promise<NotificationPreferences | null> {
  if (!userId) return null;
  const base = current ?? readLocalPreferences(userId) ?? createDefaultNotificationPreferences();
  const prevMs = base.lastMeaningfulActivityAt
    ? new Date(base.lastMeaningfulActivityAt).getTime()
    : 0;
  const nextMs = new Date(timestampIso).getTime();
  if (!Number.isFinite(nextMs) || (Number.isFinite(prevMs) && nextMs <= prevMs)) {
    return base;
  }

  try {
    const result = await saveNotificationPreferences(
      userId,
      { lastMeaningfulActivityAt: new Date(nextMs).toISOString() },
      base
    );
    return result.preferences;
  } catch {
    const localUpdated = normalizePreferences({
      ...base,
      lastMeaningfulActivityAt: new Date(nextMs).toISOString(),
    });
    writeLocalPreferences(userId, localUpdated);
    return localUpdated;
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch {
    return null;
  }
}

export async function getBrowserPushSupportStatus(): Promise<BrowserPushSupportStatus> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
    };
  }

  const permission = Notification.permission as BrowserNotificationPermissionState;
  let subscribed = false;
  try {
    const existingReg = await navigator.serviceWorker.getRegistration('/');
    if (existingReg) {
      const sub = await existingReg.pushManager.getSubscription();
      subscribed = Boolean(sub);
    }
  } catch {
    subscribed = false;
  }

  return {
    supported: true,
    permission,
    subscribed,
  };
}

export interface EnableBrowserPushResult {
  enabled: boolean;
  permission: BrowserNotificationPermissionState;
  subscribed: boolean;
  pushConfigured: boolean;
  schemaMigrationRequired: boolean;
  preferences: NotificationPreferences;
  message: string;
}

/**
 * MUST ONLY be called from an explicit user click handler (never on page load).
 */
export async function enableBrowserPushNotifications(params: {
  userId: string | null | undefined;
  currentPreferences: NotificationPreferences;
}): Promise<EnableBrowserPushResult> {
  const { userId, currentPreferences } = params;

  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return {
      enabled: false,
      permission: 'unsupported',
      subscribed: false,
      pushConfigured: false,
      schemaMigrationRequired: false,
      preferences: currentPreferences,
      message:
        'This browser or environment does not support Web Push notifications. In-app reminders remain active.',
    };
  }

  // Request permission strictly inside this user-initiated click action
  const permissionResult =
    Notification.permission === 'granted'
      ? 'granted'
      : ((await Notification.requestPermission()) as BrowserNotificationPermissionState);

  if (permissionResult !== 'granted') {
    const saved = await saveNotificationPreferences(
      userId,
      { pushEnabled: false },
      currentPreferences
    );
    return {
      enabled: false,
      permission: permissionResult,
      subscribed: false,
      pushConfigured: false,
      schemaMigrationRequired: saved.schemaMigrationRequired,
      preferences: saved.preferences,
      message:
        permissionResult === 'denied'
          ? 'Browser notifications are blocked in your browser site settings. In-app notifications remain active.'
          : 'Browser notification permission was dismissed. In-app reminders remain active.',
    };
  }

  const config = await fetchPushPublicConfig();
  if (!config.pushConfigured || !config.vapidPublicKey) {
    const saved = await saveNotificationPreferences(
      userId,
      { pushEnabled: false },
      currentPreferences
    );
    return {
      enabled: false,
      permission: 'granted',
      subscribed: false,
      pushConfigured: false,
      schemaMigrationRequired: saved.schemaMigrationRequired,
      preferences: saved.preferences,
      message:
        'Browser permission granted, but Web Push VAPID keys are not yet configured on the server for closed-tab Web Push. In-app reminders remain active.',
    };
  }

  const registration = await registerNotificationServiceWorker();
  if (!registration) {
    throw new Error('Could not register the Skillora notification service worker.');
  }

  const readyRegistration = await navigator.serviceWorker.ready;
  let subscription = await readyRegistration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await readyRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    });
  }

  const subJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = subJson.keys?.p256dh ?? '';
  const auth = subJson.keys?.auth ?? '';
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete push subscription.');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Please sign in to save your push subscription.');
  }

  const subRes = await fetch('/api/notifications/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }),
  });

  const subPayload = (await subRes.json().catch(() => ({}))) as {
    saved?: boolean;
    schemaMigrationRequired?: boolean;
    error?: string;
  };
  if (!subRes.ok) {
    throw new Error(subPayload.error || 'Could not register browser push subscription.');
  }

  const migrationRequired = subPayload.schemaMigrationRequired === true;
  const savedPrefs = await saveNotificationPreferences(
    userId,
    { pushEnabled: !migrationRequired },
    currentPreferences
  );

  return {
    enabled: !migrationRequired,
    permission: 'granted',
    subscribed: !migrationRequired,
    pushConfigured: true,
    schemaMigrationRequired: migrationRequired || savedPrefs.schemaMigrationRequired,
    preferences: savedPrefs.preferences,
    message: migrationRequired
      ? 'Run the Supabase notifications SQL migration before activating push subscriptions.'
      : 'Browser push notifications are enabled! Study reminders can arrive even when the tab is closed.',
  };
}

export async function disableBrowserPushNotifications(params: {
  userId: string | null | undefined;
  currentPreferences: NotificationPreferences;
}): Promise<{
  preferences: NotificationPreferences;
  schemaMigrationRequired: boolean;
}> {
  let endpoint: string | undefined;
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        endpoint = sub.endpoint;
        await sub.unsubscribe();
      }
    }
  } catch {
    // Continue cleaning server state even if browser unsubscribe already cleared
  }

  const accessToken = await getAccessToken();
  if (accessToken) {
    await fetch('/api/notifications/subscriptions', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  }

  return saveNotificationPreferences(
    params.userId,
    { pushEnabled: false },
    params.currentPreferences
  );
}

export async function sendTestPushNotification(): Promise<{
  sentCount: number;
  failedCount: number;
}> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Please sign in first to send a test push notification.');
  }

  const res = await fetch('/api/notifications/test-push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    sentCount?: number;
    failedCount?: number;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error || 'Could not deliver test push notification.');
  }
  return {
    sentCount: Number(json.sentCount ?? 0),
    failedCount: Number(json.failedCount ?? 0),
  };
}

export async function pauseNotificationsForDuration(params: {
  userId: string | null | undefined;
  currentPreferences: NotificationPreferences;
  duration: '24h' | '3d' | '7d' | 'indefinite';
}): Promise<{ preferences: NotificationPreferences; schemaMigrationRequired: boolean }> {
  const { userId, currentPreferences, duration } = params;
  if (duration === 'indefinite') {
    return saveNotificationPreferences(
      userId,
      { paused: true, pausedUntil: null },
      currentPreferences
    );
  }
  const hours = duration === '24h' ? 24 : duration === '3d' ? 72 : 168;
  const untilIso = new Date(Date.now() + hours * 3_600_000).toISOString();
  return saveNotificationPreferences(
    userId,
    { paused: false, pausedUntil: untilIso },
    currentPreferences
  );
}

export async function resumePausedNotifications(params: {
  userId: string | null | undefined;
  currentPreferences: NotificationPreferences;
}): Promise<{ preferences: NotificationPreferences; schemaMigrationRequired: boolean }> {
  return saveNotificationPreferences(
    params.userId,
    { paused: false, pausedUntil: null },
    params.currentPreferences
  );
}
