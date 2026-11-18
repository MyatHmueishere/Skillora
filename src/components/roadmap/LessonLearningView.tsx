import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Compass,
  ExternalLink,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Wrench,
  AlertCircle,
  Copy,
  Play,
  PlayCircle,
  Youtube,
  FileText,
  GraduationCap,
  X,
} from 'lucide-react';
import {
  GeneratedLessonContent,
  GeneratedRoadmapLesson,
  GeneratedRoadmapStage,
  LearningRoadmapRecord,
  LessonClarificationResponse,
  LessonKnowledgeCheckAttemptRecord,
  TrustedResourceItem,
} from '../../types';
import {
  fetchOrGenerateLessonContent,
  getCachedLessonContent,
  requestLessonClarification,
  LessonContentClientError,
} from '../../lib/lessonContent';
import { createBrowserActiveStudyTimer } from '../../lib/activeStudyTracker';
import { ClayIconBadge } from '../common/PastelIllustrations';
import { formatLessonCompletedTimestamp } from './roadmapUiHelpers';
import { LessonKnowledgeCheckSection } from './LessonKnowledgeCheckSection';

export type LessonSectionKey = 'learn' | 'resources' | 'practice_quiz';

interface LessonLearningViewProps {
  authUserId?: string | null;
  isArchivedRoadmap?: boolean;
  roadmap: LearningRoadmapRecord;
  stage: GeneratedRoadmapStage;
  lesson: GeneratedRoadmapLesson;
  stageIndex: number;
  totalStages: number;
  hasPreviousLesson: boolean;
  hasNextLesson: boolean;
  isSavingCompletion: boolean;
  saveCompletionError: string;
  knowledgeCheckAttempts?: LessonKnowledgeCheckAttemptRecord[];
  onKnowledgeCheckSaved?: (
    attempt: LessonKnowledgeCheckAttemptRecord,
    durationSeconds?: number
  ) => void;
  onRecordStudySession?: (input: {
    clientSessionId: string;
    roadmapId: string;
    stageId: string;
    lessonId: string;
    lessonTitle: string;
    durationSeconds: number;
    startedAt: string;
    endedAt: string;
    completed: boolean;
  }) => void;
  onOpenTargetLesson?: (stageId: string, lessonId: string) => void;
  onBackToRoadmap: () => void;
  onBackToCourse?: () => void;
  onToggleComplete: (desiredCompleted?: boolean) => Promise<void>;
  onPreviousLesson: () => void;
  onNextLesson: () => void;
}

interface ClarificationItem {
  id: string;
  question: string;
  response: LessonClarificationResponse;
}

const MAIN_TABS: { key: LessonSectionKey; label: string }[] = [
  { key: 'learn', label: '1. Learn' },
  { key: 'resources', label: '2. Resources' },
  { key: 'practice_quiz', label: '3. Practice & Quiz' },
];

