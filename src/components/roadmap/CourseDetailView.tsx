import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  Play,
  PlayCircle,
  RefreshCw,
  Rocket,
  Target,
  Wrench,
  X,
  Youtube,
} from 'lucide-react';
import { GeneratedRoadmapStage, TrustedResourcesBundle } from '../../types';
import {
  fetchCourseTrustedResources,
  getCachedCourseTrustedResources,
} from '../../lib/lessonContent';
import { CourseCoverIllustration } from './CourseIllustrations';
import { formatLessonCompletedTimestamp } from './roadmapUiHelpers';

interface CourseDetailViewProps {
  authUserId?: string | null;
  roadmapId?: string;
  stage: GeneratedRoadmapStage;
  courseIndex: number;
  totalCourses: number;
  roadmapTitle: string;
  savingLessonId: string | null;
  roadmapSaveError?: string;
  onBackToCourses: () => void;
  onToggleLessonComplete: (stageId: string, lessonId: string) => Promise<void> | void;
  onStartLearningLesson: (stageId: string, lessonId: string) => void;
  isDemoMode?: boolean;
}

export const CourseDetailView: React.FC<CourseDetailViewProps> = ({
  authUserId = null,
  roadmapId,
  stage,
  courseIndex,
  totalCourses,
  roadmapTitle,
  savingLessonId,
  roadmapSaveError,
  onBackToCourses,
  onToggleLessonComplete,
  onStartLearningLesson,
  isDemoMode = false,
}) => {
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [courseResources, setCourseResources] = useState<TrustedResourcesBundle | null>(() =>
    authUserId && roadmapId && !isDemoMode
      ? getCachedCourseTrustedResources(authUserId, roadmapId, stage.id)
      : null
  );
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState('');
  const [activeResourceTab, setActiveResourceTab] = useState<'videos' | 'tutorials' | 'practice'>('videos');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const loadCourseResources = (signal?: AbortSignal) => {
    if (!roadmapId || isDemoMode) {
      setCourseResources(null);
      setResourcesLoading(false);
      setResourcesError('');
      return;
    }

    const syncHit = authUserId
      ? getCachedCourseTrustedResources(authUserId, roadmapId, stage.id)
      : null;
    if (syncHit) {
      setCourseResources(syncHit);
      if (syncHit.videos.length > 0) setActiveResourceTab('videos');
      else if (syncHit.tutorials.length > 0) setActiveResourceTab('tutorials');
      else if (syncHit.practice.length > 0) setActiveResourceTab('practice');
      else setActiveResourceTab('videos');
      setResourcesLoading(false);
      setResourcesError('');
      return;
    }

    setResourcesLoading(true);
    setResourcesError('');
    fetchCourseTrustedResources({
      roadmapId,
      stageId: stage.id,
      signal,
    })
      .then((bundle) => {
        if (signal?.aborted) return;
        setCourseResources(bundle);
        if (bundle.videos.length > 0) setActiveResourceTab('videos');
        else if (bundle.tutorials.length > 0) setActiveResourceTab('tutorials');
        else if (bundle.practice.length > 0) setActiveResourceTab('practice');
        else setActiveResourceTab('videos');
      })
      .catch((err) => {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        setResourcesError(
          err instanceof Error && err.message
            ? err.message
            : 'Unable to load course resources right now.'
        );
      })
      .finally(() => {
        if (!signal?.aborted) {
          setResourcesLoading(false);
        }
      });
  };

  useEffect(() => {
    setPlayingVideoId(null);
    const controller = new AbortController();
    loadCourseResources(controller.signal);
    return () => {
      controller.abort();
    };
  }, [roadmapId, stage.id, isDemoMode]);

  const totalLessons = stage.lessons.length;
  const completedLessons = stage.lessons.filter((l) => l.completed).length;
  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const isCompleted = stage.status === 'completed';
  const isInProgress = stage.status === 'in_progress';
  const statusLabel = isCompleted
    ? 'Completed'
    : isInProgress
    ? 'In Progress'
    : 'Not Started';

  const nextLesson =
    stage.lessons.find((l) => !l.completed) ?? stage.lessons[0] ?? null;

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-150">
      {/* Breadcrumb & Back Navigation */}
      <nav
        aria-label="Course breadcrumb"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-xs text-[#7B7188] flex-wrap">
          <button
            type="button"
            onClick={onBackToCourses}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] font-bold text-[#343047] hover:border-[#C9B7E8] transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#8E6EC8]" />
            <span>Back to My Learning Path</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-[#B4A9C2] hidden sm:inline" />
          <span className="hidden sm:inline font-medium truncate max-w-[200px]">
            {roadmapTitle}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-[#B4A9C2] hidden sm:inline" />
          <span className="font-bold text-[#343047] truncate max-w-[260px]">
            Course {courseIndex + 1} of {totalCourses}
          </span>
        </div>

        <span className="text-xs font-semibold text-[#7B7188]">
          {stage.difficulty} · {stage.estimatedDuration} · {statusLabel}
        </span>
      </nav>

      {roadmapSaveError && (
        <div className="rounded-[18px] border border-[#F2C2BA] bg-[#FCEAE5] p-3.5 text-xs text-[#753227] font-medium">
          {roadmapSaveError}
        </div>
      )}

      {/* Course Overview Card */}
      <div className="pastel-card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-4 min-h-[180px]">
            <CourseCoverIllustration
              title={stage.title}
              stageIndex={courseIndex}
              className="w-full h-full min-h-[180px]"
            />
          </div>

          <div className="lg:col-span-8 p-6 sm:p-7 flex flex-col justify-between gap-5">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#7B7188] flex-wrap">
                <span className="text-[#7B59B6] font-extrabold">
                  Course {courseIndex + 1}
                </span>
                <span aria-hidden="true">·</span>
                <span>{stage.difficulty}</span>
                <span aria-hidden="true">·</span>
                <span>{totalLessons} Lessons</span>
                <span aria-hidden="true">·</span>
                <span>{stage.estimatedDuration}</span>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
                {stage.title}
              </h1>

              <p className="text-xs sm:text-sm text-[#5E5468] leading-relaxed max-w-2xl">
                {stage.description}
              </p>

              {(stage.milestone || stage.completionCriteria) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {stage.milestone && (
                    <div className="px-3 py-2 rounded-[14px] bg-[#FAF6F2] border border-[#EAE0F4] text-[11px] text-[#4E455C]">
                      <span className="font-extrabold text-[#6F4FA8]">Stage Milestone: </span>
                      {stage.milestone}
                    </div>
                  )}
                  {stage.completionCriteria && (
                    <div className="px-3 py-2 rounded-[14px] bg-[#F4FAF5] border border-[#D4E7D1] text-[11px] text-[#3B593F]">
                      <span className="font-extrabold text-[#2F683A]">Completion Criteria: </span>
                      {stage.completionCriteria}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Course Progress + Primary CTA */}
            <div className="pt-4 border-t border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 max-w-md space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#343047]">Course Progress</span>
                  <span className="font-mono font-bold text-[#6F4FA8] tabular-nums">
                    {completedLessons} / {totalLessons} lessons ({progressPercent}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#F1EAE8] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isCompleted ? 'bg-[#7DBE8B]' : 'bg-[#A78BCE]'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {nextLesson && !isDemoMode && (
                <button
                  type="button"
                  onClick={() => onStartLearningLesson(stage.id, nextLesson.id)}
                  className="clay-button-primary px-5 py-2.5 text-xs font-extrabold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {totalLessons > 0 && completedLessons === totalLessons
                      ? 'Review Course'
                      : completedLessons > 0
                      ? 'Continue Learning'
                      : 'Start Learning'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Course Syllabus Metadata (Learning Objectives & Prerequisites) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Learning Objectives Collapsible */}
        <div className="pastel-card overflow-hidden">
          <button
            type="button"
            aria-expanded={objectivesOpen}
            onClick={() => setObjectivesOpen((prev) => !prev)}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-[#FAF6F2]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Target className="w-4 h-4 text-[#8E6EC8] shrink-0" />
              <div>
                <h2 className="font-display text-sm font-extrabold text-[#343047]">
                  Learning Objectives ({stage.learningObjectives.length})
                </h2>
                <p className="text-[11px] text-[#8B8295]">
                  What you will master in this course
                </p>
              </div>
            </div>
            <span className="p-1.5 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]">
              {objectivesOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {objectivesOpen && (
            <div className="px-5 pb-5 pt-2 border-t border-[#EEE6E5]">
              {stage.learningObjectives.length > 0 ? (
                <ul className="space-y-2">
                  {stage.learningObjectives.map((obj, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-[#4E455C] flex items-start gap-2.5 leading-relaxed"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-bold text-[11px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="pt-0.5">{obj}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#8B8295]">
                  Objectives are embedded inside each lesson below.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Prerequisites Collapsible */}
        <div className="pastel-card overflow-hidden">
          <button
            type="button"
            aria-expanded={prerequisitesOpen}
            onClick={() => setPrerequisitesOpen((prev) => !prev)}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-[#FAF6F2]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-[#539864] shrink-0" />
              <div>
                <h2 className="font-display text-sm font-extrabold text-[#343047]">
                  Prerequisites ({stage.prerequisites.length})
                </h2>
                <p className="text-[11px] text-[#8B8295]">
                  {stage.prerequisites.length > 0
                    ? 'Recommended background before starting'
                    : 'No prior prerequisites required'}
                </p>
              </div>
            </div>
            <span className="p-1.5 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]">
              {prerequisitesOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {prerequisitesOpen && (
            <div className="px-5 pb-5 pt-2 border-t border-[#EEE6E5]">
              {stage.prerequisites.length > 0 ? (
                <ul className="space-y-1.5">
                  {stage.prerequisites.map((prereq, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-[#4E455C] flex items-start gap-2 leading-relaxed"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8CC697] mt-1.5 shrink-0" />
                      <span>{prereq}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#6B6178]">
                  No prior prerequisites required — you can jump straight into Lesson 1.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ordered Lesson List */}
      <div className="pastel-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#343047]">
              Course Curriculum ({totalLessons} Lessons)
            </h2>
            <p className="text-xs text-[#8B8295]">
              Select any lesson to study explanations, watch verified videos, and practice with quizzes
            </p>
          </div>
          {isDemoMode ? (
            <span className="text-xs font-semibold text-[#7B59B6]">
              Preview Mode · Click a lesson to toggle progress
            </span>
          ) : nextLesson && completedLessons < totalLessons ? (
            <span className="text-xs font-bold text-[#6F4FA8]">
              Recommended Next: {nextLesson.title}
            </span>
          ) : null}
        </div>

        <div className="divide-y divide-[#F1EAE8]">
          {stage.lessons.map((lesson, idx) => {
            const isSavingThis = savingLessonId === lesson.id;
            const isNextUp = !lesson.completed && nextLesson?.id === lesson.id;

            return (
              <div
                key={lesson.id}
                className={`py-4 first:pt-2 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  isNextUp ? 'bg-[#F8F4FD]/60 -mx-3 px-3 rounded-[18px]' : ''
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {/* Completion Checkbox Toggle */}
                  <button
                    type="button"
                    disabled={isSavingThis}
                    onClick={() => void onToggleLessonComplete(stage.id, lesson.id)}
                    aria-label={
                      lesson.completed
                        ? `Mark ${lesson.title} incomplete`
                        : `Mark ${lesson.title} complete`
                    }
                    className={`w-7 h-7 mt-0.5 rounded-[10px] flex items-center justify-center shrink-0 transition-all ${
                      lesson.completed
                        ? 'clay-squircle-mint text-white'
                        : 'bg-[#FAF6F2] border border-[#DFD4D2] hover:border-[#A78BCE]'
                    }`}
                  >
                    {isSavingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8E6EC8]" />
                    ) : lesson.completed ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      <span className="text-[11px] font-mono font-bold text-[#7B7188]">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className={`font-display text-sm sm:text-base font-extrabold ${
                          lesson.completed ? 'text-[#5A6D5E]' : 'text-[#343047]'
                        }`}
                      >
                        {lesson.title}
                      </h3>
                    </div>

                    {lesson.description && (
                      <p className="text-xs text-[#6B6178] leading-relaxed line-clamp-2">
                        {lesson.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] font-semibold text-[#8B8295] flex-wrap pt-0.5">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3 h-3" />
                        <span>{lesson.estimatedTime}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          lesson.completed
                            ? 'text-[#356640]'
                            : isNextUp
                            ? 'text-[#6F4FA8]'
                            : 'text-[#8B8295]'
                        }`}
                      >
                        {lesson.completed ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              Completed
                              {lesson.completedAt
                                ? ` · ${formatLessonCompletedTimestamp(lesson.completedAt)}`
                                : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-3 h-3" />
                            <span>{isNextUp ? 'Up Next' : 'Not Started'}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {!isDemoMode && (
                  <div className="shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => onStartLearningLesson(stage.id, lesson.id)}
                      className={`px-4 py-2 rounded-[14px] text-xs font-extrabold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                        lesson.completed
                          ? 'clay-button-soft text-[#2F5B37]'
                          : 'clay-button-primary'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {lesson.completed
                          ? 'Review Lesson'
                          : isNextUp
                          ? 'Continue'
                          : 'Start Learning'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Course-Specific Verified Learning Resources */}
      {roadmapId && !isDemoMode && (
        <div className="pastel-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#343047]">
                Course Learning Resources
              </h2>
              <p className="text-xs text-[#8B8295]">
                Verified educational videos, documentation, and free courses matched to {stage.title}
              </p>
            </div>
            {resourcesError && (
              <button
                type="button"
                onClick={() => loadCourseResources()}
                className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5 self-start"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>

          {resourcesLoading && !courseResources && (
            <div className="py-5 flex items-center gap-3 text-xs text-[#6B6178]">
              <Loader2 className="w-4 h-4 animate-spin text-[#8E6EC8]" />
              <span>Matching verified resources for this course...</span>
            </div>
          )}

          {!resourcesLoading && resourcesError && !courseResources && (
            <div className="rounded-[18px] bg-[#FCEAE5] border border-[#F2C2BA] p-4 text-xs text-[#753227]">
              {resourcesError}
            </div>
          )}

          {courseResources && (() => {
            const videos = courseResources.videos ?? [];
            const tutorials = courseResources.tutorials ?? [];
            const practice = courseResources.practice ?? [];
            const totalMatched = videos.length + tutorials.length + practice.length;

            if (totalMatched === 0) {
              return (
                <div className="p-5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-xs text-[#6B6178]">
                  No course-level external resources matched this topic yet. Open any lesson above for full AI-guided notes, examples, and exercises.
                </div>
              );
            }

            const tabs: {
              key: 'videos' | 'tutorials' | 'practice';
              label: string;
              count: number;
              icon: React.ReactNode;
              activeBg: string;
            }[] = [
              {
                key: 'videos',
                label: 'Videos',
                count: videos.length,
                icon: <Youtube className="w-3.5 h-3.5 shrink-0" />,
                activeBg: 'bg-[#A78BCE] text-white shadow-xs',
              },
              {
                key: 'tutorials',
                label: 'Docs & Tutorials',
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
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-[#FAF6F2] border border-[#EEE6E5] rounded-2xl">
                  {tabs.map((tab) => {
                    const isActive = activeResourceTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveResourceTab(tab.key)}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
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

                {activeResourceTab === 'videos' && (
                  <div className="space-y-3">
                    {courseResources.videoCoverageNote && (
                      <div className="px-3.5 py-2 rounded-[14px] bg-[#F7F3FC] border border-[#E5DAF5] text-xs text-[#5E5468]">
                        {courseResources.videoCoverageNote}
                      </div>
                    )}
                    {videos.length === 0 ? (
                      <p className="text-xs text-[#6B6178] p-4 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                        No verified course-level videos matched yet — check Docs &amp; Tutorials or Courses &amp; Practice.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {videos.map((video) => {
                          const isPlaying =
                            Boolean(video.embedAllowed && video.embedUrl) &&
                            playingVideoId === video.id;
                          return (
                            <div
                              key={video.id}
                              className="rounded-[20px] bg-[#FFFCFA] border border-[#E2D6F5] p-4 flex flex-col justify-between gap-3"
                            >
                              <div className="space-y-2.5">
                                {isPlaying && video.embedUrl ? (
                                  <div className="space-y-2">
                                    <div className="relative w-full aspect-video rounded-[14px] overflow-hidden border border-[#D8C9F2] bg-[#1F1B2E]">
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
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF6F2] border border-[#E2D6F5] text-[11px] font-bold text-[#6F4FA8]"
                                      >
                                        <X className="w-3 h-3" />
                                        <span>Close Player</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : video.thumbnailUrl ? (
                                  <div className="relative w-full aspect-video rounded-[14px] overflow-hidden border border-[#E5DAF5] bg-[#EDE5F8] group">
                                    <img
                                      src={video.thumbnailUrl}
                                      alt={`${video.title} thumbnail`}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                    {video.embedAllowed && video.embedUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setPlayingVideoId(video.id)}
                                        aria-label={`Play ${video.title}`}
                                        className="absolute inset-0 flex items-center justify-center bg-[#2B263B]/20 hover:bg-[#2B263B]/30 transition-colors"
                                      >
                                        <span className="w-12 h-12 rounded-full bg-[#FFFCFA]/95 text-[#7B59B6] flex items-center justify-center shadow-md">
                                          <Play className="w-5 h-5 fill-[#7B59B6] ml-0.5" />
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#2B263B]/85 text-white text-[10px] font-bold">
                                        External Watch Only
                                      </span>
                                    )}
                                  </div>
                                ) : null}

                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7B7188] flex-wrap">
                                  <span className="font-bold text-[#6F4FA8]">{video.provider}</span>
                                  {video.learningPurpose ? (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="px-2 py-0.5 rounded-full bg-[#EFE7FA] text-[#5D3F92] font-bold text-[10px]">
                                        {video.learningPurpose}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>Verified YouTube Video</span>
                                    </>
                                  )}
                                </div>
                                <h3 className="font-display text-sm font-extrabold text-[#343047] leading-snug">
                                  {video.title}
                                </h3>
                                <p className="text-xs text-[#5E5468] leading-relaxed line-clamp-2">
                                  {video.description}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EEE6E5]">
                                {video.embedAllowed && video.embedUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPlayingVideoId((prev) =>
                                        prev === video.id ? null : video.id
                                      )
                                    }
                                    className="clay-button-primary px-3.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5"
                                  >
                                    <PlayCircle className="w-3.5 h-3.5" />
                                    <span>{isPlaying ? 'Hide Player' : 'Watch Video'}</span>
                                  </button>
                                )}
                                <a
                                  href={video.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="clay-button-soft px-3 py-1.5 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1"
                                >
                                  <span>YouTube</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeResourceTab === 'tutorials' && (
                  tutorials.length === 0 ? (
                    <p className="text-xs text-[#6B6178] p-4 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                      No verified docs or tutorials matched this course yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tutorials.map((res) => (
                        <div
                          key={res.id}
                          className="p-4 rounded-[20px] bg-[#FAFDF9] border border-[#CFE4CC] flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold text-[#5E5468]">
                              <span className="font-bold text-[#2F5B37]">{res.provider}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{res.type}</span>
                            </div>
                            <h3 className="font-display text-sm font-extrabold text-[#343047]">
                              {res.title}
                            </h3>
                            <p className="text-xs text-[#5E5468] leading-relaxed">
                              {res.description}
                            </p>
                          </div>
                          <div className="pt-2 border-t border-[#DFECDD]">
                            <a
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[12px] bg-[#62A472] hover:bg-[#539363] text-white text-xs font-extrabold transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Read Resource</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {activeResourceTab === 'practice' && (
                  practice.length === 0 ? (
                    <p className="text-xs text-[#6B6178] p-4 rounded-[16px] bg-[#FAF6F2] border border-[#EEE6E5]">
                      No verified external courses or interactive practice matched this topic yet — explore lesson exercises inside the curriculum above.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {practice.map((res) => (
                        <div
                          key={res.id}
                          className="p-4 rounded-[20px] bg-[#FFF8F6] border border-[#F2CFC7] flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold text-[#6B6178]">
                              <span className="font-bold text-[#B45343]">{res.provider}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{res.type}</span>
                            </div>
                            <h3 className="font-display text-sm font-extrabold text-[#343047]">
                              {res.title}
                            </h3>
                            <p className="text-xs text-[#5E5468] leading-relaxed">
                              {res.description}
                            </p>
                          </div>
                          <div className="pt-2 border-t border-[#F4DFDA]">
                            <a
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[12px] bg-[#D17865] hover:bg-[#BF6856] text-white text-xs font-extrabold transition-colors"
                            >
                              <GraduationCap className="w-3.5 h-3.5" />
                              <span>
                                {res.type === 'Free Online Course'
                                  ? 'Open Free Course'
                                  : 'Open Practice'}
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
            );
          })()}
        </div>
      )}

      {/* Collapsible Practice Activities & Mini-Project (preserves all stage data unobtrusively) */}
      {(stage.practiceActivities.length > 0 || stage.suggestedMiniProject) && (
        <div className="pastel-card overflow-hidden">
          <button
            type="button"
            aria-expanded={projectsOpen}
            onClick={() => setProjectsOpen((prev) => !prev)}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-[#FAF6F2]/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Rocket className="w-4 h-4 text-[#D17865] shrink-0" />
              <div>
                <h2 className="font-display text-sm font-extrabold text-[#343047]">
                  Course Practice Activities & Mini-Project
                </h2>
                <p className="text-[11px] text-[#8B8295]">
                  Optional hands-on capstone work for this stage
                </p>
              </div>
            </div>
            <span className="p-1.5 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]">
              {projectsOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {projectsOpen && (
            <div className="px-5 pb-5 pt-3 border-t border-[#EEE6E5] grid grid-cols-1 md:grid-cols-2 gap-4">
              {stage.practiceActivities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold text-[#343047] flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-[#D17865]" />
                    <span>Practice Activities</span>
                  </p>
                  <ul className="space-y-1.5">
                    {stage.practiceActivities.map((act, idx) => (
                      <li key={idx} className="text-xs text-[#5E5468] flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#E8A08E] mt-1.5 shrink-0" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {stage.suggestedMiniProject && (
                <div className="p-4 rounded-[18px] bg-[#F0E9FA]/60 border border-[#DFD2F5] space-y-1.5">
                  <p className="text-xs font-extrabold text-[#5D3F91] flex items-center gap-1.5">
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Suggested Mini-Project</span>
                  </p>
                  <p className="text-xs text-[#4A3B66] leading-relaxed">
                    {stage.suggestedMiniProject}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
