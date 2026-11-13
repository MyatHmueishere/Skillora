import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Check,
  AlertCircle,
  Code2,
  Layers,
  Database,
} from 'lucide-react';
import { AssessmentQuestion, AssessmentResult, AppView } from '../../types';
import { ASSESSMENT_QUESTIONS_BANK } from '../../data/mockData';
import {
  ClayIconBadge,
  BooksTrophy3D,
  SmilingCloudMascot3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';

interface AssessmentViewProps {
  onNavigate: (view: AppView) => void;
  onOpenAssistantPrompt: (prompt: string) => void;
  onUpdateScore?: (score: number) => void;
}

export const AssessmentView: React.FC<AssessmentViewProps> = ({
  onNavigate,
  onOpenAssistantPrompt,
  onUpdateScore,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<'python' | 'datastructures' | 'sql'>('python');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [questionCount, setQuestionCount] = useState<number>(5);

  const [quizState, setQuizState] = useState<'setup' | 'active' | 'results'>('setup');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [activeQuestions, setActiveQuestions] = useState<AssessmentQuestion[]>([]);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const startQuiz = () => {
    const pool = ASSESSMENT_QUESTIONS_BANK[selectedSubject] || ASSESSMENT_QUESTIONS_BANK.python;
    const questions = pool.slice(0, questionCount);
    setActiveQuestions(questions);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setQuizState('active');
  };

  const handleSelectOption = (optionIndex: number) => {
    setUserAnswers({
      ...userAnswers,
      [currentQuestionIndex]: optionIndex,
    });
  };

  const handleSubmitQuiz = () => {
    let correctCount = 0;
    const strengths: string[] = [];
    const areasToImprove: string[] = [];

    activeQuestions.forEach((q, idx) => {
      const selected = userAnswers[idx];
      if (selected === q.correctAnswerIndex) {
        correctCount += 1;
        if (!strengths.includes(q.topic)) {
          strengths.push(q.topic);
        }
      } else {
        if (!areasToImprove.includes(q.topic)) {
          areasToImprove.push(q.topic);
        }
      }
    });

    const incorrectCount = activeQuestions.length - correctCount;
    const percentage = Math.round((correctCount / activeQuestions.length) * 100);

    const calculatedResult: AssessmentResult = {
      subject:
        selectedSubject === 'python'
          ? 'Python Fundamentals'
          : selectedSubject === 'datastructures'
          ? 'Data Structures & Algorithms'
          : 'SQL & Database Architecture',
      difficulty: selectedDifficulty,
      totalQuestions: activeQuestions.length,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      percentageScore: percentage,
      strengths: strengths.length > 0 ? strengths : ['General Syntax Knowledge'],
      areasToImprove: areasToImprove.length > 0 ? areasToImprove : ['Advanced Optimization & Edge Cases'],
      date: 'Today',
    };

    setResult(calculatedResult);
    setQuizState('results');
    if (onUpdateScore) {
      onUpdateScore(percentage);
    }
  };

  const currentQ = activeQuestions[currentQuestionIndex];

  const subjects: {
    id: 'python' | 'datastructures' | 'sql';
    label: string;
    desc: string;
    variant: ClayColorVariant;
    tint: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'python',
      label: 'Python Fundamentals',
      desc: 'Syntax, closures, memory, OOP, and data structures',
      variant: 'lavender',
      tint: 'bg-[#F0E9FA]/75 border-[#D6C5F0]',
      icon: <Code2 className="w-5 h-5" />,
    },
    {
      id: 'datastructures',
      label: 'Data Structures',
      desc: 'Hash maps, binary search trees, heaps, and Big-O',
      variant: 'peach',
      tint: 'bg-[#FCEAE5]/80 border-[#F3CCC1]',
      icon: <Layers className="w-5 h-5" />,
    },
    {
      id: 'sql',
      label: 'SQL & Databases',
      desc: 'Relational joins, aggregates, indexes, and ACID',
      variant: 'mint',
      tint: 'bg-[#DCECD9]/70 border-[#BEDBB9]',
      icon: <Database className="w-5 h-5" />,
    },
  ];

  const progressPercentage =
    activeQuestions.length > 0
      ? Math.round(((currentQuestionIndex + 1) / activeQuestions.length) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {/* SCREEN 1: SETUP */}
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
                <span>Skill Diagnostic & Calibration</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
                Interactive Skill Assessment
              </h1>
              <p className="text-xs sm:text-sm text-[#6B6178] leading-relaxed max-w-xl">
                Check your current understanding across programming topics. Your scores automatically highlight strengths and suggest next study milestones.
              </p>
            </div>
            <BooksTrophy3D className="w-28 h-24 shrink-0" />
          </div>

          {/* Setup Card */}
          <div className="pastel-card p-6 sm:p-8 space-y-6">
            {/* Subject Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#8B8295] mb-3">
                1. Choose Subject
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {subjects.map((s) => {
                  const isSelected = selectedSubject === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSubject(s.id)}
                      className={`p-5 rounded-[22px] border text-left transition-all flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? `${s.tint} ring-2 ring-[#A78BCE]/45 shadow-sm`
                          : 'bg-[#FAF6F2]/70 border-[#EEE6E5] hover:bg-[#FFFCFA] hover:border-[#DCD0EF]'
                      }`}
                    >
                      <ClayIconBadge variant={s.variant} size="md">
                        {s.icon}
                      </ClayIconBadge>
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
              <div className="grid grid-cols-3 gap-3">
                {[5, 10, 15].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setQuestionCount(cnt)}
                    className={`p-3.5 rounded-[16px] border text-center font-mono tabular-nums text-xs transition-all ${
                      questionCount === cnt
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
                Immediate feedback & topic breakdown upon completion
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
                  disabled={Object.keys(userAnswers).length === 0}
                  className="px-6 py-2.5 rounded-[16px] clay-squircle-mint text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Submit Assessment</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 3: RESULTS & ACHIEVEMENT ILLUSTRATION */}
      {quizState === 'results' && result && (
        <div className="space-y-6">
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
                    {result.subject} · {result.difficulty}
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
                  onClick={() => onNavigate('roadmap')}
                  className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Apply to Path</span>
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

            {/* Strengths & Growth Areas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-[20px] bg-[#DCECD9]/55 border border-[#C2DFBC] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#325E3B]">
                  <CheckCircle2 className="w-4 h-4 text-[#4B8B59]" />
                  <span>Demonstrated Strengths</span>
                </div>
                <div className="space-y-1.5">
                  {result.strengths.map((str, i) => (
                    <p key={i} className="text-xs font-semibold text-[#343047] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#68AC77]" />
                      {str}
                    </p>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-[20px] bg-[#FFF1D6]/70 border border-[#F2DCAD] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#855C1C]">
                  <AlertCircle className="w-4 h-4 text-[#D39331]" />
                  <span>Focus Next</span>
                </div>
                <div className="space-y-1.5">
                  {result.areasToImprove.map((imp, i) => (
                    <p key={i} className="text-xs font-semibold text-[#343047] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DF9F3E]" />
                      {imp}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Question Breakdown */}
            <div className="pt-4 border-t border-[#EEE6E5] space-y-3">
              <h3 className="font-display text-base font-extrabold text-[#343047]">
                Question Breakdown & Explanations
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
                    `Help me understand my weak areas from the ${result.subject} assessment: ${result.areasToImprove.join(', ')}`
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
    </div>
  );
};
