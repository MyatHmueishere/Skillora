import React, { useState, useEffect } from 'react';
import {
  Search,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Clock,
  Play,
  FileText,
  Code,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { ResourceItem, AppView } from '../../types';
import {
  ClayIconBadge,
  ClayColorVariant,
  PottedPlant3D,
} from '../common/PastelIllustrations';

interface ResourcesViewProps {
  resources: ResourceItem[];
  onToggleSave: (id: string) => void;
  onNavigate: (view: AppView) => void;
  initialSearch?: string;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  resources,
  onToggleSave,
  onNavigate,
  initialSearch = '',
}) => {
  const [search, setSearch] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [activeResourceModal, setActiveResourceModal] = useState<ResourceItem | null>(null);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const categories = ['All', 'Programming', 'Data Science', 'AI & ML', 'Web Development', 'Career Prep'];
  const difficulties = ['All', 'Beginner', 'Intermediate', 'Advanced'];
  const types = ['All', 'Course', 'Video Tutorial', 'Article', 'Programming Exercise'];

  const filteredResources = resources.filter((res) => {
    const matchesSearch =
      search === '' ||
      res.title.toLowerCase().includes(search.toLowerCase()) ||
      res.description.toLowerCase().includes(search.toLowerCase()) ||
      res.category.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || res.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'All' || res.difficulty === selectedDifficulty;
    const matchesType = selectedType === 'All' || res.type === selectedType;

    return matchesSearch && matchesCategory && matchesDifficulty && matchesType;
  });

  const getTypeIcon = (type: ResourceItem['type']) => {
    switch (type) {
      case 'Video Tutorial':
        return <Play className="w-5 h-5" />;
      case 'Article':
        return <FileText className="w-5 h-5" />;
      case 'Programming Exercise':
        return <Code className="w-5 h-5" />;
      case 'Course':
      default:
        return <Layers className="w-5 h-5" />;
    }
  };

  const getCategoryTheme = (
    cat: ResourceItem['category']
  ): { variant: ClayColorVariant; tint: string } => {
    switch (cat) {
      case 'Programming':
        return { variant: 'lavender', tint: 'bg-[#F0E9FA]/75' };
      case 'Data Science':
        return { variant: 'mint', tint: 'bg-[#DCECD9]/65' };
      case 'Web Development':
        return { variant: 'peach', tint: 'bg-[#FCEAE5]/75' };
      case 'AI & ML':
        return { variant: 'pink', tint: 'bg-[#FBE6EC]/75' };
      case 'Career Prep':
      default:
        return { variant: 'yellow', tint: 'bg-[#FFF1D6]/75' };
    }
  };

  const getDifficultyPill = (diff: ResourceItem['difficulty']) => {
    switch (diff) {
      case 'Beginner':
        return 'bg-[#DCECD9] text-[#356640]';
      case 'Intermediate':
        return 'bg-[#F0E9FA] text-[#6B4FA1]';
      case 'Advanced':
        return 'bg-[#FCEAE5] text-[#9C5042]';
    }
  };

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Discovery Space Header */}
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
              <BookOpen className="w-3.5 h-3.5 text-[#69A878]" />
              <span>Creative Learning Library</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              Explore Learning Resources
            </h1>
            <p className="text-xs sm:text-sm text-[#5E586B] max-w-xl leading-relaxed">
              Curated courses, interactive coding sandboxes, technical articles, and walkthroughs tailored to your personalized learning path.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('assistant')}
          className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 shrink-0 self-start md:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          <span>Ask AI to Recommend</span>
        </button>
      </div>

      {/* Search & Filters Card */}
      <div className="pastel-card p-5 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8B8295] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by topic, keyword, Python, FastAPI, SQL, algorithms..."
            className="w-full pl-11 pr-4 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-full focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A49BB0]"
          />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1 border-t border-[#EEE6E5]">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-[#A78BCE] text-white shadow-xs'
                    : 'bg-[#FAF6F2] text-[#6B6178] hover:bg-[#F0E9FA] border border-[#EEE6E5]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-[#6B6178]">
              <span className="font-bold text-[#343047]">Difficulty:</span>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="px-3 py-1.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-full focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047] font-semibold"
              >
                {difficulties.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#6B6178]">
              <span className="font-bold text-[#343047]">Format:</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-1.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-full focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047] font-semibold"
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-[#8B8295] px-1">
          <span>Showing {filteredResources.length} learning resources</span>
          {(selectedCategory !== 'All' || selectedDifficulty !== 'All' || selectedType !== 'All' || search) && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('All');
                setSelectedDifficulty('All');
                setSelectedType('All');
              }}
              className="text-[#8E6EC8] hover:underline font-bold"
            >
              Reset all filters
            </button>
          )}
        </div>

        {filteredResources.length === 0 ? (
          <div className="pastel-card p-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F0E9FA] flex items-center justify-center text-[#A78BCE]">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="font-display text-base font-extrabold text-[#343047]">
              No matching resources found
            </h3>
            <p className="text-xs text-[#8B8295] max-w-sm mx-auto">
              Try adjusting your search keywords or resetting the category and difficulty filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredResources.map((res) => {
              const theme = getCategoryTheme(res.category);
              return (
                <div
                  key={res.id}
                  className="pastel-card pastel-card-hover p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3.5">
                    {/* Top Illustrated Pastel Strip */}
                    <div
                      className={`p-3.5 rounded-[18px] ${theme.tint} flex items-center justify-between`}
                    >
                      <div className="flex items-center gap-3">
                        <ClayIconBadge variant={theme.variant} size="md">
                          {getTypeIcon(res.type)}
                        </ClayIconBadge>
                        <div>
                          <p className="text-[11px] font-bold text-[#343047]">{res.category}</p>
                          <p className="text-[10px] text-[#6B6178] font-medium">{res.type}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => onToggleSave(res.id)}
                        className={`p-2 rounded-full transition-colors ${
                          res.saved
                            ? 'bg-[#FFFCFA] text-[#8E6EC8] shadow-xs'
                            : 'bg-[#FFFCFA]/60 text-[#8B8295] hover:bg-[#FFFCFA] hover:text-[#343047]'
                        }`}
                        title={res.saved ? 'Remove bookmark' : 'Bookmark resource'}
                      >
                        {res.saved ? (
                          <BookmarkCheck className="w-4 h-4 fill-current" />
                        ) : (
                          <Bookmark className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Title & Metadata */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getDifficultyPill(
                            res.difficulty
                          )}`}
                        >
                          {res.difficulty}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[#8B8295] font-mono">
                          <Clock className="w-3 h-3" />
                          {res.duration}
                        </span>
                      </div>

                      <h3 className="font-display text-sm font-extrabold text-[#343047] leading-snug">
                        {res.title}
                      </h3>
                    </div>

                    <p className="text-xs text-[#6B6178] line-clamp-3 leading-relaxed">
                      {res.description}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-[#EEE6E5] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#8B8295] truncate">
                      By <span className="text-[#343047] font-semibold">{res.author}</span>
                    </span>

                    <button
                      onClick={() => setActiveResourceModal(res)}
                      className="clay-button-primary px-4 py-1.5 text-xs font-bold shrink-0"
                    >
                      Start Learning
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resource Study Modal */}
      {activeResourceModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#343047]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-[#FFFCFA] rounded-[26px] shadow-[0_24px_60px_-14px_rgba(74,56,102,0.3)] border border-[#EEE6E5] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-[#EEE6E5] flex items-start justify-between gap-4 bg-gradient-to-r from-[#F0E9FA] via-[#FAF6F2] to-[#FCEAE5]">
              <div className="flex items-start gap-4">
                <ClayIconBadge
                  variant={getCategoryTheme(activeResourceModal.category).variant}
                  size="lg"
                >
                  {getTypeIcon(activeResourceModal.type)}
                </ClayIconBadge>
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#8E6EC8] font-bold mb-1">
                    <span>{activeResourceModal.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeResourceModal.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeResourceModal.duration}</span>
                  </div>
                  <h3 className="font-display text-lg font-extrabold text-[#343047] leading-snug">
                    {activeResourceModal.title}
                  </h3>
                  <p className="text-xs text-[#8B8295] mt-0.5">
                    Published by {activeResourceModal.author} · {activeResourceModal.difficulty}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveResourceModal(null)}
                className="p-2 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] text-[#8B8295] hover:text-[#343047] shadow-xs transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 max-h-[55vh] overflow-y-auto space-y-4">
              <div className="p-4 rounded-[20px] bg-[#F0E9FA]/75 border border-[#DFD2F2] text-xs text-[#343047] space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-[#6F4FA8]">
                  <Sparkles className="w-4 h-4" />
                  Skillora Curriculum Integration
                </p>
                <p className="leading-relaxed text-[#5D5470]">
                  This resource reinforces key skills required for your Stage 3 & Stage 4 roadmap milestones.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B8295] mb-1.5">
                  Overview & Abstract
                </h4>
                <p className="text-xs sm:text-sm text-[#343047] leading-relaxed">
                  {activeResourceModal.description}
                </p>
              </div>

              {activeResourceModal.contentPreview && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B8295] mb-1.5">
                    Study Material Excerpt
                  </h4>
                  <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] text-xs text-[#4C455B] font-mono leading-relaxed">
                    {activeResourceModal.contentPreview}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 px-6 border-t border-[#EEE6E5] bg-[#FAF6F2]/70 flex items-center justify-between">
              <button
                onClick={() => onToggleSave(activeResourceModal.id)}
                className="flex items-center gap-1.5 text-xs font-bold text-[#6B6178] hover:text-[#343047]"
              >
                <Bookmark className="w-4 h-4" />
                <span>{activeResourceModal.saved ? 'Bookmarked' : 'Save for Later'}</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveResourceModal(null)}
                  className="clay-button-soft px-4 py-2 text-xs font-bold"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setActiveResourceModal(null);
                    onNavigate('roadmap');
                  }}
                  className="clay-button-primary px-5 py-2 text-xs font-bold"
                >
                  Mark as Underway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
