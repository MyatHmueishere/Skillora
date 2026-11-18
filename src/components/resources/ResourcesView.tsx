import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  Play,
  PlayCircle,
  Sparkles,
  Target,
  UserCheck,
  X,
  Youtube,
} from 'lucide-react';
import {
  AppView,
  ExploreResourceCardItem,
  ExploreResourceRelationshipTier,
  ExploreResourcesPayload,
  ResourceItem,
} from '../../types';
import {
  ClayColorVariant,
  ClayIconBadge,
  PottedPlant3D,
} from '../common/PastelIllustrations';
import {
  ExploreResourcesClientError,
  fetchExploreResources,
  getCachedExploreResources,
} from '../../lib/exploreResources';

type ExploreTabKey = 'for_you' | 'all' | 'videos' | 'documentation' | 'courses';

interface ResourcesViewProps {
  resources?: ResourceItem[];
  onToggleSave?: (id: string) => void;
  onNavigate: (view: AppView) => void;
  initialSearch?: string;
  onClearSearch?: () => void;
  authUserId?: string | null;
  personalizationSignature?: string;
}

const RELATIONSHIP_BADGE_STYLES: Record<
  ExploreResourceRelationshipTier,
  { bg: string; text: string; border: string; fallbackLabel: string }
> = {
  direct: {
    bg: 'bg-[#DCECD9]',
    text: 'text-[#2F5B37]',
    border: 'border-[#BDD8B8]',
    fallbackLabel: 'Directly relevant',
  },
  supporting: {
    bg: 'bg-[#EDE5FA]',
    text: 'text-[#5E3F99]',
    border: 'border-[#D7C6F3]',
    fallbackLabel: 'Supporting interest',
  },
  related: {
    bg: 'bg-[#FFF1D6]',
    text: 'text-[#7A5720]',
    border: 'border-[#EFD7A3]',
    fallbackLabel: 'Related discovery',
  },
};

