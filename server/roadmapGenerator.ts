import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { invalidateExploreResourcesServerCache } from './exploreResourcesService';

export interface GeneratedRoadmapLesson {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  learningObjectives: string[];
  completionCriteria: string;
  completed: boolean;
}

export interface GeneratedRoadmapStage {
  id: string;
  title: string;
  description: string;
  learningObjectives: string[];
  estimatedDuration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  prerequisites: string[];
  lessons: GeneratedRoadmapLesson[];
  practiceActivities: string[];
  suggestedMiniProject: string;
  milestone: string;
  completionCriteria: string;
  status: 'upcoming' | 'in_progress' | 'completed';
}

export interface PersonalizedRoadmapData {
  title: string;
  careerGoal: string;
  primaryDirection: string;
  description: string;
  estimatedTotalDuration: string;
  personalizationExplanation: string;
  assessmentValidated: boolean;
  confirmed: boolean;
  milestones: string[];
  completionCriteria: string[];
  stages: GeneratedRoadmapStage[];
}

export interface LearningRoadmapDbRow {
  id: string;
  user_id: string;
  title: string;
  career_goal: string;
  description: string;
  source_assessment_id: string | null;
  roadmap_data: PersonalizedRoadmapData;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export class RoadmapApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RoadmapApiError';
    this.status = status;
    this.code = code;
  }
}

// Per-user in-flight lock and rate limit state (in-memory on Express server)
const inFlightByUser = new Map<string, Promise<LearningRoadmapDbRow>>();
const generationHistoryByUser = new Map<string, number[]>();

const COOLDOWN_MS = 1_500; // Short 1.5s debounce between completed generations
const WINDOW_MS = 10 * 60_000; // 10-minute sliding window
const MAX_GENERATIONS_PER_WINDOW = 15;

function enforceRateLimit(userId: string) {
  const now = Date.now();
  const timestamps = (generationHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );

  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < COOLDOWN_MS) {
    const waitSeconds = Math.ceil((COOLDOWN_MS - (now - lastTs)) / 1000);
    throw new RoadmapApiError(
      429,
      'RATE_LIMITED_COOLDOWN',
      `Please wait ${waitSeconds} seconds before generating another learning roadmap.`
    );
  }

  if (timestamps.length >= MAX_GENERATIONS_PER_WINDOW) {
    throw new RoadmapApiError(
      429,
      'RATE_LIMITED_WINDOW',
      'You have generated several roadmaps recently. Please wait a few minutes before generating another one.'
    );
  }

  generationHistoryByUser.set(userId, timestamps);
}

function recordGenerationTimestamp(userId: string) {
  const now = Date.now();
  const timestamps = (generationHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );
  timestamps.push(now);
  generationHistoryByUser.set(userId, timestamps);
}

function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new RoadmapApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase configuration is missing on the server.'
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function sanitizeTextNoUrls(text: unknown, fallback = ''): string {
  if (typeof text !== 'string') return fallback;
  const cleaned = text
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\bwww\.[^\s)]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fallback;
}

function sanitizeStringList(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const cleaned = sanitizeTextNoUrls(entry);
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      result.push(cleaned);
    }
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeDifficulty(value: unknown): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('adv')) return 'Advanced';
    if (lower.includes('beg') || lower.includes('found')) return 'Beginner';
  }
  return 'Intermediate';
}

interface SanitizedProfileContext {
  primaryDirection: string;
  careerGoal: string;
  educationLevel: string;
  fieldOfStudy: string;
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  preferredHoursPerDay: number;
  currentSkills: string[];
  learningInterests: string[];
}

interface AttemptSummaryRow {
  id: string;
  subject: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
  strengths: string[];
  knowledgeGaps: string[];
  createdAt: string;
}

