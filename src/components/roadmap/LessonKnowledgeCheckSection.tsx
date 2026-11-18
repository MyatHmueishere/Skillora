import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  HelpCircle,
  History,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react';
import type {
  GeneratedRoadmapLesson,
  KnowledgeCheckInstantFeedback,
  KnowledgeCheckStartResponse,
  LessonKnowledgeCheckAttemptRecord,
  TopicProficiencyLevel,
} from '../../types';
import {
  KnowledgeCheckClientError,
  checkKnowledgeCheckAnswer,
  computeAttemptImprovement,
  formatKnowledgeCheckDate,
  prefetchLessonKnowledgeCheck,
  startLessonKnowledgeCheck,
  submitLessonKnowledgeCheck,
} from '../../lib/knowledgeChecks';
import { ClayIconBadge } from '../common/PastelIllustrations';
import { createBrowserActiveStudyTimer } from '../../lib/activeStudyTracker';

interface LessonKnowledgeCheckSectionProps {
  roadmapId: string;
  stageId: string;
  lesson: GeneratedRoadmapLesson;
  lessonAttempts: LessonKnowledgeCheckAttemptRecord[];
  onAttemptSaved: (
    attempt: LessonKnowledgeCheckAttemptRecord,
    durationSeconds?: number
  ) => void;
  onFocusLearn: () => void;
  onFocusPractice: () => void;
  onOpenResources: () => void;
  onGoToNextLesson: (targetStageId?: string | null, targetLessonId?: string | null) => void;
  hasNextLesson: boolean;
}

type QuizPhase = 'intro' | 'active' | 'review_before_submit' | 'submitted';

function proficiencyBadgeClass(level: TopicProficiencyLevel): string {
  if (level === 'Strong') {
    return 'bg-[#DCECD9] border-[#BBDAB6] text-[#2F5B37]';
  }
  if (level === 'Moderate') {
    return 'bg-[#FFF1D6] border-[#F0D59E] text-[#7A5720]';
  }
  return 'bg-[#FCEAE5] border-[#F0C1B6] text-[#8D3E32]';
}

export const LessonKnowledgeCheckSection: React.FC<
  LessonKnowledgeCheckSectionProps
