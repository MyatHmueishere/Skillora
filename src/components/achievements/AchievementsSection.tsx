import React from 'react';
import {
  Award,
  CheckCircle2,
  Cpu,
  Flame,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
  Loader2,
  AlertCircle,
  BookOpen,
  Layers,
  Compass,
  Clock,
} from 'lucide-react';
import { XP_REWARDS } from '../../../shared/achievementEngine';
import type { AchievementBadgeState, AchievementSummaryPayload, AppView } from '../../types';
import { formatAchievementDate } from '../../lib/achievements';
import { ClayColorVariant, ClayIconBadge } from '../common/PastelIllustrations';

interface AchievementsSectionProps {
  summary: AchievementSummaryPayload;
  isAuthenticated: boolean;
  isLoading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onNavigate?: (view: AppView) => void;
}

function getBadgeVisual(iconName: AchievementBadgeState['iconName']): {
  icon: React.ReactNode;
  variant: ClayColorVariant;
} {
  switch (iconName) {
    case 'Zap':
      return { icon: <Zap className="w-5 h-5 fill-white" />, variant: 'peach' };
    case 'ShieldCheck':
      return { icon: <ShieldCheck className="w-5 h-5" />, variant: 'mint' };
    case 'Flame':
      return { icon: <Flame className="w-5 h-5 fill-white" />, variant: 'yellow' };
    case 'Award':
      return { icon: <Award className="w-5 h-5" />, variant: 'lavender' };
    case 'Trophy':
      return { icon: <Trophy className="w-5 h-5" />, variant: 'yellow' };
    case 'Cpu':
    default:
      return { icon: <Cpu className="w-5 h-5" />, variant: 'pink' };
  }
}

