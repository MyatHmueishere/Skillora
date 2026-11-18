import React, { useRef, useState } from 'react';
import {
  Edit2,
  Check,
  X,
  AlertCircle,
  Loader2,
  Camera,
  Trash2,
  Plus,
  Compass,
  Sparkles,
  Search,
  Trophy,
} from 'lucide-react';
import {
  UserProfile,
  AppView,
  LearningRoadmapRecord,
  AchievementSummaryPayload,
} from '../../types';
import { CuteStudentCharacter3D } from '../common/PastelIllustrations';
import { getSupabaseClient } from '../../lib/supabase';
import {
  DEFAULT_AVATAR_URL,
  StudentProfileDbError,
  computeProfileCompletion,
  uploadStudentAvatar,
} from '../../lib/studentProfile';
import {
  ONBOARDING_INTEREST_CATEGORIES,
  PRIMARY_DIRECTION_SUGGESTIONS,
  SKILL_SUGGESTIONS_BY_CATEGORY,
  filterPrimaryDirectionSuggestions,
} from '../../lib/learningRecommendations';
import { doesRoadmapMatchDirection } from '../../lib/dashboardJourney';

interface ProfileViewProps {
  user: UserProfile;
  isAuthenticated?: boolean;
  onUpdateProfile: (updated: Partial<UserProfile>) => Promise<void> | void;
  onNavigate: (view: AppView) => void;
  profileLoadError?: string;
  activeRoadmap?: LearningRoadmapRecord | null;
  isGeneratingRoadmap?: boolean;
  onGenerateRoadmap?: (replaceActive?: boolean) => Promise<boolean> | void;
  achievementsSummary?: AchievementSummaryPayload | null;
  onViewAchievements?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  isAuthenticated = false,
  onUpdateProfile,
  onNavigate,
  profileLoadError = '',
  activeRoadmap = null,
  isGeneratingRoadmap = false,
  onGenerateRoadmap,
  achievementsSummary = null,
  onViewAchievements,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [educationLevel, setEducationLevel] = useState(user.educationLevel);
  const [university, setUniversity] = useState(user.university);
  const [fieldOfStudy, setFieldOfStudy] = useState(user.fieldOfStudy);
  const [primaryDirection, setPrimaryDirection] = useState(user.primaryDirection || '');
  const [directionSearch, setDirectionSearch] = useState('');
  const [careerGoal, setCareerGoal] = useState(user.careerGoal);
  const [knowledgeLevel, setKnowledgeLevel] = useState<UserProfile['knowledgeLevel']>(
    user.knowledgeLevel
  );
  const [preferredHoursPerDay, setPreferredHoursPerDay] = useState<number>(
    user.preferredHoursPerDay || 2
  );
  const [newSkillInput, setNewSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>(user.currentSkills);
  const [interests, setInterests] = useState<string[]>(user.learningInterests);
  const [activeSkillCategory, setActiveSkillCategory] = useState<string>(
    user.learningInterests.find((item) =>
      Object.prototype.hasOwnProperty.call(SKILL_SUGGESTIONS_BY_CATEGORY, item)
    ) ?? ONBOARDING_INTEREST_CATEGORIES[0]
  );
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [savedNoticeText, setSavedNoticeText] = useState(
    'Profile saved to Supabase and synced across Skillora!'
  );
  const [directionChangedNotice, setDirectionChangedNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveDiagnostic, setSaveDiagnostic] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isEditing || isSaving) return;
    setName(user.name);
    setEmail(user.email);
    setEducationLevel(user.educationLevel);
    setUniversity(user.university);
    setFieldOfStudy(user.fieldOfStudy);
    setPrimaryDirection(user.primaryDirection || '');
    setCareerGoal(user.careerGoal);
    setKnowledgeLevel(user.knowledgeLevel);
    setPreferredHoursPerDay(user.preferredHoursPerDay || 2);
    setSkills(user.currentSkills);
    setInterests(user.learningInterests);
  }, [user, isEditing, isSaving]);

  const resetFormFields = () => {
    setName(user.name);
    setEmail(user.email);
    setEducationLevel(user.educationLevel);
    setUniversity(user.university);
    setFieldOfStudy(user.fieldOfStudy);
    setPrimaryDirection(user.primaryDirection || '');
    setDirectionSearch('');
    setCareerGoal(user.careerGoal);
    setKnowledgeLevel(user.knowledgeLevel);
    setPreferredHoursPerDay(user.preferredHoursPerDay || 2);
    setSkills(user.currentSkills);
    setInterests(user.learningInterests);
    setNewSkillInput('');
  };

  const handlePrimaryDirectionInput = (nextValue: string) => {
    const prevTrim = primaryDirection.trim().toLowerCase();
    const userPrevTrim = (user.primaryDirection || '').trim().toLowerCase();
    const goalTrim = careerGoal.trim().toLowerCase();
    const shouldSyncGoal =
      !goalTrim ||
      (prevTrim &&
        (goalTrim === prevTrim ||
          goalTrim === `become job-ready as a ${prevTrim}` ||
          goalTrim === `become job-ready as an ${prevTrim}`)) ||
      (userPrevTrim &&
        (goalTrim === userPrevTrim ||
          goalTrim === `become job-ready as a ${userPrevTrim}` ||
          goalTrim === `become job-ready as an ${userPrevTrim}`));

    setPrimaryDirection(nextValue);
    if (shouldSyncGoal) {
      setCareerGoal(nextValue);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);
    setSaveError('');
    setSaveDiagnostic('');

    const prevPrimary = (user.primaryDirection || '').trim();
    const nextPrimary = primaryDirection.trim();

    if (!nextPrimary) {
      setSaveError('Please select or enter a Primary Learning Direction before saving.');
      return;
    }

    const goalTrim = careerGoal.trim();
    const prevLower = prevPrimary.toLowerCase();
    const goalLower = goalTrim.toLowerCase();
    const directionDidChange =
      Boolean(prevLower) && nextPrimary.toLowerCase() !== prevLower;
    const isStaleGoalFromPrevDirection =
      directionDidChange &&
      (goalLower === prevLower ||
        goalLower === `become job-ready as a ${prevLower}` ||
        goalLower === `become job-ready as an ${prevLower}`);

    const resolvedCareerGoal =
      !goalTrim || isStaleGoalFromPrevDirection ? nextPrimary : goalTrim;

    setIsSaving(true);
    const changedPrimary =
      nextPrimary.toLowerCase() !== prevLower ||
      !doesRoadmapMatchDirection(activeRoadmap, nextPrimary);

    try {
      await onUpdateProfile({
        name: name.trim(),
        email: email.trim(),
        educationLevel: educationLevel.trim(),
        university: university.trim(),
        fieldOfStudy: fieldOfStudy.trim(),
        primaryDirection: nextPrimary,
        careerGoal: resolvedCareerGoal,
        knowledgeLevel,
        preferredHoursPerDay,
        currentSkills: skills,
        learningInterests: interests,
        onboardingCompleted:
          Boolean(nextPrimary && resolvedCareerGoal) || user.onboardingCompleted,
      });

      setCareerGoal(resolvedCareerGoal);
      setIsEditing(false);
      setDirectionSearch('');
      setDirectionChangedNotice(null);
      setSavedNoticeText(
        changedPrimary
          ? `Profile saved! Primary Learning Direction updated to “${nextPrimary}” and synced across your Dashboard and Learning Path.`
          : 'Profile saved to Supabase and synced across Skillora!'
      );
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4500);
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        setSaveError(err.userMessage);
        if (import.meta.env.DEV) {
          setSaveDiagnostic(err.toDiagnosticText());
        }
      } else if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError('Failed to save profile to the database. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSaveError('');
    setSaveDiagnostic('');
    setSavedSuccess(false);

    if (!isAuthenticated) {
      setSaveError('Please sign in with your Skillora account to upload and save a profile photo.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const supabase = await getSupabaseClient();
      const uploadedAvatarUrl = await uploadStudentAvatar(supabase, file);
      await onUpdateProfile({ avatarUrl: uploadedAvatarUrl });
      setSavedNoticeText('Profile photo updated and saved!');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        setSaveError(err.userMessage);
        if (import.meta.env.DEV) {
          setSaveDiagnostic(err.toDiagnosticText());
        }
      } else if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError('Failed to upload profile photo. Please try again.');
      }
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!isAuthenticated || isUploadingPhoto) return;
    setSaveError('');
    setSaveDiagnostic('');
    setSavedSuccess(false);
    setIsUploadingPhoto(true);
    try {
      await onUpdateProfile({ avatarUrl: '' });
      setSavedNoticeText('Profile photo reset to default.');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        setSaveError(err.userMessage);
        if (import.meta.env.DEV) {
          setSaveDiagnostic(err.toDiagnosticText());
        }
      } else if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError('Failed to reset profile photo.');
      }
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const hasSkillIgnoreCase = (list: string[], candidate: string) =>
    list.some((s) => s.trim().toLowerCase() === candidate.trim().toLowerCase());

  const addSkill = () => {
    const trimmed = newSkillInput.trim();
    if (trimmed && !hasSkillIgnoreCase(skills, trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
    }
    setNewSkillInput('');
  };

  const toggleSuggestedSkill = (skill: string) => {
    setSkills((prev) =>
      hasSkillIgnoreCase(prev, skill)
        ? prev.filter((s) => s.trim().toLowerCase() !== skill.trim().toLowerCase())
        : [...prev, skill]
    );
  };

  const removeSkill = (sk: string) => {
    setSkills((prev) => prev.filter((s) => s !== sk));
  };

  const toggleInterest = (category: string) => {
    setInterests((prev) => {
      const exists = prev.includes(category);
      const next = exists ? prev.filter((item) => item !== category) : [...prev, category];
      if (
        !exists &&
        Object.prototype.hasOwnProperty.call(SKILL_SUGGESTIONS_BY_CATEGORY, category)
      ) {
        setActiveSkillCategory(category);
      }
      return next;
    });
  };

  const interestOptions = Array.from(
    new Set([...ONBOARDING_INTEREST_CATEGORIES, ...interests])
  );
  const categorySkills =
    SKILL_SUGGESTIONS_BY_CATEGORY[activeSkillCategory] ??
    SKILL_SUGGESTIONS_BY_CATEGORY[ONBOARDING_INTEREST_CATEGORIES[0]] ??
    [];
  const hasCustomAvatar =
    Boolean(user.avatarUrl) && user.avatarUrl !== DEFAULT_AVATAR_URL;

  const profileCompletion = computeProfileCompletion(user);
  const isProfileIncomplete =
    !(user.primaryDirection ?? '').trim() && !user.careerGoal.trim();
  const filteredDirections = filterPrimaryDirectionSuggestions(directionSearch);

  const savedPrimary = (user.primaryDirection || '').trim();
  const showDirectionSwitchCard =
    isAuthenticated &&
    Boolean(savedPrimary) &&
    !doesRoadmapMatchDirection(activeRoadmap, savedPrimary) &&
    (Boolean(directionChangedNotice) || Boolean(activeRoadmap) || !activeRoadmap);

  const inputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047]';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {savedSuccess && (
        <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
            <span>{savedNoticeText}</span>
          </div>
          <button onClick={() => setSavedSuccess(false)}>
            <X className="w-4 h-4 text-[#3B6B46]" />
          </button>
        </div>
      )}

      {showDirectionSwitchCard && onGenerateRoadmap && (
        <div className="p-4 sm:p-5 rounded-[22px] bg-[#F0E9FA] border border-[#D4C3F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold text-[#5D438E] flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[#7A58B5]" />
              <span>
                Primary Learning Direction Updated to “{savedPrimary}”
              </span>
            </p>
            <p className="text-[11px] text-[#5D5470] leading-relaxed">
              Your completed lessons, quiz scores, and previous learning roadmaps remain safely preserved and archived. Ready to build your tailored roadmap for {savedPrimary}?
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isGeneratingRoadmap}
              onClick={async () => {
                setDirectionChangedNotice(null);
                const ok = await onGenerateRoadmap(Boolean(activeRoadmap));
                if (ok) {
                  onNavigate('roadmap');
                }
              }}
              className="clay-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
            >
              {isGeneratingRoadmap ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Roadmap...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Roadmap for {savedPrimary}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {(saveError || profileLoadError) && (
        <div className="p-4 rounded-[20px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 font-bold">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C25E4D] shrink-0" />
              <span>{saveError || profileLoadError}</span>
            </div>
            {saveError && (
              <button
                type="button"
                onClick={() => {
                  setSaveError('');
                  setSaveDiagnostic('');
                }}
              >
                <X className="w-4 h-4 text-[#8D3E32]" />
              </button>
            )}
          </div>
          {import.meta.env.DEV && saveDiagnostic && (
            <p className="text-[11px] font-mono bg-[#FFFCFA]/70 border border-[#F3C5BA] rounded-[10px] px-3 py-1.5 text-[#7A3227] break-all">
              {saveDiagnostic}
            </p>
          )}
        </div>
      )}

      {/* Profile Completion Indicator Card */}
      {!profileLoadError && (
        <div className="p-4 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-[#343047]">
                  Profile Completion
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    profileCompletion.percent === 100
                      ? 'bg-[#DCECD9] text-[#2F5B37]'
                      : 'bg-[#F0E9FA] text-[#6F4FA8]'
                  }`}
                >
                  {profileCompletion.percent}% · {profileCompletion.completedCount}/
                  {profileCompletion.totalCount} sections
                </span>
              </div>
              {profileCompletion.missingItems.length > 0 ? (
                <p className="text-[11px] text-[#7B7188]">
                  Remaining to reach 100%: {profileCompletion.missingItems.join(', ')}
                </p>
              ) : (
                <p className="text-[11px] text-[#356640] font-semibold">
                  Your Skillora profile is 100% complete for maximum personalization.
                </p>
              )}
            </div>
            {profileCompletion.percent < 100 && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="clay-button-primary px-4 py-1.5 text-xs font-bold shrink-0"
              >
                Complete Profile
              </button>
            )}
          </div>
          <div className="w-full h-2 rounded-full bg-[#EEE6E5] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                profileCompletion.percent === 100
                  ? 'bg-[#7DBE8B]'
                  : 'bg-gradient-to-r from-[#A78BCE] to-[#7DBE8B]'
              }`}
              style={{ width: `${profileCompletion.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="pastel-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-[#EEE6E5]">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handlePhotoFileChange}
                className="hidden"
                aria-label="Upload profile photo"
              />
              <img
                src={user.avatarUrl || DEFAULT_AVATAR_URL}
                alt={user.name || 'Student'}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== window.location.origin + DEFAULT_AVATAR_URL) {
                    target.src = DEFAULT_AVATAR_URL;
                  }
                }}
                className="w-20 h-20 rounded-[22px] object-cover border-2 border-[#E2D6F5] shadow-sm bg-[#FAF6F2]"
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isUploadingPhoto || isSaving}
                title="Upload profile photo"
                aria-label="Change profile photo"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full clay-squircle-lavender border-2 border-[#FFFCFA] flex items-center justify-center text-white shadow-xs hover:brightness-105 transition-all disabled:opacity-60"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#343047]">
                  {user.name || 'Student Profile'}
                </h1>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    isProfileIncomplete
                      ? 'text-[#8E6521] bg-[#FFF1D6]'
                      : 'text-[#6F4FA8] bg-[#F0E9FA]'
                  }`}
                >
                  {isProfileIncomplete ? 'Incomplete Profile' : 'Active Student'}
                </span>
              </div>
              <p className="text-xs text-[#8B8295] mt-1">{user.email || 'No email set'}</p>
              <p className="text-xs text-[#343047] font-semibold mt-0.5">
                {user.university || 'University not set'} · {user.fieldOfStudy || 'Field of study not set'}
              </p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploadingPhoto || isSaving}
                  className="text-[11px] font-bold text-[#7A58B5] hover:underline flex items-center gap-1 disabled:opacity-60"
                >
                  <Camera className="w-3 h-3" />
                  <span>{isUploadingPhoto ? 'Uploading photo...' : 'Change Photo'}</span>
                </button>
                {hasCustomAvatar && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isUploadingPhoto || isSaving}
                    className="text-[11px] font-semibold text-[#8B8295] hover:text-[#8D3E32] flex items-center gap-1 disabled:opacity-60"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Reset Photo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSaveError('');
              setSaveDiagnostic('');
              if (isEditing) {
                resetFormFields();
              }
              setIsEditing(!isEditing);
            }}
            className="clay-button-soft px-4 py-2 text-xs font-bold flex items-center gap-2 self-start sm:self-auto"
          >
            <Edit2 className="w-3.5 h-3.5 text-[#8E6EC8]" />
            <span>{isEditing ? 'Cancel Editing' : 'Edit Profile'}</span>
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  disabled={isSaving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  disabled={isSaving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  University / Institution
                </label>
                <input
                  type="text"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  placeholder="e.g. University of Washington"
                  disabled={isSaving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Education Level
                </label>
                <input
                  type="text"
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value)}
                  placeholder="e.g. Undergraduate (Senior)"
                  disabled={isSaving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Field of Study / Major
                </label>
                <input
                  type="text"
                  value={fieldOfStudy}
                  onChange={(e) => setFieldOfStudy(e.target.value)}
                  placeholder="e.g. Computer Science"
                  disabled={isSaving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Career / Personal Goal
                </label>
                <input
                  type="text"
                  value={careerGoal}
                  onChange={(e) => setCareerGoal(e.target.value)}
                  placeholder="e.g. Become a Full-Stack Developer"
                  disabled={isSaving}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Current Knowledge Level
                </label>
                <select
                  value={knowledgeLevel}
                  onChange={(e) =>
                    setKnowledgeLevel(e.target.value as UserProfile['knowledgeLevel'])
                  }
                  disabled={isSaving}
                  className={inputClass}
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Preferred Daily Study Hours
                </label>
                <select
                  value={preferredHoursPerDay}
                  onChange={(e) => setPreferredHoursPerDay(Number(e.target.value))}
                  disabled={isSaving}
                  className={inputClass}
                >
                  {[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map((h) => (
                    <option key={h} value={h}>
                      {h === 1 ? '1 hour / day' : h === 6 ? '6+ hours / day' : `${h} hours / day`}
                    </option>
                  ))}
                  {![0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].includes(preferredHoursPerDay) && (
                    <option value={preferredHoursPerDay}>
                      {preferredHoursPerDay} hours / day
                    </option>
                  )}
                </select>
              </div>
            </div>

            {/* One Active Primary Learning Direction */}
            <div className="p-4 rounded-[18px] bg-[#F4EEFC]/80 border border-[#E2D6F5] space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-[#343047] flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#7D5DB8]" />
                  <span>Primary Learning Direction (1 active focus)</span>
                </label>
                <span className="text-[11px] text-[#6F4FA8] font-semibold">
                  Preserves all previous roadmaps &amp; progress
                </span>
              </div>
              <input
                type="text"
                value={primaryDirection}
                onChange={(e) => handlePrimaryDirectionInput(e.target.value)}
                placeholder="Enter or pick a custom goal (e.g. AI Engineer, Data Analyst, UI/UX Designer)"
                disabled={isSaving}
                className={inputClass}
              />
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8B8295] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={directionSearch}
                  onChange={(e) => setDirectionSearch(e.target.value)}
                  placeholder="Filter suggested directions (e.g. Engineer, Analyst, Designer)..."
                  disabled={isSaving}
                  className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-[#FFFCFA] border border-[#E2D6F5] rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(filteredDirections.length > 0
                  ? filteredDirections
                  : PRIMARY_DIRECTION_SUGGESTIONS
                ).map((dir) => {
                  const selected = primaryDirection.trim().toLowerCase() === dir.toLowerCase();
                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => handlePrimaryDirectionInput(dir)}
                      disabled={isSaving}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                        selected
                          ? 'bg-[#8E6EC8] text-white shadow-2xs'
                          : 'bg-[#FFFCFA] border border-[#E2D6F5] text-[#5D5470] hover:bg-[#E7DDF8]'
                      }`}
                    >
                      {dir}
                    </button>
                  );
                })}
                {directionSearch.trim() &&
                  !filteredDirections.some(
                    (d) => d.toLowerCase() === directionSearch.trim().toLowerCase()
                  ) && (
                    <button
                      type="button"
                      onClick={() => handlePrimaryDirectionInput(directionSearch.trim())}
                      disabled={isSaving}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#DCECD9] text-[#284E30] border border-[#B4D8AE] inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Use &ldquo;{directionSearch.trim()}&rdquo;</span>
                    </button>
                  )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-xs font-bold text-[#343047]">
                  Supporting Interests &amp; Skill Categories
                </label>
                <span className="text-[11px] font-semibold text-[#8B8295]">
                  {interests.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {interestOptions.map((category) => {
                  const selected = interests.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleInterest(category)}
                      disabled={isSaving}
                      aria-pressed={selected}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        selected
                          ? 'bg-[#A9D5B3] text-[#23472B] shadow-2xs'
                          : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#5D5470] hover:bg-[#DCECD9]/60'
                      }`}
                    >
                      {selected && <Check className="w-3 h-3 stroke-[3]" />}
                      <span>{category}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-[#343047]">
                Current Skills Tags
              </label>

              {/* Category-filtered quick skill picker */}
              <div className="p-3.5 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-[#6F4FA8]">
                    Browse skills by category (click to toggle)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ONBOARDING_INTEREST_CATEGORIES.map((category) => {
                    const isViewing = activeSkillCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setActiveSkillCategory(category)}
                        disabled={isSaving}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                          isViewing
                            ? 'bg-[#A78BCE] text-white shadow-2xs'
                            : 'bg-[#FFFCFA] border border-[#EEE6E5] text-[#6E647A] hover:bg-[#F0E9FA]'
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {categorySkills.map((suggestedSkill) => {
                    const selected = hasSkillIgnoreCase(skills, suggestedSkill);
                    return (
                      <button
                        key={suggestedSkill}
                        type="button"
                        onClick={() => toggleSuggestedSkill(suggestedSkill)}
                        disabled={isSaving}
                        aria-pressed={selected}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                          selected
                            ? 'bg-[#F0E9FA] border border-[#C9B7E8] text-[#5D438E] font-bold'
                            : 'bg-[#FFFCFA] border border-[#EEE6E5] text-[#5D5470] hover:bg-[#F0E9FA]/60'
                        }`}
                      >
                        {selected ? (
                          <Check className="w-3 h-3 text-[#7A58B5] stroke-[3]" />
                        ) : (
                          <Plus className="w-3 h-3 text-[#8B8295]" />
                        )}
                        <span>{suggestedSkill}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((sk) => (
                    <span
                      key={sk}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#5D438E] text-xs font-bold"
                    >
                      <span>{sk}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(sk)}
                        disabled={isSaving}
                        aria-label={`Remove ${sk}`}
                        className="text-[#8E6EC8] hover:text-[#343047]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 max-w-sm">
                <input
                  type="text"
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="Add custom skill (e.g. Docker, TypeScript)"
                  disabled={isSaving}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={addSkill}
                  disabled={isSaving}
                  className="clay-button-primary px-4 py-2.5 text-xs font-bold shrink-0"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSaveError('');
                  setSaveDiagnostic('');
                  resetFormFields();
                  setIsEditing(false);
                }}
                disabled={isSaving}
                className="clay-button-soft px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 disabled:opacity-70"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {primaryDirection.trim().toLowerCase() !==
                      (user.primaryDirection || '').trim().toLowerCase()
                        ? 'Saving & Syncing Path...'
                        : 'Saving...'}
                    </span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-[20px] bg-[#DCECD9]/60 border border-[#C2DFBC] space-y-1">
                <span className="text-[11px] font-bold text-[#356640] uppercase tracking-wider">
                  Primary Learning Direction
                </span>
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  {user.primaryDirection || user.careerGoal || 'Not set yet'}
                </p>
                <p className="text-xs text-[#456D4C] font-semibold">
                  {user.primaryDirection ? 'Active focused direction' : 'Using profile goal'}
                </p>
              </div>

              <div className="p-4 rounded-[20px] bg-[#F0E9FA]/60 border border-[#E2D6F5] space-y-1">
                <span className="text-[11px] font-bold text-[#6F4FA8] uppercase tracking-wider">
                  Academic Affiliation
                </span>
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  {user.university || 'Not set yet'}
                </p>
                <p className="text-xs text-[#6B6178]">
                  {user.educationLevel || 'Education level not set'}
                </p>
              </div>

              <div className="p-4 rounded-[20px] bg-[#FCEAE5]/65 border border-[#F5D3CA] space-y-1">
                <span className="text-[11px] font-bold text-[#9C5042] uppercase tracking-wider">
                  Career / Personal Goal
                </span>
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  {user.careerGoal || 'Not set yet'}
                </p>
                <p className="text-xs text-[#8D5B51] font-semibold">
                  {user.preferredHoursPerDay} hours daily target pace
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B8295]">
                Verified Technical Skills
              </h3>
              {user.currentSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {user.currentSkills.map((skill) => (
                    <span
                      key={skill}
                      className="px-3.5 py-1.5 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#5D438E] text-xs font-bold"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8B8295]">No skills added yet.</p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B8295]">
                Supporting Interests &amp; Skill Categories
              </h3>
              {user.learningInterests.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {user.learningInterests.map((interest) => (
                    <span
                      key={interest}
                      className="px-3.5 py-1.5 rounded-full bg-[#DCECD9]/75 border border-[#C2DFBC] text-[#356640] text-xs font-bold"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8B8295]">No skill categories selected yet.</p>
              )}
            </div>

            {/* Achievements & XP Summary Card */}
            {achievementsSummary && (
              <div className="p-5 rounded-[22px] bg-[#F0E9FA]/65 border border-[#E2D6F5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#343047] text-white text-[11px] font-extrabold">
                      <Trophy className="w-3 h-3 text-[#F5D28A]" />
                      <span>
                        Level {achievementsSummary.levelInfo.level} · {achievementsSummary.levelInfo.title}
                      </span>
                    </span>
                    <span className="font-mono text-xs font-extrabold text-[#6F4FA8] tabular-nums">
                      {achievementsSummary.totalXp.toLocaleString()} XP
                    </span>
                    <span className="text-xs font-semibold text-[#5E5468]">
                      · {achievementsSummary.unlockedCount}/{achievementsSummary.totalBadgesCount} badges unlocked
                    </span>
                  </div>

                  <div className="space-y-1 max-w-md">
                    <div className="w-full h-2 rounded-full bg-[#FFFCFA] border border-[#E2D6F5] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${achievementsSummary.levelInfo.progressPercent}%`,
                          background: 'linear-gradient(90deg, #9B7ACE 0%, #58A89A 100%)',
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-[#6B6178]">
                      {achievementsSummary.levelInfo.xpToNextLevel} XP to Level{' '}
                      {achievementsSummary.levelInfo.level + 1}
                    </p>
                  </div>

                  {achievementsSummary.badges.some((b) => b.unlocked) && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {achievementsSummary.badges
                        .filter((b) => b.unlocked)
                        .map((badge) => (
                          <span
                            key={badge.id}
                            className="px-2.5 py-0.5 rounded-full bg-[#DCECD9] border border-[#C2DFBC] text-[#2F5B37] text-[10px] font-extrabold"
                          >
                            {badge.title}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (onViewAchievements) {
                      onViewAchievements();
                    } else {
                      onNavigate('progress');
                    }
                  }}
                  className="clay-button-primary px-4 py-2.5 text-xs font-bold shrink-0"
                >
                  View Achievements
                </button>
              </div>
            )}

            {/* Pastel Assessment & Learning Path CTA Card */}
            <div className="p-5 rounded-[22px] bg-[#FFF1D6]/75 border border-[#F3DFB4] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <CuteStudentCharacter3D className="w-16 h-16 shrink-0" />
                <div>
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    {isAuthenticated
                      ? 'Explore Skill Assessments & Your Learning Path'
                      : 'Explore Skill Assessments & Sample Roadmap'}
                  </p>
                  <p className="text-xs text-[#705D38]">
                    {isAuthenticated
                      ? 'Take a personalized skill assessment or continue studying your tailored Learning Path.'
                      : 'Try a recommended skill diagnostic or preview the sample Python roadmap.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onNavigate('assessment')}
                  className="clay-button-primary px-4 py-2.5 text-xs font-bold"
                >
                  Assessments
                </button>
                <button
                  onClick={() => onNavigate('roadmap')}
                  className="clay-button-soft px-4 py-2.5 text-xs font-bold"
                >
                  {isAuthenticated ? 'My Learning Path' : 'Sample Roadmap'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
