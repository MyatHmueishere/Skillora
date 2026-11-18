import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ExploreResourceCatalogEntry,
  SubjectFamily,
  SUBJECT_DETECTION_TERMS,
  containsWholeTerm,
  detectLessonSubjects,
  getExploreResourceCatalog,
  tokenize,
} from './verifiedResources';
import { verifyYouTubeVideoOEmbed } from './youtubeService';

export type ExploreResourceRelationshipTier = 'direct' | 'supporting' | 'related';

export interface ExploreResourceResponseItem {
  id: string;
  tabCategory: 'video' | 'documentation' | 'course';
  subject: SubjectFamily;
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
  forYou: ExploreResourceResponseItem[];
  continueLearning: ExploreResourceResponseItem[];
  all: ExploreResourceResponseItem[];
  videos: ExploreResourceResponseItem[];
  documentation: ExploreResourceResponseItem[];
  courses: ExploreResourceResponseItem[];
}

export interface StudentPersonalizationSignals {
  primaryDirection?: string;
  learningInterests: string[];
  careerGoal: string;
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  educationLevel?: string;
  university?: string;
  fieldOfStudy: string;
  currentSkills: string[];
  activeRoadmapTitle: string | null;
  activeRoadmapCareerGoal?: string | null;
  currentCourseTitle?: string | null;
  currentLessonTitle?: string | null;
  currentLessonText?: string;
  roadmapSubjectsText: string;
  knowledgeGaps: string[];
  lowScoreSubjects: string[];
  recentAssessmentsCount: number;
}

export class ExploreResourcesApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ExploreResourcesApiError';
    this.status = status;
    this.code = code;
  }
}

const MAX_FOR_YOU_ITEMS = 5;
const MIN_FOR_YOU_TARGET = 3;
const MAX_CONTINUE_LEARNING_ITEMS = 4;
const SERVER_CACHE_TTL_MS = 5 * 60_000;

const SUBJECT_LABELS: Record<SubjectFamily, string> = {
  css: 'CSS & Layout',
  html: 'HTML & Web Basics',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  react: 'React & Frontend',
  nodejs_backend: 'Backend & Architecture',
  sql: 'Database & SQL',
  python: 'Python',
  ai_ml: 'AI & Data Science',
  git_devops: 'Software Engineering',
  design_ux: 'UI/UX Design',
  cybersecurity: 'Cybersecurity',
  business_management: 'Business & Management',
  academic_research: 'Academic Writing & Research',
  public_speaking: 'Public Speaking & Presentations',
  geography_gis: 'Geography & GIS',
  finance_economics: 'Finance & Analytics',
  engineering: 'Engineering & Systems',
};

const INTEREST_TO_SUBJECTS: Record<string, { subjects: SubjectFamily[]; terms: string[] }> = {
  programming: {
    subjects: ['python', 'javascript', 'typescript', 'sql', 'git_devops', 'nodejs_backend'],
    terms: ['programming', 'coding', 'algorithms', 'data structures', 'python', 'javascript', 'git'],
  },
  'web development': {
    subjects: ['html', 'css', 'javascript', 'react', 'nodejs_backend', 'typescript', 'sql'],
    terms: [
      'web',
      'html',
      'css',
      'javascript',
      'react',
      'node',
      'frontend',
      'backend',
      'responsive',
      'software architecture',
    ],
  },
  'full-stack web development': {
    subjects: ['react', 'nodejs_backend', 'sql', 'javascript', 'typescript', 'css', 'html'],
    terms: ['full-stack', 'react', 'node', 'sql', 'software architecture', 'javascript', 'typescript'],
  },
  'frontend development': {
    subjects: ['html', 'css', 'javascript', 'react', 'typescript', 'design_ux'],
    terms: ['frontend', 'css', 'flexbox', 'grid', 'html', 'react', 'typescript', 'responsive', 'ui'],
  },
  'frontend developer': {
    subjects: ['html', 'css', 'javascript', 'react', 'typescript', 'design_ux'],
    terms: ['frontend', 'css', 'flexbox', 'grid', 'html', 'react', 'typescript', 'responsive', 'ui'],
  },
  'backend development': {
    subjects: ['nodejs_backend', 'python', 'sql', 'git_devops'],
    terms: ['backend', 'api', 'rest', 'node', 'express', 'fastapi', 'http', 'sql', 'database', 'software architecture'],
  },
  'backend developer': {
    subjects: ['nodejs_backend', 'python', 'sql', 'git_devops'],
    terms: ['backend', 'api', 'rest', 'node', 'express', 'fastapi', 'http', 'sql', 'database', 'software architecture'],
  },
  'full-stack developer': {
    subjects: ['react', 'nodejs_backend', 'sql', 'javascript', 'typescript', 'css', 'html'],
    terms: ['full-stack', 'react', 'node', 'express', 'sql', 'javascript', 'typescript', 'software architecture'],
  },
  'software architecture': {
    subjects: ['nodejs_backend', 'git_devops', 'sql'],
    terms: ['software architecture', 'system design', 'architecture', 'microservices', 'caching', 'patterns'],
  },
  'ai engineer': {
    subjects: ['ai_ml', 'python', 'sql'],
    terms: ['ai', 'machine learning', 'deep learning', 'pytorch', 'llm', 'python', 'scikit', 'ml', 'neural network'],
  },
  'machine learning engineer': {
    subjects: ['ai_ml', 'python', 'sql'],
    terms: ['machine learning', 'ml', 'pytorch', 'scikit', 'sklearn', 'deep learning', 'python', 'validation'],
  },
  'data analyst': {
    subjects: ['sql', 'ai_ml', 'python', 'finance_economics'],
    terms: ['data analysis', 'sql', 'pandas', 'numpy', 'excel', 'data visualization', 'statistics', 'python', 'query'],
  },
  'data scientist': {
    subjects: ['ai_ml', 'python', 'sql'],
    terms: ['data science', 'data analysis', 'machine learning', 'pandas', 'numpy', 'scikit', 'python', 'sql'],
  },
  'ai & data science': {
    subjects: ['ai_ml', 'python', 'sql'],
    terms: ['ai', 'machine learning', 'ml', 'data science', 'data analysis', 'pandas', 'pytorch', 'scikit', 'python'],
  },
  'data science': {
    subjects: ['ai_ml', 'python', 'sql'],
    terms: ['data science', 'data analysis', 'pandas', 'numpy', 'machine learning', 'sql', 'statistics'],
  },
  'ui/ux designer': {
    subjects: ['design_ux', 'css', 'html'],
    terms: ['ui/ux', 'ui', 'ux', 'figma', 'wireframe', 'mockup', 'prototype', 'accessibility', 'wcag', 'typography', 'design system'],
  },
  'ui/ux & product design': {
    subjects: ['design_ux', 'css', 'html'],
    terms: ['ui/ux', 'ui', 'ux', 'figma', 'wireframe', 'prototype', 'accessibility', 'wcag', 'design system'],
  },
  'cybersecurity specialist': {
    subjects: ['cybersecurity', 'git_devops'],
    terms: ['cybersecurity', 'security', 'owasp', 'nist', 'network security', 'authentication', 'vulnerability'],
  },
  'business & management': {
    subjects: ['business_management'],
    terms: [
      'business',
      'business management',
      'project management',
      'marketing',
      'entrepreneurship',
      'strategy',
      'leadership',
      'okr',
      'swot',
      'agile',
      'seo',
    ],
  },
  'business management': {
    subjects: ['business_management'],
    terms: [
      'business',
      'business management',
      'project management',
      'operations management',
      'entrepreneurship',
      'marketing',
      'strategy',
      'leadership',
    ],
  },
  'business manager': {
    subjects: ['business_management'],
    terms: ['business management', 'leadership', 'strategy', 'okr', 'operations management', 'stakeholder', 'swot'],
  },
  'project manager': {
    subjects: ['business_management'],
    terms: ['project management', 'agile', 'okr', 'stakeholder', 'leadership', 'operations management', 'strategy'],
  },
  'digital marketer': {
    subjects: ['business_management'],
    terms: ['digital marketing', 'marketing', 'seo', 'content', 'analytics', 'campaign', 'growth', 'swot'],
  },
  entrepreneurship: {
    subjects: ['business_management'],
    terms: ['entrepreneurship', 'mvp', 'business strategy', 'value proposition', 'business'],
  },
  marketing: {
    subjects: ['business_management'],
    terms: ['marketing', 'digital marketing', 'seo', 'brand', 'market research', 'swot'],
  },
  engineering: {
    subjects: ['engineering'],
    terms: [
      'engineering',
      'mechanical engineering',
      'electrical engineering',
      'civil engineering',
      'systems engineering',
      'systems design',
      'electronics',
      'thermodynamics',
      'circuits',
    ],
  },
  'electrical engineering': {
    subjects: ['engineering'],
    terms: [
      'electrical engineering',
      'electronics',
      'circuits',
      'circuit analysis',
      'ohm',
      'signal processing',
      'systems design',
      'power',
    ],
  },
  'engineering & systems': {
    subjects: ['engineering'],
    terms: ['engineering', 'electrical engineering', 'mechanical engineering', 'electronics', 'systems design', 'circuits'],
  },
  'design & creativity': {
    subjects: ['design_ux', 'css', 'html'],
    terms: ['design', 'ui', 'ux', 'ui/ux', 'figma', 'typography', 'accessibility', 'wcag', 'wireframe', 'css'],
  },
  'cybersecurity & it': {
    subjects: ['cybersecurity', 'git_devops'],
    terms: ['cybersecurity', 'security', 'owasp', 'nist', 'docker', 'network security', 'authentication'],
  },
  'communication & professional skills': {
    subjects: ['public_speaking', 'academic_research'],
    terms: [
      'public speaking',
      'presentation skills',
      'academic presentation',
      'presentation',
      'communication',
      'technical writing',
      'speech',
    ],
  },
  'finance & data tools': {
    subjects: ['finance_economics', 'sql'],
    terms: ['finance', 'accounting', 'economics', 'valuation', 'sql', 'data analysis'],
  },
  'languages & academic skills': {
    subjects: ['academic_research', 'public_speaking'],
    terms: [
      'academic writing',
      'research writing',
      'research methodology',
      'research design',
      'literature review',
      'academic presentation',
      'public speaking',
      'english proficiency',
      'essay',
      'citation',
      'thesis',
    ],
  },
  'geography & gis': {
    subjects: ['geography_gis'],
    terms: [
      'gis',
      'geographic information systems',
      'geography',
      'geography research',
      'spatial analysis',
      'environmental research',
      'qgis',
      'arcgis',
      'cartography',
    ],
  },
  'geography & environmental': {
    subjects: ['geography_gis'],
    terms: [
      'geography',
      'geography research',
      'geographic information systems',
      'gis',
      'spatial analysis',
      'environmental research',
      'qgis',
      'cartography',
    ],
  },
  'environmental research': {
    subjects: ['geography_gis', 'academic_research'],
    terms: ['environmental research', 'geography research', 'spatial analysis', 'gis', 'research methodology'],
  },
};

