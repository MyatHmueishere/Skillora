import type {
  AdaptiveRecommendationAction,
  TopicProficiencyLevel,
} from '../../shared/knowledgeCheckConfig';
import type {
  AchievementBadgeId,
  AchievementBadgeState,
  AchievementLevelInfo,
  AchievementStatsBreakdown,
  AchievementSummaryPayload,
  RecentAchievementItem,
  XpEventType,
  XpLedgerEntry,
} from '../../shared/achievementEngine';

export type { AdaptiveRecommendationAction, TopicProficiencyLevel };

export type AppView =
  | 'landing'
  | 'dashboard'
  | 'assessment'
  | 'roadmap'
  | 'resources'
  | 'assistant'
  | 'progress'
  | 'profile'
  | 'settings'
  | 'help';

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
  educationLevel: string;
  university: string;
  fieldOfStudy: string;
  careerGoal: string;
  primaryDirection?: string;
  preferredHoursPerDay: number;
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  currentSkills: string[];
  learningInterests: string[];
  currentStreak: number;
  totalHours: number;
  completedCoursesCount: number;
  overallProgress: number;
  onboardingCompleted?: boolean;
}

export interface RoadmapLesson {
  id: string;
  title: string;
  type: 'video' | 'article' | 'exercise' | 'project';
  duration: string;
  completed: boolean;
}

export interface RoadmapStage {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  estimatedDuration: string;
  status: 'completed' | 'in_progress' | 'upcoming';
  lessons: RoadmapLesson[];
  keyTopics: string[];
}

export interface GeneratedRoadmapLesson {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  learningObjectives: string[];
  completionCriteria?: string;
  completed: boolean;
  completedAt?: string | null;
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
  milestone?: string;
  completionCriteria?: string;
  status: 'upcoming' | 'in_progress' | 'completed';
}

export interface PersonalizedRoadmapData {
  title: string;
  careerGoal: string;
  primaryDirection?: string;
  description: string;
  estimatedTotalDuration: string;
  personalizationExplanation: string;
  assessmentValidated: boolean;
  confirmed?: boolean;
  milestones?: string[];
  completionCriteria?: string[];
  stages: GeneratedRoadmapStage[];
}

