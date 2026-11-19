import React, { useState } from 'react';
import { Menu, Search, Flame, ChevronDown, User, Settings, LogOut, MessageCircle, Trophy } from 'lucide-react';
import { AppView, UserProfile, NotificationItem } from '../../types';
import { DEFAULT_AVATAR_URL } from '../../lib/studentProfile';
import { NotificationDropdown } from './NotificationDropdown';

interface TopNavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  user: UserProfile;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onMarkNotificationRead?: (id: string) => void;
  onClearNotifications: () => void;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isAuthenticated?: boolean;
  onOpenNotificationSettings?: () => void;
  totalXp?: number;
  learnerLevel?: number;
  onOpenAchievements?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentView,
  onNavigate,
  user,
  notifications,
  onMarkAllAsRead,
  onMarkNotificationRead,
  onClearNotifications,
  onOpenMobileMenu,
  onLogout,
  searchQuery,
  onSearchChange,
  isAuthenticated = false,
  onOpenNotificationSettings,
  totalXp = 0,
  learnerLevel = 1,
  onOpenAchievements,
}) => {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const getPageTitle = (view: AppView) => {
    switch (view) {
      case 'dashboard':
        return 'Dashboard';
      case 'assessment':
        return 'Skill Assessment';
      case 'roadmap':
        return 'My Learning Path';
      case 'resources':
        return 'Explore Resources';
      case 'assistant':
        return 'AI Learning Assistant';
      case 'progress':
        return 'My Progress';
      case 'achievements':
        return 'Achievements & Certificates';
      case 'verify':
        return 'Certificate Verification';
      case 'profile':
        return 'My Profile';
      case 'settings':
        return 'Settings';
      case 'help':
        return 'Help & Support';
      default:
        return 'Skillora';
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-[#FAF6F2]/90 backdrop-blur-md px-4 sm:px-6 md:px-8 pt-4 pb-3 flex items-center justify-between gap-4">
      {/* Zone 1: Mobile menu button + Friendly Title & Welcome Subtitle */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2.5 rounded-2xl bg-[#FFFCFA] border border-[#EEE6E5] text-[#343047] shadow-xs hover:bg-[#F0E9FA] transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#343047] tracking-tight truncate leading-tight">
            {getPageTitle(currentView)}
          </h2>
          <p className="text-xs text-[#8B8295] truncate hidden sm:block">
            Welcome back, {(user.name ? user.name.split(' ')[0] : '') || 'Student'}!
          </p>
        </div>
      </div>

      {/* Zone 2: Soft Pill Search Input (matches reference) */}
      <div className="flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8B8295] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search courses, skills, or topics..."
            className="w-full pl-11 pr-4 py-2.5 text-xs bg-[#FFFCFA] border border-[#EEE6E5] rounded-full shadow-[0_4px_14px_-4px_rgba(124,102,148,0.08)] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8]/60 focus:border-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A49BB0]"
          />
        </div>
      </div>

      {/* Zone 3: Circular Soft Pastel Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Level & XP pill */}
        <button
          onClick={() => (onOpenAchievements ? onOpenAchievements() : onNavigate('achievements'))}
          className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#F0E9FA] border border-[#E2D6F5] text-[#5D438E] text-xs font-bold shadow-[0_4px_12px_-4px_rgba(124,102,148,0.16)] hover:brightness-98 transition-all"
          title={`Level ${learnerLevel} · ${totalXp} XP — View Achievements`}
        >
          <Trophy className="w-3.5 h-3.5 text-[#8E6EC8] shrink-0" />
          <span className="font-mono tabular-nums whitespace-nowrap">
            Lv.{learnerLevel} · {totalXp} XP
          </span>
        </button>

        {/* Streak badge */}
        <button
          onClick={() => onNavigate('progress')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#FFF1D6] border border-[#F5E0B5] text-[#7A5720] text-xs font-bold shadow-[0_4px_12px_-4px_rgba(218,176,94,0.22)] hover:brightness-98 transition-all"
          title="Daily Study Streak"
        >
          <Flame className="w-3.5 h-3.5 fill-[#EE9D3B] text-[#EE9D3B] shrink-0" />
          <span className="font-mono tabular-nums whitespace-nowrap">
            {user.currentStreak}d Streak
          </span>
        </button>

        {/* Notifications */}
        <NotificationDropdown
          notifications={notifications}
          onMarkAllAsRead={onMarkAllAsRead}
          onMarkNotificationRead={onMarkNotificationRead}
          onClearNotifications={onClearNotifications}
          onNavigate={onNavigate}
          onOpenNotificationSettings={onOpenNotificationSettings}
        />

        {/* Quick AI Chat Circular Icon */}
        <button
          onClick={() => onNavigate('assistant')}
          aria-label="Open AI Learning Assistant"
          title="AI Learning Assistant"
          className="w-10 h-10 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] shadow-[0_4px_12px_-4px_rgba(124,102,148,0.12)] flex items-center justify-center text-[#5A526B] hover:text-[#8E6EC8] hover:bg-[#F0E9FA]/50 transition-all"
        >
          <MessageCircle className="w-[18px] h-[18px]" />
        </button>

        {/* Profile Avatar & Menu */}
        <div className="relative">
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2 p-1 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] shadow-[0_4px_12px_-4px_rgba(124,102,148,0.12)] hover:border-[#C9B7E8] transition-all focus:outline-none"
            aria-label="User menu"
          >
            <img
              src={user.avatarUrl || DEFAULT_AVATAR_URL}
              alt={user.name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== window.location.origin + DEFAULT_AVATAR_URL) {
                  target.src = DEFAULT_AVATAR_URL;
                }
              }}
              className="w-8 h-8 rounded-full object-cover bg-[#FAF6F2]"
            />
            <ChevronDown className="w-3.5 h-3.5 text-[#8B8295] mr-1.5 hidden xl:block" />
          </button>

          {profileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 mt-2.5 w-60 rounded-[22px] bg-[#FFFCFA] border border-[#EEE6E5] shadow-[0_20px_44px_-12px_rgba(88,68,112,0.22)] z-50 py-1.5 overflow-hidden animate-in fade-in duration-150">
                <div className="px-4 py-3 border-b border-[#EEE6E5] bg-[#FAF6F2]/50">
                  <p className="font-display text-sm font-extrabold text-[#343047]">
                    {user.name || 'Student'}
                  </p>
                  <p className="text-[11px] text-[#8B8295] truncate">{user.email}</p>
                  <p className="text-[11px] text-[#8E6EC8] font-semibold mt-1 truncate">
                    {user.careerGoal || 'Set your career goal'}
                  </p>
                </div>

                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#343047] hover:bg-[#F0E9FA]/70 transition-colors text-left"
                  >
                    <User className="w-4 h-4 text-[#9B7ACE]" />
                    <span>My Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onNavigate('settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#343047] hover:bg-[#F0E9FA]/70 transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-[#9B7ACE]" />
                    <span>Settings & Preferences</span>
                  </button>
                </div>

                <div className="p-1.5 border-t border-[#EEE6E5]">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#C85A6E] hover:bg-[#F8D9D0]/50 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 text-[#D97284]" />
                    <span>{isAuthenticated ? 'Sign Out' : 'Exit to Landing Page'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