> = ({
  roadmapId,
  stageId,
  lesson,
  lessonAttempts,
  onAttemptSaved,
  onFocusLearn,
  onFocusPractice,
  onOpenResources,
  onGoToNextLesson,
  hasNextLesson,
}) => {
  const [phase, setPhase] = useState<QuizPhase>('intro');
  const [quizSession, setQuizSession] = useState<KnowledgeCheckStartResponse | null>(
    null
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [instantFeedback, setInstantFeedback] = useState<
    Record<string, KnowledgeCheckInstantFeedback>
  >({});
  const [submittedAttempt, setSubmittedAttempt] =
    useState<LessonKnowledgeCheckAttemptRecord | null>(null);
  const [showAllAnswersReview, setShowAllAnswersReview] = useState(true);
  const [showPastAttempts, setShowPastAttempts] = useState(false);

  const [starting, setStarting] = useState(false);
  const [checkingQuestionId, setCheckingQuestionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submitLockRef = useRef(false);
  const activeQuizSecondsRef = useRef(0);
  const currentLessonKey = `${roadmapId}:${stageId}:${lesson.id}`;
  const activeLessonKeyRef = useRef(currentLessonKey);
  activeLessonKeyRef.current = currentLessonKey;

  useEffect(() => {
    if (phase !== 'active' && phase !== 'review_before_submit') return;
    const timer = createBrowserActiveStudyTimer({
      onSecondTick: (seconds) => {
        activeQuizSecondsRef.current = seconds;
      },
    });
    return () => {
      timer.destroy();
    };
  }, [phase, quizSession?.submissionId]);

  // Reset local interactive quiz state when navigating to a different lesson
  useEffect(() => {
    setPhase('intro');
    setQuizSession(null);
    setCurrentIndex(0);
    setSelectedAnswers({});
    setInstantFeedback({});
    setSubmittedAttempt(null);
    setShowAllAnswersReview(true);
    setShowPastAttempts(false);
    setStarting(false);
    setCheckingQuestionId(null);
    setSubmitting(false);
    setErrorMsg('');
    submitLockRef.current = false;
    activeQuizSecondsRef.current = 0;
  }, [roadmapId, stageId, lesson.id]);

  // Background prefetch so clicking Start Knowledge Check launches near-instantly
  useEffect(() => {
    if (phase !== 'intro' || quizSession) return;
    const timer = window.setTimeout(() => {
      void prefetchLessonKnowledgeCheck({
        roadmapId,
        stageId,
        lessonId: lesson.id,
        questionCount: 4,
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase, quizSession, roadmapId, stageId, lesson.id]);

  const sortedLessonAttempts = lessonAttempts
    .slice()
    .sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  const latestLessonAttempt = sortedLessonAttempts[0] ?? null;
  const bestLessonScore =
    sortedLessonAttempts.length > 0
      ? Math.max(...sortedLessonAttempts.map((a) => a.score))
      : null;

  const handleStartQuiz = async () => {
    if (starting) return;
    const requestLessonKey = currentLessonKey;
    setStarting(true);
    setErrorMsg('');
    try {
      const started = await startLessonKnowledgeCheck({
        roadmapId,
        stageId,
        lessonId: lesson.id,
        questionCount: 4,
      });
      if (activeLessonKeyRef.current !== requestLessonKey) return;
      setQuizSession(started);
      setCurrentIndex(0);
      setSelectedAnswers({});
      setInstantFeedback({});
      setSubmittedAttempt(null);
      submitLockRef.current = false;
      activeQuizSecondsRef.current = 0;
      setPhase('active');
    } catch (err) {
      if (activeLessonKeyRef.current !== requestLessonKey) return;
      setErrorMsg(
        err instanceof KnowledgeCheckClientError || err instanceof Error
          ? err.message
          : 'Could not start the Knowledge Check right now. Please try again.'
      );
    } finally {
      if (activeLessonKeyRef.current === requestLessonKey) {
        setStarting(false);
      }
    }
  };

  const handleCheckCurrentAnswer = async (questionId: string) => {
    if (!quizSession || checkingQuestionId) return;
    const chosenIdx = selectedAnswers[questionId];
    if (chosenIdx === undefined) return;
    if (instantFeedback[questionId]) return;

    const requestLessonKey = currentLessonKey;
    setCheckingQuestionId(questionId);
    setErrorMsg('');
    try {
      const feedback = await checkKnowledgeCheckAnswer({
        quizToken: quizSession.quizToken,
        questionId,
        selectedOptionIndex: chosenIdx,
      });
      if (activeLessonKeyRef.current !== requestLessonKey) return;
      setInstantFeedback((prev) => ({ ...prev, [questionId]: feedback }));
    } catch (err) {
      if (activeLessonKeyRef.current !== requestLessonKey) return;
      setErrorMsg(
        err instanceof KnowledgeCheckClientError || err instanceof Error
          ? err.message
          : 'Could not verify your answer right now.'
      );
    } finally {
      if (activeLessonKeyRef.current === requestLessonKey) {
        setCheckingQuestionId(null);
      }
    }
  };

  const handleSubmitQuiz = async () => {
    if (!quizSession || submitting || submitLockRef.current) return;
    const allAnswered = quizSession.questions.every(
      (q) => selectedAnswers[q.id] !== undefined
    );
    if (!allAnswered) {
      setErrorMsg('Please select an answer for every question before submitting.');
      return;
    }

    const requestLessonKey = currentLessonKey;
    submitLockRef.current = true;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const result = await submitLessonKnowledgeCheck({
        quizToken: quizSession.quizToken,
        answers: selectedAnswers,
      });
      // Always persist attempt to parent App state even if user switched lesson mid-flight
      const elapsedSeconds = Math.max(1, Math.min(7200, Math.round(activeQuizSecondsRef.current)));
      onAttemptSaved(result.attempt, elapsedSeconds);
      if (activeLessonKeyRef.current !== requestLessonKey) return;
      setSubmittedAttempt(result.attempt);
      setShowAllAnswersReview(true);
      setPhase('submitted');
    } catch (err) {
      submitLockRef.current = false;
      if (activeLessonKeyRef.current !== requestLessonKey) return;
      setErrorMsg(
        err instanceof KnowledgeCheckClientError || err instanceof Error
          ? err.message
          : 'Could not submit your Knowledge Check. Please retry.'
      );
    } finally {
      if (activeLessonKeyRef.current === requestLessonKey) {
        setSubmitting(false);
      }
    }
  };

  const totalQuestions = quizSession?.questions.length ?? 0;
  const answeredCount = quizSession
    ? quizSession.questions.filter((q) => selectedAnswers[q.id] !== undefined).length
    : 0;
  const allQuestionsAnswered = totalQuestions > 0 && answeredCount === totalQuestions;
  const currentQuestion =
    quizSession && quizSession.questions[currentIndex]
      ? quizSession.questions[currentIndex]
      : null;

  return (
    <div className="space-y-4 pt-2 border-t border-[#EEE6E5]" id="lesson-knowledge-check">
      {/* Header Banner Card */}
      <div className="pastel-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <ClayIconBadge variant="yellow" size="md">
            <HelpCircle className="w-5 h-5" />
          </ClayIconBadge>
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#343047]">
              Lesson Knowledge Check
            </h2>
            <p className="text-xs text-[#8B8295]">
              3–5 objective-based questions with instant explanations, gap detection &amp; adaptive next steps
            </p>
          </div>
        </div>

        {sortedLessonAttempts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[11px] font-bold text-[#6F4FA8] tabular-nums">
              {sortedLessonAttempts.length}{' '}
              {sortedLessonAttempts.length === 1 ? 'Attempt' : 'Attempts'}
              {bestLessonScore !== null ? ` · Best ${bestLessonScore}%` : ''}
            </span>
            <button
              type="button"
              onClick={() => setShowPastAttempts((prev) => !prev)}
              className="px-3 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[11px] font-bold text-[#5E5468] hover:border-[#C9B7E8] inline-flex items-center gap-1"
            >
              <History className="w-3 h-3" />
              <span>{showPastAttempts ? 'Hide History' : 'Lesson History'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Previous Attempts for Current Lesson */}
      {showPastAttempts && sortedLessonAttempts.length > 0 && (
        <div className="pastel-card p-5 space-y-3 bg-[#FAF6F2]/75">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-extrabold text-[#343047]">
              Previous Attempts for “{lesson.title}”
            </h3>
            <span className="text-[11px] text-[#8B8295]">Saved in Supabase</span>
          </div>
          <div className="space-y-2.5">
            {sortedLessonAttempts.map((attempt) => {
              const imp = computeAttemptImprovement(attempt, sortedLessonAttempts);
              return (
                <div
                  key={attempt.id}
                  className="p-3.5 rounded-[16px] bg-[#FFFCFA] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#343047]">
                        Attempt #{imp.attemptNumber}
                      </span>
                      <span className="text-[#8B8295]">
                        {formatKnowledgeCheckDate(attempt.completedAt)}
                      </span>
                      {imp.deltaPercent !== null && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            imp.deltaPercent > 0
                              ? 'bg-[#DCECD9] text-[#2F5B37]'
                              : imp.deltaPercent < 0
                              ? 'bg-[#FCEAE5] text-[#8D3E32]'
                              : 'bg-[#FAF6F2] text-[#6B6178]'
                          }`}
                        >
                          {imp.deltaPercent > 0
                            ? `+${imp.deltaPercent}% vs prev`
                            : imp.deltaPercent < 0
                            ? `${imp.deltaPercent}% vs prev`
                            : 'Same as prev'}
                        </span>
                      )}
                    </div>
                    {attempt.knowledgeGaps.length > 0 ? (
                      <p className="text-[11px] text-[#8D3E32]">
                        Needs improvement: {attempt.knowledgeGaps.join(', ')}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#356640]">
                        No weak topics detected in this attempt
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-mono font-extrabold tabular-nums">
                      {attempt.score}% ({attempt.correctAnswers}/{attempt.totalQuestions})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="rounded-[18px] bg-[#FCEAE5] border border-[#F2C2BA] p-4 flex items-start justify-between gap-3 text-xs text-[#753227]">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#B45343] shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          {phase === 'intro' && (
            <button
              type="button"
              onClick={() => void handleStartQuiz()}
              disabled={starting}
              className="clay-button-soft px-3 py-1.5 text-xs font-bold text-[#753227] shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* PHASE 1: INTRO / START CARD */}
      {phase === 'intro' && (
        <div className="pastel-card p-6 sm:p-7 space-y-5">
          {starting ? (
            <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
              <ClayIconBadge variant="lavender" size="lg">
                <Loader2 className="w-6 h-6 animate-spin" />
              </ClayIconBadge>
              <div className="space-y-1">
                <h3 className="font-display text-base font-extrabold text-[#343047]">
                  Preparing Your Knowledge Check...
                </h3>
                <p className="text-xs text-[#6B6178] max-w-md">
                  Generating 4 multiple-choice questions tailored to the learning objectives of “{lesson.title}”.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#6F4FA8]">
                    <Target className="w-4 h-4" />
                    <span>Lesson Objectives Covered</span>
                  </div>
                  {lesson.learningObjectives.length > 0 ? (
                    <ul className="space-y-1.5">
                      {lesson.learningObjectives.slice(0, 4).map((obj, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-[#4E455C] flex items-start gap-2"
                        >
                          <span className="w-4 h-4 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[#5E5468]">
                      Tests your conceptual understanding and practical application of {lesson.title}.
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleStartQuiz()}
                    className="clay-button-primary px-6 py-3 text-xs sm:text-sm font-extrabold inline-flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {latestLessonAttempt
                        ? 'Retake Knowledge Check'
                        : 'Start Knowledge Check'}
                    </span>
                  </button>
                  <span className="text-[11px] text-[#8B8295]">
                    One question at a time · Instant feedback · Saved independently
                  </span>
                </div>
              </div>

              {latestLessonAttempt && (
                <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#343047]">
                      Latest Result: {latestLessonAttempt.score}% (
                      {latestLessonAttempt.correctAnswers}/
                      {latestLessonAttempt.totalQuestions} correct)
                    </p>
                    <p className="text-[11px] text-[#6B6178]">
                      {latestLessonAttempt.recommendation.title}
                    </p>
                  </div>
                  {latestLessonAttempt.knowledgeGaps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {latestLessonAttempt.knowledgeGaps.map((gap) => (
                        <span
                          key={gap}
                          className="px-2.5 py-0.5 rounded-full bg-[#FCEAE5] border border-[#F0C1B6] text-[#8D3E32] text-[10px] font-bold"
                        >
                          Focus: {gap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PHASE 2: ONE QUESTION AT A TIME STEPPER */}
      {phase === 'active' && quizSession && currentQuestion && (
        <div className="pastel-card p-6 sm:p-7 space-y-5">
          {/* Progress Bar & Question Step Pills */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-[#6F4FA8]">
                  Question {currentIndex + 1} of {totalQuestions}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] text-[11px] font-bold">
                  {currentQuestion.topic}
                </span>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#8B8295] tabular-nums">
                {answeredCount} / {totalQuestions} answered
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-[#F1EAE8] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#A78BCE] transition-all duration-300"
                style={{
                  width: `${Math.round(((currentIndex + 1) / totalQuestions) * 100)}%`,
                }}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {quizSession.questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const fb = instantFeedback[q.id];
                const isAnswered = selectedAnswers[q.id] !== undefined;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                      isCurrent
                        ? 'bg-[#A78BCE] border-[#A78BCE] text-white'
                        : fb
                        ? fb.isCorrect
                          ? 'bg-[#DCECD9] border-[#BBDAB6] text-[#2F5B37]'
                          : 'bg-[#FCEAE5] border-[#F0C1B6] text-[#8D3E32]'
                        : isAnswered
                        ? 'bg-[#F0E9FA] border-[#D8C9F2] text-[#6F4FA8]'
                        : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#7B7188]'
                    }`}
                  >
                    Q{idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Stem & Objective */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-[#8B8295]">
              Objective: {currentQuestion.objective}
            </p>
            <h3 className="font-display text-base sm:text-lg font-extrabold text-[#343047] leading-snug">
              {currentQuestion.question}
            </h3>
          </div>

          {/* Options */}
          {(() => {
            const chosenIdx = selectedAnswers[currentQuestion.id];
            const fb = instantFeedback[currentQuestion.id];
            const isChecked = Boolean(fb);
            const isCheckingThis = checkingQuestionId === currentQuestion.id;

            return (
              <>
                <div className="space-y-2.5">
                  {currentQuestion.options.map((opt, oIdx) => {
                    const isSelected = chosenIdx === oIdx;
                    const isRightOption = fb && oIdx === fb.correctAnswerIndex;

                    let optionClasses =
                      'bg-[#FFFCFA] border-[#EEE6E5] hover:border-[#C9B7E8] text-[#343047]';

                    if (isChecked && fb) {
                      if (isRightOption) {
                        optionClasses =
                          'bg-[#DCECD9]/75 border-[#95C79B] text-[#264A2D]';
                      } else if (isSelected && !isRightOption) {
                        optionClasses =
                          'bg-[#FCEAE5] border-[#E8A08E] text-[#753227]';
                      } else {
                        optionClasses =
                          'bg-[#FAF6F2] border-[#EEE6E5] text-[#8B8295]';
                      }
                    } else if (isSelected) {
                      optionClasses =
                        'bg-[#F0E9FA] border-[#A78BCE] text-[#4A3278]';
                    }

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={isChecked || isCheckingThis}
                        onClick={() =>
                          setSelectedAnswers((prev) => ({
                            ...prev,
                            [currentQuestion.id]: oIdx,
                          }))
                        }
                        className={`w-full text-left p-3.5 rounded-[16px] border text-xs sm:text-sm font-semibold transition-all flex items-center gap-3 ${optionClasses}`}
                      >
                        <span className="w-6 h-6 rounded-full bg-[#FFFCFA] border border-[#DFD4D2] flex items-center justify-center text-[11px] font-mono font-bold shrink-0">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {isChecked && isRightOption && (
                          <CheckCircle2 className="w-4 h-4 text-[#3C7347] shrink-0" />
                        )}
                        {isChecked && isSelected && !isRightOption && (
                          <XCircle className="w-4 h-4 text-[#B45343] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Instant Feedback Box */}
                {fb ? (
                  <div
                    className={`p-4 rounded-[18px] border space-y-2 text-xs leading-relaxed ${
                      fb.isCorrect
                        ? 'bg-[#DCECD9]/55 border-[#C2DFBC] text-[#264A2D]'
                        : 'bg-[#FFF1D6]/75 border-[#F2D59B] text-[#6B5220]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-extrabold">
                      {fb.isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-[#356640]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#B45343]" />
                      )}
                      <span>
                        {fb.isCorrect
                          ? 'Correct! Well done.'
                          : `Incorrect — Option ${String.fromCharCode(
                              65 + fb.correctAnswerIndex
                            )} is the right answer.`}
                      </span>
                    </div>
                    <p>{fb.answerExplanation}</p>
                    {!fb.isCorrect && fb.correctOptionExplanation && (
                      <p className="font-semibold">
                        Why Option {String.fromCharCode(65 + fb.correctAnswerIndex)} is correct:{' '}
                        {fb.correctOptionExplanation}
                      </p>
                    )}
                    <div className="p-3 rounded-[12px] bg-[#FFFCFA]/80 border border-[#EEE6E5] text-[#343047]">
                      <span className="font-extrabold">Underlying Concept: </span>
                      {fb.conceptExplanation}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      disabled={chosenIdx === undefined || isCheckingThis}
                      onClick={() => void handleCheckCurrentAnswer(currentQuestion.id)}
                      className="clay-button-soft px-4 py-2 text-xs font-extrabold text-[#6F4FA8] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isCheckingThis ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Check Answer for Instant Feedback</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Navigation Footer */}
                <div className="pt-3 border-t border-[#EEE6E5] flex items-center justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    className="clay-button-soft px-4 py-2 text-xs font-bold text-[#343047] inline-flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {currentIndex < totalQuestions - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))
                        }
                        className="clay-button-primary px-5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5"
                      >
                        <span>Next Question</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPhase('review_before_submit')}
                        className="clay-button-primary px-5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Review Answers Before Submitting</span>
                      </button>
                    )}

                    {currentIndex < totalQuestions - 1 && allQuestionsAnswered && (
                      <button
                        type="button"
                        onClick={() => setPhase('review_before_submit')}
                        className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Review &amp; Submit</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* PHASE 3: REVIEW ANSWERS BEFORE SUBMITTING */}
      {phase === 'review_before_submit' && quizSession && (
        <div className="pastel-card p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Review Your Answers
              </h3>
              <p className="text-xs text-[#6B6178]">
                Verify your selections across all {totalQuestions} questions before submitting for your official score.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhase('active')}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5 self-start"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Questions</span>
            </button>
          </div>

          <div className="space-y-3">
            {quizSession.questions.map((q, idx) => {
              const chosenIdx = selectedAnswers[q.id];
              const fb = instantFeedback[q.id];
              const hasAnswer = chosenIdx !== undefined;
              return (
                <div
                  key={q.id}
                  className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold text-[#6F4FA8]">
                        Q{idx + 1} · {q.topic}
                      </span>
                      {fb ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            fb.isCorrect
                              ? 'bg-[#DCECD9] text-[#2F5B37]'
                              : 'bg-[#FCEAE5] text-[#8D3E32]'
                          }`}
                        >
                          {fb.isCorrect ? 'Checked: Correct' : 'Checked: Incorrect'}
                        </span>
                      ) : hasAnswer ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] text-[10px] font-bold">
                          Answered (Locked on Submit)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[#FFF1D6] text-[#8E6521] text-[10px] font-bold">
                          Not Answered
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-[#343047]">{q.question}</p>
                    <p className="text-xs text-[#5E5468]">
                      Your answer:{' '}
                      <span className="font-bold text-[#343047]">
                        {hasAnswer
                          ? `${String.fromCharCode(65 + chosenIdx)}. ${q.options[chosenIdx]}`
                          : 'None selected yet'}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setPhase('active');
                    }}
                    className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0"
                  >
                    {fb ? 'View Feedback' : hasAnswer ? 'Edit Answer' : 'Answer Now'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#EEE6E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#6B6178]">
              {allQuestionsAnswered
                ? 'All questions answered. Ready to grade and save to Supabase!'
                : `Please answer all ${totalQuestions} questions (${answeredCount}/${totalQuestions} answered).`}
            </p>
            <button
              type="button"
              disabled={!allQuestionsAnswered || submitting}
              onClick={() => void handleSubmitQuiz()}
              className="clay-button-primary px-6 py-2.5 text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Grading &amp; Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit Knowledge Check</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* PHASE 4: SUBMITTED SCORE, KNOWLEDGE GAPS, ADAPTIVE RECOMMENDATION & FULL REVIEW */}
      {phase === 'submitted' && submittedAttempt && (() => {
        const imp = computeAttemptImprovement(
          submittedAttempt,
          sortedLessonAttempts.some((a) => a.id === submittedAttempt.id)
            ? sortedLessonAttempts
            : [submittedAttempt, ...sortedLessonAttempts]
        );
        const rec = submittedAttempt.recommendation;

        return (
          <div className="space-y-5">
            {/* Final Score + Adaptive Recommendation Card */}
            <div
              className="rounded-[24px] border border-[#E2D6F5] p-6 space-y-5"
              style={{
                background:
                  'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 55%, #FFF1D6 100%)',
                boxShadow: '0 12px 28px -12px rgba(154, 126, 200, 0.25)',
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-[#FFFCFA] border border-[#E2D6F5] text-xs font-extrabold text-[#6F4FA8]">
                      Attempt #{imp.attemptNumber} Saved
                    </span>
                    {imp.deltaPercent !== null && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold inline-flex items-center gap-1 ${
                          imp.deltaPercent > 0
                            ? 'bg-[#DCECD9] text-[#2F5B37]'
                            : imp.deltaPercent < 0
                            ? 'bg-[#FCEAE5] text-[#8D3E32]'
                            : 'bg-[#FFFCFA] text-[#5E5468]'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>
                          {imp.deltaPercent > 0
                            ? `+${imp.deltaPercent}% improvement`
                            : imp.deltaPercent < 0
                            ? `${imp.deltaPercent}% vs previous`
                            : 'Matched previous score'}
                        </span>
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-2xl font-extrabold text-[#343047]">
                    Final Score: {submittedAttempt.score}% (
                    {submittedAttempt.correctAnswers}/
                    {submittedAttempt.totalQuestions} correct)
                  </h3>
                  <p className="text-xs text-[#6B6178]">
                    Quiz completion is tracked separately from lesson completion — use “Mark Done” below whenever you are ready to complete this lesson.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleStartQuiz()}
                  disabled={starting}
                  className="clay-button-soft px-4 py-2.5 text-xs font-extrabold text-[#6F4FA8] inline-flex items-center gap-1.5 self-start shrink-0"
                >
                  {starting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Retake Knowledge Check</span>
                </button>
              </div>

              {/* Adaptive Learning Recommendation */}
              <div className="p-5 rounded-[20px] bg-[#FFFCFA] border border-[#E2D6F5] space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3">
                    <ClayIconBadge
                      variant={
                        rec.action === 'next_lesson'
                          ? 'mint'
                          : rec.action === 'additional_practice'
                          ? 'yellow'
                          : 'peach'
                      }
                      size="sm"
                    >
                      {rec.action === 'next_lesson' ? (
                        <ArrowRight className="w-4 h-4" />
                      ) : rec.action === 'additional_practice' ? (
                        <Wrench className="w-4 h-4" />
                      ) : (
                        <BookOpen className="w-4 h-4" />
                      )}
                    </ClayIconBadge>
                    <div className="space-y-1">
                      <p className="text-[11px] font-extrabold text-[#6F4FA8]">
                        Adaptive Next Learning Activity
                      </p>
                      <h4 className="font-display text-base font-extrabold text-[#343047]">
                        {rec.title}
                      </h4>
                      <p className="text-xs text-[#5E5468] leading-relaxed">
                        {rec.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rec.action === 'next_lesson' && hasNextLesson && (
                      <button
                        type="button"
                        onClick={() =>
                          onGoToNextLesson(rec.targetStageId, rec.targetLessonId)
                        }
                        className="clay-button-primary px-4 py-2 text-xs font-extrabold inline-flex items-center gap-1.5"
                      >
                        <span>Go to Next Lesson</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {rec.action === 'additional_practice' && (
                      <>
                        <button
                          type="button"
                          onClick={onFocusPractice}
                          className="clay-button-primary px-4 py-2 text-xs font-extrabold inline-flex items-center gap-1.5"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Do Guided Practice</span>
                        </button>
                        <button
                          type="button"
                          onClick={onOpenResources}
                          className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8]"
                        >
                          Explore Practice Resources
                        </button>
                      </>
                    )}
                    {rec.action === 'review_fundamentals' && (
                      <>
                        <button
                          type="button"
                          onClick={onFocusLearn}
                          className="clay-button-primary px-4 py-2 text-xs font-extrabold inline-flex items-center gap-1.5"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Review Lesson Guide</span>
                        </button>
                        <button
                          type="button"
                          onClick={onOpenResources}
                          className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8]"
                        >
                          Watch Lesson Videos
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Topic Breakdown & Knowledge Gap Detection */}
              <div className="p-5 rounded-[20px] bg-[#FFFCFA] border border-[#EEE6E5] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-display text-sm font-extrabold text-[#343047]">
                    Topic Breakdown &amp; Knowledge Gaps
                  </h4>
                  <span className="text-[11px] text-[#8B8295]">
                    Saved to improve future personalized lessons
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {submittedAttempt.topicBreakdown.map((item) => (
                    <div
                      key={item.topic}
                      className="p-3 rounded-[14px] bg-[#FAF6F2] border border-[#EEE6E5] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-[#343047] truncate">
                          {item.topic}
                        </p>
                        <p className="text-[11px] text-[#8B8295] font-mono">
                          {item.correctAnswers}/{item.totalQuestions} correct (
                          {item.accuracyPercent}%)
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold shrink-0 ${proficiencyBadgeClass(
                          item.proficiency
                        )}`}
                      >
                        {item.proficiency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Review All Answers Toggle & List */}
            <div className="pastel-card p-6 space-y-4">
              <button
                type="button"
                onClick={() => setShowAllAnswersReview((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div>
                  <h4 className="font-display text-base font-extrabold text-[#343047]">
                    Review All Answers ({submittedAttempt.answers.length} Questions)
                  </h4>
                  <p className="text-xs text-[#8B8295]">
                    Inspect why each answer was correct or incorrect and review the underlying concepts
                  </p>
                </div>
                {showAllAnswersReview ? (
                  <ChevronUp className="w-4 h-4 text-[#6F4FA8]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#6F4FA8]" />
                )}
              </button>

              {showAllAnswersReview && (
                <div className="space-y-3 pt-2 border-t border-[#EEE6E5]">
                  {submittedAttempt.answers.map((ans, idx) => (
                    <div
                      key={ans.questionId}
                      className={`p-4 rounded-[18px] border space-y-2.5 text-xs ${
                        ans.isCorrect
                          ? 'bg-[#DCECD9]/30 border-[#C2DFBC]'
                          : 'bg-[#FCEAE5]/45 border-[#F2C2BA]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-extrabold text-[#6F4FA8]">
                            Q{idx + 1} · {ans.topic}
                          </span>
                          <p className="font-bold text-[#343047] text-sm">
                            {ans.question}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${
                            ans.isCorrect
                              ? 'bg-[#DCECD9] text-[#2F5B37]'
                              : 'bg-[#FCEAE5] text-[#8D3E32]'
                          }`}
                        >
                          {ans.isCorrect ? 'Correct' : 'Needs Review'}
                        </span>
                      </div>

                      <div className="space-y-1 text-[#4E455C]">
                        <p>
                          <span className="font-bold">Your answer: </span>
                          {String.fromCharCode(65 + ans.selectedOptionIndex)}.{' '}
                          {ans.options[ans.selectedOptionIndex] ?? '—'}
                        </p>
                        {!ans.isCorrect && (
                          <p className="text-[#2F5B37]">
                            <span className="font-bold">Correct answer: </span>
                            {String.fromCharCode(65 + ans.correctAnswerIndex)}.{' '}
                            {ans.options[ans.correctAnswerIndex] ?? '—'}
                          </p>
                        )}
                      </div>

                      <p className="text-[#343047] leading-relaxed">
                        {ans.answerExplanation}
                      </p>
                      {!ans.isCorrect && ans.correctOptionExplanation && (
                        <p className="text-[#2F5B37] leading-relaxed">
                          <span className="font-bold">Why the right answer works: </span>
                          {ans.correctOptionExplanation}
                        </p>
                      )}
                      <div className="p-3 rounded-[12px] bg-[#FFFCFA] border border-[#EEE6E5] text-[#4E455C] flex items-start gap-2">
                        <Lightbulb className="w-3.5 h-3.5 text-[#A37327] shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[#343047]">Concept: </strong>
                          {ans.conceptExplanation}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
