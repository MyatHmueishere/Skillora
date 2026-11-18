import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Award,
  Clock,
  Flame,
  CheckCircle2,
  Circle,
  Sparkles,
  TrendingUp,
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Layers,
  BookOpen,
  PlayCircle,
  Lightbulb,
  Calendar,
} from 'lucide-react';
import {
  UserProfile,
  AssessmentAttemptRecord,
  AppView,
  LearningRoadmapRecord,
  LessonKnowledgeCheckAttemptRecord,
  LearningSessionRecord,
  AchievementSummaryPayload,
} from '../../types';
import {
  WEEKLY_ACTIVITY_DATA,
  SKILL_OVERVIEW_DATA,
} from '../../data/mockData';
import { formatAssessmentDate } from '../../lib/assessmentAttempts';
import {
  computeAttemptImprovement,
  computeKnowledgeCheckSummary,
  formatKnowledgeCheckDate,
} from '../../lib/knowledgeChecks';
import {
  computeLearningActivityMetrics,
  computeAssessmentPerformanceAnalytics,
  generatePersonalizedLearningInsights,
  formatSessionDateTime,
  formatStudyDuration,
} from '../../lib/progressAnalytics';
import { buildComputedAchievementsFallback } from '../../lib/achievements';
import {
  computeRoadmapStats,
  formatLessonCompletedTimestamp,
} from '../roadmap/roadmapUiHelpers';
import {
  ClayIconBadge,
  BooksTrophy3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';
import { AchievementsSection } from '../achievements/AchievementsSection';

export type ProgressTabId = 'overview' | 'assessments' | 'knowledge_checks' | 'badges';

interface ProgressViewProps {
  user: UserProfile;
  isAuthenticated?: boolean;
  attempts?: AssessmentAttemptRecord[];
  attemptsLoading?: boolean;
  attemptsError?: string;
  knowledgeCheckAttempts?: LessonKnowledgeCheckAttemptRecord[];
  knowledgeChecksLoading?: boolean;
  knowledgeChecksError?: string;
  learningSessions?: LearningSessionRecord[];
  sessionsLoading?: boolean;
  sessionsError?: string;
  activeRoadmap?: LearningRoadmapRecord | null;
  archivedRoadmaps?: LearningRoadmapRecord[];
  roadmapsLoading?: boolean;
  timeZone?: string;
  initialTab?: ProgressTabId;
  achievementsSummary?: AchievementSummaryPayload | null;
  achievementsLoading?: boolean;
  achievementsError?: string;
  onRefreshAchievements?: () => void;
  onRefreshAttempts?: () => void;
  onRefreshKnowledgeChecks?: () => void;
  onRefreshSessions?: () => void;
  onOpenLesson?: (stageId: string, lessonId: string) => void;
  onNavigate: (view: AppView) => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  user,
  isAuthenticated = false,
  attempts = [],
  attemptsLoading = false,
  attemptsError = '',
  knowledgeCheckAttempts = [],
  knowledgeChecksLoading = false,
  knowledgeChecksError = '',
  learningSessions = [],
  sessionsLoading = false,
  sessionsError = '',
  activeRoadmap = null,
  archivedRoadmaps = [],
  roadmapsLoading = false,
  timeZone,
  initialTab = 'overview',
  achievementsSummary = null,
  achievementsLoading = false,
  achievementsError = '',
  onRefreshAchievements,
  onRefreshAttempts,
  onRefreshKnowledgeChecks,
  onRefreshSessions,
  onOpenLesson,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<ProgressTabId>(initialTab);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [expandedKnowledgeCheckId, setExpandedKnowledgeCheckId] = useState<string | null>(
    null
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const roadmapStats = computeRoadmapStats(activeRoadmap);
  const kcSummary = computeKnowledgeCheckSummary(knowledgeCheckAttempts);
  const activityMetrics = computeLearningActivityMetrics(learningSessions);
  const assessmentPerf = computeAssessmentPerformanceAnalytics(
    attempts,
    knowledgeCheckAttempts
  );

  const personalizedInsights = isAuthenticated
    ? generatePersonalizedLearningInsights({
        activeRoadmap,
        roadmapStats,
        assessmentPerf,
        activityMetrics,
      })
    : [];

  const resolvedAchievementsSummary: AchievementSummaryPayload =
    achievementsSummary ??
    buildComputedAchievementsFallback({
      authenticated: isAuthenticated,
      roadmaps: [activeRoadmap, ...archivedRoadmaps].filter(
        (r): r is LearningRoadmapRecord => Boolean(r)
      ),
      knowledgeCheckAttempts,
      learningSessions,
      assessmentAttempts: attempts,
      timeZone,
    });

  const stageBarColors = ['#A78BCE', '#73B082', '#E58D7A', '#E2AC4C', '#9B7ACE', '#6FA9B8'];

  const realOverallProgress = isAuthenticated
    ? roadmapStats.progressPercent
    : user.overallProgress;

  const realCompletedLessons = (activeRoadmap?.roadmapData.stages ?? []).flatMap(
    (stage, stageIdx) =>
      stage.lessons
        .filter((lesson) => lesson.completed)
        .map((lesson) => ({
          id: `${stage.id}-${lesson.id}`,
          stageId: stage.id,
          lessonId: lesson.id,
          title: lesson.title,
          stage: `Stage ${stageIdx + 1}`,
          stageTitle: stage.title,
          estimatedTime: lesson.estimatedTime || '—',
          completedAt: lesson.completedAt ?? null,
        }))
  );

  const maxDailyMinutes = Math.max(
    1,
    ...activityMetrics.dailyActivity.map((d) => d.minutes)
  );
  const maxWeeklyMinutes = Math.max(
    1,
    ...activityMetrics.weeklyActivity.map((w) => w.minutes)
  );
  const maxDemoHours = Math.max(...WEEKLY_ACTIVITY_DATA.map((d) => d.hours));

  const insightCardStyle = (
    tone: 'lavender' | 'mint' | 'yellow' | 'peach'
  ): { wrapper: string; variant: ClayColorVariant } => {
    switch (tone) {
      case 'mint':
        return {
          wrapper: 'bg-[#DCECD9]/55 border-[#C2DFBC]',
          variant: 'mint',
        };
      case 'yellow':
        return {
          wrapper: 'bg-[#FFF1D6]/65 border-[#F3DFB4]',
          variant: 'yellow',
        };
      case 'peach':
        return {
          wrapper: 'bg-[#FCEAE5]/65 border-[#F5D3CA]',
          variant: 'peach',
        };
      case 'lavender':
      default:
        return {
          wrapper: 'bg-[#F0E9FA]/70 border-[#E2D6F5]',
          variant: 'lavender',
        };
    }
  };

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div
        className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
        style={{
          background: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 55%, #FFF1D6 100%)',
          boxShadow: '0 12px 30px -12px rgba(154, 126, 200, 0.25)',
        }}
      >
        <div className="flex items-center gap-5">
          <BooksTrophy3D className="w-24 h-20 hidden sm:block shrink-0" />
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6F4FA8] bg-[#FFFCFA] px-3 py-1 rounded-full border border-[#E2D6F5]">
              <BarChart3 className="w-3.5 h-3.5 text-[#9B7ACE]" />
              <span>Student Progress &amp; Learning Analytics</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              My Learning Progress
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6178] max-w-xl leading-relaxed">
              {isAuthenticated
                ? 'Track your stage completion, lesson progress, assessment growth, study sessions, and personalized insights.'
                : 'Preview Skillora progress tracking and sign in to save your real roadmap completion, assessments, and study streaks.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('roadmap')}
            className="clay-button-soft px-4 py-2.5 text-xs font-bold text-[#6F4FA8]"
          >
            My Learning Path
          </button>
          <button
            type="button"
            onClick={() => onNavigate('assessment')}
            className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Take Diagnostic</span>
          </button>
        </div>
      </div>

      {/* 4 Pastel KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[22px] bg-[#F0E9FA] border border-[#E2D6F5] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="lavender" size="md">
            <TrendingUp className="w-5 h-5" />
          </ClayIconBadge>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#6F4FA8]">Overall Progress</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {isAuthenticated && roadmapsLoading && !activeRoadmap
                ? '—'
                : `${realOverallProgress}%`}
            </p>
            <span className="text-[10px] font-semibold text-[#6B6178] block truncate">
              {isAuthenticated
                ? activeRoadmap
                  ? `${roadmapStats.completedLessons}/${roadmapStats.totalLessons} lessons · ${roadmapStats.remainingLessons} left`
                  : 'No active roadmap'
                : 'Demo metric'}
            </span>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#DCECD9] border border-[#C2DFBC] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="mint" size="md">
            <Clock className="w-5 h-5" />
          </ClayIconBadge>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#3C7347]">Tracked Study Time</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {isAuthenticated
                ? sessionsLoading && learningSessions.length === 0
                  ? '—'
                  : activityMetrics.totalStudyHoursFormatted
                : '—'}
            </p>
            <span className="text-[10px] font-semibold text-[#4D6E54] block truncate">
              {isAuthenticated
                ? `${activityMetrics.totalCompletedSessions} ${
                    activityMetrics.totalCompletedSessions === 1 ? 'session' : 'sessions'
                  } · ${activityMetrics.thisWeekMinutes}m this wk`
                : 'Sign in to track'}
            </span>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#FFF1D6] border border-[#F3DFB4] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="yellow" size="md">
            <Flame className="w-5 h-5 fill-white" />
          </ClayIconBadge>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#8E6521]">Learning Streak</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {isAuthenticated
                ? sessionsLoading && learningSessions.length === 0
                  ? '—'
                  : `${activityMetrics.currentStreakDays} ${
                      activityMetrics.currentStreakDays === 1 ? 'day' : 'days'
                    }`
                : '—'}
            </p>
            <span className="text-[10px] font-semibold text-[#8E6D36] block truncate">
              {isAuthenticated
                ? activityMetrics.longestStreakDays > 0
                  ? `Best: ${activityMetrics.longestStreakDays}d · ${
                      activityMetrics.activeToday ? 'Active today' : 'Study today'
                    }`
                  : 'Complete a lesson to start'
                : 'Sign in to track'}
            </span>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#FCEAE5] border border-[#F5D3CA] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="peach" size="md">
            <Award className="w-5 h-5" />
          </ClayIconBadge>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#9C5042]">Best Assessment</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {assessmentPerf.bestOverallScore !== null
                ? `${assessmentPerf.bestOverallScore}%`
                : '—'}
            </p>
            <span className="text-[10px] font-semibold text-[#9C5042] block truncate">
              {isAuthenticated
                ? `${assessmentPerf.totalAttempts} total ${
                    assessmentPerf.totalAttempts === 1 ? 'attempt' : 'attempts'
                  }`
                : 'Sign in to track'}
            </span>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-full w-fit shadow-2xs flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'overview'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          Progress &amp; Analytics
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assessments')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors flex items-center gap-1.5 ${
            activeTab === 'assessments'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          <span>Assessment History</span>
          {attempts.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'assessments'
                  ? 'bg-white/25 text-white'
                  : 'bg-[#F0E9FA] text-[#6F4FA8]'
              }`}
            >
              {attempts.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('knowledge_checks')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors flex items-center gap-1.5 ${
            activeTab === 'knowledge_checks'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          <span>Knowledge Check History</span>
          {knowledgeCheckAttempts.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'knowledge_checks'
                  ? 'bg-white/25 text-white'
                  : 'bg-[#F0E9FA] text-[#6F4FA8]'
              }`}
            >
              {knowledgeCheckAttempts.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('badges')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors flex items-center gap-1.5 ${
            activeTab === 'badges'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          <span>Achievements &amp; XP</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'badges'
                ? 'bg-white/25 text-white'
                : 'bg-[#F0E9FA] text-[#6F4FA8]'
            }`}
          >
            {resolvedAchievementsSummary.totalXp} XP
          </span>
        </button>
      </div>

      {/* TAB 1: OVERALL PROGRESS, ALL STAGES, ASSESSMENT PERFORMANCE, ACTIVITY & INSIGHTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* SECTION 1: OVERALL LEARNING PROGRESS SUMMARY CARD */}
          <div className="pastel-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ClayIconBadge variant="lavender" size="md">
                  <Layers className="w-5 h-5" />
                </ClayIconBadge>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-[#343047]">
                    Overall Learning Progress
                  </h2>
                  <p className="text-xs text-[#8B8295]">
                    {isAuthenticated
                      ? activeRoadmap
                        ? `${activeRoadmap.title} · ${activeRoadmap.careerGoal}`
                        : 'Generate a personalized learning path to track real lesson & stage completion'
                      : 'Sample learning path summary preview'}
                  </p>
                </div>
              </div>

              <span className="px-3.5 py-1.5 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#6F4FA8] font-mono text-sm font-extrabold tabular-nums w-fit">
                {realOverallProgress}% Complete
              </span>
            </div>

            {/* Simple Full-Width Pastel Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-3.5 rounded-full bg-[#F1EAE8] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, realOverallProgress))}%`,
                    background: 'linear-gradient(90deg, #A78BCE 0%, #8CC697 100%)',
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#7B7188]">
                <span>0%</span>
                <span>
                  {isAuthenticated
                    ? activeRoadmap
                      ? `${roadmapStats.completedLessons} of ${roadmapStats.totalLessons} lessons finished`
                      : '0 lessons tracked yet'
                    : 'Sample 6-stage preview'}
                </span>
                <span>100%</span>
              </div>
            </div>

            {/* 6 Summary Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                <p className="text-[11px] font-bold text-[#8B8295]">Completion</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {realOverallProgress}%
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#DCECD9]/45 border border-[#C2DFBC]">
                <p className="text-[11px] font-bold text-[#356640]">Completed Lessons</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {isAuthenticated ? roadmapStats.completedLessons : 8}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                <p className="text-[11px] font-bold text-[#8B8295]">Total Lessons</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {isAuthenticated ? roadmapStats.totalLessons : 18}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#F0E9FA]/65 border border-[#E2D6F5]">
                <p className="text-[11px] font-bold text-[#6F4FA8]">Completed Stages</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {isAuthenticated
                    ? `${roadmapStats.completedStages}/${roadmapStats.totalStages}`
                    : '2/6'}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#FFF1D6]/60 border border-[#F3DFB4]">
                <p className="text-[11px] font-bold text-[#855C1C]">Remaining Lessons</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {isAuthenticated ? roadmapStats.remainingLessons : 10}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#FCEAE5]/60 border border-[#F5D3CA]">
                <p className="text-[11px] font-bold text-[#9C5042]">Active Stage</p>
                <p
                  className="font-display text-xs font-extrabold text-[#343047] mt-1 leading-snug line-clamp-2"
                  title={
                    isAuthenticated
                      ? roadmapStats.currentStageTitle || 'None'
                      : 'Functions & Data'
                  }
                >
                  {isAuthenticated
                    ? roadmapStats.currentStageTitle
                      ? `Stage ${roadmapStats.currentStageNumber}: ${roadmapStats.currentStageTitle}`
                      : 'Not started'
                    : 'Stage 3: Functions'}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: STAGE PROGRESS TRACKING (ALL STAGES - EXPANDABLE) */}
          <div className="pastel-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-display text-lg font-extrabold text-[#343047]">
                  Stage Progress Tracking
                </h2>
                <p className="text-xs text-[#8B8295]">
                  {isAuthenticated
                    ? activeRoadmap
                      ? `Showing all ${activeRoadmap.roadmapData.stages.length} learning stages — click any stage to inspect individual lessons`
                      : 'No active learning roadmap yet'
                    : 'Sample multi-stage progress preview'}
                </p>
              </div>
              {isAuthenticated &&
                roadmapStats.nextIncompleteStageId &&
                roadmapStats.nextIncompleteLessonId &&
                onOpenLesson && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenLesson(
                        roadmapStats.nextIncompleteStageId!,
                        roadmapStats.nextIncompleteLessonId!
                      )
                    }
                    className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Continue Next Lesson</span>
                  </button>
                )}
            </div>

            {isAuthenticated ? (
              roadmapsLoading && !activeRoadmap ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs font-bold text-[#8E6EC8]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading your learning stages...</span>
                </div>
              ) : !activeRoadmap ? (
                <div className="p-7 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-3">
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    No active learning roadmap found
                  </p>
                  <p className="text-xs text-[#6B6178] max-w-md mx-auto">
                    Generate your personalized learning roadmap in My Learning Path to track completion across every stage and lesson.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('roadmap')}
                    className="clay-button-primary px-5 py-2 text-xs font-bold"
                  >
                    Create Learning Path
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeRoadmap.roadmapData.stages.map((stage, stageIdx) => {
                    const stat = roadmapStats.stageStats[stageIdx];
                    const totalLessons = stat?.totalLessons ?? stage.lessons.length;
                    const completedLessons =
                      stat?.completedLessons ??
                      stage.lessons.filter((l) => l.completed).length;
                    const progressPercent =
                      stat?.progressPercent ??
                      (totalLessons > 0
                        ? Math.round((completedLessons / totalLessons) * 100)
                        : 0);
                    const status = stat?.status ?? stage.status;
                    const isExpanded = expandedStageId === stage.id;

                    const statusBadge =
                      status === 'completed'
                        ? {
                            label: 'Completed',
                            cls: 'bg-[#DCECD9] text-[#2F5B37] border-[#BBDAB6]',
                          }
                        : status === 'in_progress'
                        ? {
                            label: 'In Progress',
                            cls: 'bg-[#F0E9FA] text-[#6F4FA8] border-[#D8C9F2]',
                          }
                        : {
                            label: 'Upcoming',
                            cls: 'bg-[#FAF6F2] text-[#7B7188] border-[#E6DCD9]',
                          };

                    return (
                      <div
                        key={stage.id}
                        className="rounded-[20px] border border-[#EEE6E5] bg-[#FAF6F2]/75 overflow-hidden transition-all"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStageId(isExpanded ? null : stage.id)
                          }
                          className="w-full p-4 sm:p-5 text-left hover:bg-[#F0E9FA]/30 transition-colors space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11px] font-extrabold text-[#6F4FA8]">
                                  Stage {stageIdx + 1}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-[#FFFCFA] border border-[#E6DCD9] text-[10px] font-bold text-[#6B6178]">
                                  {stage.difficulty}
                                </span>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold ${statusBadge.cls}`}
                                >
                                  {statusBadge.label}
                                </span>
                              </div>
                              <h3 className="font-display text-sm sm:text-base font-extrabold text-[#343047]">
                                {stage.title}
                              </h3>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                              <div className="text-left sm:text-right">
                                <p className="font-mono text-xs font-extrabold text-[#343047] tabular-nums">
                                  {completedLessons}/{totalLessons} lessons
                                </p>
                                <p className="text-[11px] font-bold text-[#6F4FA8] tabular-nums">
                                  {progressPercent}%
                                </p>
                              </div>
                              <span className="text-[#8E6EC8]">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Simple Stage Progress Bar */}
                          <div className="w-full h-2.5 rounded-full bg-[#EDE6E3] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${progressPercent}%`,
                                backgroundColor:
                                  stageBarColors[stageIdx % stageBarColors.length],
                              }}
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-[#EEE6E5] bg-[#FFFCFA] space-y-2">
                            {stage.lessons.map((lesson, lIdx) => (
                              <div
                                key={lesson.id}
                                className="p-3 rounded-[14px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  {lesson.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-[#4B8B59] shrink-0 mt-0.5" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-[#C5BCD0] shrink-0 mt-0.5" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[#343047]">
                                      {lIdx + 1}. {lesson.title}
                                    </p>
                                    <p className="text-[11px] text-[#8B8295]">
                                      Est. {lesson.estimatedTime}
                                      {lesson.completed && lesson.completedAt
                                        ? ` · Completed ${formatLessonCompletedTimestamp(
                                            lesson.completedAt
                                          )}`
                                        : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      lesson.completed
                                        ? 'bg-[#DCECD9] text-[#2F5B37]'
                                        : 'bg-[#FFFCFA] border border-[#E6DCD9] text-[#7B7188]'
                                    }`}
                                  >
                                    {lesson.completed ? 'Done' : 'Not started'}
                                  </span>
                                  {onOpenLesson && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenLesson(stage.id, lesson.id)}
                                      className="clay-button-soft px-3 py-1 text-[11px] font-bold text-[#6F4FA8]"
                                    >
                                      {lesson.completed ? 'Review' : 'Study'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-3">
                {SKILL_OVERVIEW_DATA.map((s, idx) => (
                  <div
                    key={s.name}
                    className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#343047]">
                        Stage {idx + 1}: {s.name}
                      </span>
                      <span className="font-mono font-bold text-[#6F4FA8] tabular-nums">
                        {s.level}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-[#EDE6E3] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.level}%`,
                          backgroundColor:
                            stageBarColors[idx % stageBarColors.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: ASSESSMENT PERFORMANCE + LEARNING ACTIVITY (2-COLUMN GRID) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Assessment Performance Summary Card */}
            <div className="lg:col-span-6 pastel-card p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <ClayIconBadge variant="peach" size="md">
                      <Target className="w-5 h-5" />
                    </ClayIconBadge>
                    <div>
                      <h2 className="font-display text-lg font-extrabold text-[#343047]">
                        Assessment Performance
                      </h2>
                      <p className="text-xs text-[#8B8295]">
                        Diagnostic assessments &amp; lesson knowledge checks combined
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('assessments')}
                    className="text-xs font-bold text-[#6F4FA8] hover:underline"
                  >
                    Full History
                  </button>
                </div>

                {!isAuthenticated ? (
                  <div className="p-5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2">
                    <p className="text-xs font-bold text-[#343047]">
                      Sign in to view your real assessment performance
                    </p>
                    <p className="text-[11px] text-[#6B6178]">
                      Latest score, personal best, topic strengths, and weak areas update automatically after each diagnostic or lesson quiz.
                    </p>
                  </div>
                ) : assessmentPerf.totalAttempts === 0 ? (
                  <div className="p-6 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2.5">
                    <p className="text-xs font-bold text-[#343047]">
                      No diagnostic assessments or knowledge checks yet
                    </p>
                    <p className="text-[11px] text-[#6B6178] max-w-sm mx-auto">
                      Complete a diagnostic test or take a lesson Knowledge Check to see your scores, progress delta, and strong vs. weak topics.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('assessment')}
                      className="clay-button-primary px-4 py-2 text-xs font-bold"
                    >
                      Start Diagnostic Quiz
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Top Score Indicators */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 rounded-[16px] bg-[#F0E9FA]/70 border border-[#E2D6F5]">
                        <p className="text-[10px] font-bold text-[#6F4FA8]">
                          Latest Score
                        </p>
                        <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                          {assessmentPerf.latestOverallScore !== null
                            ? `${assessmentPerf.latestOverallScore}%`
                            : '—'}
                        </p>
                      </div>
                      <div className="p-3 rounded-[16px] bg-[#DCECD9]/60 border border-[#C2DFBC]">
                        <p className="text-[10px] font-bold text-[#325E3B]">
                          Best Score
                        </p>
                        <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                          {assessmentPerf.bestOverallScore !== null
                            ? `${assessmentPerf.bestOverallScore}%`
                            : '—'}
                        </p>
                      </div>
                      <div className="p-3 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                        <p className="text-[10px] font-bold text-[#7B7188]">
                          Total Attempts
                        </p>
                        <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                          {assessmentPerf.totalAttempts}
                        </p>
                        <span className="text-[10px] text-[#8B8295]">
                          {assessmentPerf.totalDiagnosticAttempts} diag ·{' '}
                          {assessmentPerf.totalKnowledgeChecks} quiz
                        </span>
                      </div>
                      <div className="p-3 rounded-[16px] bg-[#FFF1D6]/70 border border-[#F3DFB4]">
                        <p className="text-[10px] font-bold text-[#855C1C]">
                          Score Trend
                        </p>
                        <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                          {assessmentPerf.scoreImprovementDelta !== null
                            ? `${
                                assessmentPerf.scoreImprovementDelta > 0 ? '+' : ''
                              }${assessmentPerf.scoreImprovementDelta}%`
                            : '—'}
                        </p>
                        <span className="text-[10px] text-[#8E6D36] truncate block">
                          {assessmentPerf.improvementLabel || 'Need 2+ attempts'}
                        </span>
                      </div>
                    </div>

                    {/* Strong & Weak Topics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-[16px] bg-[#DCECD9]/45 border border-[#C2DFBC] space-y-2">
                        <p className="text-xs font-extrabold text-[#2F5B37]">
                          Strong Topics
                        </p>
                        {assessmentPerf.strongTopics.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {assessmentPerf.strongTopics.map((topic, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-0.5 rounded-full bg-[#FFFCFA] border border-[#BBDAB6] text-[#2F5B37] text-[11px] font-bold"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#4D6E54]">
                            Master quiz topics at 80%+ to list strengths here.
                          </p>
                        )}
                      </div>

                      <div className="p-3.5 rounded-[16px] bg-[#FFF1D6]/60 border border-[#F3DFB4] space-y-2">
                        <p className="text-xs font-extrabold text-[#855C1C]">
                          Topics Requiring Improvement
                        </p>
                        {assessmentPerf.weakTopics.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {assessmentPerf.weakTopics.map((topic, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-0.5 rounded-full bg-[#FFFCFA] border border-[#F2DCAD] text-[#7A5720] text-[11px] font-bold"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#7A5720]">
                            No weak topics flagged right now.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {isAuthenticated && assessmentPerf.totalAttempts > 0 && (
                <div className="pt-3 border-t border-[#EEE6E5] flex items-center justify-between text-[11px] text-[#7B7188] flex-wrap gap-2">
                  <span>
                    Diagnostic avg:{' '}
                    <strong className="text-[#343047]">
                      {assessmentPerf.averageDiagnosticScore !== null
                        ? `${assessmentPerf.averageDiagnosticScore}%`
                        : '—'}
                    </strong>
                    {' · '}Quiz avg:{' '}
                    <strong className="text-[#343047]">
                      {assessmentPerf.averageKnowledgeCheckScore !== null
                        ? `${assessmentPerf.averageKnowledgeCheckScore}%`
                        : '—'}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('knowledge_checks')}
                    className="font-bold text-[#6F4FA8] hover:underline"
                  >
                    View Lesson Quizzes →
                  </button>
                </div>
              )}
            </div>

            {/* Learning Activity Card (Simple Progress Bars & Readable Lists - NO Complex Graphs) */}
            <div className="lg:col-span-6 pastel-card p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <ClayIconBadge variant="mint" size="md">
                      <Calendar className="w-5 h-5" />
                    </ClayIconBadge>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-extrabold text-[#343047]">
                          Learning Activity
                        </h2>
                        {!isAuthenticated && (
                          <span className="px-2 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-[10px] font-extrabold">
                            Demo Data
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8B8295]">
                        {isAuthenticated
                          ? 'Real tracked study sessions, streak & daily/weekly totals'
                          : 'Sample daily study activity preview'}
                      </p>
                    </div>
                  </div>

                  {isAuthenticated && onRefreshSessions && (
                    <button
                      type="button"
                      onClick={onRefreshSessions}
                      disabled={sessionsLoading}
                      className="clay-button-soft px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${sessionsLoading ? 'animate-spin' : ''}`}
                      />
                      <span>Sync</span>
                    </button>
                  )}
                </div>

                {sessionsError && isAuthenticated && (
                  <div className="p-3 rounded-[14px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{sessionsError}</span>
                  </div>
                )}

                {isAuthenticated ? (
                  <>
                    {/* Activity KPI Strip */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-[16px] bg-[#FFF1D6]/70 border border-[#F3DFB4]">
                        <p className="text-[10px] font-bold text-[#855C1C]">
                          Current Streak
                        </p>
                        <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                          {activityMetrics.currentStreakDays}{' '}
                          {activityMetrics.currentStreakDays === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                      <div className="p-3 rounded-[16px] bg-[#F0E9FA]/70 border border-[#E2D6F5]">
                        <p className="text-[10px] font-bold text-[#6F4FA8]">
                          Sessions Done
                        </p>
                        <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                          {activityMetrics.totalCompletedSessions}
                        </p>
                      </div>
                      <div className="p-3 rounded-[16px] bg-[#DCECD9]/60 border border-[#C2DFBC]">
                        <p className="text-[10px] font-bold text-[#325E3B]">
                          This Week
                        </p>
                        <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                          {formatStudyDuration(activityMetrics.thisWeekMinutes * 60)}
                        </p>
                      </div>
                    </div>

                    {activityMetrics.totalCompletedSessions === 0 ? (
                      <div className="p-5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2">
                        <p className="text-xs font-bold text-[#343047]">
                          No study sessions recorded yet
                        </p>
                        <p className="text-[11px] text-[#6B6178] max-w-sm mx-auto leading-relaxed">
                          Study time, daily streaks, and weekly session logs are recorded automatically when you study lessons, complete Knowledge Checks, or take skill assessments.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Daily Study Activity (Simple Horizontal Progress Bars) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
                            <span>Daily Study Activity (Last 7 Days)</span>
                            <span className="font-mono">
                              Goal: {user.preferredHoursPerDay || 2}h/day
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {activityMetrics.dailyActivity.map((day) => {
                              const pct =
                                day.minutes > 0
                                  ? Math.max(8, Math.round((day.minutes / maxDailyMinutes) * 100))
                                  : 0;
                              return (
                                <div
                                  key={day.dateKey}
                                  className="flex items-center gap-2.5 text-xs"
                                >
                                  <span
                                    className={`w-16 shrink-0 text-[11px] font-bold ${
                                      day.isToday ? 'text-[#6F4FA8]' : 'text-[#6B6178]'
                                    }`}
                                  >
                                    {day.isToday ? 'Today' : `${day.dayLabel} ${day.shortDate.split(' ')[1] ?? ''}`}
                                  </span>
                                  <div className="flex-1 h-2 rounded-full bg-[#F1EAE8] overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-300"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: day.isToday ? '#9B7ACE' : '#8CC697',
                                      }}
                                    />
                                  </div>
                                  <span className="w-24 text-right font-mono text-[11px] font-bold text-[#343047] tabular-nums shrink-0">
                                    {day.minutes > 0 ? `${day.minutes}m` : '0m'}
                                    {day.sessionsCount > 0
                                      ? ` · ${day.sessionsCount}`
                                      : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Weekly Summary Rows */}
                        <div className="space-y-1.5 pt-2 border-t border-[#EEE6E5]">
                          <p className="text-[11px] font-bold text-[#6B6178]">
                            Weekly Study Summary
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {activityMetrics.weeklyActivity.map((week) => {
                              const pct =
                                week.minutes > 0
                                  ? Math.max(10, Math.round((week.minutes / maxWeeklyMinutes) * 100))
                                  : 0;
                              return (
                                <div
                                  key={week.weekKey}
                                  className="p-2.5 rounded-[14px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-1.5"
                                >
                                  <p className="text-[10px] font-bold text-[#7B7188] truncate">
                                    {week.label}
                                  </p>
                                  <p className="font-display text-sm font-extrabold text-[#343047] tabular-nums">
                                    {formatStudyDuration(week.minutes * 60)}
                                  </p>
                                  <div className="w-full h-1.5 rounded-full bg-[#EDE6E3] overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-[#A78BCE]"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Demo visitor readable list with simple progress bars (no complex graph) */
                  <div className="space-y-2.5">
                    {WEEKLY_ACTIVITY_DATA.map((item) => {
                      const pct = Math.round((item.hours / maxDemoHours) * 100);
                      return (
                        <div key={item.day} className="flex items-center gap-3 text-xs">
                          <span className="w-10 font-bold text-[#6B6178] shrink-0">
                            {item.day}
                          </span>
                          <div className="flex-1 h-2.5 rounded-full bg-[#F1EAE8] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#A78BCE]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-12 text-right font-mono font-bold text-[#343047] tabular-nums shrink-0">
                            {item.hours}h
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4: PERSONALIZED LEARNING INSIGHTS */}
          {isAuthenticated && (
            <div className="pastel-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <ClayIconBadge variant="yellow" size="md">
                  <Lightbulb className="w-5 h-5" />
                </ClayIconBadge>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-[#343047]">
                    Personalized Learning Insights
                  </h2>
                  <p className="text-xs text-[#8B8295]">
                    Actionable recommendations generated dynamically from your saved lessons, scores, and study sessions
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {personalizedInsights.map((insight) => {
                  const style = insightCardStyle(insight.tone);
                  return (
                    <div
                      key={insight.id}
                      className={`p-4 rounded-[18px] border flex flex-col justify-between gap-3 ${style.wrapper}`}
                    >
                      <div className="space-y-1">
                        <p className="font-display text-sm font-extrabold text-[#343047]">
                          {insight.title}
                        </p>
                        <p className="text-xs text-[#5E5468] leading-relaxed">
                          {insight.description}
                        </p>
                      </div>

                      {insight.actionLabel && insight.targetView && (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                insight.targetStageId &&
                                insight.targetLessonId &&
                                onOpenLesson
                              ) {
                                onOpenLesson(
                                  insight.targetStageId,
                                  insight.targetLessonId
                                );
                              } else {
                                onNavigate(insight.targetView!);
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-[12px] bg-[#FFFCFA] border border-[#E2D6F5] text-[11px] font-bold text-[#6F4FA8] hover:bg-[#F0E9FA] transition-colors"
                          >
                            {insight.actionLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 5: RECENT LEARNING SESSIONS & COMPLETED LESSONS */}
          {isAuthenticated && learningSessions.length > 0 && (
            <div className="pastel-card p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-display text-base font-extrabold text-[#343047]">
                    Recent Learning Sessions
                  </h3>
                  <p className="text-xs text-[#8B8295]">
                    Latest tracked lesson study periods, knowledge checks, and diagnostic attempts
                  </p>
                </div>
                <span className="text-xs font-bold text-[#6F4FA8]">
                  Total tracked: {activityMetrics.totalStudyHoursFormatted}
                </span>
              </div>

              <div className="divide-y divide-[#EEE6E5]/80">
                {learningSessions.slice(0, 8).map((sess) => {
                  const typeLabel =
                    sess.activityType === 'knowledge_check'
                      ? 'Knowledge Check'
                      : sess.activityType === 'assessment'
                      ? 'Skill Assessment'
                      : 'Lesson Study';
                  const typeCls =
                    sess.activityType === 'knowledge_check'
                      ? 'bg-[#F0E9FA] text-[#6F4FA8]'
                      : sess.activityType === 'assessment'
                      ? 'bg-[#FCEAE5] text-[#9C5042]'
                      : 'bg-[#DCECD9] text-[#2F5B37]';
                  return (
                    <div
                      key={sess.id || sess.clientSessionId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${typeCls}`}
                        >
                          {typeLabel}
                        </span>
                        <span className="font-bold text-[#343047] truncate">
                          {sess.lessonTitle || 'Learning Activity'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[#7B7188] shrink-0">
                        <span className="font-mono font-bold text-[#343047] tabular-nums">
                          {formatStudyDuration(sess.durationSeconds)}
                        </span>
                        <span>{formatSessionDateTime(sess.startedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Roadmap Lessons Table */}
          <div className="pastel-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#8E6EC8]" />
                <h3 className="font-display text-base font-extrabold text-[#343047]">
                  {isAuthenticated
                    ? 'Completed Roadmap Lessons'
                    : 'Sample Completed Modules'}
                </h3>
                {!isAuthenticated && (
                  <span className="px-2 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-[10px] font-extrabold">
                    Demo Data
                  </span>
                )}
              </div>
              {isAuthenticated && activeRoadmap && (
                <span className="text-xs font-semibold text-[#8B8295]">
                  {roadmapStats.completedLessons} of {roadmapStats.totalLessons} lessons
                  completed
                </span>
              )}
            </div>

            {isAuthenticated ? (
              realCompletedLessons.length === 0 ? (
                <div className="p-6 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2">
                  <p className="text-xs font-bold text-[#343047]">
                    No completed lessons yet
                  </p>
                  <p className="text-xs text-[#6B6178]">
                    Open My Learning Path and click Mark Done as you finish lessons to track them here.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('roadmap')}
                    className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8]"
                  >
                    Go to My Learning Path
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] font-bold text-[#8B8295] border-b border-[#EEE6E5] bg-[#FAF6F2]/80">
                      <tr>
                        <th className="py-3 px-4 rounded-l-xl">Lesson Title</th>
                        <th className="py-3 px-4">Stage</th>
                        <th className="py-3 px-4">Course</th>
                        <th className="py-3 px-4">Completed At</th>
                        <th className="py-3 px-4 text-right rounded-r-xl">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEE6E5]/70 font-medium text-[#343047]">
                      {realCompletedLessons.map((mod) => (
                        <tr
                          key={mod.id}
                          onClick={() => onOpenLesson?.(mod.stageId, mod.lessonId)}
                          className={`hover:bg-[#FAF6F2]/60 transition-colors ${
                            onOpenLesson ? 'cursor-pointer' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 font-bold">{mod.title}</td>
                          <td className="py-3.5 px-4 text-[#8E6EC8] font-mono font-bold">
                            {mod.stage}
                          </td>
                          <td className="py-3.5 px-4 text-[#6B6178]">{mod.stageTitle}</td>
                          <td className="py-3.5 px-4 text-[#6B6178] text-[11px]">
                            {mod.completedAt
                              ? formatLessonCompletedTimestamp(mod.completedAt)
                              : mod.estimatedTime}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DCECD9] text-[#356640] text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              Completed
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="p-5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-xs text-[#6B6178] text-center">
                Sign in to save your completed roadmap lessons with completion timestamps.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REAL SUPABASE ASSESSMENT HISTORY */}
      {activeTab === 'assessments' && (
        <div className="pastel-card p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display text-base font-extrabold text-[#343047]">
                Assessment Score History
              </h3>
              <p className="text-xs text-[#8B8295]">
                Your real completed diagnostic assessments saved in Supabase
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isAuthenticated && onRefreshAttempts && (
                <button
                  type="button"
                  onClick={onRefreshAttempts}
                  disabled={attemptsLoading}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${attemptsLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('assessment')}
                className="clay-button-primary px-4 py-2 text-xs font-bold"
              >
                Start New Test
              </button>
            </div>
          </div>

          {isAuthenticated && attempts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-[16px] bg-[#F0E9FA]/65 border border-[#E2D6F5]">
                <p className="text-[11px] font-bold text-[#6F4FA8]">Latest Score</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {assessmentPerf.latestDiagnosticScore !== null
                    ? `${assessmentPerf.latestDiagnosticScore}%`
                    : '—'}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#DCECD9]/60 border border-[#C2DFBC]">
                <p className="text-[11px] font-bold text-[#325E3B]">Best Score</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {assessmentPerf.bestDiagnosticScore !== null
                    ? `${assessmentPerf.bestDiagnosticScore}%`
                    : '—'}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                <p className="text-[11px] font-bold text-[#7B7188]">Average Score</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {assessmentPerf.averageDiagnosticScore !== null
                    ? `${assessmentPerf.averageDiagnosticScore}%`
                    : '—'}
                </p>
              </div>
              <div className="p-3.5 rounded-[16px] bg-[#FFF1D6]/65 border border-[#F3DFB4]">
                <p className="text-[11px] font-bold text-[#855C1C]">Total Attempts</p>
                <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                  {assessmentPerf.totalDiagnosticAttempts}
                </p>
              </div>
            </div>
          )}

          {attemptsError && (
            <div className="p-4 rounded-[18px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#C25E4D] shrink-0" />
                <span>{attemptsError}</span>
              </div>
              {onRefreshAttempts && (
                <button
                  type="button"
                  onClick={onRefreshAttempts}
                  className="px-3 py-1 rounded-[10px] bg-[#FFFCFA] border border-[#F3C5BA] font-bold"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!isAuthenticated ? (
            <div className="p-8 rounded-[22px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-3">
              <p className="font-display text-base font-extrabold text-[#343047]">
                Sign in to track your Assessment History
              </p>
              <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                Practice assessments are open to try in demo mode, and your completed attempts will be saved automatically once you sign in to your student account.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('assessment')}
                className="clay-button-primary px-5 py-2 text-xs font-bold"
              >
                Try Practice Assessment
              </button>
            </div>
          ) : attemptsLoading && attempts.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs font-bold text-[#8E6EC8]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading assessment history from Supabase...</span>
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-8 rounded-[22px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-3">
              <p className="font-display text-base font-extrabold text-[#343047]">
                No assessments completed yet
              </p>
              <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                Take your first skill diagnostic assessment to see your scores, strengths, and knowledge gaps tracked here over time.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('assessment')}
                className="clay-button-primary px-5 py-2 text-xs font-bold"
              >
                Take First Assessment
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {attempts.map((item) => {
                const isExpanded = expandedAttemptId === item.id;
                return (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-[#EEE6E5] bg-[#FAF6F2]/70 overflow-hidden transition-all"
                  >
                    <div
                      onClick={() => setExpandedAttemptId(isExpanded ? null : item.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#F0E9FA]/35 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-sm font-extrabold text-[#343047]">
                            {item.subject}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] text-[10px] font-bold">
                            {item.difficulty}
                          </span>
                        </div>
                        <p className="text-xs text-[#8B8295]">
                          Completed {formatAssessmentDate(item.createdAt)} ·{' '}
                          {item.correctAnswers}/{item.totalQuestions} correct
                        </p>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        <span className="px-3 py-1 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-mono text-xs font-extrabold tabular-nums">
                          {item.scorePercent}%
                        </span>
                        <span className="text-xs font-bold text-[#8E6EC8] flex items-center gap-1">
                          <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-[#EEE6E5] bg-[#FFFCFA] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-[16px] bg-[#DCECD9]/45 border border-[#C2DFBC] space-y-1.5">
                          <p className="font-bold text-[#325E3B]">Strengths</p>
                          {item.strengths.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {item.strengths.map((str, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-0.5 rounded-full bg-[#DCECD9] text-[#2D4D33] text-[11px] font-bold"
                                >
                                  {str}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[#456D4C] text-[11px]">
                              No tested topics mastered in this attempt.
                            </p>
                          )}
                        </div>

                        <div className="p-3.5 rounded-[16px] bg-[#FFF1D6]/60 border border-[#F2DCAD] space-y-1.5">
                          <p className="font-bold text-[#855C1C]">Knowledge Gaps</p>
                          {item.knowledgeGaps.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {item.knowledgeGaps.map((gap, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-0.5 rounded-full bg-[#FFF1D6] text-[#7A5720] text-[11px] font-bold"
                                >
                                  {gap}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[#6B5022] text-[11px]">
                              No knowledge gaps found across tested topics!
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LESSON KNOWLEDGE CHECK HISTORY */}
      {activeTab === 'knowledge_checks' && (
        <div className="pastel-card p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <ClayIconBadge variant="lavender" size="md">
                <ClipboardCheck className="w-5 h-5" />
              </ClayIconBadge>
              <div>
                <h3 className="font-display text-base font-extrabold text-[#343047]">
                  Lesson Knowledge Check History
                </h3>
                <p className="text-xs text-[#8B8295]">
                  Previous lesson quizzes, score trends across attempts, and topics to strengthen
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAuthenticated && onRefreshKnowledgeChecks && (
                <button
                  type="button"
                  onClick={onRefreshKnowledgeChecks}
                  disabled={knowledgeChecksLoading}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${knowledgeChecksLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('roadmap')}
                className="clay-button-primary px-4 py-2 text-xs font-bold"
              >
                Go to My Learning Path
              </button>
            </div>
          </div>

          {knowledgeChecksError && (
            <div className="p-4 rounded-[18px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#C25E4D] shrink-0" />
                <span>{knowledgeChecksError}</span>
              </div>
              {onRefreshKnowledgeChecks && (
                <button
                  type="button"
                  onClick={onRefreshKnowledgeChecks}
                  className="px-3 py-1 rounded-[10px] bg-[#FFFCFA] border border-[#F3C5BA] font-bold"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!isAuthenticated ? (
            <div className="p-8 rounded-[22px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-3">
              <p className="font-display text-base font-extrabold text-[#343047]">
                Sign in to track your Knowledge Check History
              </p>
              <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                Complete lesson quizzes inside My Learning Path once signed in to see your saved scores, attempt improvements, and adaptive recommendations here.
              </p>
            </div>
          ) : knowledgeChecksLoading && knowledgeCheckAttempts.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs font-bold text-[#8E6EC8]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading Knowledge Check history...</span>
            </div>
          ) : knowledgeCheckAttempts.length === 0 ? (
            <div className="p-8 rounded-[22px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-3">
              <p className="font-display text-base font-extrabold text-[#343047]">
                No lesson knowledge checks completed yet
              </p>
              <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                Open any lesson in My Learning Path and visit the Practice &amp; Quiz tab to take a Knowledge Check and detect topic gaps.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('roadmap')}
                className="clay-button-primary px-5 py-2 text-xs font-bold"
              >
                Open My Learning Path
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Compact Overview Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-[18px] bg-[#F0E9FA]/65 border border-[#E2D6F5]">
                  <p className="text-[11px] font-bold text-[#6F4FA8]">Total Quizzes Taken</p>
                  <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                    {kcSummary.totalQuizzes}
                  </p>
                </div>
                <div className="p-4 rounded-[18px] bg-[#DCECD9]/60 border border-[#C2DFBC]">
                  <p className="text-[11px] font-bold text-[#325E3B]">Average Quiz Score</p>
                  <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums mt-0.5">
                    {kcSummary.averageScore !== null ? `${kcSummary.averageScore}%` : '—'}
                  </p>
                </div>
                <div className="p-4 rounded-[18px] bg-[#FFF1D6]/65 border border-[#F3DFB4]">
                  <p className="text-[11px] font-bold text-[#855C1C]">Topics to Strengthen</p>
                  {kcSummary.weakTopics.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {kcSummary.weakTopics.map((topic, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full bg-[#FFFCFA] border border-[#F2DCAD] text-[#7A5720] text-[10px] font-bold"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-bold text-[#356640] mt-1">
                      All tested topics look strong!
                    </p>
                  )}
                </div>
              </div>

              {/* Attempt List */}
              <div className="space-y-3">
                {knowledgeCheckAttempts.map((item) => {
                  const isExpanded = expandedKnowledgeCheckId === item.id;
                  const improvement = computeAttemptImprovement(item, knowledgeCheckAttempts);

                  return (
                    <div
                      key={item.id}
                      className="rounded-[20px] border border-[#EEE6E5] bg-[#FAF6F2]/75 overflow-hidden transition-all"
                    >
                      <div
                        onClick={() =>
                          setExpandedKnowledgeCheckId(isExpanded ? null : item.id)
                        }
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#F0E9FA]/35 transition-colors"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display text-sm font-extrabold text-[#343047]">
                              {item.lessonTitle || 'Lesson Knowledge Check'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] text-[10px] font-bold">
                              Attempt #{improvement.attemptNumber}
                            </span>

                            {improvement.deltaPercent !== null && (
                              <span
                                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  improvement.deltaPercent > 0
                                    ? 'bg-[#DCECD9] text-[#2F5B37]'
                                    : improvement.deltaPercent < 0
                                    ? 'bg-[#FCEAE5] text-[#8D3E32]'
                                    : 'bg-[#FAF6F2] border border-[#E6DCD9] text-[#6B6178]'
                                }`}
                              >
                                {improvement.deltaPercent > 0 ? (
                                  <ArrowUpRight className="w-3 h-3" />
                                ) : improvement.deltaPercent < 0 ? (
                                  <ArrowDownRight className="w-3 h-3" />
                                ) : (
                                  <Minus className="w-3 h-3" />
                                )}
                                <span>
                                  {improvement.deltaPercent > 0
                                    ? `+${improvement.deltaPercent}% vs prior`
                                    : improvement.deltaPercent < 0
                                    ? `${improvement.deltaPercent}% vs prior`
                                    : 'No change vs prior'}
                                </span>
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[#8B8295]">
                            Completed {formatKnowledgeCheckDate(item.completedAt)} ·{' '}
                            {item.correctAnswers}/{item.totalQuestions} correct
                          </p>

                          {item.knowledgeGaps.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[10px] font-bold text-[#855C1C]">
                                Needs improvement:
                              </span>
                              {item.knowledgeGaps.map((gap, gIdx) => (
                                <span
                                  key={gIdx}
                                  className="px-2 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-[10px] font-bold"
                                >
                                  {gap}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <span
                            className={`px-3 py-1 rounded-full font-mono text-xs font-extrabold tabular-nums ${
                              item.score >= 80
                                ? 'bg-[#DCECD9] text-[#2F5B37]'
                                : item.score >= 50
                                ? 'bg-[#FFF1D6] text-[#7A5720]'
                                : 'bg-[#FCEAE5] text-[#8D3E32]'
                            }`}
                          >
                            {item.score}%
                          </span>
                          <span className="text-xs font-bold text-[#8E6EC8] flex items-center gap-1">
                            <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 border-t border-[#EEE6E5] bg-[#FFFCFA] space-y-4 text-xs">
                          {item.topicBreakdown.length > 0 && (
                            <div className="space-y-2">
                              <p className="font-bold text-[#343047] flex items-center gap-1.5">
                                <Target className="w-3.5 h-3.5 text-[#8E6EC8]" />
                                <span>Topic Proficiency</span>
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {item.topicBreakdown.map((tb, tbIdx) => (
                                  <div
                                    key={`${tb.topic}-${tbIdx}`}
                                    className="p-3 rounded-[14px] bg-[#FAF6F2] border border-[#EEE6E5] flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-bold text-[#343047] truncate">
                                        {tb.topic}
                                      </p>
                                      <p className="text-[10px] text-[#8B8295]">
                                        {tb.correctAnswers}/{tb.totalQuestions} correct (
                                        {tb.accuracyPercent}%)
                                      </p>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                                        tb.proficiency === 'Strong'
                                          ? 'bg-[#DCECD9] text-[#2F5B37]'
                                          : tb.proficiency === 'Moderate'
                                          ? 'bg-[#FFF1D6] text-[#7A5720]'
                                          : 'bg-[#FCEAE5] text-[#8D3E32]'
                                      }`}
                                    >
                                      {tb.proficiency}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {item.recommendation && (
                            <div className="p-3.5 rounded-[16px] bg-[#F0E9FA]/65 border border-[#E2D6F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="space-y-0.5">
                                <p className="font-extrabold text-[#4D3B73]">
                                  {item.recommendation.title}
                                </p>
                                <p className="text-[#5E5468] leading-relaxed">
                                  {item.recommendation.description}
                                </p>
                              </div>
                              {onOpenLesson && item.stageId && item.lessonId && (
                                <button
                                  type="button"
                                  onClick={() => onOpenLesson(item.stageId, item.lessonId)}
                                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0"
                                >
                                  Open Lesson &amp; Retake
                                </button>
                              )}
                            </div>
                          )}

                          {item.answers.length > 0 && (
                            <div className="space-y-2">
                              <p className="font-bold text-[#343047]">Question Review</p>
                              <div className="space-y-2">
                                {item.answers.map((ans, aIdx) => {
                                  const selectedText =
                                    ans.options?.[ans.selectedOptionIndex] ??
                                    `Option ${ans.selectedOptionIndex + 1}`;
                                  const correctText =
                                    ans.options?.[ans.correctAnswerIndex] ??
                                    `Option ${ans.correctAnswerIndex + 1}`;
                                  return (
                                    <div
                                      key={`${ans.questionId}-${aIdx}`}
                                      className="p-3 rounded-[14px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-1"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="font-bold text-[#343047]">
                                          Q{aIdx + 1}. {ans.question}
                                        </p>
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                                            ans.isCorrect
                                              ? 'bg-[#DCECD9] text-[#2F5B37]'
                                              : 'bg-[#FCEAE5] text-[#8D3E32]'
                                          }`}
                                        >
                                          {ans.isCorrect ? 'Correct' : 'Incorrect'}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[#6B6178]">
                                        Your answer:{' '}
                                        <span className="font-semibold text-[#343047]">
                                          {selectedText}
                                        </span>
                                        {!ans.isCorrect && (
                                          <>
                                            {' · '}Correct:{' '}
                                            <span className="font-semibold text-[#2F5B37]">
                                              {correctText}
                                            </span>
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACHIEVEMENTS & XP */}
      {activeTab === 'badges' && (
        <AchievementsSection
          summary={resolvedAchievementsSummary}
          isAuthenticated={isAuthenticated}
          isLoading={achievementsLoading}
          error={achievementsError}
          onRefresh={onRefreshAchievements}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
};
