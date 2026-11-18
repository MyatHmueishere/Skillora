import type {
  AssessmentAttemptRecord,
  ExploreResourceCardItem,
  ExploreResourcesPayload,
  LearningRoadmapRecord,
  LessonKnowledgeCheckAttemptRecord,
  UserProfile,
} from '../types';
import { computeRoadmapStats } from './learningRoadmaps';

export const ONBOARDING_INTEREST_CATEGORIES = [
  'Programming',
  'AI & Data Science',
  'Business & Management',
  'Engineering & Systems',
  'Geography & Environmental',
  'Design & Creativity',
  'Cybersecurity & IT',
  'Communication & Professional Skills',
  'Finance & Data Tools',
  'Languages & Academic Skills',
] as const;

export type OnboardingInterestCategory = (typeof ONBOARDING_INTEREST_CATEGORIES)[number];

export const PRIMARY_DIRECTION_SUGGESTIONS = [
  'AI Engineer',
  'Machine Learning Engineer',
  'Data Analyst',
  'Data Scientist',
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'UI/UX Designer',
  'Cybersecurity Specialist',
  'Business Manager',
  'Digital Marketer',
  'Project Manager',
  'Geographic Information Systems (GIS)',
  'Academic Writing & Research',
  'Finance & Economic Analytics',
] as const;

export function filterPrimaryDirectionSuggestions(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PRIMARY_DIRECTION_SUGGESTIONS];
  return PRIMARY_DIRECTION_SUGGESTIONS.filter((item) => item.toLowerCase().includes(q));
}

export type AssessmentSubjectId =
  | 'python'
  | 'datastructures'
  | 'sql'
  | 'ai_data'
  | 'business'
  | 'design'
  | 'cybersecurity'
  | 'communication'
  | 'finance'
  | 'languages';

export interface RecommendedAssessmentMeta {
  id: AssessmentSubjectId;
  label: string;
  desc: string;
  categories: OnboardingInterestCategory[];
}

export const ASSESSMENT_CATALOG: RecommendedAssessmentMeta[] = [
  {
    id: 'python',
    label: 'Python Fundamentals',
    desc: 'Syntax, closures, memory, OOP, and core programming logic',
    categories: ['Programming'],
  },
  {
    id: 'datastructures',
    label: 'Data Structures',
    desc: 'Hash maps, binary search trees, heaps, and Big-O complexity',
    categories: ['Programming'],
  },
  {
    id: 'sql',
    label: 'SQL & Databases',
    desc: 'Relational joins, aggregates, indexes, and ACID transactions',
    categories: ['Programming', 'AI & Data Science', 'Finance & Data Tools'],
  },
  {
    id: 'ai_data',
    label: 'AI & Data Science',
    desc: 'Model evaluation, generalization, data cleaning, and ML metrics',
    categories: ['AI & Data Science'],
  },
  {
    id: 'business',
    label: 'Business & Management',
    desc: 'OKRs, agile delivery, strategic frameworks, and team leadership',
    categories: ['Business & Management'],
  },
  {
    id: 'design',
    label: 'Design & Creativity',
    desc: 'Visual hierarchy, accessibility contrast, and UX wireframing',
    categories: ['Design & Creativity'],
  },
  {
    id: 'cybersecurity',
    label: 'Cybersecurity & IT',
    desc: 'Least privilege, MFA, and secure application practices',
    categories: ['Cybersecurity & IT'],
  },
  {
    id: 'communication',
    label: 'Communication Skills',
    desc: 'Structured updates, active listening, and actionable feedback',
    categories: ['Communication & Professional Skills'],
  },
  {
    id: 'finance',
    label: 'Finance & Data Tools',
    desc: 'Financial statements, spreadsheet modeling, and NPV analysis',
    categories: ['Finance & Data Tools'],
  },
  {
    id: 'languages',
    label: 'Languages & Academic',
    desc: 'Active recall, academic writing, and source evaluation',
    categories: ['Languages & Academic Skills'],
  },
];