export const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  summary,
  isAuthenticated,
  isLoading = false,
  error = '',
  onRefresh,
  onNavigate,
}) => {
  const { levelInfo, badges, unlockedCount, totalBadgesCount, recentAchievements, stats } = summary;
  const unlockedBadges = badges.filter((b) => b.unlocked);
  const lockedBadges = badges.filter((b) => !b.unlocked);

  return (
    <div className="space-y-6">
      {/* Top XP & Level Hero Card */}
      <div
        className="pastel-card p-6 sm:p-7 space-y-5 border border-[#E2D6F5]"
        style={{
          background: 'linear-gradient(135deg, #FFFCFA 0%, #F0E9FA 62%, #FFF1D6 100%)',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <ClayIconBadge variant="lavender" size="lg">
              <Trophy className="w-7 h-7" />
            </ClayIconBadge>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-[#343047] text-white text-[11px] font-extrabold tracking-wide">
                  Level {levelInfo.level}
                </span>
                <span className="text-xs font-extrabold text-[#6F4FA8]">
                  {levelInfo.title}
                </span>
                {!isAuthenticated && (
                  <span className="px-2 py-0.5 rounded-full bg-[#FFF1D6] border border-[#F3DFB4] text-[#7A5720] text-[10px] font-extrabold">
                    Preview Mode
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tabular-nums">
                  {levelInfo.totalXp.toLocaleString()} XP
                </h3>
                <span className="text-xs font-bold text-[#6B6178]">
                  · {unlockedCount} of {totalBadgesCount} badges unlocked
                </span>
              </div>
              <p className="text-xs text-[#6B6178] leading-relaxed">
                Earned automatically from verified lesson completions, passing Knowledge Checks (80%+), stages, and full Learning Paths.
              </p>
            </div>
          </div>

          {isAuthenticated && onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5 self-start md:self-auto disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{isLoading ? 'Syncing XP...' : 'Sync Achievements'}</span>
            </button>
          )}
        </div>

        {/* Progress Toward Next Level */}
        <div className="p-4 rounded-[20px] bg-[#FFFCFA]/90 border border-[#EEE6E5] space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-[#343047]">
              Progress to Level {levelInfo.level + 1}
            </span>
            <span className="font-mono font-bold text-[#6F4FA8] tabular-nums">
              {levelInfo.xpIntoCurrentLevel} / {levelInfo.xpNeededForNextLevel} XP ({levelInfo.progressPercent}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-[#EFE9E7] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${levelInfo.progressPercent}%`,
                background: 'linear-gradient(90deg, #9B7ACE 0%, #58A89A 100%)',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#8B8295]">
            <span>Level {levelInfo.level} ({levelInfo.currentLevelMinXp} XP)</span>
            <span className="font-semibold text-[#5E5468]">
              {levelInfo.xpToNextLevel} XP needed for Level {levelInfo.level + 1}
            </span>
          </div>
        </div>

        {/* XP Breakdown Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-[18px] bg-[#FFFCFA]/85 border border-[#EEE6E5] space-y-0.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
              <span>Lessons (+{XP_REWARDS.LESSON_FIRST_COMPLETION} XP)</span>
              <BookOpen className="w-3.5 h-3.5 text-[#9B7ACE]" />
            </div>
            <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
              {stats.lessonXp} XP
            </p>
            <p className="text-[10px] text-[#8B8295]">
              {stats.completedLessonsCount}{' '}
              {stats.completedLessonsCount === 1 ? 'lesson' : 'lessons'} completed
            </p>
          </div>

          <div className="p-3.5 rounded-[18px] bg-[#FFFCFA]/85 border border-[#EEE6E5] space-y-0.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
              <span>Knowledge Checks (+{XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS} XP)</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#58A89A]" />
            </div>
            <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
              {stats.knowledgeCheckXp} XP
            </p>
            <p className="text-[10px] text-[#8B8295]">
              {stats.passedKnowledgeChecksCount} first-pass{' '}
              {stats.passedKnowledgeChecksCount === 1 ? 'quiz' : 'quizzes'}
            </p>
          </div>

          <div className="p-3.5 rounded-[18px] bg-[#FFFCFA]/85 border border-[#EEE6E5] space-y-0.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
              <span>Stages (+{XP_REWARDS.STAGE_FIRST_COMPLETION} XP)</span>
              <Layers className="w-3.5 h-3.5 text-[#E58D7A]" />
            </div>
            <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
              {stats.stageXp} XP
            </p>
            <p className="text-[10px] text-[#8B8295]">
              {stats.completedStagesCount}{' '}
              {stats.completedStagesCount === 1 ? 'stage' : 'stages'} completed
            </p>
          </div>

          <div className="p-3.5 rounded-[18px] bg-[#FFFCFA]/85 border border-[#EEE6E5] space-y-0.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
              <span>Full Paths (+{XP_REWARDS.PATH_FIRST_COMPLETION} XP)</span>
              <Compass className="w-3.5 h-3.5 text-[#D99B38]" />
            </div>
            <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
              {stats.pathXp} XP
            </p>
            <p className="text-[10px] text-[#8B8295]">
              {stats.completedPathsCount}{' '}
              {stats.completedPathsCount === 1 ? 'path' : 'paths'} finished
            </p>
          </div>
        </div>
      </div>

      {/* Non-blocking notices */}
      {isAuthenticated && summary.schemaMigrationRequired && (
        <div className="p-4 rounded-[20px] bg-[#FFF1D6]/80 border border-[#F3DFB4] flex items-start gap-3 text-xs text-[#6B4E16]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C28624]" />
          <div className="space-y-1">
            <p className="font-extrabold">
              Database migration needed for permanent XP ledger storage
            </p>
            <p className="leading-relaxed">
              Your XP and badges above are calculated live from your saved Skillora progress. To store the tamper-protected XP ledger and badge history directly in Supabase, run{' '}
              <code className="px-1.5 py-0.5 rounded bg-white/80 font-mono text-[11px]">
                supabase/migrations/20261119_achievements_and_xp.sql
              </code>{' '}
              in your Supabase SQL Editor.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-[18px] bg-[#FCEAE5] border border-[#F5D3CA] text-xs text-[#8D3E32] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Achievement Badges (Unlocked & Locked) */}
      <div className="pastel-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-extrabold text-[#343047]">
              Achievement Badges
            </h3>
            <p className="text-xs text-[#8B8295]">
              {isAuthenticated
                ? 'Badges unlock automatically when verified learning milestones are achieved.'
                : 'Sign in and complete real learning milestones to unlock badges.'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="px-3 py-1 rounded-full bg-[#DCECD9] text-[#2F5B37]">
              {unlockedBadges.length} Unlocked
            </span>
            <span className="px-3 py-1 rounded-full bg-[#FAF6F2] border border-[#EEE6E5] text-[#6B6178]">
              {lockedBadges.length} Locked
            </span>
          </div>
        </div>

        {/* Unlocked Badges */}
        {unlockedBadges.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#356640] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Unlocked Badges</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {unlockedBadges.map((badge) => {
                const visual = getBadgeVisual(badge.iconName);
                const formattedDate = formatAchievementDate(badge.unlockedAt);
                return (
                  <div
                    key={badge.id}
                    className="p-5 rounded-[22px] border border-[#D8C9F2] bg-[#FAF6F2]/85 shadow-xs flex items-start gap-4 transition-all"
                  >
                    <ClayIconBadge variant={visual.variant} size="md">
                      {visual.icon}
                    </ClayIconBadge>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-display text-sm font-extrabold text-[#343047]">
                          {badge.title}
                        </h4>
                        <span className="text-[10px] font-extrabold text-[#2F5B37] bg-[#DCECD9] px-2 py-0.5 rounded-full">
                          Unlocked
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5E5468] leading-relaxed">
                        {badge.description}
                      </p>
                      <p className="text-[10px] font-bold text-[#6F4FA8] pt-0.5">
                        Requirement: {badge.unlockRequirement}
                      </p>
                      {formattedDate && (
                        <p className="text-[10px] text-[#8B8295] font-mono">
                          Unlocked {formattedDate}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Locked Badges & Requirements */}
        {lockedBadges.length > 0 && (
          <div className="space-y-3 pt-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#8B8295] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Locked Badges &amp; Unlock Requirements</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lockedBadges.map((badge) => {
                const visual = getBadgeVisual(badge.iconName);
                const pct = Math.min(
                  100,
                  Math.round(
                    (badge.progressCurrent / Math.max(1, badge.progressTarget)) * 100
                  )
                );
                return (
                  <div
                    key={badge.id}
                    className="p-5 rounded-[22px] border border-[#EEE6E5] bg-[#FAF6F2]/45 flex items-start gap-4"
                  >
                    <div className="opacity-55 grayscale-[40%]">
                      <ClayIconBadge variant={visual.variant} size="md">
                        {visual.icon}
                      </ClayIconBadge>
                    </div>
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-display text-sm font-extrabold text-[#5A526B]">
                          {badge.title}
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#8B8295] bg-[#FFFCFA] border border-[#E6DCD9] px-2 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" />
                          <span>Locked</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6B6178] leading-relaxed">
                        {badge.description}
                      </p>
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-[#6F4FA8]">
                          <span>{badge.unlockRequirement}</span>
                          <span className="font-mono text-[#8B8295]">{badge.progressLabel}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[#EEE6E5] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#B99FE4] transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent Achievements & Verified XP History */}
      <div className="pastel-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-base font-extrabold text-[#343047] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#9B7ACE]" />
              <span>Recent Achievements &amp; XP Activity</span>
            </h3>
            <p className="text-xs text-[#8B8295]">
              Chronological feed of your latest badge unlocks and verified XP milestones
            </p>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('roadmap')}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8]"
            >
              Continue Learning Path
            </button>
          )}
        </div>

        {recentAchievements.length === 0 ? (
          <div className="p-6 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2.5">
            <p className="font-display text-sm font-extrabold text-[#343047]">
              No XP or badges earned yet
            </p>
            <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
              Complete your first lesson (+{XP_REWARDS.LESSON_FIRST_COMPLETION} XP) or pass a lesson Knowledge Check (+{XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS} XP) to start leveling up and unlocking badges.
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('roadmap')}
                className="clay-button-primary px-4 py-2 text-xs font-bold mt-1"
              >
                Go to My Learning Path
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentAchievements.map((item) => {
              const dateLabel = formatAchievementDate(item.timestamp);
              const isBadge = item.kind === 'badge';
              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-[18px] bg-[#FAF6F2]/80 border border-[#EEE6E5] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                        isBadge
                          ? 'bg-[#FFF1D6] text-[#9E6E1A] border border-[#F3DFB4]'
                          : 'bg-[#F0E9FA] text-[#6F4FA8] border border-[#E2D6F5]'
                      }`}
                    >
                      {isBadge ? (
                        <Trophy className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#343047] truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#6B6178] truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {typeof item.xpAmount === 'number' && (
                      <span className="px-2.5 py-1 rounded-full bg-[#DCECD9] text-[#2F5B37] font-mono text-[11px] font-extrabold tabular-nums">
                        +{item.xpAmount} XP
                      </span>
                    )}
                    {isBadge && (
                      <span className="px-2.5 py-1 rounded-full bg-[#FFF1D6] text-[#855C1C] text-[11px] font-extrabold">
                        Badge
                      </span>
                    )}
                    {dateLabel && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#8B8295] font-mono">
                        <Clock className="w-3 h-3" />
                        {dateLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
