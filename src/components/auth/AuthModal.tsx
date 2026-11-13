import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Sparkles, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../../types';
import { Logo } from '../common/Logo';
import { SmilingCloudMascot3D } from '../common/PastelIllustrations';

export type AuthMode = 'login' | 'signup' | 'forgot_password' | 'onboarding';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onCompleteAuth: (user: Partial<UserProfile>) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onCompleteAuth,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Sync mode when initialMode changes on open
  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Form states
  const [email, setEmail] = useState('alex.chen@student.edu');
  const [password, setPassword] = useState('Skillora2026!');
  const [confirmPassword, setConfirmPassword] = useState('Skillora2026!');
  const [fullName, setFullName] = useState('Alex Chen');
  const [resetSent, setResetSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Onboarding multi-step state (1 to 3)
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [educationLevel, setEducationLevel] = useState('Undergraduate (Senior)');
  const [university, setUniversity] = useState('University of Washington');
  const [fieldOfStudy, setFieldOfStudy] = useState('Computer Science & Software');
  const [currentSkills, setCurrentSkills] = useState<string[]>(['Python Basics', 'Algorithms', 'SQL']);
  const [learningInterests, setLearningInterests] = useState<string[]>(['Backend Engineering', 'FastAPI', 'Cloud Systems']);
  const [careerGoal, setCareerGoal] = useState('Become a Python Developer');
  const [preferredHours, setPreferredHours] = useState(2);
  const [knowledgeLevel, setKnowledgeLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);

  if (!isOpen) return null;

  const availableSkills = ['Python Basics', 'Algorithms', 'SQL', 'Git & GitHub', 'JavaScript / TypeScript', 'Docker', 'REST APIs', 'Data Analysis'];
  const availableInterests = ['Backend Engineering', 'FastAPI', 'Cloud Systems', 'Machine Learning', 'Fullstack Web', 'Data Science', 'System Design'];

  const toggleSkill = (skill: string) => {
    if (currentSkills.includes(skill)) {
      setCurrentSkills(currentSkills.filter((s) => s !== skill));
    } else {
      setCurrentSkills([...currentSkills, skill]);
    }
  };

  const toggleInterest = (interest: string) => {
    if (learningInterests.includes(interest)) {
      setLearningInterests(learningInterests.filter((i) => i !== interest));
    } else {
      setLearningInterests([...learningInterests, interest]);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setErrorMsg('');
    onCompleteAuth({
      email,
      name: fullName || 'Alex Chen',
    });
    onClose();
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setErrorMsg('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setErrorMsg('');
    setMode('onboarding');
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    setErrorMsg('');
    setResetSent(true);
  };

  const handleFinishOnboarding = () => {
    setIsGeneratingRoadmap(true);
    setTimeout(() => {
      setIsGeneratingRoadmap(false);
      onCompleteAuth({
        name: fullName,
        email,
        educationLevel,
        university,
        fieldOfStudy,
        currentSkills,
        learningInterests,
        careerGoal,
        preferredHoursPerDay: preferredHours,
        knowledgeLevel,
      });
      onClose();
    }, 1000);
  };

  const inputClass =
    'w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A89EB2]';

  const plainInputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047]';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#343047]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-[#FFFCFA] rounded-[28px] shadow-[0_24px_60px_-14px_rgba(74,56,102,0.32)] border border-[#EEE6E5] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Pastel Header */}
        <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-[#F0E9FA] via-[#FAF6F2] to-[#FCEAE5] border-b border-[#EEE6E5] flex items-center justify-between">
          <Logo size="xl" showTagline={true} />
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] text-[#8B8295] hover:text-[#343047] shadow-xs transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Prototype Demo Helper */}
          <div className="mb-5 p-3 rounded-[16px] bg-[#FFF1D6]/75 border border-[#F3DFB4] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#B68229] shrink-0" />
              <span className="text-xs text-[#6B5022] font-semibold">
                Prototype Demo: Quick test account ready
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFullName('Alex Chen');
                setEmail('alex.chen@student.edu');
                setPassword('Skillora2026!');
                setConfirmPassword('Skillora2026!');
              }}
              className="text-[11px] font-bold text-[#8E6521] hover:underline"
            >
              Autofill Demo
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-[14px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* LOGIN */}
          {mode === 'login' && (
            <div>
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h3 className="font-display text-xl font-extrabold text-[#343047]">
                    Welcome back!
                  </h3>
                  <p className="text-xs text-[#8B8295] mt-1">
                    Continue your personalized learning journey.
                  </p>
                </div>
                <SmilingCloudMascot3D className="w-20 h-14 shrink-0" />
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#343047] mb-1.5">
                    Student Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@university.edu"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#343047]">Password</label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot_password')}
                      className="text-[11px] font-bold text-[#8E6EC8] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-[#EEE6E5] text-center text-xs text-[#8B8295]">
                New to Skillora?{' '}
                <button
                  onClick={() => setMode('signup')}
                  className="font-bold text-[#8E6EC8] hover:underline"
                >
                  Create an account
                </button>
              </div>
            </div>
          )}

          {/* SIGN UP */}
          {mode === 'signup' && (
            <div>
              <div className="mb-5">
                <h3 className="font-display text-xl font-extrabold text-[#343047]">
                  Join Skillora Today
                </h3>
                <p className="text-xs text-[#8B8295] mt-1">
                  Create your cozy study account to unlock your personalized roadmap.
                </p>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#343047] mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Chen"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#343047] mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex.chen@student.edu"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2 mt-2"
                >
                  <span>Continue to Onboarding</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-[#EEE6E5] text-center text-xs text-[#8B8295]">
                Already have an account?{' '}
                <button
                  onClick={() => setMode('login')}
                  className="font-bold text-[#8E6EC8] hover:underline"
                >
                  Log in instead
                </button>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot_password' && (
            <div>
              <div className="mb-5">
                <button
                  onClick={() => setMode('login')}
                  className="flex items-center gap-1 text-xs font-semibold text-[#8B8295] hover:text-[#343047] mb-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
                </button>
                <h3 className="font-display text-xl font-extrabold text-[#343047]">
                  Reset your password
                </h3>
                <p className="text-xs text-[#8B8295] mt-1">
                  Enter your student email and we’ll send recovery instructions.
                </p>
              </div>

              {resetSent ? (
                <div className="p-5 rounded-[20px] bg-[#DCECD9]/65 border border-[#C0DFBB] text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-2xl clay-squircle-mint text-white flex items-center justify-center">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <h4 className="font-display text-sm font-extrabold text-[#2D4D33]">
                    Reset instructions sent!
                  </h4>
                  <p className="text-xs text-[#456D4C]">
                    We sent recovery steps to <span className="font-bold">{email}</span>.
                  </p>
                  <button
                    onClick={() => setMode('login')}
                    className="mt-2 text-xs font-bold text-[#3B6B46] underline"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      Account Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex.chen@student.edu"
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <button type="submit" className="w-full clay-button-primary py-3 text-xs font-bold">
                    Send Recovery Email
                  </button>
                </form>
              )}
            </div>
          )}

          {/* STUDENT ONBOARDING */}
          {mode === 'onboarding' && (
            <div>
              <div className="mb-5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#8B8295] mb-2">
                  <span>Student Onboarding</span>
                  <span className="font-mono tabular-nums text-[#8E6EC8]">
                    Step {onboardingStep} of 3
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className={`h-2 rounded-full transition-all ${
                        step <= onboardingStep ? 'bg-[#A78BCE]' : 'bg-[#EEE6E5]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {onboardingStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-[#343047]">
                      Tell us about your background
                    </h3>
                    <p className="text-xs text-[#8B8295]">
                      We calibrate your roadmap to your current academic stage.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      1. Current Education Level
                    </label>
                    <select
                      value={educationLevel}
                      onChange={(e) => setEducationLevel(e.target.value)}
                      className={plainInputClass}
                    >
                      <option>Undergraduate (Freshman / Sophomore)</option>
                      <option>Undergraduate (Junior / Senior)</option>
                      <option>Fresh University Graduate</option>
                      <option>Postgraduate / Masters Student</option>
                      <option>Young Professional / Career Transitioner</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      2. University or Institution
                    </label>
                    <input
                      type="text"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      className={plainInputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      3. Field of Study / Major
                    </label>
                    <input
                      type="text"
                      value={fieldOfStudy}
                      onChange={(e) => setFieldOfStudy(e.target.value)}
                      className={plainInputClass}
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setOnboardingStep(2)}
                      className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2"
                    >
                      <span>Next: Skills & Goals</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-[#343047]">
                      Skills & Target Direction
                    </h3>
                    <p className="text-xs text-[#8B8295]">
                      Select what you know today and where you want to grow.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1.5">
                      4. Current Skills
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableSkills.map((skill) => {
                        const selected = currentSkills.includes(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => toggleSkill(skill)}
                            className={`px-3 py-1.5 text-xs rounded-full transition-colors font-semibold ${
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
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1.5">
                      5. Learning Interests
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableInterests.map((interest) => {
                        const selected = learningInterests.includes(interest);
                        return (
                          <button
                            key={interest}
                            type="button"
                            onClick={() => toggleInterest(interest)}
                            className={`px-3 py-1.5 text-xs rounded-full transition-colors font-semibold ${
                              selected
                                ? 'bg-[#A9D5B3] text-[#23472B] shadow-xs'
                                : 'bg-[#FAF6F2] border border-[#EEE6E5] text-[#5D5470] hover:bg-[#DCECD9]/60'
                            }`}
                          >
                            {interest}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      6. Primary Career Goal
                    </label>
                    <select
                      value={careerGoal}
                      onChange={(e) => setCareerGoal(e.target.value)}
                      className={plainInputClass}
                    >
                      <option>Become a Python Developer</option>
                      <option>Backend Systems & API Engineer</option>
                      <option>Data Scientist & AI Specialist</option>
                      <option>Full-Stack Software Engineer</option>
                      <option>Cloud & DevOps Practitioner</option>
                    </select>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setOnboardingStep(1)}
                      className="text-xs font-bold text-[#8B8295] hover:text-[#343047] flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                    <button
                      onClick={() => setOnboardingStep(3)}
                      className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2"
                    >
                      <span>Next: Habits & Level</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-[#343047]">
                      Learning Pace & Level
                    </h3>
                    <p className="text-xs text-[#8B8295]">
                      Tailor your daily milestones and baseline difficulty.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      7. Preferred Study Time:{' '}
                      <span className="text-[#8E6EC8] font-mono">{preferredHours} Hours / Day</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={0.5}
                      value={preferredHours}
                      onChange={(e) => setPreferredHours(parseFloat(e.target.value))}
                      className="w-full accent-[#A78BCE]"
                    />
                    <div className="flex justify-between text-[11px] text-[#8B8295] mt-1">
                      <span>1 hr/day</span>
                      <span>2–3 hrs/day</span>
                      <span>6 hrs/day</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1.5">
                      8. Current Knowledge Level
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setKnowledgeLevel(lvl)}
                          className={`p-3 rounded-[16px] border text-center text-xs transition-all ${
                            knowledgeLevel === lvl
                              ? 'bg-[#F0E9FA] border-[#A78BCE] text-[#343047] font-extrabold'
                              : 'bg-[#FAF6F2] border-[#EEE6E5] text-[#8B8295] font-semibold'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-[18px] bg-[#DCECD9]/60 border border-[#C2DFBC] text-xs text-[#315538] space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#4B8B59]" />
                      Ready to calibrate your learning path
                    </p>
                    <p className="text-[11px]">
                      We will generate your 6-stage personalized roadmap and diagnostic quiz.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setOnboardingStep(2)}
                      className="text-xs font-bold text-[#8B8295] hover:text-[#343047] flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                    <button
                      onClick={handleFinishOnboarding}
                      disabled={isGeneratingRoadmap}
                      className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2"
                    >
                      {isGeneratingRoadmap ? (
                        <>
                          <Sparkles className="w-4 h-4 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <span>Generate My Path</span>
                          <Check className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