export const SKILL_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  Programming: ['Python', 'JavaScript / TypeScript', 'Git & GitHub', 'SQL', 'HTML / CSS'],
  'AI & Data Science': ['Data Analysis', 'Statistics', 'Python', 'Pandas / NumPy', 'Machine Learning Basics'],
  'Business & Management': ['Project Management', 'Entrepreneurship', 'Marketing', 'Product Strategy'],
  'Engineering & Systems': ['Electrical Engineering', 'Electronics', 'Systems Design', 'Circuit Analysis'],
  'Geography & Environmental': ['Geographic Information Systems (GIS)', 'Spatial Analysis', 'QGIS / Mapping', 'Environmental Research'],
  'Design & Creativity': ['UI/UX Design', 'Figma', 'Visual Design', 'Typography & Layout'],
  'Cybersecurity & IT': ['Networking Basics', 'Linux', 'Cloud Fundamentals', 'Security Hygiene'],
  'Communication & Professional Skills': ['Public Speaking', 'Technical Writing', 'Presentation Design', 'Team Collaboration'],
  'Finance & Data Tools': ['Excel / Spreadsheets', 'Financial Modeling', 'Data Visualization', 'Accounting Basics'],
  'Languages & Academic Skills': ['Academic Writing', 'Research Methods', 'English Proficiency', 'Critical Reading'],
};

export const LEARNING_GOAL_SUGGESTIONS = [
  'Build software & web applications',
  'Launch a career in AI & Data Analysis',
  'Grow into Product or Project Management',
  'Master UI/UX & Digital Product Design',
  'Strengthen Cybersecurity & Cloud IT skills',
  'Excel in Financial Modeling & Business Analytics',
  'Improve Academic Writing & Presentation Skills',
];

export function getSkillSuggestionsForInterests(interests: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const interest of interests) {
    const list = SKILL_SUGGESTIONS_BY_CATEGORY[interest] || [];
    for (const sk of list) {
      if (!seen.has(sk)) {
        seen.add(sk);
        ordered.push(sk);
      }
    }
  }

  const generalDefaults = [
    'Python',
    'Excel / Spreadsheets',
    'Public Speaking',
    'UI/UX Design',
    'Data Analysis',
    'Project Management',
    'SQL',
    'Academic Writing',
  ];
  for (const sk of generalDefaults) {
    if (!seen.has(sk)) {
      seen.add(sk);
      ordered.push(sk);
    }
  }

  return ordered.slice(0, 12);
}

/**
 * Computes a local-time greeting consistently from browser time:
 * - Morning (05:00 - 11:59) -> Good Morning
 * - Afternoon (12:00 - 16:59) -> Good Afternoon
 * - Evening (17:00 - 20:59) -> Good Evening
 * - Night (21:00 - 04:59) -> Good Evening
 */
export function getTimeBasedGreeting(
  date: Date = new Date()
): 'Good Morning' | 'Good Afternoon' | 'Good Evening' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const DOMAIN_STOPWORDS = new Set([
  'skill',
  'skills',
  'learn',
  'learning',
  'course',
  'courses',
  'student',
  'university',
  'college',
  'degree',
  'bachelor',
  'master',
  'masters',
  'science',
  'studies',
  'study',
  'senior',
  'junior',
  'year',
  'major',
  'career',
  'goal',
  'become',
  'improve',
  'build',
  'launch',
  'basic',
  'basics',
  'fundamentals',
  'introduction',
  'intro',
  'tools',
  'tool',
  'level',
  'beginner',
  'intermediate',
  'advanced',
  'and',
  'for',
  'the',
  'with',
  'into',
  'from',
]);

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+/#]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !DOMAIN_STOPWORDS.has(t));
}

