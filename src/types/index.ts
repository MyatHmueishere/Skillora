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
  preferredHoursPerDay: number;
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  currentSkills: string[];
  learningInterests: string[];
  currentStreak: number;
  totalHours: number;
  completedCoursesCount: number;
  overallProgress: number;
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

export interface ResourceItem {
  id: string;
  title: string;
  category: 'Programming' | 'Data Science' | 'AI & ML' | 'Web Development' | 'Career Prep';
  type: 'Course' | 'Video Tutorial' | 'Article' | 'Programming Exercise';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  description: string;
  author: string;
  rating: number;
  saved: boolean;
  contentPreview?: string;
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
  subject: string;
  difficulty: string;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  percentageScore: number;
  strengths: string[];
  areasToImprove: string[];
  date: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  codeSnippet?: string;
  language?: string;
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

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  iconName: string;
  unlocked: boolean;
  unlockedAt?: string;
}
