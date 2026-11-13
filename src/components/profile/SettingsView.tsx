import React, { useState } from 'react';
import { Settings, Check, X, AlertCircle, Download } from 'lucide-react';
import { UserProfile } from '../../types';
import { ClayIconBadge } from '../common/PastelIllustrations';

interface SettingsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'learning' | 'notifications' | 'security'>('personal');

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [preferredHours, setPreferredHours] = useState(user.preferredHoursPerDay);
  const [knowledgeLevel, setKnowledgeLevel] = useState(user.knowledgeLevel);

  const [streakReminders, setStreakReminders] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [aiInsightAlerts, setAiInsightAlerts] = useState(true);
  const [newCourseAlerts, setNewCourseAlerts] = useState(false);

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser({
      name,
      email,
      preferredHoursPerDay: preferredHours,
      knowledgeLevel,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass || !newPass) {
      setPasswordError('Please fill in both current and new passwords.');
      return;
    }
    if (newPass.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPass !== confirmPass) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordError('');
    setPasswordSuccess(true);
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047]';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {savedSuccess && (
        <div className="p-4 rounded-[20px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
            <span>Settings successfully saved!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)}>
            <X className="w-4 h-4 text-[#3B6B46]" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="pastel-card p-6 sm:p-8 flex items-center gap-4">
        <ClayIconBadge variant="lavender" size="lg">
          <Settings className="w-6 h-6" />
        </ClayIconBadge>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
            Account & Learning Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#8B8295] mt-0.5">
            Personalize your study pace, notifications, and account preferences.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#FFFCFA] border border-[#EEE6E5] rounded-full w-fit flex-wrap shadow-2xs">
        {[
          { id: 'personal', label: 'Personal Info' },
          { id: 'learning', label: 'Learning Preferences' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'security', label: 'Password & Security' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
              activeTab === tab.id
                ? 'bg-[#A78BCE] text-white shadow-xs'
                : 'text-[#8B8295] hover:text-[#343047]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1 */}
      {activeTab === 'personal' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-base font-extrabold text-[#343047]">
            Personal Information
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-4">
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
                  Academic Institution
                </label>
                <input
                  type="text"
                  value={user.university}
                  disabled
                  className="w-full px-3.5 py-2.5 text-xs bg-[#F1EAE8]/70 border border-[#EEE6E5] rounded-[14px] text-[#8B8295] cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#343047] mb-1">Timezone</label>
                <select className={inputClass}>
                  <option>Pacific Standard Time (UTC-8)</option>
                  <option>Eastern Standard Time (UTC-5)</option>
                  <option>Central European Time (UTC+1)</option>
                  <option>Singapore Standard Time (UTC+8)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEE6E5] flex justify-end">
              <button type="submit" className="clay-button-primary px-5 py-2.5 text-xs font-bold">
                Save Personal Info
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2 */}
      {activeTab === 'learning' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-base font-extrabold text-[#343047]">
            Learning Habits & Goals
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Daily Study Goal:{' '}
                <span className="font-mono text-[#8E6EC8]">{preferredHours} Hours / Day</span>
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
                <span>1 hr/day (Casual)</span>
                <span>2–3 hrs/day (Recommended)</span>
                <span>6 hrs/day (Intensive)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-2">
                Knowledge Difficulty Baseline
              </label>
              <div className="grid grid-cols-3 gap-3">
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

            <div className="pt-4 border-t border-[#EEE6E5] flex justify-end">
              <button type="submit" className="clay-button-primary px-5 py-2.5 text-xs font-bold">
                Save Learning Preferences
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3 */}
      {activeTab === 'notifications' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#343047]">
              Notification Channels
            </h2>
            <p className="text-xs text-[#8B8295] mt-0.5">
              Choose gentle reminders that keep your study rhythm steady.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                id: 'streak',
                title: 'Daily Streak Reminders',
                desc: 'Friendly reminder at 6:00 PM if daily units are pending.',
                checked: streakReminders,
                setter: setStreakReminders,
              },
              {
                id: 'digest',
                title: 'Weekly Progress Digest',
                desc: 'Sunday evening recap of your study hours and skill growth.',
                checked: weeklyDigest,
                setter: setWeeklyDigest,
              },
              {
                id: 'ai_alerts',
                title: 'AI Curriculum Insights',
                desc: 'Notifications when new practice exercises match your gaps.',
                checked: aiInsightAlerts,
                setter: setAiInsightAlerts,
              },
              {
                id: 'course_alerts',
                title: 'New Course & Resource Releases',
                desc: 'Updates when fresh resources match your Python Developer track.',
                checked: newCourseAlerts,
                setter: setNewCourseAlerts,
              },
            ].map((item) => (
              <div
                key={item.id}
                onClick={() => item.setter(!item.checked)}
                className="p-4 rounded-[18px] bg-[#FAF6F2]/75 border border-[#EEE6E5] flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F0E9FA]/45 transition-colors"
              >
                <div>
                  <h4 className="font-display text-sm font-extrabold text-[#343047]">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-[#8B8295] mt-0.5">{item.desc}</p>
                </div>
                <div
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    item.checked ? 'bg-[#A78BCE]' : 'bg-[#DFD5E2]'
                  }`}
                >
                  <div
                    className={`bg-[#FFFCFA] w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                      item.checked ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#EEE6E5] flex justify-end">
            <button
              onClick={() => {
                setSavedSuccess(true);
                setTimeout(() => setSavedSuccess(false), 3000);
              }}
              className="clay-button-primary px-5 py-2.5 text-xs font-bold"
            >
              Save Notification Preferences
            </button>
          </div>
        </div>
      )}

      {/* TAB 4 */}
      {activeTab === 'security' && (
        <div className="pastel-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="font-display text-base font-extrabold text-[#343047]">
              Password & Security
            </h2>
            <p className="text-xs text-[#8B8295] mt-0.5">
              Keep your account protected with a strong password.
            </p>
          </div>

          {passwordSuccess && (
            <div className="p-4 rounded-[18px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
              <span>Password successfully updated!</span>
            </div>
          )}

          {passwordError && (
            <div className="p-4 rounded-[18px] bg-[#FCEAE5] border border-[#F3C5BA] text-[#8D3E32] text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C25E4D]" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                New Password (min 8 chars)
              </label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="••••••••••••"
                className={inputClass}
              />
            </div>

            <div className="pt-2">
              <button type="submit" className="clay-button-primary px-5 py-2.5 text-xs font-bold">
                Update Password
              </button>
            </div>
          </form>

          <div className="pt-6 border-t border-[#EEE6E5] flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-display text-sm font-extrabold text-[#343047]">
                Export Learning Data
              </p>
              <p className="text-xs text-[#8B8295]">
                Download a JSON snapshot of your assessment history and roadmap checkpoints.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(user, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'skillora-study-data.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="clay-button-soft px-4 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