interface AssessmentAnalysis {
  hasAnyAttempts: boolean;
  hasRelevantAttempts: boolean;
  sourceAssessmentId: string | null;
  relevantSubjects: string[];
  latestRelevantAttempts: AttemptSummaryRow[];
  progressionNotes: string[];
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function analyzeAssessmentsForProfile(
  attempts: AttemptSummaryRow[],
  profile: SanitizedProfileContext
): AssessmentAnalysis {
  if (attempts.length === 0) {
    return {
      hasAnyAttempts: false,
      hasRelevantAttempts: false,
      sourceAssessmentId: null,
      relevantSubjects: [],
      latestRelevantAttempts: [],
      progressionNotes: [],
    };
  }

  const profileKeywords = new Set<string>([
    ...extractKeywords(profile.primaryDirection),
    ...extractKeywords(profile.careerGoal),
    ...extractKeywords(profile.fieldOfStudy),
    ...profile.learningInterests.flatMap((item) => extractKeywords(item)),
    ...profile.currentSkills.flatMap((item) => extractKeywords(item)),
  ]);

  // Group attempts by subject (attempts are already sorted newest-first)
  const bySubject = new Map<string, AttemptSummaryRow[]>();
  for (const attempt of attempts) {
    const key = attempt.subject.trim();
    if (!key) continue;
    const list = bySubject.get(key) ?? [];
    list.push(attempt);
    bySubject.set(key, list);
  }

  // Determine relevance to careerGoal / interests / field / skills
  const scoredSubjects: { subject: string; isDirectMatch: boolean; latest: AttemptSummaryRow; all: AttemptSummaryRow[] }[] = [];

  for (const [subject, subjectAttempts] of bySubject.entries()) {
    const subjectTokens = extractKeywords(subject);
    const isDirectMatch =
      profileKeywords.size === 0 ||
      subjectTokens.some((tok) => profileKeywords.has(tok)) ||
      Array.from(profileKeywords).some((kw) => subject.toLowerCase().includes(kw));

    scoredSubjects.push({
      subject,
      isDirectMatch,
      latest: subjectAttempts[0],
      all: subjectAttempts,
    });
  }

  const directMatches = scoredSubjects.filter((item) => item.isDirectMatch);
  const relevantList = directMatches.length > 0 ? directMatches : scoredSubjects;

  const progressionNotes: string[] = [];
  for (const item of relevantList) {
    if (item.all.length >= 2) {
      const newest = item.all[0];
      const oldest = item.all[item.all.length - 1];
      const delta = newest.scorePercent - oldest.scorePercent;
      const trend =
        delta > 0
          ? `improved by +${delta}% (from ${oldest.scorePercent}% to ${newest.scorePercent}%)`
          : delta < 0
          ? `decreased by ${delta}% (from ${oldest.scorePercent}% to ${newest.scorePercent}%)`
          : `remained steady at ${newest.scorePercent}%`;
      progressionNotes.push(
        `${item.subject}: ${item.all.length} attempts, score ${trend} across ${oldest.createdAt.slice(0, 10)} to ${newest.createdAt.slice(0, 10)}.`
      );
    } else {
      progressionNotes.push(
        `${item.subject}: 1 completed attempt (${item.latest.difficulty}, ${item.latest.scorePercent}% on ${item.latest.createdAt.slice(0, 10)}).`
      );
    }
  }

  // Choose source_assessment_id strictly from the user's fetched attempts
  const sourceAssessmentId =
    directMatches.length > 0
      ? directMatches[0].latest.id
      : attempts[0]?.id ?? null;

  return {
    hasAnyAttempts: true,
    hasRelevantAttempts: directMatches.length > 0 || attempts.length > 0,
    sourceAssessmentId,
    relevantSubjects: relevantList.map((item) => item.subject),
    latestRelevantAttempts: relevantList.map((item) => item.latest).slice(0, 6),
    progressionNotes: progressionNotes.slice(0, 6),
  };
}

const ROADMAP_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Concise, motivating roadmap title tailored to the student career goal.',
    },
    careerGoal: {
      type: Type.STRING,
      description: 'Normalized career goal or learning objective for this roadmap.',
    },
    description: {
      type: Type.STRING,
      description: '2-3 sentence overview of what this personalized roadmap builds toward.',
    },
    estimatedTotalDuration: {
      type: Type.STRING,
      description: 'Realistic total duration based on preferred daily study hours (e.g. "10 weeks").',
    },
    personalizationExplanation: {
      type: Type.STRING,
      description:
        'Clear explanation of why these stages were chosen based on the student profile, study hours, and assessment strengths/gaps (or clearly stating it is provisional pending assessments).',
    },
    assessmentValidated: {
      type: Type.BOOLEAN,
      description:
        'True only if relevant skill assessment results informed this roadmap; false if provisional.',
    },
    milestones: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 clear milestone checkpoints marking progression toward the primary learning direction.',
    },
    completionCriteria: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 measurable completion criteria proving readiness in the primary learning direction.',
    },
    stages: {
      type: Type.ARRAY,
      description: 'Ordered sequence of 4 to 8 learning stages.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: 'Stable identifier such as "stage-1".',
          },
          title: {
            type: Type.STRING,
            description: 'Clear stage title.',
          },
          description: {
            type: Type.STRING,
            description: 'What the student learns and achieves in this stage.',
          },
          learningObjectives: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 4 measurable learning objectives for this stage.',
          },
          estimatedDuration: {
            type: Type.STRING,
            description: 'Estimated time to finish this stage (e.g. "2 weeks").',
          },
          difficulty: {
            type: Type.STRING,
            description: 'One of: Beginner, Intermediate, Advanced.',
          },
          prerequisites: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Realistic prerequisite concepts or prior stages.',
          },
          lessons: {
            type: Type.ARRAY,
            description: '3 to 5 cohesive, non-filler actionable lessons inside this stage (2 to 4 allowed for focused capstone stages).',
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'Stable lesson ID such as "stage-1-lesson-1".',
                },
                title: {
                  type: Type.STRING,
                  description: 'Actionable lesson title.',
                },
                description: {
                  type: Type.STRING,
                  description: 'Brief summary of what the lesson covers.',
                },
                estimatedTime: {
                  type: Type.STRING,
                  description: 'Realistic study time (e.g. "45 mins").',
                },
                learningObjectives: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '1 to 3 focused lesson objectives.',
                },
                completionCriteria: {
                  type: Type.STRING,
                  description: 'Specific measurable criterion to consider this lesson mastered.',
                },
                completed: {
                  type: Type.BOOLEAN,
                  description: 'Always false for newly generated roadmaps.',
                },
              },
              required: ['id', 'title', 'description', 'estimatedTime', 'learningObjectives', 'completionCriteria', 'completed'],
            },
          },
          practiceActivities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 3 hands-on practice activities suited to the subject domain.',
          },
          suggestedMiniProject: {
            type: Type.STRING,
            description: 'One concrete, portfolio-worthy mini-project appropriate to the domain.',
          },
          milestone: {
            type: Type.STRING,
            description: 'One tangible milestone unlocked upon finishing this stage.',
          },
          completionCriteria: {
            type: Type.STRING,
            description: 'Concrete completion criterion to pass this stage.',
          },
          status: {
            type: Type.STRING,
            description: 'Always "upcoming" initially.',
          },
        },
        required: [
          'id',
          'title',
          'description',
          'learningObjectives',
          'estimatedDuration',
          'difficulty',
          'prerequisites',
          'lessons',
          'practiceActivities',
          'suggestedMiniProject',
          'milestone',
          'completionCriteria',
          'status',
        ],
      },
    },
  },
  required: [
    'title',
    'careerGoal',
    'description',
    'estimatedTotalDuration',
    'personalizationExplanation',
    'assessmentValidated',
    'milestones',
    'completionCriteria',
    'stages',
  ],
};

