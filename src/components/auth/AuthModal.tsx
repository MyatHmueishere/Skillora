import React, { useState } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Lock,
  Mail,
  User,
  Loader2,
  MailCheck,
  KeyRound,
} from 'lucide-react';
import { UserProfile } from '../../types';
import { Logo } from '../common/Logo';
import { SmilingCloudMascot3D } from '../common/PastelIllustrations';
import { OnboardingFlow, OnboardingCompleteOptions } from './OnboardingFlow';
import {
  getSupabaseClient,
  formatAuthError,
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  validatePasswordStrength,
} from '../../lib/supabase';
import {
  ensureStudentProfile,
  loadStudentProfile,
  StudentProfileDbError,
} from '../../lib/studentProfile';

export type AuthMode =
  | 'login'
  | 'signup'
  | 'forgot_password'
  | 'verify_email'
  | 'reset_password'
  | 'onboarding';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthMode;
  initialError?: string;
  initialEmail?: string;
  initialFullName?: string;
  initialProfile?: Partial<UserProfile>;
  onClose: () => void;
  onModeChange?: (mode: AuthMode) => void;
  onCompleteAuth: (user: Partial<UserProfile>, options?: OnboardingCompleteOptions) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  initialError = '',
  initialEmail = '',
  initialFullName = '',
  initialProfile,
  onClose,
  onModeChange,
  onCompleteAuth,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState(initialFullName);
  const [resetSent, setResetSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showResendOnLogin, setShowResendOnLogin] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [loginPrefillProfile, setLoginPrefillProfile] = useState<Partial<UserProfile> | undefined>(undefined);

  // Password recovery (reset_password) states
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const onModeChangeRef = React.useRef(onModeChange);
  onModeChangeRef.current = onModeChange;

  // Sync mode & initial props when modal opens or closes
  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      onModeChangeRef.current?.(initialMode);
      setErrorMsg(initialError || '');
      setInfoMsg('');
      setResetSent(false);
      setShowResendOnLogin(false);
      setPasswordUpdated(false);
      setPassword('');
      setConfirmPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setLoginPrefillProfile(undefined);
      if (initialEmail) {
        setEmail(initialEmail);
      } else if (initialMode === 'login' || initialMode === 'signup') {
        setEmail('');
      }
      if (initialFullName) {
        setFullName(initialFullName);
      } else if (initialMode === 'signup') {
        setFullName('');
      }
    } else {
      setPassword('');
      setConfirmPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setErrorMsg('');
      setInfoMsg('');
      setPendingVerificationEmail('');
    }
  }, [isOpen, initialMode, initialError, initialEmail, initialFullName]);

  if (!isOpen) return null;

  const switchMode = (nextMode: AuthMode) => {
    setErrorMsg('');
    setInfoMsg('');
    setResetSent(false);
    setShowResendOnLogin(false);
    setMode(nextMode);
    onModeChangeRef.current?.(nextMode);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setShowResendOnLogin(false);
    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setPendingVerificationEmail(trimmedEmail);
          setShowResendOnLogin(true);
        }
        setErrorMsg(formatAuthError(error));
        return;
      }

      // Ensure Supabase session is active before loading/creating profile & redirecting
      const { data: sessionData } = await supabase.auth.getSession();
      const activeSession = sessionData.session ?? data.session;
      if (!activeSession || !activeSession.user) {
        setPendingVerificationEmail(trimmedEmail);
        switchMode('verify_email');
        return;
      }

      const { profile } = await ensureStudentProfile(supabase, activeSession.user, {
        email: trimmedEmail,
      });
      setPassword('');
      setConfirmPassword('');

      onCompleteAuth(profile);
      if (!profile.onboardingCompleted) {
        setLoginPrefillProfile(profile);
        switchMode('onboarding');
        return;
      }
      onClose();
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        setErrorMsg(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else {
        setErrorMsg(formatAuthError(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      setErrorMsg('All fields are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      setErrorMsg(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: trimmedName,
            onboarding_completed: false,
          },
        },
      });

      if (error) {
        setErrorMsg(formatAuthError(error));
        return;
      }

      // Supabase returns an empty identities array if the email already exists while confirmation is enabled
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErrorMsg('An account with this email already exists. Please sign in instead.');
        return;
      }

      setPassword('');
      setConfirmPassword('');

      // If email confirmation is required, Supabase returns session === null.
      // Do NOT redirect an unauthenticated user; display the verification screen instead.
      if (!data.session) {
        setPendingVerificationEmail(trimmedEmail);
        switchMode('verify_email');
        return;
      }

      // Confirm active Supabase session is established before creating/loading profile & redirecting
      const { data: sessionData } = await supabase.auth.getSession();
      const activeSession = sessionData.session ?? data.session;
      if (!activeSession || !activeSession.user) {
        setPendingVerificationEmail(trimmedEmail);
        switchMode('verify_email');
        return;
      }

      const { profile } = await ensureStudentProfile(supabase, activeSession.user, {
        name: trimmedName,
        email: trimmedEmail,
      });

      onCompleteAuth(profile);
      setLoginPrefillProfile(profile);
      switchMode('onboarding');
    } catch (err) {
      if (err instanceof StudentProfileDbError) {
        setErrorMsg(
          import.meta.env.DEV
            ? `${err.userMessage} (${err.toDiagnosticText()})`
            : err.userMessage
        );
      } else {
        setErrorMsg(formatAuthError(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = (pendingVerificationEmail || email).trim();
    if (!targetEmail) {
      setErrorMsg('Please enter your email address first.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsResending(true);

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setErrorMsg(formatAuthError(error));
        return;
      }

      setInfoMsg(`Verification email re-sent to ${targetEmail}. Please check your inbox.`);
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: window.location.origin,
      });

      if (error) {
        setErrorMsg(formatAuthError(error));
        return;
      }

      setResetSent(true);
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRecoveredPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      setErrorMsg('Please enter a new password.');
      return;
    }
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      setErrorMsg(passwordError);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMsg(formatAuthError(error));
        return;
      }

      setPasswordUpdated(true);
      setNewPassword('');
      setConfirmNewPassword('');
      if (data.user) {
        try {
          const profileResult = await loadStudentProfile(supabase, data.user);
          onCompleteAuth(profileResult.profile);
        } catch {
          // App listener will sync profile state
        }
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A89EB2]';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#343047]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`relative w-full ${
          mode === 'onboarding' ? 'max-w-xl' : 'max-w-lg'
        } max-h-[92vh] flex flex-col bg-[#FFFCFA] rounded-[28px] shadow-[0_24px_60px_-14px_rgba(74,56,102,0.32)] border border-[#EEE6E5] overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
      >
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
        <div className="p-6 overflow-y-auto">
          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-[16px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-semibold space-y-2">
              <p>{errorMsg}</p>
              {showResendOnLogin && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#6F4FA8] hover:underline disabled:opacity-60"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending verification email...</span>
                    </>
                  ) : (
                    <span>Resend verification email</span>
                  )}
                </button>
              )}
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-3.5 rounded-[16px] bg-[#DCECD9]/75 border border-[#BEDBB9] text-[#2D4D33] text-xs font-semibold">
              {infoMsg}
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
                      disabled={isSubmitting}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#343047]">Password</label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot_password')}
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
                      disabled={isSubmitting}
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-[#EEE6E5] text-center text-xs text-[#8B8295]">
                New to Skillora?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
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

              <form onSubmit={handleSignupSubmit} noValidate className="space-y-3.5">
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
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#343047] mb-1">Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          required
                          minLength={MIN_PASSWORD_LENGTH}
                          disabled={isSubmitting}
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
                          placeholder="Min. 8 characters"
                          required
                          minLength={MIN_PASSWORD_LENGTH}
                          disabled={isSubmitting}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8B8295] mt-1.5">
                    {PASSWORD_MIN_LENGTH_ERROR}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-[#EEE6E5] text-center text-xs text-[#8B8295]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-[#8E6EC8] hover:underline"
                >
                  Log in instead
                </button>
              </div>
            </div>
          )}

          {/* EMAIL VERIFICATION REQUIRED */}
          {mode === 'verify_email' && (
            <div className="space-y-5 text-center py-2">
              <div className="w-14 h-14 mx-auto rounded-[20px] clay-squircle-lavender text-white flex items-center justify-center shadow-sm">
                <MailCheck className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-xl font-extrabold text-[#343047]">
                  Verify your email address
                </h3>
                <p className="text-xs text-[#6E647A] leading-relaxed max-w-sm mx-auto">
                  We sent a confirmation link to{' '}
                  <span className="font-bold text-[#343047]">
                    {pendingVerificationEmail || email}
                  </span>
                  . Please click the link in your inbox to activate your Skillora account—you will then be signed in and redirected to your Dashboard.
                </p>
              </div>

              <div className="p-4 rounded-[18px] bg-[#FFF1D6]/70 border border-[#F3DFB4] text-[11px] text-[#6B5022] font-medium">
                Check your spam or promotions folder if you don’t see the email within a minute.
              </div>

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="w-full clay-button-soft py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#8E6EC8]" />
                      <span>Resending...</span>
                    </>
                  ) : (
                    <span>Resend Verification Email</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full clay-button-primary py-3 text-xs font-bold"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot_password' && (
            <div>
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
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
                    type="button"
                    onClick={() => switchMode('login')}
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
                        disabled={isSubmitting}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Email...</span>
                      </>
                    ) : (
                      <span>Send Recovery Email</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* PASSWORD RECOVERY (SET NEW PASSWORD) */}
          {mode === 'reset_password' && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-[16px] clay-squircle-lavender text-white flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-extrabold text-[#343047]">
                    Choose a new password
                  </h3>
                  <p className="text-xs text-[#8B8295] mt-0.5">
                    Enter your new password below to regain access to your account.
                  </p>
                </div>
              </div>

              {passwordUpdated ? (
                <div className="p-5 rounded-[20px] bg-[#DCECD9]/65 border border-[#C0DFBB] text-center space-y-3">
                  <div className="w-10 h-10 mx-auto rounded-2xl clay-squircle-mint text-white flex items-center justify-center">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <h4 className="font-display text-sm font-extrabold text-[#2D4D33]">
                    Password updated successfully!
                  </h4>
                  <p className="text-xs text-[#456D4C]">
                    Your account is ready. Continue to your personalized dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="clay-button-primary px-5 py-2.5 text-xs font-bold"
                  >
                    Continue to Dashboard
                  </button>
                </div>
              ) : (
                <form onSubmit={handleUpdateRecoveredPassword} noValidate className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      New Password (min. 8 characters)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        disabled={isSubmitting}
                        className={inputClass}
                      />
                    </div>
                    <p className="text-[11px] text-[#8B8295] mt-1">
                      {PASSWORD_MIN_LENGTH_ERROR}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#343047] mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#8B8295] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        disabled={isSubmitting}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <span>Update Password</span>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* STUDENT ONBOARDING (4-STEP PERSONALIZED FLOW) */}
          {mode === 'onboarding' && (
            <OnboardingFlow
              initialProfile={loginPrefillProfile ?? initialProfile}
              fallbackEmail={email}
              fallbackName={fullName}
              onComplete={(saved, options) => {
                onCompleteAuth(saved, options);
                onClose();
              }}
              onError={(msg) => setErrorMsg(msg)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
