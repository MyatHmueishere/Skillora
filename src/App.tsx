/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import {
  AppView,
  UserProfile,
  Course,
  ResourceItem,
  NotificationItem,
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LessonKnowledgeCheckAttemptRecord,
  LearningSessionRecord,
  NotificationPreferences,
  PushPublicConfig,
  AchievementSummaryPayload,
  IssuedCertificateRecord,
} from './types';
import {
  INITIAL_USER_PROFILE,
  PYTHON_ROADMAP_STAGES,
  ALL_RESOURCES,
  NOTIFICATIONS_DATA,
} from './data/mockData';
import {
  getSupabaseClient,
} from './lib/supabase';
import {
  ensureStudentProfile,
  saveStudentProfile,
  createEmptyUserProfile,
  resetStudentProfileSchemaCache,
  StudentProfileDbError,
} from './lib/studentProfile';
import {
  loadAssessmentAttempts,
  AssessmentDbError,
} from './lib/assessmentAttempts';
import {
  loadLearningRoadmaps,
  activateExistingRoadmap,
  archiveActiveRoadmaps,
  generatePersonalizedRoadmap,
  confirmRoadmapPlan,
  applyLessonCompletionToRoadmapData,
  updateRoadmapLessonCompletion,
  computeRoadmapStats,
  RoadmapDbError,
  RoadmapGenerationError,
} from './lib/learningRoadmaps';
import { clearLessonContentCache } from './lib/lessonContent';
import {
  loadKnowledgeCheckHistory,
  KnowledgeCheckClientError,
} from './lib/knowledgeChecks';
import {
  loadLearningSessions,
  upsertLearningSession,
  UpsertLearningSessionInput,
  LearningSessionDbError,
} from './lib/learningSessions';
import { computeLearningActivityMetrics } from './lib/progressAnalytics';
import {
  buildDashboardJourneySummary,
  doesRoadmapMatchDirection,
  findBestMatchingRoadmapForDirection,
} from './lib/dashboardJourney';
import {
  createDefaultNotificationPreferences,
  disableBrowserPushNotifications,
  enableBrowserPushNotifications,
  fetchPushPublicConfig,
  loadNotificationPreferences,
  pauseNotificationsForDuration,
  recordMeaningfulActivityForNotifications,
  resumePausedNotifications,
  saveNotificationPreferences,
  sendTestPushNotification,
} from './lib/notifications';
import {
  buildStudentNotifications,
  clearNotificationsForUser,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
} from './lib/studentNotifications';

// Layout & Common Components
import { Sidebar } from './components/common/Sidebar';
import { TopNavbar } from './components/common/TopNavbar';
import { LessonModal } from './components/common/LessonModal';
import { Logo } from './components/common/Logo';

// Views
import { LandingPage } from './components/landing/LandingPage';
import { AuthModal, AuthMode } from './components/auth/AuthModal';
import { OnboardingCompleteOptions } from './components/auth/OnboardingFlow';
import { DashboardView } from './components/dashboard/DashboardView';
import { AssessmentView } from './components/assessment/AssessmentView';
import { RoadmapView } from './components/roadmap/RoadmapView';
import { LessonLearningView } from './components/roadmap/LessonLearningView';
import { ResourcesView } from './components/resources/ResourcesView';
import {
  AssistantView,
  EMPTY_ASSISTANT_UI_STATE,
  PersistedAssistantUiState,
} from './components/assistant/AssistantView';
import { clearAllAssistantCaches } from './lib/assistantClient';
import { clearExploreResourcesCache } from './lib/exploreResources';
import {
  buildComputedAchievementsFallback,
  fetchAchievementsSummary,
  syncAchievementsSummary,
  AchievementsClientError,
} from './lib/achievements';
import { AchievementsTabId } from './components/achievements/AchievementsSection';
import { ProgressView, ProgressTabId } from './components/progress/ProgressView';
import { AchievementsView } from './components/achievements/AchievementsView';
import { CertificateVerificationView } from './components/achievements/CertificateVerificationView';
import { ProfileView } from './components/profile/ProfileView';
import { SettingsView, SettingsTabId } from './components/profile/SettingsView';
import { HelpView } from './components/help/HelpView';

const ROUTE_STORAGE_KEY = 'skillora_route_state_v1';
const VALID_APP_VIEWS: ReadonlySet<AppView> = new Set<AppView>([
  'landing',
  'dashboard',
  'assessment',
  'roadmap',
  'resources',
  'assistant',
  'progress',
  'achievements',
  'verify',
  'profile',
  'settings',
  'help',
]);

interface PersistedRouteState {
  view: AppView;
  userId: string | null;
  selectedCourseId: string | null;
  activeStudyLesson: { roadmapId?: string; stageId: string; lessonId: string } | null;
  updatedAt: number;
}

function isSupabaseAuthHash(hash: string): boolean {
  return /(access_token=|refresh_token=|token_hash=|error_description=|type=recovery|type=signup|type=email|type=magiclink)/i.test(
    hash
  );
}

