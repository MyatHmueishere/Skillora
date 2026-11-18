import React, { useEffect, useRef, useState } from 'react';
import {
  TrendingUp,
  Clock,
  Flame,
  ArrowRight,
  Sparkles,
  Play,
  CheckCircle2,
  Circle,
  ChevronRight,
  BookOpen,
  Code2,
  Layers,
  Check,
  Terminal,
  Loader2,
  GraduationCap,
  ClipboardCheck,
  Target,
} from 'lucide-react';
import {
  UserProfile,
  Course,
  AppView,
  LearningRoadmapRecord,
  AssessmentAttemptRecord,
  LessonKnowledgeCheckAttemptRecord,
  LearningSessionRecord,
  ExploreResourcesPayload,
} from '../../types';
import {
  SKILL_OVERVIEW_DATA,
  CONTINUE_LEARNING_COURSES,
  RECOMMENDED_COURSES,
} from '../../data/mockData';
import {
  ClayIconBadge,
  SmilingCloudMascot3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';
import {
  SKILLORA_LOGO_SRC,
  SKILLORA_WELCOME_MASCOT_SRC,
} from '../common/Logo';
import {
  buildPersonalizedDashboardRecommendations,
  getRecommendedAssessmentsForUser,
  getTimeBasedGreeting,
} from '../../lib/learningRecommendations';
import {
  computeRoadmapStats,
  resolveResumeLearningTarget,
} from '../roadmap/roadmapUiHelpers';
import {
  computeKnowledgeCheckSummary,
  formatKnowledgeCheckDate,
} from '../../lib/knowledgeChecks';
import { computeLearningActivityMetrics } from '../../lib/progressAnalytics';
import { buildDashboardJourneySummary } from '../../lib/dashboardJourney';
import {
  fetchExploreResources,
  getCachedExploreResources,
} from '../../lib/exploreResources';

function formatRelativeActivityTime(isoTimestamp: string): string {
  const ms = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(ms)) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface DashboardViewProps {
  user: UserProfile;
  isAuthenticated?: boolean;
  authUserId?: string | null;
  activeRoadmap?: LearningRoadmapRecord | null;
  archivedRoadmaps?: LearningRoadmapRecord[];
  roadmapsLoading?: boolean;
  isGeneratingRoadmap?: boolean;
  assessmentAttempts?: AssessmentAttemptRecord[];
  knowledgeCheckAttempts?: LessonKnowledgeCheckAttemptRecord[];
  knowledgeChecksLoading?: boolean;
  learningSessions?: LearningSessionRecord[];
  sessionsLoading?: boolean;
  timeZone?: string;
  onGenerateRoadmap?: (replaceActive?: boolean) => Promise<boolean> | void;
  onSwitchToPreservedRoadmap?: (roadmapId: string) => Promise<void> | void;
  onNavigate: (view: AppView) => void;
  onExploreResource?: (searchTerm: string) => void;
  onSelectCourse: (course: Course) => void;
  onContinueLesson?: (stageId: string, lessonId: string) => void;
  onOpenCourse?: (stageId: string) => void;
  onOpenAssistantPrompt: (prompt: string) => void;
  onOpenOnboarding?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  isAuthenticated = false,
  authUserId = null,
  activeRoadmap = null,
  archivedRoadmaps = [],
  roadmapsLoading = false,
  isGeneratingRoadmap = false,
  assessmentAttempts = [],
  knowledgeCheckAttempts = [],
  knowledgeChecksLoading = false,
  learningSessions = [],
  sessionsLoading = false,
  timeZone,
  onGenerateRoadmap,
  onSwitchToPreservedRoadmap,
  onNavigate,
  onExploreResource,
  onSelectCourse,
  onContinueLesson,
  onOpenCourse,
  onOpenAssistantPrompt,
  onOpenOnboarding,
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [isSwitchingRoadmap, setIsSwitchingRoadmap] = useState(false);
  const [explorePayload, setExplorePayload] = useState<ExploreResourcesPayload | null>(() =>
    isAuthenticated && authUserId ? getCachedExploreResources(authUserId) : null
  );
  const [exploreLoading, setExploreLoading] = useState<boolean>(false);
  const activeAuthIdRef = useRef<string | null>(authUserId);
  activeAuthIdRef.current = authUserId;

  // Keep local-time greeting synchronized while dashboard is open
  useEffect(() => {
    const syncTime = () => setCurrentTime(new Date());
    const intervalId = window.setInterval(syncTime, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') syncTime();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const personalizationSignature = [
    authUserId ?? '',
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
    assessmentAttempts.length,
    assessmentAttempts[0]?.id ?? '',
    knowledgeCheckAttempts.length,
    knowledgeCheckAttempts[0]?.id ?? '',
  ].join('|');

  // Fetch personalized Explore Resources scoped to authenticated user to prevent cross-student leakage
  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      setExplorePayload(null);
      setExploreLoading(false);
      return;
    }

    let cancelled = false;
    const expectedUserId = authUserId;
    const cachedHit = getCachedExploreResources(expectedUserId);
    if (cachedHit) {
      setExplorePayload(cachedHit);
      setExploreLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setExploreLoading(true);

    fetchExploreResources({ userId: expectedUserId })
      .then((payload) => {
        if (!cancelled && activeAuthIdRef.current === expectedUserId) {
          setExplorePayload(payload);
        }
      })
      .catch(() => {
        if (!cancelled && activeAuthIdRef.current === expectedUserId) {
          setExplorePayload(null);
        }
      })
      .finally(() => {
        if (!cancelled && activeAuthIdRef.current === expectedUserId) {
          setExploreLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authUserId, personalizationSignature]);

  const timeGreeting = getTimeBasedGreeting(currentTime);

  const { recommended: recommendedAssessments, allOrdered } =
    getRecommendedAssessmentsForUser(user);
  const topRecommendedAssessment = recommendedAssessments[0] ?? allOrdered[0];
  const kcSummary = computeKnowledgeCheckSummary(knowledgeCheckAttempts);
  const journey = buildDashboardJourneySummary({
    user,
    activeRoadmap,
    archivedRoadmaps,
    learningSessions,
    knowledgeCheckAttempts,
    assessmentAttempts,
    timeZone,
    now: currentTime,
  });
  const displayActiveRoadmap =
    isAuthenticated && journey.hasExplicitDirection && !journey.directionMatchesActiveRoadmap
      ? null
      : activeRoadmap;
  const roadmapStats = computeRoadmapStats(displayActiveRoadmap);
  const activityMetrics = isAuthenticated
    ? journey.activityMetrics
    : computeLearningActivityMetrics(learningSessions);

  const realProgressPercent = isAuthenticated
    ? roadmapStats.progressPercent
    : user.overallProgress;
  const realCompletedCoursesCount = isAuthenticated
    ? roadmapStats.completedStages
    : user.completedCoursesCount;

  // Locate the student's actual resume position (prefers most recent active lesson session)
  const activeStages = displayActiveRoadmap?.roadmapData.stages ?? [];
  const resumeTarget = isAuthenticated
    ? resolveResumeLearningTarget(displayActiveRoadmap, learningSessions)
    : null;

  const primaryIncompleteStage =
    (resumeTarget
      ? activeStages.find((s) => s.id === resumeTarget.stageId)
      : null) ??
    (roadmapStats.nextIncompleteStageId
      ? activeStages.find((s) => s.id === roadmapStats.nextIncompleteStageId)
      : null) ??
    activeStages.find(
      (s) => s.status === 'in_progress' && s.lessons.some((l) => !l.completed)
    ) ??
    activeStages.find((s) => s.lessons.some((l) => !l.completed)) ??
    null;
  const primaryIncompleteLesson =
    (resumeTarget
      ? primaryIncompleteStage?.lessons.find((l) => l.id === resumeTarget.lessonId)
      : null) ??
    (roadmapStats.nextIncompleteLessonId
      ? primaryIncompleteStage?.lessons.find(
          (l) => l.id === roadmapStats.nextIncompleteLessonId
        )
      : null) ??
    primaryIncompleteStage?.lessons.find((l) => !l.completed) ??
    null;

  const handleResumeLearningPath = () => {
    if (isAuthenticated && resumeTarget && onContinueLesson) {
      onContinueLesson(resumeTarget.stageId, resumeTarget.lessonId);
      return;
    }
    if (
      isAuthenticated &&
      primaryIncompleteStage &&
      primaryIncompleteLesson &&
      onContinueLesson
    ) {
      onContinueLesson(primaryIncompleteStage.id, primaryIncompleteLesson.id);
      return;
    }
    onNavigate('roadmap');
  };

  // Upcoming learning tasks derived from real saved roadmap + recommended assessment
  const upcomingTasks: {
    id: string;
    title: string;
    schedule: string;
    status: string;
    statusClass: string;
    variant: ClayColorVariant;
    icon: React.ReactNode;
    onClick: () => void;
  }[] = (() => {
    if (!isAuthenticated) {
      return [
        {
          id: 't-1',
          title: 'Functions & Closures Lab',
          schedule: 'Today · 35 mins',
          status: 'In Progress',
          statusClass: 'bg-[#FFF1D6] text-[#8E6521]',
          variant: 'pink',
          icon: <Code2 className="w-4 h-4" />,
          onClick: () => onNavigate('roadmap'),
        },
        {
          id: 't-2',
          title: topRecommendedAssessment
            ? `${topRecommendedAssessment.label} Assessment`
            : 'Skill Diagnostic Quiz',
          schedule: topRecommendedAssessment
            ? 'Recommended for your interests'
            : 'Today · Quick check',
          status: 'Recommended',
          statusClass: 'bg-[#F8D9D0] text-[#8C493D]',
          variant: 'yellow',
          icon: <Sparkles className="w-4 h-4" />,
          onClick: () => onNavigate('assessment'),
        },
        {
          id: 't-3',
          title: 'Hash Maps & Dictionaries',
          schedule: 'Tomorrow · 45 mins',
          status: 'Ready',
          statusClass: 'bg-[#DCECD9] text-[#3B6B46]',
          variant: 'mint',
          icon: <Layers className="w-4 h-4" />,
          onClick: () => onNavigate('resources'),
        },
        {
          id: 't-4',
          title: 'Relational Database Basics',
          schedule: 'Stage 5 Prep',
          status: 'Upcoming',
          statusClass: 'bg-[#F0E9FA] text-[#6B4FA1]',
          variant: 'lavender',
          icon: <BookOpen className="w-4 h-4" />,
          onClick: () => onNavigate('roadmap'),
        },
      ];
    }

    const tasks: {
      id: string;
      title: string;
      schedule: string;
      status: string;
      statusClass: string;
      variant: ClayColorVariant;
      icon: React.ReactNode;
      onClick: () => void;
    }[] = [];

    const variants: ClayColorVariant[] = ['pink', 'mint', 'lavender'];
    if (displayActiveRoadmap) {
      const incompleteLessons = activeStages.flatMap((stage, sIdx) =>
        stage.lessons
          .filter((l) => !l.completed)
          .map((lesson) => ({ stage, sIdx, lesson }))
      );

      incompleteLessons.slice(0, 3).forEach((entry, idx) => {
        tasks.push({
          id: `${entry.stage.id}-${entry.lesson.id}`,
          title: entry.lesson.title,
          schedule: `Stage ${entry.sIdx + 1}${
            entry.lesson.estimatedTime ? ` · ${entry.lesson.estimatedTime}` : ''
          }`,
          status: idx === 0 ? 'Up Next' : 'Upcoming',
          statusClass:
            idx === 0
              ? 'bg-[#FFF1D6] text-[#8E6521]'
              : 'bg-[#F0E9FA] text-[#6B4FA1]',
          variant: variants[idx % variants.length],
          icon: <Code2 className="w-4 h-4" />,
          onClick: () => {
            if (onContinueLesson) {
              onContinueLesson(entry.stage.id, entry.lesson.id);
            } else {
              onNavigate('roadmap');
            }
          },
        });
      });
    } else {
      tasks.push({
        id: 'task-create-path',
        title: 'Create Your Learning Path',
        schedule: user.primaryDirection || user.careerGoal || 'Personalized AI roadmap',
        status: 'Get Started',
        statusClass: 'bg-[#F0E9FA] text-[#6B4FA1]',
        variant: 'lavender',
        icon: <Layers className="w-4 h-4" />,
        onClick: () => onNavigate('roadmap'),
      });
    }

    tasks.push({
      id: 'task-assessment',
      title: topRecommendedAssessment
        ? `${topRecommendedAssessment.label} Assessment`
        : 'Skill Diagnostic Assessment',
      schedule:
        assessmentAttempts.length === 0
          ? 'Recommended first step'
          : `${assessmentAttempts.length} saved ${
              assessmentAttempts.length === 1 ? 'attempt' : 'attempts'
            }`,
      status: assessmentAttempts.length === 0 ? 'Recommended' : 'Practice',
      statusClass: 'bg-[#F8D9D0] text-[#8C493D]',
      variant: 'yellow',
      icon: <Sparkles className="w-4 h-4" />,
      onClick: () => onNavigate('assessment'),
    });

    if (tasks.length < 4) {
      tasks.push({
        id: 'task-resources',
        title: 'Explore Learning Resources',
        schedule: user.learningInterests[0] || 'Curated courses & guides',
        status: 'Library',
        statusClass: 'bg-[#DCECD9] text-[#3B6B46]',
        variant: 'mint',
        icon: <BookOpen className="w-4 h-4" />,
        onClick: () => onNavigate('resources'),
      });
    }

    return tasks.slice(0, 4);
  })();

  // Roadmap stages preview (for unauthenticated visitors)
  const roadmapSteps = [
    { name: 'Python Fundamentals', status: 'completed' },
    { name: 'Control Structures', status: 'completed' },
    { name: 'Functions & Data', status: 'current' },
    { name: 'OOP Architecture', status: 'upcoming' },
    { name: 'Database Basics', status: 'upcoming' },
    { name: 'Python Projects', status: 'upcoming' },
  ];

  // Skill donut data: live roadmap stage percentages first -> assessment scores -> empty neutral state
  const skillColors = ['#C9B7E8', '#F6C6D1', '#FFE09E', '#A9D5B3'];
  const donutRadius = 42;
  const donutCirc = 2 * Math.PI * donutRadius;

  const skillItems: { name: string; level: number }[] = (() => {
    if (!isAuthenticated) {
      return SKILL_OVERVIEW_DATA.map((s) => ({ name: s.name, level: s.level }));
    }

    if (roadmapStats.stageStats.length > 0) {
      return roadmapStats.stageStats.slice(0, 4).map((stage) => ({
        name: stage.title,
        level: stage.progressPercent,
      }));
    }

    if (assessmentAttempts.length > 0) {
      const seenSubjects = new Set<string>();
      const fromAssessments: { name: string; level: number }[] = [];
      for (const attempt of assessmentAttempts) {
        const key = attempt.subject.trim().toLowerCase();
        if (seenSubjects.has(key)) continue;
        seenSubjects.add(key);
        fromAssessments.push({
          name: attempt.subject,
          level: Math.max(0, Math.min(100, Math.round(attempt.scorePercent))),
        });
        if (fromAssessments.length >= 4) break;
      }
      if (fromAssessments.length > 0) return fromAssessments;
    }

    return [];
  })();

  const totalSkillSum = skillItems.reduce((acc, s) => acc + s.level, 0);
  const maxSkillRingCapacity = Math.max(100, skillItems.length * 100);
  let cumulativeOffset = 0;

  // Continue Learning stage cards (real stages with next incomplete lesson for authenticated users)
  const continueLearningStages = (() => {
    if (!isAuthenticated || !displayActiveRoadmap) return [];
    const stagesWithMeta = activeStages.map((stage, idx) => {
      const total = stage.lessons.length;
      const done = stage.lessons.filter((l) => l.completed).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const nextLesson = stage.lessons.find((l) => !l.completed) ?? null;
      return { stage, stageIndex: idx, total, done, pct, nextLesson };
    });

    const incomplete = stagesWithMeta.filter((item) => item.nextLesson !== null);
    if (incomplete.length > 0) {
      return incomplete.slice(0, 3);
    }
    return stagesWithMeta.slice(0, 3);
  })();

  // Recommended For You items (7-signal personalized recommendations for authenticated users)
  const latestGapAttempt = assessmentAttempts.find((a) => a.knowledgeGaps.length > 0);
  const personalizedRecommendations = isAuthenticated
    ? buildPersonalizedDashboardRecommendations({
        user,
        activeRoadmap: displayActiveRoadmap,
        assessmentAttempts,
        knowledgeCheckAttempts,
        explorePayload,
        maxItems: 3,
      })
    : [];

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-200">
      {/* TOP ROW: Soft Peach Welcome Panel + 4 Pastel KPI Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Soft Peach Welcome Panel (5 cols) */}
        <div
          className="xl:col-span-5 rounded-[26px] border border-[#F2CBC1] p-5 sm:p-6 flex items-center gap-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #FCE3DC 0%, #F8D9D0 100%)',
            boxShadow: '0 12px 30px -10px rgba(214, 152, 136, 0.35), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <div className="shrink-0 flex items-center justify-center self-center">
            <img
              src={SKILLORA_WELCOME_MASCOT_SRC}
              alt="Skillora Brain Mascot"
              className="w-24 h-24 sm:w-32 sm:h-32 object-contain select-none"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-2.5 z-10">
            <div>
              {(journey.primaryDirection || user.primaryDirection || displayActiveRoadmap?.careerGoal || user.careerGoal) && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFFCFA]/85 border border-[#F0D5CE] text-[10px] font-extrabold text-[#6F4FA8] mb-1.5 max-w-full">
                  <Target className="w-3 h-3 text-[#7D5DB8] shrink-0" />
                  <span className="truncate">
                    Primary Direction: {journey.primaryDirection || user.primaryDirection || displayActiveRoadmap?.careerGoal || user.careerGoal}
                  </span>
                </div>
              )}
              <h1 className="font-display text-2xl sm:text-[26px] font-extrabold text-[#343047] tracking-tight leading-tight">
                {timeGreeting}, {(user.name ? user.name.split(' ')[0] : '') || 'Student'}!
              </h1>

              {isAuthenticated ? (
                roadmapsLoading && !displayActiveRoadmap ? (
                  <p className="text-xs sm:text-[13px] text-[#6E5964] mt-1 leading-relaxed">
                    Loading your active Learning Path and study activity...
                  </p>
                ) : displayActiveRoadmap && resumeTarget ? (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-xs sm:text-[13px] text-[#5E4A56] leading-snug">
                      Stage {resumeTarget.stageIndex + 1} of {roadmapStats.totalStages}:{' '}
                      <span className="font-bold text-[#343047]">{resumeTarget.stageTitle}</span>
                    </p>
                    <p className="text-xs font-bold text-[#343047] truncate">
                      {resumeTarget.isAllCompleted
                        ? `All ${resumeTarget.totalLessons} lessons complete · Review: ${resumeTarget.lessonTitle}`
                        : `Next Lesson: ${resumeTarget.lessonTitle}`}
                    </p>
                    <p className="text-[11px] font-semibold text-[#6F4FA8] tabular-nums">
                      {resumeTarget.progressPercent}% overall · {resumeTarget.completedLessons}/{resumeTarget.totalLessons} lessons · {roadmapStats.completedStages}/{roadmapStats.totalStages} stages done
                    </p>
                  </div>
                ) : isGeneratingRoadmap ? (
                  <p className="text-xs sm:text-[13px] text-[#6E5964] mt-1 leading-relaxed">
                    Personalizing your new Learning Path for{' '}
                    <span className="font-bold text-[#343047]">
                      {journey.primaryDirection || 'your learning direction'}
                    </span>
                    ...
                  </p>
                ) : journey.isNewLearner ? (
                  <p className="text-xs sm:text-[13px] text-[#6E5964] mt-1 leading-relaxed">
                    Welcome to your personalized study hub!{' '}
                    {!user.onboardingCompleted || !(user.primaryDirection ?? '').trim()
                      ? 'Choose your Primary Learning Direction and generate a tailored roadmap to start tracking lessons, streaks, and milestones.'
                      : `Generate your personalized roadmap for ${journey.primaryDirection} or take a quick Skill Assessment to establish your starting baseline.`}
                  </p>
                ) : (
                  <p className="text-xs sm:text-[13px] text-[#6E5964] mt-1 leading-relaxed">
                    Ready to build your Learning Path for{' '}
                    <span className="font-bold text-[#343047]">
                      {journey.primaryDirection || 'your learning direction'}
                    </span>
                    . Generate your roadmap to unlock guided lessons and milestones.
                  </p>
                )
              ) : (
                <p className="text-xs sm:text-[13px] text-[#6E5964] mt-1 leading-relaxed">
                  Ready to continue your{' '}
                  <span className="font-bold text-[#343047]">
                    {user.careerGoal || 'personalized learning'}
                  </span>{' '}
                  journey? Let&apos;s make today amazing!
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isAuthenticated && !displayActiveRoadmap ? (
                roadmapsLoading ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('roadmap')}
                    className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading Path...</span>
                  </button>
                ) : (!user.onboardingCompleted || !(user.primaryDirection ?? '').trim()) && onOpenOnboarding ? (
                  <>
                    <button
                      type="button"
                      onClick={onOpenOnboarding}
                      className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Complete Direction Setup</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('roadmap')}
                      className="px-3.5 py-2 rounded-[14px] bg-[#FFFCFA]/85 hover:bg-[#FFFCFA] text-[#343047] text-xs font-bold transition-colors shadow-xs"
                    >
                      Open Roadmap
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (onGenerateRoadmap) {
                          void onGenerateRoadmap(false);
                        } else {
                          onNavigate('roadmap');
                        }
                      }}
                      disabled={isGeneratingRoadmap}
                      className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {isGeneratingRoadmap ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Create Learning Path</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('assessment')}
                      className="px-3.5 py-2 rounded-[14px] bg-[#FFFCFA]/85 hover:bg-[#FFFCFA] text-[#343047] text-xs font-bold transition-colors shadow-xs"
                    >
                      Skill Assessment
                    </button>
                  </>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleResumeLearningPath}
                    className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {isAuthenticated && resumeTarget?.isAllCompleted
                        ? 'Review Completed Path'
                        : 'Continue Learning'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('assessment')}
                    className="px-3.5 py-2 rounded-[14px] bg-[#FFFCFA]/85 hover:bg-[#FFFCFA] text-[#343047] text-xs font-bold transition-colors shadow-xs"
                  >
                    Quick Quiz
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 4 Pastel KPI Cards (7 cols) */}
        <div className="xl:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* KPI 1: Overall Learning Progress */}
          <div
            onClick={() => onNavigate('roadmap')}
            className="rounded-[24px] bg-[#F0E9FA] border border-[#E3D7F5] p-4 sm:p-5 flex flex-col justify-between cursor-pointer pastel-card-hover"
            style={{ boxShadow: '0 10px 24px -10px rgba(154, 126, 200, 0.25), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <span className="text-xs font-bold text-[#5D5470]">Learning Progress</span>
            <div className="my-3">
              <ClayIconBadge variant="lavender" size="md">
                <TrendingUp className="w-5 h-5" />
              </ClayIconBadge>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-[28px] font-extrabold text-[#343047] tabular-nums leading-none">
                {isAuthenticated && roadmapsLoading && !displayActiveRoadmap
                  ? '—'
                  : `${realProgressPercent}%`}
              </div>
              <p className="text-[11px] font-semibold text-[#549768] mt-1.5">
                {isAuthenticated
                  ? roadmapsLoading && !displayActiveRoadmap
                    ? 'Loading...'
                    : displayActiveRoadmap
                    ? `${roadmapStats.completedLessons}/${roadmapStats.totalLessons} lessons · ${roadmapStats.remainingLessons} left`
                    : 'No roadmap yet'
                  : '↑ Stage 3 of 6'}
              </p>
            </div>
          </div>

          {/* KPI 2: Completed Stages & Lessons */}
          <div
            onClick={() => onNavigate('roadmap')}
            className="rounded-[24px] bg-[#FCEAE5] border border-[#F6D7CE] p-4 sm:p-5 flex flex-col justify-between cursor-pointer pastel-card-hover"
            style={{ boxShadow: '0 10px 24px -10px rgba(216, 148, 132, 0.22), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <span className="text-xs font-bold text-[#6E5653]">Completed Stages</span>
            <div className="my-3">
              <ClayIconBadge variant="peach" size="md">
                <Check className="w-5 h-5 stroke-[3]" />
              </ClayIconBadge>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-[28px] font-extrabold text-[#343047] tabular-nums leading-none">
                {isAuthenticated && roadmapsLoading && !displayActiveRoadmap
                  ? '—'
                  : realCompletedCoursesCount}
              </div>
              <p className="text-[11px] font-semibold text-[#549768] mt-1.5 tabular-nums">
                {isAuthenticated
                  ? roadmapsLoading && !displayActiveRoadmap
                    ? 'Loading...'
                    : displayActiveRoadmap
                    ? `of ${roadmapStats.totalStages} stages · ${roadmapStats.completedLessons} lessons`
                    : 'Create a path'
                  : 'Sample preview'}
              </p>
            </div>
          </div>

          {/* KPI 3: Daily & Weekly Study Time */}
          <div
            onClick={() => onNavigate('progress')}
            className="rounded-[24px] bg-[#E5F0E3] border border-[#D4E5D1] p-4 sm:p-5 flex flex-col justify-between cursor-pointer pastel-card-hover"
            style={{ boxShadow: '0 10px 24px -10px rgba(134, 178, 138, 0.22), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#4D6351]">Learning Hours</span>
              <span className="text-[10px] font-bold text-[#4D6351]/85">Weekly</span>
            </div>
            <div className="my-2.5">
              <ClayIconBadge variant="mint" size="md">
                <Clock className="w-5 h-5" />
              </ClayIconBadge>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-[28px] font-extrabold text-[#343047] tabular-nums leading-none">
                {isAuthenticated
                  ? sessionsLoading && learningSessions.length === 0
                    ? '—'
                    : activityMetrics.todayHoursFormatted
                  : '—'}
              </div>
              <p className="text-[11px] font-bold text-[#355E3B] mt-1.5 tabular-nums">
                {isAuthenticated
                  ? `Week: ${journey.weeklyGoal.weeklyCompletedFormatted} / ${journey.weeklyGoal.weeklyGoalFormatted}`
                  : 'Sign in to track'}
              </p>
              <p className="text-[10px] font-medium text-[#5B705E] mt-0.5 leading-tight tabular-nums">
                {isAuthenticated
                  ? `${journey.weeklyGoal.progressPercent}% of weekly goal · Total ${activityMetrics.totalStudyHoursFormatted}`
                  : 'Active study time · Idle excluded'}
              </p>
            </div>
          </div>

          {/* KPI 4: Study Streak (Meaningful learning days across lessons, quizzes, sessions) */}
          <div
            onClick={() => onNavigate('progress')}
            className="rounded-[24px] bg-[#FFF1D6] border border-[#F5E0B5] p-4 sm:p-5 flex flex-col justify-between cursor-pointer pastel-card-hover"
            style={{ boxShadow: '0 10px 24px -10px rgba(218, 176, 94, 0.22), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <span className="text-xs font-bold text-[#745D36]">Study Streak</span>
            <div className="my-3">
              <ClayIconBadge variant="yellow" size="md">
                <Flame className="w-5 h-5 fill-white" />
              </ClayIconBadge>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-[28px] font-extrabold text-[#343047] tabular-nums leading-none">
                {isAuthenticated
                  ? sessionsLoading && learningSessions.length === 0 && !displayActiveRoadmap
                    ? '—'
                    : `${journey.currentStreakDays}d`
                  : '—'}
              </div>
              <p className="text-[11px] font-semibold text-[#745D36] mt-1.5">
                {isAuthenticated
                  ? journey.currentStreakDays > 0
                    ? journey.activeToday
                      ? 'Active today'
                      : 'Active yesterday'
                    : 'Start today'
                  : 'Sign in to track'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* DIRECTION SWITCH NOTICE (Preserves previous path when Primary Learning Direction changes) */}
      {isAuthenticated &&
        !journey.directionMatchesActiveRoadmap &&
        journey.hasExplicitDirection && (
          <div className="pastel-card p-5 border-[#DECFF3] bg-[#F6F1FC] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFFCFA] border border-[#DFD2F2] text-[10px] font-extrabold text-[#6F4FA8]">
                  Primary Direction Updated
                </span>
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  Focused on: {journey.primaryDirection}
                </p>
              </div>
              {journey.preservedPreviousRoadmap && (
                <p className="text-xs text-[#5D5470]">
                  Your earlier roadmap{' '}
                  <span className="font-bold text-[#343047]">
                    “{journey.preservedPreviousRoadmap.title}”
                  </span>{' '}
                  ({journey.preservedPreviousRoadmap.progressPercent}% ·{' '}
                  {journey.preservedPreviousRoadmap.completedLessons}/
                  {journey.preservedPreviousRoadmap.totalLessons} lessons) remains safely preserved.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {journey.matchingArchivedRoadmap && onSwitchToPreservedRoadmap ? (
                <button
                  type="button"
                  disabled={isSwitchingRoadmap}
                  onClick={async () => {
                    if (!journey.matchingArchivedRoadmap) return;
                    setIsSwitchingRoadmap(true);
                    try {
                      await onSwitchToPreservedRoadmap(journey.matchingArchivedRoadmap.id);
                    } finally {
                      setIsSwitchingRoadmap(false);
                    }
                  }}
                  className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSwitchingRoadmap ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>Resume Saved {journey.primaryDirection} Path</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isGeneratingRoadmap}
                  onClick={() => {
                    if (onGenerateRoadmap) {
                      void onGenerateRoadmap(true);
                    } else {
                      onNavigate('roadmap');
                    }
                  }}
                  className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isGeneratingRoadmap ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Path...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Path for {journey.primaryDirection}</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('roadmap')}
                className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8]"
              >
                View All Paths
              </button>
            </div>
          </div>
        )}

      {/* WEEKLY STUDY GOAL, UPCOMING MILESTONE & RECENT LEARNING ACTIVITY */}
      {isAuthenticated && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Weekly Study Goal & Upcoming Milestone (6 cols) */}
          <div className="lg:col-span-6 pastel-card p-6 flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-extrabold text-[#343047]">
                    Weekly Study Goal
                  </h2>
                  <p className="text-[11px] text-[#8B8295] tabular-nums">
                    {journey.weeklyGoal.dailyGoalHours}h/day target ·{' '}
                    {journey.weeklyGoal.activeDaysThisWeek}{' '}
                    {journey.weeklyGoal.activeDaysThisWeek === 1 ? 'day' : 'days'} active this week
                  </p>
                </div>
                <span className="font-mono text-sm font-extrabold text-[#6F4FA8] tabular-nums">
                  {journey.weeklyGoal.weeklyCompletedFormatted} / {journey.weeklyGoal.weeklyGoalFormatted}
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-[#F1EAE8] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7DBE8B] to-[#A78BCE] transition-all duration-300"
                  style={{ width: `${journey.weeklyGoal.progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#6B6178] tabular-nums">
                <span>{journey.weeklyGoal.progressPercent}% of weekly goal completed</span>
                <span>
                  {journey.weeklyGoal.sessionsThisWeek}{' '}
                  {journey.weeklyGoal.sessionsThisWeek === 1 ? 'session' : 'sessions'} this week
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-extrabold text-[#6F4FA8] flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {journey.upcomingMilestone
                      ? journey.upcomingMilestone.stageLabel
                      : 'Upcoming Learning Milestone'}
                  </span>
                </p>
                <p className="text-xs font-bold text-[#343047] leading-snug">
                  {journey.upcomingMilestone
                    ? journey.upcomingMilestone.title
                    : 'Generate a personalized Learning Path to unlock stage milestones and projects.'}
                </p>
                {journey.upcomingMilestone && journey.upcomingMilestone.remainingLessonsInStage > 0 && (
                  <p className="text-[11px] text-[#8B8295] tabular-nums">
                    {journey.upcomingMilestone.remainingLessonsInStage}{' '}
                    {journey.upcomingMilestone.remainingLessonsInStage === 1
                      ? 'lesson'
                      : 'lessons'}{' '}
                    remaining to reach this milestone
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleResumeLearningPath}
                className="px-3 py-1.5 rounded-[12px] bg-[#F0E9FA] text-[#6F4FA8] text-[11px] font-bold hover:bg-[#A78BCE] hover:text-white transition-colors shrink-0"
              >
                {displayActiveRoadmap ? 'Open' : 'Start'}
              </button>
            </div>
          </div>

          {/* Recent Learning Activity (6 cols) */}
          <div className="lg:col-span-6 pastel-card p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-base font-extrabold text-[#343047]">
                  Recent Learning Activity
                </h2>
                <p className="text-[11px] text-[#8B8295]">
                  Synced from your completed lessons, quizzes, and study sessions
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="px-3 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[11px] font-bold text-[#343047] hover:bg-[#F0E9FA] transition-colors"
              >
                View All
              </button>
            </div>

            {journey.recentActivity.length === 0 ? (
              <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] my-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-[#343047]">
                    No learning activity recorded yet
                  </p>
                  <p className="text-[11px] text-[#6B6178]">
                    Complete a lesson, Knowledge Check, or diagnostic quiz to see your real timeline here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResumeLearningPath}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0"
                >
                  Start Studying
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {journey.recentActivity.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.stageId && item.lessonId && onContinueLesson) {
                        onContinueLesson(item.stageId, item.lessonId);
                      } else {
                        onNavigate('progress');
                      }
                    }}
                    className="p-3 rounded-[16px] bg-[#FAF6F2]/80 hover:bg-[#F0E9FA]/55 border border-[#EEE6E5] flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ClayIconBadge
                        variant={
                          item.type === 'lesson_completed'
                            ? 'mint'
                            : item.type === 'knowledge_check'
                            ? 'lavender'
                            : item.type === 'assessment'
                            ? 'yellow'
                            : 'peach'
                        }
                        size="sm"
                      >
                        {item.type === 'lesson_completed' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : item.type === 'knowledge_check' ? (
                          <ClipboardCheck className="w-4 h-4" />
                        ) : item.type === 'assessment' ? (
                          <GraduationCap className="w-4 h-4" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                      </ClayIconBadge>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#343047] truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[#8B8295] truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-[#8B8295] whitespace-nowrap shrink-0 tabular-nums">
                      {formatRelativeActivityTime(item.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECOND ROW: Upcoming Learning Tasks */}
      <div className="pastel-card p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-extrabold text-[#343047]">
            Upcoming Learning Tasks
          </h2>
          <button
            onClick={() => onNavigate('roadmap')}
            className="px-3 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[11px] font-bold text-[#343047] hover:bg-[#F0E9FA] transition-colors"
          >
            View All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {upcomingTasks.map((task) => (
            <div
              key={task.id}
              onClick={task.onClick}
              className="p-3 rounded-[18px] bg-[#FAF6F2]/75 hover:bg-[#F0E9FA]/55 border border-[#EEE6E5] flex items-center justify-between gap-3 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ClayIconBadge variant={task.variant} size="sm">
                  {task.icon}
                </ClayIconBadge>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#343047] truncate">{task.title}</p>
                  <p className="text-[11px] text-[#8B8295]">{task.schedule}</p>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${task.statusClass}`}
              >
                {task.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* THIRD ROW: Skill Progress Donut (40%) + Recommended Next Step (27%) + You're Doing Great (33%) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,40fr)_minmax(0,27fr)_minmax(0,33fr)] gap-5 items-stretch">
        {/* Skill Progress Donut Card (~40%) */}
        <div className="pastel-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-extrabold text-[#343047]">
              Skill Progress
            </h2>
            <button
              onClick={() => onNavigate('progress')}
              className="px-3 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[11px] font-bold text-[#343047] hover:bg-[#F0E9FA] transition-colors"
            >
              View All
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 my-auto">
            {/* Segmented Pastel Donut Ring */}
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
                <circle
                  cx="55"
                  cy="55"
                  r={donutRadius}
                  fill="none"
                  stroke="#F4EFEA"
                  strokeWidth="14"
                />
                {totalSkillSum > 0 &&
                  skillItems.map((skill, idx) => {
                    if (skill.level <= 0) return null;
                    const segmentLength = (skill.level / maxSkillRingCapacity) * donutCirc;
                    const dashArray = `${Math.max(0, segmentLength - 3)} ${donutCirc}`;
                    const dashOffset = -cumulativeOffset;
                    cumulativeOffset += segmentLength;
                    return (
                      <circle
                        key={`${skill.name}-${idx}`}
                        cx="55"
                        cy="55"
                        r={donutRadius}
                        fill="none"
                        stroke={skillColors[idx % skillColors.length]}
                        strokeWidth="14"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                      />
                    );
                  })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-xl font-extrabold text-[#343047] tabular-nums leading-none">
                  {realProgressPercent}%
                </span>
                <span className="text-[10px] font-medium text-[#8B8295] mt-0.5">
                  {isAuthenticated ? 'Progress' : 'Mastery'}
                </span>
              </div>
            </div>

            {/* Skill Breakdown Legend */}
            {skillItems.length > 0 ? (
              <div className="flex-1 min-w-0 w-full space-y-2.5">
                {skillItems.map((skill, idx) => (
                  <div
                    key={`${skill.name}-${idx}`}
                    className="flex items-start justify-between gap-2.5 text-xs"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: skillColors[idx % skillColors.length] }}
                      />
                      <span className="font-medium text-[#343047] leading-snug break-words">
                        {skill.name}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-[#343047] tabular-nums shrink-0">
                      {skill.level}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 w-full space-y-1.5 text-center sm:text-left">
                <p className="text-xs font-bold text-[#343047]">No skill data yet</p>
                <p className="text-[11px] text-[#8B8295] leading-relaxed">
                  Complete a skill assessment or start lessons in My Learning Path to see your breakdown.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* AI Learning Insight Card with Skillora Mascot (~27%) */}
        <div
          className="rounded-[24px] bg-[#F0E9FA] border border-[#E2D6F5] p-4 sm:p-5 flex items-center gap-3 relative overflow-hidden"
          style={{ boxShadow: '0 12px 26px -10px rgba(154, 126, 200, 0.28), inset 0 1px 0 rgba(255,255,255,0.85)' }}
        >
          <div className="w-[96px] h-[96px] xl:w-[100px] xl:h-[100px] shrink-0 flex items-center justify-center self-center">
            <img
              src={SKILLORA_LOGO_SRC}
              alt="Skillora Mascot"
              className="w-full h-full object-contain select-none bg-transparent"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="font-display text-sm font-extrabold text-[#343047] leading-snug">
              Recommended Next Step
            </h3>
            <p className="text-[11px] text-[#5D5470] leading-relaxed">
              {isAuthenticated && displayActiveRoadmap && primaryIncompleteStage && primaryIncompleteLesson
                ? `Continue "${primaryIncompleteLesson.title}" in Stage ${roadmapStats.currentStageNumber}: ${primaryIncompleteStage.title} (${roadmapStats.remainingLessons} ${
                    roadmapStats.remainingLessons === 1 ? 'lesson' : 'lessons'
                  } left).`
                : isAuthenticated &&
                  displayActiveRoadmap &&
                  roadmapStats.totalLessons > 0 &&
                  roadmapStats.remainingLessons === 0
                ? `All ${roadmapStats.totalLessons} lessons complete! Take a skill assessment to validate your mastery.`
                : latestGapAttempt
                ? `Review ${latestGapAttempt.knowledgeGaps[0]} from your ${latestGapAttempt.subject} assessment.`
                : topRecommendedAssessment
                ? `Based on your focus${
                    user.learningInterests[0] ? ` in ${user.learningInterests[0]}` : ''
                  }, try the ${topRecommendedAssessment.label} assessment.`
                : 'Discover your baseline with a personalized skill diagnostic quiz.'}
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {isAuthenticated &&
              displayActiveRoadmap &&
              primaryIncompleteStage &&
              primaryIncompleteLesson ? (
                <button
                  onClick={handleResumeLearningPath}
                  className="clay-button-primary px-3 py-1.5 text-[11px] font-bold max-w-full"
                >
                  Continue Lesson
                </button>
              ) : (
                <button
                  onClick={() => onNavigate('assessment')}
                  className="clay-button-primary px-3 py-1.5 text-[11px] font-bold max-w-full"
                >
                  Start Assessment
                </button>
              )}
              <button
                onClick={() =>
                  onOpenAssistantPrompt(
                    isAuthenticated &&
                      displayActiveRoadmap &&
                      primaryIncompleteLesson
                      ? `Explain "${primaryIncompleteLesson.title}" from my ${displayActiveRoadmap.title} learning path.`
                      : latestGapAttempt
                      ? `Help me practice "${latestGapAttempt.knowledgeGaps[0]}" in ${latestGapAttempt.subject}`
                      : user.primaryDirection || user.careerGoal
                      ? `Help me plan study tips for my direction: ${user.primaryDirection || user.careerGoal}`
                      : 'Suggest a study routine for my learning interests'
                  )
                }
                className="px-2.5 py-1.5 rounded-[12px] bg-[#FFFCFA] border border-[#E2D6F5] text-[10px] font-bold text-[#6F4FA8] hover:bg-[#FAF6F2] max-w-full"
              >
                Ask Tutor
              </button>
            </div>
          </div>
        </div>

        {/* Encouragement Card with Cute 3D Cloud (~33%) */}
        <div
          className="rounded-[24px] bg-[#FFF1D6] border border-[#F5E1B8] p-5 flex items-center justify-between gap-3 relative overflow-hidden"
          style={{ boxShadow: '0 12px 26px -10px rgba(218, 176, 94, 0.25), inset 0 1px 0 rgba(255,255,255,0.85)' }}
        >
          <div className="shrink-0">
            <SmilingCloudMascot3D className="w-28 h-20" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="font-display text-lg font-extrabold text-[#343047] leading-tight">
              You're doing great!
            </h3>
            <p className="text-xs text-[#705D38] leading-relaxed">
              {isAuthenticated
                ? displayActiveRoadmap && roadmapStats.completedLessons > 0
                  ? `${roadmapStats.completedLessons} of ${roadmapStats.totalLessons} lessons completed (${roadmapStats.progressPercent}%). Keep going!`
                  : assessmentAttempts.length > 0
                  ? `${assessmentAttempts.length} skill ${
                      assessmentAttempts.length === 1 ? 'assessment' : 'assessments'
                    } completed. Keep building momentum!`
                  : 'Create your learning path or take a skill assessment to track real progress.'
                : 'Explore your learning path and track your progress step by step.'}
            </p>
            <button
              onClick={() => onNavigate('progress')}
              className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#8E6521] hover:underline"
            >
              <span>See Progress</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* FOURTH ROW: Active Learning Roadmap Strip (Real or Empty CTA for Signed-In, Sample Demo for Visitors) */}
      <div className="pastel-card p-6 space-y-4">
        {isAuthenticated ? (
          roadmapsLoading && !displayActiveRoadmap ? (
            <div className="py-6 flex items-center justify-center gap-3 text-xs font-bold text-[#8E6EC8]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading your personalized learning roadmap...</span>
            </div>
          ) : !displayActiveRoadmap ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg font-extrabold text-[#343047]">
                    {isGeneratingRoadmap
                      ? `Generating your ${journey.primaryDirection || 'personalized'} roadmap...`
                      : 'Your personalized learning journey starts here!'}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#6F4FA8] text-[10px] font-extrabold">
                    AI Powered
                  </span>
                </div>
                <p className="text-xs text-[#6B6178] max-w-2xl">
                  Generate a tailored roadmap built around your learning direction (
                  <span className="font-bold text-[#343047]">
                    {user.primaryDirection || user.careerGoal || 'set in your profile'}
                  </span>
                  ), preferred study pace, and skill assessment results.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <button
                  onClick={() => {
                    if (onGenerateRoadmap) {
                      void onGenerateRoadmap(Boolean(activeRoadmap));
                    } else {
                      onNavigate('roadmap');
                    }
                  }}
                  disabled={isGeneratingRoadmap}
                  className="clay-button-primary px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isGeneratingRoadmap ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate My Learning Path</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => onNavigate('roadmap')}
                  className="clay-button-soft px-3.5 py-2.5 text-xs font-bold text-[#6F4FA8]"
                >
                  Open Roadmap
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-lg font-extrabold text-[#343047]">
                      {displayActiveRoadmap.title}
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        displayActiveRoadmap.roadmapData.assessmentValidated
                          ? 'bg-[#DCECD9] border-[#C2DFBC] text-[#356640]'
                          : 'bg-[#FFF1D6] border-[#F3DFB4] text-[#7A5720]'
                      }`}
                    >
                      {displayActiveRoadmap.roadmapData.assessmentValidated
                        ? 'Assessment-Validated'
                        : 'Provisional Plan'}
                    </span>
                  </div>
                  <p className="text-xs text-[#8B8295] mt-0.5">
                    {roadmapStats.currentStageTitle
                      ? `Stage ${roadmapStats.currentStageNumber} of ${roadmapStats.totalStages}: ${roadmapStats.currentStageTitle}`
                      : displayActiveRoadmap.careerGoal || user.careerGoal || 'Personalized Track'}{' '}
                    · {roadmapStats.completedLessons}/{roadmapStats.totalLessons} lessons ({roadmapStats.progressPercent}%) · {roadmapStats.remainingLessons} remaining
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('roadmap')}
                  className="text-xs font-bold text-[#8B68C7] hover:text-[#6B4B9E] flex items-center gap-1 shrink-0"
                >
                  <span>Open Full Roadmap</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="w-full h-2.5 rounded-full bg-[#F1EAE8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#A78BCE] to-[#7DBE8B] transition-all duration-300"
                    style={{ width: `${roadmapStats.progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {displayActiveRoadmap.roadmapData.stages.slice(0, 6).map((stage, idx) => {
                  const isCompleted = stage.status === 'completed';
                  const isCurrent = stage.status === 'in_progress';
                  return (
                    <div
                      key={stage.id}
                      onClick={() =>
                        onOpenCourse ? onOpenCourse(stage.id) : onNavigate('roadmap')
                      }
                      className={`p-3.5 rounded-[18px] border text-left cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                        isCompleted
                          ? 'bg-[#DCECD9]/65 border-[#C4DFBF] hover:bg-[#DCECD9]'
                          : isCurrent
                          ? 'bg-[#F0E9FA] border-[#C9B7E8] shadow-xs ring-2 ring-[#C9B7E8]/40'
                          : 'bg-[#FAF6F2] border-[#EEE6E5] hover:bg-[#FFFCFA]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`font-mono text-[10px] font-bold ${
                              isCompleted
                                ? 'text-[#3C7347]'
                                : isCurrent
                                ? 'text-[#7B59B6]'
                                : 'text-[#8B8295]'
                            }`}
                          >
                            Stage {idx + 1}
                          </span>
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-[#4B8B59] shrink-0" />
                          ) : isCurrent ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#A78BCE]" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#CFC7D4] shrink-0" />
                          )}
                        </div>

                        <p className="text-xs font-bold text-[#343047] truncate">{stage.title}</p>
                        <p className="text-[10px] text-[#8B8295] mt-1 capitalize">
                          {isCompleted
                            ? 'Completed'
                            : isCurrent
                            ? 'In Progress'
                            : 'Upcoming'}
                        </p>
                      </div>

                      {idx === 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenCourse) {
                              onOpenCourse(stage.id);
                            } else {
                              onNavigate('roadmap');
                            }
                          }}
                          className="w-full py-1.5 px-2.5 rounded-[10px] bg-[#FFFCFA] hover:bg-[#A78BCE] hover:text-white border border-[#DED0F5] text-[10px] font-bold text-[#6F4FA8] transition-colors flex items-center justify-center gap-1"
                        >
                          <span>View Course</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg font-extrabold text-[#343047]">
                    Current Learning Roadmap
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-[10px] font-extrabold">
                    Sample Demo
                  </span>
                </div>
                <p className="text-xs text-[#8B8295] mt-0.5">
                  Sample Python roadmap preview · Active goal:{' '}
                  <span className="font-bold text-[#343047]">{user.careerGoal || 'Not set yet'}</span>
                </p>
              </div>
              <button
                onClick={() => onNavigate('roadmap')}
                className="text-xs font-bold text-[#8B68C7] hover:text-[#6B4B9E] flex items-center gap-1"
              >
                <span>Open Sample Roadmap</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {roadmapSteps.map((step, idx) => {
                const isCompleted = step.status === 'completed';
                const isCurrent = step.status === 'current';
                return (
                  <div
                    key={idx}
                    onClick={() => onNavigate('roadmap')}
                    className={`p-3.5 rounded-[18px] border text-left cursor-pointer transition-all ${
                      isCompleted
                        ? 'bg-[#DCECD9]/65 border-[#C4DFBF] hover:bg-[#DCECD9]'
                        : isCurrent
                        ? 'bg-[#F0E9FA] border-[#C9B7E8] shadow-xs ring-2 ring-[#C9B7E8]/40'
                        : 'bg-[#FAF6F2] border-[#EEE6E5] hover:bg-[#FFFCFA]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          isCompleted
                            ? 'text-[#3C7347]'
                            : isCurrent
                            ? 'text-[#7B59B6]'
                            : 'text-[#8B8295]'
                        }`}
                      >
                        Stage {idx + 1}
                      </span>
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-[#4B8B59] shrink-0" />
                      ) : isCurrent ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#A78BCE]" />
                      ) : (
                        <Circle className="w-4 h-4 text-[#CFC7D4] shrink-0" />
                      )}
                    </div>

                    <p className="text-xs font-bold text-[#343047] truncate">{step.name}</p>
                    <p className="text-[10px] text-[#8B8295] mt-1 capitalize">
                      {step.status === 'completed'
                        ? 'Completed'
                        : step.status === 'current'
                        ? 'In Progress'
                        : 'Upcoming'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* FIFTH ROW: Continue Learning + Recommended Courses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Continue Learning (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#343047]">
                Continue Learning
              </h2>
              <p className="text-xs text-[#8B8295]">
                {isAuthenticated
                  ? displayActiveRoadmap
                    ? 'Jump right back into your next incomplete lesson'
                    : 'Your active roadmap courses will appear here'
                  : 'Active courses in progress'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('roadmap')}
              className="text-xs font-bold text-[#8B68C7] hover:underline"
            >
              My Learning Path
            </button>
          </div>

          {isAuthenticated ? (
            roadmapsLoading && !displayActiveRoadmap ? (
              <div className="pastel-card p-6 flex items-center justify-center gap-2.5 text-xs font-bold text-[#8E6EC8]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading your courses...</span>
              </div>
            ) : !displayActiveRoadmap || continueLearningStages.length === 0 ? (
              <div className="pastel-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    No active Learning Path yet
                  </p>
                  <p className="text-xs text-[#8B8295]">
                    Complete a quick Skill Assessment or generate your personalized Learning Path to unlock guided courses and lessons.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onNavigate('assessment')}
                    className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8]"
                  >
                    Skill Assessment
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('roadmap')}
                    className="clay-button-primary px-4 py-2 text-xs font-bold"
                  >
                    Create Learning Path
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {continueLearningStages.map((item, idx) => {
                  const cardTints = ['bg-[#F0E9FA]/60', 'bg-[#FCECE7]/70', 'bg-[#E5F0E3]/70'];
                  const badgeVariants: ClayColorVariant[] = ['lavender', 'peach', 'mint'];
                  return (
                    <div
                      key={item.stage.id}
                      className="pastel-card pastel-card-hover p-4 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-3">
                        <div
                          className={`p-3 rounded-[16px] ${cardTints[idx % cardTints.length]} flex items-center justify-between`}
                        >
                          <ClayIconBadge variant={badgeVariants[idx % badgeVariants.length]} size="sm">
                            <Terminal className="w-4 h-4" />
                          </ClayIconBadge>
                          <span className="font-mono text-xs font-bold text-[#343047] tabular-nums">
                            {item.pct}%
                          </span>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold text-[#8B8295]">
                            Stage {item.stageIndex + 1} · {item.stage.difficulty}
                          </p>
                          <h3 className="font-display text-sm font-extrabold text-[#343047] line-clamp-2 mt-0.5 leading-snug">
                            {item.stage.title}
                          </h3>
                          {item.nextLesson && (
                            <p className="text-[11px] text-[#6F4FA8] font-medium truncate mt-1">
                              Next: {item.nextLesson.title}
                            </p>
                          )}
                        </div>

                        <div className="w-full bg-[#F1EAE8] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#A78BCE] h-full rounded-full transition-all duration-300"
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => {
                            if (item.nextLesson && onContinueLesson) {
                              onContinueLesson(item.stage.id, item.nextLesson.id);
                            } else if (onOpenCourse) {
                              onOpenCourse(item.stage.id);
                            } else {
                              onNavigate('roadmap');
                            }
                          }}
                          className="w-full py-2 px-3 rounded-[14px] bg-[#FAF6F2] hover:bg-[#A78BCE] text-[#343047] hover:text-white border border-[#EEE6E5] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>
                            {item.nextLesson
                              ? item.pct === 0
                                ? 'Start Lesson'
                                : 'Continue'
                              : 'Review'}
                          </span>
                        </button>
                        {idx === 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenCourse ? onOpenCourse(item.stage.id) : onNavigate('roadmap')
                            }
                            className="w-full py-1.5 px-3 rounded-[12px] bg-[#FFFCFA] hover:bg-[#F0E9FA] text-[#6F4FA8] border border-[#E2D6F5] text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                          >
                            <span>View Course</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CONTINUE_LEARNING_COURSES.map((course, idx) => {
                const cardTints = ['bg-[#F0E9FA]/60', 'bg-[#FCECE7]/70', 'bg-[#E5F0E3]/70'];
                const badgeVariants: ClayColorVariant[] = ['lavender', 'peach', 'mint'];
                return (
                  <div
                    key={course.id}
                    className="pastel-card pastel-card-hover p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-3">
                      <div
                        className={`p-3 rounded-[16px] ${cardTints[idx % cardTints.length]} flex items-center justify-between`}
                      >
                        <ClayIconBadge variant={badgeVariants[idx % badgeVariants.length]} size="sm">
                          <Terminal className="w-4 h-4" />
                        </ClayIconBadge>
                        <span className="font-mono text-xs font-bold text-[#343047] tabular-nums">
                          {course.progressPercent}%
                        </span>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-[#8B8295]">{course.category}</p>
                        <h3 className="font-display text-sm font-extrabold text-[#343047] line-clamp-2 mt-0.5 leading-snug">
                          {course.title}
                        </h3>
                      </div>

                      <div className="w-full bg-[#F1EAE8] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#A78BCE] h-full rounded-full transition-all duration-300"
                          style={{ width: `${course.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => onSelectCourse(course)}
                      className="w-full py-2 px-3 rounded-[14px] bg-[#FAF6F2] hover:bg-[#A78BCE] text-[#343047] hover:text-white border border-[#EEE6E5] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Continue</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recommended Courses (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#343047]">
                Recommended For You
              </h2>
              <p className="text-xs text-[#8B8295]">Tailored next steps</p>
            </div>
            <button
              onClick={() => onNavigate('resources')}
              className="text-xs font-bold text-[#8B68C7] hover:underline"
            >
              Explore Resources
            </button>
          </div>

          {isAuthenticated ? (
            exploreLoading && personalizedRecommendations.length === 0 ? (
              <div className="pastel-card p-5 flex items-center justify-center gap-2.5 text-xs font-bold text-[#8E6EC8]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Personalizing recommendations for your profile...</span>
              </div>
            ) : personalizedRecommendations.length === 0 ? (
              <div className="pastel-card p-5 space-y-2.5">
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  Personalize Your Recommendations
                </p>
                <p className="text-xs text-[#6B6178] leading-relaxed">
                  Add your interests, academic background, and career goal in My Profile or complete a Skill Assessment to get tailored courses and lessons.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('profile')}
                    className="clay-button-soft px-3.5 py-1.5 text-xs font-bold text-[#6F4FA8]"
                  >
                    Update Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('assessment')}
                    className="clay-button-primary px-3.5 py-1.5 text-xs font-bold"
                  >
                    Start Assessment
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {personalizedRecommendations.map((item) => {
                  const handleItemClick = () => {
                    switch (item.action.type) {
                      case 'lesson':
                        if (onContinueLesson) {
                          onContinueLesson(item.action.stageId, item.action.lessonId);
                        } else {
                          onNavigate('roadmap');
                        }
                        break;
                      case 'assessment':
                        onNavigate('assessment');
                        break;
                      case 'resource':
                        if (onExploreResource) {
                          onExploreResource(item.action.searchQuery);
                        } else {
                          onNavigate('resources');
                        }
                        break;
                      case 'assistant':
                        onOpenAssistantPrompt(item.action.prompt);
                        break;
                    }
                  };

                  return (
                    <div
                      key={item.id}
                      onClick={handleItemClick}
                      className="pastel-card pastel-card-hover p-3.5 flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ClayIconBadge variant={item.variant} size="md">
                          {item.kind === 'assessment' ? (
                            <GraduationCap className="w-5 h-5" />
                          ) : item.kind === 'gap_review' ? (
                            <Target className="w-5 h-5" />
                          ) : (
                            <BookOpen className="w-5 h-5" />
                          )}
                        </ClayIconBadge>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-[#8B8295] truncate">
                            {item.category} · {item.meta}
                          </p>
                          <h4 className="font-display text-xs sm:text-sm font-extrabold text-[#343047] truncate">
                            {item.title}
                          </h4>
                          <p className="text-[10px] font-medium text-[#6F4FA8] truncate mt-0.5">
                            {item.reason}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleItemClick();
                        }}
                        className="px-3 py-1.5 rounded-[12px] bg-[#F0E9FA] text-[#6B4FA1] text-[11px] font-bold shrink-0 hover:bg-[#A78BCE] hover:text-white transition-colors"
                      >
                        {item.ctaLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-3">
              {RECOMMENDED_COURSES.map((course, idx) => {
                const variants: ClayColorVariant[] = ['yellow', 'pink', 'lavender'];
                return (
                  <div
                    key={course.id}
                    onClick={() => onSelectCourse(course)}
                    className="pastel-card pastel-card-hover p-3.5 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ClayIconBadge variant={variants[idx % variants.length]} size="md">
                        <BookOpen className="w-5 h-5" />
                      </ClayIconBadge>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#8B8295]">
                          {course.category} · {course.duration}
                        </p>
                        <h4 className="font-display text-xs sm:text-sm font-extrabold text-[#343047] truncate">
                          {course.title}
                        </h4>
                      </div>
                    </div>

                    <button className="px-3 py-1.5 rounded-[12px] bg-[#F0E9FA] text-[#6B4FA1] text-[11px] font-bold shrink-0 hover:bg-[#A78BCE] hover:text-white transition-colors">
                      Start
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SIXTH ROW: Compact Knowledge Check Summary */}
      <div className="pastel-card p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ClayIconBadge variant="lavender" size="sm">
              <ClipboardCheck className="w-4 h-4" />
            </ClayIconBadge>
            <div>
              <h2 className="font-display text-base font-extrabold text-[#343047]">
                Knowledge Check Summary
              </h2>
              <p className="text-[11px] text-[#8B8295]">
                Lesson quiz mastery &amp; adaptive next step recommendations
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('progress')}
            className="px-3 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[11px] font-bold text-[#6F4FA8] hover:bg-[#F0E9FA] transition-colors"
          >
            View History
          </button>
        </div>

        {!isAuthenticated ? (
          <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#6B6178]">
              Sign in and complete Knowledge Checks inside your lessons to track real quiz scores, weak topics, and adaptive recommendations.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('roadmap')}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0"
            >
              Explore Learning Path
            </button>
          </div>
        ) : knowledgeChecksLoading && knowledgeCheckAttempts.length === 0 ? (
          <div className="py-4 flex items-center justify-center gap-2 text-xs font-bold text-[#8E6EC8]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading Knowledge Check summary...</span>
          </div>
        ) : kcSummary.totalQuizzes === 0 ? (
          <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-[#343047]">No Knowledge Checks completed yet</p>
              <p className="text-[11px] text-[#6B6178]">
                Open any lesson in My Learning Path and take its 3–5 question Knowledge Check to unlock adaptive next steps.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResumeLearningPath}
              className="clay-button-primary px-4 py-2 text-xs font-bold shrink-0"
            >
              Open Next Lesson
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Total Quizzes Completed */}
              <div className="p-3.5 rounded-[18px] bg-[#F0E9FA]/65 border border-[#E2D6F5]">
                <p className="text-[11px] font-bold text-[#6F4FA8]">Total Quizzes Completed</p>
                <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {kcSummary.totalQuizzes}
                </p>
                <p className="text-[10px] text-[#6E5F8A] mt-0.5">Saved lesson attempts</p>
              </div>

              {/* Average Quiz Score */}
              <div className="p-3.5 rounded-[18px] bg-[#DCECD9]/60 border border-[#C2DFBC]">
                <p className="text-[11px] font-bold text-[#325E3B]">Average Quiz Score</p>
                <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {kcSummary.averageScore !== null ? `${kcSummary.averageScore}%` : '—'}
                </p>
                <p className="text-[10px] text-[#456D4C] mt-0.5">Across all knowledge checks</p>
              </div>

              {/* Recent Quiz Result */}
              <div className="p-3.5 rounded-[18px] bg-[#FFF1D6]/65 border border-[#F3DFB4]">
                <p className="text-[11px] font-bold text-[#855C1C]">Recent Quiz Result</p>
                {kcSummary.recentAttempt ? (
                  <>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="font-display text-xl font-extrabold text-[#343047] tabular-nums">
                        {kcSummary.recentAttempt.score}%
                      </span>
                      <span className="text-[11px] font-bold text-[#7A5720]">
                        ({kcSummary.recentAttempt.correctAnswers}/
                        {kcSummary.recentAttempt.totalQuestions})
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-[#343047] truncate mt-0.5">
                      {kcSummary.recentAttempt.lessonTitle}
                    </p>
                    <p className="text-[10px] text-[#8B7342]">
                      {formatKnowledgeCheckDate(kcSummary.recentAttempt.completedAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[#6B6178] mt-1">No recent quiz</p>
                )}
              </div>

              {/* Recommended Next Learning Activity */}
              <div className="p-3.5 rounded-[18px] bg-[#FCEAE5]/65 border border-[#F5D3CA] flex flex-col justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold text-[#9C5042] flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    <span>Recommended Next Activity</span>
                  </p>
                  <p className="text-xs font-extrabold text-[#343047] mt-1 line-clamp-2 leading-snug">
                    {kcSummary.recommendedNextActivity?.title || 'Continue My Learning Path'}
                  </p>
                  <p className="text-[10px] text-[#6E5653] mt-0.5 line-clamp-2 leading-relaxed">
                    {kcSummary.recommendedNextActivity?.description ||
                      'Review weak concepts or move forward to your next lesson.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const rec = kcSummary.recommendedNextActivity;
                    const recent = kcSummary.recentAttempt;
                    if (
                      rec?.action === 'next_lesson' &&
                      rec.targetStageId &&
                      rec.targetLessonId &&
                      onContinueLesson
                    ) {
                      onContinueLesson(rec.targetStageId, rec.targetLessonId);
                    } else if (recent?.stageId && recent?.lessonId && onContinueLesson) {
                      onContinueLesson(recent.stageId, recent.lessonId);
                    } else {
                      handleResumeLearningPath();
                    }
                  }}
                  className="w-full py-1.5 px-2.5 rounded-[10px] bg-[#FFFCFA] border border-[#F3C5BA] text-[11px] font-bold text-[#8D3E32] hover:bg-[#FAF6F2] transition-colors flex items-center justify-center gap-1"
                >
                  <span>
                    {kcSummary.recommendedNextActivity?.action === 'next_lesson'
                      ? 'Go to Next Lesson'
                      : kcSummary.recommendedNextActivity?.action === 'additional_practice'
                      ? 'Practice Weak Concepts'
                      : kcSummary.recommendedNextActivity?.action === 'review_fundamentals'
                      ? 'Review Fundamentals'
                      : 'Open Recommended Lesson'}
                  </span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {kcSummary.weakTopics.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-0.5 text-[11px]">
                <span className="font-bold text-[#855C1C]">Topics needing review:</span>
                {kcSummary.weakTopics.map((topic, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] font-bold text-[10px]"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
