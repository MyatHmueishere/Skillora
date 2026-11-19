import {
  DEFAULT_ADAPTIVE_THRESHOLDS,
} from './knowledgeCheckConfig';
import {
  getDateKeyInTimeZone,
  isMeaningfulLearningActivity,
  MeaningfulActivityEvent,
  resolveSafeTimeZone,
} from './inactivityEngine';
import type {
  AssessmentAttemptRecord,
  LearningRoadmapRecord,
  LearningSessionRecord,
  LessonKnowledgeCheckAttemptRecord,
} from '../src/types';

export const XP_REWARDS = {
  LESSON_FIRST_COMPLETION: 50,
  KNOWLEDGE_CHECK_FIRST_PASS: 25,
  STAGE_FIRST_COMPLETION: 150,
  PATH_FIRST_COMPLETION: 500,
} as const;

export const KNOWLEDGE_CHECK_PASS_MIN_PERCENT =
  DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent; // 80%

export const EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT = 90;
export const EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT = 3;
export const EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP = 500;

export type XpEventType =
  | 'lesson_completed'
  | 'knowledge_check_passed'
  | 'stage_completed'
  | 'path_completed';

export type BadgeCategory =
  | 'milestone'
  | 'consistency'
  | 'knowledge_practice'
  | 'excellence';

export type BadgeRarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Epic'
  | 'Legendary';

export type BadgeIconName =
  | 'Zap'
  | 'ShieldCheck'
  | 'Flame'
  | 'Award'
  | 'Trophy'
  | 'Cpu'
  | 'BookOpen'
  | 'Compass'
  | 'Star'
  | 'Target'
  | 'Crown'
  | 'Sparkles'
  | 'Layers'
  | 'CheckCircle2'
  | 'GraduationCap';

export type AchievementBadgeId =
  // Phase 8 preserved badge IDs
  | 'first_step'
  | 'knowledge_seeker'
  | 'consistent_learner'
  | 'stage_master'
  | 'path_finisher'
  | 'skill_assessor'
  // Phase 9 Learning Milestones
  | 'first_lesson_completed'
  | 'first_course_completed'
  | 'first_learning_path_completed'
  | 'roadmap_explorer'
  // Phase 9 Consistency
  | 'streak_3_days'
  | 'streak_7_days'
  | 'streak_14_days'
  | 'streak_30_days'
  | 'streak_100_days'
  // Phase 9 Knowledge & Practice
  | 'knowledge_master'
  | 'quiz_champion'
  | 'perfect_score'
  | 'practice_champion'
  | 'skill_builder'
  // Phase 9 Excellence
  | 'fast_learner'
  | 'learning_excellence'
  | 'subject_expert';

export type CertificateType =
  | 'course_completion'
  | 'path_completion'
  | 'excellence';

export type CertificateTemplateId =
  | 'classic_academic'
  | 'modern_professional'
  | 'excellence_award';

export type CertificatePublicNameVisibility = 'full_name' | 'initials';

export type CertificateStatus = 'valid' | 'revoked';

export interface XpLedgerEntry {
  id: string;
  eventKey: string;
  eventType: XpEventType;
  xpAmount: number;
  title: string;
  direction?: string | null;
  roadmapId?: string | null;
  stageId?: string | null;
  lessonId?: string | null;
  awardedAt: string;
}

export interface AchievementBadgeDefinition {
  id: AchievementBadgeId;
  title: string;
  description: string;
  unlockRequirement: string;
  iconName: BadgeIconName;
  category: BadgeCategory;
  categoryLabel: string;
  rarity: BadgeRarity;
}

export interface AchievementBadgeState extends AchievementBadgeDefinition {
  unlocked: boolean;
  unlockedAt: string | null;
  progressCurrent: number;
  progressTarget: number;
  progressLabel: string;
}

export interface AchievementLevelInfo {
  level: number;
  title: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelXp: number;
  xpIntoCurrentLevel: number;
  xpNeededForNextLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
}

export interface DirectionXpSummary {
  directionKey: string;
  direction: string;
  totalXp: number;
  levelInfo: AchievementLevelInfo;
  completedLessons: number;
  completedCourses: number;
  completedPaths: number;
  passedKnowledgeChecks: number;
  lastAwardedAt: string | null;
}

export interface IssuedCertificateRecord {
  id: string;
  certificateNumber: string;
  certificateKey: string;
  certificateType: CertificateType;
  certificateTypeLabel: string;
  title: string;
  direction: string;
  studentName: string;
  roadmapId: string | null;
  stageId: string | null;
  templateId: CertificateTemplateId;
  publicNameVisibility: CertificatePublicNameVisibility;
  issuerName: string;
  issuerDesignation: string;
  status: CertificateStatus;
  completionDate: string;
  issuedAt: string;
  verificationDigest: string;
  metadata?: Record<string, unknown>;
}

export interface CertificateChecklistItem {
  label: string;
  completed: boolean;
  detail: string;
}

export interface CertificateEligibilityCandidate {
  certificateKey: string;
  certificateType: CertificateType;
  certificateTypeLabel: string;
  title: string;
  direction: string;
  roadmapId: string | null;
  stageId: string | null;
  eligible: boolean;
  earned: boolean;
  completionDate: string | null;
  progressPercent: number;
  checklist: CertificateChecklistItem[];
}

export interface PublicCertificateVerificationResult {
  found: boolean;
  authentic: boolean;
  certificateNumber: string;
  certificateType?: CertificateType;
  certificateTypeLabel?: string;
  title?: string;
  direction?: string;
  studentDisplayName?: string;
  privacyMode?: CertificatePublicNameVisibility;
  issuedAt?: string;
  completionDate?: string;
  status?: CertificateStatus;
  issuerName?: string;
  issuerDesignation?: string;
  verificationDigest?: string;
}

export interface RecentAchievementItem {
  id: string;
  kind: 'badge' | 'xp' | 'certificate';
  badgeId?: AchievementBadgeId;
  eventType?: XpEventType;
  certificateId?: string;
  title: string;
  subtitle: string;
  direction?: string | null;
  xpAmount?: number;
  timestamp: string;
}

export interface AchievementStatsBreakdown {
  completedLessonsCount: number;
  passedKnowledgeChecksCount: number;
  completedStagesCount: number;
  completedPathsCount: number;
  assessmentsCount: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lessonXp: number;
  knowledgeCheckXp: number;
  stageXp: number;
  pathXp: number;
  certificatesCount: number;
  averageQuizAndAssessmentScore: number | null;
}

export interface AchievementSummaryPayload {
  authenticated: boolean;
  persistedInDatabase: boolean;
  schemaMigrationRequired: boolean;
  certificatesSchemaMigrationRequired?: boolean;
  totalXp: number;
  activeDirection: string;
  activeDirectionXp: number;
  directionXpBreakdown: DirectionXpSummary[];
  levelInfo: AchievementLevelInfo;
  badges: AchievementBadgeState[];
  unlockedCount: number;
  totalBadgesCount: number;
  certificates: IssuedCertificateRecord[];
  certificateEligibility: CertificateEligibilityCandidate[];
  recentAchievements: RecentAchievementItem[];
  xpLedger: XpLedgerEntry[];
  newlyAwardedXp: number;
  newlyUnlockedBadgeIds: AchievementBadgeId[];
  newlyIssuedCertificateIds?: string[];
  stats: AchievementStatsBreakdown;
}

export interface PersistedAchievementBadgeRow {
  badgeId: string;
  unlockedAt: string;
  metadata?: Record<string, unknown>;
}