function textMatchesSubjectId(id: AssessmentSubjectId, lowerText: string): boolean {
  switch (id) {
    case 'python':
      return /\b(python|fastapi|django|flask|backend|full-stack|software|developer|programming|coding|oop|scripting|ai engineer|machine learning engineer|data scientist)\b/.test(
        lowerText
      );
    case 'datastructures':
      return /\b(data structures|algorithm|algorithms|leetcode|trees|graphs|hashing|computer science|software engineer|backend|full-stack)\b/.test(
        lowerText
      );
    case 'sql':
      return /\b(sql|postgres|postgresql|sqlite|database|databases|relational|queries|data engineer|data analyst|data scientist|backend|full-stack)\b/.test(
        lowerText
      );
    case 'ai_data':
      return /\b(ai|ai engineer|artificial intelligence|machine learning|deep learning|data science|data scientist|data analyst|data analysis|pandas|numpy|statistics|ml)\b/.test(
        lowerText
      );
    case 'business':
      return /\b(business|business manager|management|product manager|project manager|project management|digital marketer|marketing|agile|scrum|strategy|entrepreneur|leadership|mba|okr)\b/.test(
        lowerText
      );
    case 'design':
      return /\b(design|ui\/ux|ui\/ux designer|ux|ui|figma|graphic|typography|accessibility|wcag|wireframe|creative|product design|frontend developer)\b/.test(
        lowerText
      );
    case 'cybersecurity':
      return /\b(cyber|cybersecurity|security|infosec|owasp|network|linux|cloud|devops|soc|penetration)\b/.test(
        lowerText
      );
    case 'communication':
      return /\b(communication|public speaking|presentation|presentations|speech|rhetoric|technical writing|leadership|digital marketer|project manager|business manager)\b/.test(
        lowerText
      );
    case 'finance':
      return /\b(finance|financial|accounting|economics|excel|spreadsheet|valuation|investment|analytics|data analyst|fintech)\b/.test(
        lowerText
      );
    case 'languages':
      return /\b(academic writing|research writing|research methodology|research methods|literature review|english|language|languages|thesis|essay|geography|humanities)\b/.test(
        lowerText
      );
  }
}

