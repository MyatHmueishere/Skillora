import React, { useState } from 'react';
import {
  Compass,
  Clock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Loader2,
  Target,
  BookOpen,
  Archive,
  ShieldCheck,
  Info,
  X,
  Play,
  ArrowRight,
  Circle,
  Layers,
} from 'lucide-react';
import {
  RoadmapStage,
  AppView,
  UserProfile,
  LearningRoadmapRecord,
  AssessmentAttemptRecord,
  GeneratedRoadmapStage,
} from '../../types';
import {
  ClayIconBadge,
  BooksTrophy3D,
  SmilingCloudMascot3D,
} from '../common/PastelIllustrations';
import { computeRoadmapStats, formatRoadmapDateSafe } from './roadmapUiHelpers';
import {
  doesRoadmapMatchDirection,
  findBestMatchingRoadmapForDirection,
} from '../../lib/dashboardJourney';
import { CourseCoverIllustration } from './CourseIllustrations';
import { CourseDetailView } from './CourseDetailView';

interface RoadmapViewProps {
  isAuthenticated: boolean;
  authUserId?: string | null;
  user: UserProfile;
  attempts: AssessmentAttemptRecord[];
  // Real Supabase + Gemini roadmap props
  activeRoadmap: LearningRoadmapRecord | null;
  archivedRoadmaps: LearningRoadmapRecord[];
  roadmapsLoading: boolean;
  roadmapsError: string;
  isGeneratingRoadmap: boolean;
  roadmapGenerationError: string;
  roadmapSaveError: string;
  savingLessonId: string | null;
  selectedCourseId: string | null;
  onSelectCourse: (stageId: string | null) => void;
  onGenerateRoadmap: (replaceActive?: boolean) => Promise<boolean>;
  onConfirmRoadmapPlan?: () => Promise<void>;
  isConfirmingRoadmap?: boolean;
  onToggleRoadmapLesson: (stageId: string, lessonId: string) => Promise<void>;
  onStartLearningLesson: (stageId: string, lessonId: string) => void;
  onOpenArchivedLesson?: (roadmapId: string, stageId: string, lessonId: string) => void;
  onSwitchToPreservedRoadmap?: (roadmapId: string) => Promise<void> | void;
  onRetryLoadRoadmaps: () => void;
  onClearGenerationError: () => void;
  // Unauthenticated demo fallback props
  demoStages: RoadmapStage[];
  onToggleDemoLesson: (stageId: number, lessonId: string) => void;
  onNavigate: (view: AppView) => void;
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({
  isAuthenticated,
  authUserId = null,
  user,
  attempts,
  activeRoadmap,
  archivedRoadmaps,
  roadmapsLoading,
  roadmapsError,
  isGeneratingRoadmap,
  roadmapGenerationError,
  roadmapSaveError,
  savingLessonId,
  selectedCourseId,
  onSelectCourse,
  onGenerateRoadmap,
  onConfirmRoadmapPlan,
  isConfirmingRoadmap = false,
  onToggleRoadmapLesson,
  onStartLearningLesson,
  onOpenArchivedLesson,
  onSwitchToPreservedRoadmap,
  onRetryLoadRoadmaps,
  onClearGenerationError,
  demoStages,
  onToggleDemoLesson,
  onNavigate,
}) => {
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'upcoming'>('all');
  const [showPersonalizationNote, setShowPersonalizationNote] = useState(false);
  const [showMilestonesPanel, setShowMilestonesPanel] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [showArchivedSection, setShowArchivedSection] = useState(false);
  const [expandedArchivedId, setExpandedArchivedId] = useState<string | null>(null);
  const [restoringRoadmapId, setRestoringRoadmapId] = useState<string | null>(null);

  const handleConfirmRegenerate = async () => {
    setShowRegenerateModal(false);
    onSelectCourse(null);
    await onGenerateRoadmap(true);
  };

  // =========================================================================
  // BRANCH 1: UNAUTHENTICATED DEMO PREVIEW (Course-based preview layout)
  // =========================================================================
  if (!isAuthenticated) {
    const mappedDemoStages: GeneratedRoadmapStage[] = demoStages.map((s) => {
      const done = s.lessons.filter((l) => l.completed).length;
      const status: 'completed' | 'in_progress' | 'upcoming' =
        s.lessons.length > 0 && done === s.lessons.length
          ? 'completed'
          : done > 0 || s.status === 'in_progress'
          ? 'in_progress'
          : 'upcoming';
      return {
        id: `demo-stage-${s.id}`,
        title: s.title,
        description: s.description,
        learningObjectives: s.keyTopics,
        estimatedDuration: s.estimatedDuration,
        difficulty: s.id <= 2 ? 'Beginner' : s.id <= 4 ? 'Intermediate' : 'Advanced',
        prerequisites: s.id > 1 ? [`Stage ${s.id - 1}`] : [],
        lessons: s.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: `${l.type.charAt(0).toUpperCase() + l.type.slice(1)} unit`,
          estimatedTime: l.duration,
          learningObjectives: [],
          completed: l.completed,
        })),
        practiceActivities: [],
        suggestedMiniProject: '',
        status,
      };
    });

    if (selectedCourseId) {
      const idx = mappedDemoStages.findIndex((s) => s.id === selectedCourseId);
      const selectedDemo = idx >= 0 ? mappedDemoStages[idx] : null;
      const rawDemoId = idx >= 0 ? demoStages[idx]?.id : undefined;

      if (selectedDemo && rawDemoId !== undefined) {
        return (
          <CourseDetailView
            stage={selectedDemo}
            courseIndex={idx}
            totalCourses={mappedDemoStages.length}
            roadmapTitle="Python Developer Sample Track"
            savingLessonId={null}
            onBackToCourses={() => onSelectCourse(null)}
            onToggleLessonComplete={(_stageId, lessonId) =>
              onToggleDemoLesson(rawDemoId, lessonId)
            }
            onStartLearningLesson={() => {}}
            isDemoMode={true}
          />
        );
      }
    }

    const totalDemoLessons = mappedDemoStages.reduce((acc, s) => acc + s.lessons.length, 0);
    const completedDemoLessons = mappedDemoStages.reduce(
      (acc, s) => acc + s.lessons.filter((l) => l.completed).length,
      0
    );
    const overallDemoProgress = Math.round(
      (completedDemoLessons / (totalDemoLessons || 1)) * 100
    );
    const activeDemoIdx = mappedDemoStages.findIndex((s) => s.status === 'in_progress');
    const currentDemoStage =
      activeDemoIdx >= 0 ? mappedDemoStages[activeDemoIdx] : mappedDemoStages[0];

    const filteredDemoCourses = mappedDemoStages.filter((s) =>
      filter === 'all' ? true : s.status === filter
    );

    return (
      <div className="space-y-6 pb-10 animate-in fade-in duration-150">
        {/* Compact Journey Banner (Demo Preview) */}
        <div
          className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
          style={{
            background: 'linear-gradient(135deg, #FCEAE5 0%, #FAF6F2 50%, #F0E9FA 100%)',
            boxShadow: '0 12px 30px -12px rgba(154, 126, 200, 0.25)',
          }}
        >
          <div className="flex items-center gap-5">
            <BooksTrophy3D className="w-20 h-18 hidden sm:block shrink-0" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#6F4FA8] flex-wrap">
                <span>Sample Preview Track</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#5E5468] font-semibold">
                  Sign in for AI-personalized courses
                </span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
                Python Developer Sample Courses
              </h1>
              {currentDemoStage && (
                <p className="text-xs sm:text-sm text-[#5E5468]">
                  Current Course:{' '}
                  <span className="font-bold text-[#343047]">{currentDemoStage.title}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="px-4 py-3 rounded-[20px] bg-[#FFFCFA] border border-[#EEE6E5] flex items-center gap-3.5">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#F1EAE8]"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#A78BCE]"
                    strokeDasharray={`${overallDemoProgress}, 100`}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute font-display text-xs font-extrabold text-[#343047] tabular-nums">
                  {overallDemoProgress}%
                </span>
              </div>
              <div className="text-xs">
                <p className="font-display font-extrabold text-[#343047]">Overall Progress</p>
                <p className="text-[#8B8295] font-mono tabular-nums">
                  {completedDemoLessons} / {totalDemoLessons} lessons
                </p>
              </div>
            </div>

            {currentDemoStage && (
              <button
                type="button"
                onClick={() => onSelectCourse(currentDemoStage.id)}
                className="clay-button-primary px-5 py-3 text-xs font-extrabold inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Continue Learning</span>
              </button>
            )}
          </div>
        </div>

        {/* Courses Header + Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#343047]">
              My Learning Courses
            </h2>
            <p className="text-xs text-[#8B8295]">
              Select any course card to view its syllabus and lessons
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-[#FFFCFA] border border-[#EEE6E5] rounded-2xl shadow-2xs overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${mappedDemoStages.length})` },
                  { id: 'in_progress', label: 'In Progress' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'upcoming', label: 'Upcoming' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                    filter === tab.id
                      ? 'bg-[#A78BCE] text-white shadow-xs'
                      : 'text-[#6B6178] hover:text-[#343047]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assessment')}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Skill Assessment</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredDemoCourses.map((course) => {
            const stageIdx = mappedDemoStages.findIndex((s) => s.id === course.id);
            const done = course.lessons.filter((l) => l.completed).length;
            const total = course.lessons.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isDone = course.status === 'completed';
            const isActive = course.status === 'in_progress';

            return (
              <div
                key={course.id}
                onClick={() => onSelectCourse(course.id)}
                className="pastel-card pastel-card-hover overflow-hidden flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <CourseCoverIllustration
                    title={course.title}
                    stageIndex={stageIdx}
                    className="w-full h-36 border-b border-[#F1EAE8]"
                  />

                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#7B7188]">
                      <span>
                        Course {stageIdx + 1} · {course.difficulty}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          isDone
                            ? 'text-[#356640]'
                            : isActive
                            ? 'text-[#6F4FA8]'
                            : 'text-[#8B8295]'
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : isActive ? (
                          <Play className="w-3 h-3 fill-current" />
                        ) : (
                          <Circle className="w-3 h-3" />
                        )}
                        <span>
                          {isDone ? 'Completed' : isActive ? 'In Progress' : 'Upcoming'}
                        </span>
                      </span>
                    </div>

                    <h3 className="font-display text-base sm:text-lg font-extrabold text-[#343047] group-hover:text-[#6F4FA8] transition-colors leading-snug">
                      {course.title}
                    </h3>

                    <p className="text-xs text-[#6B6178] leading-relaxed line-clamp-2">
                      {course.description}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-[#F4EEEC] space-y-3.5">
                  <div className="flex items-center justify-between text-xs text-[#7B7188]">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-[#8E6EC8]" />
                      <span>{total} lessons</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#D17865]" />
                      <span>{course.estimatedDuration}</span>
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-[#7B7188]">Completion</span>
                      <span className="font-mono text-[#343047] tabular-nums">{pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#F1EAE8] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isDone ? 'bg-[#7DBE8B]' : 'bg-[#A78BCE]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCourse(course.id);
                    }}
                    className={`w-full py-2.5 px-4 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 ${
                      isActive
                        ? 'clay-button-primary'
                        : isDone
                        ? 'clay-button-soft text-[#2F5B37]'
                        : 'clay-button-soft text-[#6F4FA8]'
                    }`}
                  >
                    <span>
                      {isDone
                        ? 'Review Course'
                        : isActive
                        ? 'Continue Learning'
                        : 'View Course'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // =========================================================================
  // BRANCH 2: AUTHENTICATED STUDENT COURSE PLATFORM VIEW
  // =========================================================================

  // Loading saved roadmaps from Supabase
  if (roadmapsLoading && !activeRoadmap) {
    return (
      <div className="space-y-6 pb-8 animate-in fade-in duration-150">
        <div className="pastel-card p-10 flex flex-col items-center justify-center text-center gap-4">
          <ClayIconBadge variant="lavender" size="lg">
            <Loader2 className="w-6 h-6 animate-spin" />
          </ClayIconBadge>
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#343047]">
              Loading Your Learning Courses
            </h2>
            <p className="text-xs text-[#7B7188] mt-1">
              Retrieving your personalized roadmap and lesson progress from Supabase...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeStats = computeRoadmapStats(activeRoadmap);
  const stages = activeRoadmap?.roadmapData.stages ?? [];

  // If a course card is selected, show the clean Course Detail Page
  if (activeRoadmap && selectedCourseId) {
    const courseIndex = stages.findIndex((s) => s.id === selectedCourseId);
    const selectedCourse = courseIndex >= 0 ? stages[courseIndex] : null;

    if (selectedCourse) {
      return (
        <CourseDetailView
          authUserId={authUserId}
          roadmapId={activeRoadmap.id}
          stage={selectedCourse}
          courseIndex={courseIndex}
          totalCourses={stages.length}
          roadmapTitle={activeRoadmap.title}
          savingLessonId={savingLessonId}
          roadmapSaveError={roadmapSaveError}
          onBackToCourses={() => onSelectCourse(null)}
          onToggleLessonComplete={onToggleRoadmapLesson}
          onStartLearningLesson={(stageId, lessonId) =>
            onStartLearningLesson(stageId, lessonId)
          }
        />
      );
    }
  }

  // Determine the next target lesson for the banner's "Continue Learning" CTA
  const currentCourseStage =
    (activeStats.nextIncompleteStageId
      ? stages.find((s) => s.id === activeStats.nextIncompleteStageId)
      : null) ??
    (activeStats.currentStageId
      ? stages.find((s) => s.id === activeStats.currentStageId)
      : null) ??
    stages.find((s) => s.status === 'in_progress') ??
    stages.find((s) => s.status === 'upcoming') ??
    stages[0] ??
    null;

  const continueTargetLesson = currentCourseStage
    ? (activeStats.nextIncompleteLessonId
        ? currentCourseStage.lessons.find(
            (l) => l.id === activeStats.nextIncompleteLessonId
          )
        : null) ??
      currentCourseStage.lessons.find((l) => !l.completed) ??
      currentCourseStage.lessons[0] ??
      null
    : null;

  const filteredCourses = stages.filter((stage) => {
    if (filter === 'all') return true;
    return stage.status === filter;
  });

  const allCoursesCompleted =
    activeStats.totalLessons > 0 &&
    activeStats.completedLessons === activeStats.totalLessons;

  const handleContinueLearning = () => {
    if (!currentCourseStage) return;
    if (allCoursesCompleted) {
      onSelectCourse(currentCourseStage.id);
      return;
    }
    if (continueTargetLesson) {
      onStartLearningLesson(currentCourseStage.id, continueTargetLesson.id);
    } else {
      onSelectCourse(currentCourseStage.id);
    }
  };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-150">
      {/* Database Load Error Banner */}
      {roadmapsError && (
        <div className="rounded-[20px] border border-[#F2C2BA] bg-[#FCEAE5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#B45343] shrink-0 mt-0.5" />
            <div className="text-xs text-[#753227]">
              <p className="font-bold">Could not load saved roadmaps</p>
              <p className="mt-0.5">{roadmapsError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetryLoadRoadmaps}
            className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#753227] shrink-0"
          >
            Retry Load
          </button>
        </div>
      )}

      {/* Gemini Generation Error Banner (preserves any existing roadmap below) */}
      {roadmapGenerationError && (
        <div className="rounded-[20px] border border-[#F2C2BA] bg-[#FCEAE5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#B45343] shrink-0 mt-0.5" />
            <div className="text-xs text-[#753227]">
              <p className="font-bold">Roadmap Generation Notice</p>
              <p className="mt-0.5">{roadmapGenerationError}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClearGenerationError();
                void onGenerateRoadmap(Boolean(activeRoadmap));
              }}
              disabled={isGeneratingRoadmap}
              className="clay-button-primary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={onClearGenerationError}
              className="p-2 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] text-[#753227]"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Lesson Progress Save Error Banner */}
      {roadmapSaveError && (
        <div className="rounded-[20px] border border-[#F2C2BA] bg-[#FCEAE5] p-3.5 flex items-center gap-3 text-xs text-[#753227]">
          <AlertCircle className="w-4 h-4 text-[#B45343] shrink-0" />
          <span>{roadmapSaveError}</span>
        </div>
      )}

      {/* Generation In-Progress Banner */}
      {isGeneratingRoadmap && (
        <div
          className="rounded-[24px] border border-[#D8C9F2] p-6 flex flex-col sm:flex-row items-center gap-5"
          style={{
            background: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 55%, #FCEAE5 100%)',
          }}
        >
          <ClayIconBadge variant="lavender" size="lg">
            <Loader2 className="w-6 h-6 animate-spin" />
          </ClayIconBadge>
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-display text-base sm:text-lg font-extrabold text-[#343047]">
              Building Your Personalized Courses...
            </h3>
            <p className="text-xs text-[#6B6178] leading-relaxed max-w-2xl">
              Skillora AI is structuring your learning courses around your direction (
              {user.primaryDirection || user.careerGoal || 'your profile'}),{' '}
              {user.preferredHoursPerDay}h/day pace, and{' '}
              {attempts.length > 0
                ? `${attempts.length} skill assessment${attempts.length === 1 ? '' : 's'}`
                : 'learning interests'}
              .
            </p>
          </div>
        </div>
      )}

      {/* EMPTY STATE: No active roadmap saved yet */}
      {!activeRoadmap && !isGeneratingRoadmap && (() => {
        const focusDir = (user.primaryDirection || user.careerGoal || '').trim();
        const matchingArchived = focusDir
          ? findBestMatchingRoadmapForDirection(archivedRoadmaps, focusDir)
          : null;
        return (
        <div
          className="rounded-[28px] border border-[#E2D6F5] p-7 sm:p-10 text-center flex flex-col items-center gap-6"
          style={{
            background: 'linear-gradient(135deg, #FCEAE5 0%, #FAF6F2 48%, #F0E9FA 100%)',
            boxShadow: '0 14px 32px -12px rgba(154, 126, 200, 0.25)',
          }}
        >
          <div className="flex items-center justify-center gap-4">
            <BooksTrophy3D className="w-28 h-24" />
            <SmilingCloudMascot3D className="w-24 h-20 hidden sm:block" />
          </div>

          <div className="space-y-2 max-w-xl">
            <p className="text-xs font-bold text-[#6F4FA8]">
              AI Personalized Learning Path
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              {focusDir
                ? `Build your personalized ${focusDir} roadmap`
                : 'Your personalized learning journey starts here!'}
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6178] leading-relaxed">
              Generate an AI-tailored curriculum of structured courses built around your primary learning direction, study pace, current skills, and skill assessment results.
            </p>
          </div>

          <p className="text-xs font-semibold text-[#5E5468]">
            Focus: {focusDir || 'Set in Profile'} · Pace:{' '}
            {user.preferredHoursPerDay || 2}h / day · Assessments:{' '}
            {attempts.length > 0 ? `${attempts.length} completed` : 'None yet (Provisional)'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {matchingArchived && onSwitchToPreservedRoadmap && (
              <button
                type="button"
                disabled={restoringRoadmapId === matchingArchived.id}
                onClick={async () => {
                  setRestoringRoadmapId(matchingArchived.id);
                  try {
                    await onSwitchToPreservedRoadmap(matchingArchived.id);
                  } finally {
                    setRestoringRoadmapId(null);
                  }
                }}
                className="clay-button-primary px-6 py-3 text-sm font-extrabold flex items-center gap-2 disabled:opacity-60"
              >
                {restoringRoadmapId === matchingArchived.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>Restore Saved {focusDir} Path</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void onGenerateRoadmap(false)}
              disabled={isGeneratingRoadmap}
              className={`${
                matchingArchived ? 'clay-button-soft text-[#6F4FA8]' : 'clay-button-primary'
              } px-6 py-3 text-sm font-extrabold flex items-center gap-2 disabled:opacity-60`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate My Learning Path</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('assessment')}
              className="clay-button-soft px-5 py-3 text-xs font-bold text-[#6F4FA8]"
            >
              {attempts.length > 0 ? 'Take Another Assessment' : 'Take Skill Assessment First'}
            </button>
          </div>
        </div>
        );
      })()}

      {/* ACTIVE PERSONALIZED COURSE PLATFORM */}
      {activeRoadmap && (() => {
        const activePrimary = (user.primaryDirection ?? '').trim();
        const directionDiffersFromRoadmap =
          Boolean(activePrimary) && !doesRoadmapMatchDirection(activeRoadmap, activePrimary);

        return (
        <>
          {directionDiffersFromRoadmap && (
            <div className="rounded-[20px] border border-[#DED0F5] bg-[#F6F1FC] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#4E455C]">
              <div className="space-y-0.5">
                <p className="font-extrabold text-[#343047]">
                  Primary Learning Direction updated to {activePrimary}
                </p>
                <p className="leading-relaxed">
                  All of your completed lessons and saved courses in this roadmap remain preserved. Continue studying here anytime, or archive this plan and generate a new path for {activePrimary}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegenerateModal(true)}
                disabled={isGeneratingRoadmap}
                className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0 self-start sm:self-auto"
              >
                New Path for Focus
              </button>
            </div>
          )}

          {/* Part 1 Step 8: Review & Confirm Personalized Roadmap */}
          {activeRoadmap.roadmapData.confirmed === false && (
            <div className="rounded-[24px] border-2 border-[#B89CE0] bg-[#FAF7FE] p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EFE7FA] text-[#5D3F92] text-[11px] font-extrabold">
                    <Sparkles className="w-3.5 h-3.5" />
                    Step 8 · Review &amp; Confirm Your Roadmap
                  </span>
                  <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#343047]">
                    Confirm this {stages.length}-stage roadmap for{' '}
                    {activeRoadmap.careerGoal || user.primaryDirection || 'your direction'}
                  </h2>
                  <p className="text-xs text-[#5E5468] max-w-2xl leading-relaxed">
                    Review the sequenced stages, milestones, and completion criteria below. Once confirmed, start Stage 1 or adjust your preferences anytime.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowRegenerateModal(true)}
                    disabled={isGeneratingRoadmap || isConfirmingRoadmap}
                    className="clay-button-soft px-4 py-2.5 text-xs font-bold text-[#5E5468] disabled:opacity-60"
                  >
                    Regenerate / Adjust
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (onConfirmRoadmapPlan) {
                        await onConfirmRoadmapPlan();
                      }
                      handleContinueLearning();
                    }}
                    disabled={isConfirmingRoadmap}
                    className="clay-button-primary px-5 py-2.5 text-xs font-extrabold inline-flex items-center gap-2 disabled:opacity-70"
                  >
                    {isConfirmingRoadmap ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm &amp; Start Learning</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {((activeRoadmap.roadmapData.milestones?.length ?? 0) > 0 ||
                (activeRoadmap.roadmapData.completionCriteria?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#E6DAF6]">
                  {(activeRoadmap.roadmapData.milestones?.length ?? 0) > 0 && (
                    <div className="p-3.5 rounded-[16px] bg-[#FFFCFA] border border-[#EAE0F4] space-y-1.5">
                      <p className="text-[11px] font-extrabold text-[#6F4FA8] uppercase tracking-wide">
                        Key Milestones
                      </p>
                      <ul className="space-y-1">
                        {activeRoadmap.roadmapData.milestones!.slice(0, 4).map((m, i) => (
                          <li key={i} className="text-xs text-[#4E455C] flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BCE] mt-1.5 shrink-0" />
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(activeRoadmap.roadmapData.completionCriteria?.length ?? 0) > 0 && (
                    <div className="p-3.5 rounded-[16px] bg-[#FFFCFA] border border-[#DCEAD8] space-y-1.5">
                      <p className="text-[11px] font-extrabold text-[#356640] uppercase tracking-wide">
                        Completion Criteria
                      </p>
                      <ul className="space-y-1">
                        {activeRoadmap.roadmapData.completionCriteria!.slice(0, 4).map((c, i) => (
                          <li key={i} className="text-xs text-[#4E455C] flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-[#539864] mt-0.5 shrink-0" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Compact Personalized Learning Journey Banner */}
          <div
            className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-7 space-y-4"
            style={{
              background: 'linear-gradient(135deg, #FCEAE5 0%, #FAF6F2 50%, #F0E9FA 100%)',
              boxShadow: '0 12px 30px -12px rgba(154, 126, 200, 0.24)',
            }}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-5 min-w-0">
                <BooksTrophy3D className="w-20 h-18 hidden sm:block shrink-0" />

                <div className="space-y-1.5 min-w-0">
                  {/* Quiet Inline Career Goal + Assessment Validation */}
                  <div className="flex items-center gap-2.5 text-xs font-semibold flex-wrap">
                    <span className="inline-flex items-center gap-1 font-bold text-[#6F4FA8]">
                      <Target className="w-3.5 h-3.5" />
                      <span>{activeRoadmap.careerGoal || user.careerGoal || 'Personalized Goal'}</span>
                    </span>
                    <span aria-hidden="true" className="text-[#C7B9D9]">·</span>
                    {activeRoadmap.roadmapData.assessmentValidated ? (
                      <span className="inline-flex items-center gap-1 font-bold text-[#356640]">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Assessment-Validated</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-[#8E6521]">
                        <Info className="w-3.5 h-3.5" />
                        <span>Provisional Plan</span>
                      </span>
                    )}
                    <span aria-hidden="true" className="text-[#C7B9D9]">·</span>
                    <span className="text-[#7B7188]">
                      Est. {activeRoadmap.roadmapData.estimatedTotalDuration} · {user.preferredHoursPerDay || 2}h/day (~{Math.round((user.preferredHoursPerDay || 2) * 7 * 10) / 10}h/wk)
                    </span>
                  </div>

                  {/* Roadmap Title */}
                  <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
                    {activeRoadmap.title}
                  </h1>

                  {/* Current Learning Stage & Recommended Next Lesson */}
                  {activeStats.currentStageTitle && (
                    <div className="space-y-0.5 text-xs sm:text-sm text-[#5E5468]">
                      <p>
                        Current Stage ({activeStats.currentStageNumber} of {activeStats.totalStages}):{' '}
                        <span className="font-bold text-[#343047]">
                          {activeStats.currentStageTitle}
                        </span>
                      </p>
                      {!allCoursesCompleted && continueTargetLesson && (
                        <p className="text-xs text-[#6F4FA8] font-bold">
                          Recommended Next Lesson: {continueTargetLesson.title}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Overall Progress + Primary Continue CTA */}
              <div className="flex flex-wrap items-center gap-4 shrink-0">
                <div className="px-4 py-3 rounded-[20px] bg-[#FFFCFA] border border-[#EEE6E5] shadow-2xs flex items-center gap-3.5">
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#F1EAE8]"
                        strokeWidth="3.8"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[#A78BCE]"
                        strokeDasharray={`${activeStats.progressPercent}, 100`}
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span className="absolute font-display text-xs font-extrabold text-[#343047] tabular-nums">
                      {activeStats.progressPercent}%
                    </span>
                  </div>

                  <div className="text-xs">
                    <p className="font-display font-extrabold text-[#343047]">
                      Overall Progress
                    </p>
                    <p className="text-[#8B8295] font-mono tabular-nums">
                      {activeStats.completedLessons} / {activeStats.totalLessons} lessons
                    </p>
                  </div>
                </div>

                {currentCourseStage && (
                  <button
                    type="button"
                    onClick={handleContinueLearning}
                    className="clay-button-primary px-5 py-3 text-xs font-extrabold inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {allCoursesCompleted
                        ? 'Review Course'
                        : activeStats.completedLessons > 0
                        ? 'Continue Learning'
                        : 'Start Learning'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Subtle Personalization & Milestones Toggle Bar */}
            {(activeRoadmap.roadmapData.personalizationExplanation ||
              (activeRoadmap.roadmapData.milestones?.length ?? 0) > 0 ||
              (activeRoadmap.roadmapData.completionCriteria?.length ?? 0) > 0) && (
              <div className="pt-3 border-t border-[#EAE0E9]/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                  {activeRoadmap.roadmapData.personalizationExplanation && (
                    <button
                      type="button"
                      aria-expanded={showPersonalizationNote}
                      onClick={() => setShowPersonalizationNote((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6F4FA8] hover:underline"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {showPersonalizationNote
                          ? 'Hide personalization notes'
                          : 'Why this learning path fits you'}
                      </span>
                      {showPersonalizationNote ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {activeRoadmap.roadmapData.confirmed !== false &&
                    ((activeRoadmap.roadmapData.milestones?.length ?? 0) > 0 ||
                      (activeRoadmap.roadmapData.completionCriteria?.length ?? 0) > 0) && (
                      <button
                        type="button"
                        aria-expanded={showMilestonesPanel}
                        onClick={() => setShowMilestonesPanel((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#356640] hover:underline"
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>
                          {showMilestonesPanel
                            ? 'Hide milestones & criteria'
                            : 'Milestones & completion criteria'}
                        </span>
                        {showMilestonesPanel ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {!activeRoadmap.roadmapData.assessmentValidated && (
                    <button
                      type="button"
                      onClick={() => onNavigate('assessment')}
                      className="text-xs font-bold text-[#6F4FA8] hover:underline"
                    >
                      Validate with Skill Assessment
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRegenerateModal(true)}
                    disabled={isGeneratingRoadmap}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7B7188] hover:text-[#343047] disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isGeneratingRoadmap ? 'animate-spin' : ''}`}
                    />
                    <span>Regenerate Path</span>
                  </button>
                </div>
              </div>
            )}

            {showPersonalizationNote && activeRoadmap.roadmapData.personalizationExplanation && (
              <div className="p-4 rounded-[18px] bg-[#FFFCFA]/85 border border-[#E6DCF5] text-xs text-[#4E455C] leading-relaxed">
                {activeRoadmap.roadmapData.personalizationExplanation}
              </div>
            )}

            {showMilestonesPanel &&
              activeRoadmap.roadmapData.confirmed !== false &&
              ((activeRoadmap.roadmapData.milestones?.length ?? 0) > 0 ||
                (activeRoadmap.roadmapData.completionCriteria?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(activeRoadmap.roadmapData.milestones?.length ?? 0) > 0 && (
                    <div className="p-3.5 rounded-[16px] bg-[#FFFCFA]/90 border border-[#EAE0F4] space-y-1.5">
                      <p className="text-[11px] font-extrabold text-[#6F4FA8] uppercase tracking-wide">
                        Key Milestones
                      </p>
                      <ul className="space-y-1">
                        {activeRoadmap.roadmapData.milestones!.slice(0, 5).map((m, i) => (
                          <li key={i} className="text-xs text-[#4E455C] flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BCE] mt-1.5 shrink-0" />
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(activeRoadmap.roadmapData.completionCriteria?.length ?? 0) > 0 && (
                    <div className="p-3.5 rounded-[16px] bg-[#FFFCFA]/90 border border-[#DCEAD8] space-y-1.5">
                      <p className="text-[11px] font-extrabold text-[#356640] uppercase tracking-wide">
                        Completion Criteria
                      </p>
                      <ul className="space-y-1">
                        {activeRoadmap.roadmapData.completionCriteria!.slice(0, 5).map((c, i) => (
                          <li key={i} className="text-xs text-[#4E455C] flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-[#539864] mt-0.5 shrink-0" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* "My Learning Courses" Section Header & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#343047] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#8E6EC8]" />
                <span>My Learning Courses</span>
              </h2>
              <p className="text-xs text-[#8B8295]">
                {stages.length} personalized courses generated from your roadmap · Click a course to view its lessons
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-[#FFFCFA] border border-[#EEE6E5] rounded-2xl shadow-2xs overflow-x-auto">
                {(
                  [
                    { id: 'all', label: `All Courses (${stages.length})` },
                    { id: 'in_progress', label: 'In Progress' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'upcoming', label: 'Upcoming' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                      filter === tab.id
                        ? 'bg-[#A78BCE] text-white shadow-xs'
                        : 'text-[#6B6178] hover:text-[#343047]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Responsive Grid of Course Cards */}
          {filteredCourses.length === 0 ? (
            <div className="pastel-card p-8 text-center space-y-2">
              <p className="font-display text-sm font-extrabold text-[#343047]">
                No courses match this status yet
              </p>
              <p className="text-xs text-[#8B8295]">
                Switch back to “All Courses” or complete lessons inside a course to update its status.
              </p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8] mt-2"
              >
                Show All Courses
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCourses.map((stage) => {
                const originalIndex = stages.findIndex((s) => s.id === stage.id);
                const courseNum = (originalIndex >= 0 ? originalIndex : 0) + 1;
                const totalLessons = stage.lessons.length;
                const completedLessons = stage.lessons.filter((l) => l.completed).length;
                const progressPercent =
                  totalLessons > 0
                    ? Math.round((completedLessons / totalLessons) * 100)
                    : 0;

                const isCompleted =
                  totalLessons > 0 && completedLessons === totalLessons;
                const isInProgress =
                  totalLessons > 0 &&
                  completedLessons > 0 &&
                  completedLessons < totalLessons;
                const nextIncompleteLesson =
                  stage.lessons.find((l) => !l.completed) ?? stage.lessons[0] ?? null;

                return (
                  <div
                    key={stage.id}
                    onClick={() => onSelectCourse(stage.id)}
                    className={`pastel-card pastel-card-hover overflow-hidden flex flex-col justify-between cursor-pointer group ${
                      isInProgress
                        ? 'border-[#C9B7E8]'
                        : isCompleted
                        ? 'border-[#C6E0C1]'
                        : ''
                    }`}
                  >
                    <div>
                      {/* Course Thumbnail Illustration */}
                      <CourseCoverIllustration
                        title={stage.title}
                        stageIndex={courseNum - 1}
                        className="w-full h-36 border-b border-[#F1EAE8]"
                      />

                      <div className="p-5 space-y-2.5">
                        {/* Course Metadata Row (Unboxed inline typography) */}
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#7B7188]">
                          <span>
                            Course {courseNum} · {stage.difficulty}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              isCompleted
                                ? 'text-[#356640]'
                                : isInProgress
                                ? 'text-[#6F4FA8]'
                                : 'text-[#8B8295]'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : isInProgress ? (
                              <Play className="w-3 h-3 fill-current" />
                            ) : (
                              <Circle className="w-3 h-3" />
                            )}
                            <span>
                              {isCompleted
                                ? 'Completed'
                                : isInProgress
                                ? 'In Progress'
                                : 'Not Started'}
                            </span>
                          </span>
                        </div>

                        {/* Course Title */}
                        <h3 className="font-display text-base sm:text-lg font-extrabold text-[#343047] group-hover:text-[#6F4FA8] transition-colors leading-snug">
                          {stage.title}
                        </h3>

                        {/* Brief Description */}
                        <p className="text-xs text-[#6B6178] leading-relaxed line-clamp-2">
                          {stage.description}
                        </p>
                      </div>
                    </div>

                    {/* Course Card Footer: Meta + Progress + Action Button */}
                    <div className="px-5 pb-5 pt-3 border-t border-[#F4EEEC] space-y-3.5">
                      <div className="flex items-center justify-between text-xs text-[#7B7188]">
                        <span className="inline-flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-[#8E6EC8]" />
                          <span className="tabular-nums">{totalLessons} lessons</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#D17865]" />
                          <span>{stage.estimatedDuration}</span>
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-[#7B7188]">
                            {completedLessons} of {totalLessons} completed
                          </span>
                          <span className="font-mono text-[#343047] tabular-nums">
                            {progressPercent}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#F1EAE8] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isCompleted ? 'bg-[#7DBE8B]' : 'bg-[#A78BCE]'
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isInProgress && nextIncompleteLesson) {
                            onStartLearningLesson(stage.id, nextIncompleteLesson.id);
                          } else {
                            onSelectCourse(stage.id);
                          }
                        }}
                        className={`w-full py-2.5 px-4 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                          isInProgress
                            ? 'clay-button-primary'
                            : isCompleted
                            ? 'clay-button-soft text-[#2F5B37]'
                            : 'clay-button-soft text-[#6F4FA8]'
                        }`}
                      >
                        <span>
                          {isCompleted
                            ? 'Review Course'
                            : isInProgress
                            ? 'Continue Learning'
                            : 'View Course'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
        );
      })()}

      {/* ARCHIVED ROADMAPS HISTORY (Preserved safely) */}
      {archivedRoadmaps.length > 0 && (
        <div className="pastel-card p-5 space-y-3">
          <button
            type="button"
            onClick={() => setShowArchivedSection((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3">
              <ClayIconBadge variant="yellow" size="sm">
                <Archive className="w-4 h-4" />
              </ClayIconBadge>
              <div>
                <h3 className="font-display text-sm font-extrabold text-[#343047]">
                  Previous Archived Roadmaps ({archivedRoadmaps.length})
                </h3>
                <p className="text-[11px] text-[#8B8295]">
                  Your earlier roadmaps and completed lesson progress are preserved here.
                </p>
              </div>
            </div>
            <div className="p-1.5 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]">
              {showArchivedSection ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {showArchivedSection && (
            <div className="space-y-3 pt-2 border-t border-[#EEE6E5]">
              {archivedRoadmaps.map((archived) => {
                const stats = computeRoadmapStats(archived);
                const isOpen = expandedArchivedId === archived.id;
                return (
                  <div
                    key={archived.id}
                    className="rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] p-4 space-y-2"
                  >
                    <div
                      onClick={() => setExpandedArchivedId(isOpen ? null : archived.id)}
                      className="flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#343047] truncate">
                          {archived.title}
                        </p>
                        <p className="text-[11px] text-[#8B8295]">
                          {archived.careerGoal || 'Goal'} · Archived · Created{' '}
                          {formatRoadmapDateSafe(archived.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-bold text-[#6B6178] tabular-nums">
                          {stats.completedLessons}/{stats.totalLessons} lessons (
                          {stats.progressPercent}%)
                        </span>
                        {onSwitchToPreservedRoadmap && (
                          <button
                            type="button"
                            disabled={restoringRoadmapId === archived.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setRestoringRoadmapId(archived.id);
                              try {
                                await onSwitchToPreservedRoadmap(archived.id);
                              } finally {
                                setRestoringRoadmapId(null);
                              }
                            }}
                            className="px-3 py-1 rounded-[10px] bg-[#FFFCFA] border border-[#D8C9F2] text-[11px] font-bold text-[#6F4FA8] hover:bg-[#A78BCE] hover:text-white transition-colors inline-flex items-center gap-1 disabled:opacity-60"
                          >
                            {restoringRoadmapId === archived.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            <span>Restore Path</span>
                          </button>
                        )}
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-[#8B8295]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#8B8295]" />
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="pt-2.5 border-t border-[#EEE6E5] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {archived.roadmapData.stages.map((st, idx) => {
                          const doneCount = st.lessons.filter((l) => l.completed).length;
                          return (
                            <div
                              key={st.id}
                              className="p-3 rounded-[14px] bg-[#FFFCFA] border border-[#EEE6E5] text-[11px] space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[#343047] truncate">
                                  {idx + 1}. {st.title}
                                </span>
                                <span className="text-[#8B8295] font-mono shrink-0">
                                  {doneCount}/{st.lessons.length}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {st.lessons.map((l) => (
                                  <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => {
                                      if (onOpenArchivedLesson) {
                                        onOpenArchivedLesson(archived.id, st.id, l.id);
                                      }
                                    }}
                                    disabled={!onOpenArchivedLesson}
                                    className={`w-full px-2.5 py-1.5 rounded-[10px] border text-left flex items-center justify-between gap-2 transition-colors ${
                                      l.completed
                                        ? 'bg-[#DCECD9]/55 border-[#C2DFBC] text-[#2F5B37] hover:bg-[#DCECD9]'
                                        : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#5E5468] hover:border-[#C9B7E8]'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      {l.completed ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[#356640] shrink-0" />
                                      ) : (
                                        <Circle className="w-3.5 h-3.5 text-[#B4A9C2] shrink-0" />
                                      )}
                                      <span className="truncate font-medium">{l.title}</span>
                                    </span>
                                    <span className="text-[10px] font-bold shrink-0 text-[#6F4FA8]">
                                      {l.completed ? 'Review' : 'Open'}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* REGENERATE ROADMAP CONFIRMATION MODAL */}
      {showRegenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#343047]/35 backdrop-blur-xs">
          <div className="pastel-card max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ClayIconBadge variant="lavender" size="md">
                  <RefreshCw className="w-5 h-5" />
                </ClayIconBadge>
                <div>
                  <h3 className="font-display text-lg font-extrabold text-[#343047]">
                    Regenerate Learning Roadmap?
                  </h3>
                  <p className="text-xs text-[#8B8295]">
                    Your current progress will be safely archived
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegenerateModal(false)}
                className="p-1.5 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-[18px] bg-[#FFF1D6]/60 border border-[#F3DFB4] text-xs text-[#6B5322] leading-relaxed space-y-1.5">
              <p className="font-bold">Before you continue:</p>
              <p>
                Regenerating will build a fresh personalized set of courses using your latest student profile and skill assessment results.
              </p>
              <p>
                Your existing active roadmap and completed lesson progress will be archived (not deleted) so you can always review them later.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowRegenerateModal(false)}
                className="clay-button-soft px-4 py-2.5 text-xs font-bold text-[#6B6178]"
              >
                Keep Current Courses
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRegenerate()}
                className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Archive & Regenerate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