export const LessonLearningView: React.FC<LessonLearningViewProps> = ({
  authUserId = null,
  isArchivedRoadmap = false,
  roadmap,
  stage,
  lesson,
  stageIndex,
  totalStages,
  hasPreviousLesson,
  hasNextLesson,
  isSavingCompletion,
  saveCompletionError,
  knowledgeCheckAttempts = [],
  onKnowledgeCheckSaved,
  onRecordStudySession,
  onOpenTargetLesson,
  onBackToRoadmap,
  onBackToCourse,
  onToggleComplete,
  onPreviousLesson,
  onNextLesson,
}) => {
  const [activeSection, setActiveSection] = useState<LessonSectionKey>('learn');
  const [content, setContent] = useState<GeneratedLessonContent | null>(() =>
    authUserId ? getCachedLessonContent(authUserId, roadmap.id, lesson.id) : null
  );
  const [loading, setLoading] = useState(
    () => !(authUserId && getCachedLessonContent(authUserId, roadmap.id, lesson.id))
  );
  const [error, setError] = useState('');

  // Preserved section-level interactive state across tab switches
  const [revealedHints, setRevealedHints] = useState<Record<number, boolean>>({});
  const [practiceNotes, setPracticeNotes] = useState<Record<number, string>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Additional clarification state
  const [clarifyInput, setClarifyInput] = useState('');
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyError, setClarifyError] = useState('');
  const [clarifications, setClarifications] = useState<ClarificationItem[]>([]);

  // Trusted Resources sub-tabs & YouTube embed toggle
  const [activeResourceTab, setActiveResourceTab] = useState<'videos' | 'tutorials' | 'practice'>('videos');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const handleReturnToCourse = onBackToCourse ?? onBackToRoadmap;

  const lessonOrderIndex = Math.max(
    0,
    stage.lessons.findIndex((l) => l.id === lesson.id)
  );

  const currentLessonKey = `${roadmap.id}:${stage.id}:${lesson.id}`;
  const activeLessonKeyRef = useRef(currentLessonKey);
  activeLessonKeyRef.current = currentLessonKey;
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  const loadLesson = async (forceRegenerate = false) => {
    loadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    loadAbortControllerRef.current = controller;
    const reqKey = currentLessonKey;

    if (!forceRegenerate && authUserId) {
      const syncCached = getCachedLessonContent(authUserId, roadmap.id, lesson.id);
      if (syncCached) {
        setContent(syncCached);
        const bundle = syncCached.trustedResources;
        if (bundle) {
          if (bundle.videos.length > 0) setActiveResourceTab('videos');
          else if (bundle.tutorials.length > 0) setActiveResourceTab('tutorials');
          else if (bundle.practice.length > 0) setActiveResourceTab('practice');
          else setActiveResourceTab('videos');
        }
        setLoading(false);
        setError('');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const generated = await fetchOrGenerateLessonContent({
        roadmapId: roadmap.id,
        stageId: stage.id,
        lessonId: lesson.id,
        forceRegenerate,
        signal: controller.signal,
      });
      if (controller.signal.aborted || activeLessonKeyRef.current !== reqKey) return;
      setContent(generated);
      const bundle = generated.trustedResources;
      if (bundle) {
        if (bundle.videos.length > 0) setActiveResourceTab('videos');
        else if (bundle.tutorials.length > 0) setActiveResourceTab('tutorials');
        else if (bundle.practice.length > 0) setActiveResourceTab('practice');
        else setActiveResourceTab('videos');
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        activeLessonKeyRef.current !== reqKey ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      if (err instanceof LessonContentClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Unable to load lesson content right now. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted && activeLessonKeyRef.current === reqKey) {
        setLoading(false);
      }
    }
  };

  const recordStudySessionRef = useRef(onRecordStudySession);
  recordStudySessionRef.current = onRecordStudySession;

  const lessonCompletedRef = useRef(lesson.completed);
  lessonCompletedRef.current = lesson.completed;

  useEffect(() => {
    setActiveSection('learn');
    setActiveResourceTab('videos');
    setPlayingVideoId(null);
    setRevealedHints({});
    setPracticeNotes({});
    setClarifyInput('');
    setClarifyError('');
    setClarifications([]);
    void loadLesson(false);
    return () => {
      loadAbortControllerRef.current?.abort();
    };
  }, [roadmap.id, stage.id, lesson.id]);

  // Active study session tracking per lesson visit (strictly excludes hidden/idle time)
  const playingVideoIdRef = useRef<string | null>(null);
  playingVideoIdRef.current = playingVideoId;

  const activeVisitSessionRef = useRef<{
    clientSessionId: string;
    startedAt: string;
    activeSeconds: number;
    lastSavedSeconds: number;
  } | null>(null);

  useEffect(() => {
    const clientSessionId = `study-${roadmap.id}-${lesson.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const startedAt = new Date().toISOString();
    activeVisitSessionRef.current = {
      clientSessionId,
      startedAt,
      activeSeconds: 0,
      lastSavedSeconds: 0,
    };

    const flushSession = (forceIfCompleted = false) => {
      const current = activeVisitSessionRef.current;
      const recorder = recordStudySessionRef.current;
      if (!current || !recorder) return;
      const minThreshold = forceIfCompleted ? 1 : 10;
      if (current.activeSeconds < minThreshold) return;
      if (!forceIfCompleted && current.activeSeconds === current.lastSavedSeconds) return;

      current.lastSavedSeconds = current.activeSeconds;
      recorder({
        clientSessionId: current.clientSessionId,
        roadmapId: roadmap.id,
        stageId: stage.id,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        durationSeconds: Math.max(1, current.activeSeconds),
        startedAt: current.startedAt,
        endedAt: new Date().toISOString(),
        completed: lessonCompletedRef.current || current.activeSeconds >= 10,
      });
    };

    const timer = createBrowserActiveStudyTimer({
      isMediaPlaying: () => Boolean(playingVideoIdRef.current),
      onSecondTick: (seconds) => {
        if (!activeVisitSessionRef.current) return;
        activeVisitSessionRef.current.activeSeconds = seconds;
        if (seconds >= 15 && seconds % 30 === 0) {
          flushSession(false);
        }
      },
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSession(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      timer.destroy();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushSession(lessonCompletedRef.current);
      activeVisitSessionRef.current = null;
    };
  }, [roadmap.id, stage.id, lesson.id, lesson.title]);

  const handleCopyCode = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleAskClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = clarifyInput.trim();
    if (!trimmed || clarifyLoading) return;

    setClarifyLoading(true);
    setClarifyError('');
    try {
      const priorHistory = clarifications.flatMap((c) => [
        { sender: 'user' as const, text: c.question },
        { sender: 'assistant' as const, text: c.response.answer },
      ]);
      const response = await requestLessonClarification({
        roadmapId: roadmap.id,
        stageId: stage.id,
        lessonId: lesson.id,
        question: trimmed,
        currentSection: activeSection,
        history: priorHistory,
      });
      setClarifications((prev) => [
        ...prev,
        {
          id: `clarify-${Date.now()}`,
          question: trimmed,
          response,
        },
      ]);
      setClarifyInput('');
    } catch (err) {
      if (err instanceof LessonContentClientError) {
        setClarifyError(err.message);
      } else if (err instanceof Error) {
        setClarifyError(err.message);
      } else {
        setClarifyError('Could not get clarification right now. Please try again.');
      }
    } finally {
      setClarifyLoading(false);
    }
  };

  const lessonKnowledgeCheckAttempts = knowledgeCheckAttempts.filter(
    (attempt) =>
      attempt.lessonId === lesson.id &&
      (!attempt.roadmapId || attempt.roadmapId === roadmap.id)
  );

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-150">
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Lesson breadcrumb"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-xs text-[#7B7188] flex-wrap">
          <button
            type="button"
            onClick={handleReturnToCourse}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] font-bold text-[#343047] hover:border-[#C9B7E8] transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#8E6EC8]" />
            <span>Back to Course</span>
          </button>

          <button
            type="button"
            onClick={onBackToRoadmap}
            className="hidden sm:inline font-semibold hover:text-[#6F4FA8] hover:underline transition-colors"
          >
            My Learning Path
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-[#B4A9C2] hidden sm:inline" />
          <button
            type="button"
            onClick={handleReturnToCourse}
            className="hidden sm:inline font-semibold hover:text-[#6F4FA8] hover:underline transition-colors truncate max-w-[210px]"
          >
            Course {stageIndex + 1}: {stage.title}
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-[#B4A9C2] hidden sm:inline" />
          <span className="font-bold text-[#343047]">
            Lesson {lessonOrderIndex + 1} of {stage.lessons.length}
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6B6178]">
            <Clock className="w-3.5 h-3.5 text-[#8E6EC8]" />
            <span>{lesson.estimatedTime}</span>
          </span>

          {lesson.completed ? (
            <span
              title={
                lesson.completedAt
                  ? `Completed ${formatLessonCompletedTimestamp(lesson.completedAt)}`
                  : 'Lesson completed'
              }
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-[#DCECD9] border border-[#BBDAB6] text-[#2F5B37]"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Completed</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                const current = activeVisitSessionRef.current;
                if (current && onRecordStudySession && current.activeSeconds > 0) {
                  const honestDuration = Math.max(1, current.activeSeconds);
                  onRecordStudySession({
                    clientSessionId: current.clientSessionId,
                    roadmapId: roadmap.id,
                    stageId: stage.id,
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    durationSeconds: honestDuration,
                    startedAt: current.startedAt,
                    endedAt: new Date().toISOString(),
                    completed: true,
                  });
                  current.lastSavedSeconds = honestDuration;
                }
                void onToggleComplete(true);
              }}
              disabled={isSavingCompletion}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all border bg-[#FFFCFA] border-[#D8C9F2] text-[#6F4FA8] hover:bg-[#F0E9FA] disabled:opacity-60"
            >
              {isSavingCompletion ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 stroke-[2.8]" />
              )}
              <span>{isSavingCompletion ? 'Saving...' : 'Mark Done'}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Lesson Header Card */}
      <div
        className="rounded-[26px] border border-[#E2D6F5] p-5 sm:p-7 space-y-2.5"
        style={{
          background: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 55%, #FCEAE5 100%)',
          boxShadow: '0 12px 28px -12px rgba(154, 126, 200, 0.25)',
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-bold text-[#7B59B6]">
            Course {stageIndex + 1} of {totalStages} · {stage.title}
          </p>
          {isArchivedRoadmap && (
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-[10px] font-extrabold">
              Preserved from Archived Learning Path
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="text-xs sm:text-sm text-[#5E5468] max-w-3xl leading-relaxed">
            {lesson.description}
          </p>
        )}

        {saveCompletionError && (
          <div className="rounded-[16px] bg-[#FCEAE5] border border-[#F2C2BA] px-4 py-2.5 text-xs text-[#753227] flex items-center gap-2 mt-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveCompletionError}</span>
          </div>
        )}
      </div>

      {/* 3 Simplified Main Tabs: 1. Learn | 2. Resources | 3. Practice & Quiz */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label="Lesson study sections"
          className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-2xl shadow-2xs overflow-x-auto max-w-full"
        >
          {MAIN_TABS.map((tab) => {
            const isActive = activeSection === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                className={`px-4 py-2 text-xs sm:text-sm font-extrabold rounded-xl transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#A78BCE] text-white shadow-xs'
                    : 'text-[#6B6178] hover:text-[#343047] hover:bg-[#FAF6F2]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {content && !loading && (
          <button
            type="button"
            onClick={() => void loadLesson(true)}
            className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5"
            title="Regenerate study notes for this lesson"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Study Notes</span>
          </button>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="pastel-card p-10 flex flex-col items-center justify-center text-center gap-4">
          <ClayIconBadge variant="lavender" size="lg">
            <Loader2 className="w-6 h-6 animate-spin" />
          </ClayIconBadge>
          <div className="space-y-1 max-w-md">
            <h2 className="font-display text-lg font-extrabold text-[#343047]">
              Preparing Your Lesson Study Guide...
            </h2>
            <p className="text-xs text-[#6B6178] leading-relaxed">
              Skillora AI is preparing focused explanations, examples, verified videos, and knowledge check questions tailored to your knowledge level and career goal.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReturnToCourse}
            className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8]"
          >
            Back to Course
          </button>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="pastel-card p-7 space-y-4 border-[#F2C2BA] bg-[#FFF8F6]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#B45343] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-display text-base font-extrabold text-[#343047]">
                Could Not Load Lesson Content
              </h3>
              <p className="text-xs text-[#753227] leading-relaxed">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => void loadLesson(true)}
              className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Generation</span>
            </button>
            <button
              type="button"
              onClick={handleReturnToCourse}
              className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6B6178]"
            >
              Back to Course
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      {!loading && !error && content && (
        <div className="space-y-6">
          {/* ===============================================================
              TAB 1: LEARN (Overview + Objectives + Prerequisites + Steps + Examples + AI Tutor)
             =============================================================== */}
          {activeSection === 'learn' && (
            <div className="space-y-6">
              {/* Overview & Personalized Context */}
              <div className="pastel-card p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <ClayIconBadge variant="lavender" size="md">
                    <Compass className="w-5 h-5" />
                  </ClayIconBadge>
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-[#343047]">
                      Lesson Overview
                    </h2>
                    <p className="text-xs text-[#8B8295]">
                      What you will learn and how it fits your learning track
                    </p>
                  </div>
                </div>

                <p className="text-sm text-[#343047] leading-relaxed">{content.overview}</p>

                <div className="p-4 rounded-[18px] bg-[#F0E9FA]/70 border border-[#E2D6F5] flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[#7B59B6] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#4D3B73] leading-relaxed">
                    <span className="font-extrabold">Personalized Context: </span>
                    {content.personalizationNote}
                  </div>
                </div>

                {(content.completionCriteria || lesson.completionCriteria) && (
                  <div className="p-3.5 rounded-[16px] bg-[#F4FAF5] border border-[#D4E7D1] flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#437E50] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#2D4D33] leading-relaxed">
                      <span className="font-extrabold">Completion Criteria: </span>
                      {content.completionCriteria || lesson.completionCriteria}
                    </div>
                  </div>
                )}
              </div>

              {/* Learning Objectives & Prerequisites / Key Takeaways */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="pastel-card p-5 space-y-3">
                  <h3 className="font-display text-sm font-extrabold text-[#343047] flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#8E6EC8]" />
                    <span>Learning Objectives</span>
                  </h3>
                  <ul className="space-y-2">
                    {(lesson.learningObjectives.length > 0
                      ? lesson.learningObjectives
                      : content.keyTakeaways
                    ).map((obj, idx) => (
                      <li key={idx} className="text-xs text-[#4E455C] flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-bold text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="pt-0.5 leading-relaxed">{obj}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pastel-card p-5 space-y-3">
                  <h3 className="font-display text-sm font-extrabold text-[#343047] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#539864]" />
                    <span>Prerequisites & Key Takeaways</span>
                  </h3>
                  {((content.prerequisites && content.prerequisites.length > 0) ||
                    stage.prerequisites.length > 0) ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-[#8B8295]">Prerequisites:</p>
                      <p className="text-xs font-semibold text-[#5E5468]">
                        {(content.prerequisites && content.prerequisites.length > 0
                          ? content.prerequisites
                          : stage.prerequisites
                        ).join(' · ')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#6B6178]">
                      No prior prerequisites required for this lesson.
                    </p>
                  )}

                  <div className="pt-2 border-t border-[#EEE6E5] space-y-1.5">
                    <p className="text-[11px] font-bold text-[#8B8295]">Key Takeaways:</p>
                    <ul className="space-y-1.5">
                      {content.keyTakeaways.map((kt, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-[#4E455C] flex items-start gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8CC697] mt-1.5 shrink-0" />
                          <span>{kt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Explanations */}
              <div className="space-y-4">
                <h2 className="font-display text-lg font-extrabold text-[#343047] px-1">
                  Step-by-Step Guide
                </h2>
                {content.learnSteps.map((step) => (
                  <div key={step.stepNumber} className="pastel-card p-6 space-y-3">
                    <div className="flex items-start gap-3.5">
                      <ClayIconBadge variant="mint" size="sm" className="mt-0.5">
                        <span className="font-display font-extrabold text-xs">
                          {step.stepNumber}
                        </span>
                      </ClayIconBadge>
                      <div className="space-y-2 flex-1">
                        <h3 className="font-display text-base sm:text-lg font-extrabold text-[#343047]">
                          {step.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#423B54] leading-relaxed whitespace-pre-line">
                          {step.explanation}
                        </p>
                        <div className="p-3.5 rounded-[16px] bg-[#FFF1D6]/65 border border-[#F3DFB4] flex items-start gap-2.5 mt-2">
                          <Lightbulb className="w-4 h-4 text-[#A37327] shrink-0 mt-0.5" />
                          <p className="text-xs text-[#6B5220] leading-relaxed">
                            <span className="font-extrabold">Key Point: </span>
                            {step.keyPoint}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Practical & Code Examples */}
              <div className="space-y-4">
                <h2 className="font-display text-lg font-extrabold text-[#343047] px-1">
                  Practical Examples
                </h2>
                {content.examples.map((ex, idx) => (
                  <div key={idx} className="pastel-card p-6 space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ClayIconBadge variant="lavender" size="sm">
                          <Code2 className="w-4 h-4" />
                        </ClayIconBadge>
                        <div>
                          <span className="text-[11px] font-bold text-[#8E6EC8]">
                            Example {idx + 1}
                          </span>
                          <h3 className="font-display text-base font-extrabold text-[#343047]">
                            {ex.title}
                          </h3>
                        </div>
                      </div>
                      {ex.language && (
                        <span className="px-2.5 py-1 rounded-full bg-[#F0E9FA] text-[#6F4FA8] text-[11px] font-mono font-bold uppercase">
                          {ex.language}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#6B6178] leading-relaxed">
                      <span className="font-bold text-[#343047]">Scenario: </span>
                      {ex.context}
                    </p>

                    {ex.codeSnippet && (
                      <div className="relative rounded-[18px] overflow-hidden border border-[#3E3754] bg-[#2B263B]">
                        <div className="flex items-center justify-between px-4 py-2 bg-[#231F31] text-[11px] text-[#C9B7E8] font-mono">
                          <span>{ex.language || 'code'}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyCode(ex.codeSnippet || '', idx)}
                            className="inline-flex items-center gap-1 text-[11px] font-sans font-bold text-[#E6DCF8] hover:text-white"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedIdx === idx ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                        <pre className="p-4 text-xs font-mono text-[#F7F4FC] overflow-x-auto leading-relaxed">
                          <code>{ex.codeSnippet}</code>
                        </pre>
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-[#343047] leading-relaxed whitespace-pre-line">
                      {ex.explanation}
                    </p>

                    {ex.expectedOutput && (
                      <div className="p-3.5 rounded-[16px] bg-[#E5F0E3]/70 border border-[#C6E0C1] text-xs text-[#2F4F35]">
                        <span className="font-extrabold">Expected Outcome / Output: </span>
                        <span className="font-mono">{ex.expectedOutput}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Practical Applications & Key Terminology */}
              {((content.practicalApplications?.length ?? 0) > 0 ||
                (content.keyTerminology?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {(content.practicalApplications?.length ?? 0) > 0 && (
                    <div className="pastel-card p-5 space-y-3">
                      <h3 className="font-display text-sm font-extrabold text-[#343047] flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-[#D17865]" />
                        <span>Real-World Applications &amp; Use Cases</span>
                      </h3>
                      <ul className="space-y-2">
                        {content.practicalApplications!.map((appItem, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-[#4E455C] flex items-start gap-2.5 leading-relaxed"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D17865] mt-1.5 shrink-0" />
                            <span>{appItem}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(content.keyTerminology?.length ?? 0) > 0 && (
                    <div className="pastel-card p-5 space-y-3">
                      <h3 className="font-display text-sm font-extrabold text-[#343047] flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[#8E6EC8]" />
                        <span>Key Terminology &amp; Concepts</span>
                      </h3>
                      <dl className="space-y-2.5">
                        {content.keyTerminology!.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-[14px] bg-[#FAF6F2] border border-[#EEE6E5]"
                          >
                            <dt className="text-xs font-extrabold text-[#343047]">
                              {item.term}
                            </dt>
                            <dd className="text-xs text-[#5E5468] mt-0.5 leading-relaxed">
                              {item.definition}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              )}

              {/* Common Mistakes & How to Avoid Them */}
              {(content.commonMistakes?.length ?? 0) > 0 && (
                <div className="pastel-card p-5 sm:p-6 space-y-3.5 border-[#F2CFC7] bg-[#FFFDFB]">
                  <h3 className="font-display text-sm sm:text-base font-extrabold text-[#343047] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#C26D5B]" />
                    <span>Common Mistakes &amp; How to Avoid Them</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {content.commonMistakes!.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-[16px] bg-[#FCEAE5]/45 border border-[#F3D8D0] space-y-1.5"
                      >
                        <p className="text-xs font-extrabold text-[#753227]">
                          Pitfall: {item.mistake}
                        </p>
                        <p className="text-xs text-[#4E455C] leading-relaxed">
                          <span className="font-bold text-[#2F5B37]">How to avoid: </span>
                          {item.howToAvoid}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lesson Summary & What to Learn Next */}
              {(content.summary || content.whatToLearnNext) && (
                <div className="pastel-card p-5 sm:p-6 space-y-3.5 bg-[#FAF6F2]/75">
                  {content.summary && (
                    <div className="space-y-1">
                      <h3 className="font-display text-sm font-extrabold text-[#343047]">
                        Lesson Summary
                      </h3>
                      <p className="text-xs sm:text-sm text-[#4E455C] leading-relaxed">
                        {content.summary}
                      </p>
                    </div>
                  )}
                  {content.whatToLearnNext && (
                    <div className="pt-3 border-t border-[#EAE0E9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-extrabold text-[#6F4FA8]">
                          What to Learn Next{content.nextLessonTitle ? ` · ${content.nextLessonTitle}` : ''}
                        </p>
                        <p className="text-xs text-[#5E5468] leading-relaxed">
                          {content.whatToLearnNext}
                        </p>
                      </div>
                      {hasNextLesson && (
                        <button
                          type="button"
                          onClick={onNextLesson}
                          className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                        >
                          <span>Go to Next Lesson</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Additional Clarification Box */}
              <div className="pastel-card p-6 space-y-4 bg-[#FAF6F2]/80">
                <div className="flex items-center gap-3">
                  <ClayIconBadge variant="peach" size="sm">
                    <MessageCircleQuestion className="w-4 h-4" />
                  </ClayIconBadge>
                  <div>
                    <h3 className="font-display text-sm font-extrabold text-[#343047]">
                      Need Extra Clarification?
                    </h3>
                    <p className="text-xs text-[#8B8295]">
                      Ask a focused question about any concept above to get a tailored explanation.
                    </p>
                  </div>
                </div>

                {clarifications.length > 0 && (
                  <div className="space-y-3">
                    {clarifications.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-[18px] bg-[#FFFCFA] border border-[#E2D6F5] space-y-2"
                      >
                        <p className="text-xs font-extrabold text-[#6F4FA8]">
                          Q: {item.question}
                        </p>
                        <p className="text-xs sm:text-sm text-[#343047] leading-relaxed whitespace-pre-line">
                          {item.response.answer}
                        </p>
                        {item.response.exampleSnippet && (
                          <pre className="p-3 rounded-[14px] bg-[#2D283E] text-[#F7F4FC] text-xs font-mono overflow-x-auto">
                            <code>{item.response.exampleSnippet}</code>
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {clarifyError && (
                  <p className="text-xs text-[#B45343] font-semibold">{clarifyError}</p>
                )}

                <form onSubmit={handleAskClarification} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={clarifyInput}
                    onChange={(e) => setClarifyInput(e.target.value)}
                    placeholder={`Ask about "${lesson.title}" (e.g. Can you give a simpler analogy?)`}
                    className="flex-1 px-4 py-2.5 rounded-[14px] bg-[#FFFCFA] border border-[#E6DCD9] text-xs text-[#343047] focus:outline-none focus:border-[#A78BCE]"
                    maxLength={600}
                  />
                  <button
                    type="submit"
                    disabled={clarifyLoading || !clarifyInput.trim()}
                    className="clay-button-primary px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 shrink-0"
                  >
                    {clarifyLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Ask Tutor</span>
                  </button>
                </form>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSection('resources')}
                  className="clay-button-soft px-5 py-2.5 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5"
                >
                  <span>Explore Videos & Resources</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('practice_quiz')}
                  className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Continue to Practice & Quiz</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ===============================================================
              TAB 2: RESOURCES (Verified YouTube Videos, Written Tutorials & Free Courses/Practice)
             =============================================================== */}
          {activeSection === 'resources' && (() => {
            const fallbackTutorials: TrustedResourceItem[] =
              !content.trustedResources && content.verifiedResources.length > 0
                ? content.verifiedResources
                    .filter((r) => r.type !== 'Interactive Exercise' && r.type !== 'Free Online Course')
                    .slice(0, 2)
                    .map((r) => ({ ...r, category: 'tutorial' as const, matchScope: 'exact' as const }))
                : [];

            const fallbackPractice: TrustedResourceItem[] =
              !content.trustedResources && content.verifiedResources.length > 0
                ? content.verifiedResources
                    .filter((r) => r.type === 'Interactive Exercise' || r.type === 'Free Online Course')
                    .slice(0, 2)
                    .map((r) => ({ ...r, category: 'practice' as const, matchScope: 'exact' as const }))
                : [];

            const videos = content.trustedResources?.videos ?? [];
            const tutorials = content.trustedResources?.tutorials ?? fallbackTutorials;
            const practice = content.trustedResources?.practice ?? fallbackPractice;
            const totalResourceCount = videos.length + tutorials.length + practice.length;
            const usedBroaderFallback = [...videos, ...tutorials, ...practice].some(
              (item) => item.matchScope === 'broader'
            );

            const resourceTabs: {
              key: 'videos' | 'tutorials' | 'practice';
              label: string;
              count: number;
              icon: React.ReactNode;
              activeBg: string;
            }[] = [
              {
                key: 'videos',
                label: 'Watch Videos',
                count: videos.length,
                icon: <Youtube className="w-3.5 h-3.5 shrink-0" />,
                activeBg: 'bg-[#A78BCE] text-white shadow-xs',
              },
              {
                key: 'tutorials',
                label: 'Read Tutorials',
                count: tutorials.length,
                icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
                activeBg: 'bg-[#73B082] text-white shadow-xs',
              },
              {
                key: 'practice',
                label: 'Courses & Practice',
                count: practice.length,
                icon: <GraduationCap className="w-3.5 h-3.5 shrink-0" />,
                activeBg: 'bg-[#D17865] text-white shadow-xs',
              },
            ];

            return (
              <div className="space-y-5">
                <div className="pastel-card p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ClayIconBadge variant="mint" size="md">
                        <BookOpen className="w-5 h-5" />
                      </ClayIconBadge>
                      <div>
                        <h2 className="font-display text-lg font-extrabold text-[#343047]">
                          Learn from Trusted Sources
                        </h2>
                        <p className="text-xs text-[#8B8295]">
                          Verified YouTube videos, official documentation, and free online courses matched to this lesson
                        </p>
                      </div>
                    </div>

                    {usedBroaderFallback && totalResourceCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7A5B1C]">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Includes Broader Topic Resources</span>
                      </span>
                    )}
                  </div>

                  {/* 3 Soft Pastel Resource Sub-Tabs (Equally Distributed) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-[#FAF6F2] border border-[#EEE6E5] rounded-2xl">
                    {resourceTabs.map((tab) => {
                      const isActive = activeResourceTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveResourceTab(tab.key)}
                          className={`w-full px-2.5 sm:px-3.5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                            isActive
                              ? tab.activeBg
                              : 'text-[#6B6178] hover:text-[#343047] hover:bg-[#FFFCFA]'
                          }`}
                        >
                          {tab.icon}
                          <span>{tab.label}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : 'bg-[#EEE6E5]/80 text-[#5E5468]'
                            }`}
                          >
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Watch Videos */}
                  {activeResourceTab === 'videos' && (
                    <div className="space-y-4">
                      {content.trustedResources?.videoCoverageNote && (
                        <div className="px-4 py-2.5 rounded-[16px] bg-[#F7F3FC] border border-[#E5DAF5] text-xs text-[#5E5468] leading-relaxed">
                          {content.trustedResources.videoCoverageNote}
                        </div>
                      )}

                      {videos.length === 0 ? (
                        <div className="p-6 rounded-[22px] bg-[#F7F3FC] border border-[#E5DAF5] text-center space-y-2">
                          <p className="font-display text-sm font-extrabold text-[#343047]">
                            No verified YouTube video matched this specific lesson yet.
                          </p>
                          <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                            Skillora only links verified educational videos. Check the Read Tutorials tab or use the Learn tab for the full study guide.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          {videos.map((video) => {
                            const isPlaying =
                              Boolean(video.embedAllowed && video.videoId) &&
                              playingVideoId === video.id;

                            return (
                              <div
                                key={video.id}
                                className="rounded-[24px] bg-gradient-to-br from-[#FFFCFA] via-[#FAF6F2] to-[#F3ECFC] border border-[#E2D6F5] p-4 sm:p-5 flex flex-col justify-between gap-4"
                                style={{
                                  boxShadow: '0 10px 24px -12px rgba(142, 110, 200, 0.22)',
                                }}
                              >
                                <div className="space-y-3.5">
                                  {isPlaying && video.embedUrl ? (
                                    <div className="space-y-2">
                                      <div className="relative w-full aspect-video rounded-[18px] overflow-hidden border border-[#D8C9F2] bg-[#1F1B2E]">
                                        <iframe
                                          src={video.embedUrl}
                                          title={video.title}
                                          className="w-full h-full"
                                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                          allowFullScreen
                                        />
                                      </div>
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => setPlayingVideoId(null)}
                                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFFCFA] border border-[#E2D6F5] text-[11px] font-bold text-[#6F4FA8] hover:bg-[#F0E9FA]"
                                        >
                                          <X className="w-3 h-3" />
                                          <span>Close Player</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : video.thumbnailUrl ? (
                                    <div className="relative w-full aspect-video rounded-[18px] overflow-hidden border border-[#E5DAF5] bg-[#EDE5F8] group">
                                      <img
                                        src={video.thumbnailUrl}
                                        alt={`${video.title} thumbnail`}
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-[#2B263B]/45 via-transparent to-transparent" />
                                      {video.embedAllowed && video.embedUrl ? (
                                        <button
                                          type="button"
                                          onClick={() => setPlayingVideoId(video.id)}
                                          aria-label={`Play ${video.title}`}
                                          className="absolute inset-0 flex items-center justify-center group"
                                        >
                                          <span className="w-14 h-14 rounded-full bg-[#FFFCFA]/95 text-[#7B59B6] flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                                            <Play className="w-6 h-6 fill-[#7B59B6] ml-0.5" />
                                          </span>
                                        </button>
                                      ) : (
                                        <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-[#2B263B]/85 text-white text-[10px] font-bold">
                                          External Watch Only
                                        </span>
                                      )}
                                      {video.duration && (
                                        <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-[#2B263B]/85 text-white text-[10px] font-mono font-bold">
                                          {video.duration}
                                        </span>
                                      )}
                                    </div>
                                  ) : null}

                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-[11px] font-semibold text-[#7B7188] flex-wrap">
                                      <span className="font-bold text-[#6F4FA8]">{video.provider}</span>
                                      {video.learningPurpose && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="px-2 py-0.5 rounded-full bg-[#EFE7FA] text-[#5D3F92] font-bold text-[10px]">
                                            {video.learningPurpose}
                                          </span>
                                        </>
                                      )}
                                      {video.duration && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="font-mono">{video.duration}</span>
                                        </>
                                      )}
                                      {video.matchScope === 'broader' && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="text-[#7A5B1C] font-bold">Broader Topic</span>
                                        </>
                                      )}
                                    </div>

                                    <h3 className="font-display text-base font-extrabold text-[#343047] leading-snug">
                                      {video.title}
                                    </h3>
                                    <p className="text-xs text-[#5E5468] leading-relaxed">
                                      {video.description}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[#E9DFF5]">
                                  {video.embedAllowed && video.embedUrl ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPlayingVideoId((prev) =>
                                            prev === video.id ? null : video.id
                                          )
                                        }
                                        className="clay-button-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                                      >
                                        <PlayCircle className="w-3.5 h-3.5" />
                                        <span>{isPlaying ? 'Hide Video Player' : 'Watch Video'}</span>
                                      </button>
                                      <a
                                        href={video.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5"
                                      >
                                        <span>Watch on YouTube</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </>
                                  ) : (
                                    <a
                                      href={video.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="clay-button-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                                    >
                                      <Youtube className="w-3.5 h-3.5" />
                                      <span>Watch on YouTube</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Read Tutorials */}
                  {activeResourceTab === 'tutorials' && (
                    tutorials.length === 0 ? (
                      <div className="p-6 rounded-[22px] bg-[#EFF7EE] border border-[#CFE4CC] text-center space-y-2">
                        <p className="font-display text-sm font-extrabold text-[#343047]">
                          No verified written tutorial matched this specific lesson yet.
                        </p>
                        <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                          We only link verified documentation and open educational portals—check the Learn tab for explanations and examples tailored to your level.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tutorials.map((res) => (
                          <div
                            key={res.id}
                            className="p-5 rounded-[24px] bg-gradient-to-br from-[#FFFCFA] via-[#FAF6F2] to-[#EEF7EE] border border-[#CFE4CC] flex flex-col justify-between gap-4"
                            style={{
                              boxShadow: '0 10px 24px -12px rgba(105, 165, 118, 0.2)',
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5E5468] flex-wrap">
                                <span className="font-bold text-[#2F5B37]">{res.provider}</span>
                                <span aria-hidden="true">·</span>
                                <span>{res.type}</span>
                                {res.matchScope === 'broader' && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-[#7A5B1C] font-bold">Broader Topic</span>
                                  </>
                                )}
                              </div>

                              <h3 className="font-display text-base font-extrabold text-[#343047] leading-snug">
                                {res.title}
                              </h3>
                              <p className="text-xs text-[#5E5468] leading-relaxed">
                                {res.description}
                              </p>
                              {res.duration && (
                                <p className="text-[11px] font-mono font-bold text-[#4B7553] inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Estimated time: {res.duration}</span>
                                </p>
                              )}
                            </div>

                            <div className="pt-3 border-t border-[#DFECDD]">
                              <a
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[14px] bg-[#62A472] hover:bg-[#539363] text-white text-xs font-extrabold transition-colors shadow-xs"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Read Tutorial</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {/* Courses & Interactive Practice */}
                  {activeResourceTab === 'practice' && (
                    practice.length === 0 ? (
                      <div className="p-6 rounded-[22px] bg-[#FFF8F6] border border-[#F2CFC7] text-center space-y-2">
                        <p className="font-display text-sm font-extrabold text-[#343047]">
                          No verified external course or interactive platform matched this specific lesson yet.
                        </p>
                        <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                          Skillora only links verified platforms matched to your subject. Open Practice & Quiz for guided exercises and your Knowledge Check quiz.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {practice.map((res) => (
                          <div
                            key={res.id}
                            className="p-5 rounded-[24px] bg-gradient-to-br from-[#FFFCFA] via-[#FAF6F2] to-[#FFF2EE] border border-[#F2CFC7] flex flex-col justify-between gap-4"
                            style={{
                              boxShadow: '0 10px 24px -12px rgba(209, 120, 101, 0.2)',
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5E5468] flex-wrap">
                                <span className="font-bold text-[#B45343]">{res.provider}</span>
                                <span aria-hidden="true">·</span>
                                <span>{res.type}</span>
                                {res.matchScope === 'broader' && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-[#7A5B1C] font-bold">Broader Topic</span>
                                  </>
                                )}
                              </div>

                              <h3 className="font-display text-base font-extrabold text-[#343047] leading-snug">
                                {res.title}
                              </h3>
                              <p className="text-xs text-[#5E5468] leading-relaxed">
                                {res.description}
                              </p>
                              {res.duration && (
                                <p className="text-[11px] font-mono font-bold text-[#9E5647] inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Estimated time: {res.duration}</span>
                                </p>
                              )}
                            </div>

                            <div className="pt-3 border-t border-[#F4DFDA]">
                              <a
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[14px] bg-[#D17865] hover:bg-[#BF6856] text-white text-xs font-extrabold transition-colors shadow-xs"
                              >
                                <GraduationCap className="w-3.5 h-3.5" />
                                <span>
                                  {res.type === 'Free Online Course'
                                    ? 'Open Free Course'
                                    : 'Start Practice'}
                                </span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveSection('practice_quiz')}
                    className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
                  >
                    <span>Go to Practice & Quiz</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ===============================================================
              TAB 3: PRACTICE & QUIZ (Guided Exercises + Knowledge Check Quiz)
             =============================================================== */}
          {activeSection === 'practice_quiz' && (
            <div className="space-y-8">
              {/* PART 1: GUIDED EXERCISES */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap px-1">
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-[#343047]">
                      Guided Practice Exercises
                    </h2>
                    <p className="text-xs text-[#8B8295]">
                      Work through these hands-on prompts and compare your work with the expected outcome
                    </p>
                  </div>
                </div>

                {content.isProgrammingTopic && (
                  <div className="rounded-[18px] bg-[#FFF1D6]/75 border border-[#F3DFB4] p-4 text-xs text-[#6B5220] flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#A37327] shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <span className="font-bold">Self-Guided Practice: </span>
                      Try these coding exercises in your local editor, terminal, or notebook, then compare your results with the expected outcome below. Skillora does not run or auto-grade live code here.
                    </p>
                  </div>
                )}

                {content.guidedExercises.map((ex, idx) => (
                  <div key={idx} className="pastel-card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <ClayIconBadge variant="peach" size="sm">
                        <Wrench className="w-4 h-4" />
                      </ClayIconBadge>
                      <div>
                        <span className="text-[11px] font-bold text-[#C26D5B]">
                          Guided Exercise {idx + 1}
                        </span>
                        <h3 className="font-display text-base font-extrabold text-[#343047]">
                          {ex.title}
                        </h3>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-[#343047] leading-relaxed">{ex.prompt}</p>

                    <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-2">
                      <p className="text-xs font-extrabold text-[#343047]">Step-by-Step Guide:</p>
                      <ol className="space-y-1.5 list-decimal list-inside text-xs text-[#5E5468]">
                        {ex.steps.map((s, sIdx) => (
                          <li key={sIdx} className="leading-relaxed">
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#6B6178] block">
                        Your Study Scratchpad / Draft (local session notes):
                      </label>
                      <textarea
                        rows={4}
                        value={practiceNotes[idx] ?? ''}
                        onChange={(e) =>
                          setPracticeNotes((prev) => ({ ...prev, [idx]: e.target.value }))
                        }
                        placeholder="Draft your code, outline, or reasoning here as you work through the steps..."
                        className="w-full p-3.5 rounded-[16px] bg-[#FFFCFA] border border-[#E6DCD9] text-xs font-mono text-[#343047] focus:outline-none focus:border-[#A78BCE]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedHints((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5"
                      >
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>
                          {revealedHints[idx]
                            ? 'Hide Hint & Expected Outcome'
                            : 'Show Hint & Expected Outcome'}
                        </span>
                      </button>
                    </div>

                    {revealedHints[idx] && (
                      <div className="space-y-2.5 pt-1">
                        <div className="p-3.5 rounded-[16px] bg-[#FFF1D6]/65 border border-[#F3DFB4] text-xs text-[#6B5220]">
                          <span className="font-extrabold">Hint: </span>
                          {ex.hint}
                        </div>
                        <div className="p-3.5 rounded-[16px] bg-[#DCECD9]/60 border border-[#C2DFBC] text-xs text-[#2F4F35]">
                          <span className="font-extrabold">Expected Outcome: </span>
                          {ex.expectedOutcome}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* PART 2: SERVER-VALIDATED LESSON KNOWLEDGE CHECK */}
              <LessonKnowledgeCheckSection
                roadmapId={roadmap.id}
                stageId={stage.id}
                lesson={lesson}
                lessonAttempts={lessonKnowledgeCheckAttempts}
                onAttemptSaved={(attempt, durationSeconds) => {
                  if (onKnowledgeCheckSaved) {
                    onKnowledgeCheckSaved(attempt, durationSeconds);
                  }
                }}
                onFocusLearn={() => {
                  setActiveSection('learn');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onFocusPractice={() => {
                  setActiveSection('practice_quiz');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onOpenResources={() => {
                  setActiveSection('resources');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onGoToNextLesson={(targetStageId, targetLessonId) => {
                  if (targetStageId && targetLessonId && onOpenTargetLesson) {
                    onOpenTargetLesson(targetStageId, targetLessonId);
                  } else {
                    onNextLesson();
                  }
                }}
                hasNextLesson={hasNextLesson}
              />
            </div>
          )}

          {/* Persistent Bottom Lesson Controls */}
          <div className="pastel-card p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleReturnToCourse}
                className="clay-button-soft px-3.5 py-2.5 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5 justify-center"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Course</span>
              </button>
              <button
                type="button"
                onClick={onPreviousLesson}
                disabled={!hasPreviousLesson}
                className="clay-button-soft px-4 py-2.5 text-xs font-bold text-[#343047] flex items-center gap-1.5 disabled:opacity-45 flex-1 sm:flex-initial justify-center"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous Lesson</span>
              </button>
            </div>

            {lesson.completed ? (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                <span className="px-5 py-2.5 rounded-[16px] text-xs font-extrabold flex items-center justify-center gap-2 bg-[#DCECD9] border border-[#BBDAB6] text-[#2F5B37]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {lesson.completedAt
                      ? `Completed · ${formatLessonCompletedTimestamp(lesson.completedAt)}`
                      : 'Completed'}
                  </span>
                </span>
                {!isArchivedRoadmap && (
                  <button
                    type="button"
                    onClick={() => void onToggleComplete(false)}
                    disabled={isSavingCompletion}
                    className="clay-button-soft px-3 py-2.5 text-xs font-bold text-[#6B6178] hover:text-[#343047] disabled:opacity-50"
                  >
                    {isSavingCompletion ? 'Saving...' : 'Undo'}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const current = activeVisitSessionRef.current;
                  if (current && onRecordStudySession && current.activeSeconds > 0) {
                    const honestDuration = Math.max(1, current.activeSeconds);
                    onRecordStudySession({
                      clientSessionId: current.clientSessionId,
                      roadmapId: roadmap.id,
                      stageId: stage.id,
                      lessonId: lesson.id,
                      lessonTitle: lesson.title,
                      durationSeconds: honestDuration,
                      startedAt: current.startedAt,
                      endedAt: new Date().toISOString(),
                      completed: true,
                    });
                    current.lastSavedSeconds = honestDuration;
                  }
                  void onToggleComplete(true);
                }}
                disabled={isSavingCompletion}
                className="clay-button-primary px-5 py-2.5 rounded-[16px] text-xs font-extrabold flex items-center justify-center gap-2 transition-all w-full sm:w-auto disabled:opacity-60"
              >
                {isSavingCompletion ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
                <span>{isSavingCompletion ? 'Saving Progress...' : 'Mark Done'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNextLesson}
              disabled={!hasNextLesson}
              className="clay-button-soft px-4 py-2.5 text-xs font-bold text-[#343047] flex items-center gap-1.5 disabled:opacity-45 w-full sm:w-auto justify-center"
            >
              <span>Next Lesson</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
