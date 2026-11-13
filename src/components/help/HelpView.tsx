import React, { useState } from 'react';
import {
  HelpCircle,
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Send,
} from 'lucide-react';
import { AppView } from '../../types';
import { ClayIconBadge, BloomingCactus3D } from '../common/PastelIllustrations';

interface HelpViewProps {
  onNavigate: (view: AppView) => void;
}

export const HelpView: React.FC<HelpViewProps> = ({ onNavigate }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackBody, setFeedbackBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const faqs = [
    {
      q: 'How does Skillora generate my personalized roadmap?',
      a: 'Skillora evaluates your onboarding background and diagnostic quiz performance to pinpoint specific skill gaps. It then arranges modules into a clear 6-stage roadmap tailored to your daily study time.',
    },
    {
      q: 'Can I change my career goal after onboarding?',
      a: 'Yes! You can update your primary career goal anytime in My Profile or Settings, and your learning path will adapt to match.',
    },
    {
      q: 'What is included in this Phase 1 prototype?',
      a: 'Phase 1 showcases the complete interactive Skillora web experience: diagnostic assessments with live scoring, connected 6-stage roadmap progress tracking, curated resource discovery, analytics, and the AI companion demonstration.',
    },
    {
      q: 'How are diagnostic scores calculated?',
      a: 'Each assessment evaluates your answers across topic tags and categorizes them into Demonstrated Strengths and Areas to Focus Next.',
    },
  ];

  const handleSendFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackSubject || !feedbackBody) return;
    setSubmitted(true);
    setFeedbackSubject('');
    setFeedbackBody('');
    setTimeout(() => setSubmitted(false), 4000);
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-[14px] focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] text-[#343047]';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8 animate-in fade-in duration-150">
      {/* Header */}
      <div
        className="rounded-[26px] border border-[#E2D6F5] p-6 sm:p-8 flex items-center justify-between gap-6"
        style={{
          background: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 60%, #DCECD9 100%)',
        }}
      >
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6F4FA8] bg-[#FFFCFA] px-3 py-1 rounded-full border border-[#E2D6F5]">
            <HelpCircle className="w-3.5 h-3.5 text-[#9B7ACE]" />
            <span>Support & Knowledge Base</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#343047] tracking-tight">
            Help & Frequently Asked Questions
          </h1>
          <p className="text-xs sm:text-sm text-[#6B6178] max-w-xl leading-relaxed">
            Everything you need to make the most of your personalized Skillora study space.
          </p>
        </div>
        <BloomingCactus3D className="w-20 h-24 hidden sm:block shrink-0" />
      </div>

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('assistant')}
          className="pastel-card pastel-card-hover p-5 cursor-pointer space-y-2.5"
        >
          <ClayIconBadge variant="lavender" size="md">
            <Sparkles className="w-5 h-5" />
          </ClayIconBadge>
          <h3 className="font-display text-sm font-extrabold text-[#343047]">
            AI Study Companion
          </h3>
          <p className="text-xs text-[#8B8295] leading-relaxed">
            Instant explanations for coding concepts, syntax, or study pacing.
          </p>
        </div>

        <div
          onClick={() => onNavigate('assessment')}
          className="pastel-card pastel-card-hover p-5 cursor-pointer space-y-2.5"
        >
          <ClayIconBadge variant="peach" size="md">
            <BookOpen className="w-5 h-5" />
          </ClayIconBadge>
          <h3 className="font-display text-sm font-extrabold text-[#343047]">
            Diagnostic Retesting
          </h3>
          <p className="text-xs text-[#8B8295] leading-relaxed">
            Re-evaluate your skills anytime to calibrate your roadmap.
          </p>
        </div>

        <div
          onClick={() => onNavigate('roadmap')}
          className="pastel-card pastel-card-hover p-5 cursor-pointer space-y-2.5"
        >
          <ClayIconBadge variant="mint" size="md">
            <HelpCircle className="w-5 h-5" />
          </ClayIconBadge>
          <h3 className="font-display text-sm font-extrabold text-[#343047]">
            Roadmap Guide
          </h3>
          <p className="text-xs text-[#8B8295] leading-relaxed">
            See how each milestone prepares you for real engineering roles.
          </p>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="pastel-card p-6 sm:p-8 space-y-4">
        <h2 className="font-display text-base font-extrabold text-[#343047]">
          Frequently Asked Questions
        </h2>

        <div className="divide-y divide-[#EEE6E5]">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="py-3.5">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between text-left font-display text-sm font-extrabold text-[#343047] hover:text-[#8E6EC8] transition-colors"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#8B8295] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#8B8295] shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <p className="mt-2 text-xs text-[#6B6178] leading-relaxed animate-in fade-in duration-100">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Feedback Form */}
      <div className="pastel-card p-6 sm:p-8 space-y-4">
        <h2 className="font-display text-base font-extrabold text-[#343047]">
          Contact Academic Advisors
        </h2>
        <p className="text-xs text-[#8B8295]">
          Have questions about study tracks, interview prep, or university cohorts?
        </p>

        {submitted ? (
          <div className="p-4 rounded-[18px] bg-[#DCECD9] border border-[#BEDBB9] text-[#2D4D33] text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-[#3B6B46] stroke-[3]" />
            <span>Thank you! Your message has been sent to our academic support advisors.</span>
          </div>
        ) : (
          <form onSubmit={handleSendFeedback} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">Subject</label>
              <input
                type="text"
                value={feedbackSubject}
                onChange={(e) => setFeedbackSubject(e.target.value)}
                placeholder="e.g. Question regarding Stage 4 OOP curriculum"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#343047] mb-1">
                Message / Details
              </label>
              <textarea
                rows={3}
                value={feedbackBody}
                onChange={(e) => setFeedbackBody(e.target.value)}
                placeholder="How can we support your learning goals?"
                required
                className={inputClass}
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="clay-button-primary py-2.5 px-5 text-xs font-bold flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Message</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
