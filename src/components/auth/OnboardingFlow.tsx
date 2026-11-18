import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Plus,
  X,
  Loader2,
  Edit2,
  Code2,
  BrainCircuit,
  Briefcase,
  Palette,
  Shield,
  MessageSquare,
  BarChart2,
  BookOpen,
  Clock,
  Compass,
  Cpu,
  Globe,
  Search,
  Layers,
} from 'lucide-react';
import { UserProfile } from '../../types';
import { CuteStudentCharacter3D, SmilingCloudMascot3D } from '../common/PastelIllustrations';
import {
  ONBOARDING_INTEREST_CATEGORIES,
  LEARNING_GOAL_SUGGESTIONS,
  filterPrimaryDirectionSuggestions,
  getSkillSuggestionsForInterests,
} from '../../lib/learningRecommendations';
import { getSupabaseClient, formatAuthError } from '../../lib/supabase';
import { saveStudentProfile, StudentProfileDbError } from '../../lib/studentProfile';

export interface OnboardingCompleteOptions {
  generateRoadmap?: boolean;
}

interface OnboardingFlowProps {
  initialProfile?: Partial<UserProfile>;
  fallbackEmail?: string;
  fallbackName?: string;
  onComplete: (savedProfile: UserProfile, options?: OnboardingCompleteOptions) => void;
  onError: (msg: string) => void;
}

const STEP_TITLES = [
  'Primary Learning Direction',
  'Starting Point & Background',
  'Supporting Interests',
  'Review & Generate Roadmap',
];

const INTEREST_META: Record<string, { icon: React.ReactNode; tint: string }> = {
  Programming: {
    icon: <Code2 className="w-4 h-4 text-[#7D5DB8]" />,
    tint: 'bg-[#F0E9FA] border-[#C9B7E8] text-[#4C3678]',
  },
  'AI & Data Science': {
    icon: <BrainCircuit className="w-4 h-4 text-[#C26A58]" />,
    tint: 'bg-[#FCEAE5] border-[#F0C2B5] text-[#7D3B2E]',
  },
  'Business & Management': {
    icon: <Briefcase className="w-4 h-4 text-[#9D7226]" />,
    tint: 'bg-[#FFF1D6] border-[#ECD094] text-[#664A17]',
  },
  'Engineering & Systems': {
    icon: <Cpu className="w-4 h-4 text-[#5D5490]" />,
    tint: 'bg-[#EDE9F8] border-[#C5BCEB] text-[#3F3868]',
  },
  'Geography & Environmental': {
    icon: <Globe className="w-4 h-4 text-[#3A7D58]" />,
    tint: 'bg-[#E1F2E8] border-[#B4DBC5] text-[#234F37]',
  },
  'Design & Creativity': {
    icon: <Palette className="w-4 h-4 text-[#B75674]" />,
    tint: 'bg-[#FDEBF1] border-[#F3C0D1] text-[#783148]',
  },
  'Cybersecurity & IT': {
    icon: <Shield className="w-4 h-4 text-[#437E50]" />,
    tint: 'bg-[#DCECD9] border-[#B4D8AE] text-[#284E30]',
  },
  'Communication & Professional Skills': {
    icon: <MessageSquare className="w-4 h-4 text-[#7D5DB8]" />,
    tint: 'bg-[#F0E9FA] border-[#C9B7E8] text-[#4C3678]',
  },
  'Finance & Data Tools': {
    icon: <BarChart2 className="w-4 h-4 text-[#9D7226]" />,
    tint: 'bg-[#FFF1D6] border-[#ECD094] text-[#664A17]',
  },
  'Languages & Academic Skills': {
    icon: <BookOpen className="w-4 h-4 text-[#C26A58]" />,
    tint: 'bg-[#FCEAE5] border-[#F0C2B5] text-[#7D3B2E]',
  },
};

