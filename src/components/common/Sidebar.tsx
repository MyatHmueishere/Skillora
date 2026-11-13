import React from 'react';
import {
  Home,
  GraduationCap,
  Compass,
  BookOpen,
  Sparkles,
  BarChart3,
  User,
  Settings,
  HelpCircle,
  X,
  LogOut,
} from 'lucide-react';
import { AppView, UserProfile } from '../../types';
import { Logo } from './Logo';
import { PottedPlant3D } from './PastelIllustrations';

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  user: UserProfile;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  user,
  mobileOpen,
  onCloseMobile,
  onLogout,
}) => {
  const mainNavItems = [
    { id: 'dashboard' as AppView, label: 'Dashboard', icon: Home },
    { id: 'assessment' as AppView, label: 'Skill Assessment', icon: GraduationCap },
    { id: 'roadmap' as AppView, label: 'My Learning Path', icon: Compass },
    { id: 'resources' as AppView, label: 'Explore Resources', icon: BookOpen },
    { id: 'assistant' as AppView, label: 'AI Learning Assistant', icon: Sparkles },
    { id: 'progress' as AppView, label: 'My Progress', icon: BarChart3 },
  ];

  const bottomNavItems = [
    { id: 'profile' as AppView, label: 'My Profile', icon: User },
    { id: 'settings' as AppView, label: 'Settings', icon: Settings },
    { id: 'help' as AppView, label: 'Help & Support', icon: HelpCircle },
  ];

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    onCloseMobile();
  };

  const sidebarContent = (
    <div
      className="flex h-full flex-col justify-between text-white relative overflow-y-auto overflow-x-hidden select-none"
      style={{
        background: 'linear-gradient(180deg, #CCB9EC 0%, #BEA8E5 55%, #B49CE0 100%)',
      }}
    >
      {/* Top Brand & Navigation */}
      <div className="px-4 pt-6 pb-3 space-y-5">
        {/* Brand Row */}
        <div className="flex items-center justify-between px-2">
          <button
            onClick={() => handleNavClick('dashboard')}
            className="text-left focus:outline-none group"
          >
            <Logo size="md" onLavender={true} />
          </button>
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Learning Goal Mini Soft Capsule */}
        <div
          onClick={() => handleNavClick('roadmap')}
          className="mx-1 p-3 rounded-[18px] bg-white/18 backdrop-blur-xs border border-white/25 cursor-pointer hover:bg-white/25 transition-colors"
        >
          <div className="flex items-center justify-between text-[11px] text-white/85 font-medium">
            <span>Active Goal</span>
            <span className="font-mono font-bold text-white tabular-nums">
              {user.overallProgress}%
            </span>
          </div>
          <p className="text-xs font-bold text-white truncate mt-0.5">{user.careerGoal}</p>
          <div className="mt-2 w-full bg-white/25 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#FFFCFA] h-full rounded-full transition-all duration-500"
              style={{ width: `${user.overallProgress}%` }}
            />
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="space-y-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-[16px] text-[13px] transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#FFFCFA] text-[#343047] font-bold shadow-[0_8px_20px_-6px_rgba(86,58,132,0.38)]'
                    : 'text-white/90 font-medium hover:bg-white/18 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                    isActive ? 'text-[#9673CE]' : 'text-white/85'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                {item.id === 'assistant' && (
                  <span
                    className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-[#F0E9FA] text-[#7F5FB8]'
                        : 'bg-white/20 text-white'
                    }`}
                  >
                    AI
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Secondary Account Navigation */}
        <div className="pt-2 border-t border-white/20 space-y-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-[14px] text-[13px] transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#FFFCFA] text-[#343047] font-bold shadow-[0_8px_20px_-6px_rgba(86,58,132,0.38)]'
                    : 'text-white/85 font-medium hover:bg-white/18 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-[17px] h-[17px] shrink-0 ${
                    isActive ? 'text-[#9673CE]' : 'text-white/80'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-[14px] text-[13px] font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors whitespace-nowrap"
          >
            <LogOut className="w-[17px] h-[17px] shrink-0 text-white/75" />
            <span>Landing Page</span>
          </button>
        </div>
      </div>

      {/* Bottom Decorative 3D Plant Pedestal (inspired by reference) */}
      <div className="hidden md:flex flex-col items-center pt-2 pb-4 px-4 mt-auto">
        <div className="relative flex flex-col items-center">
          <PottedPlant3D className="w-24 h-28 -mb-3 relative z-10 drop-shadow-md" />
          {/* Soft Lavender 3D Shelf Pedestal */}
          <div
            className="w-44 h-4 rounded-full"
            style={{
              background: 'linear-gradient(180deg, #D9C9F4 0%, #B49ADE 100%)',
              boxShadow: '0 8px 14px -4px rgba(86, 58, 132, 0.35), inset 0 2px 3px rgba(255,255,255,0.5)',
            }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Lavender Sidebar */}
      <aside className="hidden md:block w-64 h-screen fixed inset-y-0 left-0 z-30 shadow-[6px_0_30px_-10px_rgba(124,102,148,0.22)]">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-[#343047]/35 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-72 z-50 md:hidden transform transition-transform duration-200 ease-in-out shadow-2xl ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};
