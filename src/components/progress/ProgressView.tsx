import React, { useState } from 'react';
import {
  BarChart3,
  Award,
  Clock,
  Flame,
  CheckCircle2,
  Zap,
  Compass,
  Cpu,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { UserProfile, AppView } from '../../types';
import {
  WEEKLY_ACTIVITY_DATA,
  SKILL_OVERVIEW_DATA,
  ACHIEVEMENT_BADGES,
} from '../../data/mockData';
import {
  ClayIconBadge,
  BooksTrophy3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';

interface ProgressViewProps {
  user: UserProfile;
  onNavigate: (view: AppView) => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({ user, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'assessments' | 'badges'>('overview');

  const assessmentHistory = [
    {
      id: 'h-1',
      subject: 'Python Fundamentals Diagnostic',
      date: 'Nov 10, 2026',
      score: 85,
      level: 'Intermediate',
      delta: '+15%',
    },
    {
      id: 'h-2',
      subject: 'Data Structures & Big-O Benchmark',
      date: 'Nov 04, 2026',
      score: 72,
      level: 'Intermediate',
      delta: '+8%',
    },
    {
      id: 'h-3',
      subject: 'Relational SQL & Postgres Diagnostic',
      date: 'Oct 28, 2026',
      score: 64,
      level: 'Beginner',
      delta: 'Baseline',
    },
  ];

  const completedModulesList = [
    { title: 'Python Core Syntax, Variables & Types', stage: 'Stage 1', date: 'Nov 08, 2026', timeSpent: '6.5h' },
    { title: 'Standard I/O & String Formatting with f-strings', stage: 'Stage 1', date: 'Nov 06, 2026', timeSpent: '4.0h' },
    { title: 'Conditionals & Match-Case Structural Patterns', stage: 'Stage 2', date: 'Nov 02, 2026', timeSpent: '5.2h' },
    { title: 'Loops, Iterables, and Enumerate/Zip Mechanics', stage: 'Stage 2', date: 'Oct 30, 2026', timeSpent: '4.8h' },
    { title: 'Function Definitions & Return Scopes', stage: 'Stage 3', date: 'Oct 24, 2026', timeSpent: '3.5h' },
  ];

  const getBadgeVisual = (iconName: string): { icon: React.ReactNode; variant: ClayColorVariant } => {
    switch (iconName) {
      case 'Flame':
        return { icon: <Flame className="w-5 h-5 fill-white" />, variant: 'yellow' };
      case 'Award':
        return { icon: <Award className="w-5 h-5" />, variant: 'lavender' };
      case 'Zap':
        return { icon: <Zap className="w-5 h-5 fill-white" />, variant: 'peach' };
      case 'Compass':
        return { icon: <Compass className="w-5 h-5" />, variant: 'mint' };
      case 'Cpu':
        return { icon: <Cpu className="w-5 h-5" />, variant: 'pink' };
      case 'ShieldCheck':
      default:
        return { icon: <ShieldCheck className="w-5 h-5" />, variant: 'lavender' };
    }
  };

  const maxHours = Math.max(...WEEKLY_ACTIVITY_DATA.map((d) => d.hours));
  const skillBarColors = ['#C9B7E8', '#A9D5B3', '#F8D9D0', '#FFE09E'];

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Header */}
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
              <span>Learning Analytics & Growth</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              My Learning Progress
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6178] max-w-xl leading-relaxed">
              Visualize your weekly study consistency, skill growth, assessment scores, and unlocked milestone badges.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('assessment')}
          className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 shrink-0 self-start md:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          <span>Take New Diagnostic</span>
        </button>
      </div>

      {/* 4 Pastel KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[22px] bg-[#F0E9FA] border border-[#E2D6F5] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="lavender" size="md">
            <TrendingUp className="w-5 h-5" />
          </ClayIconBadge>
          <div>
            <p className="text-[11px] font-bold text-[#6F4FA8]">Overall Progress</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {user.overallProgress}%
            </p>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#DCECD9] border border-[#C2DFBC] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="mint" size="md">
            <Clock className="w-5 h-5" />
          </ClayIconBadge>
          <div>
            <p className="text-[11px] font-bold text-[#3C7347]">Study Time</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {user.totalHours} hrs
            </p>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#FFF1D6] border border-[#F3DFB4] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="yellow" size="md">
            <Flame className="w-5 h-5 fill-white" />
          </ClayIconBadge>
          <div>
            <p className="text-[11px] font-bold text-[#8E6521]">Active Streak</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              {user.currentStreak} Days
            </p>
          </div>
        </div>

        <div className="rounded-[22px] bg-[#FCEAE5] border border-[#F5D3CA] p-5 flex items-center gap-3.5">
          <ClayIconBadge variant="peach" size="md">
            <Award className="w-5 h-5" />
          </ClayIconBadge>
          <div>
            <p className="text-[11px] font-bold text-[#9C5042]">Diagnostic Avg</p>
            <p className="font-display text-2xl font-extrabold text-[#343047] tabular-nums">
              82%
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-full w-fit shadow-2xs flex-wrap">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'overview'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          Activity & Skills
        </button>
        <button
          onClick={() => setActiveTab('assessments')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'assessments'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          Assessment History
        </button>
        <button
          onClick={() => setActiveTab('badges')}
          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'badges'
              ? 'bg-[#A78BCE] text-white shadow-xs'
              : 'text-[#8B8295] hover:text-[#343047]'
          }`}
        >
          Badges & Achievements
        </button>
      </div>

      {/* TAB 1: ACTIVITY & SKILLS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Weekly Study Bar Chart */}
            <div className="lg:col-span-7 pastel-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-extrabold text-[#343047]">
                    Weekly Study Distribution
                  </h3>
                  <p className="text-xs text-[#8B8295]">
                    Daily study hours logged across lessons & practice
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-mono text-xs font-bold">
                  Goal: 14h / wk
                </span>
              </div>

              <div className="pt-4 h-48 flex items-end justify-between gap-3 px-2 border-b border-[#EEE6E5]">
                {WEEKLY_ACTIVITY_DATA.map((item, idx) => {
                  const hPercent = (item.hours / maxHours) * 100;
                  const barColors = ['#C9B7E8', '#F6C6D1', '#A9D5B3', '#A78BCE', '#FFE09E', '#F8D9D0', '#C9B7E8'];
                  return (
                    <div
                      key={item.day}
                      className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                    >
                      <span className="text-[11px] font-mono font-bold text-[#8B8295] group-hover:text-[#343047] tabular-nums">
                        {item.hours}h
                      </span>
                      <div
                        className="w-full max-w-[38px] rounded-t-[12px] transition-all duration-300 group-hover:brightness-95"
                        style={{
                          height: `${hPercent}%`,
                          backgroundColor: barColors[idx % barColors.length],
                          boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.5)',
                        }}
                      />
                      <span className="text-xs font-bold text-[#6B6178] pb-1">{item.day}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-[#8B8295] pt-1">
                <span>Peak day: Thursday (4.0 hrs)</span>
                <span className="font-bold text-[#3C7347]">100% Weekly Goal Met</span>
              </div>
            </div>

            {/* Skill Growth Bars */}
            <div className="lg:col-span-5 pastel-card p-6 space-y-4">
              <div>
                <h3 className="font-display text-base font-extrabold text-[#343047]">
                  Skill Growth Matrix
                </h3>
                <p className="text-xs text-[#8B8295]">Mastery levels verified via diagnostics</p>
              </div>

              <div className="space-y-4 pt-2">
                {SKILL_OVERVIEW_DATA.map((s, idx) => (
                  <div key={s.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#343047]">{s.name}</span>
                      <span className="font-mono font-bold text-[#343047] tabular-nums">
                        {s.level}%
                      </span>
                    </div>
                    <div className="w-full bg-[#F1EAE8] h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${s.level}%`,
                          backgroundColor: skillBarColors[idx % skillBarColors.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Completed Modules Table */}
          <div className="pastel-card p-6 space-y-4">
            <h3 className="font-display text-base font-extrabold text-[#343047]">
              Recently Completed Modules
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] font-bold text-[#8B8295] border-b border-[#EEE6E5] bg-[#FAF6F2]/80">
                  <tr>
                    <th className="py-3 px-4 rounded-l-xl">Module Title</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4">Time Invested</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right rounded-r-xl">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEE6E5]/70 font-medium text-[#343047]">
                  {completedModulesList.map((mod, idx) => (
                    <tr key={idx} className="hover:bg-[#FAF6F2]/60 transition-colors">
                      <td className="py-3.5 px-4 font-bold">{mod.title}</td>
                      <td className="py-3.5 px-4 text-[#8E6EC8] font-mono font-bold">
                        {mod.stage}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums">{mod.timeSpent}</td>
                      <td className="py-3.5 px-4 text-[#8B8295]">{mod.date}</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DCECD9] text-[#356640] text-[11px] font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          Mastered
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASSESSMENTS */}
      {activeTab === 'assessments' && (
        <div className="pastel-card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display text-base font-extrabold text-[#343047]">
                Assessment Score History
              </h3>
              <p className="text-xs text-[#8B8295]">Diagnostic checkpoints & score trends</p>
            </div>

            <button
              onClick={() => onNavigate('assessment')}
              className="clay-button-primary px-4 py-2 text-xs font-bold"
            >
              Start New Test
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] font-bold text-[#8B8295] border-b border-[#EEE6E5] bg-[#FAF6F2]/80">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl">Subject</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Difficulty</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">Growth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEE6E5]/70 font-medium text-[#343047]">
                {assessmentHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF6F2]/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold">{item.subject}</td>
                    <td className="py-3.5 px-4 text-[#8B8295]">{item.date}</td>
                    <td className="py-3.5 px-4 font-mono">{item.level}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full bg-[#F0E9FA] text-[#6F4FA8] font-mono font-bold tabular-nums">
                        {item.score}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#3C7347] font-mono font-bold">
                      {item.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BADGES */}
      {activeTab === 'badges' && (
        <div className="pastel-card p-6 space-y-5">
          <div>
            <h3 className="font-display text-base font-extrabold text-[#343047]">
              Achievement Badges
            </h3>
            <p className="text-xs text-[#8B8295]">
              Collectible milestones earned along your learning journey
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ACHIEVEMENT_BADGES.map((badge) => {
              const visual = getBadgeVisual(badge.iconName);
              return (
                <div
                  key={badge.id}
                  className={`p-5 rounded-[22px] border flex items-start gap-4 transition-all ${
                    badge.unlocked
                      ? 'bg-[#FAF6F2]/75 border-[#E2D6F5] shadow-xs'
                      : 'bg-[#FAF6F2]/40 border-[#EEE6E5] opacity-60'
                  }`}
                >
                  <ClayIconBadge variant={visual.variant} size="md">
                    {visual.icon}
                  </ClayIconBadge>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-display text-sm font-extrabold text-[#343047]">
                        {badge.title}
                      </h4>
                      {badge.unlocked && (
                        <span className="text-[10px] font-bold text-[#356640] bg-[#DCECD9] px-2 py-0.5 rounded-full">
                          Unlocked
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#6B6178] leading-relaxed">
                      {badge.description}
                    </p>
                    {badge.unlockedAt && (
                      <p className="text-[10px] text-[#8B8295] font-mono mt-1">
                        Earned: {badge.unlockedAt}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
