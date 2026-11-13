import React, { useState } from 'react';
import {
  TrendingUp,
  Award,
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
  Database,
  Layers,
  Check,
  Terminal,
} from 'lucide-react';
import { UserProfile, Course, AppView } from '../../types';
import {
  WEEKLY_ACTIVITY_DATA,
  SKILL_OVERVIEW_DATA,
  CONTINUE_LEARNING_COURSES,
  RECOMMENDED_COURSES,
} from '../../data/mockData';
import {
  ClayIconBadge,
  CuteStudentCharacter3D,
  BloomingCactus3D,
  SmilingCloudMascot3D,
  ClayColorVariant,
} from '../common/PastelIllustrations';

interface DashboardViewProps {
  user: UserProfile;
  onNavigate: (view: AppView) => void;
  onSelectCourse: (course: Course) => void;
  onOpenAssistantPrompt: (prompt: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  onNavigate,
  onSelectCourse,
  onOpenAssistantPrompt,
}) => {
  const [activeDayIndex, setActiveDayIndex] = useState<number>(3); // Highlight Thursday peak by default
  const [activityRange, setActivityRange] = useState<'this_week' | 'last_week'>('this_week');

  const chartData =
    activityRange === 'this_week'
      ? WEEKLY_ACTIVITY_DATA
      : WEEKLY_ACTIVITY_DATA.map((d) => ({
          ...d,
          hours: Math.max(1, Number((d.hours * 0.85).toFixed(1))),
          completedTasks: Math.max(1, d.completedTasks - 1),
        }));

  // Compute smooth SVG cubic bezier path for Activity Overview
  const chartW = 520;
  const chartH = 165;
  const padX = 28;
  const padY = 24;
  const maxY = 5;

  const points = chartData.map((d, i) => {
    const x = padX + (i * (chartW - padX * 2)) / (chartData.length - 1);
    const y = chartH - padY - (d.hours / maxY) * (chartH - padY * 2);
    return { x, y, ...d };
  });

  const buildSmoothPath = (pts: typeof points) => {
    if (pts.length === 0) return '';
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      path += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  const linePath = buildSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartH - padY + 12} L ${points[0].x} ${chartH - padY + 12} Z`;
  const activePoint = points[activeDayIndex] || points[3];

  // Upcoming learning tasks adapted from personalized education
  const upcomingTasks: {
    id: string;
    title: string;
    schedule: string;
    status: string;
    statusClass: string;
    variant: ClayColorVariant;
    icon: React.ReactNode;
    targetView: AppView;
  }[] = [
    {
      id: 't-1',
      title: 'Functions & Closures Lab',
      schedule: 'Today · 35 mins',
      status: 'In Progress',
      statusClass: 'bg-[#FFF1D6] text-[#8E6521]',
      variant: 'pink',
      icon: <Code2 className="w-4 h-4" />,
      targetView: 'roadmap',
    },
    {
      id: 't-2',
      title: 'Python Diagnostic Quiz',
      schedule: 'Today · 10 questions',
      status: 'Due Today',
      statusClass: 'bg-[#F8D9D0] text-[#8C493D]',
      variant: 'yellow',
      icon: <Sparkles className="w-4 h-4" />,
      targetView: 'assessment',
    },
    {
      id: 't-3',
      title: 'Hash Maps & Dictionaries',
      schedule: 'Tomorrow · 45 mins',
      status: 'Ready',
      statusClass: 'bg-[#DCECD9] text-[#3B6B46]',
      variant: 'mint',
      icon: <Layers className="w-4 h-4" />,
      targetView: 'resources',
    },
    {
      id: 't-4',
      title: 'PostgreSQL Query Basics',
      schedule: 'Thu · Stage 5 Prep',
      status: 'Upcoming',
      statusClass: 'bg-[#F0E9FA] text-[#6B4FA1]',
      variant: 'lavender',
      icon: <Database className="w-4 h-4" />,
      targetView: 'roadmap',
    },
  ];

  // Roadmap stages preview
  const roadmapSteps = [
    { name: 'Python Fundamentals', status: 'completed' },
    { name: 'Control Structures', status: 'completed' },
    { name: 'Functions & Data', status: 'current' },
    { name: 'OOP Architecture', status: 'upcoming' },
    { name: 'Database Basics', status: 'upcoming' },
    { name: 'Python Projects', status: 'upcoming' },
  ];

  // Multi-pastel donut ring calculations
  const skillColors = ['#C9B7E8', '#F6C6D1', '#FFE09E', '#A9D5B3'];
  const donutRadius = 42;
  const donutCirc = 2 * Math.PI * donutRadius;
  const totalSkillSum = SKILL_OVERVIEW_DATA.reduce((acc, s) => acc + s.level, 0);
  let cumulativeOffset = 0;

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
          <div className="shrink-0 -ml-2 -mb-6 self-end hidden sm:block">
            <CuteStudentCharacter3D className="w-36 h-36" />
          </div>

          <div className="flex-1 min-w-0 space-y-2.5 z-10">
            <div>
              <h1 className="font-display text-2xl sm:text-[26px] font-extrabold text-[#343047] tracking-tight leading-tight">
                Good Morning, {user.name.split(' ')[0]}!
              </h1>
              <p className="text-xs sm:text-[13px] text-[#6E5964] mt-1 leading-relaxed">
                Ready to continue your <span className="font-bold text-[#343047]">{user.careerGoal}</span> journey? Let's make today amazing!
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => onNavigate('roadmap')}
                className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
              >
                <span>Resume Path</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onNavigate('assessment')}
                className="px-3.5 py-2 rounded-[14px] bg-[#FFFCFA]/85 hover:bg-[#FFFCFA] text-[#343047] text-xs font-bold transition-colors shadow-xs"
              >
                Quick Quiz
              </button>
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
                {user.overallProgress}%
              </div>
              <p className="text-[11px] font-semibold text-[#549768] mt-1.5">
                ↑ Stage 3 of 6
              </p>
            </div>
          </div>

          {/* KPI 2: Completed Courses */}
          <div
            onClick={() => onNavigate('progress')}
            className="rounded-[24px] bg-[#FCEAE5] border border-[#F6D7CE] p-4 sm:p-5 flex flex-col justify-between cursor-pointer pastel-card-hover"
            style={{ boxShadow: '0 10px 24px -10px rgba(216, 148, 132, 0.22), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <span className="text-xs font-bold text-[#6E5653]">Completed Courses</span>
            <div className="my-3">
              <ClayIconBadge variant="peach" size="md">
                <Check className="w-5 h-5 stroke-[3]" />
              </ClayIconBadge>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-[28px] font-extrabold text-[#343047] tabular-nums leading-none">
                {user.completedCoursesCount}
              </div>
              <p className="text-[11px] font-semibold text-[#549768] mt-1.5">
                ↑ +2 this month
              </p>
            </div>
          </div>

          {/* KPI 3: Learning Hours */}
          <div
            onClick={() => onNavigate('progress')}
            className="rounded-[24px] bg-[#E5F0E3] border border-[#D4E5D1] p-4 sm:p-5 flex flex-col justify-between cursor-pointer pastel-card-hover"
            style={{ boxShadow: '0 10px 24px -10px rgba(134, 178, 138, 0.22), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <span className="text-xs font-bold text-[#4D6351]">Learning Hours</span>
            <div className="my-3">
              <ClayIconBadge variant="mint" size="md">
                <Clock className="w-5 h-5" />
              </ClayIconBadge>
            </div>
            <div>
              <div className="font-display text-2xl sm:text-[28px] font-extrabold text-[#343047] tabular-nums leading-none">
                {user.totalHours}h
              </div>
              <p className="text-[11px] font-semibold text-[#549768] mt-1.5">
                ↑ 17.5h this week
              </p>
            </div>
          </div>

          {/* KPI 4: Study Streak */}
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
                {user.currentStreak} Days
              </div>
              <p className="text-[11px] font-semibold text-[#A37327] mt-1.5">
                Personal best!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECOND ROW: Weekly Learning Activity Spline Chart + Upcoming Learning Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Weekly Learning Activity (7 cols) */}
        <div className="lg:col-span-7 pastel-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#343047]">
                Weekly Learning Activity
              </h2>
              <p className="text-xs text-[#8B8295]">
                Hover or tap any day to inspect daily study hours and completed tasks
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5]">
              <button
                onClick={() => setActivityRange('this_week')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  activityRange === 'this_week'
                    ? 'bg-[#FFFCFA] text-[#343047] shadow-xs'
                    : 'text-[#8B8295] hover:text-[#343047]'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setActivityRange('last_week')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  activityRange === 'last_week'
                    ? 'bg-[#FFFCFA] text-[#343047] shadow-xs'
                    : 'text-[#8B8295] hover:text-[#343047]'
                }`}
              >
                Last Week
              </button>
            </div>
          </div>

          {/* Smooth Lavender Spline Curve Chart */}
          <div className="relative pt-4">
            <svg viewBox={`0 0 ${chartW} ${chartH + 22}`} className="w-full h-52 overflow-visible">
              <defs>
                <linearGradient id="lavenderAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C9B7E8" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#F0E9FA" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Soft horizontal grid lines */}
              {[1, 2, 3, 4].map((val) => {
                const gy = chartH - padY - (val / maxY) * (chartH - padY * 2);
                return (
                  <g key={val}>
                    <line
                      x1={padX}
                      y1={gy}
                      x2={chartW - padX}
                      y2={gy}
                      stroke="#F1EAE8"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={6}
                      y={gy + 4}
                      fontSize="10"
                      fill="#9E94A8"
                      className="font-mono tabular-nums"
                    >
                      {val}h
                    </text>
                  </g>
                );
              })}

              {/* Area fill */}
              <path d={areaPath} fill="url(#lavenderAreaFill)" />

              {/* Curve stroke */}
              <path
                d={linePath}
                fill="none"
                stroke="#A78BCE"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Floating Tooltip Box above active node */}
              <g transform={`translate(${activePoint.x}, ${activePoint.y - 36})`}>
                <rect
                  x="-36"
                  y="-16"
                  width="72"
                  height="36"
                  rx="11"
                  fill="#FFFCFA"
                  stroke="#EEE6E5"
                  style={{ filter: 'drop-shadow(0 6px 12px rgba(124,102,148,0.18))' }}
                />
                <text
                  x="0"
                  y="-1"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="#343047"
                  className="font-display tabular-nums"
                >
                  {activePoint.hours} hrs
                </text>
                <text
                  x="0"
                  y="13"
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#8B8295"
                >
                  {activePoint.completedTasks} units
                </text>
              </g>

              {/* Interactive Data Points */}
              {points.map((pt, idx) => {
                const isSelected = idx === activeDayIndex;
                return (
                  <g
                    key={pt.day}
                    className="cursor-pointer"
                    onMouseEnter={() => setActiveDayIndex(idx)}
                    onClick={() => setActiveDayIndex(idx)}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 7 : 4.5}
                      fill={isSelected ? '#A78BCE' : '#FFFCFA'}
                      stroke="#A78BCE"
                      strokeWidth="3"
                    />
                    <text
                      x={pt.x}
                      y={chartH + 10}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={isSelected ? '700' : '500'}
                      fill={isSelected ? '#343047' : '#8B8295'}
                    >
                      {pt.day}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Upcoming Learning Tasks (5 cols) */}
        <div className="lg:col-span-5 pastel-card p-6 flex flex-col justify-between">
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

          <div className="space-y-3">
            {upcomingTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onNavigate(task.targetView)}
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
      </div>

      {/* THIRD ROW: Skill Progress Donut + AI Learning Insight Cactus + Encouragement Cloud */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Skill Progress Donut Card (5 cols) */}
        <div className="md:col-span-5 pastel-card p-6 flex flex-col justify-between">
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
                {SKILL_OVERVIEW_DATA.map((skill, idx) => {
                  const segmentLength = (skill.level / totalSkillSum) * donutCirc;
                  const dashArray = `${Math.max(0, segmentLength - 3)} ${donutCirc}`;
                  const dashOffset = -cumulativeOffset;
                  cumulativeOffset += segmentLength;
                  return (
                    <circle
                      key={skill.name}
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
                  {user.overallProgress}%
                </span>
                <span className="text-[10px] font-medium text-[#8B8295] mt-0.5">Mastery</span>
              </div>
            </div>

            {/* Skill Breakdown Legend */}
            <div className="flex-1 w-full space-y-2.5">
              {SKILL_OVERVIEW_DATA.map((skill, idx) => (
                <div key={skill.name} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: skillColors[idx % skillColors.length] }}
                    />
                    <span className="font-medium text-[#343047] truncate">{skill.name}</span>
                  </div>
                  <span className="font-mono font-bold text-[#343047] tabular-nums">
                    {skill.level}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Learning Insight Card with Blooming Cactus (3 cols) */}
        <div
          className="md:col-span-3 rounded-[24px] bg-[#F0E9FA] border border-[#E2D6F5] p-5 flex items-center gap-3 relative overflow-hidden"
          style={{ boxShadow: '0 12px 26px -10px rgba(154, 126, 200, 0.28), inset 0 1px 0 rgba(255,255,255,0.85)' }}
        >
          <div className="shrink-0 -ml-2">
            <BloomingCactus3D className="w-20 h-24" />
          </div>
          <div className="space-y-2 min-w-0">
            <h3 className="font-display text-sm font-extrabold text-[#343047] leading-snug">
              AI Learning Insight
            </h3>
            <p className="text-[11px] text-[#5D5470] leading-relaxed">
              You're doing great in Python! Practice functions & data structures next.
            </p>
            <button
              onClick={() =>
                onOpenAssistantPrompt('Help me practice Python functions and data structures next')
              }
              className="clay-button-primary px-3.5 py-1.5 text-[11px] font-bold"
            >
              Ask AI Tutor
            </button>
          </div>
        </div>

        {/* Encouragement Card with Cute 3D Cloud (4 cols) */}
        <div
          className="md:col-span-4 rounded-[24px] bg-[#FFF1D6] border border-[#F5E1B8] p-5 flex items-center justify-between gap-3 relative overflow-hidden"
          style={{ boxShadow: '0 12px 26px -10px rgba(218, 176, 94, 0.25), inset 0 1px 0 rgba(255,255,255,0.85)' }}
        >
          <div className="shrink-0">
            <SmilingCloudMascot3D className="w-28 h-20" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="font-display text-lg font-extrabold text-[#343047] leading-tight">
              You're doing great!
            </h3>
            <p className="text-xs text-[#705D38] leading-relaxed">
              {user.currentStreak}-day study streak! Keep going and achieve more.
            </p>
            <button
              onClick={() => onNavigate('progress')}
              className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#8E6521] hover:underline"
            >
              <span>See Badges</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* FOURTH ROW: Current Learning Roadmap Strip */}
      <div className="pastel-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#343047]">
              Current Learning Roadmap
            </h2>
            <p className="text-xs text-[#8B8295]">
              Personalized pathway for <span className="font-bold text-[#343047]">{user.careerGoal}</span>
            </p>
          </div>
          <button
            onClick={() => onNavigate('roadmap')}
            className="text-xs font-bold text-[#8B68C7] hover:text-[#6B4B9E] flex items-center gap-1"
          >
            <span>Open Interactive Roadmap</span>
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
              <p className="text-xs text-[#8B8295]">Active courses in progress</p>
            </div>
            <button
              onClick={() => onNavigate('resources')}
              className="text-xs font-bold text-[#8B68C7] hover:underline"
            >
              Browse All
            </button>
          </div>

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
              Library
            </button>
          </div>

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
        </div>
      </div>
    </div>
  );
};
