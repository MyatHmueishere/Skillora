import React, { useState } from 'react';
import {
  Compass,
  Clock,
  Play,
  FileText,
  Code,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Rocket,
} from 'lucide-react';
import { RoadmapStage, AppView } from '../../types';
import {
  ClayIconBadge,
  BooksTrophy3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';

interface RoadmapViewProps {
  stages: RoadmapStage[];
  onToggleLesson: (stageId: number, lessonId: string) => void;
  onNavigate: (view: AppView) => void;
  careerGoal: string;
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({
  stages,
  onToggleLesson,
  onNavigate,
  careerGoal,
}) => {
  const [expandedStages, setExpandedStages] = useState<number[]>([3]);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'upcoming'>('all');

  const toggleExpand = (stageId: number) => {
    if (expandedStages.includes(stageId)) {
      setExpandedStages(expandedStages.filter((id) => id !== stageId));
    } else {
      setExpandedStages([...expandedStages, stageId]);
    }
  };

  const filteredStages = stages.filter((stage) => {
    if (filter === 'all') return true;
    return stage.status === filter;
  });

  const totalLessons = stages.reduce((acc, s) => acc + s.lessons.length, 0);
  const completedLessons = stages.reduce(
    (acc, s) => acc + s.lessons.filter((l) => l.completed).length,
    0
  );
  const overallRoadmapProgress = Math.round((completedLessons / (totalLessons || 1)) * 100);

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Play className="w-3.5 h-3.5 text-[#8E6EC8]" />;
      case 'exercise':
        return <Code className="w-3.5 h-3.5 text-[#539864]" />;
      case 'project':
        return <Rocket className="w-3.5 h-3.5 text-[#D17865]" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-[#8B8295]" />;
    }
  };

  const stageVariants: ClayColorVariant[] = ['mint', 'mint', 'lavender', 'peach', 'yellow', 'pink'];

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div
        className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
        style={{
          background: 'linear-gradient(135deg, #FCEAE5 0%, #FAF6F2 50%, #F0E9FA 100%)',
          boxShadow: '0 12px 30px -12px rgba(154, 126, 200, 0.25)',
        }}
      >
        <div className="flex items-center gap-5">
          <BooksTrophy3D className="w-24 h-20 hidden sm:block shrink-0" />
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6F4FA8] bg-[#FFFCFA] px-3 py-1 rounded-full border border-[#E2D6F5]">
              <Compass className="w-3.5 h-3.5 text-[#9B7ACE]" />
              <span>Personalized Learning Path</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              {careerGoal}
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6178] max-w-xl leading-relaxed">
              Connected 6-stage learning journey. Check off any lesson unit below to update your roadmap progress in real time.
            </p>
          </div>
        </div>

        {/* Circular Progress Ring Card */}
        <div className="p-4 px-5 rounded-[22px] bg-[#FFFCFA] border border-[#EEE6E5] shadow-xs flex items-center gap-4 shrink-0">
          <div className="relative w-16 h-16 flex items-center justify-center">
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
                strokeDasharray={`${overallRoadmapProgress}, 100`}
                strokeWidth="3.8"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-display text-sm font-extrabold text-[#343047] tabular-nums">
              {overallRoadmapProgress}%
            </span>
          </div>

          <div className="text-xs">
            <p className="font-display font-extrabold text-[#343047]">Overall Progress</p>
            <p className="text-[#8B8295] font-mono tabular-nums mt-0.5">
              {completedLessons} / {totalLessons} units
            </p>
            <p className="text-[11px] text-[#8E6EC8] font-bold mt-0.5">
              ~6 weeks remaining
            </p>
          </div>
        </div>
      </div>

      {/* Filter Pills & Diagnostic Trigger */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-full shadow-2xs">
          {(
            [
              { id: 'all', label: 'All 6 Stages' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'completed', label: 'Completed' },
              { id: 'upcoming', label: 'Upcoming' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-[#A78BCE] text-white shadow-xs'
                  : 'text-[#8B8295] hover:text-[#343047]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => onNavigate('assessment')}
          className="clay-button-soft px-4 py-2 text-xs font-bold flex items-center gap-1.5 text-[#7A58B5]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Recalibrate via Assessment</span>
        </button>
      </div>

      {/* CONNECTED MILESTONE TIMELINE */}
      <div className="relative space-y-4">
        {filteredStages.map((stage, sIdx) => {
          const isExpanded = expandedStages.includes(stage.id);
          const stageCompletedCount = stage.lessons.filter((l) => l.completed).length;
          const stagePercent = Math.round((stageCompletedCount / (stage.lessons.length || 1)) * 100);
          const isDone = stage.status === 'completed' || stagePercent === 100;
          const isInProgress = stage.status === 'in_progress' || (stagePercent > 0 && stagePercent < 100);

          const badgeVariant: ClayColorVariant = isDone
            ? 'mint'
            : isInProgress
            ? 'lavender'
            : stageVariants[(stage.id - 1) % stageVariants.length];

          return (
            <div key={stage.id} className="relative">
              {/* Vertical Milestone Connector Line between cards */}
              {sIdx < filteredStages.length - 1 && (
                <div
                  className="hidden sm:block absolute left-10 -bottom-4 w-1 h-4 bg-[#E4D8F2] z-0 rounded-full"
                  aria-hidden="true"
                />
              )}

              <div
                className={`pastel-card relative z-10 overflow-hidden transition-all ${
                  isInProgress
                    ? 'border-[#C9B7E8] ring-2 ring-[#C9B7E8]/35'
                    : isDone
                    ? 'border-[#C6E0C1]'
                    : ''
                }`}
              >
                {/* Milestone Header */}
                <div
                  onClick={() => toggleExpand(stage.id)}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#FAF6F2]/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <ClayIconBadge variant={badgeVariant} size="md" className="mt-0.5">
                      {isDone ? (
                        <Check className="w-5 h-5 stroke-[3]" />
                      ) : (
                        <span className="font-display font-extrabold text-sm">{stage.id}</span>
                      )}
                    </ClayIconBadge>

                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#8B8295] font-semibold mb-1 flex-wrap">
                        <span>{stage.subtitle}</span>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {stage.estimatedDuration}
                        </span>
                      </div>

                      <h3 className="font-display text-base sm:text-lg font-extrabold text-[#343047]">
                        {stage.title}
                      </h3>

                      <p className="text-xs text-[#7B7188] mt-0.5 max-w-2xl leading-relaxed">
                        {stage.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-mono font-bold text-[#343047] tabular-nums">
                        {stageCompletedCount} / {stage.lessons.length} units
                      </p>
                      <div className="w-24 bg-[#F1EAE8] h-2 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isDone ? 'bg-[#8CC697]' : 'bg-[#A78BCE]'
                          }`}
                          style={{ width: `${stagePercent}%` }}
                        />
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-3 py-1 rounded-full ${
                        isDone
                          ? 'bg-[#DCECD9] text-[#356640]'
                          : isInProgress
                          ? 'bg-[#F0E9FA] text-[#6B4FA1]'
                          : 'bg-[#FFF1D6] text-[#8E6521]'
                      }`}
                    >
                      {isDone ? 'Completed' : isInProgress ? 'In Progress' : 'Upcoming'}
                    </span>

                    <div className="p-1.5 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Units */}
                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-6 pt-3 border-t border-[#EEE6E5] bg-[#FAF6F2]/60 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-[#343047]">Learning Goals:</span>
                      {stage.keyTopics.map((topic, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] text-[#6B6178] text-[11px] font-semibold"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-2.5">
                      <p className="text-xs font-bold text-[#6B6178]">
                        Resources & Units (Click to mark completed):
                      </p>
                      {stage.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          onClick={() => onToggleLesson(stage.id, lesson.id)}
                          className={`p-3.5 rounded-[18px] border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            lesson.completed
                              ? 'bg-[#DCECD9]/55 border-[#C2DFBC] text-[#2F4F35]'
                              : 'bg-[#FFFCFA] border-[#EEE6E5] hover:border-[#C9B7E8] text-[#343047]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-6 h-6 rounded-[9px] flex items-center justify-center transition-colors shrink-0 ${
                                lesson.completed
                                  ? 'clay-squircle-mint text-white'
                                  : 'bg-[#FAF6F2] border border-[#DFD4D2]'
                              }`}
                            >
                              {lesson.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>

                            <div>
                              <p
                                className={`text-xs font-bold ${
                                  lesson.completed ? 'line-through text-[#6D8071]' : 'text-[#343047]'
                                }`}
                              >
                                {lesson.title}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-[#8B8295] mt-0.5">
                                <span className="capitalize">{lesson.type}</span>
                                <span aria-hidden="true">·</span>
                                <span>{lesson.duration}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {getLessonIcon(lesson.type)}
                            <span className="text-[11px] font-bold text-[#8E6EC8]">
                              {lesson.completed ? 'Review' : 'Start'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
