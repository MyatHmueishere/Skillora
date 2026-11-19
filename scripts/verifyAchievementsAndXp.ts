import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BADGE_DEFINITIONS,
  computeLevelInfo,
  evaluateVerifiedAchievements,
  IssuedCertificateRecord,
  KNOWLEDGE_CHECK_PASS_MIN_PERCENT,
  maskStudentNameForPrivacy,
  PersistedAchievementBadgeRow,
  XP_REWARDS,
  XpLedgerEntry,
} from '../shared/achievementEngine';
import { createCertificatePdfDoc } from '../src/lib/certificatePdf';
import type {
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
} from '../src/types';

function makeRoadmap(params: {
  id: string;
  title?: string;
  direction?: string;
  status?: 'active' | 'archived';
  stages: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string; completed: boolean; completedAt?: string | null }>;
  }>;
}): LearningRoadmapRecord {
  const now = '2026-11-18T10:00:00.000Z';
  const dir = params.direction ?? 'Full Stack Developer';
  return {
    id: params.id,
    userId: 'user-1',
    title: params.title ?? 'Full Stack Engineering Path',
    careerGoal: dir,
    description: 'Personalized roadmap',
    sourceAssessmentId: null,
    roadmapData: {
      title: params.title ?? 'Full Stack Engineering Path',
      careerGoal: dir,
      primaryDirection: dir,
      description: 'Personalized roadmap',
      estimatedTotalDuration: '8 weeks',
      personalizationExplanation: 'Tailored',
      assessmentValidated: true,
      stages: params.stages.map((st) => ({
        id: st.id,
        title: st.title,
        description: 'Stage description',
        learningObjectives: ['Objective 1'],
        estimatedDuration: '2 weeks',
        difficulty: 'Beginner',
        prerequisites: [],
        lessons: st.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: 'Lesson description',
          estimatedTime: '30 mins',
          learningObjectives: ['Learn concept'],
          completed: l.completed,
          completedAt: l.completedAt ?? null,
        })),
        practiceActivities: [],
        suggestedMiniProject: 'Build mini app',
        status: st.lessons.every((l) => l.completed)
          ? 'completed'
          : st.lessons.some((l) => l.completed)
          ? 'in_progress'
          : 'upcoming',
      })),
    },
    status: params.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  };
}

function makeKcAttempt(params: {
  id: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  score: number;
  completedAt?: string;
}): LessonKnowledgeCheckAttemptRecord {
  return {
    id: params.id,
    userId: 'user-1',
    roadmapId: params.roadmapId,
    stageId: params.stageId,
    lessonId: params.lessonId,
    lessonTitle: 'Lesson Quiz',
    submissionId: `sub-${params.id}`,
    score: params.score,
    totalQuestions: 5,
    correctAnswers: Math.round((params.score / 100) * 5),
    answers: [],
    topicBreakdown: [],
    knowledgeGaps: [],
    recommendation: {
      action: params.score >= KNOWLEDGE_CHECK_PASS_MIN_PERCENT ? 'next_lesson' : 'additional_practice',
      title: 'Recommendation',
      description: 'Feedback',
      thresholdsUsed: { advanceMinPercent: 80, practiceMinPercent: 50 },
      focusTopics: [],
    },
    completedAt: params.completedAt ?? '2026-11-18T11:00:00.000Z',
  };
}

function makeSession(params: {
  id: string;
  startedAt: string;
  durationSeconds?: number;
  completed?: boolean;
}): LearningSessionRecord {
  return {
    id: params.id,
    userId: 'user-1',
    clientSessionId: `client-${params.id}`,
    roadmapId: 'rm-1',
    stageId: 'st-1',
    lessonId: 'ls-1',
    lessonTitle: 'Study Session',
    activityType: 'lesson_study',
    durationSeconds: params.durationSeconds ?? 1200,
    startedAt: params.startedAt,
    endedAt: params.startedAt,
    completed: params.completed ?? true,
  };
}