function getPrimaryDirectionSourceLabel(
  source: ExploreResourcesPayload['personalizationSummary']['primaryDirectionSource']
): string {
  switch (source) {
    case 'explicit':
      return 'Explicit Focus';
    case 'active_roadmap':
      return 'From Active Roadmap';
    case 'profile_goal':
      return 'From Profile Goal';
    default:
      return 'Not Set';
  }
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  onNavigate,
  initialSearch = '',
  onClearSearch,
  authUserId = null,
  personalizationSignature = '',
}) => {
  const [activeTab, setActiveTab] = useState<ExploreTabKey>('for_you');
  const [data, setData] = useState<ExploreResourcesPayload | null>(() =>
    getCachedExploreResources(authUserId)
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedExploreResources(authUserId)
  );
  const [error, setError] = useState<string>('');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const activeUserRef = useRef<string | null>(authUserId);
  activeUserRef.current = authUserId;
  const lastFetchedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const expectedUserId = authUserId ?? null;
    const currentSignature = `${expectedUserId ?? ''}|${personalizationSignature}`;
    const shouldForceRefresh =
      lastFetchedSignatureRef.current !== null &&
      lastFetchedSignatureRef.current !== currentSignature;

    lastFetchedSignatureRef.current = currentSignature;
    const cachedHit = !shouldForceRefresh
      ? getCachedExploreResources(expectedUserId)
      : null;

    if (cachedHit) {
      setData(cachedHit);
      setLoading(false);
      setError('');
      setPlayingVideoId(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError('');
    setPlayingVideoId(null);

    fetchExploreResources({
      userId: expectedUserId,
      forceRefresh: shouldForceRefresh,
    })
      .then((payload) => {
        if (!cancelled && (activeUserRef.current ?? null) === expectedUserId) {
          setData(payload);
        }
      })
      .catch((err) => {
        if (!cancelled && (activeUserRef.current ?? null) === expectedUserId) {
          if (err instanceof ExploreResourcesClientError) {
            setError(err.message);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Unable to load Explore Resources right now.');
          }
        }
      })
      .finally(() => {
        if (!cancelled && (activeUserRef.current ?? null) === expectedUserId) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUserId, personalizationSignature]);

  useEffect(() => {
    setPlayingVideoId(null);
  }, [activeTab]);

  const searchQuery = initialSearch.trim().toLowerCase();

  const matchesSearch = (item: ExploreResourceCardItem, query: string): boolean => {
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.provider.toLowerCase().includes(query) ||
      item.type.toLowerCase().includes(query) ||
      item.subjectLabel.toLowerCase().includes(query)
    );
  };

  const filteredForYou = useMemo(() => {
    if (!data) return [];
    if (!searchQuery) return data.forYou;
    return data.forYou.filter((item) => matchesSearch(item, searchQuery));
  }, [data, searchQuery]);

  const filteredContinueLearning = useMemo(() => {
    if (!data) return [];
    const list = data.continueLearning ?? [];
    if (!searchQuery) return list;
    return list.filter((item) => matchesSearch(item, searchQuery));
  }, [data, searchQuery]);

  const discoverSearchFallback = useMemo(() => {
    if (!data || !searchQuery || activeTab !== 'for_you') return [];
    if (filteredForYou.length > 0 || filteredContinueLearning.length > 0) return [];
    return data.all.filter((item) => matchesSearch(item, searchQuery));
  }, [data, searchQuery, activeTab, filteredForYou.length, filteredContinueLearning.length]);

  const rawTabItems = useMemo<ExploreResourceCardItem[]>(() => {
    if (!data) return [];
    switch (activeTab) {
      case 'for_you':
        return data.forYou;
      case 'all':
        return data.all;
      case 'videos':
        return data.videos;
      case 'documentation':
        return data.documentation;
      case 'courses':
        return data.courses;
      default:
        return data.all;
    }
  }, [data, activeTab]);

  const visibleItems = useMemo(() => {
    if (!searchQuery) return rawTabItems;
    return rawTabItems.filter((item) => matchesSearch(item, searchQuery));
  }, [rawTabItems, searchQuery]);

  const searchMatchCount = useMemo(() => {
    if (!searchQuery) return visibleItems.length;
    if (activeTab === 'for_you') {
      const uniqueIds = new Set([
        ...filteredForYou.map((i) => i.id),
        ...filteredContinueLearning.map((i) => i.id),
      ]);
      return uniqueIds.size > 0 ? uniqueIds.size : discoverSearchFallback.length;
    }
    return visibleItems.length;
  }, [
    searchQuery,
    activeTab,
    visibleItems.length,
    filteredForYou,
    filteredContinueLearning,
    discoverSearchFallback.length,
  ]);

  const tabs: {
    key: ExploreTabKey;
    label: string;
    count: number;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      key: 'for_you',
      label: 'For You',
      count: data?.forYou.length ?? 0,
      icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#A78BCE] text-white shadow-xs',
    },
    {
      key: 'all',
      label: 'All',
      count: data?.all.length ?? 0,
      icon: <Compass className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#8E6EC8] text-white shadow-xs',
    },
    {
      key: 'videos',
      label: 'Videos',
      count: data?.videos.length ?? 0,
      icon: <Youtube className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#A78BCE] text-white shadow-xs',
    },
    {
      key: 'documentation',
      label: 'Documentation',
      count: data?.documentation.length ?? 0,
      icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#73B082] text-white shadow-xs',
    },
    {
      key: 'courses',
      label: 'Courses',
      count: data?.courses.length ?? 0,
      icon: <GraduationCap className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#E58D7A] text-white shadow-xs',
    },
  ];

  const getTabTheme = (
    tabCategory: ExploreResourceCardItem['tabCategory']
  ): {
    variant: ClayColorVariant;
    tint: string;
    badgeText: string;
    icon: React.ReactNode;
  } => {
    switch (tabCategory) {
      case 'video':
        return {
          variant: 'lavender',
          tint: 'bg-[#F3ECFC]/85',
          badgeText: 'text-[#6F4FA8]',
          icon: <Youtube className="w-5 h-5" />,
        };
      case 'documentation':
        return {
          variant: 'mint',
          tint: 'bg-[#EEF7EE]/90',
          badgeText: 'text-[#2F5B37]',
          icon: <BookOpen className="w-5 h-5" />,
        };
      case 'course':
      default:
        return {
          variant: 'peach',
          tint: 'bg-[#FCEAE5]/80',
          badgeText: 'text-[#9E4F3E]',
          icon: <GraduationCap className="w-5 h-5" />,
        };
    }
  };

  const renderResourceCard = (
    item: ExploreResourceCardItem,
    options?: { showRelationshipBadge?: boolean }
  ) => {
    const theme = getTabTheme(item.tabCategory);
    const isVideo = item.tabCategory === 'video';
    const canEmbedVideo = Boolean(
      isVideo && item.embedAllowed && item.videoId && item.embedUrl
    );
    const isPlaying = Boolean(canEmbedVideo && playingVideoId === item.id);
    const showRelBadge = Boolean(options?.showRelationshipBadge && item.relationshipTier);
    const relStyle = item.relationshipTier
      ? RELATIONSHIP_BADGE_STYLES[item.relationshipTier]
      : null;

    return (
      <article
        key={item.id}
        className="pastel-card pastel-card-hover p-5 flex flex-col justify-between gap-4"
      >
        <div className="space-y-3.5">
          {/* Video Embed or Thumbnail (verified YouTube videos) */}
          {isVideo &&
            (isPlaying && item.embedUrl ? (
              <div className="space-y-2">
                <div className="relative w-full aspect-video rounded-[18px] overflow-hidden border border-[#D8C9F2] bg-[#1F1B2E]">
                  <iframe
                    src={item.embedUrl}
                    title={item.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPlayingVideoId(null)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFFCFA] border border-[#E2D6F5] text-[11px] font-bold text-[#6F4FA8] hover:bg-[#F0E9FA]"
                  >
                    <X className="w-3 h-3" />
                    <span>Close Player</span>
                  </button>
                </div>
              </div>
            ) : item.thumbnailUrl ? (
              <div className="relative w-full aspect-video rounded-[18px] overflow-hidden border border-[#E5DAF5] bg-[#EDE5F8] group">
                <img
                  src={item.thumbnailUrl}
                  alt={`${item.title} thumbnail`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#2B263B]/45 via-transparent to-transparent" />
                {canEmbedVideo && (
                  <button
                    type="button"
                    onClick={() => setPlayingVideoId(item.id)}
                    aria-label={`Play ${item.title}`}
                    className="absolute inset-0 flex items-center justify-center group"
                  >
                    <span className="w-12 h-12 rounded-full bg-[#FFFCFA]/95 text-[#7B59B6] flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                      <Play className="w-5 h-5 fill-[#7B59B6] ml-0.5" />
                    </span>
                  </button>
                )}
              </div>
            ) : null)}

          {/* Resource Type & Subject Header */}
          <div className={`p-3 rounded-[16px] ${theme.tint} flex items-center justify-between gap-2`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <ClayIconBadge variant={theme.variant} size="sm">
                {theme.icon}
              </ClayIconBadge>
              <div className="min-w-0">
                <p className={`text-[11px] font-extrabold truncate ${theme.badgeText}`}>
                  {item.type}
                </p>
                <p className="text-[11px] font-semibold text-[#5E5468] truncate">
                  {item.subjectLabel}
                </p>
              </div>
            </div>

            {item.tabCategory === 'course' && item.pricing && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                  item.pricing === 'Free'
                    ? 'bg-[#DCECD9] text-[#2F5B37]'
                    : 'bg-[#FFF1D6] text-[#7A5720]'
                }`}
              >
                {item.pricing}
              </span>
            )}
          </div>

          {/* Relationship Tier Badge (For You / Continue Learning) */}
          {showRelBadge && relStyle && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${relStyle.bg} ${relStyle.text} ${relStyle.border}`}
              >
                {item.relationshipLabel || relStyle.fallbackLabel}
              </span>
            </div>
          )}

          {/* Title & Short Description */}
          <div className="space-y-1.5">
            <h3 className="font-display text-sm sm:text-base font-extrabold text-[#343047] leading-snug">
              {item.title}
            </h3>
            <p className="text-xs text-[#6B6178] leading-relaxed line-clamp-3">
              {item.description}
            </p>
            {options?.showRelationshipBadge && item.matchReason && (
              <p className="text-[11px] font-bold text-[#6F4FA8] pt-0.5">
                {item.matchReason}
              </p>
            )}
          </div>
        </div>

        {/* Provider & Actions */}
        <div className="pt-3 border-t border-[#EEE6E5] flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B8295] block">
              Provider
            </span>
            <span className="text-xs font-bold text-[#343047] truncate block">
              {item.provider}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEmbedVideo && (
              <button
                type="button"
                onClick={() =>
                  setPlayingVideoId((prev) => (prev === item.id ? null : item.id))
                }
                className="clay-button-soft px-3 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>{isPlaying ? 'Hide' : 'Play'}</span>
              </button>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="clay-button-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <span>Explore</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </article>
    );
  };

  const summary = data?.personalizationSummary;
  const supportingTags =
    summary?.supportingInterests && summary.supportingInterests.length > 0
      ? summary.supportingInterests
      : summary?.interests ?? [];

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Discovery Header */}
      <div
        className="rounded-[26px] border border-[#D4E5D1] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
        style={{
          background: 'linear-gradient(135deg, #E5F0E3 0%, #FAF6F2 55%, #FFF1D6 100%)',
          boxShadow: '0 12px 30px -12px rgba(134, 178, 138, 0.25)',
        }}
      >
        <div className="flex items-center gap-5">
          <PottedPlant3D className="w-20 h-24 hidden sm:block shrink-0" />
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3C7347] bg-[#FFFCFA] px-3 py-1 rounded-full border border-[#D4E5D1]">
              <Compass className="w-3.5 h-3.5 text-[#69A878]" />
              <span>Focused Discovery Library</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              Explore Resources
            </h1>
            <p className="text-xs sm:text-sm text-[#5E586B] max-w-2xl leading-relaxed">
              Verified educational videos, official documentation, and courses focused on your primary learning direction in For You, or discover freely across all subjects.
            </p>
          </div>
        </div>
      </div>

      {/* Five Simple Horizontal Tabs */}
      <div className="pastel-card p-3 sm:p-4 space-y-3">
        <div
          role="tablist"
          aria-label="Explore Resources categories"
          className="flex items-center gap-1.5 overflow-x-auto sm:grid sm:grid-cols-5 p-1.5 bg-[#FAF6F2] border border-[#EEE6E5] rounded-2xl"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`min-w-[116px] sm:min-w-0 w-full px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? tab.activeClass
                    : 'text-[#6B6178] hover:text-[#343047] hover:bg-[#FFFCFA]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {!loading && data && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-[#EEE6E5]/80 text-[#5E5468]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Optional active TopNavbar search indicator */}
        {searchQuery && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F7F3FC] border border-[#E5DAF5] text-xs text-[#5E5468]">
            <span>
              Filtering by search: <strong className="text-[#343047]">"{initialSearch.trim()}"</strong> ({searchMatchCount} matches)
            </span>
            {onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="inline-flex items-center gap-1 text-[#6F4FA8] font-bold hover:underline"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading / Error States */}
      {loading ? (
        <div className="pastel-card p-12 flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#8E6EC8]" />
          <p className="font-display text-sm font-extrabold text-[#343047]">
            Loading Explore Resources...
          </p>
          <p className="text-xs text-[#8B8295]">
            Aligning verified videos, documentation, and courses with your direction
          </p>
        </div>
      ) : error ? (
        <div className="pastel-card p-8 flex flex-col items-center text-center gap-3">
          <AlertCircle className="w-7 h-7 text-[#C26D5B]" />
          <p className="font-display text-sm font-extrabold text-[#343047]">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError('');
              fetchExploreResources({ userId: authUserId, forceRefresh: true })
                .then((payload) => {
                  if ((activeUserRef.current ?? null) === (authUserId ?? null)) {
                    setData(payload);
                  }
                })
                .catch((err) => {
                  if ((activeUserRef.current ?? null) === (authUserId ?? null)) {
                    setError(
                      err instanceof Error ? err.message : 'Unable to reload resources.'
                    );
                  }
                })
                .finally(() => {
                  if ((activeUserRef.current ?? null) === (authUserId ?? null)) {
                    setLoading(false);
                  }
                });
            }}
            className="clay-button-primary px-4 py-2 text-xs font-bold"
          >
            Try Again
          </button>
        </div>
      ) : !data ? null : activeTab === 'for_you' ? (
        <div className="space-y-8">
          {/* SECTION A: RECOMMENDED FOR YOU */}
          <section aria-labelledby="section-recommended-for-you" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <h2
                  id="section-recommended-for-you"
                  className="font-display text-lg sm:text-xl font-extrabold text-[#343047]"
                >
                  Recommended for You
                </h2>
                <p className="text-xs text-[#6B6178]">
                  3–5 focused resources aligned with your primary learning direction and supporting interests
                </p>
              </div>
            </div>

            {/* Primary Learning Direction Status Banner */}
            {!data.hasSufficientPersonalization ||
            summary?.primaryDirectionSource === 'unset' ||
            !summary?.primaryDirection ? (
              <div className="rounded-[22px] bg-[#FFF4E0]/85 border border-[#F2DCAB] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ClayIconBadge variant="yellow" size="sm">
                    <UserCheck className="w-4 h-4" />
                  </ClayIconBadge>
                  <div className="space-y-1">
                    <p className="font-display text-sm font-extrabold text-[#343047]">
                      {data.authenticated
                        ? 'Set your Primary Learning Direction for focused recommendations'
                        : 'Sign in & choose a Primary Learning Direction to personalize For You'}
                    </p>
                    <p className="text-xs text-[#6B5220] leading-relaxed">
                      Pick one primary focus (plus optional supporting interests) in My Profile so Skillora recommends verified videos, documentation, and courses built around your direction. Browse Discover More tabs anytime.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  {data.authenticated && (
                    <button
                      type="button"
                      onClick={() => onNavigate('profile')}
                      className="clay-button-primary px-4 py-2 text-xs font-bold"
                    >
                      Set Direction
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className="clay-button-soft px-4 py-2 text-xs font-bold text-[#6F4FA8]"
                  >
                    Browse All
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] bg-[#F4EEFC] border border-[#E2D6F5] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#5D5470]">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Target className="w-4 h-4 text-[#8E6EC8] shrink-0" />
                    <span className="font-bold text-[#343047]">
                      Primary Direction:
                    </span>
                    <span className="font-extrabold text-[#5E3F99]">
                      {summary.primaryDirection}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FFFCFA] border border-[#D8C9F2] text-[#6F4FA8]">
                      {getPrimaryDirectionSourceLabel(summary.primaryDirectionSource)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#6B6178]">
                    {supportingTags.length > 0 && (
                      <span>
                        Supporting:{' '}
                        <strong className="text-[#343047]">
                          {supportingTags.slice(0, 4).join(', ')}
                        </strong>
                      </span>
                    )}
                    {summary.careerGoal &&
                      summary.careerGoal.trim().toLowerCase() !==
                        summary.primaryDirection.trim().toLowerCase() && (
                        <span>· Goal: {summary.careerGoal}</span>
                      )}
                    <span>· Level: {summary.knowledgeLevel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('profile')}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0 self-start sm:self-auto"
                >
                  Change Direction
                </button>
              </div>
            )}

            {/* Honest Resource Shortage Note */}
            {summary?.shortageNote && (
              <div className="rounded-[20px] bg-[#FFF4E0]/80 border border-[#F2DCAB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#6B5220]">
                <div className="space-y-0.5">
                  <p className="font-extrabold text-[#343047]">
                    Limited verified resources for this exact direction
                  </p>
                  <p className="leading-relaxed">{summary.shortageNote}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] shrink-0 self-start sm:self-auto"
                >
                  Discover More
                </button>
              </div>
            )}

            {/* Recommended Cards Grid */}
            {filteredForYou.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredForYou.map((item) =>
                  renderResourceCard(item, { showRelationshipBadge: true })
                )}
              </div>
            ) : discoverSearchFallback.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#6F4FA8]">
                  No For You items matched "{initialSearch.trim()}". Showing matching verified resources from Discover More:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {discoverSearchFallback.map((item) => renderResourceCard(item))}
                </div>
              </div>
            ) : searchQuery ? (
              <div className="pastel-card p-8 text-center space-y-2.5">
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  No recommended resources matched "{initialSearch.trim()}"
                </p>
                {onClearSearch && (
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="clay-button-soft px-4 py-2 text-xs font-bold"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              data.hasSufficientPersonalization &&
              !summary?.shortageNote && (
                <div className="pastel-card p-7 text-center space-y-2">
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    No verified matches found yet for this direction
                  </p>
                  <p className="text-xs text-[#6B6178] max-w-md mx-auto">
                    Try refining your Primary Learning Direction or explore the Discover More library below.
                  </p>
                </div>
              )
            )}
          </section>

          {/* SECTION B: CONTINUE YOUR LEARNING */}
          {data.authenticated && (
            <section aria-labelledby="section-continue-learning" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div className="space-y-1">
                  <h2
                    id="section-continue-learning"
                    className="font-display text-lg sm:text-xl font-extrabold text-[#343047]"
                  >
                    Continue Your Learning
                  </h2>
                  <p className="text-xs text-[#6B6178]">
                    Resources matched directly to your current course stage, active lesson, and recent knowledge gaps
                  </p>
                  {(summary?.currentCourseTitle || summary?.currentLessonTitle) && (
                    <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px] text-[#5E5468]">
                      {summary.currentCourseTitle && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#EEF7EE] border border-[#C9E3C6] font-bold text-[#2F5B37]">
                          Course: {summary.currentCourseTitle}
                        </span>
                      )}
                      {summary.currentLessonTitle && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#F3ECFC] border border-[#DED0F5] font-bold text-[#5E3F99]">
                          Current Lesson: {summary.currentLessonTitle}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('roadmap')}
                  className="text-xs font-bold text-[#6F4FA8] hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
                >
                  <span>Open Learning Path</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {filteredContinueLearning.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredContinueLearning.map((item) =>
                    renderResourceCard(item, { showRelationshipBadge: true })
                  )}
                </div>
              ) : !searchQuery ? (
                <div className="pastel-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <ClayIconBadge variant="mint" size="sm">
                      <Layers className="w-4 h-4" />
                    </ClayIconBadge>
                    <div className="space-y-1">
                      <p className="font-display text-sm font-extrabold text-[#343047]">
                        No active lesson or knowledge gap resources yet
                      </p>
                      <p className="text-xs text-[#6B6178] leading-relaxed">
                        Generate your Learning Path or take a Skill Assessment to see resources matched to your next lesson.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onNavigate('roadmap')}
                      className="clay-button-primary px-3.5 py-2 text-xs font-bold"
                    >
                      Learning Path
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('assessment')}
                      className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8]"
                    >
                      Skill Assessment
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {/* SECTION C: DISCOVER MORE (Quick Navigation Footer) */}
          <section aria-labelledby="section-discover-more" className="pastel-card p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2
                  id="section-discover-more"
                  className="font-display text-base sm:text-lg font-extrabold text-[#343047]"
                >
                  Discover More
                </h2>
                <p className="text-xs text-[#6B6178] max-w-2xl">
                  Browse verified Videos, Documentation, and Courses across Computer Science, Engineering, GIS & Environmental Science, Business, and Data.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#5E3F99] inline-flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>All ({data.all.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('videos')}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5"
                >
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Videos ({data.videos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('documentation')}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#2F5B37] inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Documentation ({data.documentation.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('courses')}
                  className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#9E4F3E] inline-flex items-center gap-1.5"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Courses ({data.courses.length})</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="pastel-card p-10 text-center space-y-2.5">
          <p className="font-display text-base font-extrabold text-[#343047]">
            No matching resources in this tab
          </p>
          <p className="text-xs text-[#8B8295] max-w-md mx-auto">
            {searchQuery
              ? 'Try clearing your search or switching to the All tab to browse every verified subject.'
              : 'Explore the All tab to browse verified learning resources across all subjects.'}
          </p>
          <div className="pt-1 flex items-center justify-center gap-2">
            {searchQuery && onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="clay-button-soft px-4 py-2 text-xs font-bold"
              >
                Clear Search
              </button>
            )}
            {activeTab !== 'all' && (
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className="clay-button-primary px-4 py-2 text-xs font-bold"
              >
                Browse All Resources
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5E5468]">
            <span>
              <strong className="text-[#343047]">Discover More:</strong> Balanced library across Engineering, GIS & Environmental Science, Business, Data, and Computer Science.
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('for_you')}
              className="font-bold text-[#6F4FA8] hover:underline"
            >
              Back to For You
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleItems.map((item) => renderResourceCard(item))}
          </div>
        </div>
      )}
    </div>
  );
};
