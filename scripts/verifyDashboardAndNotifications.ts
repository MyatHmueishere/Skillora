import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDashboardJourneySummary,
  collectMeaningfulLearningEvents,
  computeTimezoneAwareStreak,
  doesRoadmapMatchDirection,
} from '../src/lib/dashboardJourney';
import {
  evaluateInactivityReminder,
  isMeaningfulLearningActivity,
} from '../shared/inactivityEngine';
import { getPushPublicConfig } from '../server/notificationService';
import type {
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
  UserProfile,
} from '../src/types';

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Elena Rostova',
    email: 'elena@example.com',
    avatarUrl: '',
    educationLevel: 'Undergraduate',
    university: 'MIT',
    fieldOfStudy: 'Computer Science',
    careerGoal: 'Backend Engineer',
    primaryDirection: 'Backend Engineering',
    preferredHoursPerDay: 2,
    knowledgeLevel: 'Intermediate',
    currentSkills: ['Python', 'SQL'],
    learningInterests: ['APIs', 'Databases'],
    currentStreak: 0,
    totalHours: 0,
    completedCoursesCount: 0,
    overallProgress: 0,
    onboardingCompleted: true,
    ...overrides,
  };
}

function makeRoadmap(params: {
  id: string;
  title: string;
  careerGoal: string;
  status: 'active' | 'archived';
  lesson1Done?: boolean;
  lesson1At?: string;
  lesson2Done?: boolean;
  lesson2At?: string;
}): LearningRoadmapRecord {
  const s1Completed = Boolean(params.lesson1Done && params.lesson2Done);
  return {
    id: params.id,
    userId: 'user-1',
    title: params.title,
    careerGoal: params.careerGoal,
    description: 'Structured personalized roadmap',
    sourceAssessmentId: null,
    status: params.status,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    roadmapData: {
      title: params.title,
      careerGoal: params.careerGoal,
      description: 'Structured personalized roadmap',
      estimatedTotalDuration: '8 weeks',
      personalizationExplanation: 'Tailored path',
      assessmentValidated: true,
      confirmed: true,
      milestones: ['Ship first REST service', 'Deploy scalable DB schema'],
      stages: [
        {
          id: 'stage-1',
          title: 'HTTP & REST Foundations',
          description: 'Core HTTP mechanics',
          learningObjectives: ['Understand REST'],
          estimatedDuration: '2 weeks',
          difficulty: 'Beginner',
          prerequisites: [],
          practiceActivities: ['Build endpoint'],
          suggestedMiniProject: 'Build Book API',
          milestone: 'Ship first REST service',
          status: s1Completed
            ? 'completed'
            : params.lesson1Done || params.lesson2Done
            ? 'in_progress'
            : 'upcoming',
          lessons: [
            {
              id: 'lesson-1',
              title: 'REST Principles',
              description: 'Stateless resources',
              estimatedTime: '30 mins',
              learningObjectives: ['Methods & status codes'],
              completed: Boolean(params.lesson1Done),
              completedAt: params.lesson1At ?? null,
            },
            {
              id: 'lesson-2',
              title: 'Routing & Middleware',
              description: 'Request pipelines',
              estimatedTime: '45 mins',
              learningObjectives: ['Middleware chain'],
              completed: Boolean(params.lesson2Done),
              completedAt: params.lesson2At ?? null,
            },
          ],
        },
        {
          id: 'stage-2',
          title: 'Relational Databases',
          description: 'SQL schema design',
          learningObjectives: ['Normalization'],
          estimatedDuration: '3 weeks',
          difficulty: 'Intermediate',
          prerequisites: ['HTTP & REST Foundations'],
          practiceActivities: ['Write joins'],
          suggestedMiniProject: 'Design Inventory DB',
          milestone: 'Deploy scalable DB schema',
          status: 'upcoming',
          lessons: [
            {
              id: 'lesson-3',
              title: 'Primary & Foreign Keys',
              description: 'Referential integrity',
              estimatedTime: '40 mins',
              learningObjectives: ['Constraints'],
              completed: false,
              completedAt: null,
            },
          ],
        },
      ],
    },
  };
}

