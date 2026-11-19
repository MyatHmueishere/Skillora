import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Cpu,
  Crown,
  Download,
  ExternalLink,
  Flame,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { XP_REWARDS } from '../../../shared/achievementEngine';
import type {
  AchievementBadgeState,
  AchievementSummaryPayload,
  AppView,
  BadgeCategory,
  BadgeRarity,
  CertificatePublicNameVisibility,
  CertificateTemplateId,
  IssuedCertificateRecord,
} from '../../types';
import {
  formatAchievementDate,
  updateCertificateDisplayPreferences,
} from '../../lib/achievements';
import {
  downloadCertificateAsPdf,
  printCertificateA4Landscape,
} from '../../lib/certificatePdf';
import { ClayColorVariant, ClayIconBadge } from '../common/PastelIllustrations';
import { CertificateCardPreview } from './CertificateCardPreview';

export type AchievementsTabId = 'overview' | 'badges' | 'certificates' | 'xp_history';

interface AchievementsSectionProps {
  summary: AchievementSummaryPayload;
  isAuthenticated: boolean;
  isLoading?: boolean;
  error?: string;
  initialTab?: AchievementsTabId;
  onRefresh?: () => void;
  onNavigate?: (view: AppView) => void;
  onOpenVerification?: (certificateNumber?: string) => void;
  onCertificateUpdated?: (updatedCertificate: IssuedCertificateRecord) => void;
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
    case 'BookOpen':
      return { icon: <BookOpen className="w-5 h-5" />, variant: 'lavender' };
    case 'GraduationCap':
      return { icon: <GraduationCap className="w-5 h-5" />, variant: 'mint' };
    case 'Compass':
      return { icon: <Compass className="w-5 h-5" />, variant: 'peach' };
    case 'Layers':
      return { icon: <Layers className="w-5 h-5" />, variant: 'lavender' };
    case 'Star':
      return { icon: <Star className="w-5 h-5 fill-white" />, variant: 'yellow' };
    case 'Target':
      return { icon: <Target className="w-5 h-5" />, variant: 'peach' };
    case 'Crown':
      return { icon: <Crown className="w-5 h-5" />, variant: 'yellow' };
    case 'Sparkles':
      return { icon: <Sparkles className="w-5 h-5" />, variant: 'lavender' };
    case 'CheckCircle2':
      return { icon: <CheckCircle2 className="w-5 h-5" />, variant: 'mint' };
    case 'Cpu':
    default:
      return { icon: <Cpu className="w-5 h-5" />, variant: 'pink' };
  }
}

function getRarityColorClass(rarity: BadgeRarity): string {
  switch (rarity) {
    case 'Legendary':
      return 'text-[#9A6E14]';
    case 'Epic':
      return 'text-[#6F4FA8]';
    case 'Rare':
      return 'text-[#2D6890]';
    case 'Uncommon':
      return 'text-[#2F6A40]';
    case 'Common':
    default:
      return 'text-[#6B6178]';
  }
}

const TEMPLATE_OPTIONS: Array<{ id: CertificateTemplateId; label: string }> = [
  { id: 'classic_academic', label: 'Classic Academic' },
  { id: 'modern_professional', label: 'Modern Professional' },
  { id: 'excellence_award', label: 'Excellence Award' },
];