export function getRecommendedAssessmentsForUser(
  user?: Pick<UserProfile, 'learningInterests' | 'careerGoal'> &
    Partial<
      Pick<
        UserProfile,
        'primaryDirection' | 'fieldOfStudy' | 'educationLevel' | 'currentSkills'
      >
    >
): {
  recommended: RecommendedAssessmentMeta[];
  allOrdered: (RecommendedAssessmentMeta & { isRecommended: boolean })[];
} {
  const interests = user?.learningInterests ?? [];
  const primaryText = (user?.primaryDirection ?? '').trim().toLowerCase();
  const secondaryText = [
    user?.careerGoal ?? '',
    user?.fieldOfStudy ?? '',
    user?.educationLevel ?? '',
    ...(user?.currentSkills ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const matchesPrimaryDirection = (item: RecommendedAssessmentMeta): boolean =>
    Boolean(primaryText && textMatchesSubjectId(item.id, primaryText));

  const matchesSupporting = (item: RecommendedAssessmentMeta): boolean => {
    if (
      interests.some((interest) =>
        item.categories.includes(interest as OnboardingInterestCategory)
      )
    ) {
      return true;
    }
    if (secondaryText && textMatchesSubjectId(item.id, secondaryText)) {
      return true;
    }
    return false;
  };

  const primaryMatches = ASSESSMENT_CATALOG.filter(matchesPrimaryDirection);
  const supportingMatches = ASSESSMENT_CATALOG.filter(
    (item) => !matchesPrimaryDirection(item) && matchesSupporting(item)
  );
  const recommended = [...primaryMatches, ...supportingMatches];
  const recommendedIds = new Set(recommended.map((item) => item.id));
  const rest = ASSESSMENT_CATALOG.filter((item) => !recommendedIds.has(item.id));

  const allOrdered = [
    ...recommended.map((item) => ({ ...item, isRecommended: true })),
    ...rest.map((item) => ({ ...item, isRecommended: false })),
  ];

  return { recommended, allOrdered };
}

export type DashboardRecommendationKind =
  | 'gap_review'
  | 'roadmap_lesson'
  | 'course_resource'
  | 'assessment';

export type DashboardRecommendationVariant =
  | 'lavender'
  | 'peach'
  | 'mint'
  | 'yellow'
  | 'pink';

export interface DashboardRecommendationItem {
  id: string;
  kind: DashboardRecommendationKind;
  category: string;
  meta: string;
  title: string;
  reason: string;
  ctaLabel: string;
  variant: DashboardRecommendationVariant;
  relevanceScore: number;
  action:
    | { type: 'lesson'; stageId: string; lessonId: string }
    | { type: 'assessment' }
    | { type: 'resource'; searchQuery: string }
    | { type: 'assistant'; prompt: string };
}

export interface BuildDashboardRecommendationsParams {
  user: Pick<
    UserProfile,
    | 'learningInterests'
    | 'careerGoal'
    | 'educationLevel'
    | 'university'
    | 'fieldOfStudy'
    | 'currentSkills'
    | 'knowledgeLevel'
  > &
    Partial<Pick<UserProfile, 'primaryDirection'>>;
  activeRoadmap: LearningRoadmapRecord | null;
  assessmentAttempts: AssessmentAttemptRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  explorePayload?: ExploreResourcesPayload | null;
  maxItems?: number;
}

function collectActiveKnowledgeGaps(
  assessmentAttempts: AssessmentAttemptRecord[],
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[]
): { topic: string; source: string; scorePercent: number }[] {
  const gapMap = new Map<string, { topic: string; source: string; scorePercent: number }>();

  // Latest diagnostic attempt per subject determines current diagnostic gaps
  const latestDiagBySubject = new Map<string, AssessmentAttemptRecord>();
  const sortedDiagnostics = assessmentAttempts
    .slice()
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  for (const attempt of sortedDiagnostics) {
    const key = attempt.subject.trim().toLowerCase();
    if (!latestDiagBySubject.has(key)) {
      latestDiagBySubject.set(key, attempt);
    }
  }
  for (const attempt of latestDiagBySubject.values()) {
    for (const gap of attempt.knowledgeGaps) {
      const clean = gap.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!gapMap.has(key)) {
        gapMap.set(key, {
          topic: clean,
          source: `${attempt.subject} diagnostic`,
          scorePercent: attempt.scorePercent,
        });
      }
    }
  }

  // Latest knowledge check per lesson determines lesson quiz gaps
  const latestKcByLesson = new Map<string, LessonKnowledgeCheckAttemptRecord>();
  const sortedKcs = knowledgeCheckAttempts
    .slice()
    .sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  for (const kc of sortedKcs) {
    const key = `${kc.roadmapId}:${kc.lessonId}`;
    if (!latestKcByLesson.has(key)) {
      latestKcByLesson.set(key, kc);
    }
  }
  for (const kc of latestKcByLesson.values()) {
    for (const gap of kc.knowledgeGaps) {
      const clean = gap.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!gapMap.has(key)) {
        gapMap.set(key, {
          topic: clean,
          source: kc.lessonTitle || 'Lesson quiz',
          scorePercent: kc.score,
        });
      }
    }
    for (const tb of kc.topicBreakdown) {
      if (tb.proficiency === 'Needs Improvement') {
        const clean = tb.topic.trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (!gapMap.has(key)) {
          gapMap.set(key, {
            topic: clean,
            source: kc.lessonTitle || 'Lesson quiz',
            scorePercent: tb.accuracyPercent,
          });
        }
      }
    }
  }

  return Array.from(gapMap.values());
}

