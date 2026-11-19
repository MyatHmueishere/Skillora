import React from 'react';
import { Award, ShieldCheck, Trophy } from 'lucide-react';
import type {
  AchievementSummaryPayload,
  AppView,
  IssuedCertificateRecord,
} from '../../types';
import { BooksTrophy3D } from '../common/PastelIllustrations';
import {
  AchievementsSection,
  AchievementsTabId,
} from './AchievementsSection';

interface AchievementsViewProps {
  summary: AchievementSummaryPayload;
  isAuthenticated: boolean;
  isLoading?: boolean;
  error?: string;
  initialTab?: AchievementsTabId;
  onRefresh?: () => void;
  onNavigate: (view: AppView) => void;
  onOpenVerification: (certificateNumber?: string) => void;
  onCertificateUpdated?: (updatedCertificate: IssuedCertificateRecord) => void;
}

export const AchievementsView: React.FC<AchievementsViewProps> = ({
  summary,
  isAuthenticated,
  isLoading = false,
  error = '',
  initialTab = 'overview',
  onRefresh,
  onNavigate,
  onOpenVerification,
  onCertificateUpdated,
}) => {
  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Page Header Banner */}
      <div
        className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
        style={{
          background: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 55%, #FFF1D6 100%)',
          boxShadow: '0 12px 30px -12px rgba(154, 126, 200, 0.25)',
        }}
      >
        <div className="flex items-center gap-5">
          <BooksTrophy3D className="w-24 h-20 hidden sm:block shrink-0" />
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[#6F4FA8] uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-[#9B7ACE]" />
              <span>Recognition, Credentials &amp; Mastery</span>
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
              Achievements &amp; Certificates
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6178] max-w-xl leading-relaxed">
              {isAuthenticated
                ? 'Track your Level, Overall and Direction XP, unlock category badges, and download verifiable professional certificates.'
                : 'Preview Skillora achievements and certificates. Sign in to record verified XP and earn official credentials.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
          <button
            type="button"
            onClick={() => onOpenVerification()}
            className="clay-button-soft px-4 py-2.5 text-xs font-bold text-[#0F1D3A] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-[#C8A24A]" />
            <span>Verify ID</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('roadmap')}
            className="clay-button-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Award className="w-4 h-4" />
            <span>My Learning Path</span>
          </button>
        </div>
      </div>

      <AchievementsSection
        summary={summary}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        error={error}
        initialTab={initialTab}
        onRefresh={onRefresh}
        onNavigate={onNavigate}
        onOpenVerification={onOpenVerification}
        onCertificateUpdated={onCertificateUpdated}
      />
    </div>
  );
};