function buildPromptForStudent(
  profile: SanitizedProfileContext,
  analysis: AssessmentAnalysis
): string {
  const effectiveGoal =
    profile.primaryDirection ||
    profile.careerGoal ||
    (profile.learningInterests.length > 0
      ? `Skill Mastery in ${profile.learningInterests.slice(0, 2).join(' & ')}`
      : profile.fieldOfStudy
      ? `Career Readiness in ${profile.fieldOfStudy}`
      : 'Foundational Career & Technical Skill Development');

  const levelGuidance =
    profile.knowledgeLevel === 'Advanced'
      ? '- Calibration Rule (Advanced Learner): Do NOT waste early stages on introductory tutorials or basic syntax for their listed skills. Start immediately at Intermediate/Advanced applied architecture, optimization, and capstone-level work unless diagnostic gaps require brief remediation.'
      : profile.knowledgeLevel === 'Intermediate'
      ? '- Calibration Rule (Intermediate Learner): Respect their starting level and existing skills. Skip ultra-basic novice introductions for tools/skills they already know (unless diagnostic assessment gaps show weaknesses there) and start Stage 1 at a practical bridging/Intermediate level leading into deeper specialization.'
      : '- Calibration Rule (Beginner Learner): Start with clean, logically sequenced fundamentals and build progressively toward applied projects.';

  const weeklyHours = Math.max(1, Math.round(profile.preferredHoursPerDay * 7 * 10) / 10);

  const lines: string[] = [
    'Design a personalized, comprehensive, realistic learning roadmap for the following student profile (anonymized, no PII):',
    '',
    '=== STUDENT PROFILE ===',
    `- Primary Learning Direction (Core Foundation): ${effectiveGoal}`,
    ...(profile.careerGoal &&
    profile.careerGoal.trim().toLowerCase() !== effectiveGoal.trim().toLowerCase()
      ? [`- Broader Career Goal: ${profile.careerGoal}`]
      : []),
    `- Education Background: ${profile.educationLevel || 'Not specified'}`,
    `- Field of Study: ${profile.fieldOfStudy || 'Not specified'}`,
    `- Current Knowledge Level: ${profile.knowledgeLevel}`,
    `- Preferred Study Pace: ${profile.preferredHoursPerDay} hour(s) per day (~${weeklyHours} hours/week)`,
    `- Supporting Learning Interests (secondary context only): ${profile.learningInterests.length > 0 ? profile.learningInterests.join(', ') : 'None specified'}`,
    `- Existing Skills (treat carefully alongside assessment evidence): ${
      profile.currentSkills.length > 0 ? profile.currentSkills.join(', ') : 'None listed'
    }`,
    levelGuidance,
    '',
    '=== SKILL ASSESSMENT EVIDENCE ===',
  ];

  if (!analysis.hasAnyAttempts) {
    lines.push(
      '- Assessment Status: NO skill assessments completed yet.',
      '- Instruction: Set assessmentValidated to false. Generate a provisional roadmap grounded in their primary direction, starting level, existing skills, education background, and study pace, and clearly note in personalizationExplanation that taking a skill assessment will validate and refine future stages.'
    );
  } else {
    lines.push(
      `- Assessment Status: ${analysis.latestRelevantAttempts.length} subject(s) assessed.`,
      '- Latest Subject Performance:'
    );
    for (const attempt of analysis.latestRelevantAttempts) {
      lines.push(
        `  * ${attempt.subject} (${attempt.difficulty}, ${attempt.createdAt.slice(0, 10)}): ${attempt.correctAnswers}/${attempt.totalQuestions} (${attempt.scorePercent}%)` +
          ` | Strengths: ${attempt.strengths.length > 0 ? attempt.strengths.join(', ') : 'None recorded'}` +
          ` | Knowledge Gaps: ${attempt.knowledgeGaps.length > 0 ? attempt.knowledgeGaps.join(', ') : 'None recorded'}`
      );
    }
    if (analysis.progressionNotes.length > 0) {
      lines.push('- Progression Across Attempts:');
      for (const note of analysis.progressionNotes) {
        lines.push(`  * ${note}`);
      }
    }
    lines.push(
      '- Instruction: Set assessmentValidated to true. Prioritize closing recorded knowledge gaps BEFORE advancing into complex topics, even if onboarding skills list advanced buzzwords.'
    );
  }

  lines.push(
    '',
    '=== GENERATION REQUIREMENTS ===',
    `- Anchor the entire roadmap strictly around the Primary Learning Direction ("${effectiveGoal}"). Treat supporting interests only as optional context, never replacing the primary direction.`,
    '- Support the exact domain of the student goal (e.g., AI Engineer, Data Analyst, UI/UX Designer, Frontend/Backend/Full-Stack Developer, Cybersecurity, Business/Product/Project Management, Digital Marketing, Finance, GIS, Academic Research, etc.). Do NOT default to Python unless the student goal/interests involve Python or Data/AI.',
    '- Generate between 4 and 8 logically sequenced stages progressing cleanly from their starting point through core domain pillars, applied practice, and portfolio/capstone readiness.',
    '- Each stage must include 3 to 5 focused, distinct lessons (2 to 4 allowed for focused capstone stages), realistic prerequisites referencing prior concepts/stages, 2 to 4 measurable learningObjectives, 2 to 3 domain-authentic practiceActivities, 1 realistic suggestedMiniProject, 1 concrete stage milestone, and 1 measurable completionCriteria.',
    '- Do NOT pad stages with repetitive filler lessons or repeat the same lesson scope across stages.',
    '- Every lesson must include 1 to 3 focused learningObjectives and a specific measurable completionCriteria.',
    '- Include 3 to 5 roadmap-level milestones and 3 to 5 roadmap-level completionCriteria.',
    `- Scale estimatedDuration and estimatedTotalDuration realistically around ~${weeklyHours} hours/week (${profile.preferredHoursPerDay}h/day).`,
    '- Keep all lesson.completed = false and all stage.status = "upcoming".',
    '- Never include URLs, hyperlinks, fake certificate promises, guaranteed employment claims, or promises of automatic mastery from finishing the roadmap.'
  );

  return lines.join('\n');
}

