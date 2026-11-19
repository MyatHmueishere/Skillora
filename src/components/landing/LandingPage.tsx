import React from 'react';
import {
  ArrowRight,
  Compass,
  CheckCircle2,
  Bot,
  BrainCircuit,
  GraduationCap,
  ChevronRight,
  BookOpen,
  Award,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Logo } from '../common/Logo';
import {
  ClayIconBadge,
  CuteStudentCharacter3D,
  SmilingCloudMascot3D,
  BooksTrophy3D,
  BloomingCactus3D,
} from '../common/PastelIllustrations';

import { AppView } from '../../types';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onExploreDashboard: () => void;
  onExploreView?: (view: AppView) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onGetStarted,
  onLogin,
  onExploreDashboard,
  onExploreView,
}) => {
  const navigatePreview = (view: AppView) => {
    if (onExploreView) {
      onExploreView(view);
      return;
    }
    onExploreDashboard();
  };
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F2] text-[#343047] flex flex-col selection:bg-[#F0E9FA] selection:text-[#343047]">
      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-[#FAF6F2]/90 backdrop-blur-md border-b border-[#EEE6E5]">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <Logo size="lg" />
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#8B8295]">
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-[#343047] transition-colors whitespace-nowrap cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-[#343047] transition-colors whitespace-nowrap cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('curriculum')}
              className="hover:text-[#343047] transition-colors whitespace-nowrap cursor-pointer"
            >
              Roadmaps
            </button>
            <button
              onClick={() => scrollToSection('testimonials')}
              className="hover:text-[#343047] transition-colors whitespace-nowrap cursor-pointer"
            >
              Student Stories
            </button>
            <button
              onClick={() => navigatePreview('verify')}
              className="hover:text-[#343047] transition-colors whitespace-nowrap cursor-pointer"
            >
              Verify Certificate
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onLogin}
              className="text-xs font-bold text-[#343047] hover:text-[#8E6EC8] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap"
            >
              Sign In
            </button>
            <button
              onClick={onGetStarted}
              className="clay-button-primary px-5 py-2.5 text-xs font-bold whitespace-nowrap"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-20 md:pt-16 md:pb-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Proposition */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#6F4FA8] bg-[#F0E9FA] px-3.5 py-1.5 rounded-full border border-[#E2D4F5]">
                <Sparkles className="w-3.5 h-3.5 text-[#9B7ACE]" />
                <span>Learn Smarter. Grow Further.</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-extrabold text-[#343047] tracking-tight leading-[1.12]">
                Your Learning Journey,{' '}
                <span className="text-[#8E6EC8]">Powered by Intelligence.</span>
              </h1>

              <p className="text-base text-[#6E647A] leading-relaxed max-w-xl">
                Discover your strengths, identify skill gaps, and follow a personalized learning path designed around your goals — inside a warm, welcoming study space.
              </p>

              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <button
                  onClick={onGetStarted}
                  className="clay-button-primary px-6 py-3.5 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onExploreDashboard}
                  className="clay-button-soft px-6 py-3.5 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <span>Preview Dashboard</span>
                  <ChevronRight className="w-4 h-4 text-[#8B8295]" />
                </button>
              </div>

              <div className="pt-5 border-t border-[#EEE6E5] flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-[#8B8295] font-semibold">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#69A878]" />
                  <span>Skill Gap Diagnostics</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#69A878]" />
                  <span>Personalized Roadmaps</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#69A878]" />
                  <span>Cozy AI Study Companion</span>
                </div>
              </div>
            </div>

            {/* Right Interactive Soft Pastel Preview Showcase */}
            <div className="lg:col-span-6">
              <div className="pastel-card p-6 sm:p-7 space-y-5 relative">
                {/* Peach Greeting Mini Card */}
                <div
                  className="rounded-[22px] p-5 flex items-center gap-4 border border-[#F2CBC1]"
                  style={{ background: 'linear-gradient(135deg, #FCE3DC 0%, #F8D9D0 100%)' }}
                >
                  <CuteStudentCharacter3D className="w-28 h-28 shrink-0 -my-3" />
                  <div className="space-y-1">
                    <p className="font-display text-lg font-extrabold text-[#343047]">
                      Welcome back, Alex!
                    </p>
                    <p className="text-xs text-[#6E5964] leading-relaxed">
                      Stage 3 of your Python Developer roadmap is 68% complete. Keep going!
                    </p>
                  </div>
                </div>

                {/* Mini KPI Trio */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-[18px] bg-[#F0E9FA] p-3.5 space-y-2 text-center">
                    <ClayIconBadge variant="lavender" size="sm" className="mx-auto">
                      <BrainCircuit className="w-4 h-4" />
                    </ClayIconBadge>
                    <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                      68%
                    </p>
                    <p className="text-[11px] font-semibold text-[#6F6580]">Path Mastery</p>
                  </div>
                  <div className="rounded-[18px] bg-[#DCECD9] p-3.5 space-y-2 text-center">
                    <ClayIconBadge variant="mint" size="sm" className="mx-auto">
                      <Award className="w-4 h-4" />
                    </ClayIconBadge>
                    <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                      8
                    </p>
                    <p className="text-[11px] font-semibold text-[#546E58]">Courses Done</p>
                  </div>
                  <div className="rounded-[18px] bg-[#FFF1D6] p-3.5 space-y-2 text-center">
                    <ClayIconBadge variant="yellow" size="sm" className="mx-auto">
                      <Sparkles className="w-4 h-4" />
                    </ClayIconBadge>
                    <p className="font-display text-lg font-extrabold text-[#343047] tabular-nums">
                      7 Days
                    </p>
                    <p className="text-[11px] font-semibold text-[#7A6136]">Study Streak</p>
                  </div>
                </div>

                {/* Quick Launch Button */}
                <button
                  onClick={onExploreDashboard}
                  className="w-full clay-button-primary py-3 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <span>Open Student Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CORE FEATURES SECTION */}
      <section id="features" className="py-20 bg-[#FFFCFA] border-y border-[#EEE6E5]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E6EC8]">
              Personalized EdTech Experience
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-[#343047] tracking-tight">
              Built around how students actually learn
            </h2>
            <p className="text-sm text-[#8B8295] leading-relaxed">
              Skillora diagnoses what you know today, pinpoints exact skill gaps, and maps a cozy, structured journey toward career readiness.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-[24px] bg-[#F0E9FA]/65 border border-[#E2D6F5] p-7 space-y-4 pastel-card-hover">
              <ClayIconBadge variant="lavender" size="lg">
                <BrainCircuit className="w-6 h-6" />
              </ClayIconBadge>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Diagnostic Skill Assessments
              </h3>
              <p className="text-xs sm:text-sm text-[#635972] leading-relaxed">
                Evaluate your mastery across 10+ domains including Python, Data Structures, SQL, AI &amp; Data Science, Design, Business, and Cybersecurity.
              </p>
              <button
                onClick={() => navigatePreview('assessment')}
                className="text-xs font-bold text-[#7A58B5] flex items-center gap-1 hover:underline"
              >
                <span>Try a diagnostic test</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded-[24px] bg-[#FCEAE5]/75 border border-[#F5D6CE] p-7 space-y-4 pastel-card-hover">
              <ClayIconBadge variant="peach" size="lg">
                <Compass className="w-6 h-6" />
              </ClayIconBadge>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                Personalized Learning Roadmaps
              </h3>
              <p className="text-xs sm:text-sm text-[#6F5753] leading-relaxed">
                Follow an AI-tailored multi-stage pathway with interactive lessons, knowledge checks, and real-time progress tracking built around your goals.
              </p>
              <button
                onClick={() => navigatePreview('roadmap')}
                className="text-xs font-bold text-[#B86352] flex items-center gap-1 hover:underline"
              >
                <span>Explore roadmap stages</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded-[24px] bg-[#FFF1D6]/75 border border-[#F3DFB4] p-7 space-y-4 pastel-card-hover">
              <ClayIconBadge variant="yellow" size="lg">
                <Bot className="w-6 h-6" />
              </ClayIconBadge>
              <h3 className="font-display text-lg font-extrabold text-[#343047]">
                AI Study Companion
              </h3>
              <p className="text-xs sm:text-sm text-[#705D38] leading-relaxed">
                Ask your personalized AI study companion to simplify tricky concepts, review assessment knowledge gaps, or walk through your current lesson anytime.
              </p>
              <button
                onClick={() => navigatePreview('assistant')}
                className="text-xs font-bold text-[#9C6F23] flex items-center gap-1 hover:underline"
              >
                <span>Meet your AI tutor</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 bg-[#FAF6F2]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E6EC8]">
              4-Step Study Loop
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-[#343047] tracking-tight">
              From curiosity to confident mastery
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: '01',
                title: 'Assess Baseline',
                desc: 'Take an interactive diagnostic to discover what you already know.',
                icon: <GraduationCap className="w-5 h-5" />,
                variant: 'lavender' as const,
              },
              {
                step: '02',
                title: 'Tailored Roadmap',
                desc: 'Get a personalized multi-stage learning plan built around your career goal.',
                icon: <Layers className="w-5 h-5" />,
                variant: 'peach' as const,
              },
              {
                step: '03',
                title: 'Guided Practice',
                desc: 'Explore curated videos, articles, and coding labs at your daily pace.',
                icon: <BookOpen className="w-5 h-5" />,
                variant: 'mint' as const,
              },
              {
                step: '04',
                title: 'Track & Celebrate',
                desc: 'Build study streaks, unlock badges, and watch your skill ring grow.',
                icon: <Award className="w-5 h-5" />,
                variant: 'yellow' as const,
              },
            ].map((item) => (
              <div key={item.step} className="pastel-card p-6 space-y-3.5">
                <div className="flex items-center justify-between">
                  <ClayIconBadge variant={item.variant} size="md">
                    {item.icon}
                  </ClayIconBadge>
                  <span className="font-mono text-xs font-bold text-[#A78BCE]">{item.step}</span>
                </div>
                <h4 className="font-display text-base font-extrabold text-[#343047]">
                  {item.title}
                </h4>
                <p className="text-xs text-[#8B8295] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CURRICULUM PREVIEW */}
      <section id="curriculum" className="py-20 bg-[#FFFCFA] border-t border-[#EEE6E5]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-5">
              <BooksTrophy3D className="w-28 h-24" />
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#8E6EC8]">
                Sample Learning Path Preview
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-[#343047] tracking-tight">
                "Become a Python Developer" Learning Journey
              </h2>
              <p className="text-sm text-[#8B8295] leading-relaxed">
                Every stage connects clearly from fundamentals to real-world FastAPI projects — or generate your own custom roadmap for AI, Data Science, Design, Business, and more.
              </p>
              <button
                onClick={() => navigatePreview('roadmap')}
                className="clay-button-primary px-6 py-3 text-xs font-bold inline-flex items-center gap-2"
              >
                <span>Preview Full Roadmap</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="lg:col-span-7 space-y-3">
              {[
                { stage: 1, title: 'Python Fundamentals', desc: 'Syntax, variables, type hints, and CLI foundations.', status: 'Completed', pill: 'bg-[#DCECD9] text-[#3B6B46]' },
                { stage: 2, title: 'Control Structures', desc: 'Loops, match-case patterns, and comprehensions.', status: 'Completed', pill: 'bg-[#DCECD9] text-[#3B6B46]' },
                { stage: 3, title: 'Functions and Data Structures', desc: 'Closures, *args/**kwargs, dicts, and sets.', status: 'In Progress', pill: 'bg-[#F0E9FA] text-[#6B4FA1]' },
                { stage: 4, title: 'Object-Oriented Programming', desc: 'Classes, dunder methods, and clean dataclasses.', status: 'Upcoming', pill: 'bg-[#FFF1D6] text-[#8E6521]' },
                { stage: 5, title: 'Database Fundamentals', desc: 'Relational schemas, SQL joins, and SQLAlchemy.', status: 'Upcoming', pill: 'bg-[#FAF6F2] text-[#8B8295]' },
                { stage: 6, title: 'Practical Python Projects', desc: 'Async FastAPI services, auth, and deployment.', status: 'Upcoming', pill: 'bg-[#FAF6F2] text-[#8B8295]' },
              ].map((s) => (
                <div
                  key={s.stage}
                  className="p-4 rounded-[20px] bg-[#FAF6F2]/75 border border-[#EEE6E5] flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="w-8 h-8 rounded-[12px] clay-squircle-lavender text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {s.stage}
                    </span>
                    <div>
                      <h4 className="font-display text-sm font-extrabold text-[#343047]">
                        {s.title}
                      </h4>
                      <p className="text-xs text-[#8B8295]">{s.desc}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold whitespace-nowrap px-3 py-1 rounded-full ${s.pill}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="py-20 bg-[#FAF6F2] border-t border-[#EEE6E5]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8E6EC8]">
              Student Voices
            </span>
            <h2 className="font-display text-3xl font-extrabold text-[#343047]">
              Loved by students & fresh graduates
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: "Skillora's diagnostic showed me I already knew Python syntax but needed work on data structures. It saved me weeks of studying.",
                name: 'Sophia Martinez',
                role: 'CS Senior, University of Washington',
                tint: 'bg-[#F0E9FA]/50',
              },
              {
                quote: 'The cozy study interface makes sitting down to practice algorithms something I genuinely look forward to every morning.',
                name: 'Maya Lin',
                role: 'Junior Backend Developer',
                tint: 'bg-[#FCEAE5]/50',
              },
              {
                quote: 'Having a clear structured roadmap plus an instant AI tutor gave me the guidance I needed to stay consistent every week.',
                name: 'David Okafor',
                role: 'Recent Engineering Graduate',
                tint: 'bg-[#DCECD9]/50',
              },
            ].map((t, idx) => (
              <div key={idx} className={`pastel-card p-6 flex flex-col justify-between space-y-4 ${t.tint}`}>
                <p className="text-xs sm:text-sm text-[#4A435C] leading-relaxed italic">
                  "{t.quote}"
                </p>
                <div className="pt-3 border-t border-[#EEE6E5]">
                  <p className="font-display text-sm font-extrabold text-[#343047]">{t.name}</p>
                  <p className="text-[11px] text-[#8B8295]">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-16 px-6">
        <div
          className="max-w-5xl mx-auto rounded-[30px] p-10 sm:p-14 border border-[#DFD2F2] flex flex-col md:flex-row items-center justify-between gap-8"
          style={{
            background: 'linear-gradient(135deg, #F0E9FA 0%, #FCECE7 55%, #FFF1D6 100%)',
            boxShadow: '0 20px 44px -12px rgba(154, 126, 200, 0.25)',
          }}
        >
          <div className="flex items-center gap-6">
            <SmilingCloudMascot3D className="w-28 h-20 hidden sm:block shrink-0" />
            <div className="space-y-2">
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-[#343047]">
                Learn Smarter. Grow Further.
              </h2>
              <p className="text-sm text-[#5D5470] max-w-md">
                Start your personalized diagnostic today and unlock a warm, structured learning roadmap tailored to your goals.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full md:w-auto">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto clay-button-primary px-6 py-3.5 text-xs font-bold flex items-center justify-center gap-2"
            >
              <span>Create Free Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onExploreDashboard}
              className="w-full sm:w-auto clay-button-soft px-6 py-3.5 text-xs font-bold"
            >
              Preview Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#FFFCFA] border-t border-[#EEE6E5] py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BloomingCactus3D className="w-10 h-12 hidden sm:block" />
            <Logo size="sm" showTagline={true} />
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-[#8B8295] font-semibold">
            <button onClick={() => scrollToSection('features')} className="hover:text-[#343047]">Features</button>
            <button onClick={() => scrollToSection('how-it-works')} className="hover:text-[#343047]">How It Works</button>
            <button onClick={() => scrollToSection('curriculum')} className="hover:text-[#343047]">Roadmaps</button>
            <button onClick={() => scrollToSection('testimonials')} className="hover:text-[#343047]">Student Stories</button>
            <button onClick={() => navigatePreview('verify')} className="hover:text-[#343047]">Verify Certificate</button>
            <button onClick={onLogin} className="hover:text-[#343047]">Sign In</button>
            <button onClick={onGetStarted} className="text-[#8E6EC8] hover:text-[#343047]">Get Started</button>
          </div>

          <p className="text-xs text-[#8B8295]">
            © 2026 Skillora EdTech. Made for curious learners.
          </p>
        </div>
      </footer>
    </div>
  );
};