export const BADGE_DEFINITIONS: readonly AchievementBadgeDefinition[] = [
  // Learning Milestones
  {
    id: 'first_lesson_completed',
    title: 'First Lesson Completed',
    description: 'Complete your very first guided lesson in a Skillora Learning Path.',
    unlockRequirement: 'Complete 1 lesson',
    iconName: 'BookOpen',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Common',
  },
  {
    id: 'first_step',
    title: 'First Step',
    description: 'Take your opening step by completing a verified Learning Path lesson.',
    unlockRequirement: 'Complete 1 lesson',
    iconName: 'Zap',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Common',
  },
  {
    id: 'first_course_completed',
    title: 'First Course Completed',
    description: 'Finish every lesson inside a complete course stage of your Learning Path.',
    unlockRequirement: 'Complete 1 full course stage',
    iconName: 'GraduationCap',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Uncommon',
  },
  {
    id: 'stage_master',
    title: 'Stage Master',
    description: 'Master and complete all lessons within a Learning Path stage.',
    unlockRequirement: 'Complete 1 full learning stage',
    iconName: 'Layers',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Uncommon',
  },
  {
    id: 'first_learning_path_completed',
    title: 'First Learning Path Completed',
    description: 'Complete every stage and lesson across an entire personalized Learning Path.',
    unlockRequirement: 'Complete 1 full learning path',
    iconName: 'Trophy',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Epic',
  },
  {
    id: 'path_finisher',
    title: 'Path Finisher',
    description: 'See an entire multi-stage Skillora Learning Path through to completion.',
    unlockRequirement: 'Complete 1 full learning path',
    iconName: 'Award',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Epic',
  },
  {
    id: 'roadmap_explorer',
    title: 'Roadmap Explorer',
    description: 'Explore breadth across Skillora by creating 2+ roadmaps or studying across 3+ stages.',
    unlockRequirement: '2 roadmaps or 3 distinct stages with completed lessons',
    iconName: 'Compass',
    category: 'milestone',
    categoryLabel: 'Learning Milestones',
    rarity: 'Uncommon',
  },

  // Consistency
  {
    id: 'streak_3_days',
    title: '3-Day Learning Streak',
    description: 'Show up for 3 consecutive days of meaningful study, quizzes, or lessons.',
    unlockRequirement: 'Achieve a 3-day study streak',
    iconName: 'Flame',
    category: 'consistency',
    categoryLabel: 'Consistency',
    rarity: 'Common',
  },
  {
    id: 'streak_7_days',
    title: '7-Day Learning Streak',
    description: 'Sustain an unbroken 7-day week of verified Skillora learning activity.',
    unlockRequirement: 'Achieve a 7-day study streak',
    iconName: 'Flame',
    category: 'consistency',
    categoryLabel: 'Consistency',
    rarity: 'Uncommon',
  },
  {
    id: 'streak_14_days',
    title: '14-Day Learning Streak',
    description: 'Maintain two full consecutive weeks of deliberate daily learning.',
    unlockRequirement: 'Achieve a 14-day study streak',
    iconName: 'Flame',
    category: 'consistency',
    categoryLabel: 'Consistency',
    rarity: 'Rare',
  },
  {
    id: 'streak_30_days',
    title: '30-Day Learning Streak',
    description: 'Build an extraordinary 30-day habit of continuous daily skill growth.',
    unlockRequirement: 'Achieve a 30-day study streak',
    iconName: 'Flame',
    category: 'consistency',
    categoryLabel: 'Consistency',
    rarity: 'Epic',
  },
  {
    id: 'streak_100_days',
    title: '100-Day Learning Streak',
    description: 'Join the top tier of lifelong learners with a 100-day unbroken streak.',
    unlockRequirement: 'Achieve a 100-day study streak',
    iconName: 'Crown',
    category: 'consistency',
    categoryLabel: 'Consistency',
    rarity: 'Legendary',
  },

  // Knowledge & Practice
  {
    id: 'knowledge_seeker',
    title: 'Knowledge Seeker',
    description: `Pass your first Lesson Knowledge Check with a score of ${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}% or higher.`,
    unlockRequirement: `Pass 1 knowledge check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
    iconName: 'ShieldCheck',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Common',
  },
  {
    id: 'skill_assessor',
    title: 'Skill Assessor',
    description: 'Complete a diagnostic skill assessment to benchmark your strengths and gaps.',
    unlockRequirement: 'Complete 1 diagnostic assessment',
    iconName: 'Cpu',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Common',
  },
  {
    id: 'knowledge_master',
    title: 'Knowledge Master',
    description: `Demonstrate sustained mastery by passing 5 distinct Lesson Knowledge Checks (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+).`,
    unlockRequirement: 'Pass 5 distinct knowledge checks',
    iconName: 'ShieldCheck',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Rare',
  },
  {
    id: 'quiz_champion',
    title: 'Quiz Champion',
    description: `Excel in recall and application by passing 10 distinct Lesson Knowledge Checks (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+).`,
    unlockRequirement: 'Pass 10 distinct knowledge checks',
    iconName: 'Trophy',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Rare',
  },
  {
    id: 'perfect_score',
    title: 'Perfect Score',
    description: 'Achieve a flawless 100% score on any Knowledge Check or Diagnostic Assessment.',
    unlockRequirement: 'Score 100% on a quiz or assessment',
    iconName: 'Star',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Rare',
  },
  {
    id: 'practice_champion',
    title: 'Practice Champion',
    description: 'Dedicate sustained effort across 10 meaningful study sessions or completed lessons.',
    unlockRequirement: 'Complete 10 meaningful study activities',
    iconName: 'Target',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Uncommon',
  },
  {
    id: 'skill_builder',
    title: 'Skill Builder',
    description: 'Combine theory and benchmarking by completing 5 lessons and 1 diagnostic assessment.',
    unlockRequirement: 'Complete 5 lessons & 1 diagnostic',
    iconName: 'CheckCircle2',
    category: 'knowledge_practice',
    categoryLabel: 'Knowledge & Practice',
    rarity: 'Uncommon',
  },

  // Excellence
  {
    id: 'fast_learner',
    title: 'Fast Learner',
    description: 'Demonstrate high focus by completing 3 or more lessons in a single calendar day.',
    unlockRequirement: 'Complete 3 lessons in 1 day',
    iconName: 'Zap',
    category: 'excellence',
    categoryLabel: 'Excellence',
    rarity: 'Uncommon',
  },
  {
    id: 'consistent_learner',
    title: 'Consistent Learner',
    description: 'Build reliable momentum with 7 consecutive days of meaningful learning activity.',
    unlockRequirement: 'Achieve a 7-day study streak',
    iconName: 'Flame',
    category: 'excellence',
    categoryLabel: 'Excellence',
    rarity: 'Uncommon',
  },
  {
    id: 'learning_excellence',
    title: 'Learning Excellence',
    description: 'Complete at least 1 course stage while maintaining a 90%+ average across 3+ graded evaluations.',
    unlockRequirement: '1 course done & 90%+ avg (3+ graded)',
    iconName: 'Sparkles',
    category: 'excellence',
    categoryLabel: 'Excellence',
    rarity: 'Epic',
  },
  {
    id: 'subject_expert',
    title: 'Subject Expert',
    description: 'Reach 1,000+ XP within a single learning direction or complete a full Learning Path.',
    unlockRequirement: '1,000+ XP in 1 direction or 1 path done',
    iconName: 'Crown',
    category: 'excellence',
    categoryLabel: 'Excellence',
    rarity: 'Legendary',
  },
] as const;

const LEVEL_THRESHOLDS: ReadonlyArray<{ level: number; minXp: number; title: string }> = [
  { level: 1, minXp: 0, title: 'Curious Explorer' },
  { level: 2, minXp: 150, title: 'Active Learner' },
  { level: 3, minXp: 350, title: 'Skill Builder' },
  { level: 4, minXp: 650, title: 'Stage Navigator' },
  { level: 5, minXp: 1050, title: 'Path Achiever' },
  { level: 6, minXp: 1600, title: 'Domain Specialist' },
  { level: 7, minXp: 2300, title: 'Master Scholar' },
  { level: 8, minXp: 3200, title: 'Skillora Fellow' },
];

export function computeLevelInfo(totalXpInput: number): AchievementLevelInfo {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(totalXpInput) ? totalXpInput : 0));

  let current = LEVEL_THRESHOLDS[0];
  let nextMinXp = LEVEL_THRESHOLDS[1].minXp;

  if (totalXp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].minXp) {
    const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const step = 1000;
    const extraLevels = Math.floor((totalXp - last.minXp) / step);
    const level = last.level + extraLevels;
    const minXp = last.minXp + extraLevels * step;
    nextMinXp = minXp + step;
    current = {
      level,
      minXp,
      title: extraLevels === 0 ? last.title : `Skillora Fellow Tier ${extraLevels + 1}`,
    };
  } else {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
      const candidate = LEVEL_THRESHOLDS[i];
      const next = LEVEL_THRESHOLDS[i + 1];
      if (!next || totalXp < next.minXp) {
        current = candidate;
        nextMinXp = next ? next.minXp : candidate.minXp + 1000;
        break;
      }
    }
  }

  const xpIntoCurrentLevel = Math.max(0, totalXp - current.minXp);
  const xpNeededForNextLevel = Math.max(1, nextMinXp - current.minXp);
  const xpToNextLevel = Math.max(0, nextMinXp - totalXp);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((xpIntoCurrentLevel / xpNeededForNextLevel) * 100))
  );

  return {
    level: current.level,
    title: current.title,
    totalXp,
    currentLevelMinXp: current.minXp,
    nextLevelXp: nextMinXp,
    xpIntoCurrentLevel,
    xpNeededForNextLevel,
    xpToNextLevel,
    progressPercent,
  };
}

export function normalizeDirectionLabel(raw?: string | null): string {
  const clean = (raw || '').trim();
  return clean || 'General Learning';
}

export function normalizeDirectionKey(raw?: string | null): string {
  return normalizeDirectionLabel(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'general_learning';
}

export function resolveRoadmapDirection(roadmap?: LearningRoadmapRecord | null): string {
  if (!roadmap) return 'General Learning';
  return normalizeDirectionLabel(
    roadmap.roadmapData?.primaryDirection || roadmap.careerGoal || roadmap.title
  );
}

export function formatCertificateTypeLabel(type: CertificateType): string {
  switch (type) {
    case 'course_completion':
      return 'Course Completion Certificate';
    case 'path_completion':
      return 'Learning Path Completion Certificate';
    case 'excellence':
      return 'Excellence Award Certificate';
  }
}

export function defaultTemplateForCertificateType(
  type: CertificateType
): CertificateTemplateId {
  switch (type) {
    case 'excellence':
      return 'excellence_award';
    case 'path_completion':
      return 'modern_professional';
    case 'course_completion':
    default:
      return 'classic_academic';
  }
}

export function maskStudentNameForPrivacy(
  fullName: string,
  visibility: CertificatePublicNameVisibility
): string {
  const clean = (fullName || '').trim() || 'Skillora Learner';
  if (visibility === 'full_name') return clean;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return `${parts[0].slice(0, 1).toUpperCase()}.`;
  }
  return parts.map((p) => `${p.slice(0, 1).toUpperCase()}.`).join(' ');
}

function stableHash32(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function generateDeterministicCertificateNumber(
  seedKey: string,
  issuedAtIso: string
): string {
  const year = (() => {
    const d = new Date(issuedAtIso);
    return Number.isFinite(d.getTime()) ? d.getUTCFullYear() : new Date().getUTCFullYear();
  })();
  const h1 = stableHash32(seedKey, 0x811c9dc5).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
  const h2 = stableHash32(`${seedKey}:${issuedAtIso.slice(0, 10)}`, 0x9e3779b1)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')
    .slice(0, 4);
  return `SKL-${year}-${h1}-${h2}`;
}

export function buildCertificateVerificationDigest(params: {
  certificateNumber: string;
  certificateType: CertificateType;
  title: string;
  direction: string;
  completionDate: string;
}): string {
  const payload = [
    params.certificateNumber,
    params.certificateType,
    params.title,
    params.direction,
    params.completionDate.slice(0, 10),
  ].join('|');
  const p1 = stableHash32(payload, 0x811c9dc5).toString(16).toUpperCase().padStart(8, '0');
  const p2 = stableHash32(`${payload}:skillora`, 0x517cc1b7).toString(16).toUpperCase().padStart(8, '0');
  return `${p1}-${p2}`;
}

export function buildLessonEventKey(
  roadmapId: string,
  stageId: string,
  lessonId: string
): string {
  return `lesson:${roadmapId}:${stageId}:${lessonId}`;
}

export function buildKnowledgeCheckPassEventKey(
  roadmapId: string,
  stageId: string,
  lessonId: string
): string {
  return `kc_pass:${roadmapId}:${stageId}:${lessonId}`;
}

export function buildStageEventKey(roadmapId: string, stageId: string): string {
  return `stage:${roadmapId}:${stageId}`;
}

export function buildPathEventKey(roadmapId: string): string {
  return `path:${roadmapId}`;
}

export function buildCourseCertificateKey(roadmapId: string, stageId: string): string {
  return `course:${roadmapId}:${stageId}`;
}

export function buildPathCertificateKey(roadmapId: string): string {
  return `path:${roadmapId}`;
}

export function buildExcellenceCertificateKey(direction: string): string {
  return `excellence:${normalizeDirectionKey(direction)}`;
}

function addDaysUtc(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

function diffDateKeysUtc(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export interface StreakComputationSummary {
  currentStreakDays: number;
  longestStreakDays: number;
  milestoneTimestamps: Partial<Record<3 | 7 | 14 | 30 | 100, string>>;
  maxStreakEndTimestamp: string | null;
}

export function computeStreakSummaryForAchievements(params: {
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  timeZone?: string;
  now?: Date;
}): StreakComputationSummary {
  const safeTz = resolveSafeTimeZone(params.timeZone);
  const now = params.now ?? new Date();
  const events: MeaningfulActivityEvent[] = [];

  for (const rm of params.roadmaps) {
    for (const stage of rm.roadmapData?.stages ?? []) {
      for (const lesson of stage.lessons ?? []) {
        if (lesson.completed && lesson.completedAt) {
          events.push({
            type: 'lesson_completed',
            timestamp: lesson.completedAt,
            completed: true,
          });
        }
      }
    }
  }

  for (const kc of params.knowledgeCheckAttempts) {
    if (kc.completedAt) {
      events.push({
        type: 'knowledge_check',
        timestamp: kc.completedAt,
        completed: true,
      });
    }
  }

  for (const att of params.assessmentAttempts) {
    if (att.createdAt) {
      events.push({
        type: 'assessment',
        timestamp: att.createdAt,
        completed: true,
      });
    }
  }

  for (const sess of params.learningSessions) {
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    const candidate: MeaningfulActivityEvent = {
      type:
        sess.activityType === 'knowledge_check'
          ? 'knowledge_check'
          : sess.activityType === 'assessment'
          ? 'assessment'
          : 'lesson_study',
      timestamp: ts,
      durationSeconds: sess.durationSeconds,
      completed: sess.completed,
    };
    if (isMeaningfulLearningActivity(candidate)) {
      events.push(candidate);
    }
  }

  const latestTsByDateKey = new Map<string, string>();
  for (const evt of events) {
    if (!isMeaningfulLearningActivity(evt)) continue;
    const dateKey = getDateKeyInTimeZone(evt.timestamp, safeTz);
    if (!dateKey) continue;
    const existing = latestTsByDateKey.get(dateKey);
    if (!existing || new Date(evt.timestamp).getTime() > new Date(existing).getTime()) {
      latestTsByDateKey.set(dateKey, evt.timestamp);
    }
  }

  const sortedDateKeys = Array.from(latestTsByDateKey.keys()).sort();
  if (sortedDateKeys.length === 0) {
    return {
      currentStreakDays: 0,
      longestStreakDays: 0,
      milestoneTimestamps: {},
      maxStreakEndTimestamp: null,
    };
  }

  let longestStreakDays = 0;
  let run = 0;
  let prevKey: string | null = null;
  const milestoneTargets: Array<3 | 7 | 14 | 30 | 100> = [3, 7, 14, 30, 100];
  const milestoneTimestamps: Partial<Record<3 | 7 | 14 | 30 | 100, string>> = {};

  for (const key of sortedDateKeys) {
    if (prevKey && diffDateKeysUtc(prevKey, key) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreakDays) {
      longestStreakDays = run;
    }
    for (const target of milestoneTargets) {
      if (run >= target && !milestoneTimestamps[target]) {
        milestoneTimestamps[target] = latestTsByDateKey.get(key) ?? undefined;
      }
    }
    prevKey = key;
  }

  const todayKey = getDateKeyInTimeZone(now, safeTz) ?? '';
  const yesterdayKey = todayKey ? addDaysUtc(todayKey, -1) : '';
  let currentStreakDays = 0;
  if (
    (todayKey && latestTsByDateKey.has(todayKey)) ||
    (yesterdayKey && latestTsByDateKey.has(yesterdayKey))
  ) {
    let cursor = latestTsByDateKey.has(todayKey) ? todayKey : yesterdayKey;
    while (cursor && latestTsByDateKey.has(cursor)) {
      currentStreakDays += 1;
      cursor = addDaysUtc(cursor, -1);
    }
  }

  return {
    currentStreakDays,
    longestStreakDays,
    milestoneTimestamps,
    maxStreakEndTimestamp: milestoneTimestamps[7] ?? null,
  };
}

function safeIsoOrFallback(candidate?: string | null, fallback?: string): string {
  if (candidate) {
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (fallback) {
    const ms = new Date(fallback).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function pickLatestIso(timestamps: Array<string | null | undefined>, fallback: string): string {
  let bestMs = -Infinity;
  let bestIso = fallback;
  for (const ts of timestamps) {
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestIso = new Date(ms).toISOString();
    }
  }
  return Number.isFinite(bestMs) ? bestIso : safeIsoOrFallback(fallback);
}

export interface EvaluateAchievementsInput {
  userId?: string;
  studentName?: string;
  activeDirection?: string;
  roadmaps: LearningRoadmapRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  learningSessions: LearningSessionRecord[];
  assessmentAttempts: AssessmentAttemptRecord[];
  persistedLedger?: XpLedgerEntry[];
  persistedBadges?: PersistedAchievementBadgeRow[];
  persistedCertificates?: IssuedCertificateRecord[];
  timeZone?: string;
  now?: Date;
}

export interface EvaluatedAchievementsResult {
  summary: Omit<
    AchievementSummaryPayload,
    | 'authenticated'
    | 'persistedInDatabase'
    | 'schemaMigrationRequired'
    | 'certificatesSchemaMigrationRequired'
    | 'newlyAwardedXp'
    | 'newlyUnlockedBadgeIds'
    | 'newlyIssuedCertificateIds'
  >;
  verifiedEventsToPersist: XpLedgerEntry[];
  newlyEligibleEvents: XpLedgerEntry[];
  verifiedBadgesToPersist: Array<{
    badgeId: AchievementBadgeId;
    unlockedAt: string;
    metadata: Record<string, unknown>;
  }>;
  newlyUnlockedBadges: Array<{
    badgeId: AchievementBadgeId;
    unlockedAt: string;
    metadata: Record<string, unknown>;
  }>;
  verifiedCertificatesToPersist: IssuedCertificateRecord[];
  newlyEligibleCertificates: IssuedCertificateRecord[];
}

/**
 * Pure deterministic server/client evaluator that computes verified XP (Overall & Direction-specific),
 * achievement badges, and verifiable certificates strictly from canonical user progress records
 * (both active and archived roadmaps) and merges idempotently with persisted database rows.
 */
export function evaluateVerifiedAchievements(
  input: EvaluateAchievementsInput
): EvaluatedAchievementsResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const safeTz = resolveSafeTimeZone(input.timeZone);
  const studentName = (input.studentName || '').trim() || 'Skillora Learner';

  const roadmapById = new Map<string, LearningRoadmapRecord>();
  for (const rm of input.roadmaps) {
    if (rm?.id) roadmapById.set(rm.id, rm);
  }

  const persistedLedgerMap = new Map<string, XpLedgerEntry>();
  for (const entry of input.persistedLedger ?? []) {
    if (entry.eventKey && !persistedLedgerMap.has(entry.eventKey)) {
      persistedLedgerMap.set(entry.eventKey, entry);
    }
  }

  const persistedBadgeMap = new Map<AchievementBadgeId, PersistedAchievementBadgeRow>();
  for (const badgeRow of input.persistedBadges ?? []) {
    const id = badgeRow.badgeId as AchievementBadgeId;
    if (!persistedBadgeMap.has(id)) {
      persistedBadgeMap.set(id, badgeRow);
    }
  }

  const persistedCertMap = new Map<string, IssuedCertificateRecord>();
  for (const cert of input.persistedCertificates ?? []) {
    if (cert.certificateKey && !persistedCertMap.has(cert.certificateKey)) {
      persistedCertMap.set(cert.certificateKey, cert);
    }
  }

  const derivedEventsMap = new Map<string, XpLedgerEntry>();

  const registerDerivedEvent = (candidate: Omit<XpLedgerEntry, 'id'>) => {
    if (derivedEventsMap.has(candidate.eventKey)) return;
    const existing = persistedLedgerMap.get(candidate.eventKey);
    const roadmapDir =
      candidate.roadmapId && roadmapById.has(candidate.roadmapId)
        ? resolveRoadmapDirection(roadmapById.get(candidate.roadmapId))
        : null;
    const resolvedDirection =
      existing?.direction?.trim() ||
      candidate.direction?.trim() ||
      roadmapDir ||
      'General Learning';

    derivedEventsMap.set(candidate.eventKey, {
      id: existing?.id ?? candidate.eventKey,
      eventKey: candidate.eventKey,
      eventType: candidate.eventType,
      xpAmount: existing?.xpAmount ?? candidate.xpAmount,
      title: existing?.title ?? candidate.title,
      direction: resolvedDirection,
      roadmapId: existing?.roadmapId ?? candidate.roadmapId ?? null,
      stageId: existing?.stageId ?? candidate.stageId ?? null,
      lessonId: existing?.lessonId ?? candidate.lessonId ?? null,
      awardedAt: existing?.awardedAt ?? candidate.awardedAt,
    });
  };

  let activeCompletedLessons = 0;
  let activeCompletedStages = 0;
  let activeCompletedPaths = 0;
  const distinctStagesWithCompletedLessons = new Set<string>();
  const completedLessonsPerDay = new Map<string, { count: number; latestTs: string }>();

  // Passing Knowledge Checks grouped by roadmap+stage and roadmap+stage+lesson
  const passingKcsByStage = new Map<string, LessonKnowledgeCheckAttemptRecord[]>();
  const sortedPassingKcs = input.knowledgeCheckAttempts
    .filter((kc) => Number(kc.score) >= KNOWLEDGE_CHECK_PASS_MIN_PERCENT)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()
    );

  for (const kc of sortedPassingKcs) {
    if (!kc.roadmapId || !kc.stageId) continue;
    const stageKey = `${kc.roadmapId}:${kc.stageId}`;
    const list = passingKcsByStage.get(stageKey) ?? [];
    list.push(kc);
    passingKcsByStage.set(stageKey, list);
  }

  // 1. Evaluate Lessons, Stages, and Paths across ALL roadmaps (active + archived)
  for (const roadmap of input.roadmaps) {
    if (!roadmap?.id) continue;
    const roadmapFallbackTs = safeIsoOrFallback(roadmap.updatedAt || roadmap.createdAt, nowIso);
    const direction = resolveRoadmapDirection(roadmap);
    const stages = roadmap.roadmapData?.stages ?? [];
    let totalLessonsInRoadmap = 0;
    let completedLessonsInRoadmap = 0;
    const roadmapCompletionTimestamps: Array<string | null | undefined> = [];

    for (const stage of stages) {
      if (!stage?.id) continue;
      const lessons = stage.lessons ?? [];
      totalLessonsInRoadmap += lessons.length;
      let stageCompletedLessons = 0;
      const stageCompletionTimestamps: Array<string | null | undefined> = [];

      for (const lesson of lessons) {
        if (!lesson?.id) continue;
        if (lesson.completed === true) {
          completedLessonsInRoadmap += 1;
          stageCompletedLessons += 1;
          activeCompletedLessons += 1;
          distinctStagesWithCompletedLessons.add(`${roadmap.id}:${stage.id}`);
          const lessonTs = safeIsoOrFallback(lesson.completedAt, roadmapFallbackTs);
          stageCompletionTimestamps.push(lessonTs);
          roadmapCompletionTimestamps.push(lessonTs);

          const dateKey = getDateKeyInTimeZone(lessonTs, safeTz);
          if (dateKey) {
            const existingDay = completedLessonsPerDay.get(dateKey);
            if (!existingDay) {
              completedLessonsPerDay.set(dateKey, { count: 1, latestTs: lessonTs });
            } else {
              completedLessonsPerDay.set(dateKey, {
                count: existingDay.count + 1,
                latestTs:
                  new Date(lessonTs).getTime() > new Date(existingDay.latestTs).getTime()
                    ? lessonTs
                    : existingDay.latestTs,
              });
            }
          }

          registerDerivedEvent({
            eventKey: buildLessonEventKey(roadmap.id, stage.id, lesson.id),
            eventType: 'lesson_completed',
            xpAmount: XP_REWARDS.LESSON_FIRST_COMPLETION,
            title: `Completed lesson: ${lesson.title || 'Lesson'}`,
            direction,
            roadmapId: roadmap.id,
            stageId: stage.id,
            lessonId: lesson.id,
            awardedAt: lessonTs,
          });
        }
      }

      if (lessons.length > 0 && stageCompletedLessons === lessons.length) {
        activeCompletedStages += 1;
        registerDerivedEvent({
          eventKey: buildStageEventKey(roadmap.id, stage.id),
          eventType: 'stage_completed',
          xpAmount: XP_REWARDS.STAGE_FIRST_COMPLETION,
          title: `Completed course stage: ${stage.title || 'Learning Stage'}`,
          direction,
          roadmapId: roadmap.id,
          stageId: stage.id,
          lessonId: null,
          awardedAt: pickLatestIso(stageCompletionTimestamps, roadmapFallbackTs),
        });
      }
    }

    if (
      stages.length > 0 &&
      totalLessonsInRoadmap > 0 &&
      completedLessonsInRoadmap === totalLessonsInRoadmap
    ) {
      activeCompletedPaths += 1;
      registerDerivedEvent({
        eventKey: buildPathEventKey(roadmap.id),
        eventType: 'path_completed',
        xpAmount: XP_REWARDS.PATH_FIRST_COMPLETION,
        title: `Completed learning path: ${roadmap.title || roadmap.careerGoal || 'Learning Path'}`,
        direction,
        roadmapId: roadmap.id,
        stageId: null,
        lessonId: null,
        awardedAt: pickLatestIso(roadmapCompletionTimestamps, roadmapFallbackTs),
      });
    }
  }

  // 2. Evaluate Passing Knowledge Checks (>= 80% score) — earliest passing attempt awards 25 XP once per lesson
  const passedLessonKeys = new Set<string>();
  for (const kc of sortedPassingKcs) {
    if (!kc.roadmapId || !kc.stageId || !kc.lessonId) continue;
    const eventKey = buildKnowledgeCheckPassEventKey(kc.roadmapId, kc.stageId, kc.lessonId);
    passedLessonKeys.add(eventKey);
    const roadmapDir = roadmapById.has(kc.roadmapId)
      ? resolveRoadmapDirection(roadmapById.get(kc.roadmapId))
      : 'General Learning';

    registerDerivedEvent({
      eventKey,
      eventType: 'knowledge_check_passed',
      xpAmount: XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS,
      title: `Passed Knowledge Check: ${kc.lessonTitle || 'Lesson Quiz'} (${kc.score}%)`,
      direction: roadmapDir,
      roadmapId: kc.roadmapId,
      stageId: kc.stageId,
      lessonId: kc.lessonId,
      awardedAt: safeIsoOrFallback(kc.completedAt, nowIso),
    });
  }

  // 3. Merge any previously persisted ledger items (so historical earned XP across direction switches is never lost)
  for (const persisted of persistedLedgerMap.values()) {
    if (!derivedEventsMap.has(persisted.eventKey)) {
      const roadmapDir =
        persisted.roadmapId && roadmapById.has(persisted.roadmapId)
          ? resolveRoadmapDirection(roadmapById.get(persisted.roadmapId))
          : null;
      derivedEventsMap.set(persisted.eventKey, {
        ...persisted,
        direction: persisted.direction?.trim() || roadmapDir || 'General Learning',
      });
    }
  }

  const allLedgerEntries = Array.from(derivedEventsMap.values()).sort(
    (a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
  );

  const newlyEligibleEvents = Array.from(derivedEventsMap.values()).filter(
    (evt) => !persistedLedgerMap.has(evt.eventKey)
  );

  // Compute Overall XP + Direction-Specific XP (Option A architecture)
  let totalXp = 0;
  let lessonXp = 0;
  let knowledgeCheckXp = 0;
  let stageXp = 0;
  let pathXp = 0;
  let ledgerLessonsCount = 0;
  let ledgerPassedKcCount = 0;
  let ledgerStagesCount = 0;
  let ledgerPathsCount = 0;

  const directionAccMap = new Map<
    string,
    {
      directionKey: string;
      direction: string;
      totalXp: number;
      completedLessons: number;
      completedCourses: number;
      completedPaths: number;
      passedKnowledgeChecks: number;
      lastAwardedAt: string | null;
    }
  >();

  for (const entry of allLedgerEntries) {
    totalXp += entry.xpAmount;
    switch (entry.eventType) {
      case 'lesson_completed':
        lessonXp += entry.xpAmount;
        ledgerLessonsCount += 1;
        break;
      case 'knowledge_check_passed':
        knowledgeCheckXp += entry.xpAmount;
        ledgerPassedKcCount += 1;
        break;
      case 'stage_completed':
        stageXp += entry.xpAmount;
        ledgerStagesCount += 1;
        break;
      case 'path_completed':
        pathXp += entry.xpAmount;
        ledgerPathsCount += 1;
        break;
    }

    const dirLabel = normalizeDirectionLabel(entry.direction);
    const dirKey = normalizeDirectionKey(dirLabel);
    const acc = directionAccMap.get(dirKey) ?? {
      directionKey: dirKey,
      direction: dirLabel,
      totalXp: 0,
      completedLessons: 0,
      completedCourses: 0,
      completedPaths: 0,
      passedKnowledgeChecks: 0,
      lastAwardedAt: null,
    };
    acc.totalXp += entry.xpAmount;
    if (entry.eventType === 'lesson_completed') acc.completedLessons += 1;
    if (entry.eventType === 'knowledge_check_passed') acc.passedKnowledgeChecks += 1;
    if (entry.eventType === 'stage_completed') acc.completedCourses += 1;
    if (entry.eventType === 'path_completed') acc.completedPaths += 1;
    if (
      !acc.lastAwardedAt ||
      new Date(entry.awardedAt).getTime() > new Date(acc.lastAwardedAt).getTime()
    ) {
      acc.lastAwardedAt = entry.awardedAt;
    }
    directionAccMap.set(dirKey, acc);
  }

  const resolvedActiveDirection = (() => {
    if (input.activeDirection && input.activeDirection.trim()) {
      return input.activeDirection.trim();
    }
    const activeRm = input.roadmaps.find((r) => r.status === 'active') ?? input.roadmaps[0];
    return activeRm ? resolveRoadmapDirection(activeRm) : '';
  })();

  if (resolvedActiveDirection) {
    const activeKey = normalizeDirectionKey(resolvedActiveDirection);
    if (!directionAccMap.has(activeKey)) {
      directionAccMap.set(activeKey, {
        directionKey: activeKey,
        direction: resolvedActiveDirection,
        totalXp: 0,
        completedLessons: 0,
        completedCourses: 0,
        completedPaths: 0,
        passedKnowledgeChecks: 0,
        lastAwardedAt: null,
      });
    }
  }

  const directionXpBreakdown: DirectionXpSummary[] = Array.from(directionAccMap.values())
    .map((acc) => ({
      ...acc,
      levelInfo: computeLevelInfo(acc.totalXp),
    }))
    .sort((a, b) => {
      if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
      return a.direction.localeCompare(b.direction);
    });

  const activeDirectionKey = resolvedActiveDirection
    ? normalizeDirectionKey(resolvedActiveDirection)
    : '';
  const activeDirectionXp = activeDirectionKey
    ? directionAccMap.get(activeDirectionKey)?.totalXp ?? 0
    : totalXp;

  const maxSingleDirectionXp = directionXpBreakdown.reduce(
    (max, item) => Math.max(max, item.totalXp),
    0
  );

  const completedLessonsCount = Math.max(activeCompletedLessons, ledgerLessonsCount);
  const passedKnowledgeChecksCount = Math.max(passedLessonKeys.size, ledgerPassedKcCount);
  const completedStagesCount = Math.max(activeCompletedStages, ledgerStagesCount);
  const completedPathsCount = Math.max(activeCompletedPaths, ledgerPathsCount);
  const assessmentsCount = input.assessmentAttempts.length;

  const streakSummary = computeStreakSummaryForAchievements({
    roadmaps: input.roadmaps,
    knowledgeCheckAttempts: input.knowledgeCheckAttempts,
    learningSessions: input.learningSessions,
    assessmentAttempts: input.assessmentAttempts,
    timeZone: safeTz,
    now,
  });

  const maxObservedStreak = Math.max(
    streakSummary.currentStreakDays,
    streakSummary.longestStreakDays
  );

  // Meaningful study/practice count (completed sessions + completed lessons deduplicated by date/lesson or count)
  const completedStudySessionsCount = input.learningSessions.filter(
    (s) => s.completed || s.durationSeconds >= 60
  ).length;
  const practiceActivitiesCount = Math.max(
    completedLessonsCount,
    completedStudySessionsCount
  );

  // Graded scores across Knowledge Checks & Diagnostic Assessments
  const gradedEvaluations = [
    ...input.knowledgeCheckAttempts.map((kc) => ({
      score: Number(kc.score) || 0,
      timestamp: safeIsoOrFallback(kc.completedAt, nowIso),
      roadmapId: kc.roadmapId,
      stageId: kc.stageId,
    })),
    ...input.assessmentAttempts.map((att) => ({
      score: Number(att.scorePercent) || 0,
      timestamp: safeIsoOrFallback(att.createdAt, nowIso),
      roadmapId: null as string | null,
      stageId: null as string | null,
    })),
  ];

  const averageQuizAndAssessmentScore =
    gradedEvaluations.length > 0
      ? Math.round(
          gradedEvaluations.reduce((sum, item) => sum + item.score, 0) /
            gradedEvaluations.length
        )
      : null;

  const perfectScoreAttempt = gradedEvaluations
    .filter((item) => item.score >= 100)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

  const fastLearnerDay = Array.from(completedLessonsPerDay.values())
    .filter((d) => d.count >= 3)
    .sort((a, b) => new Date(a.latestTs).getTime() - new Date(b.latestTs).getTime())[0];

  const maxLessonsInOneDay = Array.from(completedLessonsPerDay.values()).reduce(
    (max, d) => Math.max(max, d.count),
    0
  );

  // 4. Evaluate Certificates (Course Completion, Learning Path Completion, Excellence Award)
  const certificateEligibility: CertificateEligibilityCandidate[] = [];
  const derivedCertsMap = new Map<string, IssuedCertificateRecord>();

  const registerCertificate = (candidate: Omit<IssuedCertificateRecord, 'id' | 'certificateNumber' | 'verificationDigest'>) => {
    const existing = persistedCertMap.get(candidate.certificateKey);
    if (existing) {
      derivedCertsMap.set(candidate.certificateKey, existing);
      return;
    }
    const seed = `${input.userId || 'local'}:${candidate.certificateKey}`;
    const certificateNumber = generateDeterministicCertificateNumber(
      seed,
      candidate.issuedAt
    );
    const verificationDigest = buildCertificateVerificationDigest({
      certificateNumber,
      certificateType: candidate.certificateType,
      title: candidate.title,
      direction: candidate.direction,
      completionDate: candidate.completionDate,
    });
    derivedCertsMap.set(candidate.certificateKey, {
      id: candidate.certificateKey,
      certificateNumber,
      verificationDigest,
      ...candidate,
    });
  };

  for (const roadmap of input.roadmaps) {
    if (!roadmap?.id) continue;
    const direction = resolveRoadmapDirection(roadmap);
    const stages = roadmap.roadmapData?.stages ?? [];
    const roadmapFallbackTs = safeIsoOrFallback(roadmap.updatedAt || roadmap.createdAt, nowIso);

    let totalPathLessons = 0;
    let completedPathLessons = 0;
    let stagesWithPassedKc = 0;
    const pathCompletionTimestamps: Array<string | null | undefined> = [];

    for (let sIdx = 0; sIdx < stages.length; sIdx += 1) {
      const stage = stages[sIdx];
      if (!stage?.id) continue;
      const lessons = stage.lessons ?? [];
      const totalLessons = lessons.length;
      const completedLessons = lessons.filter((l) => l.completed === true).length;
      totalPathLessons += totalLessons;
      completedPathLessons += completedLessons;

      const stageCompletionTsList = lessons
        .filter((l) => l.completed)
        .map((l) => safeIsoOrFallback(l.completedAt, roadmapFallbackTs));
      pathCompletionTimestamps.push(...stageCompletionTsList);

      const stagePassedKcs = passingKcsByStage.get(`${roadmap.id}:${stage.id}`) ?? [];
      const hasPassedStageKc = stagePassedKcs.length >= 1;
      if (hasPassedStageKc) stagesWithPassedKc += 1;

      const allStageLessonsDone = totalLessons > 0 && completedLessons === totalLessons;
      const courseCertKey = buildCourseCertificateKey(roadmap.id, stage.id);
      const alreadyEarned = persistedCertMap.has(courseCertKey);
      const courseEligible = (allStageLessonsDone && hasPassedStageKc) || alreadyEarned;

      const checklist: CertificateChecklistItem[] = [
        {
          label: 'Complete all course lessons',
          completed: allStageLessonsDone,
          detail: `${completedLessons} / ${totalLessons} lessons completed`,
        },
        {
          label: `Pass at least 1 Knowledge Check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
          completed: hasPassedStageKc,
          detail: hasPassedStageKc
            ? `${stagePassedKcs.length} passed (${Math.max(...stagePassedKcs.map((k) => k.score))}% best)`
            : '0 / 1 quiz passed in this course',
        },
      ];

      const lessonWeight = totalLessons > 0 ? (completedLessons / totalLessons) * 75 : 0;
      const quizWeight = hasPassedStageKc ? 25 : 0;
      const courseProgressPct = courseEligible
        ? 100
        : Math.min(99, Math.round(lessonWeight + quizWeight));

      const courseCompletionDate =
        allStageLessonsDone && hasPassedStageKc
          ? pickLatestIso(
              [
                ...stageCompletionTsList,
                stagePassedKcs[0]?.completedAt,
              ],
              roadmapFallbackTs
            )
          : null;

      certificateEligibility.push({
        certificateKey: courseCertKey,
        certificateType: 'course_completion',
        certificateTypeLabel: formatCertificateTypeLabel('course_completion'),
        title: stage.title || `Course ${sIdx + 1}`,
        direction,
        roadmapId: roadmap.id,
        stageId: stage.id,
        eligible: courseEligible,
        earned: courseEligible,
        completionDate: courseCompletionDate,
        progressPercent: courseProgressPct,
        checklist,
      });

      if (courseEligible && courseCompletionDate) {
        registerCertificate({
          certificateKey: courseCertKey,
          certificateType: 'course_completion',
          certificateTypeLabel: formatCertificateTypeLabel('course_completion'),
          title: stage.title || `Course ${sIdx + 1}`,
          direction,
          studentName,
          roadmapId: roadmap.id,
          stageId: stage.id,
          templateId: defaultTemplateForCertificateType('course_completion'),
          publicNameVisibility: 'full_name',
          issuerName: 'Skillora',
          issuerDesignation: 'Academic & Curriculum Verification Board',
          status: 'valid',
          completionDate: courseCompletionDate,
          issuedAt: courseCompletionDate,
          metadata: {
            roadmapTitle: roadmap.title,
            stageNumber: sIdx + 1,
            lessonsCompleted: completedLessons,
            bestQuizScore: Math.max(...stagePassedKcs.map((k) => k.score)),
          },
        });
      }
    }

    // Learning Path Completion Certificate
    const pathCertKey = buildPathCertificateKey(roadmap.id);
    const pathAlreadyEarned = persistedCertMap.has(pathCertKey);
    const allPathLessonsDone =
      stages.length > 0 && totalPathLessons > 0 && completedPathLessons === totalPathLessons;
    const allStagesHavePassedKc =
      stages.length > 0 && stagesWithPassedKc === stages.length;
    const pathEligible = (allPathLessonsDone && allStagesHavePassedKc) || pathAlreadyEarned;

    const pathChecklist: CertificateChecklistItem[] = [
      {
        label: 'Complete all lessons across every stage',
        completed: allPathLessonsDone,
        detail: `${completedPathLessons} / ${totalPathLessons} lessons completed`,
      },
      {
        label: `Verify every stage with a passing Knowledge Check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
        completed: allStagesHavePassedKc,
        detail: `${stagesWithPassedKc} / ${stages.length} stages verified by quiz`,
      },
    ];

    const pathLessonWeight =
      totalPathLessons > 0 ? (completedPathLessons / totalPathLessons) * 70 : 0;
    const pathKcWeight =
      stages.length > 0 ? (stagesWithPassedKc / stages.length) * 30 : 0;
    const pathProgressPct = pathEligible
      ? 100
      : Math.min(99, Math.round(pathLessonWeight + pathKcWeight));

    const pathCompletionDate =
      allPathLessonsDone && allStagesHavePassedKc
        ? pickLatestIso(
            [
              ...pathCompletionTimestamps,
              ...stages.flatMap((st) =>
                (passingKcsByStage.get(`${roadmap.id}:${st.id}`) ?? []).map(
                  (k) => k.completedAt
                )
              ),
            ],
            roadmapFallbackTs
          )
        : null;

    certificateEligibility.push({
      certificateKey: pathCertKey,
      certificateType: 'path_completion',
      certificateTypeLabel: formatCertificateTypeLabel('path_completion'),
      title: roadmap.title || `${direction} Learning Path`,
      direction,
      roadmapId: roadmap.id,
      stageId: null,
      eligible: pathEligible,
      earned: pathEligible,
      completionDate: pathCompletionDate,
      progressPercent: pathProgressPct,
      checklist: pathChecklist,
    });

    if (pathEligible && pathCompletionDate) {
      registerCertificate({
        certificateKey: pathCertKey,
        certificateType: 'path_completion',
        certificateTypeLabel: formatCertificateTypeLabel('path_completion'),
        title: roadmap.title || `${direction} Learning Path`,
        direction,
        studentName,
        roadmapId: roadmap.id,
        stageId: null,
        templateId: defaultTemplateForCertificateType('path_completion'),
        publicNameVisibility: 'full_name',
        issuerName: 'Skillora',
        issuerDesignation: 'Academic & Curriculum Verification Board',
        status: 'valid',
        completionDate: pathCompletionDate,
        issuedAt: pathCompletionDate,
        metadata: {
          stagesCount: stages.length,
          totalLessons: totalPathLessons,
        },
      });
    }
  }

  // Excellence Certificate (explicit high-performance threshold per direction)
  const excellenceTargetDirection =
    resolvedActiveDirection ||
    directionXpBreakdown[0]?.direction ||
    '';
  if (excellenceTargetDirection) {
    const dirSummary = directionAccMap.get(normalizeDirectionKey(excellenceTargetDirection));
    const dirXp = dirSummary?.totalXp ?? 0;
    const dirCourses = dirSummary?.completedCourses ?? 0;

    // Combine direction roadmaps' knowledge checks + diagnostic assessments
    const dirRoadmapIds = new Set(
      input.roadmaps
        .filter(
          (r) =>
            normalizeDirectionKey(resolveRoadmapDirection(r)) ===
            normalizeDirectionKey(excellenceTargetDirection)
        )
        .map((r) => r.id)
    );
    const dirKcs = input.knowledgeCheckAttempts.filter((kc) =>
      dirRoadmapIds.has(kc.roadmapId)
    );
    const dirGraded = [
      ...dirKcs.map((k) => ({ score: Number(k.score) || 0, ts: k.completedAt })),
      ...input.assessmentAttempts.map((a) => ({ score: Number(a.scorePercent) || 0, ts: a.createdAt })),
    ];
    const dirGradedCount = dirGraded.length;
    const dirAvgScore =
      dirGradedCount > 0
        ? Math.round(dirGraded.reduce((s, g) => s + g.score, 0) / dirGradedCount)
        : 0;

    const exCertKey = buildExcellenceCertificateKey(excellenceTargetDirection);
    const exAlreadyEarned = persistedCertMap.has(exCertKey);
    const meetsCourse = dirCourses >= 1;
    const meetsAvg =
      dirGradedCount >= EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT &&
      dirAvgScore >= EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT;
    const meetsXp = dirXp >= EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP;
    const exEligible = (meetsCourse && meetsAvg && meetsXp) || exAlreadyEarned;

    const exCompletionDate =
      meetsCourse && meetsAvg && meetsXp
        ? pickLatestIso(
            dirGraded.map((g) => g.ts),
            nowIso
          )
        : null;

    const exPct = exEligible
      ? 100
      : Math.min(
          99,
          Math.round(
            (meetsCourse ? 34 : 0) +
              (Math.min(1, dirXp / EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP) * 33) +
              (Math.min(1, dirGradedCount / EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT) *
                (dirAvgScore >= EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT ? 33 : 16))
          )
        );

    certificateEligibility.push({
      certificateKey: exCertKey,
      certificateType: 'excellence',
      certificateTypeLabel: formatCertificateTypeLabel('excellence'),
      title: `Excellence in ${excellenceTargetDirection}`,
      direction: excellenceTargetDirection,
      roadmapId: null,
      stageId: null,
      eligible: exEligible,
      earned: exEligible,
      completionDate: exCompletionDate,
      progressPercent: exPct,
      checklist: [
        {
          label: 'Complete at least 1 full course in this direction',
          completed: meetsCourse,
          detail: `${dirCourses} / 1 course completed`,
        },
        {
          label: `Achieve ${EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT}%+ average across ${EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT}+ graded quizzes/assessments`,
          completed: meetsAvg,
          detail:
            dirGradedCount > 0
              ? `${dirAvgScore}% avg across ${dirGradedCount} graded`
              : `0 / ${EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT} graded evaluations`,
        },
        {
          label: `Earn ${EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP}+ XP in ${excellenceTargetDirection}`,
          completed: meetsXp,
          detail: `${dirXp} / ${EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP} XP`,
        },
      ],
    });

    if (exEligible && exCompletionDate) {
      registerCertificate({
        certificateKey: exCertKey,
        certificateType: 'excellence',
        certificateTypeLabel: formatCertificateTypeLabel('excellence'),
        title: `Excellence in ${excellenceTargetDirection}`,
        direction: excellenceTargetDirection,
        studentName,
        roadmapId: null,
        stageId: null,
        templateId: defaultTemplateForCertificateType('excellence'),
        publicNameVisibility: 'full_name',
        issuerName: 'Skillora',
        issuerDesignation: 'Academic & Curriculum Verification Board',
        status: 'valid',
        completionDate: exCompletionDate,
        issuedAt: exCompletionDate,
        metadata: {
          averageScore: dirAvgScore,
          gradedCount: dirGradedCount,
          directionXp: dirXp,
        },
      });
    }
  }

  // Merge any persisted certificates from other directions (so switching directions never hides/deletes earned certificates)
  for (const persistedCert of persistedCertMap.values()) {
    if (!derivedCertsMap.has(persistedCert.certificateKey)) {
      derivedCertsMap.set(persistedCert.certificateKey, persistedCert);
    }
  }

  const allCertificates = Array.from(derivedCertsMap.values()).sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  );

  const newlyEligibleCertificates = allCertificates.filter(
    (cert) => !persistedCertMap.has(cert.certificateKey)
  );

  const earliestForType = (type: XpEventType): string => {
    const matches = allLedgerEntries
      .filter((e) => e.eventType === type)
      .sort((a, b) => new Date(a.awardedAt).getTime() - new Date(b.awardedAt).getTime());
    return matches[0]?.awardedAt ?? nowIso;
  };

  const nthForType = (type: XpEventType, indexZeroBased: number): string => {
    const matches = allLedgerEntries
      .filter((e) => e.eventType === type)
      .sort((a, b) => new Date(a.awardedAt).getTime() - new Date(b.awardedAt).getTime());
    return matches[indexZeroBased]?.awardedAt ?? matches[matches.length - 1]?.awardedAt ?? nowIso;
  };

  const earliestAssessmentTs = (() => {
    const sorted = input.assessmentAttempts
      .filter((a) => Boolean(a.createdAt))
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted[0]?.createdAt ? safeIsoOrFallback(sorted[0].createdAt, nowIso) : nowIso;
  })();

  const badges: AchievementBadgeState[] = BADGE_DEFINITIONS.map((def) => {
    const persisted = persistedBadgeMap.get(def.id);
    let unlockedNow = false;
    let progressCurrent = 0;
    let progressTarget = 1;
    let progressLabel = '';
    let derivedUnlockedAt: string | null = null;

    switch (def.id) {
      case 'first_lesson_completed':
      case 'first_step':
        progressTarget = 1;
        progressCurrent = Math.min(1, completedLessonsCount);
        unlockedNow = completedLessonsCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 lesson' : '0 / 1 lesson';
        if (unlockedNow) derivedUnlockedAt = earliestForType('lesson_completed');
        break;

      case 'first_course_completed':
      case 'stage_master':
        progressTarget = 1;
        progressCurrent = Math.min(1, completedStagesCount);
        unlockedNow = completedStagesCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 course stage' : '0 / 1 course stage';
        if (unlockedNow) derivedUnlockedAt = earliestForType('stage_completed');
        break;

      case 'first_learning_path_completed':
      case 'path_finisher':
        progressTarget = 1;
        progressCurrent = Math.min(1, completedPathsCount);
        unlockedNow = completedPathsCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 learning path' : '0 / 1 learning path';
        if (unlockedNow) derivedUnlockedAt = earliestForType('path_completed');
        break;

      case 'roadmap_explorer': {
        const roadmapCount = input.roadmaps.length;
        const stageReach = distinctStagesWithCompletedLessons.size;
        unlockedNow = roadmapCount >= 2 || stageReach >= 3;
        progressTarget = roadmapCount >= 2 ? 2 : 3;
        progressCurrent = unlockedNow
          ? progressTarget
          : Math.max(roadmapCount, Math.min(2, stageReach));
        progressLabel = unlockedNow
          ? roadmapCount >= 2
            ? `${roadmapCount} roadmaps explored`
            : `${stageReach} stages explored`
          : `${stageReach} / 3 stages or ${roadmapCount} / 2 paths`;
        if (unlockedNow) {
          derivedUnlockedAt =
            input.roadmaps[1]?.createdAt || earliestForType('lesson_completed');
        }
        break;
      }

      case 'streak_3_days':
        progressTarget = 3;
        progressCurrent = Math.min(3, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 3;
        progressLabel = `${progressCurrent} / 3 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[3], nowIso);
        }
        break;

      case 'streak_7_days':
      case 'consistent_learner':
        progressTarget = 7;
        progressCurrent = Math.min(7, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 7;
        progressLabel = `${progressCurrent} / 7 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[7], nowIso);
        }
        break;

      case 'streak_14_days':
        progressTarget = 14;
        progressCurrent = Math.min(14, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 14;
        progressLabel = `${progressCurrent} / 14 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[14], nowIso);
        }
        break;

      case 'streak_30_days':
        progressTarget = 30;
        progressCurrent = Math.min(30, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 30;
        progressLabel = `${progressCurrent} / 30 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[30], nowIso);
        }
        break;

      case 'streak_100_days':
        progressTarget = 100;
        progressCurrent = Math.min(100, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 100;
        progressLabel = `${progressCurrent} / 100 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[100], nowIso);
        }
        break;

      case 'knowledge_seeker':
        progressTarget = 1;
        progressCurrent = Math.min(1, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 passed quiz' : '0 / 1 passed quiz';
        if (unlockedNow) derivedUnlockedAt = earliestForType('knowledge_check_passed');
        break;

      case 'skill_assessor':
        progressTarget = 1;
        progressCurrent = Math.min(1, assessmentsCount);
        unlockedNow = assessmentsCount >= 1;
        progressLabel = unlockedNow ? '1 / 1 assessment' : '0 / 1 assessment';
        if (unlockedNow) derivedUnlockedAt = earliestAssessmentTs;
        break;

      case 'knowledge_master':
        progressTarget = 5;
        progressCurrent = Math.min(5, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 5;
        progressLabel = `${progressCurrent} / 5 passed quizzes`;
        if (unlockedNow) derivedUnlockedAt = nthForType('knowledge_check_passed', 4);
        break;

      case 'quiz_champion':
        progressTarget = 10;
        progressCurrent = Math.min(10, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 10;
        progressLabel = `${progressCurrent} / 10 passed quizzes`;
        if (unlockedNow) derivedUnlockedAt = nthForType('knowledge_check_passed', 9);
        break;

      case 'perfect_score':
        progressTarget = 1;
        progressCurrent = perfectScoreAttempt ? 1 : 0;
        unlockedNow = Boolean(perfectScoreAttempt);
        progressLabel = unlockedNow ? '100% achieved' : 'Best: ' + (
          gradedEvaluations.length > 0
            ? `${Math.max(...gradedEvaluations.map((g) => g.score))}%`
            : '0%'
        );
        if (unlockedNow && perfectScoreAttempt) {
          derivedUnlockedAt = perfectScoreAttempt.timestamp;
        }
        break;

      case 'practice_champion':
        progressTarget = 10;
        progressCurrent = Math.min(10, practiceActivitiesCount);
        unlockedNow = practiceActivitiesCount >= 10;
        progressLabel = `${progressCurrent} / 10 study activities`;
        if (unlockedNow) derivedUnlockedAt = nthForType('lesson_completed', 9);
        break;

      case 'skill_builder': {
        const lessonPart = Math.min(5, completedLessonsCount);
        const assessPart = Math.min(1, assessmentsCount);
        progressTarget = 6;
        progressCurrent = lessonPart + assessPart;
        unlockedNow = completedLessonsCount >= 5 && assessmentsCount >= 1;
        progressLabel = `${lessonPart}/5 lessons · ${assessPart}/1 diagnostic`;
        if (unlockedNow) {
          derivedUnlockedAt = pickLatestIso(
            [nthForType('lesson_completed', 4), earliestAssessmentTs],
            nowIso
          );
        }
        break;
      }

      case 'fast_learner':
        progressTarget = 3;
        unlockedNow = Boolean(fastLearnerDay);
        progressCurrent = unlockedNow ? 3 : Math.min(3, maxLessonsInOneDay);
        progressLabel = unlockedNow
          ? '3 / 3 lessons in 1 day'
          : `${Math.min(3, maxLessonsInOneDay)} / 3 lessons in 1 day`;
        if (unlockedNow && fastLearnerDay) {
          derivedUnlockedAt = fastLearnerDay.latestTs;
        }
        break;

      case 'learning_excellence': {
        const avg = averageQuizAndAssessmentScore ?? 0;
        const hasCourse = completedStagesCount >= 1;
        const hasGraded = gradedEvaluations.length >= 3 && avg >= 90;
        unlockedNow = hasCourse && hasGraded;
        progressTarget = 2;
        progressCurrent = (hasCourse ? 1 : 0) + (hasGraded ? 1 : 0);
        progressLabel = unlockedNow
          ? `${avg}% avg · ${completedStagesCount} course`
          : `${completedStagesCount}/1 course · ${avg}% avg (${gradedEvaluations.length}/3 graded)`;
        if (unlockedNow) {
          derivedUnlockedAt = pickLatestIso(
            [earliestForType('stage_completed'), gradedEvaluations[2]?.timestamp],
            nowIso
          );
        }
        break;
      }

      case 'subject_expert':
        progressTarget = 1000;
        progressCurrent = Math.min(1000, maxSingleDirectionXp);
        unlockedNow = maxSingleDirectionXp >= 1000 || completedPathsCount >= 1;
        progressLabel = unlockedNow
          ? completedPathsCount >= 1
            ? 'Path mastered'
            : '1,000+ direction XP'
          : `${maxSingleDirectionXp} / 1,000 direction XP`;
        if (unlockedNow) {
          derivedUnlockedAt =
            completedPathsCount >= 1
              ? earliestForType('path_completed')
              : allLedgerEntries[0]?.awardedAt ?? nowIso;
        }
        break;
    }

    const isUnlocked = Boolean(persisted) || unlockedNow;
    const unlockedAt = persisted?.unlockedAt
      ? safeIsoOrFallback(persisted.unlockedAt, nowIso)
      : isUnlocked
      ? derivedUnlockedAt ?? nowIso
      : null;

    if (isUnlocked && progressCurrent < progressTarget) {
      progressCurrent = progressTarget;
    }

    return {
      ...def,
      unlocked: isUnlocked,
      unlockedAt,
      progressCurrent,
      progressTarget,
      progressLabel:
        isUnlocked && def.id === 'consistent_learner'
          ? '7 / 7 day streak'
          : isUnlocked && def.category === 'consistency'
          ? `${progressTarget} / ${progressTarget} day streak`
          : progressLabel,
    };
  });

  const verifiedBadgesToPersist = badges
    .filter((b) => b.unlocked)
    .map((b) => ({
      badgeId: b.id,
      unlockedAt: b.unlockedAt ?? nowIso,
      metadata: {
        title: b.title,
        category: b.category,
        rarity: b.rarity,
        unlockRequirement: b.unlockRequirement,
      },
    }));

  const newlyUnlockedBadges = verifiedBadgesToPersist.filter(
    (b) => !persistedBadgeMap.has(b.badgeId)
  );

  // Recent achievements combine certificates + unlocked badges + recent XP awards ordered newest-first
  const recentAchievements: RecentAchievementItem[] = [
    ...allCertificates.map((cert) => ({
      id: `cert-${cert.certificateKey}`,
      kind: 'certificate' as const,
      certificateId: cert.id,
      title: `Certificate Earned: ${cert.title}`,
      subtitle: `${cert.certificateTypeLabel} · ${cert.certificateNumber}`,
      direction: cert.direction,
      timestamp: cert.issuedAt,
    })),
    ...badges
      .filter((b) => b.unlocked && b.unlockedAt)
      .map((b) => ({
        id: `badge-${b.id}`,
        kind: 'badge' as const,
        badgeId: b.id,
        title: `Badge Unlocked: ${b.title}`,
        subtitle: `${b.categoryLabel} · ${b.rarity}`,
        timestamp: b.unlockedAt!,
      })),
    ...allLedgerEntries.slice(0, 15).map((entry) => ({
      id: `xp-${entry.eventKey}`,
      kind: 'xp' as const,
      eventType: entry.eventType,
      title: entry.title,
      subtitle: `${entry.direction || 'General'} · +${entry.xpAmount} XP`,
      direction: entry.direction ?? null,
      xpAmount: entry.xpAmount,
      timestamp: entry.awardedAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 18);

  const levelInfo = computeLevelInfo(totalXp);

  return {
    summary: {
      totalXp,
      activeDirection: resolvedActiveDirection,
      activeDirectionXp,
      directionXpBreakdown,
      levelInfo,
      badges,
      unlockedCount: badges.filter((b) => b.unlocked).length,
      totalBadgesCount: badges.length,
      certificates: allCertificates,
      certificateEligibility,
      recentAchievements,
      xpLedger: allLedgerEntries.slice(0, 100),
      stats: {
        completedLessonsCount,
        passedKnowledgeChecksCount,
        completedStagesCount,
        completedPathsCount,
        assessmentsCount,
        currentStreakDays: streakSummary.currentStreakDays,
        longestStreakDays: maxObservedStreak,
        lessonXp,
        knowledgeCheckXp,
        stageXp,
        pathXp,
        certificatesCount: allCertificates.length,
        averageQuizAndAssessmentScore,
      },
    },
    verifiedEventsToPersist: allLedgerEntries,
    newlyEligibleEvents,
    verifiedBadgesToPersist,
    newlyUnlockedBadges,
    verifiedCertificatesToPersist: allCertificates,
    newlyEligibleCertificates,
  };
}
