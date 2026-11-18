import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Check,
  AlertCircle,
  Loader2,
  History,
  RefreshCw,
  Calendar,
  Eye,
  Code2,
  Layers,
  Database,
  BrainCircuit,
  Briefcase,
  Palette,
  Shield,
  MessageSquare,
  BarChart2,
  BookOpen,
} from 'lucide-react';
import {
  AssessmentQuestion,
  AssessmentResult,
  AssessmentAttemptRecord,
  AppView,
  UserProfile,
} from '../../types';
import { ASSESSMENT_QUESTIONS_BANK } from '../../data/mockData';
import {
  ASSESSMENT_CATALOG,
  AssessmentSubjectId,
  getRecommendedAssessmentsForUser,
} from '../../lib/learningRecommendations';
import { getSupabaseClient } from '../../lib/supabase';
import {
  saveAssessmentAttempt,
  formatAssessmentDate,
  AssessmentDbError,
} from '../../lib/assessmentAttempts';
import {
  ClayIconBadge,
  BooksTrophy3D,
  SmilingCloudMascot3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';
import { createBrowserActiveStudyTimer } from '../../lib/activeStudyTracker';

interface AssessmentViewProps {
  user?: UserProfile;
  isAuthenticated?: boolean;
  attempts?: AssessmentAttemptRecord[];
  attemptsLoading?: boolean;
  attemptsError?: string;
  onAttemptSaved?: (attempt: AssessmentAttemptRecord, durationSeconds?: number) => void;
  onRefreshAttempts?: () => void;
  onNavigate: (view: AppView) => void;
  onOpenAssistantPrompt: (prompt: string) => void;
  onUpdateScore?: (score: number) => void;
}

const SUBJECT_VISUALS: Record<
  AssessmentSubjectId,
  { variant: ClayColorVariant; tint: string; icon: React.ReactNode }
> = {
  python: {
    variant: 'lavender',
    tint: 'bg-[#F0E9FA]/75 border-[#D6C5F0]',
    icon: <Code2 className="w-5 h-5" />,
  },
  datastructures: {
    variant: 'peach',
    tint: 'bg-[#FCEAE5]/80 border-[#F3CCC1]',
    icon: <Layers className="w-5 h-5" />,
  },
  sql: {
    variant: 'mint',
    tint: 'bg-[#DCECD9]/70 border-[#BEDBB9]',
    icon: <Database className="w-5 h-5" />,
  },
  ai_data: {
    variant: 'peach',
    tint: 'bg-[#FCEAE5]/80 border-[#F3CCC1]',
    icon: <BrainCircuit className="w-5 h-5" />,
  },
  business: {
    variant: 'yellow',
    tint: 'bg-[#FFF1D6]/80 border-[#ECD094]',
    icon: <Briefcase className="w-5 h-5" />,
  },
  design: {
    variant: 'pink',
    tint: 'bg-[#FDEBF1]/80 border-[#F3C0D1]',
    icon: <Palette className="w-5 h-5" />,
  },
  cybersecurity: {
    variant: 'mint',
    tint: 'bg-[#DCECD9]/70 border-[#BEDBB9]',
    icon: <Shield className="w-5 h-5" />,
  },
  communication: {
    variant: 'lavender',
    tint: 'bg-[#F0E9FA]/75 border-[#D6C5F0]',
    icon: <MessageSquare className="w-5 h-5" />,
  },
  finance: {
    variant: 'yellow',
    tint: 'bg-[#FFF1D6]/80 border-[#ECD094]',
    icon: <BarChart2 className="w-5 h-5" />,
  },
  languages: {
    variant: 'peach',
    tint: 'bg-[#FCEAE5]/80 border-[#F3CCC1]',
    icon: <BookOpen className="w-5 h-5" />,
  },
};

export const AssessmentView: React.FC<AssessmentViewProps> = ({
  user,
  isAuthenticated = false,
  attempts = [],
  attemptsLoading = false,
  attemptsError = '',
  onAttemptSaved,
  onRefreshAttempts,
  onNavigate,
  onOpenAssistantPrompt,
  onUpdateScore,
}) => {
  const { recommended, allOrdered } = getRecommendedAssessmentsForUser(user);
  const topRecommendedId: AssessmentSubjectId = recommended[0]?.id ?? 'python';

  const [selectedSubject, setSelectedSubject] = useState<AssessmentSubjectId>(topRecommendedId);
  const [hasPickedSubject, setHasPickedSubject] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>(
    user?.knowledgeLevel || 'Intermediate'
  );
  const [questionCount, setQuestionCount] = useState<number>(5);

  const [quizState, setQuizState] = useState<'setup' | 'active' | 'results' | 'review'>('setup');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [activeQuestions, setActiveQuestions] = useState<AssessmentQuestion[]>([]);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [reviewAttempt, setReviewAttempt] = useState<AssessmentAttemptRecord | null>(null);

  // Single-attempt database persistence state & guards
  const [activeAttemptKey, setActiveAttemptKey] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'demo'>('idle');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string>('');
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState<boolean>(false);

  const isPersistingRef = useRef<boolean>(false);
  const savedAttemptKeysRef = useRef<Set<string>>(new Set());
  const activeQuizSecondsRef = useRef<number>(0);

  useEffect(() => {
    if (quizState !== 'active') return;
    const timer = createBrowserActiveStudyTimer({
      onSecondTick: (seconds) => {
        activeQuizSecondsRef.current = seconds;
      },
    });
    return () => {
      timer.destroy();
    };
  }, [quizState, activeAttemptKey]);

  useEffect(() => {
    if (!hasPickedSubject && quizState === 'setup') {
      setSelectedSubject(topRecommendedId);
    }
  }, [topRecommendedId, hasPickedSubject, quizState]);

  const selectedPool = ASSESSMENT_QUESTIONS_BANK[selectedSubject] || ASSESSMENT_QUESTIONS_BANK.python;
  const countOptions = Array.from(
    new Set([
      Math.min(3, selectedPool.length),
      Math.min(5, selectedPool.length),
      Math.min(10, selectedPool.length),
    ])
  ).filter((n) => n > 0);
  const effectiveQuestionCount = countOptions.includes(questionCount)
    ? questionCount
    : countOptions[countOptions.length - 1] || selectedPool.length;

  const startQuiz = () => {
    const pool = ASSESSMENT_QUESTIONS_BANK[selectedSubject] || ASSESSMENT_QUESTIONS_BANK.python;
    const questions = pool.slice(0, effectiveQuestionCount);
    const nextAttemptKey = `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setActiveQuestions(questions);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setResult(null);
    setReviewAttempt(null);
    setActiveAttemptKey(nextAttemptKey);
    setSaveStatus('idle');
    setSaveErrorMsg('');
    setIsSubmittingQuiz(false);
    isPersistingRef.current = false;
    activeQuizSecondsRef.current = 0;
    setQuizState('active');
  };

  const handleSelectOption = (optionIndex: number) => {
    setUserAnswers({
      ...userAnswers,
      [currentQuestionIndex]: optionIndex,
    });
  };

  const persistAttemptToSupabase = async (
    calculated: AssessmentResult,
    attemptKey: string
  ) => {
    if (!isAuthenticated) {
      setSaveStatus('demo');
      return;
    }

    if (!attemptKey || savedAttemptKeysRef.current.has(attemptKey) || isPersistingRef.current) {
      return;
    }

    isPersistingRef.current = true;
    setIsSubmittingQuiz(true);
    setSaveStatus('saving');
    setSaveErrorMsg('');

    try {
      const supabase = await getSupabaseClient();
      const saved = await saveAssessmentAttempt(supabase, {
        subject: calculated.subject,
        difficulty: calculated.difficulty,
        totalQuestions: calculated.totalQuestions,
        correctAnswers: calculated.correctAnswers,
        strengths: calculated.strengths,
        knowledgeGaps: calculated.areasToImprove,
      });

      savedAttemptKeysRef.current.add(attemptKey);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              id: saved.id,
              percentageScore: saved.scorePercent,
              date: formatAssessmentDate(saved.createdAt),
            }
          : prev
      );
      setSaveStatus('saved');
      const elapsedSeconds = Math.max(
        1,
        Math.min(7200, Math.round(activeQuizSecondsRef.current))
      );
      onAttemptSaved?.(saved, elapsedSeconds);
      onUpdateScore?.(saved.scorePercent);
    } catch (err) {
      setSaveStatus('error');
      if (err instanceof AssessmentDbError) {
        setSaveErrorMsg(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else if (err instanceof Error) {
        setSaveErrorMsg(err.message);
      } else {
        setSaveErrorMsg('Failed to save assessment attempt to Supabase. Please retry.');
      }
    } finally {
      isPersistingRef.current = false;
      setIsSubmittingQuiz(false);
    }
  };

  const handleSubmitQuiz = () => {
    if (quizState !== 'active' || isPersistingRef.current || isSubmittingQuiz) {
      return;
    }

    let correctCount = 0;
    const topicStats = new Map<string, { correct: number; total: number }>();

    activeQuestions.forEach((q, idx) => {
      const topic = q.topic?.trim() || q.subject;
      const stats = topicStats.get(topic) ?? { correct: 0, total: 0 };
      stats.total += 1;

      if (userAnswers[idx] === q.correctAnswerIndex) {
        correctCount += 1;
        stats.correct += 1;
      }

      topicStats.set(topic, stats);
    });

    const strengths: string[] = [];
    const knowledgeGaps: string[] = [];

    topicStats.forEach((stats, topic) => {
      if (stats.correct === stats.total) {
        strengths.push(topic);
      } else {
        knowledgeGaps.push(topic);
      }
    });

    const incorrectCount = activeQuestions.length - correctCount;
    const percentage =
      activeQuestions.length > 0
        ? Math.round((correctCount / activeQuestions.length) * 100)
        : 0;
    const subjectMeta = ASSESSMENT_CATALOG.find((item) => item.id === selectedSubject);

    const calculatedResult: AssessmentResult = {
      subject: subjectMeta?.label ?? 'Skill Assessment',
      difficulty: selectedDifficulty,
      totalQuestions: activeQuestions.length,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      percentageScore: percentage,
      strengths,
      areasToImprove: knowledgeGaps,
      date: 'Today',
    };

    setResult(calculatedResult);
    setQuizState('results');

    void persistAttemptToSupabase(calculatedResult, activeAttemptKey);
  };

  const handleRetrySave = () => {
    if (!result || !activeAttemptKey) return;
    void persistAttemptToSupabase(result, activeAttemptKey);
  };

  const handleOpenPastAttemptReview = (attempt: AssessmentAttemptRecord) => {
    setReviewAttempt(attempt);
    setQuizState('review');
  };

  const currentQ = activeQuestions[currentQuestionIndex];

  const progressPercentage =
    activeQuestions.length > 0
      ? Math.round(((currentQuestionIndex + 1) / activeQuestions.length) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {/* SCREEN 1: SETUP + PAST ATTEMPT HISTORY */}
      {quizState === 'setup' && (
        <div className="space-y-6">
          {/* Friendly Intro Panel */}
          <div
            className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6"
            style={{
              background: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 60%, #FCEAE5 100%)',
              boxShadow: '0 12px 30px -12px rgba(154, 126, 200, 0.25)',
            }}
          >
            <div className="space-y-2.5 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#6F4FA8] bg-[#FFFCFA] px-3 py-1.5 rounded-full border border-[#E2D6F5] shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-[#9B7ACE]" />
                <span>Skill Diagnostic &amp; Calibration</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
                Interactive Skill Assessment
              </h1>
              <p className="text-xs sm:text-sm text-[#6B6178] leading-relaxed max-w-xl">
                {recommended.length > 0
                  ? `Recommended assessments are prioritized based on your learning interests${
                      user?.careerGoal ? ` and goal (${user.careerGoal})` : ''
                    }.`
                  : 'Check your current understanding across technical, business, creative, and academic skills.'}
              </p>
            </div>
            <BooksTrophy3D className="w-28 h-24 shrink-0" />
          </div>

          {!isAuthenticated && (
            <div className="p-4 rounded-[20px] bg-[#FFF1D6]/75 border border-[#F3DFB4] text-[#6B5022] text-xs font-semibold flex items-center justify-between gap-3 flex-wrap">
              <span>
                Practice Mode: You can take any skill assessment freely. Sign in to save your results and track assessment history.
              </span>
            </div>
          )}

          {/* Setup Card */}
          <div className="pastel-card p-6 sm:p-8 space-y-6">
            {/* Subject Selection */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8B8295]">
                  1. Choose Subject
                </label>
                {recommended.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#6F4FA8] bg-[#F0E9FA] px-3 py-1 rounded-full border border-[#E2D6F5]">
                    <Sparkles className="w-3 h-3 text-[#9B7ACE]" />
                    <span>Recommended for your interests</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {allOrdered.map((s) => {
                  const isSelected = selectedSubject === s.id;
                  const visual = SUBJECT_VISUALS[s.id];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setHasPickedSubject(true);
                        setSelectedSubject(s.id);
                      }}
                      className={`p-4 rounded-[22px] border text-left transition-all flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? `${visual.tint} ring-2 ring-[#A78BCE]/45 shadow-sm`
                          : 'bg-[#FAF6F2]/70 border-[#EEE6E5] hover:bg-[#FFFCFA] hover:border-[#DCD0EF]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <ClayIconBadge variant={visual.variant} size="md">
                          {visual.icon}
                        </ClayIconBadge>
                        {s.isRecommended && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-[10px] font-extrabold">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-display text-sm font-extrabold text-[#343047]">
                          {s.label}
                        </p>
                        <p className="text-xs text-[#7B7188] mt-1 leading-snug">{s.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#8B8295] mb-3">
                2. Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['Beginner', 'Intermediate', 'Advanced'] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`p-3.5 rounded-[16px] border text-center text-xs font-bold transition-all ${
                      selectedDifficulty === diff
                        ? 'bg-[#A78BCE] border-[#9676C2] text-white shadow-[0_6px_16px_-4px_rgba(167,139,206,0.5)]'
                        : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#5D5470] hover:bg-[#F0E9FA]/60'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Count */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#8B8295] mb-3">
                3. Number of Questions
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {countOptions.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setQuestionCount(cnt)}
                    className={`p-3.5 rounded-[16px] border text-center font-mono tabular-nums text-xs transition-all ${
                      effectiveQuestionCount === cnt
                        ? 'bg-[#FFF1D6] border-[#EED297] text-[#6B4E1A] font-extrabold shadow-xs'
                        : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#5D5470] hover:bg-[#FFF1D6]/40'
                    }`}
                  >
                    {cnt} Questions (~{cnt * 2} min)
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-[#8B8295]">
                Immediate feedback &amp; topic breakdown upon completion
              </span>

              <button
                onClick={startQuiz}
                className="clay-button-primary py-3 px-6 text-xs font-bold flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <span>Start Assessment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* SAVED ASSESSMENT HISTORY (Authenticated Students) */}
          {isAuthenticated && (
            <div className="pastel-card p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <ClayIconBadge variant="lavender" size="sm">
                    <History className="w-4 h-4" />
                  </ClayIconBadge>
                  <div>
                    <h2 className="font-display text-base font-extrabold text-[#343047]">
                      Your Previous Assessment Attempts
                    </h2>
                    <p className="text-xs text-[#8B8295]">
                      Review your saved scores, strengths, and topics to strengthen next.
                    </p>
                  </div>
                </div>

                {onRefreshAttempts && (
                  <button
                    type="button"
                    onClick={onRefreshAttempts}
                    disabled={attemptsLoading}
                    className="clay-button-soft px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${attemptsLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                )}
              </div>

              {attemptsError && (
                <div className="p-4 rounded-[18px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold flex items-center justify-between gap-3 flex-wrap">
                  <span>{attemptsError}</span>
                  {onRefreshAttempts && (
                    <button
                      type="button"
                      onClick={onRefreshAttempts}
                      className="px-3 py-1 rounded-[10px] bg-[#FFFCFA] border border-[#F3C5BA] text-[#8D3E32] font-bold hover:bg-[#FAF6F2]"
                    >
                      Retry Load
                    </button>
                  )}
                </div>
              )}

              {attemptsLoading && attempts.length === 0 ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs font-bold text-[#8E6EC8]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading your assessment history...</span>
                </div>
              ) : attempts.length === 0 && !attemptsError ? (
                <div className="p-6 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-1.5">
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    No saved assessments yet
                  </p>
                  <p className="text-xs text-[#8B8295]">
                    Complete your first diagnostic quiz above to track your scores and knowledge gaps here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="p-4 rounded-[20px] bg-[#FAF6F2]/80 border border-[#EEE6E5] hover:border-[#D5C6EC] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-sm font-extrabold text-[#343047]">
                            {attempt.subject}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#F0E9FA] text-[#6F4FA8] text-[10px] font-bold">
                            {attempt.difficulty}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#8B8295] font-medium">
                            <Calendar className="w-3 h-3" />
                            {formatAssessmentDate(attempt.createdAt)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {attempt.strengths.map((str) => (
                            <span
                              key={`s-${attempt.id}-${str}`}
                              className="px-2.5 py-0.5 rounded-full bg-[#DCECD9]/80 border border-[#C2DFBC] text-[#2D4D33] text-[10px] font-bold"
                            >
                              Strength: {str}
                            </span>
                          ))}
                          {attempt.knowledgeGaps.map((gap) => (
                            <span
                              key={`g-${attempt.id}-${gap}`}
                              className="px-2.5 py-0.5 rounded-full bg-[#FFF1D6]/85 border border-[#F2DCAD] text-[#7A5720] text-[10px] font-bold"
                            >
                              Gap: {gap}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <div className="text-right">
                          <span className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                            {attempt.scorePercent}%
                          </span>
                          <p className="text-[10px] font-mono text-[#8B8295] tabular-nums">
                            {attempt.correctAnswers}/{attempt.totalQuestions} correct
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenPastAttemptReview(attempt)}
                          className="clay-button-soft px-3.5 py-2 text-xs font-bold flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#8E6EC8]" />
                          <span>Review</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SCREEN 2: ACTIVE QUIZ */}
      {quizState === 'active' && currentQ && (
        <div className="space-y-5">
          {/* Pastel Progress Bar & Question Dots */}
          <div className="pastel-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-[#8E6EC8]">
                  {currentQ.subject} · {currentQ.topic}
                </span>
                <p className="font-display text-base font-extrabold text-[#343047]">
                  Question {currentQuestionIndex + 1} of {activeQuestions.length}
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {activeQuestions.map((_, idx) => {
                  const answered = userAnswers[idx] !== undefined;
                  const isCurrent = idx === currentQuestionIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`w-8 h-8 rounded-[11px] text-xs font-mono font-bold transition-all ${
                        isCurrent
                          ? 'bg-[#A78BCE] text-white shadow-sm scale-105'
                          : answered
                          ? 'bg-[#DCECD9] text-[#325E3B] border border-[#BEDBB9]'
                          : 'bg-[#FAF6F2] text-[#8B8295] border border-[#EEE6E5] hover:bg-[#F0E9FA]'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pastel Linear Progress Bar */}
            <div className="w-full bg-[#F1EAE8] h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#C9B7E8] to-[#A78BCE] h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Question Card */}
          <div className="pastel-card p-6 sm:p-8 space-y-6">
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#343047] leading-snug">
              {currentQ.question}
            </h2>

            {currentQ.codeSnippet && (
              <div className="p-4 rounded-[18px] bg-[#343047] text-[#F7F3FB] text-xs font-mono overflow-x-auto leading-relaxed shadow-inner">
                <pre>{currentQ.codeSnippet}</pre>
              </div>
            )}

            <div className="space-y-3">
              {currentQ.options.map((optionText, optIdx) => {
                const isSelected = userAnswers[currentQuestionIndex] === optIdx;
                const optionLetters = ['A', 'B', 'C', 'D'];
                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelectOption(optIdx)}
                    className={`w-full p-4 rounded-[18px] border text-left transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? 'bg-[#F0E9FA] border-[#A78BCE] ring-2 ring-[#C9B7E8]/45 text-[#343047] shadow-xs'
                        : 'bg-[#FAF6F2]/75 border-[#EEE6E5] hover:bg-[#FFFCFA] hover:border-[#D5C6EC] text-[#343047]'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-[10px] font-mono text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'clay-squircle-lavender text-white'
                          : 'bg-[#FFFCFA] border border-[#EEE6E5] text-[#8B8295]'
                      }`}
                    >
                      {optionLetters[optIdx]}
                    </span>
                    <span className="text-xs sm:text-sm font-medium pt-0.5 leading-relaxed">
                      {optionText}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-5 border-t border-[#EEE6E5] flex items-center justify-between">
              <button
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                className="clay-button-soft px-4 py-2.5 text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              {currentQuestionIndex < activeQuestions.length - 1 ? (
                <button
                  onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                  className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Next Question</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitQuiz}
                  disabled={Object.keys(userAnswers).length === 0 || isSubmittingQuiz}
                  className="px-6 py-2.5 rounded-[16px] clay-squircle-mint text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingQuiz ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Submit Assessment</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 3: RESULTS & SUPABASE SAVE CONFIRMATION */}
      {quizState === 'results' && result && (
        <div className="space-y-6">
          {/* Persistence Status Banner */}
          {saveStatus === 'saving' && (
            <div className="p-4 rounded-[20px] bg-[#F0E9FA] border border-[#D6C5F0] text-[#5D438E] text-xs font-bold flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-[#8E6EC8]" />
              <span>Saving your assessment attempt to Supabase...</span>
            </div>
          )}

          {saveStatus === 'saved' && (
            <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#3B6B46] shrink-0" />
                <span>Assessment result saved to your Supabase history!</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="text-xs font-extrabold text-[#2D4D33] underline"
              >
                View in My Progress
              </button>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="p-4 rounded-[20px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-[#C25E4D] shrink-0" />
                <span className="break-words">{saveErrorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleRetrySave}
                disabled={isSubmittingQuiz}
                className="clay-button-primary px-4 py-1.5 text-xs font-bold shrink-0 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Save</span>
              </button>
            </div>
          )}

          {saveStatus === 'demo' && (
            <div className="p-4 rounded-[20px] bg-[#FFF1D6]/80 border border-[#F3DFB4] text-[#6B5022] text-xs font-semibold">
              Practice Mode: Your answers were scored locally. Sign in to save assessment attempts to your account history.
            </div>
          )}

          <div className="pastel-card p-6 sm:p-8 space-y-6">
            {/* Achievement Header */}
            <div className="rounded-[22px] bg-gradient-to-r from-[#FFF1D6] via-[#FCEAE5] to-[#F0E9FA] p-6 border border-[#EEE6E5] flex flex-col sm:flex-row items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <SmilingCloudMascot3D className="w-24 h-16 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#8E6EC8] uppercase tracking-wider">
                    Assessment Complete!
                  </span>
                  <h2 className="font-display text-2xl font-extrabold text-[#343047]">
                    Diagnostic Performance Report
                  </h2>
                  <p className="text-xs text-[#6B6178] mt-0.5">
                    {result.subject} · {result.difficulty} · {result.date}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => setQuizState('setup')}
                  className="clay-button-soft px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>
                <button
                  onClick={() => onNavigate('progress')}
                  className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  <span>My Progress</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 4 Pastel Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-[20px] bg-[#F0E9FA] border border-[#E2D6F5] text-center">
                <p className="text-xs font-bold text-[#6F4FA8]">Score</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {result.percentageScore}%
                </p>
              </div>
              <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#C2DFBC] text-center">
                <p className="text-xs font-bold text-[#3C7347]">Correct</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {result.correctAnswers}
                </p>
              </div>
              <div className="p-4 rounded-[20px] bg-[#FCEAE5] border border-[#F5D3CA] text-center">
                <p className="text-xs font-bold text-[#9C5042]">Incorrect</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {result.incorrectAnswers}
                </p>
              </div>
              <div className="p-4 rounded-[20px] bg-[#FFF1D6] border border-[#F4DFB6] text-center">
                <p className="text-xs font-bold text-[#8E6521]">Total</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {result.totalQuestions}
                </p>
              </div>
            </div>

            {/* Strengths & Knowledge Gaps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-[20px] bg-[#DCECD9]/55 border border-[#C2DFBC] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#325E3B]">
                  <CheckCircle2 className="w-4 h-4 text-[#4B8B59]" />
                  <span>Demonstrated Strengths</span>
                </div>
                {result.strengths.length > 0 ? (
                  <div className="space-y-1.5">
                    {result.strengths.map((str, i) => (
                      <p key={i} className="text-xs font-semibold text-[#343047] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#68AC77]" />
                        {str}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#456D4C]">
                    No tested topics mastered yet in this attempt. Review the explanations below to build momentum!
                  </p>
                )}
              </div>

              <div className="p-5 rounded-[20px] bg-[#FFF1D6]/70 border border-[#F2DCAD] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#855C1C]">
                  <AlertCircle className="w-4 h-4 text-[#D39331]" />
                  <span>Knowledge Gaps to Focus Next</span>
                </div>
                {result.areasToImprove.length > 0 ? (
                  <div className="space-y-1.5">
                    {result.areasToImprove.map((imp, i) => (
                      <p key={i} className="text-xs font-semibold text-[#343047] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#DF9F3E]" />
                        {imp}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#6B5022]">
                    No knowledge gaps found across all tested topics! Try a higher difficulty level next.
                  </p>
                )}
              </div>
            </div>

            {/* Question Breakdown */}
            <div className="pt-4 border-t border-[#EEE6E5] space-y-3">
              <h3 className="font-display text-base font-extrabold text-[#343047]">
                Question Breakdown &amp; Explanations
              </h3>
              <div className="space-y-3">
                {activeQuestions.map((q, idx) => {
                  const userAns = userAnswers[idx];
                  const isCorrect = userAns === q.correctAnswerIndex;
                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-[18px] border text-xs space-y-2 ${
                        isCorrect
                          ? 'bg-[#DCECD9]/35 border-[#C6E0C1]'
                          : 'bg-[#FCEAE5]/45 border-[#F5D3CA]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#343047]">
                          Question {idx + 1}: {q.topic}
                        </span>
                        <span
                          className={`font-bold flex items-center gap-1 ${
                            isCorrect ? 'text-[#3B6B46]' : 'text-[#A65345]'
                          }`}
                        >
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> Needs Review
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-[#343047] font-medium">{q.question}</p>
                      <div className="p-3 rounded-[14px] bg-[#FFFCFA] border border-[#EEE6E5] text-[#6B6178] leading-relaxed">
                        <span className="font-bold text-[#343047]">Explanation: </span>
                        {q.explanation}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Help Bar */}
            <div className="p-4 rounded-[20px] bg-[#F0E9FA] border border-[#E2D6F5] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ClayIconBadge variant="lavender" size="sm">
                  <Sparkles className="w-4 h-4" />
                </ClayIconBadge>
                <p className="text-xs font-bold text-[#343047]">
                  Want your AI Study Companion to walk through any tricky questions?
                </p>
              </div>
              <button
                onClick={() =>
                  onOpenAssistantPrompt(
                    result.areasToImprove.length > 0
                      ? `Help me understand my knowledge gaps from the ${result.subject} assessment: ${result.areasToImprove.join(', ')}`
                      : `Help me go deeper on ${result.subject} beyond ${result.strengths.join(', ')}`
                  )
                }
                className="clay-button-primary px-4 py-2 text-xs font-bold shrink-0"
              >
                Ask AI Companion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 4: SAVED ATTEMPT REVIEW */}
      {quizState === 'review' && reviewAttempt && (
        <div className="space-y-6">
          <div className="pastel-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setReviewAttempt(null);
                  setQuizState('setup');
                }}
                className="clay-button-soft px-4 py-2 text-xs font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Assessments</span>
              </button>
              <span className="text-xs font-bold text-[#8B8295]">
                Completed {formatAssessmentDate(reviewAttempt.createdAt)}
              </span>
            </div>

            <div className="rounded-[22px] bg-gradient-to-r from-[#FFF1D6] via-[#FCEAE5] to-[#F0E9FA] p-6 border border-[#EEE6E5] flex flex-col sm:flex-row items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <SmilingCloudMascot3D className="w-24 h-16 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#8E6EC8] uppercase tracking-wider">
                    Saved Attempt Review
                  </span>
                  <h2 className="font-display text-2xl font-extrabold text-[#343047]">
                    {reviewAttempt.subject}
                  </h2>
                  <p className="text-xs text-[#6B6178] mt-0.5">
                    Difficulty: {reviewAttempt.difficulty} · {formatAssessmentDate(reviewAttempt.createdAt)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQuizState('setup')}
                className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Take New Assessment</span>
              </button>
            </div>

            {/* 4 Pastel Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-[20px] bg-[#F0E9FA] border border-[#E2D6F5] text-center">
                <p className="text-xs font-bold text-[#6F4FA8]">Score</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {reviewAttempt.scorePercent}%
                </p>
              </div>
              <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#C2DFBC] text-center">
                <p className="text-xs font-bold text-[#3C7347]">Correct</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {reviewAttempt.correctAnswers}
                </p>
              </div>
              <div className="p-4 rounded-[20px] bg-[#FCEAE5] border border-[#F5D3CA] text-center">
                <p className="text-xs font-bold text-[#9C5042]">Incorrect</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {Math.max(0, reviewAttempt.totalQuestions - reviewAttempt.correctAnswers)}
                </p>
              </div>
              <div className="p-4 rounded-[20px] bg-[#FFF1D6] border border-[#F4DFB6] text-center">
                <p className="text-xs font-bold text-[#8E6521]">Total</p>
                <p className="font-display text-3xl font-extrabold text-[#343047] tabular-nums mt-1">
                  {reviewAttempt.totalQuestions}
                </p>
              </div>
            </div>

            {/* Strengths & Knowledge Gaps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-[20px] bg-[#DCECD9]/55 border border-[#C2DFBC] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#325E3B]">
                  <CheckCircle2 className="w-4 h-4 text-[#4B8B59]" />
                  <span>Demonstrated Strengths</span>
                </div>
                {reviewAttempt.strengths.length > 0 ? (
                  <div className="space-y-1.5">
                    {reviewAttempt.strengths.map((str, i) => (
                      <p key={i} className="text-xs font-semibold text-[#343047] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#68AC77]" />
                        {str}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#456D4C]">
                    No tested topics mastered in this attempt.
                  </p>
                )}
              </div>

              <div className="p-5 rounded-[20px] bg-[#FFF1D6]/70 border border-[#F2DCAD] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#855C1C]">
                  <AlertCircle className="w-4 h-4 text-[#D39331]" />
                  <span>Knowledge Gaps</span>
                </div>
                {reviewAttempt.knowledgeGaps.length > 0 ? (
                  <div className="space-y-1.5">
                    {reviewAttempt.knowledgeGaps.map((gap, i) => (
                      <p key={i} className="text-xs font-semibold text-[#343047] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#DF9F3E]" />
                        {gap}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#6B5022]">
                    No knowledge gaps recorded in this attempt!
                  </p>
                )}
              </div>
            </div>

            {reviewAttempt.knowledgeGaps.length > 0 && (
              <div className="p-4 rounded-[20px] bg-[#F0E9FA] border border-[#E2D6F5] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ClayIconBadge variant="lavender" size="sm">
                    <Sparkles className="w-4 h-4" />
                  </ClayIconBadge>
                  <p className="text-xs font-bold text-[#343047]">
                    Want targeted help on the knowledge gaps from this attempt?
                  </p>
                </div>
                <button
                  onClick={() =>
                    onOpenAssistantPrompt(
                      `Help me study these knowledge gaps from my ${reviewAttempt.subject} assessment: ${reviewAttempt.knowledgeGaps.join(', ')}`
                    )
                  }
                  className="clay-button-primary px-4 py-2 text-xs font-bold shrink-0"
                >
                  Study Gaps with AI
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