function inferSkillSuggestionsForDirection(direction: string): string[] {
  const lower = direction.toLowerCase();
  if (/(ai engineer|machine learning|data scientist|deep learning)/.test(lower)) {
    return ['Python Basics', 'Data Structures', 'SQL', 'NumPy / Pandas', 'Statistics', 'Linear Algebra', 'Git & GitHub'];
  }
  if (/(data analyst|analytics|bi)/.test(lower)) {
    return ['Excel / Spreadsheets', 'SQL', 'Data Visualization', 'Python Basics', 'Statistics', 'Pandas'];
  }
  if (/(ui\/ux|ux|product design|designer)/.test(lower)) {
    return ['Basic Graphic Design', 'Figma', 'Wireframing', 'Typography & Layout', 'User Research', 'Accessibility (WCAG)'];
  }
  if (/(frontend|web developer|react)/.test(lower)) {
    return ['HTML / CSS', 'JavaScript', 'React', 'TypeScript', 'Responsive Design', 'Git & GitHub'];
  }
  if (/(backend|api|software engineer|full-stack)/.test(lower)) {
    return ['JavaScript / TypeScript', 'Python', 'SQL', 'REST APIs', 'Node.js / Express', 'Git & GitHub'];
  }
  if (/(cybersecurity|security)/.test(lower)) {
    return ['Networking Basics', 'Linux', 'Security Hygiene', 'Cloud Fundamentals', 'Python Basics'];
  }
  if (/(business|project manager|product manager|marketing|marketer)/.test(lower)) {
    return ['Project Management', 'Agile / OKRs', 'Excel / Spreadsheets', 'Market Research', 'SEO Basics', 'Public Speaking'];
  }
  return [];
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialProfile,
  fallbackEmail = '',
  fallbackName = '',
  onComplete,
  onError,
}) => {
  const [step, setStep] = useState(1);

  const [fullName, setFullName] = useState(initialProfile?.name || fallbackName || '');
  const [email] = useState(initialProfile?.email || fallbackEmail || '');
  const [primaryDirection, setPrimaryDirection] = useState(
    initialProfile?.primaryDirection || ''
  );
  const [directionSearch, setDirectionSearch] = useState('');
  const [careerGoal, setCareerGoal] = useState(initialProfile?.careerGoal || '');

  const [knowledgeLevel, setKnowledgeLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>(
    initialProfile?.knowledgeLevel || 'Beginner'
  );
  const [currentSkills, setCurrentSkills] = useState<string[]>(
    initialProfile?.currentSkills ?? []
  );
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [educationLevel, setEducationLevel] = useState(initialProfile?.educationLevel || '');
  const [university, setUniversity] = useState(initialProfile?.university || '');
  const [fieldOfStudy, setFieldOfStudy] = useState(initialProfile?.fieldOfStudy || '');
  const [preferredHours, setPreferredHours] = useState<number>(
    initialProfile?.preferredHoursPerDay && initialProfile.preferredHoursPerDay > 0
      ? initialProfile.preferredHoursPerDay
      : 2
  );

  const [learningInterests, setLearningInterests] = useState<string[]>(
    initialProfile?.learningInterests ?? []
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);

  const plainInputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A89EB2]';

  const filteredDirections = useMemo(
    () => filterPrimaryDirectionSuggestions(directionSearch),
    [directionSearch]
  );

  const suggestedSkills = useMemo(() => {
    const dirSkills = inferSkillSuggestionsForDirection(primaryDirection);
    const interestSkills = getSkillSuggestionsForInterests(learningInterests);
    return Array.from(new Set([...dirSkills, ...interestSkills])).slice(0, 12);
  }, [primaryDirection, learningInterests]);

  const toggleInterest = (category: string) => {
    setLearningInterests((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category]
    );
  };

  const toggleSkill = (skill: string) => {
    setCurrentSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const addCustomSkill = () => {
    const trimmed = customSkillInput.trim();
    if (!trimmed) return;
    if (!currentSkills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setCurrentSkills((prev) => [...prev, trimmed]);
    }
    setCustomSkillInput('');
  };

  const handleNextStep = () => {
    onError('');
    if (step === 1) {
      if (!fullName.trim()) {
        onError('Please enter your full name to continue.');
        return;
      }
      if (!primaryDirection.trim()) {
        onError('Please choose or enter one Primary Learning Direction to build your roadmap.');
        return;
      }
    }
    setStep((prev) => Math.min(4, prev + 1));
  };

  const handlePreviousStep = () => {
    onError('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmitOnboarding = async () => {
    onError('');
    const trimmedName = fullName.trim();
    const resolvedPrimaryDirection = primaryDirection.trim() || careerGoal.trim();
    const resolvedCareerGoal = careerGoal.trim() || resolvedPrimaryDirection;

    if (!trimmedName) {
      onError('Please enter your full name in Step 1.');
      setStep(1);
      return;
    }
    if (!resolvedPrimaryDirection) {
      onError('Please choose one Primary Learning Direction in Step 1.');
      setStep(1);
      return;
    }

    setIsSaving(true);
    try {
      const supabase = await getSupabaseClient();

      const savedProfile = await saveStudentProfile(supabase, {
        name: trimmedName,
        email: email.trim() || undefined,
        educationLevel: educationLevel.trim(),
        university: university.trim(),
        fieldOfStudy: fieldOfStudy.trim(),
        learningInterests,
        currentSkills,
        knowledgeLevel,
        careerGoal: resolvedCareerGoal,
        primaryDirection: resolvedPrimaryDirection,
        preferredHoursPerDay: preferredHours,
        onboardingCompleted: true,
      });

      try {
        await supabase.auth.updateUser({
          data: {
            full_name: savedProfile.name || trimmedName,
            primary_direction: resolvedPrimaryDirection,
            onboarding_completed: true,
          },
        });
      } catch {
        // Primary profile row is already confirmed in public.student_profiles
      }

      setSaveConfirmed(true);
      setTimeout(() => {
        onComplete(savedProfile, { generateRoadmap: true });
      }, 750);
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        onError(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else {
        onError(formatAuthError(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (saveConfirmed) {
    return (
      <div className="py-6 text-center space-y-4 animate-in fade-in duration-150">
        <div className="w-16 h-16 mx-auto rounded-[22px] clay-squircle-mint text-white flex items-center justify-center shadow-sm">
          <Check className="w-8 h-8 stroke-[3]" />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-display text-xl font-extrabold text-[#343047]">
            Generating your personalized roadmap...
          </h3>
          <p className="text-xs text-[#6E647A] max-w-sm mx-auto leading-relaxed">
            Your starting point for <span className="font-bold text-[#343047]">{primaryDirection.trim() || careerGoal.trim()}</span> is saved. Opening your personalized learning path to review &amp; confirm.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress Header */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-bold text-[#8B8295] mb-2">
          <span>
            Step {step} of 4 · <span className="text-[#343047]">{STEP_TITLES[step - 1]}</span>
          </span>
          <span className="font-mono tabular-nums text-[#8E6EC8]">
            {Math.round((step / 4) * 100)}%
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-200 ${
                s < step
                  ? 'bg-[#A9D5B3]'
                  : s === step
                  ? 'bg-[#A78BCE]'
                  : 'bg-[#EEE6E5]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* STEP 1: Primary Learning Direction & Goal */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="p-4 rounded-[20px] bg-gradient-to-r from-[#F0E9FA]/85 to-[#FCEAE5]/80 border border-[#E6DAF6] flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Choose your Primary Learning Direction
              </h3>
              <p className="text-xs text-[#6E647A] mt-0.5">
                Pick one focused career or study track — this anchors your entire roadmap, lessons, and AI mentorship.
              </p>
            </div>
            <CuteStudentCharacter3D className="w-16 h-16 shrink-0" />
          </div>

          {!initialProfile?.name?.trim() && (
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Full Name <span className="text-[#C25E4D]">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className={plainInputClass}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#343047]">
              Primary Learning Direction <span className="text-[#C25E4D]">*</span>
            </label>
            <input
              type="text"
              value={primaryDirection}
              onChange={(e) => setPrimaryDirection(e.target.value)}
              placeholder="e.g. AI Engineer, Data Analyst, UI/UX Designer, Frontend Developer, or any custom track..."
              className={plainInputClass}
            />

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8B8295] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={directionSearch}
                onChange={(e) => setDirectionSearch(e.target.value)}
                placeholder="Filter suggested career & study tracks..."
                className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-[#FFFCFA] border border-[#EEE6E5] rounded-full focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047] placeholder:text-[#A89EB2]"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 py-0.5">
              {filteredDirections.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => {
                    setPrimaryDirection(dir);
                    if (!careerGoal.trim()) {
                      setCareerGoal(`Become job-ready as a ${dir}`);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
                    primaryDirection.trim().toLowerCase() === dir.toLowerCase()
                      ? 'bg-[#8E6EC8] text-white shadow-xs'
                      : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#4F4760] hover:bg-[#F0E9FA]'
                  }`}
                >
                  <Compass className="w-3 h-3 shrink-0" />
                  <span>{dir}</span>
                </button>
              ))}
              {directionSearch.trim() &&
                !filteredDirections.some(
                  (d) => d.toLowerCase() === directionSearch.trim().toLowerCase()
                ) && (
                  <button
                    type="button"
                    onClick={() => setPrimaryDirection(directionSearch.trim())}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#DCECD9] text-[#284E30] border border-[#B4D8AE] inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Use custom direction: &ldquo;{directionSearch.trim()}&rdquo;</span>
                  </button>
                )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#343047] mb-1">
              Specific Career Objective (Optional)
            </label>
            <input
              type="text"
              value={careerGoal}
              onChange={(e) => setCareerGoal(e.target.value)}
              placeholder="e.g. Build portfolio AI projects for internship applications"
              className={plainInputClass}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {LEARNING_GOAL_SUGGESTIONS.slice(0, 4).map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => setCareerGoal(goal)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                    careerGoal === goal
                      ? 'bg-[#A78BCE] text-white'
                      : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#6E647A] hover:bg-[#FCEAE5]/70'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Starting Point, Skills, Education & Study Hours */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-display text-lg font-extrabold text-[#343047]">
              Help Skillora understand your starting point
            </h3>
            <p className="text-xs text-[#8B8295] mt-0.5">
              We calibrate your roadmap stages so you neither skip essentials nor repeat material you already know.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#343047] mb-1.5">
              Current Knowledge Level in {primaryDirection.trim() || 'your direction'}
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {([
                { lvl: 'Beginner', desc: 'Starting fresh or fundamentals' },
                { lvl: 'Intermediate', desc: 'Know basics, ready to apply' },
                { lvl: 'Advanced', desc: 'Deep specialization & mastery' },
              ] as const).map(({ lvl, desc }) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setKnowledgeLevel(lvl)}
                  className={`p-3 rounded-[16px] border text-left transition-all ${
                    knowledgeLevel === lvl
                      ? 'bg-[#F0E9FA] border-[#A78BCE] text-[#343047] ring-2 ring-[#C9B7E8]/40'
                      : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#6E647A] hover:bg-[#FFFCFA]'
                  }`}
                >
                  <p className="text-xs font-extrabold">{lvl}</p>
                  <p className="text-[10px] text-[#8B8295] mt-0.5 leading-snug">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#343047] mb-1.5">
              Existing Skills (toggle or add custom)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {suggestedSkills.map((skill) => {
                const selected = currentSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`px-2.5 py-1 text-[11px] rounded-full transition-colors font-semibold ${
                      selected
                        ? 'bg-[#A78BCE] text-white shadow-xs'
                        : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#5D5470] hover:bg-[#F0E9FA]'
                    }`}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
                placeholder="Add another existing skill (e.g. Excel, SQL, Figma)..."
                className={plainInputClass}
              />
              <button
                type="button"
                onClick={addCustomSkill}
                className="clay-button-soft px-3.5 py-2.5 text-xs font-bold flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-[#8E6EC8]" />
                <span>Add</span>
              </button>
            </div>
            {currentSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {currentSkills.map((sk) => (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#DCECD9]/80 border border-[#C2DFBC] text-[#2D4D33] text-[11px] font-bold"
                  >
                    <span>{sk}</span>
                    <button
                      type="button"
                      onClick={() => toggleSkill(sk)}
                      aria-label={`Remove ${sk}`}
                      className="hover:text-[#1F3724]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Education Background
              </label>
              <select
                value={educationLevel}
                onChange={(e) => setEducationLevel(e.target.value)}
                className={plainInputClass}
              >
                <option value="">Select background...</option>
                <option value="High School / Pre-University">High School / Pre-University</option>
                <option value="Undergraduate (Freshman / Sophomore)">Undergraduate (Freshman / Sophomore)</option>
                <option value="Undergraduate (Junior / Senior)">Undergraduate (Junior / Senior)</option>
                <option value="Fresh University Graduate">Fresh University Graduate</option>
                <option value="Postgraduate / Master's Student">Postgraduate / Master&apos;s Student</option>
                <option value="Young Professional / Career Switcher">Young Professional / Career Switcher</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Field of Study (Optional)
              </label>
              <input
                type="text"
                value={fieldOfStudy}
                onChange={(e) => setFieldOfStudy(e.target.value)}
                placeholder="e.g. Computer Science, Business, Design"
                className={plainInputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#343047] mb-1">
                University or Institution (Optional)
              </label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="e.g. State University"
                className={plainInputClass}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-[18px] bg-[#FFF1D6]/70 border border-[#F3DFB4] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#343047] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#B68229]" />
                Available Study Time
              </span>
              <span className="font-mono text-xs font-extrabold text-[#7A5720]">
                {preferredHours} {preferredHours === 1 ? 'Hour' : 'Hours'} / Day
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.5}
              value={preferredHours}
              onChange={(e) => setPreferredHours(parseFloat(e.target.value))}
              className="w-full accent-[#A78BCE]"
            />
            <div className="flex justify-between text-[11px] text-[#8B7141]">
              <span>30m/day (Light)</span>
              <span>2 hrs/day (Steady)</span>
              <span>6 hrs/day (Intensive)</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Supporting Interests (Optional Secondary Context) */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="p-4 rounded-[20px] bg-gradient-to-r from-[#FCEAE5]/80 to-[#FFF1D6]/70 border border-[#F5D6CD] flex items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFFCFA] border border-[#E6DAF6] text-[10px] font-bold text-[#6F4FA8] mb-1">
                <Layers className="w-3 h-3" /> Optional Secondary Interests
              </span>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Any supporting topics you enjoy?
              </h3>
              <p className="text-xs text-[#6E647A] mt-0.5">
                Supporting interests remain secondary to your primary direction (<span className="font-bold text-[#343047]">{primaryDirection}</span>) and add helpful bonus resources.
              </p>
            </div>
            <SmilingCloudMascot3D className="w-20 h-14 shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ONBOARDING_INTEREST_CATEGORIES.map((category) => {
              const selected = learningInterests.includes(category);
              const meta = INTEREST_META[category];
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleInterest(category)}
                  className={`p-3 rounded-[16px] border text-left transition-all flex items-center justify-between gap-2 ${
                    selected
                      ? `${meta.tint} ring-2 ring-[#A78BCE]/45 shadow-xs font-bold`
                      : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#4F4760] hover:bg-[#F0E9FA]/40 font-semibold'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-[10px] bg-[#FFFCFA] border border-[#EEE6E5] flex items-center justify-center shrink-0">
                      {meta.icon}
                    </span>
                    <span className="text-xs leading-snug">{category}</span>
                  </div>
                  {selected && (
                    <span className="w-5 h-5 rounded-full bg-[#A78BCE] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 4: Review & Generate Personalized Roadmap */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="p-4 rounded-[20px] bg-gradient-to-r from-[#F0E9FA]/85 to-[#E1F2E8]/75 border border-[#D9CCEF]">
            <h3 className="font-display text-lg font-extrabold text-[#343047]">
              Ready to build your personalized roadmap
            </h3>
            <p className="text-xs text-[#6E647A] mt-0.5">
              Skillora AI will sequence stages, lessons, milestones, and completion criteria tailored to your starting point.
            </p>
          </div>

          <div className="p-4 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-[14px] bg-[#FFFCFA] border border-[#EEE6E5] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B8295]">
                    Primary Direction
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-[10px] font-bold text-[#8E6EC8] hover:underline flex items-center gap-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" /> Edit
                  </button>
                </div>
                <p className="font-extrabold text-sm text-[#343047]">{primaryDirection}</p>
                {careerGoal.trim() &&
                  careerGoal.trim().toLowerCase() !== primaryDirection.trim().toLowerCase() && (
                    <p className="text-[11px] text-[#6E647A]">Objective: {careerGoal}</p>
                  )}
              </div>

              <div className="p-3 rounded-[14px] bg-[#FFFCFA] border border-[#EEE6E5] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B8295]">
                    Starting Point
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-[10px] font-bold text-[#8E6EC8] hover:underline flex items-center gap-0.5"
                  >
                    <Edit2 className="w-2.5 h-2.5" /> Edit
                  </button>
                </div>
                <p className="font-bold text-[#343047]">
                  {knowledgeLevel} · {preferredHours}h/day
                </p>
                <p className="text-[11px] text-[#6E647A]">
                  {educationLevel || 'Background flexible'}
                  {fieldOfStudy ? ` · ${fieldOfStudy}` : ''}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-[14px] bg-[#FFFCFA] border border-[#EEE6E5] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B8295]">
                  Existing Skills &amp; Supporting Interests
                </span>
                <button
                  type="button"
                  onClick={() => setStep(currentSkills.length > 0 ? 2 : 3)}
                  className="text-[10px] font-bold text-[#8E6EC8] hover:underline flex items-center gap-0.5"
                >
                  <Edit2 className="w-2.5 h-2.5" /> Edit
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {currentSkills.length === 0 && learningInterests.length === 0 ? (
                  <span className="text-[11px] text-[#8B8295]">
                    Starting from clean fundamentals in {primaryDirection}.
                  </span>
                ) : (
                  <>
                    {currentSkills.map((sk) => (
                      <span
                        key={sk}
                        className="px-2 py-0.5 rounded-full bg-[#DCECD9] text-[#2D4D33] text-[10px] font-bold"
                      >
                        Skill: {sk}
                      </span>
                    ))}
                    {learningInterests.map((item) => (
                      <span
                        key={item}
                        className="px-2 py-0.5 rounded-full bg-[#F0E9FA] text-[#5D438E] text-[10px] font-bold"
                      >
                        {item}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="pt-3 border-t border-[#EEE6E5] flex items-center justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={handlePreviousStep}
            disabled={isSaving}
            className="clay-button-soft px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={handleNextStep}
            className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5"
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmitOnboarding}
            disabled={isSaving}
            className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving &amp; Preparing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Save &amp; Generate Roadmap</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