export const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  summary,
  isAuthenticated,
  isLoading = false,
  error = '',
  initialTab = 'overview',
  onRefresh,
  onNavigate,
  onOpenVerification,
  onCertificateUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<AchievementsTabId>(initialTab);
  const [badgeCategoryFilter, setBadgeCategoryFilter] = useState<BadgeCategory | 'all'>('all');
  const [badgeStatusFilter, setBadgeStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [ledgerDirectionFilter, setLedgerDirectionFilter] = useState<string>('all');
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null);
  const [templateOverrides, setTemplateOverrides] = useState<
    Record<string, CertificateTemplateId>
  >({});
  const [privacyOverrides, setPrivacyOverrides] = useState<
    Record<string, CertificatePublicNameVisibility>
  >({});
  const [savingPrefCertId, setSavingPrefCertId] = useState<string | null>(null);
  const [certActionNotice, setCertActionNotice] = useState<string>('');
  const [copiedCertId, setCopiedCertId] = useState<string | null>(null);
  const [printTargetCertId, setPrintTargetCertId] = useState<string | null>(null);
  const [dismissUnlockBanner, setDismissUnlockBanner] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const {
    levelInfo,
    badges,
    unlockedCount,
    totalBadgesCount,
    certificates,
    certificateEligibility,
    recentAchievements,
    stats,
    directionXpBreakdown,
    activeDirection,
    activeDirectionXp,
    xpLedger,
    newlyAwardedXp,
    newlyUnlockedBadgeIds,
    newlyIssuedCertificateIds = [],
  } = summary;

  useEffect(() => {
    if (certificates.length > 0) {
      setSelectedCertId((prev) =>
        prev && certificates.some((c) => c.id === prev) ? prev : certificates[0].id
      );
    } else {
      setSelectedCertId(null);
    }
  }, [certificates]);

  useEffect(() => {
    if (
      newlyAwardedXp > 0 ||
      newlyUnlockedBadgeIds.length > 0 ||
      newlyIssuedCertificateIds.length > 0
    ) {
      setDismissUnlockBanner(false);
    }
  }, [newlyAwardedXp, newlyUnlockedBadgeIds.length, newlyIssuedCertificateIds.length]);

  const newlyUnlockedSet = useMemo(
    () => new Set<string>(newlyUnlockedBadgeIds),
    [newlyUnlockedBadgeIds]
  );

  const unlockedBadges = useMemo(() => badges.filter((b) => b.unlocked), [badges]);
  const lockedBadges = useMemo(() => badges.filter((b) => !b.unlocked), [badges]);

  const nextClosestBadges = useMemo(() => {
    return lockedBadges
      .slice()
      .sort((a, b) => {
        const pctA = a.progressCurrent / Math.max(1, a.progressTarget);
        const pctB = b.progressCurrent / Math.max(1, b.progressTarget);
        return pctB - pctA;
      })
      .slice(0, 3);
  }, [lockedBadges]);

  const filteredBadges = useMemo(() => {
    return badges.filter((b) => {
      if (badgeCategoryFilter !== 'all' && b.category !== badgeCategoryFilter) return false;
      if (badgeStatusFilter === 'unlocked' && !b.unlocked) return false;
      if (badgeStatusFilter === 'locked' && b.unlocked) return false;
      return true;
    });
  }, [badges, badgeCategoryFilter, badgeStatusFilter]);

  const filteredLedger = useMemo(() => {
    if (ledgerDirectionFilter === 'all') return xpLedger;
    return xpLedger.filter(
      (item) => (item.direction || 'General Learning') === ledgerDirectionFilter
    );
  }, [xpLedger, ledgerDirectionFilter]);

  const ledgerDirections = useMemo(() => {
    const set = new Set<string>();
    for (const item of xpLedger) {
      set.add(item.direction || 'General Learning');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [xpLedger]);

  const selectedCertificate = useMemo(() => {
    if (certificates.length === 0) return null;
    return certificates.find((c) => c.id === selectedCertId) ?? certificates[0];
  }, [certificates, selectedCertId]);

  const pendingEligibility = useMemo(
    () => certificateEligibility.filter((c) => !c.earned),
    [certificateEligibility]
  );

  const getEffectiveTemplate = (cert: IssuedCertificateRecord): CertificateTemplateId =>
    templateOverrides[cert.id] ?? cert.templateId;

  const getEffectivePrivacy = (
    cert: IssuedCertificateRecord
  ): CertificatePublicNameVisibility =>
    privacyOverrides[cert.id] ?? cert.publicNameVisibility;

  const handleUpdateCertificatePref = async (
    cert: IssuedCertificateRecord,
    updates: {
      templateId?: CertificateTemplateId;
      publicNameVisibility?: CertificatePublicNameVisibility;
    }
  ) => {
    setCertActionNotice('');
    if (updates.templateId) {
      setTemplateOverrides((prev) => ({ ...prev, [cert.id]: updates.templateId! }));
    }
    if (updates.publicNameVisibility) {
      setPrivacyOverrides((prev) => ({
        ...prev,
        [cert.id]: updates.publicNameVisibility!,
      }));
    }

    if (!isAuthenticated || summary.certificatesSchemaMigrationRequired) {
      return;
    }

    // Only attempt DB persistence if cert.id is a real UUID (persisted row)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cert.id
    );
    if (!isUuid) return;

    setSavingPrefCertId(cert.id);
    try {
      const updated = await updateCertificateDisplayPreferences(cert.id, updates);
      if (onCertificateUpdated) {
        onCertificateUpdated(updated);
      }
      setCertActionNotice('Certificate display preferences saved.');
    } catch (err) {
      setCertActionNotice(
        err instanceof Error ? err.message : 'Saved preview preference locally.'
      );
    } finally {
      setSavingPrefCertId(null);
    }
  };

  const handleCopyVerifyLink = async (cert: IssuedCertificateRecord) => {
    const url = `${window.location.origin}/?verify=${encodeURIComponent(
      cert.certificateNumber
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCertId(cert.id);
      window.setTimeout(() => setCopiedCertId((prev) => (prev === cert.id ? null : prev)), 2200);
    } catch {
      setCertActionNotice(`Verification link: ${url}`);
    }
  };

  const handlePrintSelected = (cert: IssuedCertificateRecord) => {
    setPrintTargetCertId(cert.id);
    printCertificateA4Landscape(() => {
      setPrintTargetCertId(cert.id);
    });
  };

  return (
    <div className="space-y-6">
      {/* Subtle Celebration Banner when new XP, Badge, or Certificate unlocks */}
      {!dismissUnlockBanner &&
        (newlyAwardedXp > 0 ||
          newlyUnlockedBadgeIds.length > 0 ||
          newlyIssuedCertificateIds.length > 0) && (
          <div
            className="animate-achievement-unlock p-4 sm:p-5 rounded-[22px] border border-[#C8A24A]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              background: 'linear-gradient(135deg, #0F1D3A 0%, #162A52 100%)',
            }}
          >
            <div className="flex items-center gap-3 text-white">
              <div className="w-10 h-10 rounded-xl bg-[#C8A24A] text-[#0F1D3A] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="font-display text-sm font-extrabold text-[#DFC278]">
                  New Achievement Progress Recorded!
                </p>
                <p className="text-xs text-white/85 tabular-nums">
                  {newlyAwardedXp > 0 ? `+${newlyAwardedXp} verified XP · ` : ''}
                  {newlyUnlockedBadgeIds.length > 0
                    ? `${newlyUnlockedBadgeIds.length} new badge${
                        newlyUnlockedBadgeIds.length === 1 ? '' : 's'
                      } unlocked · `
                    : ''}
                  {newlyIssuedCertificateIds.length > 0
                    ? `${newlyIssuedCertificateIds.length} professional certificate${
                        newlyIssuedCertificateIds.length === 1 ? '' : 's'
                      } issued`
                    : 'Keep building your learning momentum'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissUnlockBanner(true)}
              className="px-3 py-1.5 rounded-xl bg-white/12 hover:bg-white/20 text-xs font-bold text-white whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              Dismiss
            </button>
          </div>
        )}

      {/* Non-blocking migration notices */}
      {isAuthenticated &&
        (summary.schemaMigrationRequired || summary.certificatesSchemaMigrationRequired) && (
          <div className="p-4 rounded-[20px] bg-[#FFF1D6]/85 border border-[#F3DFB4] flex items-start gap-3 text-xs text-[#6B4E16]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C28624]" />
            <div className="space-y-1">
              <p className="font-extrabold">
                Database migration needed for Phase 9 certificates &amp; expanded badge persistence
              </p>
              <p className="leading-relaxed">
                Your live XP, badges, and eligible certificates are evaluated cleanly from your saved Skillora records. To permanently store issued certificate IDs and unlock public verification links in Supabase, run{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/80 font-mono text-[11px]">
                  supabase/migrations/20261120_phase9_badges_and_certificates.sql
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

      {/* Top Level, Overall XP & Active Direction XP Hero Card */}
      <div
        className="pastel-card p-6 sm:p-7 space-y-5 border border-[#E2D6F5]"
        style={{
          background: 'linear-gradient(135deg, #FFFCFA 0%, #F0E9FA 62%, #FFF1D6 100%)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <ClayIconBadge variant="lavender" size="lg">
              <Trophy className="w-7 h-7" />
            </ClayIconBadge>
            <div className="space-y-1">
              <p className="text-xs font-extrabold text-[#6F4FA8] uppercase tracking-wider tabular-nums">
                Level {levelInfo.level} · {levelInfo.title}
                {!isAuthenticated ? ' · Preview Mode' : ''}
              </p>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tabular-nums">
                  {levelInfo.totalXp.toLocaleString()} Overall XP
                </h3>
                {activeDirection && (
                  <span className="text-xs font-bold text-[#0F1D3A] tabular-nums">
                    · {activeDirection}: {activeDirectionXp.toLocaleString()} XP
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6B6178] leading-relaxed">
                {unlockedCount} of {totalBadgesCount} badges unlocked · {certificates.length}{' '}
                {certificates.length === 1 ? 'certificate' : 'certificates'} earned · Switching learning directions preserves all Overall XP &amp; credentials.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-auto">
            {onOpenVerification && (
              <button
                type="button"
                onClick={() => onOpenVerification()}
                className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#0F1D3A] flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#C8A24A]" />
                <span>Verify Certificate</span>
              </button>
            )}
            {isAuthenticated && onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{isLoading ? 'Syncing...' : 'Sync Achievements'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Level Progress */}
        <div className="p-4 rounded-[20px] bg-[#FFFCFA]/92 border border-[#EEE6E5] space-y-2.5">
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
          <div className="flex items-center justify-between text-[11px] text-[#8B8295] tabular-nums">
            <span>Level {levelInfo.level} ({levelInfo.currentLevelMinXp} XP)</span>
            <span className="font-semibold text-[#5E5468]">
              {levelInfo.xpToNextLevel} XP needed for Level {levelInfo.level + 1}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Required Section Tabs: Overview | All Badges | Certificates | XP History */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-2xl w-fit shadow-2xs flex-wrap">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'badges', label: `All Badges (${unlockedCount}/${totalBadgesCount})` },
            { id: 'certificates', label: `Certificates (${certificates.length})` },
            { id: 'xp_history', label: `XP History (${xpLedger.length})` },
          ] as Array<{ id: AchievementsTabId; label: string }>
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                isActive
                  ? 'bg-[#343047] text-white shadow-xs'
                  : 'text-[#6B6178] hover:text-[#343047] hover:bg-[#FAF6F2]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* XP Breakdown Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="pastel-card p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
                <span>Lessons (+{XP_REWARDS.LESSON_FIRST_COMPLETION} XP)</span>
                <BookOpen className="w-3.5 h-3.5 text-[#9B7ACE]" />
              </div>
              <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums">
                {stats.lessonXp} XP
              </p>
              <p className="text-[11px] text-[#8B8295] tabular-nums">
                {stats.completedLessonsCount}{' '}
                {stats.completedLessonsCount === 1 ? 'lesson' : 'lessons'} completed
              </p>
            </div>

            <div className="pastel-card p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
                <span>Quizzes (+{XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS} XP)</span>
                <ShieldCheck className="w-3.5 h-3.5 text-[#58A89A]" />
              </div>
              <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums">
                {stats.knowledgeCheckXp} XP
              </p>
              <p className="text-[11px] text-[#8B8295] tabular-nums">
                {stats.passedKnowledgeChecksCount} first-pass{' '}
                {stats.passedKnowledgeChecksCount === 1 ? 'quiz' : 'quizzes'}
              </p>
            </div>

            <div className="pastel-card p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
                <span>Courses (+{XP_REWARDS.STAGE_FIRST_COMPLETION} XP)</span>
                <Layers className="w-3.5 h-3.5 text-[#E58D7A]" />
              </div>
              <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums">
                {stats.stageXp} XP
              </p>
              <p className="text-[11px] text-[#8B8295] tabular-nums">
                {stats.completedStagesCount}{' '}
                {stats.completedStagesCount === 1 ? 'course stage' : 'course stages'} completed
              </p>
            </div>

            <div className="pastel-card p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#6B6178]">
                <span>Full Paths (+{XP_REWARDS.PATH_FIRST_COMPLETION} XP)</span>
                <Compass className="w-3.5 h-3.5 text-[#D99B38]" />
              </div>
              <p className="font-display text-xl font-extrabold text-[#343047] tabular-nums">
                {stats.pathXp} XP
              </p>
              <p className="text-[11px] text-[#8B8295] tabular-nums">
                {stats.completedPathsCount}{' '}
                {stats.completedPathsCount === 1 ? 'path' : 'paths'} finished
              </p>
            </div>
          </div>

          {/* Option A: Direction-Specific XP Breakdown */}
          <div className="pastel-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-extrabold text-[#343047]">
                  Learning Direction XP Breakdown
                </h3>
                <p className="text-xs text-[#8B8295]">
                  XP earned separately per learning direction while preserving your cumulative Overall XP and badges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('xp_history')}
                className="text-xs font-bold text-[#6F4FA8] hover:underline self-start sm:self-center whitespace-nowrap"
              >
                Full XP History →
              </button>
            </div>

            {directionXpBreakdown.length === 0 ? (
              <div className="p-5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-xs text-[#6B6178]">
                Complete a lesson or pass a Knowledge Check to start building XP in your primary learning direction.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {directionXpBreakdown.map((dir) => {
                  const isCurrent =
                    activeDirection &&
                    dir.direction.toLowerCase() === activeDirection.toLowerCase();
                  return (
                    <div
                      key={dir.directionKey}
                      className={`p-4 rounded-[18px] border space-y-2.5 ${
                        isCurrent
                          ? 'bg-[#F0E9FA]/55 border-[#D8C9F2]'
                          : 'bg-[#FAF6F2]/80 border-[#EEE6E5]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-sm font-extrabold text-[#343047] truncate">
                            {dir.direction}
                          </p>
                          <p className="text-[11px] text-[#6B6178] tabular-nums">
                            {isCurrent ? 'Active Direction · ' : ''}
                            Level {dir.levelInfo.level} · {dir.completedLessons} lessons ·{' '}
                            {dir.completedCourses} courses · {dir.passedKnowledgeChecks} quizzes
                          </p>
                        </div>
                        <span className="font-mono text-sm font-extrabold text-[#6F4FA8] tabular-nums shrink-0">
                          {dir.totalXp.toLocaleString()} XP
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#EEE6E5] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#A78BCE]"
                          style={{ width: `${dir.levelInfo.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Certificates Summary + Next Achievement Progress */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Certificates Collection Snapshot */}
            <div className="lg:col-span-6 pastel-card p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-extrabold text-[#343047]">
                      Professional Certificates
                    </h3>
                    <p className="text-xs text-[#8B8295]">
                      Issued strictly after completing all required lessons &amp; evaluations
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('certificates')}
                    className="text-xs font-bold text-[#0F1D3A] hover:underline whitespace-nowrap shrink-0"
                  >
                    Open Gallery →
                  </button>
                </div>

                {certificates.length > 0 ? (
                  <div className="space-y-2.5">
                    {certificates.slice(0, 3).map((cert) => (
                      <div
                        key={cert.id}
                        onClick={() => {
                          setSelectedCertId(cert.id);
                          setActiveTab('certificates');
                        }}
                        className="p-3.5 rounded-[18px] bg-[#0F1D3A] text-white flex items-center justify-between gap-3 cursor-pointer hover:bg-[#162A52] transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#DFC278]">
                            {cert.certificateTypeLabel}
                          </p>
                          <p className="font-display text-sm font-extrabold truncate">
                            {cert.title}
                          </p>
                          <p className="text-[11px] text-white/75 font-mono tabular-nums">
                            {cert.certificateNumber} · {formatAchievementDate(cert.completionDate)}
                          </p>
                        </div>
                        <Award className="w-5 h-5 text-[#DFC278] shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-2">
                    <p className="text-xs font-bold text-[#343047]">
                      No certificates issued yet
                    </p>
                    <p className="text-[11px] text-[#6B6178] leading-relaxed">
                      Finish all lessons in a course stage and pass at least 1 Knowledge Check (80%+) to earn your first Course Completion Certificate.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('certificates')}
                className="w-full py-2.5 rounded-xl bg-[#F0E9FA] hover:bg-[#E2D6F5] text-xs font-bold text-[#5D438E] transition-colors"
              >
                {certificates.length > 0
                  ? `View & Download All ${certificates.length} Certificates`
                  : 'Inspect Certificate Readiness'}
              </button>
            </div>

            {/* Next Achievement Progress */}
            <div className="lg:col-span-6 pastel-card p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-extrabold text-[#343047]">
                      Next Badges to Unlock
                    </h3>
                    <p className="text-xs text-[#8B8295]">
                      Closest locked achievements based on your verified progress
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('badges')}
                    className="text-xs font-bold text-[#6F4FA8] hover:underline whitespace-nowrap shrink-0"
                  >
                    All {totalBadgesCount} Badges →
                  </button>
                </div>

                {nextClosestBadges.length === 0 ? (
                  <div className="p-4 rounded-[18px] bg-[#DCECD9]/60 border border-[#C2DFBC] text-xs font-bold text-[#2F5B37]">
                    Every available Skillora achievement badge is unlocked!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {nextClosestBadges.map((badge) => {
                      const pct = Math.min(
                        100,
                        Math.round(
                          (badge.progressCurrent / Math.max(1, badge.progressTarget)) * 100
                        )
                      );
                      return (
                        <div
                          key={badge.id}
                          className="p-3.5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-display text-xs font-extrabold text-[#343047] truncate">
                                {badge.title}
                              </p>
                              <p className="text-[11px] text-[#6B6178]">
                                {badge.categoryLabel} · {badge.unlockRequirement}
                              </p>
                            </div>
                            <span className="font-mono text-[11px] font-bold text-[#6F4FA8] tabular-nums shrink-0">
                              {badge.progressLabel}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#EEE6E5] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#A78BCE]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('roadmap')}
                  className="w-full py-2.5 rounded-xl bg-[#FAF6F2] hover:bg-[#F0E9FA] border border-[#EEE6E5] text-xs font-bold text-[#343047] transition-colors"
                >
                  Continue Learning Path
                </button>
              )}
            </div>
          </div>

          {/* Recent Achievements Feed */}
          <div className="pastel-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-base font-extrabold text-[#343047]">
                  Recent Achievements &amp; Milestones
                </h3>
                <p className="text-xs text-[#8B8295]">
                  Chronological timeline of earned certificates, unlocked badges, and XP milestones
                </p>
              </div>
            </div>

            {recentAchievements.length === 0 ? (
              <div className="p-6 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2.5">
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  No XP, badges, or certificates earned yet
                </p>
                <p className="text-xs text-[#6B6178] max-w-md mx-auto leading-relaxed">
                  Complete your first lesson (+{XP_REWARDS.LESSON_FIRST_COMPLETION} XP) or pass a lesson Knowledge Check (+{XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS} XP) to start leveling up.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentAchievements.slice(0, 10).map((item) => {
                  const dateLabel = formatAchievementDate(item.timestamp);
                  const isBadge = item.kind === 'badge';
                  const isCert = item.kind === 'certificate';
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-[18px] bg-[#FAF6F2]/80 border border-[#EEE6E5] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                            isCert
                              ? 'bg-[#0F1D3A] text-[#DFC278]'
                              : isBadge
                              ? 'bg-[#FFF1D6] text-[#9E6E1A] border border-[#F3DFB4]'
                              : 'bg-[#F0E9FA] text-[#6F4FA8] border border-[#E2D6F5]'
                          }`}
                        >
                          {isCert ? (
                            <Award className="w-4 h-4" />
                          ) : isBadge ? (
                            <Trophy className="w-4 h-4" />
                          ) : (
                            <Zap className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-[#343047] truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[#6B6178] truncate">{item.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                        {typeof item.xpAmount === 'number' && (
                          <span className="text-xs font-mono font-extrabold text-[#2F5B37]">
                            +{item.xpAmount} XP
                          </span>
                        )}
                        {isCert && (
                          <span className="text-xs font-extrabold text-[#0F1D3A]">
                            Certificate
                          </span>
                        )}
                        {isBadge && (
                          <span className="text-xs font-extrabold text-[#855C1C]">Badge</span>
                        )}
                        {dateLabel && (
                          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#8B8295] font-mono">
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
      )}

      {/* TAB 2: ALL BADGES */}
      {activeTab === 'badges' && (
        <div className="pastel-card p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Achievement Badge Collection
              </h3>
              <p className="text-xs text-[#8B8295] tabular-nums">
                {unlockedBadges.length} unlocked · {lockedBadges.length} in progress · Triggered automatically by verified learning events
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  { id: 'all', label: 'All Status' },
                  { id: 'unlocked', label: `Unlocked (${unlockedBadges.length})` },
                  { id: 'locked', label: `Locked (${lockedBadges.length})` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBadgeStatusFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    badgeStatusFilter === opt.id
                      ? 'bg-[#343047] text-white'
                      : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#6B6178] hover:text-[#343047]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter Row */}
          <div className="flex items-center gap-1.5 flex-wrap border-b border-[#EEE6E5] pb-4">
            {(
              [
                { id: 'all', label: 'All Categories' },
                { id: 'milestone', label: 'Learning Milestones' },
                { id: 'consistency', label: 'Consistency' },
                { id: 'knowledge_practice', label: 'Knowledge & Practice' },
                { id: 'excellence', label: 'Excellence' },
              ] as Array<{ id: BadgeCategory | 'all'; label: string }>
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setBadgeCategoryFilter(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  badgeCategoryFilter === cat.id
                    ? 'bg-[#F0E9FA] text-[#5D438E] border border-[#D8C9F2]'
                    : 'text-[#6B6178] hover:bg-[#FAF6F2]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBadges.map((badge) => {
              const visual = getBadgeVisual(badge.iconName);
              const earnedDate = formatAchievementDate(badge.unlockedAt);
              const pct = Math.min(
                100,
                Math.round((badge.progressCurrent / Math.max(1, badge.progressTarget)) * 100)
              );
              const isJustUnlocked = newlyUnlockedSet.has(badge.id);

              return (
                <div
                  key={badge.id}
                  className={`p-5 rounded-[22px] border flex items-start gap-4 transition-all ${
                    isJustUnlocked ? 'animate-achievement-unlock' : ''
                  } ${
                    badge.unlocked
                      ? 'border-[#D8C9F2] bg-[#FAF6F2]/90 shadow-xs'
                      : 'border-[#EEE6E5] bg-[#FAF6F2]/40'
                  }`}
                >
                  <div className={badge.unlocked ? '' : 'opacity-50 grayscale-[45%]'}>
                    <ClayIconBadge variant={visual.variant} size="md">
                      {visual.icon}
                    </ClayIconBadge>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className={`font-display text-sm font-extrabold leading-snug ${
                          badge.unlocked ? 'text-[#343047]' : 'text-[#5A526B]'
                        }`}
                      >
                        {badge.title}
                      </h4>
                      {badge.unlocked ? (
                        <CheckCircle2 className="w-4 h-4 text-[#2F6A40] shrink-0 mt-0.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-[#8B8295] shrink-0 mt-0.5" />
                      )}
                    </div>

                    <p className="text-[11px] font-bold text-[#6B6178]">
                      <span>{badge.categoryLabel}</span>
                      {' · '}
                      <span className={getRarityColorClass(badge.rarity)}>{badge.rarity}</span>
                    </p>

                    <p className="text-xs text-[#5E5468] leading-relaxed">{badge.description}</p>

                    <div className="pt-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                        <span className="font-bold text-[#6F4FA8]">
                          {badge.unlockRequirement}
                        </span>
                        <span className="font-mono text-[#6B6178] shrink-0">
                          {badge.progressLabel}
                        </span>
                      </div>

                      {!badge.unlocked && (
                        <div className="w-full h-1.5 rounded-full bg-[#EEE6E5] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#B99FE4] transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}

                      {badge.unlocked && earnedDate && (
                        <p className="text-[11px] font-mono text-[#2F5B37] tabular-nums">
                          Earned {earnedDate}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CERTIFICATES */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          {/* Earned Certificate Viewer & Actions */}
          <div className="pastel-card p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-extrabold text-[#343047]">
                  Earned Professional Certificates
                </h3>
                <p className="text-xs text-[#8B8295]">
                  Verifiable Skillora credentials in Midnight Navy, Ivory, and Champagne Gold — A4 Landscape print &amp; PDF ready.
                </p>
              </div>
              {onOpenVerification && (
                <button
                  type="button"
                  onClick={() => onOpenVerification(selectedCertificate?.certificateNumber)}
                  className="clay-button-soft px-4 py-2 text-xs font-bold text-[#0F1D3A] flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start md:self-auto"
                >
                  <ShieldCheck className="w-4 h-4 text-[#C8A24A]" />
                  <span>Open Verification Portal</span>
                </button>
              )}
            </div>

            {certActionNotice && (
              <div className="p-3 rounded-xl bg-[#F0E9FA] border border-[#D8C9F2] text-xs font-semibold text-[#5D438E]">
                {certActionNotice}
              </div>
            )}

            {certificates.length === 0 ? (
              <div className="p-7 rounded-[22px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#0F1D3A] text-[#DFC278] flex items-center justify-center mx-auto">
                  <Award className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-lg mx-auto">
                  <h4 className="font-display text-base font-extrabold text-[#343047]">
                    Complete a Course or Learning Path to Earn Your First Certificate
                  </h4>
                  <p className="text-xs text-[#6B6178] leading-relaxed">
                    Skillora issues official certificates strictly after verifying all required lessons and Knowledge Checks (80%+). Certificates are never awarded solely for registering or accumulating XP.
                  </p>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('roadmap')}
                    className="clay-button-primary px-5 py-2.5 text-xs font-bold"
                  >
                    Go to My Learning Path
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Earned Certificate Selector Strip if > 1 */}
                {certificates.length > 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {certificates.map((cert) => {
                      const active = selectedCertificate?.id === cert.id;
                      return (
                        <button
                          key={cert.id}
                          type="button"
                          onClick={() => setSelectedCertId(cert.id)}
                          className={`p-4 rounded-[18px] text-left border transition-all space-y-1 ${
                            active
                              ? 'bg-[#0F1D3A] text-white border-[#C8A24A] shadow-sm'
                              : 'bg-[#FAF6F2] text-[#343047] border-[#EEE6E5] hover:border-[#C9B7E8]'
                          }`}
                        >
                          <p
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              active ? 'text-[#DFC278]' : 'text-[#6F4FA8]'
                            }`}
                          >
                            {cert.certificateTypeLabel}
                          </p>
                          <p className="font-display text-sm font-extrabold truncate">
                            {cert.title}
                          </p>
                          <p
                            className={`font-mono text-[11px] tabular-nums ${
                              active ? 'text-white/80' : 'text-[#8B8295]'
                            }`}
                          >
                            {cert.certificateNumber} · {formatAchievementDate(cert.completionDate)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedCertificate && (() => {
                  const activeTemplate = getEffectiveTemplate(selectedCertificate);
                  const activePrivacy = getEffectivePrivacy(selectedCertificate);
                  const isNewlyIssued = newlyIssuedCertificateIds.includes(
                    selectedCertificate.id
                  );

                  return (
                    <div
                      className={`space-y-4 ${isNewlyIssued ? 'animate-achievement-unlock' : ''}`}
                    >
                      {/* Controls Toolbar */}
                      <div className="p-4 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-[#6B6178] mr-1">
                              Template:
                            </span>
                            {TEMPLATE_OPTIONS.map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() =>
                                  void handleUpdateCertificatePref(selectedCertificate, {
                                    templateId: tpl.id,
                                  })
                                }
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                                  activeTemplate === tpl.id
                                    ? 'bg-[#0F1D3A] text-[#DFC278]'
                                    : 'bg-white border border-[#EEE6E5] text-[#343047] hover:bg-[#F0E9FA]'
                                }`}
                              >
                                {tpl.label}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-[#6B6178]">
                              Public Name:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateCertificatePref(selectedCertificate, {
                                  publicNameVisibility:
                                    activePrivacy === 'full_name' ? 'initials' : 'full_name',
                                })
                              }
                              className="px-3 py-1.5 rounded-xl bg-white border border-[#EEE6E5] hover:border-[#C9B7E8] text-xs font-bold text-[#343047] whitespace-nowrap shrink-0"
                            >
                              {activePrivacy === 'full_name'
                                ? 'Full Name Shown'
                                : 'Initials Only'}
                            </button>
                          </div>

                          {savingPrefCertId === selectedCertificate.id && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6F4FA8]" />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              downloadCertificateAsPdf(selectedCertificate, activeTemplate)
                            }
                            className="px-4 py-2 rounded-xl bg-[#0F1D3A] hover:bg-[#162A52] text-[#DFC278] text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePrintSelected(selectedCertificate)}
                            className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#343047] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print A4</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopyVerifyLink(selectedCertificate)}
                            className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            {copiedCertId === selectedCertificate.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#2F6A40]" />
                                <span>Link Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Verify URL</span>
                              </>
                            )}
                          </button>

                          {onOpenVerification && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenVerification(selectedCertificate.certificateNumber)
                              }
                              className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#0F1D3A] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Verify</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Responsive Live Certificate Preview + Print Target */}
                      <CertificateCardPreview
                        certificate={selectedCertificate}
                        templateOverride={activeTemplate}
                        isPrintTarget={
                          printTargetCertId === null ||
                          printTargetCertId === selectedCertificate.id
                        }
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Pending Certificate Eligibility Checklist */}
          <div className="pastel-card p-6 space-y-4">
            <div>
              <h3 className="font-display text-base font-extrabold text-[#343047]">
                Certificate Readiness &amp; Completion Requirements
              </h3>
              <p className="text-xs text-[#8B8295]">
                Track every requirement needed to unlock upcoming Course, Learning Path, and Excellence certificates.
              </p>
            </div>

            {pendingEligibility.length === 0 && certificates.length === 0 ? (
              <div className="p-5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-xs text-[#6B6178]">
                Generate or open a Learning Path to track course and path certificate eligibility.
              </div>
            ) : pendingEligibility.length === 0 ? (
              <div className="p-5 rounded-[18px] bg-[#DCECD9]/60 border border-[#C2DFBC] text-xs font-bold text-[#2F5B37]">
                You have earned every certificate across your current roadmaps!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingEligibility.slice(0, 6).map((cand) => (
                  <div
                    key={cand.certificateKey}
                    className="p-4 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#6F4FA8]">
                          {cand.certificateTypeLabel}
                        </p>
                        <h4 className="font-display text-sm font-extrabold text-[#343047] truncate">
                          {cand.title}
                        </h4>
                        <p className="text-[11px] text-[#8B8295]">{cand.direction}</p>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-[#343047] tabular-nums shrink-0">
                        {cand.progressPercent}%
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-[#EDE6E3] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#A78BCE]"
                        style={{ width: `${cand.progressPercent}%` }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      {cand.checklist.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2 text-[11px]"
                        >
                          <span
                            className={`flex items-center gap-1.5 ${
                              item.completed
                                ? 'text-[#2F5B37] font-bold'
                                : 'text-[#5E5468]'
                            }`}
                          >
                            {item.completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#2F6A40] shrink-0" />
                            ) : (
                              <Lock className="w-3 h-3 text-[#8B8295] shrink-0" />
                            )}
                            <span>{item.label}</span>
                          </span>
                          <span className="font-mono text-[#6B6178] tabular-nums shrink-0">
                            {item.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: XP HISTORY */}
      {activeTab === 'xp_history' && (
        <div className="pastel-card p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Verified XP Ledger
              </h3>
              <p className="text-xs text-[#8B8295]">
                Immutable history of first-time lesson completions, Knowledge Check passes (80%+), stages, and full paths. Repeated completions never award duplicate XP.
              </p>
            </div>

            {ledgerDirections.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLedgerDirectionFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    ledgerDirectionFilter === 'all'
                      ? 'bg-[#343047] text-white'
                      : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#6B6178]'
                  }`}
                >
                  All Directions
                </button>
                {ledgerDirections.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setLedgerDirectionFilter(dir)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      ledgerDirectionFilter === dir
                        ? 'bg-[#F0E9FA] text-[#5D438E] border border-[#D8C9F2]'
                        : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#6B6178]'
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            )}
          </div>

          {filteredLedger.length === 0 ? (
            <div className="p-6 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-center space-y-2">
              <p className="font-display text-sm font-extrabold text-[#343047]">
                No XP entries recorded yet
              </p>
              <p className="text-xs text-[#6B6178]">
                Complete lessons or pass Knowledge Checks to populate your verified XP history.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredLedger.map((entry) => (
                <div
                  key={entry.eventKey}
                  className="p-3.5 rounded-[18px] bg-[#FAF6F2]/85 border border-[#EEE6E5] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-2xl bg-[#F0E9FA] border border-[#E2D6F5] text-[#6F4FA8] flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#343047] truncate">
                        {entry.title}
                      </p>
                      <p className="text-[11px] text-[#6B6178] truncate">
                        {entry.direction || 'General Learning'} · {entry.eventType.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span className="font-mono text-xs font-extrabold text-[#2F5B37]">
                      +{entry.xpAmount} XP
                    </span>
                    <span className="hidden sm:inline font-mono text-[11px] text-[#8B8295]">
                      {formatAchievementDate(entry.awardedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