function validateAndNormalizeRoadmap(
  raw: unknown,
  profile: SanitizedProfileContext,
  analysis: AssessmentAnalysis
): PersonalizedRoadmapData {
  if (!raw || typeof raw !== 'object') {
    throw new RoadmapApiError(
      502,
      'AI_INVALID_RESPONSE',
      'The AI service returned an empty or malformed roadmap structure.'
    );
  }

  const obj = raw as Record<string, unknown>;
  const rawStages = Array.isArray(obj.stages) ? obj.stages : [];

  if (rawStages.length < 4 || rawStages.length > 8) {
    throw new RoadmapApiError(
      502,
      'AI_STAGE_COUNT_INVALID',
      'The generated roadmap did not contain the expected 4 to 8 stages. Please retry.'
    );
  }

  const stages: GeneratedRoadmapStage[] = rawStages.map((stageRaw, sIdx) => {
    const stageObj = (stageRaw && typeof stageRaw === 'object' ? stageRaw : {}) as Record<
      string,
      unknown
    >;
    const stageNum = sIdx + 1;
    const stableStageId = `stage-${stageNum}`;

    const rawLessons = Array.isArray(stageObj.lessons) ? stageObj.lessons : [];
    if (rawLessons.length === 0) {
      throw new RoadmapApiError(
        502,
        'AI_EMPTY_LESSONS',
        `Stage ${stageNum} did not include lessons. Please retry generation.`
      );
    }

    const lessons: GeneratedRoadmapLesson[] = rawLessons.slice(0, 6).map((lessonRaw, lIdx) => {
      const lessonObj = (
        lessonRaw && typeof lessonRaw === 'object' ? lessonRaw : {}
      ) as Record<string, unknown>;
      const lessonNum = lIdx + 1;
      const lessonTitle = sanitizeTextNoUrls(
        lessonObj.title,
        `Stage ${stageNum} Lesson ${lessonNum}`
      );
      const lessonDescription = sanitizeTextNoUrls(
        lessonObj.description,
        `Core study module covering ${lessonTitle}.`
      );
      const estimatedTime = sanitizeTextNoUrls(lessonObj.estimatedTime, '45 mins');
      const lessonObjectives = sanitizeStringList(lessonObj.learningObjectives, 4);
      const lessonCriteria = sanitizeTextNoUrls(
        lessonObj.completionCriteria,
        `Complete the guided exercise and pass the Knowledge Check for ${lessonTitle}.`
      );

      return {
        id: `${stableStageId}-lesson-${lessonNum}`,
        title: lessonTitle,
        description: lessonDescription,
        estimatedTime,
        learningObjectives:
          lessonObjectives.length > 0 ? lessonObjectives : [`Understand ${lessonTitle}`],
        completionCriteria: lessonCriteria,
        completed: false, // Never invent completed lessons
      };
    });

    const stageTitle = sanitizeTextNoUrls(stageObj.title, `Stage ${stageNum}`);
    const stageDescription = sanitizeTextNoUrls(
      stageObj.description,
      `Structured milestone building proficiency in ${stageTitle}.`
    );
    const learningObjectives = sanitizeStringList(stageObj.learningObjectives, 5);
    const prerequisites = sanitizeStringList(stageObj.prerequisites, 5);
    const practiceActivities = sanitizeStringList(stageObj.practiceActivities, 4);
    const stageMilestone = sanitizeTextNoUrls(
      stageObj.milestone,
      `Milestone ${stageNum}: Apply ${stageTitle} concepts in a practical deliverable.`
    );
    const stageCompletionCriteria = sanitizeTextNoUrls(
      stageObj.completionCriteria,
      `Complete all ${lessons.length} lessons and mini-project for ${stageTitle}.`
    );

    return {
      id: stableStageId,
      title: stageTitle,
      description: stageDescription,
      learningObjectives:
        learningObjectives.length > 0
          ? learningObjectives
          : [`Apply foundational concepts from ${stageTitle}`],
      estimatedDuration: sanitizeTextNoUrls(stageObj.estimatedDuration, '2 weeks'),
      difficulty: normalizeDifficulty(stageObj.difficulty),
      prerequisites,
      lessons,
      practiceActivities:
        practiceActivities.length > 0
          ? practiceActivities
          : [`Complete hands-on exercises for ${stageTitle}`],
      suggestedMiniProject: sanitizeTextNoUrls(
        stageObj.suggestedMiniProject,
        `Build a practical mini-project demonstrating ${stageTitle}.`
      ),
      milestone: stageMilestone,
      completionCriteria: stageCompletionCriteria,
      status: 'upcoming', // Always upcoming initially
    };
  });

  const fallbackGoal =
    profile.primaryDirection ||
    profile.careerGoal ||
    profile.learningInterests[0] ||
    profile.fieldOfStudy ||
    'Personalized Learning Path';

  const assessmentValidated = analysis.hasRelevantAttempts;
  const rawExplanation = sanitizeTextNoUrls(
    obj.personalizationExplanation,
    assessmentValidated
      ? 'This roadmap was tailored to your career goal, daily study pace, and skill assessment performance.'
      : 'Provisional roadmap tailored to your primary direction, starting level, and daily study pace. Complete a skill assessment to validate your baseline and refine future recommendations.'
  );

  const milestones = sanitizeStringList(obj.milestones, 6);
  const completionCriteria = sanitizeStringList(obj.completionCriteria, 6);

  const resolvedCareerGoal = sanitizeTextNoUrls(obj.careerGoal, fallbackGoal);
  const resolvedPrimaryDirection =
    profile.primaryDirection || resolvedCareerGoal || fallbackGoal;

  return {
    title: sanitizeTextNoUrls(obj.title, `${fallbackGoal} Roadmap`),
    careerGoal: resolvedCareerGoal,
    primaryDirection: resolvedPrimaryDirection,
    description: sanitizeTextNoUrls(
      obj.description,
      `A personalized ${stages.length}-stage roadmap designed for ${fallbackGoal}.`
    ),
    estimatedTotalDuration: sanitizeTextNoUrls(obj.estimatedTotalDuration, '8–12 weeks'),
    personalizationExplanation: rawExplanation,
    assessmentValidated,
    confirmed: false,
    milestones:
      milestones.length > 0
        ? milestones
        : stages.slice(0, 4).map((s) => s.milestone),
    completionCriteria:
      completionCriteria.length > 0
        ? completionCriteria
        : [
            `Complete all ${stages.length} stages tailored to ${fallbackGoal}.`,
            'Finish each stage mini-project and pass lesson knowledge checks.',
          ],
    stages,
  };
}

function stripMarkdownJsonFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function mapGeminiError(err: unknown): RoadmapApiError {
  if (err instanceof RoadmapApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown AI error');
  const lower = rawMessage.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return new RoadmapApiError(
      502,
      'GEMINI_CONFIG_ERROR',
      'The AI service key is invalid. Please check GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return new RoadmapApiError(
      502,
      'GEMINI_PERMISSION_DENIED',
      'AI roadmap generation could not be authorized. Please verify GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return new RoadmapApiError(
      429,
      'GEMINI_QUOTA_EXCEEDED',
      'The AI service is temporarily busy due to quota limits. Please wait a moment and try again.'
    );
  }
  if (
    err instanceof Error && err.name === 'AbortError' ||
    lower.includes('abort') ||
    lower.includes('timeout') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('etimedout')
  ) {
    return new RoadmapApiError(
      504,
      'GEMINI_TIMEOUT',
      'Roadmap generation took too long and timed out. Please try again.'
    );
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('network')
  ) {
    return new RoadmapApiError(
      503,
      'GEMINI_SERVICE_UNAVAILABLE',
      'The AI service is temporarily unavailable due to high demand or a network issue. Please try again in a moment.'
    );
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return new RoadmapApiError(
      502,
      'GEMINI_MODEL_UNAVAILABLE',
      'The configured AI model is temporarily unavailable. Please try again shortly.'
    );
  }
  return new RoadmapApiError(
    502,
    'GEMINI_GENERATION_FAILED',
    'We could not generate your personalized roadmap right now. Please try again in a moment.'
  );
}

