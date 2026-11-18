import React, { useState } from 'react';
import { X, Clock, Check, Sparkles, BookOpen } from 'lucide-react';
import { Course, AppView } from '../../types';
import { ClayIconBadge } from './PastelIllustrations';

interface LessonModalProps {
  course: Course | null;
  isOpen: boolean;
  onClose: () => void;
  onCompleteLesson?: (courseId: string) => void;
  onOpenAssistant?: (topic: string) => void;
  onNavigate?: (view: AppView) => void;
}

export const LessonModal: React.FC<LessonModalProps> = ({
  course,
  isOpen,
  onClose,
  onCompleteLesson,
  onOpenAssistant,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'syllabus' | 'notes'>('overview');
  const [completedSteps, setCompletedSteps] = useState<number[]>([1, 2]);

  if (!isOpen || !course) return null;

  const toggleStep = (stepNumber: number) => {
    if (completedSteps.includes(stepNumber)) {
      setCompletedSteps(completedSteps.filter((s) => s !== stepNumber));
    } else {
      setCompletedSteps([...completedSteps, stepNumber]);
      if (onCompleteLesson) {
        onCompleteLesson(course.id);
      }
    }
  };

  const syllabusLessons = [
    { num: 1, title: 'Architectural Overview & Core Concepts', duration: '25 min', type: 'video' },
    { num: 2, title: 'Implementation Patterns & Best Practices', duration: '40 min', type: 'article' },
    { num: 3, title: 'Hands-on Coding Lab & Edge Cases', duration: '55 min', type: 'lab' },
    { num: 4, title: 'Comprehensive Knowledge Checkup', duration: '20 min', type: 'quiz' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#343047]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-[#FFFCFA] rounded-[26px] shadow-[0_24px_60px_-14px_rgba(74,56,102,0.3)] border border-[#EEE6E5] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Soft Pastel Header Banner */}
        <div className="relative p-6 pb-5 bg-gradient-to-br from-[#F0E9FA] via-[#FAF6F2] to-[#F8D9D0]/65 border-b border-[#EEE6E5]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] text-[#8B8295] hover:text-[#343047] shadow-xs transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4 pr-10">
            <ClayIconBadge variant="lavender" size="lg">
              <BookOpen className="w-6 h-6" />
            </ClayIconBadge>
            <div>
              <div className="flex items-center gap-2 text-xs text-[#8D6EC2] font-bold mb-1 flex-wrap">
                <span>{course.category}</span>
                <span aria-hidden="true">·</span>
                <span>{course.difficulty}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 text-[#8B8295] font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {course.duration}
                </span>
              </div>
              <h3 className="font-display text-xl font-extrabold text-[#343047] tracking-tight leading-snug">
                {course.title}
              </h3>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 bg-[#FAF6F2]/60 border-b border-[#EEE6E5]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[#A78BCE] text-[#343047]'
                : 'border-transparent text-[#8B8295] hover:text-[#343047]'
            }`}
          >
            Module Overview
          </button>
          <button
            onClick={() => setActiveTab('syllabus')}
            className={`pb-3 px-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'syllabus'
                ? 'border-[#A78BCE] text-[#343047]'
                : 'border-transparent text-[#8B8295] hover:text-[#343047]'
            }`}
          >
            Interactive Syllabus ({syllabusLessons.length} units)
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`pb-3 px-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'notes'
                ? 'border-[#A78BCE] text-[#343047]'
                : 'border-transparent text-[#8B8295] hover:text-[#343047]'
            }`}
          >
            AI Study Notes
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[50vh] overflow-y-auto space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-[#8B8295] mb-1.5">
                  About this Module
                </h4>
                <p className="text-xs sm:text-sm text-[#343047] leading-relaxed">
                  {course.description}
                </p>
              </div>

              <div className="p-4 rounded-[20px] bg-[#F0E9FA]/75 border border-[#DFD2F2] flex items-start gap-3">
                <ClayIconBadge variant="lavender" size="sm">
                  <Sparkles className="w-4 h-4" />
                </ClayIconBadge>
                <div>
                  <h5 className="font-display text-xs font-extrabold text-[#343047]">
                    AI Personalized Recommendation
                  </h5>
                  <p className="text-xs text-[#6B6178] mt-0.5 leading-relaxed">
                    Completing this module closes the specific skill gap identified in your recent Python diagnostic and boosts your readiness for Stage 4 OOP.
                  </p>
                </div>
              </div>

              {course.instructor && (
                <div className="flex items-center justify-between p-3.5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#F8D9D0] text-[#7D463A] flex items-center justify-center text-xs font-extrabold">
                      {course.instructor.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#343047]">{course.instructor}</p>
                      <p className="text-[11px] text-[#8B8295]">Lead Curriculum Instructor</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#FFF1D6] text-[#855B1A] text-xs font-bold tabular-nums">
                    ★ {course.rating} / 5.0
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'syllabus' && (
            <div className="space-y-2.5">
              <p className="text-xs text-[#8B8295] mb-2">
                Tap any unit below to mark it complete and update your module progress:
              </p>
              {syllabusLessons.map((item) => {
                const isDone = completedSteps.includes(item.num);
                return (
                  <div
                    key={item.num}
                    onClick={() => toggleStep(item.num)}
                    className={`flex items-center justify-between p-3.5 rounded-[18px] border transition-all cursor-pointer ${
                      isDone
                        ? 'bg-[#DCECD9]/60 border-[#BDD8B8] text-[#2F4F35]'
                        : 'bg-[#FFFCFA] border-[#EEE6E5] hover:border-[#C9B7E8] text-[#343047]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-[10px] flex items-center justify-center transition-colors ${
                          isDone
                            ? 'clay-squircle-mint text-white'
                            : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#8B8295]'
                        }`}
                      >
                        {isDone ? (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        ) : (
                          <span className="text-[11px] font-mono font-bold">{item.num}</span>
                        )}
                      </div>
                      <div>
                        <p
                          className={`text-xs font-semibold ${
                            isDone ? 'line-through text-[#6E7F71]' : 'text-[#343047]'
                          }`}
                        >
                          {item.title}
                        </p>
                        <span className="text-[11px] text-[#8B8295]">{item.duration}</span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[11px] text-[#8B8295] font-semibold capitalize">
                      {item.type}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-3">
              <div className="p-4 rounded-[20px] bg-[#FFF1D6]/65 border border-[#F3DFB4] space-y-2">
                <h5 className="font-display text-xs font-extrabold text-[#343047]">
                  Key Takeaways & Syntheses
                </h5>
                <ul className="text-xs text-[#5E5468] space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>Leverage list comprehensions for cleaner syntax and faster C-level iteration.</li>
                  <li>Avoid mutable default arguments in functions to prevent state leakage across calls.</li>
                  <li>Use generator expressions (`yield`) when streaming large datasets for low memory footprints.</li>
                </ul>
              </div>

              {onOpenAssistant && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenAssistant(
                      `Explain "${course.title}" (${course.category}, ${course.difficulty}) and help me practice its key concepts.`
                    );
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[16px] bg-[#F0E9FA] text-[#6D50A3] hover:bg-[#E5DAF6] text-xs font-bold transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Ask AI Assistant to explain {course.title}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-[#EEE6E5] bg-[#FAF6F2]/70 flex items-center justify-between">
          <div className="text-xs text-[#8B8295]">
            <span className="font-bold text-[#343047] tabular-nums">
              {completedSteps.length} / {syllabusLessons.length}
            </span>{' '}
            units completed
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="clay-button-soft px-4 py-2 text-xs font-semibold"
            >
              Close
            </button>
            <button
              onClick={() => {
                if (onNavigate) {
                  onClose();
                  onNavigate('roadmap');
                } else {
                  onClose();
                }
              }}
              className="clay-button-primary px-5 py-2 text-xs font-bold"
            >
              View in Roadmap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