// 1. Test empty state vs returning learner dashboard summary
{
  const newUser = makeUser({ primaryDirection: '' });
  const emptySummary = buildDashboardJourneySummary({
    user: newUser,
    activeRoadmap: null,
    archivedRoadmaps: [],
    learningSessions: [],
    knowledgeCheckAttempts: [],
    assessmentAttempts: [],
    timeZone: 'America/Los_Angeles',
    now: new Date('2026-11-18T18:00:00.000Z'),
  });
  assert.equal(emptySummary.isNewLearner, true, 'New learner should get isNewLearner=true');
  assert.equal(emptySummary.nextLesson, null);
  assert.equal(emptySummary.overallProgressPercent, 0);
  assert.equal(emptySummary.weeklyGoal.weeklyGoalHours, 14);
}

// 2. Test Continue Learning exact target, completed stages & lessons, weekly goal, milestone & streak
{
  const user = makeUser({ primaryDirection: 'Backend Engineering', preferredHoursPerDay: 2 });
  const roadmap = makeRoadmap({
    id: 'rm-backend',
    title: 'Backend Engineering Mastery',
    careerGoal: 'Backend Engineering',
    status: 'active',
    lesson1Done: true,
    lesson1At: '2026-11-17T19:00:00.000Z',
    lesson2Done: true,
    lesson2At: '2026-11-18T17:00:00.000Z',
  });
  const sessions: LearningSessionRecord[] = [
    {
      id: 'sess-1',
      userId: 'user-1',
      clientSessionId: 'c-1',
      roadmapId: 'rm-backend',
      stageId: 'stage-2',
      lessonId: 'lesson-3',
      lessonTitle: 'Primary & Foreign Keys',
      activityType: 'lesson_study',
      durationSeconds: 1800,
      startedAt: '2026-11-18T17:30:00.000Z',
      endedAt: '2026-11-18T18:00:00.000Z',
      completed: true,
    },
  ];
  const kcAttempts: LessonKnowledgeCheckAttemptRecord[] = [
    {
      id: 'kc-1',
      userId: 'user-1',
      roadmapId: 'rm-backend',
      stageId: 'stage-1',
      lessonId: 'lesson-2',
      lessonTitle: 'Routing & Middleware',
      submissionId: 'sub-1',
      score: 100,
      totalQuestions: 4,
      correctAnswers: 4,
      answers: [],
      topicBreakdown: [],
      knowledgeGaps: [],
      recommendation: {
        action: 'next_lesson',
        title: 'Continue to Stage 2',
        description: 'Ready',
        thresholdsUsed: { advanceMinPercent: 80, practiceMinPercent: 50 },
        focusTopics: [],
      },
      completedAt: '2026-11-18T17:10:00.000Z',
    },
  ];
  const assessments: AssessmentAttemptRecord[] = [];

  const summary = buildDashboardJourneySummary({
    user,
    activeRoadmap: roadmap,
    archivedRoadmaps: [],
    learningSessions: sessions,
    knowledgeCheckAttempts: kcAttempts,
    assessmentAttempts: assessments,
    timeZone: 'America/Los_Angeles',
    now: new Date('2026-11-18T20:00:00.000Z'),
  });

  assert.equal(summary.isNewLearner, false);
  assert.equal(summary.primaryDirection, 'Backend Engineering');
  assert.equal(summary.directionMatchesActiveRoadmap, true);
  assert.equal(summary.completedLessons, 2);
  assert.equal(summary.totalLessons, 3);
  assert.equal(summary.completedStages, 1);
  assert.equal(summary.totalStages, 2);
  assert.equal(summary.overallProgressPercent, 67);
  assert.equal(summary.nextLesson?.lessonId, 'lesson-3');
  assert.equal(summary.nextLesson?.stageTitle, 'Relational Databases');
  assert.equal(summary.upcomingMilestone?.title, 'Deploy scalable DB schema');
  assert.equal(summary.currentStreakDays, 2, '2026-11-17 and 2026-11-18 should produce a 2-day streak');
  assert.equal(summary.activeToday, true);
  assert.ok(summary.recentActivity.length >= 3);
}