async function generateWithGemini(
  profile: SanitizedProfileContext,
  analysis: AssessmentAnalysis
): Promise<PersonalizedRoadmapData> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new RoadmapApiError(
      503,
      'GEMINI_KEY_MISSING',
      'GEMINI_API_KEY is not configured on the server.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = [
    'You are Skillora’s curriculum architect AI for university students, graduates, and young professionals.',
    'Generate realistic, structured, domain-authentic personalized learning roadmaps across ANY discipline (software, AI/data, UI/UX design, business, marketing, finance, product management, languages, etc.).',
    'Strict truthfulness rules:',
    '- Never fabricate URLs, external links, accredited certificates, or guaranteed job/salary outcomes.',
    '- Never invent completed lessons or past achievements; all lessons start with completed=false and stages start with status="upcoming".',
    '- Do not assume self-reported onboarding skills equal mastery when assessment scores are missing or show gaps.',
    '- If assessment gaps exist, explicitly address those fundamentals early before progressing to advanced stages.',
    '- If no assessments have been taken, clearly mark assessmentValidated=false and explain that the roadmap is provisional.',
    '- Return strictly valid JSON conforming to the response schema.',
  ].join('\n');

  const prompt = buildPromptForStudent(profile, analysis);

  const attemptModel = async (
    model: string,
    timeoutMs: number,
    thinkingLevel: ThinkingLevel
  ): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: ROADMAP_RESPONSE_SCHEMA,
          abortSignal: controller.signal,
          thinkingConfig: { thinkingLevel },
        },
      });
      return (response.text ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  };

  let responseText = '';
  try {
    responseText = await attemptModel('gemini-4-hydrogen', 35_000, ThinkingLevel.LOW);
    if (!responseText) {
      throw new Error('EMPTY_PRIMARY_RESPONSE');
    }
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message.toLowerCase() : '';
    const isPermanent =
      msg.includes('api_key_invalid') ||
      msg.includes('api key not valid') ||
      msg.includes('permission_denied') ||
      msg.includes('invalid_argument') ||
      msg.includes('403');
    if (isPermanent) {
      throw mapGeminiError(primaryErr);
    }
    console.warn(
      '[Skillora][Roadmap] Primary model gemini-4-hydrogen fell back to gemini-3.1-flash-lite:',
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    );
    try {
      responseText = await attemptModel('gemini-3.1-flash-lite', 25_000, ThinkingLevel.MINIMAL);
    } catch (fallbackErr) {
      throw mapGeminiError(fallbackErr);
    }
  }

  if (!responseText) {
    throw new RoadmapApiError(
      502,
      'AI_EMPTY_RESPONSE',
      'The AI service returned an empty roadmap response. Please try again.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(responseText));
  } catch {
    throw new RoadmapApiError(
      502,
      'AI_JSON_PARSE_ERROR',
      'The AI service returned an unreadable response format. Please try again.'
    );
  }

  return validateAndNormalizeRoadmap(parsed, profile, analysis);
}