/**
 * Controlled Level 4 fallback map: strictly curated academic/professional adjacencies.
 * Never jumps to arbitrary or programming-default disciplines.
 */
const RELATED_SUBJECT_FAMILIES: Record<SubjectFamily, SubjectFamily[]> = {
  css: ['html', 'design_ux', 'react'],
  html: ['css', 'javascript', 'design_ux'],
  javascript: ['typescript', 'react', 'html', 'nodejs_backend'],
  typescript: ['javascript', 'react', 'nodejs_backend'],
  react: ['javascript', 'typescript', 'css'],
  nodejs_backend: ['sql', 'typescript', 'git_devops', 'javascript'],
  sql: ['nodejs_backend', 'python', 'finance_economics'],
  python: ['ai_ml', 'sql', 'nodejs_backend'],
  ai_ml: ['python', 'sql'],
  git_devops: ['nodejs_backend', 'cybersecurity', 'typescript'],
  design_ux: ['css', 'html'],
  cybersecurity: ['git_devops', 'nodejs_backend'],
  business_management: ['finance_economics', 'public_speaking'],
  academic_research: ['public_speaking', 'geography_gis'],
  public_speaking: ['academic_research', 'business_management'],
  geography_gis: ['academic_research'],
  finance_economics: ['business_management', 'sql'],
  engineering: ['python', 'git_devops'],
};

/**
 * Ultra-generic tokens that must NEVER alone trigger cross-domain matches.
 */
const GENERIC_STOP_TERMS = new Set([
  'skill',
  'skills',
  'improve',
  'improving',
  'proficiency',
  'development',
  'student',
  'students',
  'master',
  'masters',
  'postgraduate',
  'graduate',
  'undergraduate',
  'study',
  'studies',
  'field',
  'career',
  'goal',
  'goals',
  'learn',
  'learning',
  'course',
  'courses',
  'basic',
  'basics',
  'fundamental',
  'fundamentals',
  'introduction',
  'intro',
  'tool',
  'tools',
  'language',
  'languages',
  'and',
  'or',
  'for',
  'the',
  'with',
  'from',
  'into',
  'data',
  'analysis',
  'research',
  'academic',
  'general',
  'professional',
  'beginner',
  'intermediate',
  'advanced',
  'system',
  'systems',
  'design',
  'management',
  'science',
  'sciences',
  'environment',
]);

// Non-blocking background oEmbed status tracker for catalog YouTube videos
const brokenVideoIds = new Set<string>();
let videoVerificationWarmed = false;
let videoVerificationInFlight: Promise<void> | null = null;