// 3. Test Primary Learning Direction switch preserves archived roadmap & detects match
{
  const switchedUser = makeUser({ primaryDirection: 'Data Science' });
  const activeBackend = makeRoadmap({
    id: 'rm-backend',
    title: 'Backend Engineering Mastery',
    careerGoal: 'Backend Engineering',
    status: 'active',
    lesson1Done: true,
    lesson1At: '2026-11-17T19:00:00.000Z',
  });
  const archivedDs = makeRoadmap({
    id: 'rm-ds',
    title: 'Data Science Career Track',
    careerGoal: 'Data Science',
    status: 'archived',
    lesson1Done: true,
    lesson1At: '2026-11-10T10:00:00.000Z',
  });

  const switchedSummary = buildDashboardJourneySummary({
    user: switchedUser,
    activeRoadmap: activeBackend,
    archivedRoadmaps: [archivedDs],
    learningSessions: [],
    knowledgeCheckAttempts: [],
    assessmentAttempts: [],
    timeZone: 'UTC',
    now: new Date('2026-11-18T12:00:00.000Z'),
  });

  assert.equal(doesRoadmapMatchDirection(activeBackend, 'Data Science'), false);
  assert.equal(doesRoadmapMatchDirection(archivedDs, 'Data Science'), true);
  assert.equal(switchedSummary.directionMatchesActiveRoadmap, false);
  assert.equal(switchedSummary.matchingArchivedRoadmap?.id, 'rm-ds');
  assert.equal(switchedSummary.preservedPreviousRoadmap?.id, 'rm-backend');
  assert.equal(switchedSummary.preservedPreviousRoadmap?.completedLessons, 1);
}

// 4. Test Meaningful Activity filter rejects passive visits / <10s incomplete sessions
{
  assert.equal(
    isMeaningfulLearningActivity({
      type: 'lesson_study',
      timestamp: '2026-11-18T12:00:00.000Z',
      durationSeconds: 0,
      completed: false,
    }),
    false
  );
  assert.equal(
    isMeaningfulLearningActivity({
      type: 'lesson_study',
      timestamp: '2026-11-18T12:00:00.000Z',
      durationSeconds: 9,
      completed: false,
    }),
    false
  );
  assert.equal(
    isMeaningfulLearningActivity({
      type: 'lesson_study',
      timestamp: '2026-11-18T12:00:00.000Z',
      durationSeconds: 10,
      completed: false,
    }),
    true
  );
  assert.equal(
    isMeaningfulLearningActivity({
      type: 'lesson_completed',
      timestamp: '2026-11-18T12:00:00.000Z',
    }),
    true
  );
}