export async function handleGenerateRoadmapRequest(params: {
  authorizationHeader?: string;
  replaceActive?: boolean;
}): Promise<{ statusCode: number; record: LearningRoadmapDbRow }> {
  const authHeader = params.authorizationHeader?.trim() || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new RoadmapApiError(
      401,
      'MISSING_AUTH_TOKEN',
      'Please sign in with an active Skillora session to generate your roadmap.'
    );
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new RoadmapApiError(
      401,
      'INVALID_AUTH_TOKEN',
      'Missing authentication token. Please sign in again.'
    );
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  // Validate token server-side with Supabase Auth (never trust client-sent user IDs)
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new RoadmapApiError(
      401,
      'UNAUTHORIZED',
      'Your session has expired or is invalid. Please sign in again.'
    );
  }

  const authenticatedUserId = userData.user.id;

  // Coalesce concurrent requests from the same user (prevents double-click duplicate creation)
  const existingInFlight = inFlightByUser.get(authenticatedUserId);
  if (existingInFlight) {
    const record = await existingInFlight;
    return { statusCode: 200, record };
  }

  enforceRateLimit(authenticatedUserId);

  const task = (async (): Promise<LearningRoadmapDbRow> => {
    // 1. Check existing active roadmaps under RLS
    const { data: existingActiveRows, error: activeFetchError } = await supabase
      .from('learning_roadmaps')
      .select('id')
      .eq('user_id', authenticatedUserId)
      .eq('status', 'active');

    if (activeFetchError) {
      throw new RoadmapApiError(
        activeFetchError.code === '42501' ? 403 : 500,
        activeFetchError.code || 'ROADMAP_LOOKUP_FAILED',
        activeFetchError.code === '42501'
          ? 'Permission denied while checking your existing roadmaps.'
          : activeFetchError.message || 'Could not inspect existing roadmaps.'
      );
    }

    const previousActiveIds = (existingActiveRows ?? [])
      .map((row) => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (previousActiveIds.length > 0 && params.replaceActive !== true) {
      throw new RoadmapApiError(
        409,
        'ACTIVE_ROADMAP_EXISTS',
        'You already have an active learning roadmap. Please confirm before regenerating and archiving your current plan.'
      );
    }

    // 2. Fetch student_profiles & assessment_attempts server-side via authenticated user-scoped client
    const [profileResult, attemptsResult] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('*')
        .eq('id', authenticatedUserId)
        .maybeSingle(),
      supabase
        .from('assessment_attempts')
        .select(
          'id, subject, difficulty, total_questions, correct_answers, score_percent, strengths, knowledge_gaps, created_at'
        )
        .eq('user_id', authenticatedUserId)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (profileResult.error) {
      throw new RoadmapApiError(
        profileResult.error.code === '42501' ? 403 : 500,
        profileResult.error.code || 'PROFILE_FETCH_FAILED',
        'Could not load your student profile for roadmap personalization.'
      );
    }

    if (attemptsResult.error) {
      throw new RoadmapApiError(
        attemptsResult.error.code === '42501' ? 403 : 500,
        attemptsResult.error.code || 'ATTEMPTS_FETCH_FAILED',
        'Could not load your assessment history for roadmap personalization.'
      );
    }

    const profileRow = (profileResult.data ?? {}) as Record<string, unknown>;
    const userMeta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
    const dbPrimary =
      typeof profileRow.primary_direction === 'string'
        ? profileRow.primary_direction.trim()
        : '';
    const metaPrimary =
      typeof userMeta.primary_direction === 'string'
        ? userMeta.primary_direction.trim()
        : '';
    const primaryDirection = dbPrimary || metaPrimary;

    const rawHours = Number(profileRow.preferred_hours_per_day);
    const preferredHoursPerDay =
      Number.isFinite(rawHours) && rawHours > 0 ? Math.min(16, rawHours) : 2;

    // Strip all PII (no email, name, university, or user ID) before prompt construction
    const sanitizedProfile: SanitizedProfileContext = {
      primaryDirection,
      careerGoal:
        typeof profileRow.career_goal === 'string' ? profileRow.career_goal.trim() : '',
      educationLevel:
        typeof profileRow.education_level === 'string'
          ? profileRow.education_level.trim()
          : typeof userMeta.education_level === 'string'
          ? userMeta.education_level.trim()
          : '',
      fieldOfStudy:
        typeof profileRow.field_of_study === 'string'
          ? profileRow.field_of_study.trim()
          : '',
      knowledgeLevel: normalizeDifficulty(profileRow.knowledge_level),
      preferredHoursPerDay,
      currentSkills: parseStringArray(profileRow.current_skills),
      learningInterests: parseStringArray(profileRow.learning_interests),
    };

    const attempts: AttemptSummaryRow[] = (attemptsResult.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const totalQ = Number(r.total_questions) || 0;
      const correctA = Number(r.correct_answers) || 0;
      const rawScore = Number(r.score_percent);
      const scorePercent = Number.isFinite(rawScore)
        ? Math.round(rawScore)
        : totalQ > 0
        ? Math.round((correctA / totalQ) * 100)
        : 0;
      return {
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        subject: typeof r.subject === 'string' ? r.subject : 'Assessment',
        difficulty: normalizeDifficulty(r.difficulty),
        totalQuestions: totalQ,
        correctAnswers: correctA,
        scorePercent,
        strengths: parseStringArray(r.strengths),
        knowledgeGaps: parseStringArray(r.knowledge_gaps),
        createdAt:
          typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
      };
    });

    const assessmentAnalysis = analyzeAssessmentsForProfile(attempts, sanitizedProfile);

    // 3. Call Gemini on the server to produce validated structured roadmap JSON
    const roadmapData = await generateWithGemini(sanitizedProfile, assessmentAnalysis);

    // 4. Insert the NEW active roadmap FIRST (never archive/delete old roadmap before new insert succeeds)
    const nowIso = new Date().toISOString();
    const insertPayload = {
      user_id: authenticatedUserId,
      title: roadmapData.title,
      career_goal: roadmapData.careerGoal,
      description: roadmapData.description,
      source_assessment_id: assessmentAnalysis.sourceAssessmentId,
      roadmap_data: roadmapData,
      status: 'active' as const,
      updated_at: nowIso,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('learning_roadmaps')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !insertedRow) {
      throw new RoadmapApiError(
        insertError?.code === '42501' ? 403 : 500,
        insertError?.code || 'ROADMAP_INSERT_FAILED',
        insertError?.code === '42501'
          ? 'Permission denied while saving your generated roadmap to Supabase.'
          : insertError?.message || 'Failed to save your generated roadmap.'
      );
    }

    // 5. Archive previous active roadmap(s) AFTER new active roadmap insert succeeds
    if (previousActiveIds.length > 0) {
      const { error: archiveError } = await supabase
        .from('learning_roadmaps')
        .update({ status: 'archived', updated_at: nowIso })
        .eq('user_id', authenticatedUserId)
        .in('id', previousActiveIds);

      if (archiveError) {
        console.warn(
          '[Skillora] New roadmap created, but archiving previous active roadmap failed:',
          archiveError.message
        );
      }
    }

    recordGenerationTimestamp(authenticatedUserId);
    invalidateExploreResourcesServerCache(authenticatedUserId);
    return insertedRow as LearningRoadmapDbRow;
  })();

  inFlightByUser.set(authenticatedUserId, task);
  try {
    const record = await task;
    return { statusCode: 201, record };
  } finally {
    inFlightByUser.delete(authenticatedUserId);
  }
}