export function warmCatalogYouTubeVerification(): void {
  if (videoVerificationWarmed || videoVerificationInFlight) return;
  const catalogVideos = getExploreResourceCatalog().filter(
    (entry) => entry.tabCategory === 'video' && Boolean(entry.videoId)
  );
  videoVerificationInFlight = Promise.allSettled(
    catalogVideos.map(async (video) => {
      if (!video.videoId) return;
      const result = await verifyYouTubeVideoOEmbed(video.videoId);
      if (!result.unverifiedNetworkError && (!result.valid || !result.embedAllowed)) {
        brokenVideoIds.add(video.videoId);
      }
    })
  )
    .then(() => {
      videoVerificationWarmed = true;
    })
    .finally(() => {
      videoVerificationInFlight = null;
    });
}

// Per-user server cache + in-flight deduplication for fast repeat loads and strict isolation
const exploreResponseCache = new Map<
  string,
  { expiresAt: number; payload: ExploreResourcesPayload }
>();
const exploreInFlight = new Map<string, Promise<ExploreResourcesPayload>>();

export function invalidateExploreResourcesServerCache(userId?: string): void {
  if (userId) {
    exploreResponseCache.delete(userId);
  } else {
    exploreResponseCache.clear();
  }
}

function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new ExploreResourcesApiError(
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

interface ParsedSignalBucket {
  subjects: Set<SubjectFamily>;
  terms: Set<string>;
  rawTextLower: string;
}

function parseSubjectsAndTermsFromText(textList: string[]): ParsedSignalBucket {
  const subjects = new Set<SubjectFamily>();
  const terms = new Set<string>();
  const cleanedItems = textList.map((s) => s.trim()).filter(Boolean);
  const rawTextLower = cleanedItems.join(' ').toLowerCase();

  for (const clean of cleanedItems) {
    const lower = clean.toLowerCase();

    for (const tok of tokenize(lower)) {
      if (!GENERIC_STOP_TERMS.has(tok) && tok.length >= 2) {
        terms.add(tok);
      }
    }

    // 1. Direct match against known interest/direction categories
    const mapped = INTEREST_TO_SUBJECTS[lower];
    if (mapped) {
      mapped.subjects.forEach((s) => subjects.add(s));
      mapped.terms.forEach((t) => terms.add(t));
    }

    // 2. Academic writing & research methodology
    if (
      /\b(academic writing|research writing|scholarly writing|thesis writing|dissertation|literature review|essay writing|english proficiency|research methodology|research methods|research design|academic skills)\b/i.test(
        lower
      )
    ) {
      subjects.add('academic_research');
      terms.add('academic writing');
      terms.add('research writing');
      terms.add('research methodology');
    }

    // 3. Public speaking & academic presentation
    if (
      /\b(public speaking|presentation skills|academic presentation|oral presentation|presentation|presentations|speech|rhetoric)\b/i.test(
        lower
      )
    ) {
      subjects.add('public_speaking');
      terms.add('public speaking');
      terms.add('presentation skills');
      terms.add('academic presentation');
    }

    // 4. Geography, GIS & Environmental Spatial Research
    if (
      /\b(geography|geographic|geography research|geographic information systems|geospatial|gis|qgis|arcgis|cartography|spatial analysis|remote sensing|environmental research|environmental science)\b/i.test(
        lower
      )
    ) {
      subjects.add('geography_gis');
      terms.add('geography');
      terms.add('geography research');
      terms.add('gis');
      terms.add('geographic information systems');
      if (/\benvironmental\b/i.test(lower)) {
        terms.add('environmental research');
      }
      if (/\bspatial\b/i.test(lower)) {
        terms.add('spatial analysis');
      }
    }

    // 5. Engineering & Systems (Electrical, Mechanical, Civil, Chemical, Electronics, Systems Design)
    if (
      /\b(electrical engineering|mechanical engineering|civil engineering|chemical engineering|industrial engineering|aerospace engineering|systems engineering|electronics|circuit analysis|circuits|signal processing|thermodynamics|engineering)\b/i.test(
        lower
      ) &&
      !/\bsoftware engineer/i.test(lower)
    ) {
      subjects.add('engineering');
      if (/\b(electrical|electronics|circuit|signal)\b/i.test(lower)) {
        terms.add('electrical engineering');
        terms.add('electronics');
        terms.add('circuits');
      }
      if (/\b(systems design|systems engineering)\b/i.test(lower)) {
        terms.add('systems design');
        terms.add('systems engineering');
      }
    }

    // 6. Computer Science, Full-Stack & Software Architecture
    if (/\b(computer science|software engineer|software engineering|software developer)\b/i.test(lower)) {
      subjects.add('python');
      subjects.add('javascript');
      subjects.add('typescript');
      subjects.add('sql');
      subjects.add('git_devops');
      subjects.add('nodejs_backend');
      terms.add('computer science');
      terms.add('algorithms');
    }
    if (/\b(software architecture|system design)\b/i.test(lower)) {
      subjects.add('nodejs_backend');
      subjects.add('git_devops');
      terms.add('software architecture');
      terms.add('system design');
      terms.add('architecture');
    }

    // 7. Frontend / Full-Stack / Backend / AI / UX / Cyber / Finance / Business
    if (/\b(frontend|front-end|ui engineer|web designer|css|flexbox|react)\b/i.test(lower)) {
      subjects.add('css');
      subjects.add('html');
      subjects.add('javascript');
      subjects.add('react');
    }
    if (/\b(full-stack|full stack|web developer|web dev|web development)\b/i.test(lower)) {
      subjects.add('html');
      subjects.add('css');
      subjects.add('javascript');
      subjects.add('react');
      subjects.add('nodejs_backend');
      subjects.add('sql');
    }
    if (/\b(backend|back-end|api developer|server|microservice)\b/i.test(lower)) {
      subjects.add('nodejs_backend');
      subjects.add('python');
      subjects.add('sql');
    }
    if (/\b(data scientist|data analyst|machine learning|ml engineer|ai engineer|deep learning|data engineer|ai & data)\b/i.test(lower)) {
      subjects.add('ai_ml');
      subjects.add('python');
      subjects.add('sql');
    }
    if (/\b(ux|ui\/ux|product design|graphic design|figma)\b/i.test(lower)) {
      subjects.add('design_ux');
    }
    if (/\b(cyber|security|infosec|pentest|soc analyst)\b/i.test(lower)) {
      subjects.add('cybersecurity');
    }
    if (/\b(devops|cloud|sre|platform engineer)\b/i.test(lower)) {
      subjects.add('git_devops');
    }
    if (/\b(finance|financial|accountant|investment|economics)\b/i.test(lower)) {
      subjects.add('finance_economics');
    }
    if (/\b(business|management|marketing|entrepreneur|entrepreneurship|digital marketing|seo|product manager|project management)\b/i.test(lower)) {
      subjects.add('business_management');
    }

    // 8. Whole-term detection against each SubjectFamily
    const itemTokens = new Set(tokenize(lower));
    (Object.keys(SUBJECT_DETECTION_TERMS) as SubjectFamily[]).forEach((family) => {
      // Prevent software engineering ("software engineering") from triggering hardware engineering
      if (family === 'engineering' && /\bsoftware engineer/i.test(lower) && !/\b(electrical|mechanical|civil|chemical|electronics)\b/i.test(lower)) {
        return;
      }
      // Prevent "systems design" (engineering) from colliding with "system design" (software) unless software context exists
      if (
        (family === 'nodejs_backend' || family === 'git_devops') &&
        /\bsystems design\b/i.test(lower) &&
        /\b(electrical|electronics|mechanical|hardware|engineering)\b/i.test(lower)
      ) {
        return;
      }

      if (
        SUBJECT_DETECTION_TERMS[family].some((term) =>
          containsWholeTerm(lower, itemTokens, term)
        )
      ) {
        subjects.add(family);
      }
    });
  }

  return { subjects, terms, rawTextLower };
}

function getSubdisciplinePenalty(
  entry: ExploreResourceCatalogEntry,
  bucket: ParsedSignalBucket
): number {
  const bucketText = bucket.rawTextLower;
  const entryDomains = entry.domains.join(' ').toLowerCase();

  // If student specifically studies Electrical Engineering / Electronics, penalize pure Chemical or Mechanical items
  if (
    /\b(electrical|electronics|circuits|signal)\b/.test(bucketText) &&
    !/\b(chemical|mechanical)\b/.test(bucketText) &&
    (/\bchemical engineering\b/.test(entryDomains) ||
      (entryDomains.includes('mechanical engineering') && !entryDomains.includes('electrical')))
  ) {
    return 45;
  }

  // If student studies Chemical or Mechanical engineering specifically, penalize unrelated EE-only items
  if (
    /\bmechanical engineering\b/.test(bucketText) &&
    !/\b(electrical|electronics|circuits)\b/.test(bucketText) &&
    /\belectrical engineering\b/.test(entryDomains)
  ) {
    return 35;
  }

  return 0;
}

function scoreBucketMatch(
  entry: ExploreResourceCatalogEntry,
  bucket: ParsedSignalBucket,
  allowCompatible = true
): number {
  if (bucket.subjects.size === 0 && bucket.terms.size === 0) return 0;

  let subjectScore = 0;
  const primaryMatch = bucket.subjects.has(entry.primarySubject);
  const compatibleMatch =
    allowCompatible && entry.compatibleSubjects.some((s) => bucket.subjects.has(s));

  if (primaryMatch) {
    subjectScore = 65;
  } else if (compatibleMatch) {
    subjectScore = 38;
  }

  const entryText = `${entry.title} ${entry.description} ${entry.domains.join(' ')} ${entry.keywords.join(' ')}`.toLowerCase();
  const entryTokens = new Set(tokenize(entryText));

  let specificTermHits = 0;
  for (const term of bucket.terms) {
    if (GENERIC_STOP_TERMS.has(term) || term.length < 2) continue;
    if (containsWholeTerm(entryText, entryTokens, term)) {
      specificTermHits += term.includes(' ') ? 1.6 : 1;
      if (specificTermHits >= 3.5) break;
    }
  }

  // Require real subject alignment OR very strong multi-term match (never single generic keyword match)
  if (!primaryMatch && !compatibleMatch && specificTermHits < 2.5) {
    return 0;
  }

  const termBonus = Math.min(35, Math.round(specificTermHits * 11));
  const penalty = getSubdisciplinePenalty(entry, bucket);
  return Math.max(0, Math.min(100, subjectScore + termBonus - penalty));
}

function toResponseItem(
  entry: ExploreResourceCatalogEntry,
  extra?: {
    matchReason?: string;
    relationshipTier?: ExploreResourceRelationshipTier;
    relationshipLabel?: string;
  }
): ExploreResourceResponseItem {
  return {
    id: entry.id,
    tabCategory: entry.tabCategory,
    subject: entry.primarySubject,
    subjectLabel: SUBJECT_LABELS[entry.primarySubject] ?? 'General',
    title: entry.title,
    provider: entry.provider,
    type: entry.type,
    url: entry.url,
    description: entry.description,
    levels: entry.levels,
    ...(entry.pricing ? { pricing: entry.pricing } : {}),
    ...(entry.videoId ? { videoId: entry.videoId } : {}),
    ...(entry.embedUrl ? { embedUrl: entry.embedUrl } : {}),
    ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    ...(entry.embedAllowed !== undefined ? { embedAllowed: entry.embedAllowed } : {}),
    ...(extra?.matchReason ? { matchReason: extra.matchReason } : {}),
    ...(extra?.relationshipTier ? { relationshipTier: extra.relationshipTier } : {}),
    ...(extra?.relationshipLabel ? { relationshipLabel: extra.relationshipLabel } : {}),
  };
}

/**
 * Interleaves catalog entries round-robin across SubjectFamily groups so
 * Discover More showcases diverse academic and professional disciplines
 * instead of defaulting to programming at the top.
 */
function orderBalancedMultiDiscipline(
  items: ExploreResourceResponseItem[]
): ExploreResourceResponseItem[] {
  const buckets = new Map<string, ExploreResourceResponseItem[]>();
  for (const item of items) {
    const arr = buckets.get(item.subject) ?? [];
    arr.push(item);
    buckets.set(item.subject, arr);
  }

  // Deterministic interleaved discipline order showcasing diverse fields alongside tech
  const preferredOrder: SubjectFamily[] = [
    'business_management',
    'geography_gis',
    'engineering',
    'academic_research',
    'design_ux',
    'react',
    'finance_economics',
    'public_speaking',
    'ai_ml',
    'sql',
    'cybersecurity',
    'python',
    'nodejs_backend',
    'javascript',
    'git_devops',
    'css',
    'typescript',
    'html',
  ];

  const orderedKeys = [
    ...preferredOrder.filter((k) => buckets.has(k)),
    ...Array.from(buckets.keys()).filter((k) => !preferredOrder.includes(k as SubjectFamily)),
  ];

  const result: ExploreResourceResponseItem[] = [];
  let added = true;
  let index = 0;
  while (added) {
    added = false;
    for (const key of orderedKeys) {
      const group = buckets.get(key);
      if (group && index < group.length) {
        result.push(group[index]);
        added = true;
      }
    }
    index += 1;
  }

  return result;
}

function resolvePrimaryDirection(signals: StudentPersonalizationSignals): {
  primaryDirection: string | null;
  source: 'explicit' | 'active_roadmap' | 'profile_goal' | 'unset';
} {
  const explicit = (signals.primaryDirection ?? '').trim();
  if (explicit) {
    return { primaryDirection: explicit, source: 'explicit' };
  }

  const roadmapFocus =
    (signals.activeRoadmapCareerGoal ?? '').trim() ||
    (signals.activeRoadmapTitle ?? '').trim();
  if (roadmapFocus) {
    return { primaryDirection: roadmapFocus, source: 'active_roadmap' };
  }

  const profileGoal = signals.careerGoal.trim();
  if (profileGoal) {
    return { primaryDirection: profileGoal, source: 'profile_goal' };
  }

  const field = signals.fieldOfStudy.trim();
  if (field) {
    const fieldParsed = parseSubjectsAndTermsFromText([field]);
    if (fieldParsed.subjects.size > 0) {
      return { primaryDirection: field, source: 'profile_goal' };
    }
  }

  return { primaryDirection: null, source: 'unset' };
}

function buildContinueLearningResources(
  catalog: ExploreResourceCatalogEntry[],
  signals: StudentPersonalizationSignals,
  knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced'
): ExploreResourceResponseItem[] {
  const lessonTitle = (signals.currentLessonTitle ?? '').trim();
  const lessonText = (signals.currentLessonText ?? '').trim();
  const courseTitle = (signals.currentCourseTitle ?? '').trim();
  const hasGaps = signals.knowledgeGaps.length > 0 || signals.lowScoreSubjects.length > 0;

  if (!lessonTitle && !courseTitle && !hasGaps) {
    return [];
  }

  const lessonSubjects = lessonTitle
    ? detectLessonSubjects(lessonTitle, lessonText)
    : new Set<SubjectFamily>();
  const lessonBucket = parseSubjectsAndTermsFromText(
    [lessonTitle, lessonText].filter(Boolean)
  );
  // Also merge strict detectLessonSubjects so lesson matching stays ultra-accurate
  lessonSubjects.forEach((s) => lessonBucket.subjects.add(s));

  const courseBucket = parseSubjectsAndTermsFromText(courseTitle ? [courseTitle] : []);
  const gapBucket = parseSubjectsAndTermsFromText([
    ...signals.knowledgeGaps,
    ...signals.lowScoreSubjects,
  ]);

  interface ContinueCandidate {
    entry: ExploreResourceCatalogEntry;
    score: number;
    reason: string;
    tier: ExploreResourceRelationshipTier;
    label: string;
  }

  const scored: ContinueCandidate[] = [];

  for (const entry of catalog) {
    const lessonMatch = lessonBucket.subjects.size > 0 || lessonBucket.terms.size > 0
      ? scoreBucketMatch(entry, lessonBucket, lessonSubjects.size === 0)
      : 0;
    const courseMatch = courseBucket.subjects.size > 0 || courseBucket.terms.size > 0
      ? scoreBucketMatch(entry, courseBucket, true)
      : 0;
    const gapMatch = gapBucket.subjects.size > 0 || gapBucket.terms.size > 0
      ? scoreBucketMatch(entry, gapBucket, true)
      : 0;

    // Require strong alignment with current lesson, active course, or active gap
    const bestScore = Math.max(lessonMatch * 1.15, gapMatch * 1.05, courseMatch * 0.9);
    if (bestScore < 55) continue;

    let reason = '';
    if (lessonMatch >= Math.max(courseMatch, gapMatch) && lessonTitle) {
      reason = `For current lesson: ${lessonTitle}`;
    } else if (gapMatch >= courseMatch && signals.knowledgeGaps.length > 0) {
      reason = `Addresses knowledge gap: ${signals.knowledgeGaps[0]}`;
    } else if (courseTitle) {
      reason = `Supports active course: ${courseTitle}`;
    } else if (signals.lowScoreSubjects.length > 0) {
      reason = `Reinforces ${signals.lowScoreSubjects[0]}`;
    }

    const levelBoost = entry.levels.includes(knowledgeLevel) ? 2 : 0;
    scored.push({
      entry,
      score: bestScore + levelBoost,
      reason,
      tier: 'direct',
      label: 'Directly relevant',
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: ContinueCandidate[] = [];
  const seenUrls = new Set<string>();
  const formatsSeen = new Set<'video' | 'documentation' | 'course'>();

  // Prefer format variety first across current lesson / course / gap resources
  for (const cand of scored) {
    if (selected.length >= MAX_CONTINUE_LEARNING_ITEMS) break;
    if (seenUrls.has(cand.entry.url)) continue;
    if (!formatsSeen.has(cand.entry.tabCategory) || selected.length >= 2) {
      selected.push(cand);
      seenUrls.add(cand.entry.url);
      formatsSeen.add(cand.entry.tabCategory);
    }
  }

  for (const cand of scored) {
    if (selected.length >= MAX_CONTINUE_LEARNING_ITEMS) break;
    if (seenUrls.has(cand.entry.url)) continue;
    selected.push(cand);
    seenUrls.add(cand.entry.url);
  }

  return selected.map((item) =>
    toResponseItem(item.entry, {
      matchReason: item.reason,
      relationshipTier: item.tier,
      relationshipLabel: item.label,
    })
  );
}

export function buildExploreResourcesForContext(
  signals: StudentPersonalizationSignals,
  authenticated = true
): ExploreResourcesPayload {
  // Keep oEmbed health checks warm non-blockingly and exclude any known unavailable videos
  warmCatalogYouTubeVerification();
  const rawCatalog = getExploreResourceCatalog();
  const catalog = rawCatalog.filter(
    (entry) =>
      entry.tabCategory !== 'video' ||
      (!entry.videoId || !brokenVideoIds.has(entry.videoId))
  );

  const { primaryDirection, source: primaryDirectionSource } =
    resolvePrimaryDirection(signals);

  const cleanPrimaryLower = (primaryDirection ?? '').trim().toLowerCase();
  const supportingInterests = Array.from(
    new Set([
      ...signals.learningInterests.filter(
        (i) => i.trim() && i.trim().toLowerCase() !== cleanPrimaryLower
      ),
      ...signals.currentSkills.filter(
        (s) => s.trim() && s.trim().toLowerCase() !== cleanPrimaryLower
      ),
    ])
  );

  // Build Discover More collections with balanced multi-discipline ordering (never programming-default)
  const rawAllItems = catalog.map((entry) => toResponseItem(entry));
  const allItems = orderBalancedMultiDiscipline(rawAllItems);
  const videos = allItems.filter((item) => item.tabCategory === 'video');
  const documentation = allItems.filter((item) => item.tabCategory === 'documentation');
  const courses = allItems
    .filter((item) => item.tabCategory === 'course')
    .sort((a, b) => {
      const aFree = a.pricing === 'Free' ? 0 : 1;
      const bFree = b.pricing === 'Free' ? 0 : 1;
      return aFree - bFree;
    });

  const continueLearning = authenticated
    ? buildContinueLearningResources(catalog, signals, signals.knowledgeLevel)
    : [];

  let forYou: ExploreResourceResponseItem[] = [];
  let fallbackLevelUsed: 0 | 1 | 2 | 3 | 4 = 0;
  let shortageNote: string | null = null;

  const hasReliableDirection = Boolean(authenticated && primaryDirection && primaryDirectionSource !== 'unset');

  if (hasReliableDirection && primaryDirection) {
    const primaryBucket = parseSubjectsAndTermsFromText([
      primaryDirection,
      ...(primaryDirectionSource === 'explicit' ? [] : [signals.fieldOfStudy].filter(Boolean)),
    ]);
    const lessonBucket = parseSubjectsAndTermsFromText(
      [signals.currentLessonTitle ?? '', signals.currentCourseTitle ?? ''].filter(Boolean)
    );
    const gapBucket = parseSubjectsAndTermsFromText([
      ...signals.knowledgeGaps,
      ...signals.lowScoreSubjects,
    ]);
    const supportingBucket = parseSubjectsAndTermsFromText([
      ...signals.learningInterests,
      ...signals.currentSkills,
      ...(signals.careerGoal && signals.careerGoal.trim().toLowerCase() !== cleanPrimaryLower
        ? [signals.careerGoal]
        : []),
    ]);

    interface ScoredRecommendation {
      entry: ExploreResourceCatalogEntry;
      score: number;
      tier: ExploreResourceRelationshipTier;
      label: string;
      reason: string;
    }

    const picked = new Map<string, ScoredRecommendation>();
    const pickedUrls = new Set<string>();

    const tryAdd = (cand: ScoredRecommendation, maxTotal = MAX_FOR_YOU_ITEMS): boolean => {
      if (picked.size >= maxTotal) return false;
      if (picked.has(cand.entry.id) || pickedUrls.has(cand.entry.url)) return false;
      picked.set(cand.entry.id, cand);
      pickedUrls.add(cand.entry.url);
      return true;
    };

    // Priority scoring for items strictly matching Primary Learning Direction
    const directCandidates: ScoredRecommendation[] = [];
    for (const entry of catalog) {
      const primaryMatch = scoreBucketMatch(entry, primaryBucket, true);
      if (primaryMatch < 55) continue;

      const lessonMatch = scoreBucketMatch(entry, lessonBucket, true);
      const gapMatch = scoreBucketMatch(entry, gapBucket, true);
      const supportingMatch = scoreBucketMatch(entry, supportingBucket, true);
      const levelBonus = entry.levels.includes(signals.knowledgeLevel) ? 3 : 0;

      // Priority order: (1) Current lesson/course, (2) Primary direction, (3) Gaps, (4) Supporting interests
      const combinedScore =
        primaryMatch * 1.0 +
        (lessonMatch >= 55 ? 24 : 0) +
        (gapMatch >= 55 ? 16 : 0) +
        (supportingMatch >= 55 ? 14 : 0) +
        levelBonus;

      let reason = `Supports your primary direction: ${primaryDirection}`;
      if (lessonMatch >= 60 && signals.currentLessonTitle) {
        reason = `Aligned with ${primaryDirection} & current lesson`;
      } else if (gapMatch >= 60 && signals.knowledgeGaps.length > 0) {
        reason = `Addresses "${signals.knowledgeGaps[0]}" in ${primaryDirection}`;
      } else if (supportingMatch >= 60) {
        reason = `Connects ${primaryDirection} with your supporting interests`;
      }

      directCandidates.push({
        entry,
        score: combinedScore,
        tier: 'direct',
        label: 'Directly relevant',
        reason,
      });
    }

    directCandidates.sort((a, b) => b.score - a.score);

    // Select diverse direct recommendations first (aiming for video + doc + course variety, reserving up to 2 slots if strong supporting items exist and we want supporting variety, OR filling 3-5 direct)
    const directFormatFirst = (['video', 'documentation', 'course'] as const);
    for (const fmt of directFormatFirst) {
      const topFmt = directCandidates.find(
        (c) => c.entry.tabCategory === fmt && !picked.has(c.entry.id) && !pickedUrls.has(c.entry.url)
      );
      if (topFmt) {
        tryAdd(topFmt, MAX_FOR_YOU_ITEMS);
      }
    }

    // If student also has distinct supporting interests that match verified resources,
    // weave 1-2 supporting items that strengthen the primary direction (leaving 3-4 direct + 1-2 supporting <= 5)
    const supportingCandidates: ScoredRecommendation[] = [];
    if (supportingBucket.subjects.size > 0 || supportingBucket.terms.size > 0) {
      for (const entry of catalog) {
        if (picked.has(entry.id) || pickedUrls.has(entry.url)) continue;
        const supMatch = scoreBucketMatch(entry, supportingBucket, true);
        if (supMatch < 60) continue;

        const levelBonus = entry.levels.includes(signals.knowledgeLevel) ? 3 : 0;
        const gapMatch = scoreBucketMatch(entry, gapBucket, true);
        const primaryOverlap = scoreBucketMatch(entry, primaryBucket, true);

        // Preserve accurate tier labeling if an entry also strongly matches primaryBucket
        const isPrimaryStrong = primaryOverlap >= 55;
        supportingCandidates.push({
          entry,
          score: supMatch + (primaryOverlap >= 38 ? 20 : 0) + (gapMatch >= 55 ? 12 : 0) + levelBonus,
          tier: isPrimaryStrong ? 'direct' : 'supporting',
          label: isPrimaryStrong ? 'Directly relevant' : 'Supporting interest',
          reason: isPrimaryStrong
            ? `Connects ${primaryDirection} with your supporting interests`
            : `Strengthens your direction via supporting interest`,
        });
      }
      supportingCandidates.sort((a, b) => b.score - a.score);
    }

    // Fill slot 4 with either another direct sub-topic match (encouraging distinct subjects/formats) or a top supporting match
    const directSubjectSet = new Set(Array.from(picked.values()).map((v) => v.entry.primarySubject));
    for (const cand of directCandidates) {
      if (picked.size >= 4) break;
      if (!directSubjectSet.has(cand.entry.primarySubject)) {
        if (tryAdd(cand, 4)) directSubjectSet.add(cand.entry.primarySubject);
      }
    }
    for (const cand of directCandidates) {
      if (picked.size >= (supportingCandidates.length > 0 ? 4 : MAX_FOR_YOU_ITEMS)) break;
      tryAdd(cand, supportingCandidates.length > 0 ? 4 : MAX_FOR_YOU_ITEMS);
    }

    // Add 1 strengthening supporting interest item in slot 5 (when direct >= 3) if not already picked
    if (picked.size >= MIN_FOR_YOU_TARGET && picked.size < MAX_FOR_YOU_ITEMS && supportingCandidates.length > 0) {
      const bestSupporting = supportingCandidates.find(
        (c) => !picked.has(c.entry.id) && !pickedUrls.has(c.entry.url)
      );
      if (bestSupporting) {
        tryAdd(bestSupporting, MAX_FOR_YOU_ITEMS);
      }
    }
    // Fill up to 5 with remaining direct matches if still room
    for (const cand of directCandidates) {
      if (picked.size >= MAX_FOR_YOU_ITEMS) break;
      tryAdd(cand, MAX_FOR_YOU_ITEMS);
    }

    // ---- 4-LEVEL CONTROLLED SHORTAGE FALLBACK HIERARCHY (ONLY if picked.size < 3) ----
    if (picked.size < MIN_FOR_YOU_TARGET) {
      // Level 1: Current incomplete lesson resources
      if (signals.currentLessonTitle && continueLearning.length > 0) {
        const beforeLevel1 = picked.size;
        for (const clItem of continueLearning) {
          if (picked.size >= MIN_FOR_YOU_TARGET) break;
          const catEntry = catalog.find((e) => e.id === clItem.id);
          if (catEntry) {
            tryAdd(
              {
                entry: catEntry,
                score: 52,
                tier: 'supporting',
                label: 'Supporting interest',
                reason: clItem.matchReason || `Supports your current lesson`,
              },
              MIN_FOR_YOU_TARGET
            );
          }
        }
        if (picked.size > beforeLevel1) fallbackLevelUsed = 1;
      }

      // Level 2: Broad primary direction subject/compatible subjects (when primaryBucket resolved to a subject)
      if (picked.size < MIN_FOR_YOU_TARGET && primaryBucket.subjects.size > 0) {
        const beforeLevel2 = picked.size;
        const level2Cands: ScoredRecommendation[] = [];
        for (const entry of catalog) {
          if (picked.has(entry.id) || pickedUrls.has(entry.url)) continue;
          const matchesPrimaryFamily =
            primaryBucket.subjects.has(entry.primarySubject) ||
            entry.compatibleSubjects.some((s) => primaryBucket.subjects.has(s));
          if (!matchesPrimaryFamily) continue;
          const penalty = getSubdisciplinePenalty(entry, primaryBucket);
          if (penalty > 20) continue;

          level2Cands.push({
            entry,
            score: (primaryBucket.subjects.has(entry.primarySubject) ? 50 : 40) - penalty,
            tier: 'direct',
            label: 'Directly relevant',
            reason: `Related to your primary direction: ${primaryDirection}`,
          });
        }
        level2Cands.sort((a, b) => b.score - a.score);
        for (const cand of level2Cands) {
          if (picked.size >= MIN_FOR_YOU_TARGET) break;
          tryAdd(cand, MIN_FOR_YOU_TARGET);
        }
        if (picked.size > beforeLevel2) fallbackLevelUsed = 2;
      }

      // Level 3: Selected supporting interests
      if (picked.size < MIN_FOR_YOU_TARGET && supportingCandidates.length > 0) {
        const beforeLevel3 = picked.size;
        for (const cand of supportingCandidates) {
          if (picked.size >= MIN_FOR_YOU_TARGET) break;
          tryAdd(cand, MIN_FOR_YOU_TARGET);
        }
        if (picked.size > beforeLevel3) fallbackLevelUsed = 3;
      }

      // Level 4: Closely related academic/professional topics ONLY when primary/supporting resolved to a known discipline
      if (picked.size < MIN_FOR_YOU_TARGET) {
        const seedSubjects = new Set<SubjectFamily>([
          ...primaryBucket.subjects,
          ...supportingBucket.subjects,
        ]);
        if (seedSubjects.size > 0) {
          const relatedFamilies = new Set<SubjectFamily>();
          for (const subj of seedSubjects) {
            for (const rel of RELATED_SUBJECT_FAMILIES[subj] ?? []) {
              if (!seedSubjects.has(rel)) relatedFamilies.add(rel);
            }
          }

          if (relatedFamilies.size > 0) {
            const level4Cands = catalog
              .filter(
                (entry) =>
                  !picked.has(entry.id) &&
                  !pickedUrls.has(entry.url) &&
                  relatedFamilies.has(entry.primarySubject)
              )
              .slice(0, 4);

            if (level4Cands.length > 0) {
              fallbackLevelUsed = 4;
              for (const entry of level4Cands) {
                if (picked.size >= MIN_FOR_YOU_TARGET) break;
                tryAdd(
                  {
                    entry,
                    score: 30,
                    tier: 'related',
                    label: 'Related discovery',
                    reason: `Closely related topic to complement ${primaryDirection}`,
                  },
                  MIN_FOR_YOU_TARGET
                );
              }
            }
          }
        }
      }
    }

    forYou = Array.from(picked.values()).map((item) =>
      toResponseItem(item.entry, {
        matchReason: item.reason,
        relationshipTier: item.tier,
        relationshipLabel: item.label,
      })
    );

    if (forYou.length === 0) {
      shortageNote = `No verified catalog resources currently match "${primaryDirection}". Explore related topics or browse the verified library in Discover More.`;
    } else if (forYou.length < MIN_FOR_YOU_TARGET) {
      shortageNote = `Showing ${forYou.length} verified resource${
        forYou.length === 1 ? '' : 's'
      } matching "${primaryDirection}". Additional verified matches are limited right now—use Discover More to explore broader subjects.`;
    } else if (fallbackLevelUsed >= 3) {
      shortageNote = `Direct verified resources for "${primaryDirection}" are currently limited, so we included closely aligned picks from your supporting interests and related topics.`;
    }
  }

  return {
    authenticated,
    hasSufficientPersonalization: hasReliableDirection,
    personalizationSummary: {
      primaryDirection,
      primaryDirectionSource,
      supportingInterests,
      interests: signals.learningInterests,
      careerGoal: signals.careerGoal,
      knowledgeLevel: signals.knowledgeLevel,
      activeRoadmapTitle: signals.activeRoadmapTitle,
      currentCourseTitle: signals.currentCourseTitle ?? null,
      currentLessonTitle: signals.currentLessonTitle ?? null,
      knowledgeGaps: signals.knowledgeGaps,
      shortageNote,
      fallbackLevelUsed,
    },
    forYou,
    continueLearning,
    all: allItems,
    videos,
    documentation,
    courses,
  };
}

export async function handleGetExploreResourcesRequest(params: {
  authorizationHeader?: string;
  bypassCache?: boolean;
}): Promise<ExploreResourcesPayload> {
  const authHeader = params.authorizationHeader ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return buildExploreResourcesForContext(
      {
        primaryDirection: '',
        learningInterests: [],
        careerGoal: '',
        knowledgeLevel: 'Beginner',
        fieldOfStudy: '',
        currentSkills: [],
        activeRoadmapTitle: null,
        roadmapSubjectsText: '',
        knowledgeGaps: [],
        lowScoreSubjects: [],
        recentAssessmentsCount: 0,
      },
      false
    );
  }

  const supabase = createUserScopedSupabaseClient(token);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw new ExploreResourcesApiError(
      401,
      'INVALID_SESSION',
      'Your session has expired or is invalid. Please sign in again.'
    );
  }

  const userId = user.id;

  if (!params.bypassCache) {
    const cached = exploreResponseCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

    const existingFlight = exploreInFlight.get(userId);
    if (existingFlight) {
      return existingFlight;
    }
  }

  const computePromise = (async (): Promise<ExploreResourcesPayload> => {
    const [profileRes, roadmapRes, attemptsRes, quizRes] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('learning_roadmaps')
        .select('id, title, career_goal, status, roadmap_data')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('assessment_attempts')
        .select('subject, difficulty, score_percent, strengths, knowledge_gaps, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('lesson_knowledge_checks')
        .select('lesson_title, knowledge_gaps, score, completed_at')
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(10),
    ]);

    if (profileRes.error && profileRes.error.code === '42501') {
      throw new ExploreResourcesApiError(
        403,
        'RLS_DENIED',
        'Access to student profile was denied.'
      );
    }

    const profileRow = (profileRes.data ?? {}) as Record<string, unknown>;
    const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const roadmapRow = (roadmapRes.data ?? null) as Record<string, unknown> | null;
    const roadmapData = (roadmapRow?.roadmap_data ?? {}) as Record<string, unknown>;

    const learningInterests = Array.isArray(profileRow.learning_interests)
      ? profileRow.learning_interests.filter(
          (s): s is string => typeof s === 'string' && s.trim().length > 0
        )
      : [];

    // Explicit primary direction column OR user_metadata fallback when column not yet migrated/populated
    const dbPrimaryDirection =
      typeof profileRow.primary_direction === 'string'
        ? profileRow.primary_direction.trim()
        : '';
    const metaPrimaryDirection =
      typeof userMeta.primary_direction === 'string'
        ? userMeta.primary_direction.trim()
        : '';
    const explicitPrimaryDirection = dbPrimaryDirection || metaPrimaryDirection;

    const careerGoal =
      typeof profileRow.career_goal === 'string' ? profileRow.career_goal.trim() : '';

    const knowledgeLevel: 'Beginner' | 'Intermediate' | 'Advanced' =
      profileRow.knowledge_level === 'Beginner' ||
      profileRow.knowledge_level === 'Intermediate' ||
      profileRow.knowledge_level === 'Advanced'
        ? profileRow.knowledge_level
        : 'Beginner';

    const fieldOfStudy =
      typeof profileRow.field_of_study === 'string' ? profileRow.field_of_study.trim() : '';
    const educationLevel =
      typeof profileRow.education_level === 'string' ? profileRow.education_level.trim() : '';
    const university =
      typeof profileRow.university === 'string' ? profileRow.university.trim() : '';

    const currentSkills = Array.isArray(profileRow.current_skills)
      ? profileRow.current_skills.filter(
          (s): s is string => typeof s === 'string' && s.trim().length > 0
        )
      : [];

    const activeRoadmapTitle =
      roadmapRow && typeof roadmapRow.title === 'string' && roadmapRow.title.trim()
        ? roadmapRow.title.trim()
        : null;
    const activeRoadmapCareerGoal =
      roadmapRow && typeof roadmapRow.career_goal === 'string' && roadmapRow.career_goal.trim()
        ? roadmapRow.career_goal.trim()
        : null;

    // Identify the exact active course stage and current incomplete lesson
    const rawStages = Array.isArray(roadmapData.stages) ? roadmapData.stages : [];
    let currentCourseTitle: string | null = null;
    let currentLessonTitle: string | null = null;
    let currentLessonText = '';
    const roadmapTopics: string[] = [];
    if (activeRoadmapTitle) roadmapTopics.push(activeRoadmapTitle);
    if (activeRoadmapCareerGoal) roadmapTopics.push(activeRoadmapCareerGoal);

    for (const sRaw of rawStages) {
      if (!sRaw || typeof sRaw !== 'object') continue;
      const s = sRaw as Record<string, unknown>;
      const stageTitle = typeof s.title === 'string' ? s.title.trim() : '';
      if (stageTitle) roadmapTopics.push(stageTitle);

      const lessons = Array.isArray(s.lessons) ? s.lessons : [];
      for (const lRaw of lessons) {
        if (!lRaw || typeof lRaw !== 'object') continue;
        const l = lRaw as Record<string, unknown>;
        const lTitle = typeof l.title === 'string' ? l.title.trim() : '';
        if (l.completed !== true && lTitle) {
          roadmapTopics.push(lTitle);
          if (!currentLessonTitle) {
            currentCourseTitle = stageTitle || null;
            currentLessonTitle = lTitle;
            const lDesc = typeof l.description === 'string' ? l.description.trim() : '';
            const lObj = Array.isArray(l.learningObjectives)
              ? l.learningObjectives.filter((o): o is string => typeof o === 'string').join(' ')
              : '';
            currentLessonText = [stageTitle, lDesc, lObj].filter(Boolean).join(' ');
          }
        }
      }
    }

    const attemptRows = Array.isArray(attemptsRes.data) ? attemptsRes.data : [];
    const attemptGaps: string[] = [];
    const lowScoreSubjects: string[] = [];
    for (const row of attemptRows) {
      const r = row as Record<string, unknown>;
      const score = Number(r.score_percent);
      if (!Number.isNaN(score) && score < 70 && typeof r.subject === 'string') {
        lowScoreSubjects.push(r.subject);
      }
      if (Array.isArray(r.knowledge_gaps)) {
        for (const g of r.knowledge_gaps) {
          if (typeof g === 'string' && g.trim()) attemptGaps.push(g.trim());
        }
      }
    }

    const quizRows = !quizRes.error && Array.isArray(quizRes.data) ? quizRes.data : [];
    const quizGaps: string[] = [];
    for (const row of quizRows) {
      const r = row as Record<string, unknown>;
      if (Array.isArray(r.knowledge_gaps)) {
        for (const g of r.knowledge_gaps) {
          if (typeof g === 'string' && g.trim()) quizGaps.push(g.trim());
        }
      }
    }

    const embeddedQuizGaps = Array.isArray(roadmapData.knowledgeCheckAttempts)
      ? (roadmapData.knowledgeCheckAttempts as Record<string, unknown>[]).flatMap((attempt) => {
          const gaps = attempt.knowledgeGaps ?? attempt.knowledge_gaps;
          return Array.isArray(gaps)
            ? gaps.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
            : [];
        })
      : [];

    const knowledgeGaps = Array.from(
      new Set([...quizGaps, ...embeddedQuizGaps, ...attemptGaps])
    ).slice(0, 12);

    const payload = buildExploreResourcesForContext(
      {
        primaryDirection: explicitPrimaryDirection,
        learningInterests,
        careerGoal,
        knowledgeLevel,
        educationLevel,
        university,
        fieldOfStudy,
        currentSkills,
        activeRoadmapTitle,
        activeRoadmapCareerGoal,
        currentCourseTitle,
        currentLessonTitle,
        currentLessonText,
        roadmapSubjectsText: roadmapTopics.join(' '),
        knowledgeGaps,
        lowScoreSubjects,
        recentAssessmentsCount: attemptRows.length + quizRows.length,
      },
      true
    );

    exploreResponseCache.set(userId, {
      expiresAt: Date.now() + SERVER_CACHE_TTL_MS,
      payload,
    });

    return payload;
  })().finally(() => {
    exploreInFlight.delete(userId);
  });

  exploreInFlight.set(userId, computePromise);
  return computePromise;
}
