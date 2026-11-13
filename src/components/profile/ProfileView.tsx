import React, { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { UserProfile, AppView } from '../../types';
import { CuteStudentCharacter3D } from '../common/PastelIllustrations';

interface ProfileViewProps {
  user: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onNavigate: (view: AppView) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onUpdateProfile,
  onNavigate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [educationLevel, setEducationLevel] = useState(user.educationLevel);
  const [university, setUniversity] = useState(user.university);
  const [fieldOfStudy] = useState(user.fieldOfStudy);
  const [careerGoal, setCareerGoal] = useState(user.careerGoal);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>(user.currentSkills);
  const [interests] = useState<string[]>(user.learningInterests);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      name,
      email,
      educationLevel,
      university,
      fieldOfStudy,
      careerGoal,
      currentSkills: skills,
      learningInterests: interests,
    });
    setIsEditing(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const addSkill = () => {
    if (newSkillInput.trim() && !skills.includes(newSkillInput.trim())) {
      setSkills([...skills, newSkillInput.trim()]);
      setNewSkillInput('');
    }
  };

  const removeSkill = (sk: string) => {
    setSkills(skills.filter((s) => s !== sk));
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047]';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {savedSuccess && (
        <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
            <span>Profile updated and synced across Skillora!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)}>
            <X className="w-4 h-4 text-[#3B6B46]" />
          </button>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="pastel-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-[#EEE6E5]">
          <div className="flex items-center gap-5">
            <div className="relative">
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-[22px] object-cover border-2 border-[#E2D6F5] shadow-sm"
              />
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full clay-squircle-mint border-2 border-[#FFFCFA] flex items-center justify-center">
                <Check className="w-3 h-3 text-white stroke-[3]" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#343047]">
                  {user.name}
                </h1>
                <span className="text-[11px] font-bold text-[#6F4FA8] bg-[#F0E9FA] px-2.5 py-0.5 rounded-full">
                  Active Student
                </span>
              </div>
              <p className="text-xs text-[#8B8295] mt-1">{user.email}</p>
              <p className="text-xs text-[#343047] font-semibold mt-0.5">
                {user.university} · {user.fieldOfStudy}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsEditing(!isEditing)}
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
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#343047] mb-1">
                  Primary Career Goal
                </label>
                <input
                  type="text"
                  value={careerGoal}
                  onChange={(e) => setCareerGoal(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1.5">
                Current Skills Tags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {skills.map((sk) => (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#5D438E] text-xs font-bold"
                  >
                    <span>{sk}</span>
                    <button
                      type="button"
                      onClick={() => removeSkill(sk)}
                      className="text-[#8E6EC8] hover:text-[#343047]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 max-w-sm">
                <input
                  type="text"
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                  placeholder="Add skill (e.g. Docker, TypeScript)"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="clay-button-primary px-4 py-2.5 text-xs font-bold shrink-0"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="clay-button-soft px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button type="submit" className="clay-button-primary px-5 py-2.5 text-xs font-bold">
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-[20px] bg-[#F0E9FA]/60 border border-[#E2D6F5] space-y-1">
                <span className="text-[11px] font-bold text-[#6F4FA8] uppercase tracking-wider">
                  Academic Affiliation
                </span>
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  {user.university}
                </p>
                <p className="text-xs text-[#6B6178]">{user.educationLevel}</p>
              </div>

              <div className="p-4 rounded-[20px] bg-[#FCEAE5]/65 border border-[#F5D3CA] space-y-1">
                <span className="text-[11px] font-bold text-[#9C5042] uppercase tracking-wider">
                  Targeted Career Goal
                </span>
                <p className="font-display text-sm font-extrabold text-[#343047]">
                  {user.careerGoal}
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
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-3.5 py-1.5 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#5D438E] text-xs font-bold"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B8295]">
                Learning Focus & Interests
              </h3>
              <div className="flex flex-wrap gap-2">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="px-3.5 py-1.5 rounded-full bg-[#DCECD9]/75 border border-[#C2DFBC] text-[#356640] text-xs font-bold"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>

            {/* Pastel Roadmap CTA Card */}
            <div className="p-5 rounded-[22px] bg-[#FFF1D6]/75 border border-[#F3DFB4] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <CuteStudentCharacter3D className="w-16 h-16 shrink-0" />
                <div>
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    Ready to conquer Stage 3?
                  </p>
                  <p className="text-xs text-[#705D38]">
                    Your personalized Python roadmap has remaining units waiting for you.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('roadmap')}
                className="clay-button-primary px-5 py-2.5 text-xs font-bold shrink-0"
              >
                Go to Roadmap
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