function scoreResourceForDashboard(
  item: ExploreResourceCardItem,
  signals: {
    primaryDirectionTokens: Set<string>;
    interestTokens: Set<string>;
    academicTokens: Set<string>;
    goalTokens: Set<string>;
    skillTokens: Set<string>;
    roadmapTokens: Set<string>;
    gapTokens: Set<string>;
    knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  }
): { score: number; matchedSignals: string[] } {
  const haystack = `${item.title} ${item.subjectLabel} ${item.description} ${item.provider} ${item.type}`.toLowerCase();
  const hayTokens = new Set(normalizeTokens(haystack));

  const countHits = (tokens: Set<string>): number => {
    let hits = 0;
    for (const t of tokens) {
      if (hayTokens.has(t) || haystack.includes(t)) {
        hits += 1;
      }
    }
    return hits;
  };

  const gapHits = countHits(signals.gapTokens);
  const primaryDirectionHits = countHits(signals.primaryDirectionTokens);
  const goalHits = countHits(signals.goalTokens);
  const interestHits = countHits(signals.interestTokens);
  const academicHits = countHits(signals.academicTokens);
  const skillHits = countHits(signals.skillTokens);
  const roadmapHits = countHits(signals.roadmapTokens);

  let score =
    item.relationshipTier === 'direct'
      ? 42
      : item.relationshipTier === 'supporting'
      ? 24
      : item.relationshipTier === 'related'
      ? 12
      : 16;
  const matchedSignals: string[] = [];

  if (gapHits > 0) {
    score += 36 + Math.min(18, gapHits * 9);
    matchedSignals.push('Closes knowledge gap');
  }
  if (primaryDirectionHits > 0) {
    score += 28 + Math.min(18, primaryDirectionHits * 9);
    matchedSignals.push('Primary direction');
  } else if (goalHits > 0) {
    score += 24 + Math.min(16, goalHits * 8);
    matchedSignals.push('Goal match');
  }
  if (interestHits > 0) {
    score += 20 + Math.min(14, interestHits * 7);
    matchedSignals.push('Interest match');
  }
  if (academicHits > 0) {
    score += 18 + Math.min(12, academicHits * 6);
    matchedSignals.push('Academic fit');
  }
  if (roadmapHits > 0) {
    score += 16 + Math.min(12, roadmapHits * 6);
    matchedSignals.push('Path support');
  }
  if (skillHits > 0) {
    score += 12 + Math.min(10, skillHits * 5);
    matchedSignals.push('Skill progression');
  }

  // Knowledge-level alignment: reward exact level match, lightly de-rank mismatch
  if (item.levels.includes(signals.knowledgeLevel)) {
    score += 14;
  } else if (
    (signals.knowledgeLevel === 'Beginner' && !item.levels.includes('Beginner')) ||
    (signals.knowledgeLevel === 'Advanced' && item.levels.length === 1 && item.levels[0] === 'Beginner')
  ) {
    score -= 10;
  }

  // Prefer structured courses and official docs slightly over single short videos when tied
  if (item.tabCategory === 'course') score += 4;
  else if (item.tabCategory === 'documentation') score += 2;

  return { score, matchedSignals };
}

/**
 * Generates genuinely personalized Dashboard recommendations using all 7 student signals:
 * learningInterests, academic background (educationLevel/university/fieldOfStudy),
 * careerGoal, currentSkills, activeRoadmap, knowledge gaps (diagnostic + knowledge checks),
 * and knowledgeLevel.
 *
 * Strictly domain-isolated: never falls back to unrelated CS/Python courses when a
 * student's profile is in another domain or blank.
 */