function parseVerifyTargetFromLocation(
  hash: string,
  search: string
): { isVerify: boolean; certificateNumber: string } {
  const searchParams = new URLSearchParams(search);
  const queryCert = (searchParams.get('verify') ?? '').trim().toUpperCase();
  if (queryCert) {
    return { isVerify: true, certificateNumber: queryCert };
  }
  if (!hash || isSupabaseAuthHash(hash)) {
    return { isVerify: false, certificateNumber: '' };
  }
  const cleaned = hash.replace(/^#\/?/, '').trim();
  const lower = cleaned.toLowerCase();
  if (lower === 'verify') {
    return { isVerify: true, certificateNumber: '' };
  }
  if (lower.startsWith('verify/')) {
    const rawCert = decodeURIComponent(cleaned.slice('verify/'.length)).trim().toUpperCase();
    return { isVerify: true, certificateNumber: rawCert };
  }
  return { isVerify: false, certificateNumber: '' };
}

function parseAppViewFromHash(hash: string): AppView | null {
  if (!hash || isSupabaseAuthHash(hash)) return null;
  const cleaned = hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (cleaned === 'verify' || cleaned.startsWith('verify/')) {
    return 'verify';
  }
  if (VALID_APP_VIEWS.has(cleaned as AppView)) {
    return cleaned as AppView;
  }
  return null;
}

function readPersistedRouteState(): PersistedRouteState | null {
  try {
    const raw = window.localStorage.getItem(ROUTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRouteState>;
    if (!parsed.view || !VALID_APP_VIEWS.has(parsed.view)) return null;
    return {
      view: parsed.view,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      selectedCourseId:
        typeof parsed.selectedCourseId === 'string' ? parsed.selectedCourseId : null,
      activeStudyLesson:
        parsed.activeStudyLesson &&
        typeof parsed.activeStudyLesson.stageId === 'string' &&
        typeof parsed.activeStudyLesson.lessonId === 'string'
          ? {
              ...(typeof parsed.activeStudyLesson.roadmapId === 'string'
                ? { roadmapId: parsed.activeStudyLesson.roadmapId }
                : {}),
              stageId: parsed.activeStudyLesson.stageId,
              lessonId: parsed.activeStudyLesson.lessonId,
            }
          : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writePersistedRouteState(state: PersistedRouteState): void {
  try {
    window.localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function clearPersistedRouteState(): void {
  try {
    window.localStorage.removeItem(ROUTE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export default function App() {
  // Navigation & View state
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const currentViewRef = useRef<AppView>('landing');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Supabase Auth session state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authErrorNotice, setAuthErrorNotice] = useState('');
  const [profileLoadError, setProfileLoadError] = useState('');
  const [authInitialEmail, setAuthInitialEmail] = useState('');
  const [authInitialFullName, setAuthInitialFullName] = useState('');

  // Core application state
  const [user, setUser] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [stages, setStages] = useState(PYTHON_ROADMAP_STAGES);
  const [resources, setResources] = useState<ResourceItem[]>(ALL_RESOURCES);
  const [notifications, setNotifications] = useState<NotificationItem[]>(NOTIFICATIONS_DATA);
  const [assessmentAttempts, setAssessmentAttempts] = useState<AssessmentAttemptRecord[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState('');
  const [knowledgeCheckAttempts, setKnowledgeCheckAttempts] = useState<
    LessonKnowledgeCheckAttemptRecord[]
  >([]);
  const [knowledgeChecksLoading, setKnowledgeChecksLoading] = useState(false);
  const [knowledgeChecksError, setKnowledgeChecksError] = useState('');
  const [learningSessions, setLearningSessions] = useState<LearningSessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');

  // Saved Supabase personalized roadmaps state
  const [activeRoadmap, setActiveRoadmap] = useState<LearningRoadmapRecord | null>(null);
  const [archivedRoadmaps, setArchivedRoadmaps] = useState<LearningRoadmapRecord[]>([]);
  const [roadmapsLoading, setRoadmapsLoading] = useState(false);
  const [roadmapsError, setRoadmapsError] = useState('');
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [isConfirmingRoadmap, setIsConfirmingRoadmap] = useState(false);
  const [roadmapGenerationError, setRoadmapGenerationError] = useState('');
  const [roadmapSaveError, setRoadmapSaveError] = useState('');
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeStudyLesson, setActiveStudyLesson] = useState<{
    roadmapId?: string;
    stageId: string;
    lessonId: string;
  } | null>(null);
  const [notifRevision, setNotifRevision] = useState(0);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('personal');
  const [progressInitialTab, setProgressInitialTab] = useState<ProgressTabId>('overview');
  const [achievementsInitialTab, setAchievementsInitialTab] =
    useState<AchievementsTabId>('overview');
  const [verifyCertificateNumber, setVerifyCertificateNumber] = useState<string>(() =>
    parseVerifyTargetFromLocation(window.location.hash, window.location.search).certificateNumber
  );
  const previousNonVerifyViewRef = useRef<AppView>('landing');
  const [achievementsSummary, setAchievementsSummary] =
    useState<AchievementSummaryPayload | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [achievementsError, setAchievementsError] = useState('');
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(() =>
    createDefaultNotificationPreferences()
  );
  const [pushConfig, setPushConfig] = useState<PushPublicConfig>({
    pushConfigured: false,
    vapidPublicKey: '',
    schedulerConfigured: false,
    serviceRoleConfigured: false,
  });
  const [pushSubscriptionActive, setPushSubscriptionActive] = useState(false);
  const [notifSchemaMigrationRequired, setNotifSchemaMigrationRequired] = useState(false);
  const roadmapGenLockRef = useRef(false);
  const profileUpdateInFlightRef = useRef(false);
  const inFlightLessonSavesRef = useRef<Set<string>>(new Set());
  const activeAuthUserIdRef = useRef<string | null>(null);
  const onboardingDismissedUserRef = useRef<string | null>(null);

  // Modals & Contextual triggers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>('login');
  const [activeCourseModal, setActiveCourseModal] = useState<Course | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');
  const [assistantUiState, setAssistantUiState] =
    useState<PersistedAssistantUiState>(EMPTY_ASSISTANT_UI_STATE);
  const [globalSearch, setGlobalSearch] = useState('');

  const authModalOpenRef = useRef(authModalOpen);
  const authInitialModeRef = useRef(authInitialMode);

  useEffect(() => {
    currentViewRef.current = currentView;
    if (currentView !== 'verify') {
      previousNonVerifyViewRef.current = currentView;
    }
  }, [currentView]);

  useEffect(() => {
    authModalOpenRef.current = authModalOpen;
  }, [authModalOpen]);

  useEffect(() => {
    authInitialModeRef.current = authInitialMode;
  }, [authInitialMode]);

  // Keep active route and study-lesson selection persisted across browser refreshes & tab switches
  useEffect(() => {
    if (authLoading) return;

    if (currentView === 'landing') {
      clearPersistedRouteState();
      if (window.location.hash && !isSupabaseAuthHash(window.location.hash)) {
        window.history.replaceState(
          null,
          document.title,
          `${window.location.pathname}${window.location.search}`
        );
      }
      return;
    }

    if (currentView !== 'verify') {
      writePersistedRouteState({
        view: currentView,
        userId: session?.user?.id ?? null,
        selectedCourseId,
        activeStudyLesson,
        updatedAt: Date.now(),
      });
    }

    if (!isSupabaseAuthHash(window.location.hash)) {
      const targetHash =
        currentView === 'verify'
          ? verifyCertificateNumber
            ? `#/verify/${encodeURIComponent(verifyCertificateNumber)}`
            : '#/verify'
          : `#/${currentView}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(
          null,
          document.title,
          `${window.location.pathname}${window.location.search}${targetHash}`
        );
      }
    }
  }, [
    authLoading,
    currentView,
    verifyCertificateNumber,
    session?.user?.id,
    selectedCourseId,
    activeStudyLesson,
  ]);

  // Sync browser hash navigation (back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      if (authLoading) return;
      const verifyTarget = parseVerifyTargetFromLocation(
        window.location.hash,
        window.location.search
      );
      if (verifyTarget.isVerify) {
        setVerifyCertificateNumber(verifyTarget.certificateNumber);
        setCurrentView('verify');
        return;
      }
      const hashView = parseAppViewFromHash(window.location.hash);
      if (!hashView) return;
      if (hashView === 'landing' && session?.user) {
        return;
      }
      if (hashView !== currentViewRef.current) {
        setCurrentView(hashView);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [authLoading, session?.user]);

  // Initialize Supabase Auth session & listener
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const syncProfileFromDatabase = async (
      supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
      authUser: Session['user']
    ): Promise<UserProfile | null> => {
      try {
        const result = await ensureStudentProfile(supabase, authUser);
        if (!active) return null;

        setProfileLoadError('');
        setUser((prev) => ({
          ...result.profile,
          overallProgress: prev.overallProgress,
          completedCoursesCount: prev.completedCoursesCount,
        }));
        return result.profile;
      } catch (err) {
        if (!active) return null;
        // Never overwrite with fake demo data on failure
        setUser(createEmptyUserProfile(authUser));
        if (err instanceof StudentProfileDbError) {
          setProfileLoadError(
            import.meta.env.DEV
              ? `${err.userMessage} (${err.toDiagnosticText()})`
              : err.userMessage
          );
        } else if (err instanceof Error) {
          setProfileLoadError(err.message);
        } else {
          setProfileLoadError('Failed to load your student profile from Supabase.');
        }
        return null;
      }
    };

    const syncAttemptsFromDatabase = async (
      supabase: Awaited<ReturnType<typeof getSupabaseClient>>
    ) => {
      if (!active) return;
      setAttemptsLoading(true);
      setAttemptsError('');
      try {
        const rows = await loadAssessmentAttempts(supabase);
        if (!active) return;
        setAssessmentAttempts(rows);
      } catch (err) {
        if (!active) return;
        if (err instanceof AssessmentDbError) {
          setAttemptsError(
            import.meta.env.DEV
              ? `${err.userMessage} (${err.toDiagnosticText()})`
              : err.userMessage
          );
        } else if (err instanceof Error) {
          setAttemptsError(err.message);
        } else {
          setAttemptsError('Failed to load assessment history from Supabase.');
        }
      } finally {
        if (active) {
          setAttemptsLoading(false);
        }
      }
    };

    const syncRoadmapsFromDatabase = async (
      supabase: Awaited<ReturnType<typeof getSupabaseClient>>
    ) => {
      if (!active) return;
      setRoadmapsLoading(true);
      setRoadmapsError('');
      try {
        const result = await loadLearningRoadmaps(supabase);
        if (!active) return;
        setActiveRoadmap(result.activeRoadmap);
        setArchivedRoadmaps(result.archivedRoadmaps);
        const stats = computeRoadmapStats(result.activeRoadmap);
        setUser((prev) => ({
          ...prev,
          overallProgress: stats.progressPercent,
          completedCoursesCount: stats.completedStages,
        }));
      } catch (err) {
        if (!active) return;
        if (err instanceof RoadmapDbError) {
          setRoadmapsError(
            import.meta.env.DEV
              ? `${err.userMessage} (${err.toDiagnosticText()})`
              : err.userMessage
          );
        } else if (err instanceof Error) {
          setRoadmapsError(err.message);
        } else {
          setRoadmapsError('Failed to load your saved roadmaps from Supabase.');
        }
      } finally {
        if (active) {
          setRoadmapsLoading(false);
        }
      }
    };

    const syncKnowledgeChecksFromDatabase = async () => {
      if (!active) return;
      setKnowledgeChecksLoading(true);
      setKnowledgeChecksError('');
      try {
        const result = await loadKnowledgeCheckHistory();
        if (!active) return;
        setKnowledgeCheckAttempts(result.attempts);
      } catch (err) {
        if (!active) return;
        if (err instanceof KnowledgeCheckClientError) {
          setKnowledgeChecksError(err.message);
        } else if (err instanceof Error) {
          setKnowledgeChecksError(err.message);
        } else {
          setKnowledgeChecksError('Failed to load Knowledge Check history.');
        }
      } finally {
        if (active) {
          setKnowledgeChecksLoading(false);
        }
      }
    };

    const syncLearningSessionsFromDatabase = async (
      supabase: Awaited<ReturnType<typeof getSupabaseClient>>
    ) => {
      if (!active) return;
      setSessionsLoading(true);
      setSessionsError('');
      try {
        const result = await loadLearningSessions(supabase);
        if (!active) return;
        setLearningSessions(result.sessions);
      } catch (err) {
        if (!active) return;
        if (err instanceof LearningSessionDbError) {
          setSessionsError(err.userMessage);
        } else if (err instanceof Error) {
          setSessionsError(err.message);
        } else {
          setSessionsError('Failed to load study session history.');
        }
      } finally {
        if (active) {
          setSessionsLoading(false);
        }
      }
    };

    const syncNotificationsFromDatabase = async (targetUserId: string) => {
      if (!active) return;
      try {
        const [configResult, prefsResult] = await Promise.all([
          fetchPushPublicConfig(),
          loadNotificationPreferences(targetUserId),
        ]);
        if (!active || activeAuthUserIdRef.current !== targetUserId) return;
        setPushConfig(configResult);
        setNotificationPrefs(prefsResult.preferences);
        setPushSubscriptionActive(prefsResult.activeSubscriptionCount > 0);
        setNotifSchemaMigrationRequired(prefsResult.schemaMigrationRequired);
      } catch {
        // Non-blocking notification state sync
      }
    };

    const syncAchievementsOnSession = async (targetUserId: string) => {
      if (!active) return;
      setAchievementsLoading(true);
      setAchievementsError('');
      try {
        const summary = await fetchAchievementsSummary();
        if (!active || activeAuthUserIdRef.current !== targetUserId) return;
        setAchievementsSummary(summary);
      } catch (err) {
        if (!active || activeAuthUserIdRef.current !== targetUserId) return;
        if (err instanceof AchievementsClientError) {
          setAchievementsError(err.message);
        } else if (err instanceof Error) {
          setAchievementsError(err.message);
        }
      } finally {
        if (active) {
          setAchievementsLoading(false);
        }
      }
    };

    const initAuth = async () => {
      // Check URL hash/search BEFORE Supabase client consumes callback tokens
      const initialHash = window.location.hash;
      const hashParams = new URLSearchParams(initialHash.replace(/^#/, ''));
      const searchParams = new URLSearchParams(window.location.search);
      const callbackError =
        hashParams.get('error_description') || searchParams.get('error_description');
      const callbackType = hashParams.get('type') || searchParams.get('type');
      const isRecoveryRedirect = callbackType === 'recovery';
      const hasAuthCallbackParams =
        hashParams.has('access_token') ||
        hashParams.has('refresh_token') ||
        searchParams.has('code') ||
        searchParams.has('token_hash') ||
        Boolean(callbackType);
      const isVerificationRedirect =
        hasAuthCallbackParams && !isRecoveryRedirect && !callbackError;

      const initialVerify = parseVerifyTargetFromLocation(initialHash, window.location.search);
      const initialHashView = parseAppViewFromHash(initialHash);
      const savedRoute = readPersistedRouteState();

      if (callbackError) {
        setAuthErrorNotice(callbackError);
        setAuthInitialMode('login');
        setAuthModalOpen(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      try {
        const supabase = await getSupabaseClient();
        if (!active) return;

        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (existingSession?.user) {
          activeAuthUserIdRef.current = existingSession.user.id;
          setSession(existingSession);
          setUser(createEmptyUserProfile(existingSession.user));
          const [syncedProfile] = await Promise.all([
            syncProfileFromDatabase(supabase, existingSession.user),
            syncAttemptsFromDatabase(supabase),
            syncRoadmapsFromDatabase(supabase),
            syncKnowledgeChecksFromDatabase(),
            syncLearningSessionsFromDatabase(supabase),
            syncNotificationsFromDatabase(existingSession.user.id),
            syncAchievementsOnSession(existingSession.user.id),
          ]);
          if (!active) return;

          if (hasAuthCallbackParams) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          if (isRecoveryRedirect) {
            setCurrentView('dashboard');
            setAuthInitialMode('reset_password');
            setAuthModalOpen(true);
          } else if (isVerificationRedirect) {
            setAuthErrorNotice('');
            setSelectedCourseId(null);
            setActiveStudyLesson(null);
            setCurrentView('dashboard');
            if (syncedProfile && !syncedProfile.onboardingCompleted) {
              setAuthInitialMode('onboarding');
              setAuthModalOpen(true);
            } else {
              setAuthModalOpen(false);
            }
          } else if (initialVerify.isVerify) {
            setVerifyCertificateNumber(initialVerify.certificateNumber);
            setCurrentView('verify');
          } else {
            const matchingSavedRoute =
              savedRoute && savedRoute.userId === existingSession.user.id ? savedRoute : null;
            if (savedRoute && savedRoute.userId && savedRoute.userId !== existingSession.user.id) {
              clearPersistedRouteState();
            }
            const restoredView: AppView =
              initialHashView && initialHashView !== 'landing'
                ? initialHashView
                : matchingSavedRoute && matchingSavedRoute.view !== 'landing'
                  ? matchingSavedRoute.view
                  : 'dashboard';

            if (restoredView === 'roadmap' && matchingSavedRoute) {
              setSelectedCourseId(matchingSavedRoute.selectedCourseId);
              setActiveStudyLesson(matchingSavedRoute.activeStudyLesson);
            }
            setCurrentView(restoredView);
            if (
              syncedProfile &&
              !syncedProfile.onboardingCompleted &&
              onboardingDismissedUserRef.current !== existingSession.user.id
            ) {
              setAuthInitialMode('onboarding');
              setAuthModalOpen(true);
            }
          }
        } else if (initialVerify.isVerify) {
          setVerifyCertificateNumber(initialVerify.certificateNumber);
          setCurrentView('verify');
        } else {
          const guestSavedRoute =
            savedRoute && savedRoute.userId === null ? savedRoute : null;
          if (savedRoute && savedRoute.userId !== null) {
            clearPersistedRouteState();
          }
          const guestRestoredView: AppView =
            initialHashView && initialHashView !== 'landing'
              ? initialHashView
              : guestSavedRoute && guestSavedRoute.view !== 'landing'
                ? guestSavedRoute.view
                : 'landing';
          if (guestRestoredView !== 'landing') {
            setCurrentView(guestRestoredView);
          }
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (!active) return;

          if (event === 'PASSWORD_RECOVERY') {
            setSession(nextSession);
            if (nextSession?.user) {
              activeAuthUserIdRef.current = nextSession.user.id;
              setUser(createEmptyUserProfile(nextSession.user));
              void syncProfileFromDatabase(supabase, nextSession.user);
              void syncAttemptsFromDatabase(supabase);
              void syncRoadmapsFromDatabase(supabase);
              void syncKnowledgeChecksFromDatabase();
              void syncLearningSessionsFromDatabase(supabase);
            }
            setCurrentView('dashboard');
            setAuthErrorNotice('');
            setAuthInitialMode('reset_password');
            setAuthModalOpen(true);
            return;
          }

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            setSession(nextSession);
            if (nextSession?.user) {
              const prevUserId = activeAuthUserIdRef.current;
              const wasSignedOut = prevUserId === null;
              const userChanged = prevUserId !== null && prevUserId !== nextSession.user.id;
              activeAuthUserIdRef.current = nextSession.user.id;

              if (userChanged) {
                clearPersistedRouteState();
                resetStudentProfileSchemaCache();
                clearLessonContentCache();
                clearAllAssistantCaches();
                clearExploreResourcesCache();
                setAssistantUiState(EMPTY_ASSISTANT_UI_STATE);
                setAssistantPrompt('');
                setAssessmentAttempts([]);
                setKnowledgeCheckAttempts([]);
                setKnowledgeChecksError('');
                setLearningSessions([]);
                setSessionsError('');
                setActiveRoadmap(null);
                setArchivedRoadmaps([]);
                setSelectedCourseId(null);
                setActiveStudyLesson(null);
                setNotificationPrefs(createDefaultNotificationPreferences());
                setPushSubscriptionActive(false);
                setNotifSchemaMigrationRequired(false);
                setAchievementsSummary(null);
                setAchievementsError('');
              }

              if (event === 'SIGNED_IN') {
                // Supabase re-emits SIGNED_IN when browser tabs regain focus or sessions revalidate.
                // Never redirect away from the active page or wipe loaded state when the same user is already active.
                if (!wasSignedOut && !userChanged) {
                  return;
                }

                // If the user verified email in another tab while verify_email/signup/login modal was open,
                // close the modal and redirect cleanly to the Dashboard.
                if (
                  authModalOpenRef.current &&
                  authInitialModeRef.current !== 'reset_password' &&
                  authInitialModeRef.current !== 'onboarding'
                ) {
                  setAuthErrorNotice('');
                  setAuthModalOpen(false);
                }

                if (
                  currentViewRef.current === 'landing' ||
                  userChanged ||
                  (authModalOpenRef.current && authInitialModeRef.current !== 'onboarding')
                ) {
                  setSelectedCourseId(null);
                  setActiveStudyLesson(null);
                  setCurrentView('dashboard');
                }
                void syncAttemptsFromDatabase(supabase);
                void syncRoadmapsFromDatabase(supabase);
                void syncKnowledgeChecksFromDatabase();
                void syncLearningSessionsFromDatabase(supabase);
                void syncNotificationsFromDatabase(nextSession.user.id);
                void syncAchievementsOnSession(nextSession.user.id);
                setUser(createEmptyUserProfile(nextSession.user));
                void syncProfileFromDatabase(supabase, nextSession.user).then((loadedProfile) => {
                  if (!active || !loadedProfile) return;
                  if (
                    !loadedProfile.onboardingCompleted &&
                    !authModalOpenRef.current &&
                    onboardingDismissedUserRef.current !== nextSession.user.id
                  ) {
                    setAuthInitialMode('onboarding');
                    setAuthModalOpen(true);
                  }
                });
              } else if (!profileUpdateInFlightRef.current) {
                void syncProfileFromDatabase(supabase, nextSession.user);
              }
            }
            return;
          }

          if (event === 'SIGNED_OUT') {
            activeAuthUserIdRef.current = null;
            clearPersistedRouteState();
            resetStudentProfileSchemaCache();
            clearLessonContentCache();
            clearAllAssistantCaches();
            clearExploreResourcesCache();
            setAssistantUiState(EMPTY_ASSISTANT_UI_STATE);
            setAssistantPrompt('');
            setSession(null);
            setProfileLoadError('');
            setAssessmentAttempts([]);
            setAttemptsError('');
            setKnowledgeCheckAttempts([]);
            setKnowledgeChecksError('');
            setLearningSessions([]);
            setSessionsError('');
            setActiveRoadmap(null);
            setArchivedRoadmaps([]);
            setSelectedCourseId(null);
            setActiveStudyLesson(null);
            setRoadmapsError('');
            setRoadmapGenerationError('');
            setRoadmapSaveError('');
            setNotificationPrefs(createDefaultNotificationPreferences());
            setPushSubscriptionActive(false);
            setNotifSchemaMigrationRequired(false);
            setAchievementsSummary(null);
            setAchievementsError('');
            setUser(INITIAL_USER_PROFILE);
            setCurrentView('landing');
          }
        });

        unsubscribe = () => subscription.unsubscribe();
      } catch {
        // If Supabase config is missing/unavailable, keep landing page accessible
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handle roadmap lesson toggle & recalculate progress
  const handleToggleLesson = (stageId: number, lessonId: string) => {
    setStages((prevStages) => {
      const updated = prevStages.map((stage) => {
        if (stage.id !== stageId) return stage;
        const newLessons = stage.lessons.map((lesson) => {
          if (lesson.id === lessonId) {
            return { ...lesson, completed: !lesson.completed };
          }
          return lesson;
        });

        // Check if all lessons are completed
        const allCompleted = newLessons.every((l) => l.completed);
        const someCompleted = newLessons.some((l) => l.completed);

        return {
          ...stage,
          lessons: newLessons,
          status: allCompleted ? ('completed' as const) : someCompleted ? ('in_progress' as const) : ('upcoming' as const),
        };
      });

      // Recalculate total progress
      const totalUnits = updated.reduce((acc, s) => acc + s.lessons.length, 0);
      const completedUnits = updated.reduce(
        (acc, s) => acc + s.lessons.filter((l) => l.completed).length,
        0
      );
      const newProgress = Math.round((completedUnits / (totalUnits || 1)) * 100);

      setUser((prevUser) => ({
        ...prevUser,
        overallProgress: newProgress,
      }));

      return updated;
    });
  };

  // Toggle bookmarking a resource
  const handleToggleSaveResource = (id: string) => {
    setResources((prev) =>
      prev.map((r) => (r.id === id ? { ...r, saved: !r.saved } : r))
    );
  };

  // Keep TopNavbar streak and total hours synchronized with meaningful activity & tracked sessions
  const liveActivityMetrics = computeLearningActivityMetrics(learningSessions);
  const liveJourneySummary = buildDashboardJourneySummary({
    user,
    activeRoadmap,
    archivedRoadmaps,
    learningSessions,
    knowledgeCheckAttempts,
    assessmentAttempts,
    timeZone: notificationPrefs.timezone,
  });

  useEffect(() => {
    if (!session?.user?.id) return;
    const liveHours = Number((liveActivityMetrics.totalStudyMinutes / 60).toFixed(1));
    const liveStreak = liveJourneySummary.currentStreakDays;
    setUser((prev) => {
      if (prev.currentStreak === liveStreak && prev.totalHours === liveHours) {
        return prev;
      }
      return {
        ...prev,
        currentStreak: liveStreak,
        totalHours: liveHours,
      };
    });
  }, [
    session?.user?.id,
    liveJourneySummary.currentStreakDays,
    liveActivityMetrics.totalStudyMinutes,
  ]);

  const activeNotifications: NotificationItem[] = (() => {
    void notifRevision;
    if (!session?.user?.id) return notifications;
    return buildStudentNotifications({
      userId: session.user.id,
      user,
      activeRoadmap,
      archivedRoadmaps,
      learningSessions,
      assessmentAttempts,
      knowledgeCheckAttempts,
      activityMetrics: liveActivityMetrics,
      notificationPreferences: notificationPrefs,
    });
  })();

  const refreshServerAchievements = async () => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    if (!uid) return;
    setAchievementsLoading(true);
    setAchievementsError('');
    try {
      const summary = await syncAchievementsSummary(notificationPrefs.timezone);
      if (activeAuthUserIdRef.current !== uid) return;
      setAchievementsSummary(summary);
    } catch (err) {
      if (err instanceof AchievementsClientError) {
        setAchievementsError(err.message);
      } else if (err instanceof Error) {
        setAchievementsError(err.message);
      }
    } finally {
      setAchievementsLoading(false);
    }
  };

  const handleCertificateUpdated = (updatedCertificate: IssuedCertificateRecord) => {
    setAchievementsSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        certificates: prev.certificates.map((cert) =>
          cert.id === updatedCertificate.id ||
          cert.certificateNumber === updatedCertificate.certificateNumber
            ? updatedCertificate
            : cert
        ),
      };
    });
  };

  const openVerificationView = (certificateNumber?: string) => {
    if (currentViewRef.current !== 'verify') {
      previousNonVerifyViewRef.current = currentViewRef.current;
    }
    setVerifyCertificateNumber((certificateNumber ?? '').trim().toUpperCase());
    setCurrentView('verify');
  };

  const effectiveAchievementsSummary: AchievementSummaryPayload =
    achievementsSummary ??
    buildComputedAchievementsFallback({
      authenticated: Boolean(session),
      userId: session?.user?.id,
      studentName: user.name,
      activeDirection: user.primaryDirection || user.careerGoal,
      roadmaps: [activeRoadmap, ...archivedRoadmaps].filter(
        (r): r is LearningRoadmapRecord => Boolean(r)
      ),
      knowledgeCheckAttempts,
      learningSessions,
      assessmentAttempts,
      timeZone: notificationPrefs.timezone,
    });

  const notifyMeaningfulActivity = (timestampIso: string) => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    if (!uid) return;
    void recordMeaningfulActivityForNotifications(uid, timestampIso, notificationPrefs).then(
      (updated) => {
        if (updated) {
          setNotificationPrefs(updated);
          setNotifRevision((r) => r + 1);
        }
      }
    );
  };

  // Notification handlers
  const handleMarkNotificationRead = (notificationId: string) => {
    if (session?.user?.id) {
      markNotificationReadForUser(session.user.id, notificationId);
      setNotifRevision((r) => r + 1);
      return;
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllNotificationsRead = () => {
    if (session?.user?.id) {
      markAllNotificationsReadForUser(
        session.user.id,
        activeNotifications.map((n) => n.id)
      );
      setNotifRevision((r) => r + 1);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = () => {
    if (session?.user?.id) {
      clearNotificationsForUser(
        session.user.id,
        activeNotifications.map((n) => n.id)
      );
      setNotifRevision((r) => r + 1);
      return;
    }
    setNotifications([]);
  };

  const handleUpdateNotificationPrefs = async (
    updates: Partial<NotificationPreferences>
  ) => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    const saved = await saveNotificationPreferences(uid, updates, notificationPrefs);
    setNotificationPrefs(saved.preferences);
    setNotifSchemaMigrationRequired(saved.schemaMigrationRequired);
    setNotifRevision((r) => r + 1);
  };

  const handleEnableBrowserPush = async () => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    const result = await enableBrowserPushNotifications({
      userId: uid,
      currentPreferences: notificationPrefs,
    });
    setNotificationPrefs(result.preferences);
    setPushSubscriptionActive(result.subscribed);
    setNotifSchemaMigrationRequired(result.schemaMigrationRequired);
    const refreshedConfig = await fetchPushPublicConfig();
    setPushConfig(refreshedConfig);
    return result;
  };

  const handleDisableBrowserPush = async () => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    const result = await disableBrowserPushNotifications({
      userId: uid,
      currentPreferences: notificationPrefs,
    });
    setNotificationPrefs(result.preferences);
    setPushSubscriptionActive(false);
    setNotifSchemaMigrationRequired(result.schemaMigrationRequired);
  };

  const handlePauseNotifications = async (
    duration: '24h' | '3d' | '7d' | 'indefinite'
  ) => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    const result = await pauseNotificationsForDuration({
      userId: uid,
      currentPreferences: notificationPrefs,
      duration,
    });
    setNotificationPrefs(result.preferences);
    setNotifSchemaMigrationRequired(result.schemaMigrationRequired);
    setNotifRevision((r) => r + 1);
  };

  const handleResumeNotifications = async () => {
    const uid = session?.user?.id ?? activeAuthUserIdRef.current;
    const result = await resumePausedNotifications({
      userId: uid,
      currentPreferences: notificationPrefs,
    });
    setNotificationPrefs(result.preferences);
    setNotifSchemaMigrationRequired(result.schemaMigrationRequired);
    setNotifRevision((r) => r + 1);
  };

  const handleSwitchToPreservedRoadmap = async (roadmapId: string) => {
    if (!session) return;
    profileUpdateInFlightRef.current = true;
    try {
      const supabase = await getSupabaseClient();
      const reloaded = await activateExistingRoadmap(supabase, roadmapId);
      setActiveRoadmap(reloaded.activeRoadmap);
      setArchivedRoadmaps(reloaded.archivedRoadmaps);
      setSelectedCourseId(null);
      setActiveStudyLesson(null);
      setRoadmapGenerationError('');

      const targetDir = (
        reloaded.activeRoadmap?.roadmapData?.primaryDirection ||
        reloaded.activeRoadmap?.careerGoal ||
        ''
      ).trim();

      let syncedProfile: UserProfile | null = null;
      if (
        targetDir &&
        targetDir.toLowerCase() !== (user.primaryDirection ?? '').trim().toLowerCase()
      ) {
        try {
          syncedProfile = await saveStudentProfile(supabase, {
            primaryDirection: targetDir,
            careerGoal: targetDir,
          });
        } catch {
          // Non-blocking; roadmap activation already succeeded in Supabase
        }
      }

      const stats = computeRoadmapStats(reloaded.activeRoadmap);
      setUser((prev) => ({
        ...(syncedProfile ?? prev),
        overallProgress: stats.progressPercent,
        completedCoursesCount: stats.completedStages,
      }));
      clearExploreResourcesCache(session.user.id);
      void refreshServerAchievements();
    } finally {
      profileUpdateInFlightRef.current = false;
    }
  };

  // Update user profile or settings directly in Supabase public.student_profiles & synchronize Learning Path
  const handleUpdateUser = async (updatedData: Partial<UserProfile>): Promise<void> => {
    profileUpdateInFlightRef.current = true;
    try {
      const supabase = await getSupabaseClient();
      const prevDir = (user.primaryDirection ?? '').trim();

      const mergedInput = {
        name: updatedData.name ?? user.name,
        email: updatedData.email ?? user.email,
        ...(updatedData.avatarUrl !== undefined ? { avatarUrl: updatedData.avatarUrl } : {}),
        educationLevel: updatedData.educationLevel ?? user.educationLevel,
        university: updatedData.university ?? user.university,
        fieldOfStudy: updatedData.fieldOfStudy ?? user.fieldOfStudy,
        primaryDirection:
          updatedData.primaryDirection !== undefined
            ? updatedData.primaryDirection
            : user.primaryDirection,
        careerGoal: updatedData.careerGoal ?? user.careerGoal,
        preferredHoursPerDay: updatedData.preferredHoursPerDay ?? user.preferredHoursPerDay,
        knowledgeLevel: updatedData.knowledgeLevel ?? user.knowledgeLevel,
        currentSkills: updatedData.currentSkills ?? user.currentSkills,
        learningInterests: updatedData.learningInterests ?? user.learningInterests,
        ...(updatedData.onboardingCompleted !== undefined
          ? { onboardingCompleted: updatedData.onboardingCompleted }
          : {}),
      };

      const reloadedProfile = await saveStudentProfile(supabase, mergedInput);
      const uid = session?.user?.id ?? activeAuthUserIdRef.current;
      clearExploreResourcesCache(uid);
      setProfileLoadError('');

      const nextDir = (reloadedProfile.primaryDirection ?? '').trim();
      const directionChangedOrMismatched =
        updatedData.primaryDirection !== undefined &&
        Boolean(nextDir) &&
        (nextDir.toLowerCase() !== prevDir.toLowerCase() ||
          !activeRoadmap ||
          !doesRoadmapMatchDirection(activeRoadmap, nextDir));

      if (directionChangedOrMismatched) {
        const freshRoadmaps = await loadLearningRoadmaps(supabase);
        const allUserRoadmaps = [
          freshRoadmaps.activeRoadmap,
          ...freshRoadmaps.archivedRoadmaps,
        ].filter((r): r is LearningRoadmapRecord => Boolean(r));

        const preservedMatch = findBestMatchingRoadmapForDirection(
          allUserRoadmaps,
          nextDir
        );

        if (preservedMatch) {
          let nextActive: LearningRoadmapRecord | null = freshRoadmaps.activeRoadmap;
          let nextArchived: LearningRoadmapRecord[] = freshRoadmaps.archivedRoadmaps;

          if (freshRoadmaps.activeRoadmap?.id !== preservedMatch.id) {
            const reloadedRoadmaps = await activateExistingRoadmap(
              supabase,
              preservedMatch.id
            );
            nextActive = reloadedRoadmaps.activeRoadmap;
            nextArchived = reloadedRoadmaps.archivedRoadmaps;
          }

          setActiveRoadmap(nextActive);
          setArchivedRoadmaps(nextArchived);
          setSelectedCourseId(null);
          setActiveStudyLesson(null);
          setRoadmapGenerationError('');

          const restoredStats = computeRoadmapStats(nextActive);
          setUser({
            ...reloadedProfile,
            overallProgress: restoredStats.progressPercent,
            completedCoursesCount: restoredStats.completedStages,
          });
          clearExploreResourcesCache(uid);
        } else {
          // Archive the old direction's active roadmap immediately so Dashboard & Learning Path
          // never keep displaying the previous direction's stage, lesson, or progress.
          if (freshRoadmaps.activeRoadmap) {
            const archivedState = await archiveActiveRoadmaps(supabase);
            setActiveRoadmap(null);
            setArchivedRoadmaps(archivedState.archivedRoadmaps);
          } else {
            setActiveRoadmap(null);
            setArchivedRoadmaps(freshRoadmaps.archivedRoadmaps);
          }

          setSelectedCourseId(null);
          setActiveStudyLesson(null);
          setRoadmapGenerationError('');
          setUser({
            ...reloadedProfile,
            overallProgress: 0,
            completedCoursesCount: 0,
          });
          clearExploreResourcesCache(uid);

          // Automatically generate a new personalized Learning Path for the new direction
          await handleGenerateRoadmap(true);
        }
      } else {
        const currentStats = computeRoadmapStats(activeRoadmap);
        setUser({
          ...reloadedProfile,
          overallProgress: currentStats.progressPercent,
          completedCoursesCount: currentStats.completedStages,
        });
      }
      void refreshServerAchievements();
    } finally {
      profileUpdateInFlightRef.current = false;
    }
  };

  // Assessment completion hook (persisted via assessment_attempts; do not invent fake hours)
  const handleUpdateScore = (_score: number) => {};

  // Auth modal triggers
  const openLogin = () => {
    setAuthErrorNotice('');
    setAuthInitialMode('login');
    setAuthModalOpen(true);
  };

  const openSignUp = () => {
    setAuthErrorNotice('');
    setAuthInitialMode('signup');
    setAuthModalOpen(true);
  };

  const handleCompleteAuth = (
    updatedFields: Partial<UserProfile>,
    options?: OnboardingCompleteOptions
  ) => {
    setProfileLoadError('');
    const activeUserId = session?.user?.id ?? activeAuthUserIdRef.current;
    clearExploreResourcesCache(activeUserId);
    const hasActiveUser = Boolean(session?.user || activeAuthUserIdRef.current);
    setUser((prev) => ({
      ...(hasActiveUser ? prev : createEmptyUserProfile()),
      ...updatedFields,
    }));
    setSelectedCourseId(null);
    setActiveStudyLesson(null);
    if (options?.generateRoadmap) {
      setCurrentView('roadmap');
      void handleGenerateRoadmap(Boolean(activeRoadmap));
    } else {
      setCurrentView('dashboard');
    }
  };

  const handleRefreshAssessmentAttempts = async () => {
    if (!session) return;
    setAttemptsLoading(true);
    setAttemptsError('');
    try {
      const supabase = await getSupabaseClient();
      const rows = await loadAssessmentAttempts(supabase);
      setAssessmentAttempts(rows);
    } catch (err) {
      if (err instanceof AssessmentDbError) {
        setAttemptsError(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else if (err instanceof Error) {
        setAttemptsError(err.message);
      } else {
        setAttemptsError('Failed to refresh assessment history from Supabase.');
      }
    } finally {
      setAttemptsLoading(false);
    }
  };

  const handleRecordLearningSession = async (
    input: UpsertLearningSessionInput
  ) => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    const optimistic: LearningSessionRecord = {
      id: input.clientSessionId,
      userId: session.user.id,
      clientSessionId: input.clientSessionId,
      roadmapId: input.roadmapId ?? null,
      stageId: input.stageId ?? null,
      lessonId: input.lessonId ?? null,
      lessonTitle: input.lessonTitle ?? null,
      activityType: input.activityType,
      durationSeconds: input.durationSeconds,
      startedAt: input.startedAt ?? nowIso,
      endedAt: input.endedAt ?? nowIso,
      completed: input.completed !== false,
    };

    setLearningSessions((prev) => {
      const rest = prev.filter(
        (s) => s.clientSessionId !== optimistic.clientSessionId
      );
      return [optimistic, ...rest].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
    });

    if (input.durationSeconds >= 10 || input.completed !== false) {
      notifyMeaningfulActivity(optimistic.endedAt);
    }

    try {
      const supabase = await getSupabaseClient();
      const { session: saved } = await upsertLearningSession(supabase, input);
      setLearningSessions((prev) => {
        const rest = prev.filter(
          (s) => s.clientSessionId !== saved.clientSessionId
        );
        return [saved, ...rest].sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
      });
      if (saved.completed || saved.durationSeconds >= 10) {
        void refreshServerAchievements();
      }
    } catch {
      // Non-blocking session telemetry; keep local state responsive
    }
  };

  const handleRefreshSessions = async () => {
    if (!session) return;
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const supabase = await getSupabaseClient();
      const result = await loadLearningSessions(supabase);
      setLearningSessions(result.sessions);
    } catch (err) {
      if (err instanceof LearningSessionDbError) {
        setSessionsError(err.userMessage);
      } else if (err instanceof Error) {
        setSessionsError(err.message);
      } else {
        setSessionsError('Failed to refresh learning sessions.');
      }
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleAssessmentAttemptSaved = (
    savedAttempt: AssessmentAttemptRecord,
    durationSeconds?: number
  ) => {
    setAssessmentAttempts((prev) => {
      if (prev.some((item) => item.id === savedAttempt.id)) {
        return prev;
      }
      return [savedAttempt, ...prev];
    });
    clearExploreResourcesCache(session?.user?.id ?? activeAuthUserIdRef.current);

    notifyMeaningfulActivity(savedAttempt.createdAt);

    void handleRecordLearningSession({
      clientSessionId: `assessment-${savedAttempt.id}`,
      lessonTitle: `${savedAttempt.subject} Diagnostic (${savedAttempt.scorePercent}%)`,
      activityType: 'assessment',
      durationSeconds: Math.max(1, Math.round(durationSeconds ?? 1)),
      startedAt: savedAttempt.createdAt,
      endedAt: savedAttempt.createdAt,
      completed: true,
    });
    void refreshServerAchievements();
  };

  const handleRefreshKnowledgeChecks = async () => {
    if (!session) return;
    setKnowledgeChecksLoading(true);
    setKnowledgeChecksError('');
    try {
      const result = await loadKnowledgeCheckHistory();
      setKnowledgeCheckAttempts(result.attempts);
    } catch (err) {
      if (err instanceof KnowledgeCheckClientError) {
        setKnowledgeChecksError(err.message);
      } else if (err instanceof Error) {
        setKnowledgeChecksError(err.message);
      } else {
        setKnowledgeChecksError('Failed to refresh Knowledge Check history.');
      }
    } finally {
      setKnowledgeChecksLoading(false);
    }
  };

  const handleKnowledgeCheckSaved = (
    savedAttempt: LessonKnowledgeCheckAttemptRecord,
    durationSeconds?: number
  ) => {
    setKnowledgeCheckAttempts((prev) => {
      const filtered = prev.filter(
        (item) =>
          item.id !== savedAttempt.id &&
          (!savedAttempt.submissionId || item.submissionId !== savedAttempt.submissionId)
      );
      return [savedAttempt, ...filtered].sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
    });
    clearExploreResourcesCache(session?.user?.id ?? activeAuthUserIdRef.current);

    notifyMeaningfulActivity(savedAttempt.completedAt);

    void handleRecordLearningSession({
      clientSessionId: `kc-${savedAttempt.submissionId || savedAttempt.id}`,
      roadmapId: savedAttempt.roadmapId,
      stageId: savedAttempt.stageId,
      lessonId: savedAttempt.lessonId,
      lessonTitle: `${savedAttempt.lessonTitle} Quiz (${savedAttempt.score}%)`,
      activityType: 'knowledge_check',
      durationSeconds: Math.max(1, Math.round(durationSeconds ?? 1)),
      startedAt: savedAttempt.completedAt,
      endedAt: savedAttempt.completedAt,
      completed: true,
    });
    void refreshServerAchievements();
  };

  const handleRefreshRoadmaps = async () => {
    if (!session) return;
    setRoadmapsLoading(true);
    setRoadmapsError('');
    try {
      const supabase = await getSupabaseClient();
      const result = await loadLearningRoadmaps(supabase);
      setActiveRoadmap(result.activeRoadmap);
      setArchivedRoadmaps(result.archivedRoadmaps);
      const stats = computeRoadmapStats(result.activeRoadmap);
      setUser((prev) => ({
        ...prev,
        overallProgress: stats.progressPercent,
        completedCoursesCount: stats.completedStages,
      }));
    } catch (err) {
      if (err instanceof RoadmapDbError) {
        setRoadmapsError(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else if (err instanceof Error) {
        setRoadmapsError(err.message);
      } else {
        setRoadmapsError('Failed to refresh learning roadmaps from Supabase.');
      }
    } finally {
      setRoadmapsLoading(false);
    }
  };

  const handleGenerateRoadmap = async (replaceActive = false): Promise<boolean> => {
    if (!session) return false;
    if (roadmapGenLockRef.current) return false;
    roadmapGenLockRef.current = true;
    setIsGeneratingRoadmap(true);
    setRoadmapGenerationError('');
    setRoadmapSaveError('');

    try {
      const created = await generatePersonalizedRoadmap({ replaceActive });
      // Reload roadmaps from Supabase so active + archived lists reflect canonical DB state
      const supabase = await getSupabaseClient();
      const refreshed = await loadLearningRoadmaps(supabase);
      const nextActive = refreshed.activeRoadmap ?? created;
      setActiveRoadmap(nextActive);
      setArchivedRoadmaps(refreshed.archivedRoadmaps);
      setSelectedCourseId(null);
      setActiveStudyLesson(null);
      const stats = computeRoadmapStats(nextActive);
      setUser((prev) => ({
        ...prev,
        overallProgress: stats.progressPercent,
        completedCoursesCount: stats.completedStages,
      }));
      clearExploreResourcesCache(session?.user?.id ?? activeAuthUserIdRef.current);
      return true;
    } catch (err) {
      if (err instanceof RoadmapGenerationError) {
        setRoadmapGenerationError(err.message);
      } else if (err instanceof Error) {
        setRoadmapGenerationError(err.message);
      } else {
        setRoadmapGenerationError('Unable to generate your personalized roadmap right now.');
      }
      return false;
    } finally {
      setIsGeneratingRoadmap(false);
      roadmapGenLockRef.current = false;
    }
  };

  const handleConfirmRoadmapPlan = async (): Promise<void> => {
    if (!session || !activeRoadmap) return;
    setIsConfirmingRoadmap(true);
    setRoadmapSaveError('');
    try {
      const supabase = await getSupabaseClient();
      const updated = await confirmRoadmapPlan(supabase, activeRoadmap.id);
      setActiveRoadmap(updated);
    } catch (err) {
      if (err instanceof RoadmapDbError) {
        setRoadmapSaveError(err.userMessage);
      } else if (err instanceof Error) {
        setRoadmapSaveError(err.message);
      } else {
        setRoadmapSaveError('Could not confirm your roadmap right now.');
      }
    } finally {
      setIsConfirmingRoadmap(false);
    }
  };

  const handleToggleSavedRoadmapLesson = async (
    stageId: string,
    lessonId: string,
    desiredCompleted?: boolean
  ): Promise<void> => {
    if (!session || !activeRoadmap) return;

    const targetStage = activeRoadmap.roadmapData.stages.find((s) => s.id === stageId);
    const targetLesson = targetStage?.lessons.find((l) => l.id === lessonId);
    if (!targetStage || !targetLesson) return;

    const nextCompleted = desiredCompleted ?? !targetLesson.completed;

    // Prevent duplicate completion records or duplicate concurrent submissions
    if (nextCompleted && targetLesson.completed && targetLesson.completedAt) {
      return;
    }
    const saveKey = `${activeRoadmap.id}:${stageId}:${lessonId}`;
    if (inFlightLessonSavesRef.current.has(saveKey)) {
      return;
    }

    inFlightLessonSavesRef.current.add(saveKey);
    setRoadmapSaveError('');
    setSavingLessonId(lessonId);

    const previousRoadmap = activeRoadmap;
    const completedAtIso = new Date().toISOString();
    const updatedRoadmapData = applyLessonCompletionToRoadmapData(
      activeRoadmap.roadmapData,
      stageId,
      lessonId,
      {
        completed: nextCompleted,
        completedAt: completedAtIso,
      }
    );

    const optimisticRecord: LearningRoadmapRecord = {
      ...activeRoadmap,
      roadmapData: updatedRoadmapData,
      updatedAt: completedAtIso,
    };

    setActiveRoadmap(optimisticRecord);
    const optimisticStats = computeRoadmapStats(optimisticRecord);
    setUser((prev) => ({
      ...prev,
      overallProgress: optimisticStats.progressPercent,
      completedCoursesCount: optimisticStats.completedStages,
    }));

    try {
      const supabase = await getSupabaseClient();
      const persisted = await updateRoadmapLessonCompletion(
        supabase,
        activeRoadmap.id,
        stageId,
        lessonId,
        { completed: nextCompleted }
      );
      setActiveRoadmap(persisted);
      const persistedStats = computeRoadmapStats(persisted);
      setUser((prev) => ({
        ...prev,
        overallProgress: persistedStats.progressPercent,
        completedCoursesCount: persistedStats.completedStages,
      }));
      clearExploreResourcesCache(session?.user?.id ?? activeAuthUserIdRef.current);
      if (nextCompleted) {
        notifyMeaningfulActivity(completedAtIso);
      }
      void refreshServerAchievements();
    } catch (err) {
      // Revert optimistic toggle if database save failed
      setActiveRoadmap(previousRoadmap);
      const prevStats = computeRoadmapStats(previousRoadmap);
      setUser((prev) => ({
        ...prev,
        overallProgress: prevStats.progressPercent,
        completedCoursesCount: prevStats.completedStages,
      }));

      if (err instanceof RoadmapDbError) {
        setRoadmapSaveError(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else if (err instanceof Error) {
        setRoadmapSaveError(err.message);
      } else {
        setRoadmapSaveError('Could not save your lesson progress to Supabase.');
      }
    } finally {
      inFlightLessonSavesRef.current.delete(saveKey);
      setSavingLessonId(null);
    }
  };

  const handleLogout = async () => {
    if (session) {
      try {
        const supabase = await getSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        // Fallback to resetting local state
      }
    }
    activeAuthUserIdRef.current = null;
    clearPersistedRouteState();
    resetStudentProfileSchemaCache();
    clearLessonContentCache();
    clearAllAssistantCaches();
    clearExploreResourcesCache();
    setAssistantUiState(EMPTY_ASSISTANT_UI_STATE);
    setAssistantPrompt('');
    setSession(null);
    setProfileLoadError('');
    setAssessmentAttempts([]);
    setAttemptsError('');
    setKnowledgeCheckAttempts([]);
    setKnowledgeChecksError('');
    setLearningSessions([]);
    setSessionsError('');
    setActiveRoadmap(null);
    setArchivedRoadmaps([]);
    setSelectedCourseId(null);
    setActiveStudyLesson(null);
    setRoadmapsError('');
    setRoadmapGenerationError('');
    setRoadmapSaveError('');
    setNotificationPrefs(createDefaultNotificationPreferences());
    setPushSubscriptionActive(false);
    setNotifSchemaMigrationRequired(false);
    setAchievementsSummary(null);
    setAchievementsError('');
    setUser(INITIAL_USER_PROFILE);
    setCurrentView('landing');
  };

  const handleOpenAssistantWithPrompt = (prompt: string) => {
    setAssistantPrompt(prompt);
    setCurrentView('assistant');
  };

  // Soft Pastel 3D initial session check loader
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF6F2] flex flex-col items-center justify-center p-6 text-[#343047]">
        <div className="pastel-card px-8 py-7 flex flex-col items-center gap-4">
          <Logo size="lg" showTagline={true} />
          <div className="flex items-center gap-2 text-xs font-bold text-[#8E6EC8]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading your study space...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {currentView === 'verify' ? (
        <CertificateVerificationView
          initialCertificateNumber={verifyCertificateNumber}
          isAuthenticated={Boolean(session)}
          onBack={() => {
            if (window.location.search.includes('verify=')) {
              window.history.replaceState(null, document.title, window.location.pathname);
            }
            const fallbackTarget = session
              ? previousNonVerifyViewRef.current !== 'landing' &&
                previousNonVerifyViewRef.current !== 'verify'
                ? previousNonVerifyViewRef.current
                : 'achievements'
              : 'landing';
            setVerifyCertificateNumber('');
            setCurrentView(fallbackTarget);
          }}
        />
      ) : currentView === 'landing' ? (
        <LandingPage
          onGetStarted={openSignUp}
          onLogin={openLogin}
          onExploreDashboard={() => setCurrentView('dashboard')}
          onExploreView={(view) => {
            setSelectedCourseId(null);
            setActiveStudyLesson(null);
            if (view === 'verify') {
              openVerificationView('');
              return;
            }
            setCurrentView(view);
          }}
        />
      ) : (
        <div className="min-h-screen bg-[#FAF6F2] flex text-[#343047]">
          {/* Fixed Left Sidebar (256px on desktop) */}
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => {
          setSelectedCourseId(null);
          setActiveStudyLesson(null);
          if (view === 'settings') setSettingsInitialTab('personal');
          if (view === 'progress') setProgressInitialTab('overview');
          setCurrentView(view);
        }}
        user={user}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onLogout={handleLogout}
        isAuthenticated={Boolean(session)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        {/* Top Navigation Bar */}
        <TopNavbar
          currentView={currentView}
          onNavigate={(view) => {
            setSelectedCourseId(null);
            setActiveStudyLesson(null);
            if (view === 'settings') setSettingsInitialTab('personal');
            if (view === 'progress') setProgressInitialTab('overview');
            setCurrentView(view);
          }}
          user={user}
          notifications={activeNotifications}
          onMarkAllAsRead={handleMarkAllNotificationsRead}
          onMarkNotificationRead={handleMarkNotificationRead}
          onClearNotifications={handleClearNotifications}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          onLogout={handleLogout}
          isAuthenticated={Boolean(session)}
          totalXp={effectiveAchievementsSummary.totalXp}
          learnerLevel={effectiveAchievementsSummary.levelInfo.level}
          onOpenAchievements={() => {
            setSelectedCourseId(null);
            setActiveStudyLesson(null);
            setAchievementsInitialTab('overview');
            setCurrentView('achievements');
          }}
          onOpenNotificationSettings={() => {
            setSelectedCourseId(null);
            setActiveStudyLesson(null);
            setSettingsInitialTab('notifications');
            setCurrentView('settings');
          }}
          searchQuery={globalSearch}
          onSearchChange={(q) => {
            setGlobalSearch(q);
            if (q.trim() && currentView !== 'resources') {
              setCurrentView('resources');
            }
          }}
        />

        {/* Inner Page Viewport */}
        <main
          className={
            currentView === 'assistant'
              ? 'flex-1 w-full px-3 sm:px-5 md:px-6 pt-1 sm:pt-2 pb-3 sm:pb-5 flex flex-col min-w-0 min-h-0'
              : 'flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto'
          }
        >
          {currentView === 'dashboard' && (
            <DashboardView
              user={user}
              isAuthenticated={Boolean(session)}
              authUserId={session?.user?.id ?? null}
              activeRoadmap={activeRoadmap}
              archivedRoadmaps={archivedRoadmaps}
              roadmapsLoading={roadmapsLoading}
              isGeneratingRoadmap={isGeneratingRoadmap}
              assessmentAttempts={assessmentAttempts}
              knowledgeCheckAttempts={knowledgeCheckAttempts}
              knowledgeChecksLoading={knowledgeChecksLoading}
              learningSessions={learningSessions}
              sessionsLoading={sessionsLoading}
              timeZone={notificationPrefs.timezone}
              achievementsSummary={effectiveAchievementsSummary}
              onOpenAchievements={(tab) => {
                setSelectedCourseId(null);
                setActiveStudyLesson(null);
                setAchievementsInitialTab(tab ?? 'overview');
                setCurrentView('achievements');
              }}
              onGenerateRoadmap={handleGenerateRoadmap}
              onSwitchToPreservedRoadmap={handleSwitchToPreservedRoadmap}
              onNavigate={(view) => {
                setSelectedCourseId(null);
                setActiveStudyLesson(null);
                if (view !== 'resources') {
                  setGlobalSearch('');
                }
                setCurrentView(view);
              }}
              onExploreResource={(searchTerm) => {
                setSelectedCourseId(null);
                setActiveStudyLesson(null);
                setGlobalSearch(searchTerm);
                setCurrentView('resources');
              }}
              onSelectCourse={(course) => setActiveCourseModal(course)}
              onContinueLesson={(stageId, lessonId) => {
                setSelectedCourseId(stageId);
                setActiveStudyLesson({ stageId, lessonId });
                setCurrentView('roadmap');
              }}
              onOpenCourse={(stageId) => {
                setSelectedCourseId(stageId);
                setActiveStudyLesson(null);
                setCurrentView('roadmap');
              }}
              onOpenAssistantPrompt={handleOpenAssistantWithPrompt}
              onOpenOnboarding={() => {
                setAuthErrorNotice('');
                setAuthInitialMode('onboarding');
                setAuthModalOpen(true);
              }}
            />
          )}

          {currentView === 'assessment' && (
            <AssessmentView
              user={user}
              isAuthenticated={Boolean(session)}
              attempts={assessmentAttempts}
              attemptsLoading={attemptsLoading}
              attemptsError={attemptsError}
              onAttemptSaved={handleAssessmentAttemptSaved}
              onRefreshAttempts={handleRefreshAssessmentAttempts}
              onNavigate={(view) => setCurrentView(view)}
              onOpenAssistantPrompt={handleOpenAssistantWithPrompt}
              onUpdateScore={handleUpdateScore}
            />
          )}

          {currentView === 'roadmap' && (() => {
            if (session && activeStudyLesson) {
              const candidateRoadmaps = [activeRoadmap, ...archivedRoadmaps].filter(
                (r): r is LearningRoadmapRecord => Boolean(r)
              );
              const targetRoadmap = activeStudyLesson.roadmapId
                ? candidateRoadmaps.find((r) => r.id === activeStudyLesson.roadmapId) ?? null
                : activeRoadmap;

              if (targetRoadmap) {
                const isArchived = targetRoadmap.status === 'archived';
                const allStages = targetRoadmap.roadmapData.stages;
                const stageIndex = allStages.findIndex(
                  (s) => s.id === activeStudyLesson.stageId
                );
                const matchedStage = stageIndex >= 0 ? allStages[stageIndex] : null;
                const matchedLesson = matchedStage?.lessons.find(
                  (l) => l.id === activeStudyLesson.lessonId
                );

                if (matchedStage && matchedLesson) {
                  const flatLessons = allStages.flatMap((s) =>
                    s.lessons.map((l) => ({ stageId: s.id, lessonId: l.id }))
                  );
                  const currentFlatIdx = flatLessons.findIndex(
                    (item) =>
                      item.stageId === matchedStage.id &&
                      item.lessonId === matchedLesson.id
                  );
                  const prevItem = currentFlatIdx > 0 ? flatLessons[currentFlatIdx - 1] : null;
                  const nextItem =
                    currentFlatIdx >= 0 && currentFlatIdx < flatLessons.length - 1
                      ? flatLessons[currentFlatIdx + 1]
                      : null;

                  return (
                    <LessonLearningView
                      authUserId={session.user.id}
                      isArchivedRoadmap={isArchived}
                      roadmap={targetRoadmap}
                      stage={matchedStage}
                      lesson={matchedLesson}
                      stageIndex={stageIndex}
                      totalStages={allStages.length}
                      hasPreviousLesson={Boolean(prevItem)}
                      hasNextLesson={Boolean(nextItem)}
                      isSavingCompletion={savingLessonId === matchedLesson.id}
                      saveCompletionError={roadmapSaveError}
                      knowledgeCheckAttempts={knowledgeCheckAttempts}
                      onKnowledgeCheckSaved={handleKnowledgeCheckSaved}
                      onRecordStudySession={(sess) => {
                        void handleRecordLearningSession({
                          ...sess,
                          activityType: 'lesson_study',
                        });
                      }}
                      onOpenTargetLesson={(targetStageId, targetLessonId) => {
                        setSelectedCourseId(isArchived ? null : targetStageId);
                        setActiveStudyLesson({
                          roadmapId: targetRoadmap.id,
                          stageId: targetStageId,
                          lessonId: targetLessonId,
                        });
                      }}
                      onBackToCourse={() => {
                        setSelectedCourseId(isArchived ? null : matchedStage.id);
                        setActiveStudyLesson(null);
                      }}
                      onBackToRoadmap={() => {
                        setSelectedCourseId(null);
                        setActiveStudyLesson(null);
                      }}
                      onToggleComplete={async (desiredCompleted) => {
                        if (isArchived) return;
                        await handleToggleSavedRoadmapLesson(
                          matchedStage.id,
                          matchedLesson.id,
                          desiredCompleted
                        );
                      }}
                      onPreviousLesson={() => {
                        if (prevItem) {
                          setSelectedCourseId(isArchived ? null : prevItem.stageId);
                          setActiveStudyLesson({
                            roadmapId: targetRoadmap.id,
                            ...prevItem,
                          });
                        }
                      }}
                      onNextLesson={() => {
                        if (nextItem) {
                          setSelectedCourseId(isArchived ? null : nextItem.stageId);
                          setActiveStudyLesson({
                            roadmapId: targetRoadmap.id,
                            ...nextItem,
                          });
                        }
                      }}
                    />
                  );
                }
              }
            }

            return (
              <RoadmapView
                isAuthenticated={Boolean(session)}
                authUserId={session?.user?.id ?? null}
                user={user}
                attempts={assessmentAttempts}
                activeRoadmap={activeRoadmap}
                archivedRoadmaps={archivedRoadmaps}
                roadmapsLoading={roadmapsLoading}
                roadmapsError={roadmapsError}
                isGeneratingRoadmap={isGeneratingRoadmap}
                roadmapGenerationError={roadmapGenerationError}
                roadmapSaveError={roadmapSaveError}
                savingLessonId={savingLessonId}
                selectedCourseId={selectedCourseId}
                onSelectCourse={(stageId) => setSelectedCourseId(stageId)}
                onGenerateRoadmap={handleGenerateRoadmap}
                onConfirmRoadmapPlan={handleConfirmRoadmapPlan}
                isConfirmingRoadmap={isConfirmingRoadmap}
                onToggleRoadmapLesson={handleToggleSavedRoadmapLesson}
                onStartLearningLesson={(stageId, lessonId) => {
                  setSelectedCourseId(stageId);
                  setActiveStudyLesson({ stageId, lessonId });
                }}
                onOpenArchivedLesson={(roadmapId, stageId, lessonId) => {
                  setSelectedCourseId(null);
                  setActiveStudyLesson({ roadmapId, stageId, lessonId });
                }}
                onSwitchToPreservedRoadmap={handleSwitchToPreservedRoadmap}
                onRetryLoadRoadmaps={handleRefreshRoadmaps}
                onClearGenerationError={() => setRoadmapGenerationError('')}
                demoStages={stages}
                onToggleDemoLesson={handleToggleLesson}
                onNavigate={(view) => setCurrentView(view)}
              />
            );
          })()}

          {currentView === 'resources' && (
            <ResourcesView
              resources={resources}
              onToggleSave={handleToggleSaveResource}
              onNavigate={(view) => setCurrentView(view)}
              initialSearch={globalSearch}
              onClearSearch={() => setGlobalSearch('')}
              authUserId={session?.user?.id ?? null}
              personalizationSignature={[
                user.primaryDirection ?? '',
                user.careerGoal,
                user.knowledgeLevel,
                user.educationLevel,
                user.university,
                user.fieldOfStudy,
                user.learningInterests.join(','),
                user.currentSkills.join(','),
                activeRoadmap?.id ?? '',
                activeRoadmap?.updatedAt ?? '',
                activeRoadmap
                  ? activeRoadmap.roadmapData.stages.reduce(
                      (acc, st) => acc + st.lessons.filter((l) => l.completed).length,
                      0
                    )
                  : 0,
                assessmentAttempts.length,
                knowledgeCheckAttempts.length,
              ].join('|')}
            />
          )}

          {currentView === 'assistant' && (
            <AssistantView
              onNavigate={(view) => setCurrentView(view)}
              externalPrompt={assistantPrompt}
              onClearExternalPrompt={() => setAssistantPrompt('')}
              isAuthenticated={Boolean(session)}
              authUserId={session?.user?.id ?? null}
              accessToken={session?.access_token ?? null}
              user={user}
              activeRoadmap={activeRoadmap}
              activeStudyLesson={activeStudyLesson}
              assessmentAttempts={assessmentAttempts}
              knowledgeCheckAttempts={knowledgeCheckAttempts}
              persistedState={assistantUiState}
              onUpdatePersistedState={setAssistantUiState}
            />
          )}

          {currentView === 'progress' && (
            <ProgressView
              user={user}
              authUserId={session?.user?.id ?? null}
              isAuthenticated={Boolean(session)}
              attempts={assessmentAttempts}
              attemptsLoading={attemptsLoading}
              attemptsError={attemptsError}
              knowledgeCheckAttempts={knowledgeCheckAttempts}
              knowledgeChecksLoading={knowledgeChecksLoading}
              knowledgeChecksError={knowledgeChecksError}
              learningSessions={learningSessions}
              sessionsLoading={sessionsLoading}
              sessionsError={sessionsError}
              activeRoadmap={activeRoadmap}
              archivedRoadmaps={archivedRoadmaps}
              roadmapsLoading={roadmapsLoading}
              timeZone={notificationPrefs.timezone}
              initialTab={progressInitialTab}
              achievementsSummary={effectiveAchievementsSummary}
              achievementsLoading={achievementsLoading}
              achievementsError={achievementsError}
              onRefreshAchievements={() => {
                void refreshServerAchievements();
              }}
              onOpenVerification={openVerificationView}
              onCertificateUpdated={handleCertificateUpdated}
              onRefreshAttempts={handleRefreshAssessmentAttempts}
              onRefreshKnowledgeChecks={handleRefreshKnowledgeChecks}
              onRefreshSessions={handleRefreshSessions}
              onOpenLesson={(stageId, lessonId) => {
                setSelectedCourseId(stageId);
                setActiveStudyLesson({ stageId, lessonId });
                setCurrentView('roadmap');
              }}
              onNavigate={(view) => setCurrentView(view)}
            />
          )}

          {currentView === 'achievements' && (
            <AchievementsView
              summary={effectiveAchievementsSummary}
              isAuthenticated={Boolean(session)}
              isLoading={achievementsLoading}
              error={achievementsError}
              initialTab={achievementsInitialTab}
              onRefresh={() => {
                void refreshServerAchievements();
              }}
              onNavigate={(view) => setCurrentView(view)}
              onOpenVerification={openVerificationView}
              onCertificateUpdated={handleCertificateUpdated}
            />
          )}

          {currentView === 'profile' && (
            <ProfileView
              user={user}
              isAuthenticated={Boolean(session)}
              onUpdateProfile={handleUpdateUser}
              onNavigate={(view) => setCurrentView(view)}
              profileLoadError={profileLoadError}
              activeRoadmap={activeRoadmap}
              isGeneratingRoadmap={isGeneratingRoadmap}
              onGenerateRoadmap={handleGenerateRoadmap}
              achievementsSummary={effectiveAchievementsSummary}
              onViewAchievements={() => {
                setSelectedCourseId(null);
                setActiveStudyLesson(null);
                setAchievementsInitialTab('overview');
                setCurrentView('achievements');
              }}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              user={user}
              onUpdateUser={handleUpdateUser}
              isAuthenticated={Boolean(session)}
              initialTab={settingsInitialTab}
              notificationPreferences={notificationPrefs}
              notificationSchemaMigrationRequired={notifSchemaMigrationRequired}
              pushConfig={pushConfig}
              pushSubscriptionActive={pushSubscriptionActive}
              onUpdateNotificationPreferences={handleUpdateNotificationPrefs}
              onEnableBrowserPush={handleEnableBrowserPush}
              onDisableBrowserPush={handleDisableBrowserPush}
              onSendTestPush={sendTestPushNotification}
              onPauseNotifications={handlePauseNotifications}
              onResumeNotifications={handleResumeNotifications}
            />
          )}

          {currentView === 'help' && (
            <HelpView
              onNavigate={(view) => setCurrentView(view)}
            />
          )}
        </main>
      </div>

      <LessonModal
        course={activeCourseModal}
        isOpen={Boolean(activeCourseModal)}
        onClose={() => setActiveCourseModal(null)}
        onNavigate={(view) => setCurrentView(view)}
        onOpenAssistant={handleOpenAssistantWithPrompt}
      />
    </div>
      )}

      {/* Single persistent AuthModal across Landing & Dashboard */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authInitialMode}
        initialError={authErrorNotice}
        initialEmail={authInitialEmail}
        initialFullName={authInitialFullName}
        initialProfile={user}
        onModeChange={(nextMode) => {
          authInitialModeRef.current = nextMode;
        }}
        onClose={() => {
          if (authInitialModeRef.current === 'onboarding' && session?.user?.id) {
            onboardingDismissedUserRef.current = session.user.id;
          }
          setAuthModalOpen(false);
          setAuthErrorNotice('');
        }}
        onCompleteAuth={handleCompleteAuth}
      />
    </>
  );
}