// 5. Test Smart Inactivity Tiers, TZ boundaries, preferred time, pause, dedupe, and reset on study resume
{
  const lastStudy = '2026-11-10T18:00:00.000Z';
  const events = [
    {
      type: 'lesson_completed' as const,
      timestamp: lastStudy,
      completed: true,
    },
  ];

  // < 24h -> active_recently
  const evalUnder24h = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-11T12:00:00.000Z'),
    timeZone: 'UTC',
    preferredTime: '09:00',
  });
  assert.equal(evalUnder24h.shouldNotify, false);
  assert.equal(evalUnder24h.suppressedReason, 'active_recently');

  // 1 full day (25h, 1 local day) -> gentle_1d
  const eval1d = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-11T19:00:00.000Z'),
    timeZone: 'UTC',
    preferredTime: '18:00',
    enforcePreferredTimeWindow: true,
    primaryDirection: 'Backend Engineering',
    nextLessonTitle: 'Routing & Middleware',
  });
  assert.equal(eval1d.shouldNotify, true);
  assert.equal(eval1d.tier, 'gentle_1d');
  assert.ok(eval1d.body?.includes('Routing & Middleware'));

  // Preferred time gate blocks notification earlier in the day
  const evalEarly = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-11T18:30:00.000Z'), // 10:30 AM PST
    timeZone: 'America/Los_Angeles',
    preferredTime: '18:00',
    enforcePreferredTimeWindow: true,
  });
  assert.equal(evalEarly.shouldNotify, false);
  assert.equal(evalEarly.suppressedReason, 'before_preferred_time');

  // 2-3 inactive days -> followup_2_3d
  const eval3d = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-13T19:00:00.000Z'),
    timeZone: 'UTC',
    preferredTime: '18:00',
  });
  assert.equal(eval3d.shouldNotify, true);
  assert.equal(eval3d.tier, 'followup_2_3d');

  // Deduplication prevents sending same tier in same cycle
  const evalDedupe = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-13T20:00:00.000Z'),
    timeZone: 'UTC',
    sentHistory: [
      {
        dedupeKey: eval3d.dedupeKey!,
        tier: 'followup_2_3d',
        sentAt: '2026-11-13T19:00:00.000Z',
      },
    ],
  });
  assert.equal(evalDedupe.shouldNotify, false);
  assert.equal(evalDedupe.suppressedReason, 'already_sent_for_cycle');

  // 7+ days -> restart_7d
  const eval7d = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-18T19:00:00.000Z'),
    timeZone: 'UTC',
  });
  assert.equal(eval7d.shouldNotify, true);
  assert.equal(eval7d.tier, 'restart_7d');

  // Pause suppresses notifications cleanly
  const evalPaused = evaluateInactivityReminder({
    events,
    now: new Date('2026-11-18T19:00:00.000Z'),
    timeZone: 'UTC',
    pausedUntil: '2026-11-20T00:00:00.000Z',
  });
  assert.equal(evalPaused.shouldNotify, false);
  assert.equal(evalPaused.suppressedReason, 'paused');

  // Resuming meaningful activity stops inactivity reminders immediately
  const evalResumed = evaluateInactivityReminder({
    events: [
      ...events,
      { type: 'knowledge_check', timestamp: '2026-11-18T18:55:00.000Z', completed: true },
    ],
    now: new Date('2026-11-18T19:00:00.000Z'),
    timeZone: 'UTC',
  });
  assert.equal(evalResumed.shouldNotify, false);
  assert.equal(evalResumed.suppressedReason, 'active_recently');
}

// 6. Test public push config never leaks private VAPID or service role keys
{
  const cfg = getPushPublicConfig() as unknown as Record<string, unknown>;
  assert.equal('vapidPrivateKey' in cfg, false);
  assert.equal('supabaseServiceRoleKey' in cfg, false);
  assert.equal(typeof cfg.pushConfigured, 'boolean');
}

// 7. Static security scan across src/ and public/ verifying no server secrets are referenced client-side
{
  const forbiddenTokens = [
    'VAPID_PRIVATE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CRON_SECRET',
  ];
  const scanDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const token of forbiddenTokens) {
          assert.equal(
            text.includes(token),
            false,
            `Forbidden secret identifier ${token} found in client file ${fullPath}`
          );
        }
      }
    }
  };
  scanDir(path.resolve('src'));
  scanDir(path.resolve('public'));
}

// Verify timezone-aware streak calculation directly across day boundary
{
  const tzStreak = computeTimezoneAwareStreak(
    collectMeaningfulLearningEvents({
      activeRoadmap: null,
      learningSessions: [],
      knowledgeCheckAttempts: [],
      assessmentAttempts: [
        {
          id: 'a1',
          userId: 'u1',
          subject: 'Python',
          difficulty: 'Beginner',
          totalQuestions: 5,
          correctAnswers: 4,
          scorePercent: 80,
          strengths: ['Loops'],
          knowledgeGaps: [],
          createdAt: '2026-11-18T02:00:00.000Z', // 2026-11-17 18:00 PST vs 2026-11-18 10:00 SGT
        },
      ],
    }),
    'America/Los_Angeles',
    new Date('2026-11-18T18:00:00.000Z') // 2026-11-18 10:00 PST
  );
  assert.equal(tzStreak.currentStreakDays, 1);
  assert.equal(tzStreak.activeToday, false);
}

console.log('ALL DASHBOARD & NOTIFICATION VERIFICATION TESTS PASSED');