export function buildPersonalizedDashboardRecommendations(
  params: BuildDashboardRecommendationsParams
): DashboardRecommendationItem[] {
  const {
    user,
    activeRoadmap,
    assessmentAttempts,
    knowledgeCheckAttempts,
    explorePayload,
    maxItems = 3,
  } = params;

  const primaryDirectionText = (user.primaryDirection ?? '').trim();
  const hasProfileSignals = Boolean(
    primaryDirectionText ||
      user.learningInterests.length > 0 ||
      user.careerGoal.trim() ||
      user.fieldOfStudy.trim() ||
      user.educationLevel.trim() ||
      user.university.trim() ||
      user.currentSkills.length > 0 ||
      activeRoadmap ||
      assessmentAttempts.length > 0 ||
      knowledgeCheckAttempts.length > 0
  );

  if (!hasProfileSignals) {
    return [];
  }

  const activeGaps = collectActiveKnowledgeGaps(
    assessmentAttempts,
    knowledgeCheckAttempts
  );
  const roadmapStats = computeRoadmapStats(activeRoadmap);

  const primaryDirectionTokens = new Set(normalizeTokens(primaryDirectionText));
  const interestTokens = new Set(normalizeTokens(user.learningInterests.join(' ')));
  const academicTokens = new Set(
    normalizeTokens(
      [user.fieldOfStudy, user.educationLevel, user.university].filter(Boolean).join(' ')
    )
  );
  const goalTokens = new Set(normalizeTokens(user.careerGoal));
  const skillTokens = new Set(normalizeTokens(user.currentSkills.join(' ')));
  const gapTokens = new Set(
    normalizeTokens(activeGaps.map((g) => g.topic).join(' '))
  );

  const roadmapTexts: string[] = [];
  if (activeRoadmap) {
    roadmapTexts.push(activeRoadmap.title, activeRoadmap.careerGoal);
    for (const st of activeRoadmap.roadmapData.stages) {
      roadmapTexts.push(st.title);
      for (const l of st.lessons) {
        if (!l.completed) roadmapTexts.push(l.title);
      }
    }
  }
  const roadmapTokens = new Set(normalizeTokens(roadmapTexts.join(' ')));

  const candidates: DashboardRecommendationItem[] = [];

  // 1. Knowledge Gap Remediation (highest signal when student has weak topics)
  if (activeGaps.length > 0) {
    const primaryGap = activeGaps[0];
    const gapLower = primaryGap.topic.toLowerCase();

    // Check if an active roadmap lesson covers this gap topic directly
    let matchedLesson: { stageId: string; lessonId: string; title: string; stageTitle: string } | null =
      null;
    if (activeRoadmap) {
      for (const st of activeRoadmap.roadmapData.stages) {
        const hit = st.lessons.find(
          (l) =>
            l.title.toLowerCase().includes(gapLower) ||
            gapLower.includes(l.title.toLowerCase()) ||
            l.learningObjectives.some((o) => o.toLowerCase().includes(gapLower))
        );
        if (hit) {
          matchedLesson = {
            stageId: st.id,
            lessonId: hit.id,
            title: hit.title,
            stageTitle: st.title,
          };
          break;
        }
      }
    }

    candidates.push({
      id: `rec-gap-${primaryGap.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'gap_review',
      category: 'Knowledge Gap Review',
      meta: `${primaryGap.scorePercent}% on ${primaryGap.source}`,
      title: matchedLesson
        ? `Strengthen ${primaryGap.topic}: ${matchedLesson.title}`
        : `Practice Gap: ${primaryGap.topic}`,
      reason: `Flagged in your ${primaryGap.source} · tailored for ${user.knowledgeLevel} level`,
      ctaLabel: matchedLesson ? 'Review Lesson' : 'Practice',
      variant: 'yellow',
      relevanceScore: 98,
      action: matchedLesson
        ? { type: 'lesson', stageId: matchedLesson.stageId, lessonId: matchedLesson.lessonId }
        : {
            type: 'assistant',
            prompt: `Help me understand and practice "${primaryGap.topic}" (from ${primaryGap.source}) at my ${user.knowledgeLevel} level${
              primaryDirectionText || user.careerGoal
                ? ` for my direction: ${primaryDirectionText || user.careerGoal}`
                : ''
            }.`,
          },
    });
  }

  // 2. Active Learning Path Stage/Lesson Recommendation (adaptive to knowledgeLevel & goals)
  if (
    activeRoadmap &&
    roadmapStats.nextIncompleteStageId &&
    roadmapStats.nextIncompleteLessonId &&
    roadmapStats.nextIncompleteLessonTitle
  ) {
    const stageObj = activeRoadmap.roadmapData.stages.find(
      (s) => s.id === roadmapStats.nextIncompleteStageId
    );
    const lessonObj = stageObj?.lessons.find(
      (l) => l.id === roadmapStats.nextIncompleteLessonId
    );

    if (stageObj && lessonObj) {
      candidates.push({
        id: `rec-roadmap-${stageObj.id}-${lessonObj.id}`,
        kind: 'roadmap_lesson',
        category: `${activeRoadmap.title}`,
        meta: `${stageObj.difficulty} · ${lessonObj.estimatedTime || 'Lesson'}`,
        title: lessonObj.title,
        reason: `Next step in Stage ${roadmapStats.currentStageNumber}: ${stageObj.title}`,
        ctaLabel: 'Open Lesson',
        variant: 'mint',
        relevanceScore: 86,
        action: {
          type: 'lesson',
          stageId: stageObj.id,
          lessonId: lessonObj.id,
        },
      });
    }
  }

  // 3. Verified Courses & Learning Resources (from real Explore catalog, domain-isolated)
  if (explorePayload) {
    // Only use personalized forYou items when user has sufficient personalization;
    // avoid GENERAL_POPULAR_FALLBACK_IDS when personalized forYou is available.
    const pool: ExploreResourceCardItem[] =
      explorePayload.hasSufficientPersonalization && explorePayload.forYou.length > 0
        ? explorePayload.forYou
        : [];

    const scoredResources = pool
      .map((item) => {
        const { score, matchedSignals } = scoreResourceForDashboard(item, {
          primaryDirectionTokens,
          interestTokens,
          academicTokens,
          goalTokens,
          skillTokens,
          roadmapTokens,
          gapTokens,
          knowledgeLevel: user.knowledgeLevel,
        });
        return { item, score, matchedSignals };
      })
      .filter(({ score }) => score >= 18)
      .sort((a, b) => b.score - a.score);

    const seenSubjects = new Set<string>();
    for (const entry of scoredResources) {
      if (candidates.filter((c) => c.kind === 'course_resource').length >= 2) break;
      // Encourage subject variety when student has multiple distinct interests
      if (
        seenSubjects.has(entry.item.subject) &&
        scoredResources.some((other) => !seenSubjects.has(other.item.subject))
      ) {
        continue;
      }
      seenSubjects.add(entry.item.subject);

      const levelBadge = entry.item.levels.includes(user.knowledgeLevel)
        ? user.knowledgeLevel
        : entry.item.levels[0] || user.knowledgeLevel;
      const reasonText =
        entry.item.matchReason ||
        entry.matchedSignals.slice(0, 2).join(' · ') ||
        'Matched to your profile';

      candidates.push({
        id: `rec-course-${entry.item.id}`,
        kind: 'course_resource',
        category: entry.item.subjectLabel,
        meta: `${levelBadge} · ${entry.item.type}`,
        title: entry.item.title,
        reason: reasonText,
        ctaLabel: entry.item.tabCategory === 'course' ? 'Open Course' : 'Explore',
        variant: entry.item.tabCategory === 'course' ? 'peach' : 'lavender',
        relevanceScore: Math.min(95, Math.round(entry.score)),
        action: {
          type: 'resource',
          searchQuery: entry.item.title,
        },
      });
    }
  }

  // 4. Domain-matched Diagnostic Assessment (exclude subjects recently passed >= 85%)
  const { recommended: recommendedAssessments } = getRecommendedAssessmentsForUser(user);
  const latestScoreBySubject = new Map<string, number>();
  for (const att of assessmentAttempts) {
    const key = att.subject.toLowerCase();
    if (!latestScoreBySubject.has(key)) {
      latestScoreBySubject.set(key, att.scorePercent);
    }
  }

  const bestAssessmentCandidate = recommendedAssessments.find((meta) => {
    const latestScore = latestScoreBySubject.get(meta.label.toLowerCase());
    // Skip if already mastered (>= 85%)
    return latestScore === undefined || latestScore < 85;
  });

  if (bestAssessmentCandidate) {
    const latestScore = latestScoreBySubject.get(
      bestAssessmentCandidate.label.toLowerCase()
    );
    const needsRetake = latestScore !== undefined && latestScore < 75;
    candidates.push({
      id: `rec-assess-${bestAssessmentCandidate.id}`,
      kind: 'assessment',
      category: 'Skill Assessment',
      meta: needsRetake
        ? `Previous ${latestScore}% · ${user.knowledgeLevel}`
        : `${user.knowledgeLevel} calibration`,
      title: bestAssessmentCandidate.label,
      reason: needsRetake
        ? 'Re-assess to improve your earlier baseline'
        : `Aligned with ${
            primaryDirectionText ||
            user.careerGoal ||
            user.fieldOfStudy ||
            user.learningInterests[0] ||
            'your focus'
          }`,
      ctaLabel: needsRetake ? 'Retake' : 'Start',
      variant: 'pink',
      relevanceScore: needsRetake ? 88 : 74,
      action: { type: 'assessment' },
    });
  }

  // Sort strictly by relevance score, dedupe titles, and return up to maxItems
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const result: DashboardRecommendationItem[] = [];
  const seenTitles = new Set<string>();
  for (const cand of candidates) {
    if (result.length >= maxItems) break;
    const normTitle = cand.title.trim().toLowerCase();
    if (seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);
    result.push(cand);
  }

  return result;
}
