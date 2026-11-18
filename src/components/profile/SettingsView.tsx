import React, { useEffect, useState } from 'react';
import {
  Settings,
  Check,
  X,
  AlertCircle,
  Download,
  Loader2,
  BellRing,
  BellOff,
  PauseCircle,
  PlayCircle,
  Clock,
  Globe,
  Send,
} from 'lucide-react';
import {
  NotificationPreferences,
  PushPublicConfig,
  UserProfile,
} from '../../types';
import { ClayIconBadge } from '../common/PastelIllustrations';
import {
  getSupabaseClient,
  formatAuthError,
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  validatePasswordStrength,
} from '../../lib/supabase';
import { StudentProfileDbError } from '../../lib/studentProfile';
import {
  BrowserPushSupportStatus,
  createDefaultNotificationPreferences,
  EnableBrowserPushResult,
  getBrowserPushSupportStatus,
} from '../../lib/notifications';
import {
  isNotificationsPausedAt,
  resolveSafeTimeZone,
} from '../../../shared/inactivityEngine';

export type SettingsTabId = 'personal' | 'learning' | 'notifications' | 'security';

interface SettingsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => Promise<void> | void;
  isAuthenticated?: boolean;
  initialTab?: SettingsTabId;
  notificationPreferences?: NotificationPreferences;
  notificationSchemaMigrationRequired?: boolean;
  pushConfig?: PushPublicConfig;
  pushSubscriptionActive?: boolean;
  onUpdateNotificationPreferences?: (
    updates: Partial<NotificationPreferences>
  ) => Promise<void>;
  onEnableBrowserPush?: () => Promise<EnableBrowserPushResult>;
  onDisableBrowserPush?: () => Promise<void>;
  onSendTestPush?: () => Promise<{ sentCount: number; failedCount: number }>;
  onPauseNotifications?: (
    duration: '24h' | '3d' | '7d' | 'indefinite'
  ) => Promise<void>;
  onResumeNotifications?: () => Promise<void>;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  isAuthenticated = false,
  initialTab = 'personal',
  notificationPreferences,
  notificationSchemaMigrationRequired = false,
  pushConfig = {
    pushConfigured: false,
    vapidPublicKey: '',
    schedulerConfigured: false,
    serviceRoleConfigured: false,
  },
  pushSubscriptionActive = false,
  onUpdateNotificationPreferences,
  onEnableBrowserPush,
  onDisableBrowserPush,
  onSendTestPush,
  onPauseNotifications,
  onResumeNotifications,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [preferredHours, setPreferredHours] = useState(user.preferredHoursPerDay);
  const [knowledgeLevel, setKnowledgeLevel] = useState(user.knowledgeLevel);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setPreferredHours(user.preferredHoursPerDay);
    setKnowledgeLevel(user.knowledgeLevel);
  }, [user]);

  const detectedTz = resolveSafeTimeZone();
  const basePrefs =
    notificationPreferences ?? createDefaultNotificationPreferences(detectedTz);

  const [inAppEnabled, setInAppEnabled] = useState(basePrefs.inAppEnabled);
  const [preferredTime, setPreferredTime] = useState(basePrefs.preferredTime);
  const [timezone, setTimezone] = useState(basePrefs.timezone);
  const [inactivityReminders, setInactivityReminders] = useState(
    basePrefs.inactivityReminders
  );
  const [streakReminders, setStreakReminders] = useState(basePrefs.streakReminders);
  const [weeklyDigest, setWeeklyDigest] = useState(basePrefs.weeklyDigest);
  const [aiInsightAlerts, setAiInsightAlerts] = useState(basePrefs.aiInsightAlerts);

  useEffect(() => {
    if (!notificationPreferences) return;
    setInAppEnabled(notificationPreferences.inAppEnabled);
    setPreferredTime(notificationPreferences.preferredTime);
    setTimezone(notificationPreferences.timezone);
    setInactivityReminders(notificationPreferences.inactivityReminders);
    setStreakReminders(notificationPreferences.streakReminders);
    setWeeklyDigest(notificationPreferences.weeklyDigest);
    setAiInsightAlerts(notificationPreferences.aiInsightAlerts);
  }, [notificationPreferences]);

  const [browserPushStatus, setBrowserPushStatus] = useState<BrowserPushSupportStatus>({
    supported: false,
    permission: 'unsupported',
    subscribed: false,
  });
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);
  const [pushNotice, setPushNotice] = useState('');
  const [pushNoticeTone, setPushNoticeTone] = useState<'success' | 'info' | 'error'>('info');

  useEffect(() => {
    let active = true;
    void getBrowserPushSupportStatus().then((status) => {
      if (active) setBrowserPushStatus(status);
    });
    return () => {
      active = false;
    };
  }, [pushSubscriptionActive]);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsDiagnostic, setSettingsDiagnostic] = useState('');

  const timezoneOptions = Array.from(
    new Set([detectedTz, timezone, ...COMMON_TIMEZONES].filter(Boolean))
  );

  const isPausedNow = isNotificationsPausedAt(basePrefs);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);
    setSettingsError('');
    setSettingsDiagnostic('');
    setIsSavingSettings(true);

    try {
      await onUpdateUser({
        name: name.trim(),
        email: email.trim(),
        preferredHoursPerDay: preferredHours,
        knowledgeLevel,
      });
      if (onUpdateNotificationPreferences && timezone !== basePrefs.timezone) {
        await onUpdateNotificationPreferences({ timezone });
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        setSettingsError(err.userMessage);
        if (import.meta.env.DEV) {
          setSettingsDiagnostic(err.toDiagnosticText());
        }
      } else if (err instanceof Error) {
        setSettingsError(err.message);
      } else {
        setSettingsError('Failed to save settings to the database.');
      }
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveNotificationPrefs = async () => {
    setSavedSuccess(false);
    setSettingsError('');
    setIsSavingNotifs(true);
    try {
      if (onUpdateNotificationPreferences) {
        await onUpdateNotificationPreferences({
          inAppEnabled,
          preferredTime,
          timezone,
          inactivityReminders,
          streakReminders,
          weeklyDigest,
          aiInsightAlerts,
        });
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Failed to save notification preferences.'
      );
    } finally {
      setIsSavingNotifs(false);
    }
  };

  const handleEnableBrowserPushClick = async () => {
    if (!onEnableBrowserPush) return;
    setIsUpdatingPush(true);
    setPushNotice('');
    try {
      const result = await onEnableBrowserPush();
      setPushNotice(result.message);
      setPushNoticeTone(result.enabled ? 'success' : result.permission === 'denied' ? 'error' : 'info');
      const refreshedStatus = await getBrowserPushSupportStatus();
      setBrowserPushStatus(refreshedStatus);
    } catch (err) {
      setPushNoticeTone('error');
      setPushNotice(
        err instanceof Error ? err.message : 'Could not enable browser push notifications.'
      );
    } finally {
      setIsUpdatingPush(false);
    }
  };

  const handleDisableBrowserPushClick = async () => {
    if (!onDisableBrowserPush) return;
    setIsUpdatingPush(true);
    setPushNotice('');
    try {
      await onDisableBrowserPush();
      setPushNoticeTone('info');
      setPushNotice('Browser push notifications disabled. In-app reminders remain controlled below.');
      const refreshedStatus = await getBrowserPushSupportStatus();
      setBrowserPushStatus(refreshedStatus);
    } catch (err) {
      setPushNoticeTone('error');
      setPushNotice(
        err instanceof Error ? err.message : 'Could not disable browser push notifications.'
      );
    } finally {
      setIsUpdatingPush(false);
    }
  };

  const handleSendTestPushClick = async () => {
    if (!onSendTestPush) return;
    setIsSendingTestPush(true);
    setPushNotice('');
    try {
      const res = await onSendTestPush();
      setPushNoticeTone('success');
      setPushNotice(
        `Test notification dispatched to ${res.sentCount} browser ${
          res.sentCount === 1 ? 'device' : 'devices'
        }.`
      );
    } catch (err) {
      setPushNoticeTone('error');
      setPushNotice(
        err instanceof Error ? err.message : 'Could not deliver test push notification.'
      );
    } finally {
      setIsSendingTestPush(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(false);
    setPasswordError('');

    if (!currentPass || !newPass) {
      setPasswordError('Please fill in both current and new passwords.');
      return;
    }
    const passwordValidationErr = validatePasswordStrength(newPass);
    if (passwordValidationErr) {
      setPasswordError(passwordValidationErr);
      return;
    }
    if (newPass !== confirmPass) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (!isAuthenticated) {
      setPasswordError('Please sign in with your Skillora account to update your password.');
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const supabase = await getSupabaseClient();
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPass,
      });

      if (verifyError) {
        setPasswordError('Current password is incorrect. Please try again.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPass,
      });

      if (updateError) {
        setPasswordError(formatAuthError(updateError));
        return;
      }

      setPasswordSuccess(true);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (err) {
      setPasswordError(formatAuthError(err));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047]';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {savedSuccess && (
        <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
            <span>Settings successfully saved!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)}>
            <X className="w-4 h-4 text-[#3B6B46]" />
          </button>
        </div>
      )}

      {settingsError && (
        <div className="p-4 rounded-[20px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 font-bold">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C25E4D] shrink-0" />
              <span>{settingsError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSettingsError('');
                setSettingsDiagnostic('');
              }}
            >
              <X className="w-4 h-4 text-[#8D3E32]" />
            </button>
          </div>
          {import.meta.env.DEV && settingsDiagnostic && (
            <p className="text-[11px] font-mono bg-[#FFFCFA]/70 border border-[#F3C5BA] rounded-[10px] px-3 py-1.5 text-[#7A3227] break-all">
              {settingsDiagnostic}
            </p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="pastel-card p-6 sm:p-8 flex items-center gap-4">
        <ClayIconBadge variant="lavender" size="lg">
          <Settings className="w-6 h-6" />
        </ClayIconBadge>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
            Account &amp; Learning Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#8B8295] mt-0.5">
            Personalize your study pace, notifications, and account preferences.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-full w-fit flex-wrap shadow-2xs">
        {[
          { id: 'personal', label: 'Personal Info' },
          { id: 'learning', label: 'Learning Preferences' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'security', label: 'Password & Security' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTabId)}
            className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
              activeTab === tab.id
                ? 'bg-[#A78BCE] text-white shadow-xs'
                : 'text-[#8B8295] hover:text-[#343047]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1 */}
      {activeTab === 'personal' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-base font-extrabold text-[#343047]">
            Personal Information
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Academic Institution
                </label>
                <input
                  type="text"
                  value={user.university}
                  disabled
                  className="w-full px-3.5 py-2.5 text-xs bg-[#F1EAE8]/70 border border-[#EEE6E5] rounded-[14px] text-[#8B8295] cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={inputClass}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex justify-end">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-70"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Personal Info</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2 */}
      {activeTab === 'learning' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-base font-extrabold text-[#343047]">
            Learning Habits &amp; Goals
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Daily Study Goal:{' '}
                <span className="font-mono text-[#8E6EC8]">{preferredHours} Hours / Day</span>
              </label>
              <input
                type="range"
                min={1}
                max={6}
                step={0.5}
                value={preferredHours}
                onChange={(e) => setPreferredHours(parseFloat(e.target.value))}
                className="w-full accent-[#A78BCE]"
              />
              <div className="flex justify-between text-[11px] text-[#8B8295] mt-1">
                <span>1 hr/day (Casual)</span>
                <span>2–3 hrs/day (Recommended)</span>
                <span>6 hrs/day (Intensive)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-2">
                Knowledge Difficulty Baseline
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setKnowledgeLevel(lvl)}
                    className={`p-3 rounded-[16px] border text-center text-xs transition-all ${
                      knowledgeLevel === lvl
                        ? 'bg-[#F0E9FA] border-[#A78BCE] text-[#343047] font-extrabold'
                        : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#8B8295] font-semibold'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex justify-end">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-70"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Learning Preferences</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: Notifications & Web Push */}
      {activeTab === 'notifications' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#343047]">
              Smart Study Reminders &amp; External Notifications
            </h2>
            <p className="text-xs text-[#8B8295] mt-0.5">
              Skillora only counts meaningful study activity (lessons, Knowledge Checks, diagnostics, or active study sessions) and stops reminders as soon as you resume learning.
            </p>
          </div>

          {notificationSchemaMigrationRequired && (
            <div className="p-3.5 rounded-[16px] bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Supabase Notification Tables Pending Migration</p>
                <p className="text-[11px] mt-0.5">
                  Preferences are currently stored locally in this browser. Apply{' '}
                  <code className="font-mono">supabase/migrations/20261118_notifications_and_push.sql</code>{' '}
                  in Supabase to enable cross-device sync and push subscriptions.
                </p>
              </div>
            </div>
          )}

          {/* External Browser Push Notification Box */}
          <div className="p-4 sm:p-5 rounded-[20px] bg-[#F6F1FC] border border-[#E2D6F5] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <ClayIconBadge variant="lavender" size="md">
                  {basePrefs.pushEnabled && pushSubscriptionActive ? (
                    <BellRing className="w-5 h-5" />
                  ) : (
                    <BellOff className="w-5 h-5" />
                  )}
                </ClayIconBadge>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-sm font-extrabold text-[#343047]">
                      Browser Push Notifications (Outside Website)
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        basePrefs.pushEnabled && pushSubscriptionActive
                          ? 'bg-[#DCECD9] text-[#2D4D33]'
                          : browserPushStatus.permission === 'denied'
                          ? 'bg-[#FCEAE5] text-[#8D3E32]'
                          : 'bg-[#FFFCFA] text-[#6F4FA8] border border-[#E2D6F5]'
                      }`}
                    >
                      {basePrefs.pushEnabled && pushSubscriptionActive
                        ? 'Enabled'
                        : browserPushStatus.permission === 'denied'
                        ? 'Blocked in Browser'
                        : browserPushStatus.supported
                        ? 'Not Enabled'
                        : 'Unsupported'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5D5470] mt-1 leading-relaxed">
                    Receive inactivity reminders in your OS/browser notification tray even when Skillora is closed. Permission is only requested when you click Enable below.
                  </p>
                  {!pushConfig.pushConfigured && (
                    <p className="text-[11px] text-[#855C1C] font-semibold mt-1">
                      Server Web Push VAPID keys are not configured on this server yet; in-app reminders remain fully active.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {basePrefs.pushEnabled && pushSubscriptionActive ? (
                  <>
                    {pushConfig.pushConfigured && onSendTestPush && (
                      <button
                        type="button"
                        onClick={handleSendTestPushClick}
                        disabled={isSendingTestPush}
                        className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {isSendingTestPush ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Test Push</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDisableBrowserPushClick}
                      disabled={isUpdatingPush}
                      className="px-3.5 py-2 rounded-[14px] bg-[#FFFCFA] border border-[#E2D6F5] text-xs font-bold text-[#8D3E32] hover:bg-[#FCEAE5] transition-colors disabled:opacity-60"
                    >
                      {isUpdatingPush ? 'Updating...' : 'Disable'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnableBrowserPushClick}
                    disabled={isUpdatingPush || !isAuthenticated || !browserPushStatus.supported}
                    className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isUpdatingPush ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BellRing className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isAuthenticated ? 'Enable Browser Notifications' : 'Sign In to Enable'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {pushNotice && (
              <div
                className={`p-3 rounded-[14px] text-[11px] font-semibold ${
                  pushNoticeTone === 'success'
                    ? 'bg-[#DCECD9] text-[#2D4D33]'
                    : pushNoticeTone === 'error'
                    ? 'bg-[#FCEAE5] text-[#8D3E32]'
                    : 'bg-[#FFFCFA] text-[#5D5470] border border-[#E2D6F5]'
                }`}
              >
                {pushNotice}
              </div>
            )}
          </div>

          {/* Reminder Schedule & Timezone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#343047] mb-1">
                <Clock className="w-3.5 h-3.5 text-[#8E6EC8]" />
                <span>Preferred Reminder Time</span>
              </label>
              <input
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#8B8295] mt-1">
                Scheduled reminders wait until this local time in your timezone.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#343047] mb-1">
                <Globe className="w-3.5 h-3.5 text-[#8E6EC8]" />
                <span>Reminder Timezone</span>
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={inputClass}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#8B8295] mt-1">
                Used for 1-day, 2–3 day, and 7-day inactivity &amp; streak calculations.
              </p>
            </div>
          </div>

          {/* Pause Reminders Controls */}
          <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-display text-xs font-extrabold text-[#343047] flex items-center gap-1.5">
                {isPausedNow ? (
                  <PauseCircle className="w-4 h-4 text-[#C25E4D]" />
                ) : (
                  <PlayCircle className="w-4 h-4 text-[#4B8B59]" />
                )}
                <span>
                  {isPausedNow
                    ? basePrefs.paused
                      ? 'Notifications Paused Indefinitely'
                      : `Notifications Paused Until ${new Date(
                          basePrefs.pausedUntil ?? ''
                        ).toLocaleString()}`
                    : 'Notifications Active'}
                </span>
              </p>
              <p className="text-[11px] text-[#8B8295] mt-0.5">
                Need a break? Pause both browser push and in-app reminders temporarily.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {isPausedNow ? (
                <button
                  type="button"
                  onClick={() => onResumeNotifications?.()}
                  className="clay-button-primary px-3.5 py-1.5 text-[11px] font-bold"
                >
                  Resume Reminders
                </button>
              ) : (
                (['24h', '3d', '7d', 'indefinite'] as const).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => onPauseNotifications?.(dur)}
                    className="px-2.5 py-1.5 rounded-[12px] bg-[#FFFCFA] border border-[#EEE6E5] text-[11px] font-bold text-[#5D5470] hover:bg-[#F0E9FA] hover:text-[#343047] transition-colors"
                  >
                    {dur === 'indefinite' ? 'Pause' : `Pause ${dur}`}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Channel Toggles */}
          <div className="space-y-3">
            {[
              {
                id: 'in_app',
                title: 'In-App Notifications & Fallback',
                desc: 'Show reminders in your Skillora notification bell whenever external push is off or unavailable.',
                checked: inAppEnabled,
                setter: setInAppEnabled,
              },
              {
                id: 'inactivity',
                title: 'Smart Inactivity Nudges (1d / 2–3d / 7d)',
                desc: 'Encouraging check-ins if you have not completed a lesson, quiz, or study session; stops once you resume.',
                checked: inactivityReminders,
                setter: setInactivityReminders,
              },
              {
                id: 'streak',
                title: 'Daily Streak Reminders',
                desc: 'Friendly nudge before your daily study streak resets.',
                checked: streakReminders,
                setter: setStreakReminders,
              },
              {
                id: 'digest',
                title: 'Weekly Progress Digest',
                desc: 'Weekly recap of study hours toward your weekly goal and completed stages.',
                checked: weeklyDigest,
                setter: setWeeklyDigest,
              },
              {
                id: 'ai_alerts',
                title: 'Knowledge Gap & Quiz Insights',
                desc: 'Highlights concepts needing review after assessments and Knowledge Checks.',
                checked: aiInsightAlerts,
                setter: setAiInsightAlerts,
              },
            ].map((item) => (
              <div
                key={item.id}
                onClick={() => item.setter(!item.checked)}
                className="p-4 rounded-[18px] bg-[#FAF6F2]/75 border border-[#EEE6E5] flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F0E9FA]/45 transition-colors"
              >
                <div>
                  <h4 className="font-display text-sm font-extrabold text-[#343047]">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-[#8B8295] mt-0.5">{item.desc}</p>
                </div>
                <div
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    item.checked ? 'bg-[#A78BCE]' : 'bg-[#DFD5E2]'
                  }`}
                >
                  <div
                    className={`bg-[#FFFCFA] w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                      item.checked ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#EEE6E5] flex justify-end">
            <button
              type="button"
              onClick={handleSaveNotificationPrefs}
              disabled={isSavingNotifs}
              className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-70"
            >
              {isSavingNotifs ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Notification Preferences</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4 */}
      {activeTab === 'security' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#343047]">
              Password &amp; Security
            </h2>
            <p className="text-xs text-[#8B8295] mt-0.5">
              Keep your account protected with a strong password.
            </p>
          </div>

          {passwordSuccess && (
            <div className="p-4 rounded-[18px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
              <span>Password successfully updated!</span>
            </div>
          )}

          {passwordError && (
            <div className="p-4 rounded-[18px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C25E4D]" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                New Password (min. 8 characters)
              </label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                placeholder="Min. 8 characters"
                className={inputClass}
              />
              <p className="text-[11px] text-[#8B8295] mt-1">
                {PASSWORD_MIN_LENGTH_ERROR}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-70"
              >
                {isUpdatingPassword ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </form>

          <div className="pt-6 border-t border-[#EEE6E5] flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-display text-sm font-extrabold text-[#343047]">
                Export Learning Data
              </p>
              <p className="text-xs text-[#8B8295]">
                Download a JSON snapshot of your assessment history and roadmap checkpoints.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(user, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'skillora-study-data.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="clay-button-soft px-4 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
