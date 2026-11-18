import React, { useState } from 'react';
import { Bell, CheckCheck, Trash2, Award, Sparkles, BookOpen, Clock, Settings } from 'lucide-react';
import { NotificationItem, AppView } from '../../types';

interface NotificationDropdownProps {
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onMarkNotificationRead?: (id: string) => void;
  onClearNotifications: () => void;
  onNavigate: (view: AppView) => void;
  onOpenNotificationSettings?: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  onMarkAllAsRead,
  onMarkNotificationRead,
  onClearNotifications,
  onNavigate,
  onOpenNotificationSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;
  const displayedList = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'achievement':
        return (
          <div className="w-8 h-8 rounded-[11px] clay-squircle-yellow flex items-center justify-center text-white">
            <Award className="w-4 h-4" />
          </div>
        );
      case 'insight':
        return (
          <div className="w-8 h-8 rounded-[11px] clay-squircle-lavender flex items-center justify-center text-white">
            <Sparkles className="w-4 h-4" />
          </div>
        );
      case 'course':
        return (
          <div className="w-8 h-8 rounded-[11px] clay-squircle-mint flex items-center justify-center text-white">
            <BookOpen className="w-4 h-4" />
          </div>
        );
      case 'reminder':
      default:
        return (
          <div className="w-8 h-8 rounded-[11px] clay-squircle-peach flex items-center justify-center text-white">
            <Clock className="w-4 h-4" />
          </div>
        );
    }
  };

  const handleNotificationClick = (item: NotificationItem) => {
    onMarkNotificationRead?.(item.id);
    setIsOpen(false);
    if (item.id.startsWith('inactivity:') || item.id === 'start-daily-goal') {
      onNavigate('roadmap');
    } else if (item.id === 'profile-complete-nudge') {
      onNavigate('profile');
    } else if (item.type === 'insight') {
      onNavigate('assistant');
    } else if (item.type === 'achievement') {
      onNavigate('progress');
    } else if (item.type === 'course') {
      onNavigate('roadmap');
    } else {
      onNavigate('assessment');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        className="relative w-10 h-10 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] shadow-[0_4px_12px_-4px_rgba(124,102,148,0.12)] flex items-center justify-center text-[#5A526B] hover:text-[#343047] hover:bg-[#F0E9FA]/50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9B7E8]"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F29CB0] px-1 text-[10px] font-bold text-white shadow-xs tabular-nums">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-[24px] bg-[#FFFCFA] border border-[#EEE6E5] shadow-[0_20px_44px_-12px_rgba(88,68,112,0.22)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-[#EEE6E5] flex items-center justify-between bg-[#FAF6F2]/70">
              <div className="flex items-center gap-2">
                <h4 className="font-display text-sm font-extrabold text-[#343047]">
                  Notifications
                </h4>
                {unreadCount > 0 && (
                  <span className="text-xs text-[#8D6EC2] font-semibold tabular-nums">
                    ({unreadCount} new)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllAsRead}
                    className="px-2 py-1 rounded-lg text-xs text-[#8B8295] hover:text-[#7E5EB5] hover:bg-[#F0E9FA] flex items-center gap-1 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">Read all</span>
                  </button>
                )}
                <button
                  onClick={onClearNotifications}
                  className="p-1.5 rounded-lg text-[#8B8295] hover:text-[#D16B7E] hover:bg-[#F8D9D0]/40 transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter segments */}
            <div className="flex items-center gap-1.5 p-2 bg-[#FAF6F2]/40 border-b border-[#EEE6E5]">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors ${
                  filter === 'all'
                    ? 'bg-[#FFFCFA] text-[#343047] shadow-xs border border-[#EEE6E5]'
                    : 'text-[#8B8295] hover:text-[#343047]'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors ${
                  filter === 'unread'
                    ? 'bg-[#FFFCFA] text-[#343047] shadow-xs border border-[#EEE6E5]'
                    : 'text-[#8B8295] hover:text-[#343047]'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-[#EEE6E5]/70">
              {displayedList.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <div className="w-11 h-11 mx-auto rounded-2xl bg-[#F0E9FA] flex items-center justify-center text-[#A78BCE] mb-2.5">
                    <Bell className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-[#343047]">All caught up!</p>
                  <p className="text-[11px] text-[#8B8295] mt-0.5">
                    No new learning notifications right now.
                  </p>
                </div>
              ) : (
                displayedList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 flex items-start gap-3 hover:bg-[#FAF6F2] transition-colors cursor-pointer ${
                      !item.read ? 'bg-[#F0E9FA]/45' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{getIcon(item.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            !item.read ? 'font-bold text-[#343047]' : 'font-medium text-[#5A526B]'
                          }`}
                        >
                          {item.title}
                        </p>
                        <span className="text-[10px] text-[#8B8295] whitespace-nowrap tabular-nums">
                          {item.timestamp}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8B8295] line-clamp-2 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {onOpenNotificationSettings && (
              <div className="p-2.5 border-t border-[#EEE6E5] bg-[#FAF6F2]/70 flex items-center justify-between">
                <span className="text-[10px] text-[#8B8295] font-medium px-1">
                  Reminders &amp; browser alerts
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenNotificationSettings();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#FFFCFA] border border-[#EEE6E5] text-[11px] font-bold text-[#6F4FA8] hover:bg-[#F0E9FA] transition-colors flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" />
                  <span>Preferences</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