export interface LearningRoadmapRecord {
  id: string;
  userId: string;
  title: string;
  careerGoal: string;
  description: string;
  sourceAssessmentId: string | null;
  roadmapData: PersonalizedRoadmapData;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type VerifiedResourceType =
  | 'Official Documentation'
  | 'Free Online Course'
  | 'Educational Article'
  | 'Interactive Exercise'
  | 'Video Tutorial';

export type TrustedResourceTabCategory = 'video' | 'tutorial' | 'practice';
export type ResourceMatchScope = 'exact' | 'broader';

export interface VerifiedResource {
  id: string;
  title: string;
  provider: string;
  type: VerifiedResourceType;
  url: string;
  description: string;
}

export interface TrustedResourceItem extends VerifiedResource {
  category: TrustedResourceTabCategory;
  matchScope: ResourceMatchScope;
  learningPurpose?: string;
  videoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  embedAllowed?: boolean;
  duration?: string;
}

export interface TrustedResourcesBundle {
  videos: TrustedResourceItem[];
  tutorials: TrustedResourceItem[];
  practice: TrustedResourceItem[];
  usedBroaderFallback: boolean;
  youtubeSearchMode: 'youtube-data-api' | 'curated-oembed-verified';
  videoCoverageNote?: string;
}

export interface LessonLearnStep {
  stepNumber: number;
  title: string;
  explanation: string;
  keyPoint: string;
}

export interface LessonExample {
  title: string;
  context: string;
  explanation: string;
  codeSnippet?: string;
  language?: string;
  expectedOutput?: string;
}

export interface LessonTerminologyItem {
  term: string;
  definition: string;
}

export interface LessonCommonMistake {
  mistake: string;
  howToAvoid: string;
}

export interface LessonGuidedExercise {
  title: string;
  prompt: string;
  steps: string[];
  expectedOutcome: string;
  hint: string;
}

export interface LessonPracticeQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface GeneratedLessonContent {
  contentVersion?: number;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  lessonTitle: string;
  stageTitle: string;
  isProgrammingTopic: boolean;
  overview: string;
  personalizationNote: string;
  prerequisites?: string[];
  practicalApplications?: string[];
  keyTerminology?: LessonTerminologyItem[];
  commonMistakes?: LessonCommonMistake[];
  summary?: string;
  whatToLearnNext?: string;
  nextLessonTitle?: string;
  nextLessonStageTitle?: string;
  completionCriteria?: string;
  keyTakeaways: string[];
  learnSteps: LessonLearnStep[];
  examples: LessonExample[];
  guidedExercises: LessonGuidedExercise[];
  practiceQuestions: LessonPracticeQuestion[];
  verifiedResources: VerifiedResource[];
  trustedResources?: TrustedResourcesBundle;
  generatedAt: string;
}

export interface LessonClarificationResponse {
  answer: string;
  exampleSnippet?: string;
  exampleLanguage?: string;
}

export interface KnowledgeCheckQuestionClient {
  id: string;
  topic: string;
  objective: string;
  question: string;
  options: string[];
}

export interface KnowledgeCheckStartResponse {
  submissionId: string;
  quizToken: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  lessonTitle: string;
  questions: KnowledgeCheckQuestionClient[];
}

export interface KnowledgeCheckInstantFeedback {
  questionId: string;
  selectedOptionIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  answerExplanation: string;
  correctOptionExplanation: string;
  conceptExplanation: string;
}

export interface KnowledgeCheckAnswerDetail {
  questionId: string;
  topic: string;
  objective: string;
  question: string;
  options: string[];
  selectedOptionIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  answerExplanation: string;
  correctOptionExplanation: string;
  conceptExplanation: string;
}

export interface KnowledgeCheckTopicBreakdown {
  topic: string;
  totalQuestions: number;
  correctAnswers: number;
  accuracyPercent: number;
  proficiency: TopicProficiencyLevel;
}

export interface KnowledgeCheckAdaptiveRecommendation {
  action: AdaptiveRecommendationAction;
  title: string;
  description: string;
  thresholdsUsed: {
    advanceMinPercent: number;
    practiceMinPercent: number;
  };
  targetStageId?: string | null;
  targetLessonId?: string | null;
  targetLessonTitle?: string | null;
  focusTopics: string[];
}

export interface LessonKnowledgeCheckAttemptRecord {
  id: string;
  userId: string;
  roadmapId: string;
  stageId: string;
  lessonId: string;
  lessonTitle: string;
  submissionId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  answers: KnowledgeCheckAnswerDetail[];
  topicBreakdown: KnowledgeCheckTopicBreakdown[];
  knowledgeGaps: string[];
  recommendation: KnowledgeCheckAdaptiveRecommendation;
  completedAt: string;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  imageUrl: string;
  progressPercent?: number;
  totalLessons: number;
  completedLessons?: number;
  description: string;
  instructor?: string;
  rating: number;
}

export type ExploreResourceCategory =
  | 'Web Development'
  | 'Programming'
  | 'Python'
  | 'JavaScript'
  | 'Frontend Development'
  | 'Backend Development'
  | 'Database & SQL'
  | 'Software Engineering';

export type ExploreResourceType =
  | 'Official Documentation'
  | 'Course'
  | 'Video Tutorial'
  | 'Technical Guide'
  | 'Interactive Practice';

export interface ResourceItem {
  id: string;
  title: string;
  category: ExploreResourceCategory;
  type: ExploreResourceType;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  description: string;
  author: string;
  url: string;
  tags?: string[];
  rating?: number;
  saved: boolean;
}

export type ExploreResourceRelationshipTier = 'direct' | 'supporting' | 'related';

export interface ExploreResourceCardItem {
  id: string;
  tabCategory: 'video' | 'documentation' | 'course';
  subject: string;
  subjectLabel: string;
  title: string;
  provider: string;
  type: string;
  url: string;
  description: string;
  levels: ('Beginner' | 'Intermediate' | 'Advanced')[];
  pricing?: 'Free' | 'Free Audit / Paid Certificate' | 'Paid';
  videoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  embedAllowed?: boolean;
  matchReason?: string;
  relationshipTier?: ExploreResourceRelationshipTier;
  relationshipLabel?: string;
}

export interface ExploreResourcesPayload {
  authenticated: boolean;
  hasSufficientPersonalization: boolean;
  personalizationSummary: {
    primaryDirection: string | null;
    primaryDirectionSource: 'explicit' | 'active_roadmap' | 'profile_goal' | 'unset';
    supportingInterests: string[];
    interests: string[];
    careerGoal: string;
    knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
    activeRoadmapTitle: string | null;
    currentCourseTitle: string | null;
    currentLessonTitle: string | null;
    knowledgeGaps: string[];
    shortageNote: string | null;
    fallbackLevelUsed: 0 | 1 | 2 | 3 | 4;
  };
  forYou: ExploreResourceCardItem[];
  continueLearning: ExploreResourceCardItem[];
  all: ExploreResourceCardItem[];
  videos: ExploreResourceCardItem[];
  documentation: ExploreResourceCardItem[];
  courses: ExploreResourceCardItem[];
}

export interface AssessmentQuestion {
  id: string;
  subject: string;
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  question: string;
  codeSnippet?: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface AssessmentResult {
  id?: string;
  subject: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  percentageScore: number;
  strengths: string[];
  areasToImprove: string[];
  date: string;
}

export interface AssessmentAttemptRecord {
  id: string;
  userId: string;
  subject: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
  strengths: string[];
  knowledgeGaps: string[];
  createdAt: string;
}

export interface AssistantRecommendedResource {
  id: string;
  title: string;
  provider: string;
  type: string;
  tabCategory: 'video' | 'documentation' | 'course';
  subjectLabel: string;
  url: string;
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  activeRoadmapId?: string | null;
  activeStageId?: string | null;
  activeLessonId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  createdAt?: string;
  codeSnippet?: string;
  language?: string;
  recommendedResources?: AssistantRecommendedResource[];
  suggestedFollowUps?: string[];
  actions?: { label: string; actionType: string; payload?: string }[];
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'achievement' | 'reminder' | 'insight' | 'course';
}

export type {
  AchievementBadgeId,
  AchievementBadgeState,
  AchievementLevelInfo,
  AchievementStatsBreakdown,
  AchievementSummaryPayload,
  RecentAchievementItem,
  XpEventType,
  XpLedgerEntry,
};

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  iconName: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export type LearningSessionActivityType =
  | 'lesson_study'
  | 'knowledge_check'
  | 'assessment';

export interface LearningSessionRecord {
  id: string;
  userId: string;
  clientSessionId: string;
  roadmapId?: string | null;
  stageId?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  activityType: LearningSessionActivityType;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  completed: boolean;
}

export interface DailyStudyActivityPoint {
  dateKey: string;
  dayLabel: string;
  shortDate: string;
  minutes: number;
  sessionsCount: number;
  isToday: boolean;
}

export interface WeeklyStudyActivityPoint {
  weekKey: string;
  label: string;
  minutes: number;
  sessionsCount: number;
}

export interface LearningActivityMetrics {
  currentStreakDays: number;
  longestStreakDays: number;
  totalCompletedSessions: number;
  totalStudySeconds: number;
  totalStudyMinutes: number;
  totalStudyHoursFormatted: string;
  todaySeconds: number;
  todayMinutes: number;
  todayHoursFormatted: string;
  thisWeekSeconds: number;
  thisWeekMinutes: number;
  thisWeekHoursFormatted: string;
  thisWeekSessions: number;
  last30DaysSeconds: number;
  last30DaysHoursFormatted: string;
  activeToday: boolean;
  dailyActivity: DailyStudyActivityPoint[];
  weeklyActivity: WeeklyStudyActivityPoint[];
}

export interface AssessmentPerformanceAnalytics {
  latestDiagnosticScore: number | null;
  bestDiagnosticScore: number | null;
  averageDiagnosticScore: number | null;
  totalDiagnosticAttempts: number;
  latestKnowledgeCheckScore: number | null;
  bestKnowledgeCheckScore: number | null;
  averageKnowledgeCheckScore: number | null;
  totalKnowledgeChecks: number;
  latestOverallScore: number | null;
  bestOverallScore: number | null;
  totalAttempts: number;
  scoreImprovementDelta: number | null;
  improvementLabel: string | null;
  strongTopics: string[];
  weakTopics: string[];
}

export interface PersonalizedLearningInsight {
  id: string;
  category: 'stage_progress' | 'improvement' | 'review_topic' | 'next_step' | 'streak';
  title: string;
  description: string;
  tone: 'lavender' | 'mint' | 'yellow' | 'peach';
  actionLabel?: string;
  targetView?: AppView;
  targetStageId?: string;
  targetLessonId?: string;
}

export type InactivityTier = 'gentle_1d' | 'followup_2_3d' | 'restart_7d';

export interface NotificationPreferences {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  preferredTime: string; // HH:MM (24h)
  timezone: string; // IANA timezone, e.g. 'America/Los_Angeles'
  paused: boolean;
  pausedUntil: string | null;
  streakReminders: boolean;
  inactivityReminders: boolean;
  weeklyDigest: boolean;
  aiInsightAlerts: boolean;
  lastMeaningfulActivityAt: string | null;
  updatedAt?: string;
}

export interface PushPublicConfig {
  pushConfigured: boolean;
  vapidPublicKey: string;
  schedulerConfigured: boolean;
  serviceRoleConfigured: boolean;
}

export interface NotificationDeliveryRecord {
  id: string;
  dedupeKey: string;
  tier: string;
  channel: 'push' | 'in_app';
  title: string;
  body: string;
  targetUrl?: string | null;
  status: 'sent' | 'failed' | 'read' | 'dismissed';
  sentAt: string;
  readAt?: string | null;
}

export interface RecentLearningActivityItem {
  id: string;
  type: 'lesson_completed' | 'knowledge_check' | 'assessment' | 'study_session';
  title: string;
  subtitle: string;
  timestamp: string;
  stageId?: string | null;
  lessonId?: string | null;
  roadmapId?: string | null;
}