function runSuite() {
  console.log('Running Phase 8 Achievement Badges & XP verification suite...\n');

  // Test 1: New learner with zero progress
  {
    const res = evaluateVerifiedAchievements({
      roadmaps: [],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
    });
    assert.equal(res.summary.totalXp, 0, 'New user should start with 0 XP');
    assert.equal(res.summary.levelInfo.level, 1, 'New user should be Level 1');
    assert.equal(res.summary.unlockedCount, 0, 'New user should have 0 unlocked badges');
    assert.ok(
      res.summary.badges.every((b) => !b.unlocked && b.unlockRequirement.length > 0),
      'All locked badges should display unlock requirements'
    );
    console.log('✓ 1. New learner starts at Level 1 with 0 XP and all badges locked');
  }

  // Test 2: First lesson completion = 50 XP + First Step badge + idempotent re-run
  {
    const roadmap = makeRoadmap({
      id: 'rm-1',
      stages: [
        {
          id: 'st-1',
          title: 'Foundations',
          lessons: [
            { id: 'ls-1', title: 'Intro', completed: true, completedAt: '2026-11-18T10:30:00.000Z' },
            { id: 'ls-2', title: 'Variables', completed: false },
          ],
        },
      ],
    });

    const firstEval = evaluateVerifiedAchievements({
      roadmaps: [roadmap],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
    });
    assert.equal(firstEval.summary.totalXp, XP_REWARDS.LESSON_FIRST_COMPLETION);
    assert.equal(firstEval.newlyEligibleEvents.length, 1);
    const firstStep = firstEval.summary.badges.find((b) => b.id === 'first_step');
    const stageMaster = firstEval.summary.badges.find((b) => b.id === 'stage_master');
    assert.equal(firstStep?.unlocked, true, 'First Step badge should unlock after 1 lesson');
    assert.equal(stageMaster?.unlocked, false, 'Stage Master must NOT unlock on partial stage');

    // Simulate persisted ledger & re-sync (refresh / retry / repeat toggle)
    const persistedLedger: XpLedgerEntry[] = firstEval.newlyEligibleEvents;
    const persistedBadges: PersistedAchievementBadgeRow[] = firstEval.newlyUnlockedBadges.map((b) => ({
      badgeId: b.badgeId,
      unlockedAt: b.unlockedAt,
    }));

    const retryEval = evaluateVerifiedAchievements({
      roadmaps: [roadmap],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
      persistedLedger,
      persistedBadges,
    });
    assert.equal(retryEval.summary.totalXp, 50, 'Refreshing/retrying must not duplicate 50 XP');
    assert.equal(retryEval.newlyEligibleEvents.length, 0, 'No duplicate events on retry');
    assert.equal(retryEval.newlyUnlockedBadges.length, 0, 'No duplicate badges on retry');

    // Simulate user undoing & re-completing same lesson: persisted ledger preserves 50 XP without double award
    const undoneRoadmap = makeRoadmap({
      id: 'rm-1',
      stages: [
        {
          id: 'st-1',
          title: 'Foundations',
          lessons: [
            { id: 'ls-1', title: 'Intro', completed: false },
            { id: 'ls-2', title: 'Variables', completed: false },
          ],
        },
      ],
    });
    const afterUndoEval = evaluateVerifiedAchievements({
      roadmaps: [undoneRoadmap],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
      persistedLedger,
      persistedBadges,
    });
    assert.equal(afterUndoEval.summary.totalXp, 50);

    const recompletedEval = evaluateVerifiedAchievements({
      roadmaps: [roadmap],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
      persistedLedger,
      persistedBadges,
    });
    assert.equal(recompletedEval.summary.totalXp, 50, 'Re-completing same lesson must stay 50 XP');
    assert.equal(recompletedEval.newlyEligibleEvents.length, 0);
    console.log('✓ 2. First lesson awards 50 XP + First Step badge cleanly and idempotently');
  }

  // Test 3: Knowledge Check failing vs first pass (25 XP) vs repeat pass (no duplicate)
  {
    const roadmap = makeRoadmap({
      id: 'rm-1',
      stages: [
        {
          id: 'st-1',
          title: 'Foundations',
          lessons: [{ id: 'ls-1', title: 'Intro', completed: false }],
        },
      ],
    });

    const failedAttempt = makeKcAttempt({
      id: 'kc-1',
      roadmapId: 'rm-1',
      stageId: 'st-1',
      lessonId: 'ls-1',
      score: 60,
    });

    const failEval = evaluateVerifiedAchievements({
      roadmaps: [roadmap],
      knowledgeCheckAttempts: [failedAttempt],
      learningSessions: [],
      assessmentAttempts: [],
    });
    assert.equal(failEval.summary.totalXp, 0, 'Failing quiz (<80%) must award 0 XP');
    assert.equal(
      failEval.summary.badges.find((b) => b.id === 'knowledge_seeker')?.unlocked,
      false
    );

    const passAttempt1 = makeKcAttempt({
      id: 'kc-2',
      roadmapId: 'rm-1',
      stageId: 'st-1',
      lessonId: 'ls-1',
      score: 80,
      completedAt: '2026-11-18T11:10:00.000Z',
    });
    const passAttempt2 = makeKcAttempt({
      id: 'kc-3',
      roadmapId: 'rm-1',
      stageId: 'st-1',
      lessonId: 'ls-1',
      score: 100,
      completedAt: '2026-11-18T11:20:00.000Z',
    });

    const passEval = evaluateVerifiedAchievements({
      roadmaps: [roadmap],
      knowledgeCheckAttempts: [failedAttempt, passAttempt1, passAttempt2],
      learningSessions: [],
      assessmentAttempts: [],
    });
    assert.equal(
      passEval.summary.totalXp,
      XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS,
      'Passing the same Knowledge Check twice must only award 25 XP once'
    );
    assert.equal(
      passEval.summary.badges.find((b) => b.id === 'knowledge_seeker')?.unlocked,
      true
    );
    console.log('✓ 3. Knowledge Check awards 25 XP only on >= 80% pass and never duplicates on retake');
  }

  // Test 4: Stage completion (150 XP) and Full Path completion (500 XP)
  {
    const partialPath = makeRoadmap({
      id: 'rm-1',
      stages: [
        {
          id: 'st-1',
          title: 'Stage 1',
          lessons: [
            { id: 'ls-1', title: 'L1', completed: true, completedAt: '2026-11-18T09:00:00.000Z' },
            { id: 'ls-2', title: 'L2', completed: true, completedAt: '2026-11-18T09:30:00.000Z' },
          ],
        },
        {
          id: 'st-2',
          title: 'Stage 2',
          lessons: [
            { id: 'ls-3', title: 'L3', completed: false },
          ],
        },
      ],
    });

    const stageDoneEval = evaluateVerifiedAchievements({
      roadmaps: [partialPath],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
    });
    // 2 lessons * 50 + 1 stage * 150 = 250 XP
    assert.equal(stageDoneEval.summary.totalXp, 250);
    assert.equal(stageDoneEval.summary.badges.find((b) => b.id === 'stage_master')?.unlocked, true);
    assert.equal(stageDoneEval.summary.badges.find((b) => b.id === 'path_finisher')?.unlocked, false);

    const completedPath = makeRoadmap({
      id: 'rm-1',
      stages: [
        {
          id: 'st-1',
          title: 'Stage 1',
          lessons: [
            { id: 'ls-1', title: 'L1', completed: true, completedAt: '2026-11-18T09:00:00.000Z' },
            { id: 'ls-2', title: 'L2', completed: true, completedAt: '2026-11-18T09:30:00.000Z' },
          ],
        },
        {
          id: 'st-2',
          title: 'Stage 2',
          lessons: [
            { id: 'ls-3', title: 'L3', completed: true, completedAt: '2026-11-18T10:00:00.000Z' },
          ],
        },
      ],
    });

    const pathDoneEval = evaluateVerifiedAchievements({
      roadmaps: [completedPath],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
    });
    // 3 lessons (150) + 2 stages (300) + 1 path (500) = 950 XP
    assert.equal(pathDoneEval.summary.totalXp, 950);
    assert.equal(pathDoneEval.summary.badges.find((b) => b.id === 'path_finisher')?.unlocked, true);
    assert.equal(pathDoneEval.summary.levelInfo.level, 4, '950 XP should reach Level 4');
    console.log('✓ 4. Stage completion (150 XP) & Path completion (500 XP) trigger accurately');
  }

  // Test 5: Consistent Learner (7-day streak) badge
  {
    const sixDays: LearningSessionRecord[] = [
      '2026-11-10T12:00:00.000Z',
      '2026-11-11T12:00:00.000Z',
      '2026-11-12T12:00:00.000Z',
      '2026-11-13T12:00:00.000Z',
      '2026-11-14T12:00:00.000Z',
      '2026-11-15T12:00:00.000Z',
    ].map((ts, idx) => makeSession({ id: `s-${idx}`, startedAt: ts }));

    const sixDayEval = evaluateVerifiedAchievements({
      roadmaps: [],
      knowledgeCheckAttempts: [],
      learningSessions: sixDays,
      assessmentAttempts: [],
      timeZone: 'UTC',
      now: new Date('2026-11-15T18:00:00.000Z'),
    });
    const sixDayBadge = sixDayEval.summary.badges.find((b) => b.id === 'consistent_learner');
    assert.equal(sixDayBadge?.unlocked, false);
    assert.equal(sixDayBadge?.progressCurrent, 6);

    const sevenDays = [
      ...sixDays,
      makeSession({ id: 's-6', startedAt: '2026-11-16T12:00:00.000Z' }),
    ];
    const sevenDayEval = evaluateVerifiedAchievements({
      roadmaps: [],
      knowledgeCheckAttempts: [],
      learningSessions: sevenDays,
      assessmentAttempts: [],
      timeZone: 'UTC',
      now: new Date('2026-11-18T18:00:00.000Z'), // Even if streak ended 2 days ago, historical 7-day streak unlocks!
    });
    assert.equal(
      sevenDayEval.summary.badges.find((b) => b.id === 'consistent_learner')?.unlocked,
      true
    );
    console.log('✓ 5. Consistent Learner requires 7 consecutive days and unlocks accurately');
  }

  // Test 6: Switching directions preserves XP & Badges across archived + active roadmaps without double-awarding
  {
    const archivedFrontend = makeRoadmap({
      id: 'rm-frontend',
      title: 'Frontend Engineering',
      status: 'archived',
      stages: [
        {
          id: 'st-1',
          title: 'HTML & CSS',
          lessons: [
            { id: 'ls-1', title: 'Semantic HTML', completed: true, completedAt: '2026-11-12T10:00:00.000Z' },
          ],
        },
      ],
    });
    const activeDataScience = makeRoadmap({
      id: 'rm-ds',
      title: 'Data Science',
      status: 'active',
      stages: [
        {
          id: 'st-1',
          title: 'Python Basics',
          lessons: [
            { id: 'ls-1', title: 'DataFrames', completed: true, completedAt: '2026-11-18T10:00:00.000Z' },
            { id: 'ls-2', title: 'NumPy', completed: false },
          ],
        },
      ],
    });

    const assessment: AssessmentAttemptRecord = {
      id: 'att-1',
      userId: 'user-1',
      subject: 'Python',
      difficulty: 'Intermediate',
      totalQuestions: 10,
      correctAnswers: 8,
      scorePercent: 80,
      strengths: ['Pandas'],
      knowledgeGaps: [],
      createdAt: '2026-11-17T10:00:00.000Z',
    };

    const switchedEval = evaluateVerifiedAchievements({
      roadmaps: [activeDataScience, archivedFrontend],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [assessment],
    });
    // archivedFrontend: 1 lesson (50) + 1 completed stage (150) + 1 completed path (500) = 700
    // activeDataScience: 1 lesson (50) = 50 -> Total 750 XP
    assert.equal(switchedEval.summary.totalXp, 750);
    assert.equal(switchedEval.summary.badges.find((b) => b.id === 'skill_assessor')?.unlocked, true);
    assert.equal(switchedEval.summary.badges.find((b) => b.id === 'path_finisher')?.unlocked, true);
    console.log('✓ 6. Direction switches preserve XP & badges across archived & active roadmaps');
  }

  // Test 7: Level boundary math
  {
    const lv1 = computeLevelInfo(50);
    assert.equal(lv1.level, 1);
    assert.equal(lv1.xpToNextLevel, 100);
    const lv2 = computeLevelInfo(150);
    assert.equal(lv2.level, 2);
    assert.equal(lv2.xpIntoCurrentLevel, 0);
    console.log('✓ 7. Level thresholds and progress toward next level compute accurately');
  }

  // Test 8: SQL Migration Security Audit (RLS & no user write policies)
  {
    const sqlPath = path.resolve('supabase/migrations/20261119_achievements_and_xp.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(sql.includes('ALTER TABLE public.achievement_xp_ledger ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('FOR SELECT'));
    assert.equal(
      /CREATE POLICY[\s\S]*?ON\s+public\.(achievement_xp_ledger|user_achievements)[\s\S]*?FOR\s+(INSERT|UPDATE|DELETE)/i.test(
        sql
      ),
      false,
      'Migration must NOT grant INSERT/UPDATE/DELETE RLS policies to users'
    );
    assert.ok(sql.includes('SECURITY DEFINER'));
    assert.ok(sql.includes('auth.uid()'));
    console.log('✓ 8. SQL migration enforces strict SELECT-only RLS and SECURITY DEFINER verification');
  }

  console.log('\nAll Phase 8 checks passed! Running Phase 9 Advanced Badges, Certificates & Option A XP checks...\n');

  // Phase 9 Test A: All 23 badges defined across 4 categories with unique IDs & titles
  {
    assert.equal(BADGE_DEFINITIONS.length, 23, 'Should define all 6 Phase 8 + 17 Phase 9 badges');
    const uniqueIds = new Set(BADGE_DEFINITIONS.map((b) => b.id));
    const uniqueTitles = new Set(BADGE_DEFINITIONS.map((b) => b.title));
    assert.equal(uniqueIds.size, 23);
    assert.equal(uniqueTitles.size, 23);
    console.log('✓ 9. All 23 achievement badges have unique IDs, titles, categories, and rarities');
  }

  // Phase 9 Test B: Course Completion Certificate requires ALL lessons + passed KC (>= 80%), blocked if incomplete or quiz not passed
  {
    const completedStageNoQuiz = makeRoadmap({
      id: 'rm-course-1',
      direction: 'Full Stack Developer',
      stages: [
        {
          id: 'st-1',
          title: 'TypeScript & API Architecture',
          lessons: [
            { id: 'ls-1', title: 'Types', completed: true, completedAt: '2026-11-18T09:00:00.000Z' },
            { id: 'ls-2', title: 'REST Handlers', completed: true, completedAt: '2026-11-18T09:30:00.000Z' },
          ],
        },
        {
          id: 'st-2',
          title: 'Database Systems',
          lessons: [{ id: 'ls-3', title: 'SQL Joins', completed: false }],
        },
      ],
    });

    const withoutQuizEval = evaluateVerifiedAchievements({
      userId: 'user-1',
      studentName: 'Alex Chen',
      activeDirection: 'Full Stack Developer',
      roadmaps: [completedStageNoQuiz],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
    });
    assert.equal(
      withoutQuizEval.summary.certificates.length,
      0,
      'Completed stage lessons WITHOUT a passed Knowledge Check must NOT earn a certificate'
    );

    const passingKc = makeKcAttempt({
      id: 'kc-course-1',
      roadmapId: 'rm-course-1',
      stageId: 'st-1',
      lessonId: 'ls-2',
      score: 85,
      completedAt: '2026-11-18T10:00:00.000Z',
    });

    const earnedCourseEval = evaluateVerifiedAchievements({
      userId: 'user-1',
      studentName: 'Alex Chen',
      activeDirection: 'Full Stack Developer',
      roadmaps: [completedStageNoQuiz],
      knowledgeCheckAttempts: [passingKc],
      learningSessions: [],
      assessmentAttempts: [],
    });
    assert.equal(earnedCourseEval.summary.certificates.length, 1);
    const courseCert = earnedCourseEval.summary.certificates[0];
    assert.equal(courseCert.certificateType, 'course_completion');
    assert.equal(courseCert.studentName, 'Alex Chen');
    assert.equal(courseCert.direction, 'Full Stack Developer');
    assert.match(courseCert.certificateNumber, /^SKL-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(
      earnedCourseEval.summary.badges.find((b) => b.id === 'first_course_completed')?.unlocked,
      true
    );

    // Ensure idempotent persistence on re-sync
    const persistedCerts: IssuedCertificateRecord[] = earnedCourseEval.verifiedCertificatesToPersist;
    const resyncEval = evaluateVerifiedAchievements({
      userId: 'user-1',
      studentName: 'Alex Chen',
      activeDirection: 'Full Stack Developer',
      roadmaps: [completedStageNoQuiz],
      knowledgeCheckAttempts: [passingKc],
      learningSessions: [],
      assessmentAttempts: [],
      persistedLedger: earnedCourseEval.verifiedEventsToPersist,
      persistedBadges: earnedCourseEval.verifiedBadgesToPersist.map((b) => ({
        badgeId: b.badgeId,
        unlockedAt: b.unlockedAt,
      })),
      persistedCertificates: persistedCerts,
    });
    assert.equal(resyncEval.newlyEligibleCertificates.length, 0, 'Must never re-issue duplicate cert');
    assert.equal(resyncEval.newlyUnlockedBadges.length, 0, 'Must never re-unlock badge');
    console.log('✓ 10. Course Completion Certificate requires all stage lessons + passed KC & persists idempotently');
  }

  // Phase 9 Test C: Incomplete Learning Path blocked vs Complete Learning Path + Excellence threshold
  {
    const fullPath = makeRoadmap({
      id: 'rm-full-1',
      title: 'Applied AI Engineering',
      direction: 'AI Engineering',
      stages: [
        {
          id: 'st-a',
          title: 'Foundations of ML',
          lessons: [
            { id: 'l1', title: 'Linear Models', completed: true, completedAt: '2026-11-18T08:00:00.000Z' },
            { id: 'l2', title: 'Gradient Descent', completed: true, completedAt: '2026-11-18T09:00:00.000Z' },
          ],
        },
        {
          id: 'st-b',
          title: 'Neural Networks',
          lessons: [
            { id: 'l3', title: 'Backpropagation', completed: true, completedAt: '2026-11-18T10:00:00.000Z' },
          ],
        },
      ],
    });

    const highKcs: LessonKnowledgeCheckAttemptRecord[] = [
      makeKcAttempt({
        id: 'kc-a',
        roadmapId: 'rm-full-1',
        stageId: 'st-a',
        lessonId: 'l1',
        score: 95,
        completedAt: '2026-11-18T08:30:00.000Z',
      }),
      makeKcAttempt({
        id: 'kc-b',
        roadmapId: 'rm-full-1',
        stageId: 'st-a',
        lessonId: 'l2',
        score: 92,
        completedAt: '2026-11-18T09:30:00.000Z',
      }),
      makeKcAttempt({
        id: 'kc-c',
        roadmapId: 'rm-full-1',
        stageId: 'st-b',
        lessonId: 'l3',
        score: 100,
        completedAt: '2026-11-18T10:30:00.000Z',
      }),
    ];

    const fullEval = evaluateVerifiedAchievements({
      userId: 'user-1',
      studentName: 'Alex Chen',
      activeDirection: 'AI Engineering',
      roadmaps: [fullPath],
      knowledgeCheckAttempts: highKcs,
      learningSessions: [],
      assessmentAttempts: [],
      timeZone: 'UTC',
    });

    const types = new Set(fullEval.summary.certificates.map((c) => c.certificateType));
    assert.equal(types.has('course_completion'), true, 'Stage course certificates issued');
    assert.equal(types.has('path_completion'), true, 'Path Completion certificate issued');
    assert.equal(types.has('excellence'), true, 'Excellence certificate issued when avg >= 90% and >= 500 XP');
    assert.equal(fullEval.summary.badges.find((b) => b.id === 'first_learning_path_completed')?.unlocked, true);
    assert.equal(fullEval.summary.badges.find((b) => b.id === 'perfect_score')?.unlocked, true);
    assert.equal(fullEval.summary.badges.find((b) => b.id === 'fast_learner')?.unlocked, true);
    assert.equal(fullEval.summary.badges.find((b) => b.id === 'learning_excellence')?.unlocked, true);
    console.log('✓ 11. Learning Path Completion, Excellence Certificate, Perfect Score & Fast Learner badges unlock accurately');
  }

  // Phase 9 Test D: Option A Direction-specific XP separation & privacy masking
  {
    const dirA = makeRoadmap({
      id: 'rm-dir-a',
      direction: 'Backend Engineering',
      status: 'archived',
      stages: [
        {
          id: 'st-a1',
          title: 'APIs',
          lessons: [
            { id: 'la1', title: 'HTTP', completed: true, completedAt: '2026-11-12T10:00:00.000Z' },
          ],
        },
      ],
    });
    const dirB = makeRoadmap({
      id: 'rm-dir-b',
      direction: 'Data Science',
      status: 'active',
      stages: [
        {
          id: 'st-b1',
          title: 'Pandas',
          lessons: [
            { id: 'lb1', title: 'Series', completed: true, completedAt: '2026-11-18T10:00:00.000Z' },
            { id: 'lb2', title: 'DataFrames', completed: false },
          ],
        },
      ],
    });

    const optionAEval = evaluateVerifiedAchievements({
      userId: 'user-1',
      studentName: 'Alex Chen',
      activeDirection: 'Data Science',
      roadmaps: [dirB, dirA],
      knowledgeCheckAttempts: [],
      learningSessions: [],
      assessmentAttempts: [],
    });

    assert.equal(optionAEval.summary.totalXp, 750, 'Overall XP preserves both directions');
    assert.equal(optionAEval.summary.activeDirectionXp, 50, 'Active Direction XP tracks Data Science separately');
    assert.equal(optionAEval.summary.directionXpBreakdown.length, 2);
    assert.equal(optionAEval.summary.badges.find((b) => b.id === 'roadmap_explorer')?.unlocked, true);
    assert.equal(maskStudentNameForPrivacy('Alex Chen', 'initials'), 'A. C.');
    assert.equal(maskStudentNameForPrivacy('Alex Chen', 'full_name'), 'Alex Chen');
    console.log('✓ 12. Option A preserves Overall XP, separates Direction XP, and masks initials cleanly');
  }

  // Phase 9 Test E: Phase 9 SQL Migration Security Audit
  {
    const sqlPath = path.resolve('supabase/migrations/20261120_phase9_badges_and_certificates.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(sql.includes('ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY'));
    assert.match(
      sql,
      /ALTER TABLE\s+(?:IF EXISTS\s+)?public\.achievement_xp_ledger[\s\S]*?ADD COLUMN IF NOT EXISTS direction text/i
    );
    assert.equal(
      /CREATE POLICY[\s\S]*?ON\s+public\.certificates[\s\S]*?FOR\s+(INSERT|UPDATE|DELETE)/i.test(sql),
      false,
      'Certificates table must NOT grant direct INSERT/UPDATE/DELETE policies to clients'
    );
    assert.ok(sql.includes('verify_certificate_public'));
    assert.ok(sql.includes('update_certificate_display_preferences'));
    assert.ok(sql.includes('SECURITY DEFINER'));
    console.log('✓ 13. Phase 9 SQL migration enforces non-destructive alterations, immutable certificates RLS & SECURITY DEFINER RPCs');
  }

  // Phase 9 Test F: A4 Landscape PDF Generation across all 3 templates
  {
    const sampleCert: IssuedCertificateRecord = {
      id: 'cert-pdf-1',
      certificateNumber: 'SKL-2026-PDF1-9999',
      certificateKey: 'course:rm-1:st-1',
      certificateType: 'course_completion',
      certificateTypeLabel: 'Course Completion Certificate',
      title: 'TypeScript & Full-Stack Architecture',
      direction: 'Full Stack Developer',
      studentName: 'Alex Chen',
      roadmapId: 'rm-1',
      stageId: 'st-1',
      templateId: 'classic_academic',
      publicNameVisibility: 'full_name',
      issuerName: 'Skillora',
      issuerDesignation: 'Academic & Curriculum Verification Board',
      status: 'valid',
      completionDate: '2026-11-18T12:00:00.000Z',
      issuedAt: '2026-11-18T12:00:00.000Z',
      verificationDigest: 'digest-1',
    };

    for (const template of ['classic_academic', 'modern_professional', 'excellence_award'] as const) {
      const doc = createCertificatePdfDoc(sampleCert, template);
      const buffer = doc.output('arraybuffer');
      const header = Buffer.from(buffer).subarray(0, 5).toString('utf8');
      assert.equal(header, '%PDF-', `Template ${template} must emit valid PDF header`);
      assert.ok(buffer.byteLength > 1000, `Template ${template} PDF should be non-empty`);
    }
    console.log('✓ 14. Certificate A4 landscape PDF generator outputs valid PDFs for all 3 templates');
  }

  console.log('\nAll 14 Phase 8 + Phase 9 verification checks passed!');
}

runSuite();
