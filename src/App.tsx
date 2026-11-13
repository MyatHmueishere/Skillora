/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppView, UserProfile, Course, ResourceItem, NotificationItem } from './types';
import {
  INITIAL_USER_PROFILE,
  PYTHON_ROADMAP_STAGES,
  ALL_RESOURCES,
  NOTIFICATIONS_DATA,
} from './data/mockData';

// Layout & Common Components
import { Sidebar } from './components/common/Sidebar';
import { TopNavbar } from './components/common/TopNavbar';
import { LessonModal } from './components/common/LessonModal';

// Views
import { LandingPage } from './components/landing/LandingPage';
import { AuthModal, AuthMode } from './components/auth/AuthModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { AssessmentView } from './components/assessment/AssessmentView';
import { RoadmapView } from './components/roadmap/RoadmapView';
import { ResourcesView } from './components/resources/ResourcesView';
import { AssistantView } from './components/assistant/AssistantView';
import { ProgressView } from './components/progress/ProgressView';
import { ProfileView } from './components/profile/ProfileView';
import { SettingsView } from './components/profile/SettingsView';
import { HelpView } from './components/help/HelpView';

export default function App() {
  // Navigation & View state
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Core application state
  const [user, setUser] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [stages, setStages] = useState(PYTHON_ROADMAP_STAGES);
  const [resources, setResources] = useState<ResourceItem[]>(ALL_RESOURCES);
  const [notifications, setNotifications] = useState<NotificationItem[]>(NOTIFICATIONS_DATA);

  // Modals & Contextual triggers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>('login');
  const [activeCourseModal, setActiveCourseModal] = useState<Course | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');
  const [globalSearch, setGlobalSearch] = useState('');

  // Handle roadmap lesson toggle & recalculate progress
  const handleToggleLesson = (stageId: number, lessonId: string) => {
    setStages((prevStages) => {
      const updated = prevStages.map((stage) => {
        if (stage.id !== stageId) return stage;
        const newLessons = stage.lessons.map((lesson) => {
          if (lesson.id === lessonId) {
            return { ...lesson, completed: !lesson.completed };
          }
          return lesson;
        });

        // Check if all lessons are completed
        const allCompleted = newLessons.every((l) => l.completed);
        const someCompleted = newLessons.some((l) => l.completed);

        return {
          ...stage,
          lessons: newLessons,
          status: allCompleted ? ('completed' as const) : someCompleted ? ('in_progress' as const) : ('upcoming' as const),
        };
      });

      // Recalculate total progress
      const totalUnits = updated.reduce((acc, s) => acc + s.lessons.length, 0);
      const completedUnits = updated.reduce(
        (acc, s) => acc + s.lessons.filter((l) => l.completed).length,
        0
      );
      const newProgress = Math.round((completedUnits / (totalUnits || 1)) * 100);

      setUser((prevUser) => ({
        ...prevUser,
        overallProgress: newProgress,
      }));

      return updated;
    });
  };

  // Toggle bookmarking a resource
  const handleToggleSaveResource = (id: string) => {
    setResources((prev) =>
      prev.map((r) => (r.id === id ? { ...r, saved: !r.saved } : r))
    );
  };

  // Notification handlers
  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = () => {
    setNotifications([]);
  };

  // Update user profile or settings
  const handleUpdateUser = (updatedData: Partial<UserProfile>) => {
    setUser((prev) => ({
      ...prev,
      ...updatedData,
    }));
  };

  // Update diagnostic assessment score
  const handleUpdateScore = (score: number) => {
    setUser((prev) => ({
      ...prev,
      totalHours: prev.totalHours + 1,
    }));
  };

  // Auth modal triggers
  const openLogin = () => {
    setAuthInitialMode('login');
    setAuthModalOpen(true);
  };

  const openSignUp = () => {
    setAuthInitialMode('signup');
    setAuthModalOpen(true);
  };

  const handleCompleteAuth = (updatedFields: Partial<UserProfile>) => {
    setUser((prev) => ({
      ...prev,
      ...updatedFields,
    }));
    setCurrentView('dashboard');
  };

  const handleOpenAssistantWithPrompt = (prompt: string) => {
    setAssistantPrompt(prompt);
    setCurrentView('assistant');
  };

  // If on public landing page
  if (currentView === 'landing') {
    return (
      <>
        <LandingPage
          onGetStarted={openSignUp}
          onLogin={openLogin}
          onExploreDashboard={() => setCurrentView('dashboard')}
        />
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authInitialMode}
          onClose={() => setAuthModalOpen(false)}
          onCompleteAuth={handleCompleteAuth}
        />
      </>
    );
  }

  // Dashboard Application Layout
  return (
    <div className="min-h-screen bg-[#FAF6F2] flex text-[#343047]">
      {/* Fixed Left Sidebar (256px on desktop) */}
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        user={user}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onLogout={() => setCurrentView('landing')}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        {/* Top Navigation Bar */}
        <TopNavbar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          user={user}
          notifications={notifications}
          onMarkAllAsRead={handleMarkAllNotificationsRead}
          onClearNotifications={handleClearNotifications}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          onLogout={() => setCurrentView('landing')}
          searchQuery={globalSearch}
          onSearchChange={(q) => {
            setGlobalSearch(q);
            if (q.trim() && currentView !== 'resources') {
              setCurrentView('resources');
            }
          }}
        />

        {/* Inner Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          {currentView === 'dashboard' && (
            <DashboardView
              user={user}
              onNavigate={(view) => setCurrentView(view)}
              onSelectCourse={(course) => setActiveCourseModal(course)}
              onOpenAssistantPrompt={handleOpenAssistantWithPrompt}
            />
          )}

          {currentView === 'assessment' && (
            <AssessmentView
              onNavigate={(view) => setCurrentView(view)}
              onOpenAssistantPrompt={handleOpenAssistantWithPrompt}
              onUpdateScore={handleUpdateScore}
            />
          )}

          {currentView === 'roadmap' && (
            <RoadmapView
              stages={stages}
              onToggleLesson={handleToggleLesson}
              onNavigate={(view) => setCurrentView(view)}
              careerGoal={user.careerGoal}
            />
          )}

          {currentView === 'resources' && (
            <ResourcesView
              resources={resources}
              onToggleSave={handleToggleSaveResource}
              onNavigate={(view) => setCurrentView(view)}
              initialSearch={globalSearch}
            />
          )}

          {currentView === 'assistant' && (
            <AssistantView
              onNavigate={(view) => setCurrentView(view)}
              externalPrompt={assistantPrompt}
              onClearExternalPrompt={() => setAssistantPrompt('')}
            />
          )}

          {currentView === 'progress' && (
            <ProgressView
              user={user}
              onNavigate={(view) => setCurrentView(view)}
            />
          )}

          {currentView === 'profile' && (
            <ProfileView
              user={user}
              onUpdateProfile={handleUpdateUser}
              onNavigate={(view) => setCurrentView(view)}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              user={user}
              onUpdateUser={handleUpdateUser}
            />
          )}

          {currentView === 'help' && (
            <HelpView
              onNavigate={(view) => setCurrentView(view)}
            />
          )}
        </main>
      </div>

      {/* Global Interactive Modals */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authInitialMode}
        onClose={() => setAuthModalOpen(false)}
        onCompleteAuth={handleCompleteAuth}
      />

      <LessonModal
        course={activeCourseModal}
        isOpen={Boolean(activeCourseModal)}
        onClose={() => setActiveCourseModal(null)}
        onNavigate={(view) => setCurrentView(view)}
        onOpenAssistant={handleOpenAssistantWithPrompt}
      />
    </div>
  );
}
