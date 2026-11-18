import {
  isYouTubeDataApiConfigured,
  searchAndVerifyYouTubeVideos,
  verifyYouTubeVideoOEmbed,
} from './youtubeService';

export type VerifiedResourceType =
  | 'Official Documentation'
  | 'Free Online Course'
  | 'Educational Article'
  | 'Interactive Exercise'
  | 'Video Tutorial';

export type TrustedResourceTabCategory = 'video' | 'tutorial' | 'practice';
export type ResourceMatchScope = 'exact' | 'broader';
export type KnowledgeLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export type SubjectFamily =
  | 'css'
  | 'html'
  | 'javascript'
  | 'typescript'
  | 'react'
  | 'nodejs_backend'
  | 'sql'
  | 'python'
  | 'ai_ml'
  | 'git_devops'
  | 'design_ux'
  | 'cybersecurity'
  | 'business_management'
  | 'academic_research'
  | 'public_speaking'
  | 'geography_gis'
  | 'finance_economics'
  | 'engineering';

export interface TrustedResourceItem {
  id: string;
  category: TrustedResourceTabCategory;
  title: string;
  provider: string;
  type: VerifiedResourceType;
  url: string;
  description: string;
  matchScope: ResourceMatchScope;
  /** Distinguishes complementary roles across multiple lesson videos (e.g. Concept Explanation, Practical Demonstration) */
  learningPurpose?: string;
  /** Populated for YouTube video entries */
  videoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  embedAllowed?: boolean;
  /** Included ONLY when verified (e.g., via YouTube Data API contentDetails.duration) */
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

export interface MatchedVerifiedResource {
  id: string;
  title: string;
  provider: string;
  type: VerifiedResourceType;
  url: string;
  description: string;
}

interface CatalogEntry {
  id: string;
  category: TrustedResourceTabCategory;
  primarySubject: SubjectFamily;
  compatibleSubjects?: SubjectFamily[];
  /** Explicit conflicting terms in lesson/video matching that indicate another subject */
  excludedWhenOnlySubjects?: SubjectFamily[];
  title: string;
  provider: string;
  type: VerifiedResourceType;
  url: string;
  description: string;
  domains: string[];
  keywords: string[];
  levels?: KnowledgeLevel[];
  language?: string;
  /** Pricing indicator for external courses and programs */
  pricing?: 'Free' | 'Free Audit / Paid Certificate' | 'Paid';
  /** Marks entries featured as structured external courses/programs in Explore Resources */
  isCourseProgram?: boolean;
  /** Higher specificity helps specialized topic tutorials beat generic crash courses when both match */
  isGenericOverview?: boolean;
  videoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  embedAllowed?: boolean;
}

/**
 * Curated registry of real, verified educational resources.
 * - Every YouTube video entry was verified against youtube.com/oembed with exact title,
 *   channel name (author_name), and embeddable iframe HTML support.
 * - Durations are intentionally omitted unless verified via YouTube Data API v3.
 * - Every external website URL was verified with HTTP 200 canonical resolution.
 */
const VERIFIED_RESOURCE_CATALOG: CatalogEntry[] = [
  // ==========================================
  // 1. VERIFIED YOUTUBE EDUCATIONAL VIDEOS
  // ==========================================

  // --- CSS, Flexbox, CSS Grid & Responsive Web Design ---
  {
    id: 'yt-traversy-flexbox',
    category: 'video',
    primarySubject: 'css',
    videoId: 'JJSoEo8JSnc',
    title: 'Flexbox CSS In 20 Minutes',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=JJSoEo8JSnc',
    embedUrl: 'https://www.youtube.com/embed/JJSoEo8JSnc?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/JJSoEo8JSnc/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical CSS Flexbox walkthrough covering flex containers, direction, justify-content, align-items, wrapping, and responsive alignment.',
    domains: ['css', 'flexbox', 'responsive', 'layout'],
    keywords: [
      'css',
      'flexbox',
      'flex',
      'flex-direction',
      'justify-content',
      'align-items',
      'alignment',
      'responsive',
      'layout',
      'modern css',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-wds-css-grid',
    category: 'video',
    primarySubject: 'css',
    videoId: '9zBsdzdE4sM',
    title: 'Learn CSS Grid in 20 Minutes',
    provider: 'Web Dev Simplified',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=9zBsdzdE4sM',
    embedUrl: 'https://www.youtube.com/embed/9zBsdzdE4sM?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/9zBsdzdE4sM/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Step-by-step CSS Grid guide covering grid-template-columns, fr units, grid areas, gaps, auto-fit, and responsive two-dimensional layouts.',
    domains: ['css', 'css grid', 'grid', 'layout', 'responsive'],
    keywords: [
      'css',
      'grid',
      'css grid',
      'grid-template',
      'grid layout',
      'responsive',
      'layout',
      'modern css',
      'two-dimensional',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-traversy-css-grid',
    category: 'video',
    primarySubject: 'css',
    videoId: 'jV8B24rSN5o',
    title: 'CSS Grid Layout Crash Course',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=jV8B24rSN5o',
    embedUrl: 'https://www.youtube.com/embed/jV8B24rSN5o?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/jV8B24rSN5o/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Demonstrates CSS Grid tracks, fractions, alignment, nested grids, and combining CSS Grid with Flexbox for responsive layouts.',
    domains: ['css', 'css grid', 'grid', 'flexbox', 'layout'],
    keywords: [
      'css',
      'grid',
      'css grid',
      'flexbox',
      'grid layout',
      'responsive',
      'layout',
      'modern css',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-responsive-css',
    category: 'video',
    primarySubject: 'css',
    compatibleSubjects: ['html', 'css'],
    videoId: 'srvUrASNj0s',
    title: 'Introduction To Responsive Web Design - HTML & CSS Tutorial',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=srvUrASNj0s',
    embedUrl: 'https://www.youtube.com/embed/srvUrASNj0s?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/srvUrASNj0s/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Comprehensive CSS responsive web design guide covering mobile-first CSS, media queries, fluid units, Flexbox, and CSS Grid layouts.',
    domains: ['css', 'responsive design', 'flexbox', 'grid', 'media queries'],
    keywords: [
      'responsive design',
      'responsive web design',
      'responsive',
      'mobile-first',
      'media queries',
      'media query',
      'flexbox',
      'css grid',
      'grid',
      'css',
      'modern css',
      'layout',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-kevin-powell-responsive',
    category: 'video',
    primarySubject: 'css',
    videoId: 'VQraviuwbzU',
    title: '5 simple tips to making responsive layouts the easy way',
    provider: 'Kevin Powell',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=VQraviuwbzU',
    embedUrl: 'https://www.youtube.com/embed/VQraviuwbzU?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/VQraviuwbzU/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Modern CSS responsive design practices emphasizing mobile-first patterns, fluid widths, media queries, and avoiding rigid breakpoints.',
    domains: ['css', 'responsive design', 'layout'],
    keywords: [
      'responsive',
      'responsive design',
      'mobile-first',
      'media queries',
      'media query',
      'layout',
      'modern css',
      'css',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-kevin-powell-flexbox',
    category: 'video',
    primarySubject: 'css',
    videoId: 'u044iM9xsWU',
    title: 'Learn flexbox the easy way',
    provider: 'Kevin Powell',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=u044iM9xsWU',
    embedUrl: 'https://www.youtube.com/embed/u044iM9xsWU?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/u044iM9xsWU/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Clear mental model for CSS Flexbox covering main vs cross axes, flex-wrap, flex-grow/shrink, gaps, and responsive navigation bars.',
    domains: ['css', 'flexbox', 'layout'],
    keywords: [
      'flexbox',
      'flex',
      'alignment',
      'responsive',
      'css',
      'modern css',
      'layout',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-traversy-css',
    category: 'video',
    primarySubject: 'css',
    isGenericOverview: true,
    videoId: 'yfoY53QXEnI',
    title: 'CSS Crash Course For Absolute Beginners',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=yfoY53QXEnI',
    embedUrl: 'https://www.youtube.com/embed/yfoY53QXEnI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/yfoY53QXEnI/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Covers CSS selectors, box model, typography, positioning, flexbox layout essentials, and styling basics.',
    domains: ['css', 'styling', 'box model', 'layout'],
    keywords: [
      'css',
      'box model',
      'selector',
      'selectors',
      'styling',
      'positioning',
      'flexbox',
      'layout',
    ],
    levels: ['Beginner'],
    language: 'en',
  },

  // --- HTML ---
  {
    id: 'yt-traversy-html',
    category: 'video',
    primarySubject: 'html',
    videoId: 'UB1O30fR-EE',
    title: 'HTML Crash Course For Absolute Beginners',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=UB1O30fR-EE',
    embedUrl: 'https://www.youtube.com/embed/UB1O30fR-EE?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/UB1O30fR-EE/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Introduces HTML5 document structure, semantic tags, headings, lists, forms, tables, and web accessibility basics.',
    domains: ['html', 'html5', 'semantic', 'markup'],
    keywords: ['html', 'html5', 'semantic', 'semantic markup', 'tag', 'form', 'accessibility', 'markup'],
    levels: ['Beginner'],
    language: 'en',
  },

  // --- JavaScript ---
  {
    id: 'yt-traversy-js-crash',
    category: 'video',
    primarySubject: 'javascript',
    isGenericOverview: true,
    videoId: 'hdI2bqOjy3c',
    title: 'JavaScript Crash Course For Beginners',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=hdI2bqOjy3c',
    embedUrl: 'https://www.youtube.com/embed/hdI2bqOjy3c?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/hdI2bqOjy3c/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Covers modern JavaScript syntax, variables (let/const), data types, arrays, objects, functions, loops, conditionals, and DOM basics.',
    domains: ['javascript', 'es6', 'syntax', 'data structures'],
    keywords: [
      'javascript',
      'js',
      'modern javascript',
      'syntax',
      'variable',
      'let',
      'const',
      'array',
      'object',
      'data structure',
      'data structures',
      'function',
      'es6',
      'dom',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-js-full',
    category: 'video',
    primarySubject: 'javascript',
    videoId: 'jS4aFq5-91M',
    title: 'JavaScript Programming - Full Course',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=jS4aFq5-91M',
    embedUrl: 'https://www.youtube.com/embed/jS4aFq5-91M?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/jS4aFq5-91M/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Structured JavaScript course building from modern syntax, variables, scope, functions, arrays, and objects through interactive mini-projects.',
    domains: ['javascript', 'syntax', 'scope', 'data structures'],
    keywords: [
      'javascript',
      'js',
      'syntax',
      'scope',
      'data structure',
      'data structures',
      'array',
      'object',
      'function',
      'loop',
      'string',
      'modern javascript',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-wds-closures',
    category: 'video',
    primarySubject: 'javascript',
    videoId: '47SPG8TvUXA',
    title: 'Learn Closures In 13 Minutes',
    provider: 'Web Dev Simplified',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=47SPG8TvUXA',
    embedUrl: 'https://www.youtube.com/embed/47SPG8TvUXA?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/47SPG8TvUXA/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Visual walkthrough of JavaScript lexical scope, inner and outer functions, and how closures preserve variable references.',
    domains: ['javascript', 'scope', 'closures'],
    keywords: [
      'closure',
      'closures',
      'scope',
      'lexical scope',
      'block scope',
      'function scope',
      'javascript',
      'js',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-wds-array-methods',
    category: 'video',
    primarySubject: 'javascript',
    videoId: 'R8rmfD9Y5-c',
    title: '8 Must Know JavaScript Array Methods',
    provider: 'Web Dev Simplified',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=R8rmfD9Y5-c',
    embedUrl: 'https://www.youtube.com/embed/R8rmfD9Y5-c?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/R8rmfD9Y5-c/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Focused walkthrough of map, filter, find, reduce, some, every, forEach, and includes for transforming JavaScript array data structures.',
    domains: ['javascript', 'arrays', 'data structures'],
    keywords: [
      'array',
      'arrays',
      'array method',
      'array methods',
      'map',
      'filter',
      'reduce',
      'data structure',
      'data structures',
      'javascript',
      'modern javascript',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-traversy-async-js',
    category: 'video',
    primarySubject: 'javascript',
    videoId: 'PoRJizFvM7s',
    title: 'Async JS Crash Course - Callbacks, Promises, Async Await',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=PoRJizFvM7s',
    embedUrl: 'https://www.youtube.com/embed/PoRJizFvM7s?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/PoRJizFvM7s/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explains asynchronous JavaScript control flow step by step, comparing callbacks, Promises, Promise.all, and async/await.',
    domains: ['javascript', 'async', 'promises'],
    keywords: [
      'async',
      'await',
      'async/await',
      'promise',
      'promises',
      'callback',
      'asynchronous',
      'fetch',
      'javascript',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-wds-promises',
    category: 'video',
    primarySubject: 'javascript',
    videoId: 'DHvZLI7Db8E',
    title: 'JavaScript Promises In 10 Minutes',
    provider: 'Web Dev Simplified',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=DHvZLI7Db8E',
    embedUrl: 'https://www.youtube.com/embed/DHvZLI7Db8E?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/DHvZLI7Db8E/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Focused explanation of creating and consuming Promises with resolve, reject, .then, .catch, and chaining.',
    domains: ['javascript', 'promises', 'async'],
    keywords: ['promise', 'promises', 'then', 'catch', 'async', 'asynchronous', 'javascript'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-wds-async-await',
    category: 'video',
    primarySubject: 'javascript',
    videoId: 'V_Kr9OSfDeU',
    title: 'JavaScript Async Await',
    provider: 'Web Dev Simplified',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=V_Kr9OSfDeU',
    embedUrl: 'https://www.youtube.com/embed/V_Kr9OSfDeU?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/V_Kr9OSfDeU/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Refactors Promise chains into readable async/await functions with proper try/catch error handling.',
    domains: ['javascript', 'async', 'promises'],
    keywords: ['async', 'await', 'async/await', 'try/catch', 'error handling', 'promise', 'fetch', 'javascript'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-fireship-async',
    category: 'video',
    primarySubject: 'javascript',
    videoId: 'vn3tm0quoqE',
    title: 'The Async Await Episode I Promised',
    provider: 'Fireship',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=vn3tm0quoqE',
    embedUrl: 'https://www.youtube.com/embed/vn3tm0quoqE?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/vn3tm0quoqE/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Fast-paced breakdown of the JavaScript event loop, microtasks, Promises, and async/await concurrency patterns.',
    domains: ['javascript', 'event loop', 'async'],
    keywords: ['event loop', 'microtask', 'async', 'await', 'promise', 'concurrency', 'javascript'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- React ---
  {
    id: 'yt-mosh-react',
    category: 'video',
    primarySubject: 'react',
    videoId: 'SqcY0GlETPk',
    title: 'React Tutorial for Beginners',
    provider: 'Programming with Mosh',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=SqcY0GlETPk',
    embedUrl: 'https://www.youtube.com/embed/SqcY0GlETPk?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/SqcY0GlETPk/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Builds modern React UIs step by step using functional components, JSX, props, state, and event handling.',
    domains: ['react', 'jsx', 'components'],
    keywords: ['react', 'jsx', 'component', 'props', 'state', 'usestate', 'hook', 'hooks'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-netninja-react',
    category: 'video',
    primarySubject: 'react',
    videoId: 'j942wKiXFu8',
    title: 'Full React Tutorial #1 - Introduction',
    provider: 'Net Ninja',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=j942wKiXFu8',
    embedUrl: 'https://www.youtube.com/embed/j942wKiXFu8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/j942wKiXFu8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Introduces React component architecture, virtual DOM, project setup, and building composable web interfaces.',
    domains: ['react', 'virtual dom', 'hooks'],
    keywords: ['react', 'component', 'virtual dom', 'hooks', 'router', 'spa'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- TypeScript ---
  {
    id: 'yt-traversy-typescript',
    category: 'video',
    primarySubject: 'typescript',
    videoId: 'BCg4U1FzODs',
    title: 'TypeScript Crash Course',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=BCg4U1FzODs',
    embedUrl: 'https://www.youtube.com/embed/BCg4U1FzODs?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/BCg4U1FzODs/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Covers TypeScript compiler configuration, basic types, unions, interfaces, functions, classes, and generics.',
    domains: ['typescript', 'static typing'],
    keywords: ['typescript', 'ts', 'interface', 'generic', 'union', 'static typing', 'tsconfig'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Node.js & Express ---
  {
    id: 'yt-traversy-nodejs',
    category: 'video',
    primarySubject: 'nodejs_backend',
    videoId: 'fBNz5xF-Kx4',
    title: 'Node.js Crash Course',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=fBNz5xF-Kx4',
    embedUrl: 'https://www.youtube.com/embed/fBNz5xF-Kx4?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/fBNz5xF-Kx4/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explains Node.js core modules (fs, path, http, events), npm packages, and building an HTTP server without frameworks.',
    domains: ['node', 'nodejs', 'backend'],
    keywords: ['node', 'nodejs', 'node.js', 'npm', 'http server', 'backend', 'runtime'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-traversy-express',
    category: 'video',
    primarySubject: 'nodejs_backend',
    videoId: 'L72fhGm1tfE',
    title: 'Express JS Crash Course',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=L72fhGm1tfE',
    embedUrl: 'https://www.youtube.com/embed/L72fhGm1tfE?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/L72fhGm1tfE/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Shows how to structure Express.js routes, middleware, REST API endpoints, request parsing, and response status codes.',
    domains: ['express', 'nodejs', 'rest api', 'backend'],
    keywords: ['express', 'expressjs', 'middleware', 'route', 'routing', 'rest', 'api', 'backend', 'endpoint'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- SQL & Relational Databases ---
  {
    id: 'yt-sql-joins-joey',
    category: 'video',
    primarySubject: 'sql',
    videoId: '2HVMiPPuPIM',
    title: 'SQL Joins Tutorial for Beginners - Inner Join, Left Join, Right Join, Full Outer Join',
    provider: 'Joey Blue',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=2HVMiPPuPIM',
    embedUrl: 'https://www.youtube.com/embed/2HVMiPPuPIM?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/2HVMiPPuPIM/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Focused walkthrough of SQL relational table joins (INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN) and foreign key relationships.',
    domains: ['sql', 'sql joins', 'relational', 'database'],
    keywords: [
      'sql',
      'join',
      'joins',
      'sql joins',
      'inner join',
      'left join',
      'right join',
      'outer join',
      'relational',
      'foreign key',
      'schema',
      'schemas',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-sql',
    category: 'video',
    primarySubject: 'sql',
    videoId: 'HXV3zeQKqGY',
    title: 'SQL Tutorial - Full Database Course for Beginners',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY',
    embedUrl: 'https://www.youtube.com/embed/HXV3zeQKqGY?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/HXV3zeQKqGY/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Walks through relational database design, schemas, primary/foreign keys, SELECT queries, JOINs, and aggregations.',
    domains: ['sql', 'relational database', 'schema'],
    keywords: [
      'sql',
      'database',
      'relational',
      'relational schema',
      'relational schemas',
      'table',
      'schema',
      'schemas',
      'join',
      'joins',
      'query',
      'postgres',
      'postgresql',
      'foreign key',
      'primary key',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-mosh-sql',
    category: 'video',
    primarySubject: 'sql',
    isGenericOverview: true,
    videoId: '7S_tz1z_5bA',
    title: 'SQL Course for Beginners [Full Course]',
    provider: 'Programming with Mosh',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=7S_tz1z_5bA',
    embedUrl: 'https://www.youtube.com/embed/7S_tz1z_5bA?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/7S_tz1z_5bA/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Structured SQL tutorial covering SELECT, WHERE, ORDER BY, INNER/OUTER JOINs, and relational table queries.',
    domains: ['sql', 'database', 'relational'],
    keywords: ['sql', 'database', 'relational', 'join', 'joins', 'select', 'query'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Git & Docker ---
  {
    id: 'yt-fcc-git',
    category: 'video',
    primarySubject: 'git_devops',
    videoId: 'RGOj5yH7evk',
    title: 'Git and GitHub for Beginners - Crash Course',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=RGOj5yH7evk',
    embedUrl: 'https://www.youtube.com/embed/RGOj5yH7evk?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/RGOj5yH7evk/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Teaches Git initialization, staging, commits, branching, merging, resolving conflicts, and pull request workflows on GitHub.',
    domains: ['git', 'github', 'version control'],
    keywords: ['git', 'github', 'version control', 'branch', 'merge', 'commit', 'pull request', 'repository'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-docker',
    category: 'video',
    primarySubject: 'git_devops',
    videoId: 'fqMOX6JJhGo',
    title: 'Docker Tutorial for Beginners - A Full DevOps Course on How to Run Applications in Containers',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=fqMOX6JJhGo',
    embedUrl: 'https://www.youtube.com/embed/fqMOX6JJhGo?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/fqMOX6JJhGo/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explains containers vs VMs, Docker images, Dockerfiles, networking, volumes, and multi-service Docker Compose workflows.',
    domains: ['docker', 'devops', 'containers'],
    keywords: ['docker', 'container', 'dockerfile', 'compose', 'deployment', 'devops', 'ci/cd', 'kubernetes'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Python ---
  {
    id: 'yt-fcc-python',
    category: 'video',
    primarySubject: 'python',
    videoId: 'rfscVS0vtbw',
    title: 'Learn Python - Full Course for Beginners [Tutorial]',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=rfscVS0vtbw',
    embedUrl: 'https://www.youtube.com/embed/rfscVS0vtbw?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/rfscVS0vtbw/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Complete Python fundamentals covering variables, strings, lists, tuples, dictionaries, functions, loops, and classes.',
    domains: ['python', 'python fundamentals'],
    keywords: [
      'python',
      'python fundamentals',
      'syntax',
      'variable',
      'list',
      'tuple',
      'dictionary',
      'data structures',
      'function',
      'functions',
      'class',
      'oop',
      'loop',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-mosh-python-1hr',
    category: 'video',
    primarySubject: 'python',
    videoId: 'kqtD5dpn9C8',
    title: 'Python for Beginners - Learn Coding with Python in 1 Hour',
    provider: 'Programming with Mosh',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
    embedUrl: 'https://www.youtube.com/embed/kqtD5dpn9C8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/kqtD5dpn9C8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Concise Python syntax and fundamentals tutorial covering variables, strings, lists, tuples, conditionals, loops, and functions.',
    domains: ['python', 'python fundamentals'],
    keywords: [
      'python',
      'python fundamentals',
      'syntax',
      'variable',
      'list',
      'tuple',
      'loop',
      'function',
      'functions',
      'conditionals',
    ],
    levels: ['Beginner'],
    language: 'en',
  },

  // --- AI, Machine Learning & Data Analysis ---
  {
    id: 'yt-fcc-ml-everybody',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'i_LwzRVP7bg',
    title: 'Machine Learning for Everybody – Full Course',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=i_LwzRVP7bg',
    embedUrl: 'https://www.youtube.com/embed/i_LwzRVP7bg?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/i_LwzRVP7bg/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Accessible introduction to supervised and unsupervised machine learning, classification, regression, neural networks, and model evaluation.',
    domains: ['ai', 'machine learning', 'data science'],
    keywords: [
      'machine learning',
      'ml',
      'ai',
      'data science',
      'supervised learning',
      'classification',
      'regression',
      'neural network',
      'python',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-data-analysis-python',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'r-uOLxNrNk8',
    title: 'Data Analysis with Python - Full Course for Beginners (Numpy, Pandas, Matplotlib, Seaborn)',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=r-uOLxNrNk8',
    embedUrl: 'https://www.youtube.com/embed/r-uOLxNrNk8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/r-uOLxNrNk8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Hands-on data analysis workflow using Python, NumPy, Pandas DataFrames, data cleaning, and statistical visualization.',
    domains: ['data science', 'data analysis', 'python', 'ai'],
    keywords: [
      'data analysis',
      'data science',
      'pandas',
      'numpy',
      'matplotlib',
      'python',
      'statistics',
      'ai',
      'visualization',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- UI/UX Design & Figma ---
  {
    id: 'yt-fcc-uiux-figma',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: 'c9Wg6Cb_YlU',
    title: 'UI / UX Design Tutorial – Wireframe, Mockup & Design in Figma',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=c9Wg6Cb_YlU',
    embedUrl: 'https://www.youtube.com/embed/c9Wg6Cb_YlU?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/c9Wg6Cb_YlU/hqdefault.jpg',
    embedAllowed: true,
    description:
      'End-to-end UI/UX product design walkthrough covering visual hierarchy, typography, wireframing, mockups, and prototyping in Figma.',
    domains: ['ui/ux', 'design', 'figma'],
    keywords: [
      'ui',
      'ux',
      'ui/ux',
      'design',
      'figma',
      'wireframe',
      'mockup',
      'prototype',
      'typography',
      'visual design',
      'creativity',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-ajsmart-figma',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: 'FTFaQWZBqQ8',
    title: 'Figma UI Design Tutorial: Get Started in Just 24 Minutes!',
    provider: 'AJ&Smart',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=FTFaQWZBqQ8',
    embedUrl: 'https://www.youtube.com/embed/FTFaQWZBqQ8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/FTFaQWZBqQ8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical introduction to Figma frames, components, layout grids, and rapid interface prototyping.',
    domains: ['figma', 'ui/ux', 'design'],
    keywords: ['figma', 'ui', 'ux', 'design', 'prototype', 'components', 'layout'],
    levels: ['Beginner'],
    language: 'en',
  },

  // --- Cybersecurity ---
  {
    id: 'yt-simplilearn-cybersecurity',
    category: 'video',
    primarySubject: 'cybersecurity',
    videoId: 'inWWhr5tnEA',
    title: 'What Is Cyber Security | How It Works? | Cyber Security In 7 Minutes | Cyber Security | Simplilearn',
    provider: 'Simplilearn',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=inWWhr5tnEA',
    embedUrl: 'https://www.youtube.com/embed/inWWhr5tnEA?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/inWWhr5tnEA/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Clear overview of cybersecurity fundamentals, common threat vectors, defensive controls, and security hygiene.',
    domains: ['cybersecurity', 'security', 'it'],
    keywords: ['cybersecurity', 'security', 'network security', 'threats', 'it', 'defense', 'authentication'],
    levels: ['Beginner'],
    language: 'en',
  },
  {
    id: 'yt-mycs-cybersecurity',
    category: 'video',
    primarySubject: 'cybersecurity',
    videoId: 'U_P23SqJaDc',
    title: 'Cyber Security Full Course for Beginner',
    provider: 'My CS',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=U_P23SqJaDc',
    embedUrl: 'https://www.youtube.com/embed/U_P23SqJaDc?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/U_P23SqJaDc/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Detailed cybersecurity beginner curriculum covering threats, malware, cryptography, network security, and defensive operations.',
    domains: ['cybersecurity', 'security', 'network security'],
    keywords: ['cybersecurity', 'security', 'network security', 'cryptography', 'malware', 'defense', 'authentication'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-crashcourse-cybersecurity',
    category: 'video',
    primarySubject: 'cybersecurity',
    videoId: 'bPVaOlJ6ln0',
    title: 'Cybersecurity: Crash Course Computer Science #31',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=bPVaOlJ6ln0',
    embedUrl: 'https://www.youtube.com/embed/bPVaOlJ6ln0?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/bPVaOlJ6ln0/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Conceptual walkthrough of threat modeling, authentication, privilege isolation, access control, and security engineering.',
    domains: ['cybersecurity', 'security', 'authentication'],
    keywords: ['cybersecurity', 'security', 'authentication', 'access control', 'vulnerability', 'threat'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Expanded Verified Videos: Python, AI Engineering, Data Analytics, SQL, UI/UX, React, TS, Node, Git ---
  {
    id: 'yt-mosh-python-full',
    category: 'video',
    primarySubject: 'python',
    isGenericOverview: true,
    videoId: '_uQrJ0TkZlc',
    title: 'Python Full Course for Beginners',
    provider: 'Programming with Mosh',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=_uQrJ0TkZlc',
    embedUrl: 'https://www.youtube.com/embed/_uQrJ0TkZlc?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/_uQrJ0TkZlc/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Hands-on Python walkthrough covering variables, strings, lists, dictionaries, functions, OOP classes, modules, and automation projects.',
    domains: ['python', 'python fundamentals', 'oop'],
    keywords: ['python', 'variables', 'strings', 'lists', 'dictionaries', 'functions', 'loops', 'oop', 'classes', 'modules'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-python-intermediate',
    category: 'video',
    primarySubject: 'python',
    videoId: 'HGOBQPFzWKo',
    title: 'Intermediate Python Programming Course',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=HGOBQPFzWKo',
    embedUrl: 'https://www.youtube.com/embed/HGOBQPFzWKo?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/HGOBQPFzWKo/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Intermediate Python deep dive covering collections, lambda functions, exceptions, decorators, generators, logging, and threading.',
    domains: ['python', 'intermediate python', 'software engineering'],
    keywords: ['python', 'intermediate python', 'decorators', 'generators', 'collections', 'exceptions', 'logging', 'lambda', 'data structures'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-fcc-python-everybody',
    category: 'video',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'sql', 'ai_ml'],
    isGenericOverview: true,
    videoId: '8DvywoWv6fI',
    title: 'Python for Everybody - Full University Python Course',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=8DvywoWv6fI',
    embedUrl: 'https://www.youtube.com/embed/8DvywoWv6fI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/8DvywoWv6fI/hqdefault.jpg',
    embedAllowed: true,
    description:
      'University Python curriculum covering data structures, files, regular expressions, web APIs, JSON parsing, and databases with Python.',
    domains: ['python', 'apis', 'data'],
    keywords: ['python', 'files', 'json', 'api', 'data structures', 'database', 'sql', 'regex'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-3b1b-neural-networks',
    category: 'video',
    primarySubject: 'ai_ml',
    videoId: 'aircAruvnKk',
    title: 'But what is a neural network? | Deep learning chapter 1',
    provider: '3Blue1Brown',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=aircAruvnKk',
    embedUrl: 'https://www.youtube.com/embed/aircAruvnKk?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Visual conceptual intuition for neurons, layers, weights, biases, activation functions, and deep neural network representations.',
    domains: ['ai', 'deep learning', 'neural networks'],
    keywords: ['neural network', 'neural networks', 'deep learning', 'ai', 'weights', 'layers', 'activation', 'ai engineer'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-3b1b-gradient-descent',
    category: 'video',
    primarySubject: 'ai_ml',
    videoId: 'IHZwWFHWa-w',
    title: 'Gradient descent, how neural networks learn | Deep Learning Chapter 2',
    provider: '3Blue1Brown',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=IHZwWFHWa-w',
    embedUrl: 'https://www.youtube.com/embed/IHZwWFHWa-w?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/IHZwWFHWa-w/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Visual explanation of loss/cost functions, gradient vectors, learning rates, optimization, and how neural models learn from data.',
    domains: ['ai', 'deep learning', 'machine learning', 'optimization'],
    keywords: ['gradient descent', 'loss function', 'optimization', 'deep learning', 'neural network', 'machine learning', 'ai', 'training'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-karpathy-micrograd',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'VMj-3S1tku0',
    title: 'The spelled-out intro to neural networks and backpropagation: building micrograd',
    provider: 'Andrej Karpathy',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=VMj-3S1tku0',
    embedUrl: 'https://www.youtube.com/embed/VMj-3S1tku0?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/VMj-3S1tku0/hqdefault.jpg',
    embedAllowed: true,
    description:
      'From-scratch Python build of automatic differentiation (autograd), backpropagation, and a minimal neural network training loop.',
    domains: ['ai', 'deep learning', 'backpropagation', 'pytorch'],
    keywords: ['backpropagation', 'autograd', 'neural network', 'deep learning', 'python', 'pytorch', 'gradient', 'ai engineer'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-karpathy-intro-llms',
    category: 'video',
    primarySubject: 'ai_ml',
    videoId: 'zjkBMFhNj_g',
    title: '[1hr Talk] Intro to Large Language Models',
    provider: 'Andrej Karpathy',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
    embedUrl: 'https://www.youtube.com/embed/zjkBMFhNj_g?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/zjkBMFhNj_g/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Clear systems overview of how LLMs are pre-trained, fine-tuned, aligned, tool-augmented, and deployed safely in AI engineering workflows.',
    domains: ['ai', 'llm', 'ai engineering', 'generative ai'],
    keywords: ['llm', 'large language model', 'generative ai', 'prompt engineering', 'rag', 'fine-tuning', 'ai engineer', 'ai', 'transformer'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-karpathy-build-gpt',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'kCc8FmEb1nY',
    title: "Let's build GPT: from scratch, in code, spelled out.",
    provider: 'Andrej Karpathy',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=kCc8FmEb1nY',
    embedUrl: 'https://www.youtube.com/embed/kCc8FmEb1nY?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/kCc8FmEb1nY/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Step-by-step PyTorch implementation of tokenization, embeddings, self-attention, multi-head transformers, and autoregressive text generation.',
    domains: ['ai', 'transformers', 'llm', 'pytorch'],
    keywords: ['gpt', 'transformer', 'transformers', 'attention', 'self-attention', 'llm', 'pytorch', 'deep learning', 'nlp', 'ai engineer'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-mosh-ml-python',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: '7eh4d6sabA0',
    title: 'Python Machine Learning Tutorial (Data Science)',
    provider: 'Programming with Mosh',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=7eh4d6sabA0',
    embedUrl: 'https://www.youtube.com/embed/7eh4d6sabA0?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/7eh4d6sabA0/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical beginner demonstration building, splitting, training, and measuring accuracy of a scikit-learn classification model in Python.',
    domains: ['machine learning', 'scikit-learn', 'python', 'ai'],
    keywords: ['machine learning', 'scikit-learn', 'sklearn', 'classification', 'model evaluation', 'python', 'data science', 'ai'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-tensorflow-neural',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'tPYj3fFJGjk',
    title: 'TensorFlow 2.0 Complete Course - Python Neural Networks for Beginners Tutorial',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=tPYj3fFJGjk',
    embedUrl: 'https://www.youtube.com/embed/tPYj3fFJGjk?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/tPYj3fFJGjk/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Covers core ML algorithms, linear regression, classification, clustering, neural networks, convolutional networks, and NLP workflows.',
    domains: ['ai', 'machine learning', 'deep learning', 'nlp'],
    keywords: ['tensorflow', 'deep learning', 'neural network', 'classification', 'regression', 'clustering', 'nlp', 'computer vision', 'ai'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-numpy-tutorial',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'QUT1VHiLmmI',
    title: 'Python NumPy Tutorial for Beginners',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=QUT1VHiLmmI',
    embedUrl: 'https://www.youtube.com/embed/QUT1VHiLmmI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/QUT1VHiLmmI/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical guide to NumPy arrays, broadcasting, indexing, vectorized math, linear algebra, and numerical data processing.',
    domains: ['numpy', 'data analysis', 'python', 'machine learning'],
    keywords: ['numpy', 'array', 'arrays', 'linear algebra', 'vectorization', 'python', 'data analysis', 'data science', 'ai'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-galli-pandas-tutorial',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'vmEHCJofslg',
    title: 'Complete Python Pandas Data Science Tutorial! (Reading CSV/Excel files, Sorting, Filtering, Groupby)',
    provider: 'Keith Galli',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=vmEHCJofslg',
    embedUrl: 'https://www.youtube.com/embed/vmEHCJofslg?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/vmEHCJofslg/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Hands-on walkthrough of Pandas DataFrames, loading CSV/Excel datasets, filtering rows, cleaning columns, and GroupBy aggregation.',
    domains: ['pandas', 'data analysis', 'data analytics', 'python'],
    keywords: ['pandas', 'dataframe', 'data analysis', 'data analyst', 'data analytics', 'csv', 'excel', 'cleaning', 'groupby', 'aggregation'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-alex-data-analyst-bootcamp',
    category: 'video',
    primarySubject: 'sql',
    compatibleSubjects: ['sql', 'ai_ml', 'python'],
    isGenericOverview: true,
    videoId: 'rGx1QNdYzvs',
    title: 'FREE Data Analyst Bootcamp!!',
    provider: 'Alex The Analyst',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=rGx1QNdYzvs',
    embedUrl: 'https://www.youtube.com/embed/rGx1QNdYzvs?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/rGx1QNdYzvs/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Structured Data Analyst curriculum covering SQL querying, Excel modeling, Tableau/Power BI dashboards, Pandas exploratory analysis, and portfolio case studies.',
    domains: ['data analyst', 'data analytics', 'sql', 'excel', 'visualization'],
    keywords: ['data analyst', 'data analytics', 'data analysis', 'sql', 'excel', 'tableau', 'power bi', 'dashboard', 'visualization', 'pandas'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-statistics-ds',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'sql', 'finance_economics'],
    videoId: 'xxpc-HPKN28',
    title: 'Statistics - A Full University Course on Data Science Basics',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=xxpc-HPKN28',
    embedUrl: 'https://www.youtube.com/embed/xxpc-HPKN28?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/xxpc-HPKN28/hqdefault.jpg',
    embedAllowed: true,
    description:
      'University statistics foundations covering distributions, descriptive statistics, probability, hypothesis testing, correlation, and regression.',
    domains: ['statistics', 'data analysis', 'data science', 'ai'],
    keywords: ['statistics', 'probability', 'hypothesis testing', 'regression', 'correlation', 'distribution', 'data analyst', 'data analysis', 'a/b testing'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-data-science-full',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python', 'sql'],
    isGenericOverview: true,
    videoId: 'ua-CiDNNj30',
    title: 'Learn Data Science Tutorial - Full Course for Beginners',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=ua-CiDNNj30',
    embedUrl: 'https://www.youtube.com/embed/ua-CiDNNj30?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/ua-CiDNNj30/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Foundational data science and analytics journey connecting exploratory statistics, data wrangling, visualization storytelling, and predictive modeling.',
    domains: ['data science', 'data analysis', 'statistics', 'visualization'],
    keywords: ['data science', 'data analysis', 'data analytics', 'statistics', 'visualization', 'eda', 'exploratory', 'python'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-wds-sql-60min',
    category: 'video',
    primarySubject: 'sql',
    videoId: 'p3qvj9hO_Bo',
    title: 'Learn SQL In 60 Minutes',
    provider: 'Web Dev Simplified',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=p3qvj9hO_Bo',
    embedUrl: 'https://www.youtube.com/embed/p3qvj9hO_Bo?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/p3qvj9hO_Bo/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Focused SQL tutorial teaching database creation, SELECT filtering, aggregate GROUP BY functions, JOINs, and relational queries in 60 minutes.',
    domains: ['sql', 'data analysis', 'database'],
    keywords: ['sql', 'select', 'where', 'group by', 'aggregate', 'join', 'joins', 'database', 'data analyst', 'query'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fireship-sql',
    category: 'video',
    primarySubject: 'sql',
    videoId: 'Cz3WcZLRaWc',
    title: 'MySQL - The Basics // Learn SQL in 23 Easy Steps',
    provider: 'Fireship',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=Cz3WcZLRaWc',
    embedUrl: 'https://www.youtube.com/embed/Cz3WcZLRaWc?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/Cz3WcZLRaWc/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Fast-paced conceptual tour of relational keys, indexes, normalization, joins, and schema modeling in SQL.',
    domains: ['sql', 'mysql', 'database', 'relational'],
    keywords: ['sql', 'mysql', 'relational', 'index', 'indexes', 'foreign key', 'primary key', 'join', 'schema'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-traversy-sql',
    category: 'video',
    primarySubject: 'sql',
    videoId: 'nWeW3sCmD2k',
    title: 'SQL Crash Course - Beginner to Intermediate',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=nWeW3sCmD2k',
    embedUrl: 'https://www.youtube.com/embed/nWeW3sCmD2k?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/nWeW3sCmD2k/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical SQL walkthrough covering queries, subqueries, aggregations, joins, constraints, and real analytical queries.',
    domains: ['sql', 'data analysis', 'database'],
    keywords: ['sql', 'query', 'subquery', 'join', 'aggregate', 'window', 'database', 'data analysis', 'postgresql'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-uxmastery-what-is-ux',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: 'Ovj4hFxko7c',
    title: 'What the #$%@ is UX Design?',
    provider: 'UX Mastery',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=Ovj4hFxko7c',
    embedUrl: 'https://www.youtube.com/embed/Ovj4hFxko7c?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/Ovj4hFxko7c/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Concise conceptual introduction distinguishing UX research, information architecture, interaction design, usability, and visual UI.',
    domains: ['ui/ux', 'ux design', 'user research'],
    keywords: ['ux', 'ui', 'ui/ux', 'ux design', 'user experience', 'user research', 'usability', 'information architecture', 'design thinking'],
    levels: ['Beginner'],
    language: 'en',
  },
  {
    id: 'yt-designcourse-uiux-crash',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: 'YiLUYf4HDh4',
    title: 'Learn UI/UX Design & Figma - 2022 Interactive Crash Course',
    provider: 'DesignCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=YiLUYf4HDh4',
    embedUrl: 'https://www.youtube.com/embed/YiLUYf4HDh4?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/YiLUYf4HDh4/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Hands-on walkthrough of UI visual hierarchy, whitespace, alignment, color contrast, typography scale, and responsive layout critique.',
    domains: ['ui/ux', 'ui design', 'figma', 'visual design'],
    keywords: ['ui', 'ux', 'ui/ux', 'visual hierarchy', 'typography', 'color', 'contrast', 'spacing', 'alignment', 'figma', 'layout'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-arash-figma-2026',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: '1SNZRCVNizg',
    title: 'Free Figma Crash Course for Beginners 2026 | UI/UX Design',
    provider: 'DesignWithArash',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=1SNZRCVNizg',
    embedUrl: 'https://www.youtube.com/embed/1SNZRCVNizg?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/1SNZRCVNizg/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Step-by-step modern Figma workflow covering Auto Layout, reusable components, design tokens, wireframing, and interactive prototyping.',
    domains: ['figma', 'ui/ux', 'prototyping', 'design system'],
    keywords: ['figma', 'auto layout', 'components', 'design system', 'wireframe', 'prototype', 'prototyping', 'ui/ux', 'ui', 'ux'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-showalter-figma-intro',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: 'jk1T0CdLxwU',
    title: 'Intro to Figma - Beginners guide to Figma Basics',
    provider: 'Jesse Showalter',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=jk1T0CdLxwU',
    embedUrl: 'https://www.youtube.com/embed/jk1T0CdLxwU?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/jk1T0CdLxwU/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Beginner introduction to artboards/frames, vector styling, reusable UI styles, grids, and interface design fundamentals in Figma.',
    domains: ['figma', 'ui/ux', 'ui design'],
    keywords: ['figma', 'ui', 'ux', 'ui/ux', 'wireframe', 'mockup', 'grids', 'typography', 'design'],
    levels: ['Beginner'],
    language: 'en',
  },
  {
    id: 'yt-designcourse-figma-proto',
    category: 'video',
    primarySubject: 'design_ux',
    videoId: '3q3FV65ZrUs',
    title: "Figma Tutorial - A Free UI Design/Prototyping Tool. It's awesome.",
    provider: 'DesignCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=3q3FV65ZrUs',
    embedUrl: 'https://www.youtube.com/embed/3q3FV65ZrUs?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/3q3FV65ZrUs/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Demonstrates translating low-fidelity wireframes into interactive clickable prototypes for usability testing and developer handoff.',
    domains: ['figma', 'prototyping', 'ui/ux', 'wireframing'],
    keywords: ['figma', 'prototype', 'prototyping', 'wireframe', 'wireframing', 'usability testing', 'ui/ux', 'ui design'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-react-full',
    category: 'video',
    primarySubject: 'react',
    videoId: 'bMknfKXIFA8',
    title: "React Course - Beginner's Tutorial for React JavaScript Library [2022]",
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=bMknfKXIFA8',
    embedUrl: 'https://www.youtube.com/embed/bMknfKXIFA8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/bMknfKXIFA8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Project-driven React fundamentals course covering JSX, components, props, state, conditional rendering, forms, and effects.',
    domains: ['react', 'frontend', 'javascript'],
    keywords: ['react', 'jsx', 'components', 'props', 'state', 'useeffect', 'hooks', 'forms'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-traversy-react',
    category: 'video',
    primarySubject: 'react',
    videoId: 'w7ejDZ8SWv8',
    title: 'React JS Crash Course',
    provider: 'Traversy Media',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=w7ejDZ8SWv8',
    embedUrl: 'https://www.youtube.com/embed/w7ejDZ8SWv8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/w7ejDZ8SWv8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical React project crash course covering components, state hooks, event handling, API fetching, and routing.',
    domains: ['react', 'frontend'],
    keywords: ['react', 'hooks', 'state', 'props', 'api', 'routing', 'components'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-typescript',
    category: 'video',
    primarySubject: 'typescript',
    videoId: 'gp5H0Vw39yw',
    title: 'Learn TypeScript - Full Course for Beginners',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=gp5H0Vw39yw',
    embedUrl: 'https://www.youtube.com/embed/gp5H0Vw39yw?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/gp5H0Vw39yw/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Comprehensive TypeScript guide covering type annotations, narrowing, interfaces, generics, enums, and React with TypeScript.',
    domains: ['typescript', 'static typing'],
    keywords: ['typescript', 'ts', 'types', 'interfaces', 'generics', 'enums', 'narrowing', 'react'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-mosh-typescript',
    category: 'video',
    primarySubject: 'typescript',
    videoId: 'd56mG7DezGs',
    title: 'TypeScript Tutorial for Beginners',
    provider: 'Programming with Mosh',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=d56mG7DezGs',
    embedUrl: 'https://www.youtube.com/embed/d56mG7DezGs?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/d56mG7DezGs/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Structured TypeScript primer covering compiler configuration, tuples, unions, type aliases, interfaces, and debugging.',
    domains: ['typescript', 'static typing'],
    keywords: ['typescript', 'ts', 'tsconfig', 'union', 'tuple', 'interface', 'type safety'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-node-express',
    category: 'video',
    primarySubject: 'nodejs_backend',
    videoId: 'Oe421EPjeBE',
    title: 'Node.js and Express.js - Full Course',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=Oe421EPjeBE',
    embedUrl: 'https://www.youtube.com/embed/Oe421EPjeBE?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/Oe421EPjeBE/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Deep full-course walkthrough building HTTP APIs, Express routers, middleware chains, JSON payloads, and backend services.',
    domains: ['nodejs', 'express', 'backend', 'rest api'],
    keywords: ['node', 'nodejs', 'express', 'middleware', 'router', 'rest', 'api', 'backend'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-fcc-git-professionals',
    category: 'video',
    primarySubject: 'git_devops',
    videoId: 'Uszj_k0DGsg',
    title: 'Git for Professionals Tutorial - Tools & Concepts for Mastering Version Control with Git',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=Uszj_k0DGsg',
    embedUrl: 'https://www.youtube.com/embed/Uszj_k0DGsg?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/Uszj_k0DGsg/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Intermediate Git mastery covering interactive rebase, cherry-picking, reflog recovery, branching strategies, and clean pull requests.',
    domains: ['git', 'version control', 'devops'],
    keywords: ['git', 'rebase', 'branch', 'merge', 'cherry-pick', 'reflog', 'version control', 'github'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-brocode-python-full',
    category: 'video',
    primarySubject: 'python',
    videoId: 'XKHEtdqhLK8',
    title: 'Python Full Course for free 🐍',
    provider: 'Bro Code',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=XKHEtdqhLK8',
    embedUrl: 'https://www.youtube.com/embed/XKHEtdqhLK8?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/XKHEtdqhLK8/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Step-by-step Python course covering variables, loops, functions, collections, file I/O, and object-oriented programming.',
    domains: ['python', 'programming'],
    keywords: ['python', 'variables', 'loops', 'functions', 'dictionaries', 'lists', 'oop', 'classes'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-microsoft-state-of-gpt',
    category: 'video',
    primarySubject: 'ai_ml',
    videoId: 'bZQun8Y4L2A',
    title: 'State of GPT | BRK216HFS',
    provider: 'Microsoft Developer',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=bZQun8Y4L2A',
    embedUrl: 'https://www.youtube.com/embed/bZQun8Y4L2A?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/bZQun8Y4L2A/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Andrej Karpathy walks through LLM training stages (pretraining, supervised fine-tuning, RLHF), prompting strategies, RAG, and agent workflows.',
    domains: ['ai engineering', 'llm', 'prompt engineering'],
    keywords: ['gpt', 'llm', 'prompt engineering', 'rlhf', 'fine-tuning', 'rag', 'ai engineer', 'transformers'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-fcc-data-analysis-python',
    category: 'video',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml'],
    videoId: 'GPVsHOlRBBI',
    title: 'Data Analysis with Python Course - Numpy, Pandas, Data Visualization',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=GPVsHOlRBBI',
    embedUrl: 'https://www.youtube.com/embed/GPVsHOlRBBI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/GPVsHOlRBBI/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Comprehensive data analysis course using NumPy arrays, Pandas DataFrames, data cleaning, exploratory analysis, and Matplotlib visualizations.',
    domains: ['data analysis', 'python', 'pandas', 'numpy'],
    keywords: ['data analysis', 'data analyst', 'numpy', 'pandas', 'data cleaning', 'matplotlib', 'visualization', 'eda'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-wscube-data-analytics-course',
    category: 'video',
    primarySubject: 'sql',
    compatibleSubjects: ['sql', 'python', 'ai_ml'],
    videoId: 'VaSjiJMrq24',
    title: 'Data Analytics FULL Course for Beginners to Pro in 29 HOURS - 2025 Edition',
    provider: 'WsCube Tech',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=VaSjiJMrq24',
    embedUrl: 'https://www.youtube.com/embed/VaSjiJMrq24?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/VaSjiJMrq24/hqdefault.jpg',
    embedAllowed: true,
    description:
      'End-to-end data analytics curriculum bridging Excel/spreadsheets, SQL queries, Python Pandas, statistics, and interactive dashboards.',
    domains: ['data analytics', 'data analyst', 'sql', 'bi'],
    keywords: ['data analyst', 'data analytics', 'excel', 'sql', 'dashboard', 'statistics', 'kpi', 'exploratory'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-kunal-git-github',
    category: 'video',
    primarySubject: 'git_devops',
    videoId: 'apGV9Kg7ics',
    title: 'Complete Git and GitHub Tutorial',
    provider: 'Kunal Kushwaha',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=apGV9Kg7ics',
    embedUrl: 'https://www.youtube.com/embed/apGV9Kg7ics?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/apGV9Kg7ics/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Practical Git workflow guide explaining commits, branching, merging, pull requests, resolving conflicts, and open-source collaboration.',
    domains: ['git', 'github', 'version control'],
    keywords: ['git', 'github', 'commit', 'branch', 'merge', 'pull request', 'version control'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-edureka-ml-full',
    category: 'video',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    videoId: 'GwIo3gDZCVQ',
    title: 'Machine Learning Full Course - Learn Machine Learning 10 Hours | Machine Learning Tutorial | Edureka',
    provider: 'edureka!',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=GwIo3gDZCVQ',
    embedUrl: 'https://www.youtube.com/embed/GwIo3gDZCVQ?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/GwIo3gDZCVQ/hqdefault.jpg',
    embedAllowed: true,
    isGenericOverview: true,
    description:
      'Structured machine learning walkthrough covering supervised and unsupervised algorithms, regression, decision trees, evaluation metrics, and Python implementations.',
    domains: ['machine learning', 'ai', 'data science'],
    keywords: ['machine learning', 'supervised learning', 'regression', 'classification', 'clustering', 'scikit-learn'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Academic Writing & Research Methodology ---
  {
    id: 'yt-scribbr-methodology',
    category: 'video',
    primarySubject: 'academic_research',
    videoId: 'yplWZs3dqNQ',
    title: 'How to Write a Research Methodology in 4 Steps | Scribbr 🎓',
    provider: 'Scribbr',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=yplWZs3dqNQ',
    embedUrl: 'https://www.youtube.com/embed/yplWZs3dqNQ?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/yplWZs3dqNQ/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Step-by-step academic guide to structuring a thesis or journal research methodology section, explaining data collection, sampling, and analytical rationale.',
    domains: ['research methodology', 'academic writing', 'research writing'],
    keywords: [
      'research methodology',
      'methodology',
      'academic writing',
      'research writing',
      'thesis',
      'dissertation',
      'data collection',
      'qualitative',
      'quantitative',
      'research paper',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-scribbr-lit-review',
    category: 'video',
    primarySubject: 'academic_research',
    videoId: 'kW6Uzn-8uMI',
    title: "4 TIPS for Writing a Literature Review's Intro, Body & Conclusion | Scribbr 🎓",
    provider: 'Scribbr',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=kW6Uzn-8uMI',
    embedUrl: 'https://www.youtube.com/embed/kW6Uzn-8uMI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/kW6Uzn-8uMI/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explains how to synthesize scholarly sources, structure an academic literature review, and maintain a cohesive scholarly argument.',
    domains: ['academic writing', 'literature review', 'research writing'],
    keywords: [
      'academic writing',
      'research writing',
      'literature review',
      'scholarly',
      'synthesis',
      'thesis',
      'essay',
      'citation',
      'english proficiency',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-scribbr-research-design',
    category: 'video',
    primarySubject: 'academic_research',
    videoId: '3Dd8P6IYzdE',
    title: 'Research Design: Defining Your Research Aims and Approach | Scribbr 🎓',
    provider: 'Scribbr',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=3Dd8P6IYzdE',
    embedUrl: 'https://www.youtube.com/embed/3Dd8P6IYzdE?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/3Dd8P6IYzdE/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Compares qualitative, quantitative, and mixed-methods research designs alongside inductive and deductive inquiry for postgraduate studies.',
    domains: ['research methodology', 'research design', 'academic research'],
    keywords: [
      'research design',
      'research methodology',
      'qualitative',
      'quantitative',
      'mixed methods',
      'thesis',
      'postgraduate',
      'academic research',
    ],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Public Speaking & Academic Presentation ---
  {
    id: 'yt-teded-visuals',
    category: 'video',
    primarySubject: 'public_speaking',
    videoId: 'bw5tzcoEG88',
    title: 'How to effectively use visuals in your presentation',
    provider: 'TED-Ed',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=bw5tzcoEG88',
    embedUrl: 'https://www.youtube.com/embed/bw5tzcoEG88?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/bw5tzcoEG88/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Teaches how to design clear slides, charts, and visual aids that reinforce spoken academic and conference presentations without clutter.',
    domains: ['presentation skills', 'academic presentation', 'public speaking'],
    keywords: [
      'presentation',
      'presentation skills',
      'academic presentation',
      'public speaking',
      'visuals',
      'slides',
      'visual communication',
      'conference talk',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-teded-present-ideas',
    category: 'video',
    primarySubject: 'public_speaking',
    videoId: '1uTRlM6MbMo',
    title: 'How to present your ideas effectively',
    provider: 'TED-Ed',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=1uTRlM6MbMo',
    embedUrl: 'https://www.youtube.com/embed/1uTRlM6MbMo?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/1uTRlM6MbMo/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Breaks down how to structure a central idea, hook an audience, and communicate complex arguments clearly during spoken presentations.',
    domains: ['public speaking', 'presentation skills', 'academic presentation'],
    keywords: [
      'public speaking',
      'presentation',
      'presentation skills',
      'academic presentation',
      'speech',
      'storytelling',
      'delivery',
      'english proficiency',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-ted-guide-speaking',
    category: 'video',
    primarySubject: 'public_speaking',
    videoId: 'HN0hkfD6c_c',
    title: 'TED Talks: The Official TED Guide to Public Speaking | Chris Anderson | Talks at Google',
    provider: 'Talks at Google',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=HN0hkfD6c_c',
    embedUrl: 'https://www.youtube.com/embed/HN0hkfD6c_c?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/HN0hkfD6c_c/hqdefault.jpg',
    embedAllowed: true,
    description:
      'In-depth guide to public speaking mastery covering idea framing, rehearsal, vocal delivery, stage presence, and engaging diverse audiences.',
    domains: ['public speaking', 'presentation skills', 'oral communication'],
    keywords: [
      'public speaking',
      'presentation',
      'presentation skills',
      'academic presentation',
      'speaking',
      'delivery',
      'rehearsal',
      'rhetoric',
    ],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Geography Research & GIS (Geographic Information Systems) ---
  {
    id: 'yt-spatialthoughts-qgis',
    category: 'video',
    primarySubject: 'geography_gis',
    videoId: 'pGm7w-LywO0',
    title: 'Introduction to QGIS (Full Course, Ad-Free)',
    provider: 'Spatial Thoughts',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=pGm7w-LywO0',
    embedUrl: 'https://www.youtube.com/embed/pGm7w-LywO0?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/pGm7w-LywO0/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Complete open-source GIS training covering vector/raster layers, coordinate reference systems, geoprocessing, spatial analysis, and map layouts in QGIS.',
    domains: ['gis', 'qgis', 'geography', 'spatial analysis'],
    keywords: [
      'gis',
      'geographic information systems',
      'qgis',
      'geography',
      'geography research',
      'cartography',
      'spatial analysis',
      'geoprocessing',
      'mapping',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-giseducator-qgis',
    category: 'video',
    primarySubject: 'geography_gis',
    videoId: 'OOuq7BkUxc0',
    title: 'QGIS for Absolute Beginners 2025 | Complete Step by Step GIS Tutorial',
    provider: 'GIS Educator',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=OOuq7BkUxc0',
    embedUrl: 'https://www.youtube.com/embed/OOuq7BkUxc0?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/OOuq7BkUxc0/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Hands-on GIS walkthrough teaching shapefile imports, attribute tables, digitizing geographic features, and exporting publication-ready research maps.',
    domains: ['gis', 'qgis', 'geography', 'mapping'],
    keywords: [
      'gis',
      'qgis',
      'geographic information systems',
      'geography',
      'cartography',
      'shapefile',
      'raster',
      'vector',
      'map layout',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-geoskillpro-qgis',
    category: 'video',
    primarySubject: 'geography_gis',
    videoId: '2eb9FBFDOMU',
    title: 'Module 1: QGIS Course Introduction and Learning Roadmap GIS for Beginners',
    provider: 'GeoSkill Pro',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=2eb9FBFDOMU',
    embedUrl: 'https://www.youtube.com/embed/2eb9FBFDOMU?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/2eb9FBFDOMU/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Structured GIS orientation explaining core spatial data concepts, GIS workflows for geography research, and QGIS tooling.',
    domains: ['gis', 'geography', 'qgis'],
    keywords: [
      'gis',
      'geographic information systems',
      'geography',
      'geography research',
      'environmental',
      'environmental research',
      'spatial analysis',
      'qgis',
      'spatial data',
      'geospatial',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Business, Strategy, Entrepreneurship & Operations ---
  {
    id: 'yt-cc-business-idea',
    category: 'video',
    primarySubject: 'business_management',
    videoId: 'iywvlUk2Wfg',
    title: 'How to Develop a Business Idea: Crash Course Business - Entrepreneurship #2',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=iywvlUk2Wfg',
    embedUrl: 'https://www.youtube.com/embed/iywvlUk2Wfg?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/iywvlUk2Wfg/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Covers identifying market opportunities, evaluating value propositions, analyzing competition, and validating business strategy.',
    domains: ['business', 'entrepreneurship', 'strategy', 'marketing'],
    keywords: [
      'business',
      'entrepreneurship',
      'business strategy',
      'value proposition',
      'swot',
      'marketing',
      'market research',
      'product management',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-mvp-pivoting',
    category: 'video',
    primarySubject: 'business_management',
    videoId: 'kmfC-i9WgH0',
    title: 'Minimum Viable Product and Pivoting: Crash Course Business Entrepreneurship #6',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=kmfC-i9WgH0',
    embedUrl: 'https://www.youtube.com/embed/kmfC-i9WgH0?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/kmfC-i9WgH0/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explains iterative product validation, MVP experimentation, agile pivots, and customer-driven business execution.',
    domains: ['business', 'product management', 'entrepreneurship', 'agile'],
    keywords: [
      'business',
      'mvp',
      'agile',
      'product management',
      'project management',
      'strategy',
      'operations management',
      'okr',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-core-business-operations',
    category: 'video',
    primarySubject: 'business_management',
    videoId: '8bu1Ltpeiu4',
    title: 'The Core of a Business - Key Activities & Resources: Crash Course Business Entrepreneurship #8',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=8bu1Ltpeiu4',
    embedUrl: 'https://www.youtube.com/embed/8bu1Ltpeiu4?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/8bu1Ltpeiu4/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Breaks down core operational activities, resource planning, supply chain execution, and organizational capability building.',
    domains: ['business', 'operations management', 'business management'],
    keywords: [
      'business',
      'operations',
      'operations management',
      'business management',
      'supply chain',
      'project management',
      'strategy',
      'leadership',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-customer-communication',
    category: 'video',
    primarySubject: 'business_management',
    videoId: 'gaPWVChiyfk',
    title: 'How to Communicate with Customers: Crash Course Entrepreneurship #11',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=gaPWVChiyfk',
    embedUrl: 'https://www.youtube.com/embed/gaPWVChiyfk?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/gaPWVChiyfk/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Walks through customer segmentation, marketing channels, brand positioning, and digital outreach strategies.',
    domains: ['marketing', 'digital marketing', 'business'],
    keywords: [
      'marketing',
      'digital marketing',
      'brand',
      'customer',
      'swot',
      'seo',
      'business',
      'communication',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-business-decisions',
    category: 'video',
    primarySubject: 'business_management',
    videoId: 'vLxjUNINfnY',
    title: 'How to Make Tough Decisions: Crash Course Business - Soft Skills #11',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=vLxjUNINfnY',
    embedUrl: 'https://www.youtube.com/embed/vLxjUNINfnY?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/vLxjUNINfnY/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Structured framework for strategic decision-making, stakeholder alignment, risk trade-offs, and management leadership.',
    domains: ['leadership', 'business management', 'project management'],
    keywords: [
      'leadership',
      'decision making',
      'project management',
      'business management',
      'stakeholder',
      'okr',
      'strategy',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Engineering (General, Systems, Electrical, Chemical/Process) ---
  {
    id: 'yt-cc-what-is-engineering',
    category: 'video',
    primarySubject: 'engineering',
    videoId: 'btGYcizV0iI',
    title: 'What is Engineering?: Crash Course Engineering #1',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=btGYcizV0iI',
    embedUrl: 'https://www.youtube.com/embed/btGYcizV0iI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/btGYcizV0iI/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Introduces engineering disciplines, the engineering design process, problem framing, prototyping, and systems thinking.',
    domains: ['engineering', 'systems engineering', 'mechanical engineering', 'civil engineering'],
    keywords: [
      'engineering',
      'engineering design',
      'systems engineering',
      'systems thinking',
      'mechanical engineering',
      'civil engineering',
      'industrial engineering',
      'statics',
      'prototyping',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-khan-ohms-law',
    category: 'video',
    primarySubject: 'engineering',
    videoId: 'FuIn1L3qeqI',
    title: "Ohm's law | Physics | Khan Academy",
    provider: 'Khan Academy',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=FuIn1L3qeqI',
    embedUrl: 'https://www.youtube.com/embed/FuIn1L3qeqI?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/FuIn1L3qeqI/hqdefault.jpg',
    embedAllowed: true,
    description:
      "Clear derivation and worked circuit examples of Ohm's Law (V = IR), voltage, current, and electrical resistance.",
    domains: ['electrical engineering', 'circuits', 'engineering', 'physics'],
    keywords: [
      'electrical engineering',
      'circuit analysis',
      'circuits',
      'ohm',
      'voltage',
      'current',
      'resistance',
      'engineering',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-chemical-engineering',
    category: 'video',
    primarySubject: 'engineering',
    videoId: 'aRKyJRAxjpM',
    title: 'The History of Chemical Engineering: Crash Course Engineering #5',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=aRKyJRAxjpM',
    embedUrl: 'https://www.youtube.com/embed/aRKyJRAxjpM?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/aRKyJRAxjpM/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explores process engineering, thermodynamics, unit operations, scale-up design, and industrial materials transformations.',
    domains: ['chemical engineering', 'engineering', 'thermodynamics', 'industrial engineering'],
    keywords: [
      'chemical engineering',
      'thermodynamics',
      'process engineering',
      'industrial engineering',
      'materials science',
      'engineering',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-electrical-engineering',
    category: 'video',
    primarySubject: 'engineering',
    videoId: '3nB1Ntku06w',
    title: 'The History of Electrical Engineering: Crash Course Engineering #4',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=3nB1Ntku06w',
    embedUrl: 'https://www.youtube.com/embed/3nB1Ntku06w?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/3nB1Ntku06w/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Explores core foundations of electrical engineering, electromagnetism, electric power systems, communications, and electronics.',
    domains: ['electrical engineering', 'electronics', 'systems design', 'engineering'],
    keywords: [
      'electrical engineering',
      'electronics',
      'systems design',
      'systems engineering',
      'circuits',
      'electromagnetism',
      'power',
      'engineering',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-electrical-power',
    category: 'video',
    primarySubject: 'engineering',
    videoId: 'uTWHMchUlws',
    title: 'Electrical Power, Conductors, & Your Dream Home: Crash Course Engineering #21',
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=uTWHMchUlws',
    embedUrl: 'https://www.youtube.com/embed/uTWHMchUlws?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/uTWHMchUlws/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Examines conductors, resistance, electrical power distribution, circuit safety, and practical electronics design principles.',
    domains: ['electrical engineering', 'electronics', 'circuits', 'power systems'],
    keywords: [
      'electrical engineering',
      'electronics',
      'circuits',
      'circuit analysis',
      'conductors',
      'power',
      'voltage',
      'resistance',
      'engineering',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'yt-cc-signal-processing',
    category: 'video',
    primarySubject: 'engineering',
    videoId: 'VjuFaPAIOHw',
    title: "YouTube Couldn't Exist Without Communications & Signal Processing: Crash Course Engineering #42",
    provider: 'CrashCourse',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=VjuFaPAIOHw',
    embedUrl: 'https://www.youtube.com/embed/VjuFaPAIOHw?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/VjuFaPAIOHw/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Covers signal processing, communications systems, bandwidth capacity, noise filtering, and electrical systems design.',
    domains: ['electrical engineering', 'signal processing', 'systems design', 'electronics'],
    keywords: [
      'electrical engineering',
      'signal processing',
      'systems design',
      'systems engineering',
      'electronics',
      'communications',
      'bandwidth',
      'engineering',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'yt-fcc-system-design',
    category: 'video',
    primarySubject: 'nodejs_backend',
    compatibleSubjects: ['nodejs_backend', 'git_devops', 'sql', 'react'],
    videoId: 'C842vFY5kRo',
    title: 'System Design Course – APIs, Databases, Caching, CDNs, Load Balancing & Production Infra',
    provider: 'freeCodeCamp.org',
    type: 'Video Tutorial',
    url: 'https://www.youtube.com/watch?v=C842vFY5kRo',
    embedUrl: 'https://www.youtube.com/embed/C842vFY5kRo?rel=0',
    thumbnailUrl: 'https://i.ytimg.com/vi/C842vFY5kRo/hqdefault.jpg',
    embedAllowed: true,
    description:
      'Complete course on software architecture and system design covering APIs, SQL/NoSQL scaling, caching, load balancing, and production architecture.',
    domains: ['software architecture', 'system design', 'backend', 'full-stack'],
    keywords: [
      'software architecture',
      'system design',
      'architecture',
      'full-stack',
      'full stack',
      'api',
      'database',
      'sql',
      'caching',
      'load balancing',
      'scalability',
      'backend',
    ],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // ==========================================
  // 2. TRUSTED WRITTEN TUTORIALS & DOCS
  // ==========================================

  // --- CSS Tutorials ---
  {
    id: 'mdn-css-flexbox',
    category: 'tutorial',
    primarySubject: 'css',
    title: 'Basic Concepts of Flexbox (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts',
    description:
      'Official Mozilla guide explaining flex containers, main/cross axis alignment, flex-wrap, flex sizing, and spacing.',
    domains: ['css', 'flexbox', 'layout'],
    keywords: ['css', 'flexbox', 'flex', 'alignment', 'responsive', 'layout', 'modern css'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mdn-css-grid',
    category: 'tutorial',
    primarySubject: 'css',
    title: 'Basic Concepts of CSS Grid Layout (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Basic_concepts',
    description:
      'Authoritative CSS Grid documentation covering grid tracks, fr units, grid lines, gutters, and two-dimensional layout patterns.',
    domains: ['css', 'css grid', 'grid', 'layout'],
    keywords: ['css', 'grid', 'css grid', 'grid layout', 'layout', 'responsive', 'modern css'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mdn-responsive-design',
    category: 'tutorial',
    primarySubject: 'css',
    compatibleSubjects: ['html', 'css'],
    title: 'Responsive Web Design & Media Queries Guide (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design',
    description:
      'Official Mozilla lesson on responsive layouts combining Flexbox, CSS Grid, CSS media queries, fluid typography, and mobile-first breakpoints.',
    domains: ['css', 'responsive design', 'media queries'],
    keywords: ['responsive', 'responsive design', 'media query', 'media queries', 'mobile-first', 'flexbox', 'grid', 'css', 'modern css'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'webdev-learn-css',
    category: 'tutorial',
    primarySubject: 'css',
    title: 'Learn CSS — Modern Layout & Styling Modules',
    provider: 'web.dev (Google)',
    type: 'Educational Article',
    url: 'https://web.dev/learn/css',
    description:
      'Well-illustrated modular lessons on CSS box model, selectors, flexbox, grid, spacing, color, and typography.',
    domains: ['css', 'layout', 'styling'],
    keywords: ['css', 'flexbox', 'grid', 'layout', 'box model', 'typography', 'responsive', 'modern css'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mdn-css',
    category: 'tutorial',
    primarySubject: 'css',
    isGenericOverview: true,
    title: 'CSS Layout, Box Model & Styling Reference',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS',
    description:
      'Authoritative CSS reference covering selectors, specificity, Flexbox, CSS Grid, custom properties, and responsive design.',
    domains: ['css', 'styling', 'layout'],
    keywords: ['css', 'flexbox', 'grid', 'layout', 'box model', 'responsive', 'selector', 'media query'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- HTML Tutorials ---
  {
    id: 'mdn-html',
    category: 'tutorial',
    primarySubject: 'html',
    title: 'HTML: HyperText Markup Language Guide',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
    description:
      'Official Mozilla guide to semantic HTML elements, document structure, forms, validation attributes, and accessibility.',
    domains: ['html', 'html5', 'semantic'],
    keywords: ['html', 'html5', 'semantic', 'form', 'element', 'accessibility', 'markup'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mdn-learn-web',
    category: 'tutorial',
    primarySubject: 'html',
    compatibleSubjects: ['html', 'css', 'javascript'],
    isGenericOverview: true,
    title: 'Learn Web Development Structured Pathway',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development',
    description:
      'Foundational tutorials maintained by Mozilla spanning HTML, CSS, JavaScript, web forms, and browser APIs.',
    domains: ['web', 'frontend', 'html', 'css', 'javascript'],
    keywords: ['web', 'frontend', 'html', 'css', 'javascript', 'dom', 'browser', 'accessibility'],
    levels: ['Beginner'],
    language: 'en',
  },

  // --- JavaScript Tutorials ---
  {
    id: 'mdn-js-grammar-types',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'JavaScript Grammar, Variables & Declarations (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types',
    description:
      'Authoritative guide on modern JavaScript syntax, var/let/const declarations, variable scope, hoisting, and literals.',
    domains: ['javascript', 'syntax', 'scope'],
    keywords: ['javascript', 'js', 'syntax', 'grammar', 'let', 'const', 'var', 'hoisting', 'scope', 'declaration', 'modern javascript'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mdn-js-scope',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'Scope in JavaScript — Global, Function & Block Scope',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Glossary/Scope',
    description:
      'Concise MDN reference distinguishing global scope, module scope, function scope, and lexical block scope.',
    domains: ['javascript', 'scope', 'closures'],
    keywords: ['scope', 'block scope', 'function scope', 'lexical scope', 'global scope', 'closure', 'javascript', 'let', 'const'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mdn-js-closures',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'Closures & Lexical Scoping Guide (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
    description:
      'Explains how nested functions retain access to outer lexical environments, private state patterns, and scope chains.',
    domains: ['javascript', 'closures', 'scope'],
    keywords: ['closure', 'closures', 'scope', 'lexical', 'function', 'javascript', 'private'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mdn-js-array',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'JavaScript Array & Array Methods Reference (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array',
    description:
      'Complete reference for JavaScript Array methods including map, filter, reduce, find, flatMap, and slice.',
    domains: ['javascript', 'arrays', 'data structures'],
    keywords: ['array', 'arrays', 'array method', 'array methods', 'map', 'filter', 'reduce', 'data structures', 'javascript', 'modern javascript'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mdn-js-data-structures',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'JavaScript Data Types & Data Structures (MDN)',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures',
    description:
      'Covers primitives, objects, indexed collections (Arrays), and keyed collections (Maps, Sets) in modern JavaScript.',
    domains: ['javascript', 'data structures'],
    keywords: ['data structure', 'data structures', 'data type', 'array', 'object', 'map', 'set', 'primitive', 'javascript', 'js'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'jsinfo-data-types',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'Data Types, Arrays, Maps & Sets in Modern JavaScript',
    provider: 'javascript.info',
    type: 'Educational Article',
    url: 'https://javascript.info/data-types',
    description:
      'Clear interactive reading with runnable examples covering JavaScript array methods, objects, Map/Set, and destructuring.',
    domains: ['javascript', 'data structures', 'arrays'],
    keywords: ['data structure', 'data structures', 'array', 'array methods', 'object', 'map', 'set', 'destructuring', 'syntax', 'modern javascript', 'javascript'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'jsinfo-closures',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'Variable Scope & Closure Deep Dive',
    provider: 'javascript.info',
    type: 'Educational Article',
    url: 'https://javascript.info/closure',
    description:
      'Step-by-step visual guide to Lexical Environment records, nested functions, garbage collection, and scope exercises.',
    domains: ['javascript', 'scope', 'closures'],
    keywords: ['scope', 'closure', 'closures', 'lexical', 'let', 'var', 'function', 'javascript'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'jsinfo-async',
    category: 'tutorial',
    primarySubject: 'javascript',
    title: 'Promises, Async/Await & Error Handling',
    provider: 'javascript.info',
    type: 'Educational Article',
    url: 'https://javascript.info/async',
    description:
      'Structured chapters explaining callbacks, Promise chaining, Promise.all, microtasks, and async/await syntax.',
    domains: ['javascript', 'async', 'promises'],
    keywords: ['async', 'await', 'async/await', 'promise', 'promises', 'callback', 'asynchronous', 'fetch', 'javascript'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mdn-javascript',
    category: 'tutorial',
    primarySubject: 'javascript',
    isGenericOverview: true,
    title: 'JavaScript Guide & Language Reference',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    description:
      'Comprehensive Mozilla reference covering JavaScript syntax, functions, modules, promises, and object-oriented patterns.',
    domains: ['javascript'],
    keywords: ['javascript', 'js', 'es6', 'module', 'function', 'dom', 'promise', 'syntax'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mdn-http-apis',
    category: 'tutorial',
    primarySubject: 'nodejs_backend',
    compatibleSubjects: ['nodejs_backend', 'javascript', 'python'],
    title: 'HTTP & Web APIs Reference',
    provider: 'MDN Web Docs',
    type: 'Official Documentation',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
    description:
      'Authoritative reference for HTTP methods, status codes, headers, cookies, CORS, caching, and REST communication.',
    domains: ['http', 'rest api', 'backend'],
    keywords: ['http', 'https', 'rest', 'api', 'cors', 'headers', 'status code', 'request', 'response', 'cookies'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- React, TypeScript, Node.js & Express Tutorials ---
  {
    id: 'react-official-learn',
    category: 'tutorial',
    primarySubject: 'react',
    title: 'React Official Interactive Guide',
    provider: 'React Docs (react.dev)',
    type: 'Official Documentation',
    url: 'https://react.dev/learn',
    description:
      'Official React guide teaching components, JSX, props, conditional rendering, hooks, and thinking in React.',
    domains: ['react', 'components', 'hooks'],
    keywords: ['react', 'jsx', 'component', 'props', 'hook', 'usestate', 'useeffect', 'spa'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'react-managing-state',
    category: 'tutorial',
    primarySubject: 'react',
    title: 'Managing State & Data Flow in React',
    provider: 'React Docs (react.dev)',
    type: 'Official Documentation',
    url: 'https://react.dev/learn/managing-state',
    description:
      'Deep guide to structuring state cleanly, lifting state up, reducers, Context API, and avoiding redundant state.',
    domains: ['react', 'state', 'context'],
    keywords: ['react', 'state', 'context', 'reducer', 'usereducer', 'usecontext', 'data flow', 'hooks'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'typescript-handbook',
    category: 'tutorial',
    primarySubject: 'typescript',
    title: 'The TypeScript Handbook',
    provider: 'TypeScript Official Docs',
    type: 'Official Documentation',
    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
    description:
      'Official TypeScript documentation explaining static type checking, interfaces, union types, narrowing, and generics.',
    domains: ['typescript', 'types', 'generics'],
    keywords: ['typescript', 'ts', 'interface', 'generic', 'narrowing', 'union', 'type safety', 'static typing'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'nodejs-official-learn',
    category: 'tutorial',
    primarySubject: 'nodejs_backend',
    title: 'Node.js Official Learning Guides',
    provider: 'Node.js Foundation',
    type: 'Official Documentation',
    url: 'https://nodejs.org/learn/getting-started/introduction-to-nodejs',
    description:
      'Official Node.js guides covering V8 runtime concepts, event loop, asynchronous I/O, TypeScript/ESM, and servers.',
    domains: ['node', 'nodejs', 'backend'],
    keywords: ['node', 'nodejs', 'node.js', 'event loop', 'backend', 'server', 'npm', 'api', 'runtime'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'express-official-guide',
    category: 'tutorial',
    primarySubject: 'nodejs_backend',
    title: 'Express.js Getting Started & Routing Guide',
    provider: 'Express.js Docs',
    type: 'Official Documentation',
    url: 'https://expressjs.com/en/starter/installing/',
    description:
      'Official Express.js guide for setting up servers, defining REST routes, configuring middleware, and error handlers.',
    domains: ['express', 'nodejs', 'backend'],
    keywords: ['express', 'expressjs', 'middleware', 'route', 'routing', 'rest', 'api', 'backend', 'endpoint'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'freecodecamp-software-architecture',
    category: 'tutorial',
    primarySubject: 'nodejs_backend',
    compatibleSubjects: ['nodejs_backend', 'git_devops', 'react', 'sql'],
    title: 'An Introduction to Software Architecture Patterns',
    provider: 'freeCodeCamp',
    type: 'Educational Article',
    url: 'https://www.freecodecamp.org/news/an-introduction-to-software-architecture-patterns/',
    description:
      'Practical guide to software architecture patterns including layered MVC, client-server systems, event-driven architecture, and microservices.',
    domains: ['software architecture', 'system design', 'full-stack'],
    keywords: [
      'software architecture',
      'architecture',
      'system design',
      'design patterns',
      'mvc',
      'microservices',
      'full-stack',
      'backend',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'martinfowler-architecture',
    category: 'tutorial',
    primarySubject: 'git_devops',
    compatibleSubjects: ['git_devops', 'nodejs_backend'],
    title: 'Software Architecture Guide',
    provider: 'Martin Fowler',
    type: 'Educational Article',
    url: 'https://martinfowler.com/architecture/',
    description:
      'Authoritative guide to software architecture principles, evolutionary design, microservices trade-offs, and maintainable system boundaries.',
    domains: ['software architecture', 'system design', 'software engineering'],
    keywords: [
      'software architecture',
      'architecture',
      'system design',
      'microservices',
      'software engineering',
      'patterns',
    ],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- SQL Tutorials ---
  {
    id: 'postgresql-joins-tutorial',
    category: 'tutorial',
    primarySubject: 'sql',
    title: 'PostgreSQL Joins Between Tables Guide',
    provider: 'PostgreSQL Global Development Group',
    type: 'Official Documentation',
    url: 'https://www.postgresql.org/docs/current/tutorial-join.html',
    description:
      'Official PostgreSQL guide demonstrating inner joins, outer joins, table aliases, and multi-table relational queries.',
    domains: ['sql', 'sql joins', 'relational', 'postgresql'],
    keywords: ['sql', 'join', 'joins', 'sql joins', 'inner join', 'outer join', 'relational', 'schema', 'schemas', 'postgresql', 'postgres'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'postgresql-official-tutorial',
    category: 'tutorial',
    primarySubject: 'sql',
    title: 'PostgreSQL Official SQL Tutorial & Docs',
    provider: 'PostgreSQL Global Development Group',
    type: 'Official Documentation',
    url: 'https://www.postgresql.org/docs/current/tutorial.html',
    description:
      'Official PostgreSQL tutorial introducing relational tables, schemas, queries, joins, aggregates, views, and transactions.',
    domains: ['sql', 'relational', 'postgresql'],
    keywords: ['sql', 'postgresql', 'postgres', 'database', 'join', 'joins', 'query', 'schema', 'schemas', 'index', 'transaction', 'relational', 'normalization'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'sqlite-official-docs',
    category: 'tutorial',
    primarySubject: 'sql',
    title: 'SQLite Documentation & SQL Syntax',
    provider: 'SQLite Consortium',
    type: 'Official Documentation',
    url: 'https://www.sqlite.org/docs.html',
    description:
      'Official technical documentation for SQLite queries, data types, ACID transactions, and embedded SQL databases.',
    domains: ['sql', 'sqlite', 'database'],
    keywords: ['sqlite', 'sql', 'database', 'table', 'query', 'acid', 'relational'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Git & Docker Tutorials ---
  {
    id: 'git-official-docs',
    category: 'tutorial',
    primarySubject: 'git_devops',
    title: 'Pro Git Book & Official Git Reference',
    provider: 'Git Official Documentation',
    type: 'Official Documentation',
    url: 'https://git-scm.com/doc',
    description:
      'Official Git documentation and the complete free Pro Git book covering branching, rebasing, merging, and workflows.',
    domains: ['git', 'version control'],
    keywords: ['git', 'github', 'version control', 'branch', 'merge', 'commit', 'rebase', 'pull request'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'docker-get-started',
    category: 'tutorial',
    primarySubject: 'git_devops',
    title: 'Docker Official Get Started Guide',
    provider: 'Docker Docs',
    type: 'Official Documentation',
    url: 'https://docs.docker.com/get-started/',
    description:
      'Official introduction to containers, images, Dockerfiles, networking, and multi-container development with Compose.',
    domains: ['docker', 'devops'],
    keywords: ['docker', 'container', 'dockerfile', 'compose', 'deployment', 'devops', 'ci/cd'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Python & AI/ML Tutorials ---
  {
    id: 'python-official-tutorial',
    category: 'tutorial',
    primarySubject: 'python',
    title: 'The Official Python 3 Tutorial',
    provider: 'Python Software Foundation',
    type: 'Official Documentation',
    url: 'https://docs.python.org/3/tutorial/index.html',
    description:
      'Official Python tutorial covering data types, control flow, data structures, functions, modules, classes, and exceptions.',
    domains: ['python', 'python fundamentals'],
    keywords: ['python', 'python fundamentals', 'variable', 'loop', 'list', 'dict', 'tuple', 'data structures', 'function', 'functions', 'class', 'oop', 'module', 'exception', 'venv'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'python-standard-library',
    category: 'tutorial',
    primarySubject: 'python',
    title: 'Python Standard Library Reference',
    provider: 'Python Software Foundation',
    type: 'Official Documentation',
    url: 'https://docs.python.org/3/library/index.html',
    description:
      'Complete reference for Python built-in functions, collections, pathlib, json, asyncio, and unittest modules.',
    domains: ['python', 'standard library'],
    keywords: ['python', 'library', 'asyncio', 'json', 'unittest', 'collections', 'itertools', 'file', 'pathlib', 'decorator'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'fastapi-official-tutorial',
    category: 'tutorial',
    primarySubject: 'python',
    title: 'FastAPI User Guide & Tutorial',
    provider: 'FastAPI Official Docs',
    type: 'Official Documentation',
    url: 'https://fastapi.tiangolo.com/tutorial/',
    description:
      'Official step-by-step guide to building typed REST APIs in Python with FastAPI and Pydantic validation.',
    domains: ['python', 'fastapi', 'api'],
    keywords: ['fastapi', 'pydantic', 'rest', 'api', 'backend', 'endpoint', 'python', 'microservice'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'scikit-learn-user-guide',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    title: 'scikit-learn Official User Guide',
    provider: 'scikit-learn',
    type: 'Official Documentation',
    url: 'https://scikit-learn.org/stable/user_guide.html',
    description:
      'Official guide to supervised and unsupervised learning, cross-validation, preprocessing, and model evaluation.',
    domains: ['machine learning', 'scikit-learn', 'data science'],
    keywords: ['scikit', 'sklearn', 'machine learning', 'classification', 'clustering', 'validation', 'metrics', 'f1', 'scaling'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'pytorch-official-tutorials',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    title: 'PyTorch Official Learning Tutorials',
    provider: 'PyTorch Foundation',
    type: 'Official Documentation',
    url: 'https://pytorch.org/tutorials/',
    description:
      'Official tutorials for tensors, autograd, neural network architectures, and deep learning workflows.',
    domains: ['deep learning', 'pytorch', 'ai'],
    keywords: ['pytorch', 'deep learning', 'tensor', 'neural network', 'transformer', 'llm', 'nlp', 'computer vision'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Design, Security, Business, Communication Tutorials ---
  {
    id: 'w3c-wai-fundamentals',
    category: 'tutorial',
    primarySubject: 'design_ux',
    compatibleSubjects: ['design_ux', 'html', 'css'],
    title: 'Web Accessibility Fundamentals (WCAG)',
    provider: 'W3C Web Accessibility Initiative',
    type: 'Official Documentation',
    url: 'https://www.w3.org/WAI/fundamentals/',
    description:
      'Official W3C standards for accessible typography, color contrast, ARIA roles, keyboard navigation, and inclusive UX.',
    domains: ['accessibility', 'wcag', 'ui/ux'],
    keywords: ['accessibility', 'wcag', 'contrast', 'a11y', 'aria', 'ux', 'ui', 'usability', 'inclusive design'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'material-design-3',
    category: 'tutorial',
    primarySubject: 'design_ux',
    title: 'Material Design 3 Foundations & Guidelines',
    provider: 'Google Design',
    type: 'Official Documentation',
    url: 'https://m3.material.io/foundations',
    description:
      'Design system principles covering visual hierarchy, layout grids, typography scales, color tokens, and components.',
    domains: ['ui/ux', 'design system'],
    keywords: ['ui', 'ux', 'design system', 'typography', 'color', 'wireframe', 'hierarchy', 'spacing'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'figma-help-center',
    category: 'tutorial',
    primarySubject: 'design_ux',
    title: 'Figma Official Learn & Help Guides',
    provider: 'Figma',
    type: 'Official Documentation',
    url: 'https://help.figma.com/hc/en-us',
    description:
      'Official Figma guides covering frames, auto layout, components, prototyping, and collaborative design workflows.',
    domains: ['figma', 'ui/ux'],
    keywords: ['figma', 'prototype', 'wireframe', 'auto layout', 'ui design', 'mockup'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'owasp-top-ten',
    category: 'tutorial',
    primarySubject: 'cybersecurity',
    title: 'OWASP Top 10 Web Application Security Risks',
    provider: 'OWASP Foundation',
    type: 'Official Documentation',
    url: 'https://owasp.org/www-project-top-ten/',
    description:
      'Industry-standard reference detailing critical web security risks such as injection, broken auth, and access control.',
    domains: ['cybersecurity', 'owasp', 'security'],
    keywords: ['security', 'cybersecurity', 'owasp', 'sql injection', 'xss', 'csrf', 'authentication', 'authorization', 'vulnerability'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'nist-cybersecurity',
    category: 'tutorial',
    primarySubject: 'cybersecurity',
    title: 'NIST Cybersecurity Framework',
    provider: 'NIST',
    type: 'Official Documentation',
    url: 'https://www.nist.gov/cyberframework',
    description:
      'Authoritative framework for risk management, threat identification, access governance, and incident response.',
    domains: ['cybersecurity', 'nist'],
    keywords: ['cybersecurity', 'risk', 'nist', 'incident', 'governance', 'compliance', 'network security', 'least privilege'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'openstax-business',
    category: 'tutorial',
    primarySubject: 'business_management',
    title: 'OpenStax Peer-Reviewed Business & Management Textbooks',
    provider: 'OpenStax (Rice University)',
    type: 'Educational Article',
    url: 'https://openstax.org/subjects/business',
    description:
      'Free peer-reviewed university textbooks covering management, organizational behavior, entrepreneurship, and marketing.',
    domains: ['business', 'management', 'marketing'],
    keywords: ['management', 'strategy', 'business', 'leadership', 'operations', 'marketing', 'entrepreneurship', 'okr', 'swot', 'agile'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'purdue-owl-writing',
    category: 'tutorial',
    primarySubject: 'academic_research',
    title: 'Purdue Online Writing Lab (OWL)',
    provider: 'Purdue University',
    type: 'Educational Article',
    url: 'https://owl.purdue.edu/owl/purdue_owl.html',
    description:
      'Authoritative university guides on academic writing, research papers, scholarly citations (APA/MLA/Chicago), and grammar.',
    domains: ['academic writing', 'research writing', 'english proficiency'],
    keywords: ['academic writing', 'research writing', 'essay', 'thesis', 'citation', 'grammar', 'scholarly', 'english proficiency'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'purdue-owl-academic-writing',
    category: 'tutorial',
    primarySubject: 'academic_research',
    title: 'Academic Writing & Thesis Structure Guide (Purdue OWL)',
    provider: 'Purdue University',
    type: 'Educational Article',
    url: 'https://owl.purdue.edu/owl/general_writing/academic_writing/index.html',
    description:
      'Detailed university reference on scholarly tone, thesis statements, critical argumentation, paragraph cohesion, and graduate-level academic prose.',
    domains: ['academic writing', 'research writing', 'scholarly writing'],
    keywords: [
      'academic writing',
      'research writing',
      'scholarly tone',
      'thesis',
      'dissertation',
      'essay',
      'academic discourse',
      'english proficiency',
      'argumentation',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'purdue-owl-research',
    category: 'tutorial',
    primarySubject: 'academic_research',
    title: 'Conducting Academic Research & Methodology Guide (Purdue OWL)',
    provider: 'Purdue University',
    type: 'Educational Article',
    url: 'https://owl.purdue.edu/owl/research_and_citation/conducting_research/index.html',
    description:
      'Covers primary vs secondary research methodology, source evaluation, empirical inquiry, and integrating evidence into research papers.',
    domains: ['research methodology', 'research writing', 'academic research'],
    keywords: [
      'research methodology',
      'research methods',
      'research writing',
      'academic research',
      'primary research',
      'source evaluation',
      'literature review',
      'empirical',
    ],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'unc-writing-center-tips',
    category: 'tutorial',
    primarySubject: 'academic_research',
    compatibleSubjects: ['academic_research', 'public_speaking'],
    title: 'UNC Writing Center: Academic Writing, Literature Reviews & Presentations',
    provider: 'UNC Chapel Hill Writing Center',
    type: 'Educational Article',
    url: 'https://writingcenter.unc.edu/tips-and-tools/',
    description:
      'Comprehensive university handouts on literature reviews, graduate theses, academic presentations, clarity, and scholarly revision.',
    domains: ['academic writing', 'research methodology', 'academic presentation'],
    keywords: [
      'academic writing',
      'literature review',
      'presentation',
      'academic presentation',
      'thesis',
      'dissertation',
      'research paper',
      'english proficiency',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Geography Research & GIS Official Documentation ---
  {
    id: 'qgis-gentle-intro',
    category: 'tutorial',
    primarySubject: 'geography_gis',
    title: 'A Gentle Introduction to GIS (QGIS Official Documentation)',
    provider: 'QGIS Project',
    type: 'Official Documentation',
    url: 'https://docs.qgis.org/latest/en/docs/gentle_gis_introduction/',
    description:
      'Official open-source GIS textbook introducing vector/raster data models, map projections, spatial analysis, and cartographic design for geography research.',
    domains: ['gis', 'geographic information systems', 'geography'],
    keywords: [
      'gis',
      'geographic information systems',
      'geography',
      'geography research',
      'qgis',
      'spatial analysis',
      'cartography',
      'map projections',
      'vector',
      'raster',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'qgis-training-manual',
    category: 'tutorial',
    primarySubject: 'geography_gis',
    title: 'QGIS Official Training Manual & Spatial Analysis Modules',
    provider: 'QGIS Project',
    type: 'Official Documentation',
    url: 'https://docs.qgis.org/latest/en/docs/training_manual/',
    description:
      'Step-by-step official QGIS curriculum covering map composition, spatial queries, terrain analysis, remote sensing, and geographic research workflows.',
    domains: ['gis', 'qgis', 'geography research', 'spatial analysis'],
    keywords: [
      'qgis',
      'gis',
      'geographic information systems',
      'geography',
      'geography research',
      'spatial analysis',
      'geoprocessing',
      'cartography',
      'terrain',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'learn-arcgis-gallery',
    category: 'tutorial',
    primarySubject: 'geography_gis',
    title: 'Learn ArcGIS Guided Spatial & Geography Tutorials',
    provider: 'Esri Learn ArcGIS',
    type: 'Official Documentation',
    url: 'https://learn.arcgis.com/en/gallery/',
    description:
      'Guided scenario tutorials applying GIS mapping, environmental geography analysis, demographic spatial statistics, and story maps.',
    domains: ['gis', 'arcgis', 'geography', 'geospatial', 'environmental research'],
    keywords: [
      'arcgis',
      'gis',
      'geographic information systems',
      'geography',
      'geography research',
      'environmental',
      'environmental research',
      'spatial analysis',
      'spatial statistics',
      'story maps',
      'geospatial',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Business, Management & Marketing Open Textbooks ---
  {
    id: 'openstax-principles-management',
    category: 'tutorial',
    primarySubject: 'business_management',
    title: 'Principles of Management (OpenStax Textbook)',
    provider: 'OpenStax (Rice University)',
    type: 'Educational Article',
    url: 'https://openstax.org/details/books/principles-management',
    description:
      'Free peer-reviewed university textbook on organizational strategy, leadership, Agile/OKR planning, operations, and project execution.',
    domains: ['business', 'business management', 'project management', 'leadership'],
    keywords: [
      'business management',
      'project management',
      'operations management',
      'organizational',
      'strategic management',
      'leadership',
      'okr',
      'agile',
      'stakeholder',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'openstax-principles-marketing',
    category: 'tutorial',
    primarySubject: 'business_management',
    title: 'Principles of Marketing (OpenStax Textbook)',
    provider: 'OpenStax (Rice University)',
    type: 'Educational Article',
    url: 'https://openstax.org/details/books/principles-marketing',
    description:
      'Open university marketing textbook covering SWOT analysis, digital marketing, market segmentation, pricing, and brand positioning.',
    domains: ['marketing', 'digital marketing', 'business'],
    keywords: [
      'marketing',
      'digital marketing',
      'swot',
      'seo',
      'market research',
      'brand',
      'strategy',
      'business',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'libretexts-business',
    category: 'tutorial',
    primarySubject: 'business_management',
    compatibleSubjects: ['business_management', 'finance_economics'],
    title: 'LibreTexts Open Business & Economics Library',
    provider: 'LibreTexts',
    type: 'Educational Article',
    url: 'https://biz.libretexts.org/',
    description:
      'Peer-reviewed open educational modules covering business strategy, management, finance, marketing, and operations.',
    domains: ['business', 'marketing', 'finance', 'economics'],
    keywords: [
      'business',
      'business management',
      'operations management',
      'marketing',
      'finance',
      'economics',
      'accounting',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Engineering Documentation & Open Textbooks ---
  {
    id: 'libretexts-engineering',
    category: 'tutorial',
    primarySubject: 'engineering',
    title: 'Engineering LibreTexts Open Textbooks & Guides',
    provider: 'LibreTexts',
    type: 'Official Documentation',
    url: 'https://eng.libretexts.org/',
    description:
      'Open-access university texts covering mechanical, electrical, civil, chemical, and systems engineering fundamentals, statics, circuits, and thermodynamics.',
    domains: ['engineering', 'mechanical engineering', 'electrical engineering', 'civil engineering'],
    keywords: [
      'engineering',
      'mechanical engineering',
      'electrical engineering',
      'civil engineering',
      'systems engineering',
      'engineering design',
      'thermodynamics',
      'statics',
      'dynamics',
      'circuits',
      'circuit analysis',
      'control systems',
      'materials science',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'openstax-university-physics',
    category: 'tutorial',
    primarySubject: 'engineering',
    title: 'University Physics Volume 1 — Mechanics & Thermodynamics (OpenStax)',
    provider: 'OpenStax (Rice University)',
    type: 'Educational Article',
    url: 'https://openstax.org/details/books/university-physics-volume-1',
    description:
      'Calculus-based engineering physics reference covering mechanics, statics, rotational dynamics, fluid mechanics, and thermodynamics.',
    domains: ['engineering', 'mechanical engineering', 'civil engineering', 'physics'],
    keywords: [
      'engineering',
      'mechanical engineering',
      'civil engineering',
      'statics',
      'dynamics',
      'mechanics',
      'thermodynamics',
      'physics',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'openstax-calculus',
    category: 'tutorial',
    primarySubject: 'engineering',
    title: 'Calculus Volume 1 for Science & Engineering (OpenStax)',
    provider: 'OpenStax (Rice University)',
    type: 'Educational Article',
    url: 'https://openstax.org/details/books/calculus-volume-1',
    description:
      'Free peer-reviewed calculus textbook covering limits, derivatives, differential modeling, and integration used across engineering.',
    domains: ['engineering', 'mathematics', 'calculus'],
    keywords: [
      'engineering',
      'calculus',
      'differential',
      'engineering design',
      'signal processing',
      'control systems',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // --- Expanded Official Documentation, Guides & Open Textbooks (HTTP 200 Verified) ---
  {
    id: 'python-docs-controlflow',
    category: 'tutorial',
    primarySubject: 'python',
    title: 'Python Official Tutorial — Control Flow & Functions',
    provider: 'Python Software Foundation',
    type: 'Official Documentation',
    url: 'https://docs.python.org/3/tutorial/controlflow.html',
    description:
      'Official Python documentation covering if statements, for loops, range(), function definitions, default arguments, and lambda expressions.',
    domains: ['python', 'control flow', 'functions'],
    keywords: ['python', 'control flow', 'loops', 'if', 'functions', 'arguments', 'lambda'],
    levels: ['Beginner'],
    language: 'en',
  },
  {
    id: 'python-docs-datastructures',
    category: 'tutorial',
    primarySubject: 'python',
    title: 'Python Official Tutorial — Lists, Tuples, Sets & Dictionaries',
    provider: 'Python Software Foundation',
    type: 'Official Documentation',
    url: 'https://docs.python.org/3/tutorial/datastructures.html',
    description:
      'Authoritative reference on Python lists, list comprehensions, tuples, sets, dictionaries, and looping patterns.',
    domains: ['python', 'data structures'],
    keywords: ['python', 'list', 'dictionary', 'set', 'tuple', 'list comprehension', 'data structures'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'python-docs-stdtypes',
    category: 'tutorial',
    primarySubject: 'python',
    title: 'Python Built-in Types Reference',
    provider: 'Python Software Foundation',
    type: 'Official Documentation',
    url: 'https://docs.python.org/3/library/stdtypes.html',
    description:
      'Complete documentation for numeric types, strings, booleans, sequence operations, mapping methods, and truthiness.',
    domains: ['python', 'built-in types'],
    keywords: ['python', 'strings', 'integers', 'dictionaries', 'sets', 'methods', 'built-in'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'numpy-absolute-beginners',
    category: 'tutorial',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml'],
    title: 'NumPy: The Absolute Basics for Beginners',
    provider: 'NumPy Official Docs',
    type: 'Official Documentation',
    url: 'https://numpy.org/doc/stable/user/absolute_beginners.html',
    description:
      'Official introduction to NumPy n-dimensional arrays, vectorization, indexing, slicing, broadcasting, and numerical operations.',
    domains: ['numpy', 'python', 'data analysis', 'ai'],
    keywords: ['numpy', 'ndarray', 'vectorization', 'matrix', 'linear algebra', 'data analysis', 'python'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'pandas-10-minutes',
    category: 'tutorial',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml'],
    title: '10 Minutes to Pandas — Official DataFrames User Guide',
    provider: 'Pandas Official Docs',
    type: 'Official Documentation',
    url: 'https://pandas.pydata.org/docs/user_guide/10min.html',
    description:
      'Essential hands-on guide to Pandas Series, DataFrames, filtering, missing data handling, grouping, merging, and reshaping.',
    domains: ['pandas', 'data analysis', 'data analyst', 'python'],
    keywords: ['pandas', 'dataframe', 'data cleaning', 'groupby', 'merge', 'missing data', 'eda', 'data analysis'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'matplotlib-official-tutorials',
    category: 'tutorial',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml'],
    title: 'Matplotlib Official Tutorials & Visualization Guides',
    provider: 'Matplotlib',
    type: 'Official Documentation',
    url: 'https://matplotlib.org/stable/tutorials/index.html',
    description:
      'Official tutorials covering pyplot basics, figure/axes anatomy, styling charts, subplots, and publication-ready plots.',
    domains: ['data visualization', 'matplotlib', 'data analysis'],
    keywords: ['matplotlib', 'data visualization', 'charts', 'plotting', 'eda', 'python', 'data analyst'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'seaborn-intro-tutorial',
    category: 'tutorial',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml'],
    title: 'An Introduction to Seaborn Statistical Visualization',
    provider: 'Seaborn Official Docs',
    type: 'Official Documentation',
    url: 'https://seaborn.pydata.org/tutorial/introduction.html',
    description:
      'Explains relational plots, distributions, categorical summaries, and statistical estimation in Python.',
    domains: ['seaborn', 'data visualization', 'data analysis', 'statistics'],
    keywords: ['seaborn', 'visualization', 'distributions', 'exploratory data analysis', 'eda', 'data analyst'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'openstax-intro-statistics',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'sql', 'python'],
    title: 'Introductory Statistics (OpenStax Open Textbook)',
    provider: 'OpenStax (Rice University)',
    type: 'Educational Article',
    url: 'https://openstax.org/details/books/introductory-statistics',
    description:
      'Free peer-reviewed university statistics textbook covering descriptive statistics, probability, sampling distributions, confidence intervals, and hypothesis testing.',
    domains: ['statistics', 'data analysis', 'data science', 'a/b testing'],
    keywords: ['statistics', 'probability', 'hypothesis testing', 'confidence interval', 'a/b testing', 'data analyst', 'variance'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mode-sql-tutorial',
    category: 'tutorial',
    primarySubject: 'sql',
    title: 'Mode Analytics SQL Tutorial (Basic, Intermediate & Advanced)',
    provider: 'Mode',
    type: 'Educational Article',
    url: 'https://mode.com/sql-tutorial/',
    description:
      'Analyst-focused SQL tutorial progressing from SELECT/WHERE through GROUP BY aggregations, JOINs, CTEs, and window functions.',
    domains: ['sql', 'data analysis', 'data analyst'],
    keywords: ['sql', 'data analyst', 'group by', 'joins', 'window functions', 'cte', 'aggregation', 'subquery'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'postgres-docs-select-lists',
    category: 'tutorial',
    primarySubject: 'sql',
    title: 'PostgreSQL Official Docs — Queries & SELECT Lists',
    provider: 'PostgreSQL Global Development Group',
    type: 'Official Documentation',
    url: 'https://www.postgresql.org/docs/current/queries-select-lists.html',
    description:
      'Official documentation explaining SELECT expressions, aliases, DISTINCT, filtering, and query execution behavior.',
    domains: ['sql', 'postgresql', 'databases'],
    keywords: ['sql', 'postgresql', 'select', 'distinct', 'aliases', 'query'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'postgres-docs-aggregations',
    category: 'tutorial',
    primarySubject: 'sql',
    title: 'PostgreSQL Tutorial — Aggregate Functions & GROUP BY',
    provider: 'PostgreSQL Global Development Group',
    type: 'Official Documentation',
    url: 'https://www.postgresql.org/docs/current/tutorial-agg.html',
    description:
      'Clear walkthrough of aggregate functions (COUNT, SUM, AVG, MAX), GROUP BY clauses, HAVING filters, and analytical summaries.',
    domains: ['sql', 'postgresql', 'data analysis'],
    keywords: ['sql', 'aggregate', 'group by', 'having', 'count', 'sum', 'data analyst'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'huggingface-llm-course-ch1',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    title: 'Hugging Face LLM Course — Transformer Models & Pipelines',
    provider: 'Hugging Face',
    type: 'Official Documentation',
    url: 'https://huggingface.co/learn/llm-course/chapter1/1',
    description:
      'Free interactive open curriculum explaining how Large Language Models, tokenizers, attention, and transformer pipelines work.',
    domains: ['ai engineering', 'llm', 'transformers', 'nlp'],
    keywords: ['llm', 'transformers', 'hugging face', 'tokenization', 'attention', 'ai engineer', 'nlp', 'embeddings'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'huggingface-nlp-course-ch1',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    title: 'Hugging Face NLP Course — Language Modeling Foundations',
    provider: 'Hugging Face',
    type: 'Official Documentation',
    url: 'https://huggingface.co/learn/nlp-course/chapter1/1',
    description:
      'Structured guide to modern NLP architectures, encoder/decoder models, transfer learning, and fine-tuning workflows.',
    domains: ['nlp', 'ai engineering', 'transformers'],
    keywords: ['nlp', 'transformers', 'fine-tuning', 'bert', 'gpt', 'ai engineer', 'language models'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'prompt-engineering-guide',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    title: 'Prompt Engineering Guide — Techniques, CoT & RAG Patterns',
    provider: 'DAIR.AI',
    type: 'Educational Article',
    url: 'https://www.promptingguide.ai/',
    description:
      'Open community guide covering zero-shot/few-shot prompting, chain-of-thought reasoning, Retrieval-Augmented Generation (RAG), tool use, and evaluation.',
    domains: ['prompt engineering', 'ai engineering', 'llm'],
    keywords: ['prompt engineering', 'chain of thought', 'rag', 'few-shot', 'llm', 'ai engineer', 'agents', 'evaluation'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'google-rules-of-ml',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    title: 'Rules of Machine Learning: Best Practices for ML Engineering',
    provider: 'Google Developers',
    type: 'Official Documentation',
    url: 'https://developers.google.com/machine-learning/guides/rules-of-ml',
    description:
      'Practical engineering handbook covering baseline pipelines, feature engineering, metrics alignment, leakage prevention, and model monitoring.',
    domains: ['ml engineering', 'ai engineering', 'machine learning'],
    keywords: ['ml engineering', 'ai engineer', 'feature engineering', 'evaluation', 'data leakage', 'production ml', 'monitoring'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'fastai-practical-dl',
    category: 'tutorial',
    primarySubject: 'ai_ml',
    compatibleSubjects: ['ai_ml', 'python'],
    title: 'Practical Deep Learning for Coders (fast.ai)',
    provider: 'fast.ai',
    type: 'Educational Article',
    url: 'https://course.fast.ai/',
    description:
      'Open project-first guide to training neural networks, computer vision classifiers, NLP models, and deploying ML systems.',
    domains: ['deep learning', 'machine learning', 'ai engineering'],
    keywords: ['deep learning', 'neural networks', 'pytorch', 'computer vision', 'transfer learning', 'ai engineer'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'laws-of-ux',
    category: 'tutorial',
    primarySubject: 'design_ux',
    title: 'Laws of UX — Psychology & Interface Design Principles',
    provider: 'Laws of UX',
    type: 'Educational Article',
    url: 'https://lawsofux.com/',
    description:
      'Illustrated reference of cognitive heuristics (Hick’s Law, Fitts’s Law, Miller’s Law, Jakob’s Law) with practical UI/UX takeaways.',
    domains: ['ui/ux', 'ux design', 'usability', 'psychology'],
    keywords: ['ux design', 'ui design', 'usability', 'heuristics', 'cognitive load', 'visual hierarchy', 'information architecture'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'webdev-learn-design',
    category: 'tutorial',
    primarySubject: 'design_ux',
    compatibleSubjects: ['design_ux', 'css'],
    title: 'web.dev Learn Responsive & UI Design',
    provider: 'web.dev (Google Chrome)',
    type: 'Official Documentation',
    url: 'https://web.dev/learn/design',
    description:
      'Structured guide covering responsive layouts, typography scale, color contrast, adaptive imagery, and component systems.',
    domains: ['ui design', 'responsive design', 'typography'],
    keywords: ['ui design', 'responsive', 'typography', 'layout', 'design systems', 'ui/ux', 'components'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'webdev-learn-accessibility',
    category: 'tutorial',
    primarySubject: 'design_ux',
    compatibleSubjects: ['design_ux', 'html', 'css'],
    title: 'web.dev Learn Accessibility (WCAG, Contrast & Screen Readers)',
    provider: 'web.dev (Google Chrome)',
    type: 'Official Documentation',
    url: 'https://web.dev/learn/accessibility',
    description:
      'Practical accessibility course covering color contrast, keyboard navigation, focus states, semantic landmarks, and inclusive UI.',
    domains: ['accessibility', 'wcag', 'ui/ux'],
    keywords: ['accessibility', 'wcag', 'a11y', 'contrast', 'keyboard navigation', 'inclusive design', 'ui/ux'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'figma-design-basics',
    category: 'tutorial',
    primarySubject: 'design_ux',
    title: 'Figma Design Basics & UI Workflow Library',
    provider: 'Figma Resource Library',
    type: 'Official Documentation',
    url: 'https://www.figma.com/resource-library/design-basics/',
    description:
      'Official Figma guides covering wireframing, visual hierarchy, color theory, typography, prototyping, and usability handoff.',
    domains: ['figma', 'ui/ux', 'graphic design'],
    keywords: ['figma', 'wireframing', 'prototyping', 'typography', 'color theory', 'visual hierarchy', 'ui/ux', 'ui design'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'ixdf-ui-design-guide',
    category: 'tutorial',
    primarySubject: 'design_ux',
    title: 'Interaction Design Foundation — User Interface (UI) Design Overview',
    provider: 'Interaction Design Foundation',
    type: 'Educational Article',
    url: 'https://www.interaction-design.org/literature/topics/ui-design',
    description:
      'Foundational literature explaining interface patterns, affordances, consistency, visual design systems, and user-centered interaction.',
    domains: ['ui/ux', 'ui design', 'interaction design'],
    keywords: ['ui design', 'ux design', 'interaction design', 'affordances', 'wireframe', 'prototype', 'usability testing'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'react-docs-describing-ui',
    category: 'tutorial',
    primarySubject: 'react',
    title: 'React Official Docs — Describing the UI (Components & Props)',
    provider: 'React Team',
    type: 'Official Documentation',
    url: 'https://react.dev/learn/describing-the-ui',
    description:
      'Official interactive guide to React components, JSX syntax, props passing, conditional rendering, and pure rendering.',
    domains: ['react', 'frontend', 'components'],
    keywords: ['react', 'components', 'jsx', 'props', 'conditional rendering', 'lists'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'react-docs-adding-interactivity',
    category: 'tutorial',
    primarySubject: 'react',
    title: 'React Official Docs — Adding Interactivity & State',
    provider: 'React Team',
    type: 'Official Documentation',
    url: 'https://react.dev/learn/adding-interactivity',
    description:
      'Explains event handling, useState snapshots, queueing updates, and updating objects/arrays cleanly in React.',
    domains: ['react', 'state management'],
    keywords: ['react', 'usestate', 'state', 'events', 'interactivity', 'immutability'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'ts-docs-everyday-types',
    category: 'tutorial',
    primarySubject: 'typescript',
    title: 'TypeScript Handbook — Everyday Types & Interfaces',
    provider: 'TypeScript Official Docs',
    type: 'Official Documentation',
    url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
    description:
      'Official guide covering primitives, arrays, unions, type aliases, interfaces, and type assertions.',
    domains: ['typescript', 'frontend', 'backend'],
    keywords: ['typescript', 'types', 'interfaces', 'unions', 'type alias', 'static typing'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'ts-docs-generics',
    category: 'tutorial',
    primarySubject: 'typescript',
    title: 'TypeScript Handbook — Reusable Generics',
    provider: 'TypeScript Official Docs',
    type: 'Official Documentation',
    url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
    description:
      'Deep guide to generic functions, generic constraints, keyof types, and reusable type-safe abstractions.',
    domains: ['typescript', 'generics'],
    keywords: ['typescript', 'generics', 'constraints', 'keyof', 'type narrowing'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'pro-git-book',
    category: 'tutorial',
    primarySubject: 'git_devops',
    title: 'Pro Git Book (Complete Free Official Edition)',
    provider: 'Git SCM',
    type: 'Official Documentation',
    url: 'https://git-scm.com/book/en/v2',
    description:
      'The official open-access book covering Git internals, staging, branching, rebasing, remotes, and team workflows.',
    domains: ['git', 'version control', 'devops'],
    keywords: ['git', 'branching', 'rebase', 'merge', 'commit', 'version control', 'github'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'portswigger-web-security',
    category: 'tutorial',
    primarySubject: 'cybersecurity',
    title: 'PortSwigger Web Security Academy — Vulnerability Guides & Labs',
    provider: 'PortSwigger',
    type: 'Official Documentation',
    url: 'https://portswigger.net/web-security',
    description:
      'Free industry-standard web security tutorials and labs covering SQL injection, XSS, CSRF, authentication flaws, and access control.',
    domains: ['cybersecurity', 'web security', 'appsec'],
    keywords: ['cybersecurity', 'sql injection', 'xss', 'csrf', 'authentication', 'authorization', 'vulnerability'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'atlassian-agile-coach',
    category: 'tutorial',
    primarySubject: 'business_management',
    title: 'Atlassian Agile Coach — Scrum, Kanban & Product Roadmaps',
    provider: 'Atlassian',
    type: 'Educational Article',
    url: 'https://www.atlassian.com/agile',
    description:
      'Practical guides on Agile ceremonies, Scrum sprints, Kanban flow, user stories, backlog prioritization, and stakeholder alignment.',
    domains: ['agile', 'scrum', 'product management', 'project management'],
    keywords: ['agile', 'scrum', 'kanban', 'sprint', 'backlog', 'product management', 'project management'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },

  // ==========================================
  // 3. INTERACTIVE EXERCISES & FREE COURSES
  // ==========================================
  {
    id: 'fcc-responsive-web',
    category: 'practice',
    primarySubject: 'css',
    compatibleSubjects: ['css', 'html'],
    title: 'Responsive Web Design (HTML & CSS) Interactive Projects',
    provider: 'freeCodeCamp',
    type: 'Interactive Exercise',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.freecodecamp.org/learn/2022/responsive-web-design',
    description:
      'Hands-on HTML5 and CSS coding challenges covering Flexbox, CSS Grid, media queries, accessibility, and responsive layouts.',
    domains: ['css', 'flexbox', 'grid', 'responsive design', 'html'],
    keywords: [
      'css',
      'flexbox',
      'grid',
      'css grid',
      'responsive',
      'responsive design',
      'media queries',
      'html',
      'layout',
      'modern css',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'fcc-js-algorithms',
    category: 'practice',
    primarySubject: 'javascript',
    title: 'JavaScript Algorithms and Data Structures Certification',
    provider: 'freeCodeCamp',
    type: 'Interactive Exercise',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8',
    description:
      'Interactive browser-based coding exercises covering variables, scope, closures, arrays, array methods, objects, and data structures.',
    domains: ['javascript', 'scope', 'data structures'],
    keywords: [
      'javascript',
      'js',
      'modern javascript',
      'syntax',
      'scope',
      'closure',
      'closures',
      'data structure',
      'data structures',
      'algorithm',
      'array',
      'array methods',
      'object',
      'es6',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'sqlbolt-interactive',
    category: 'practice',
    primarySubject: 'sql',
    title: 'SQLBolt — Interactive SQL Lessons & Query Exercises',
    provider: 'SQLBolt',
    type: 'Interactive Exercise',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://sqlbolt.com/',
    description:
      'Practice SQL SELECT, WHERE, INNER/OUTER JOINs, aggregations, and relational schemas directly in interactive browser tables.',
    domains: ['sql', 'sql joins', 'relational'],
    keywords: [
      'sql',
      'query',
      'join',
      'joins',
      'sql joins',
      'select',
      'database',
      'postgresql',
      'sqlite',
      'relational',
      'schema',
      'schemas',
      'aggregate',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'kaggle-learn',
    category: 'practice',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml', 'sql'],
    title: 'Kaggle Learn Interactive Notebooks (Python, Pandas & ML)',
    provider: 'Kaggle',
    type: 'Interactive Exercise',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.kaggle.com/learn',
    description:
      'Hands-on interactive coding notebooks and programming exercises covering Python fundamentals, functions, data structures, Pandas, SQL, and ML.',
    domains: ['python', 'data science', 'ai'],
    keywords: [
      'python',
      'python fundamentals',
      'syntax',
      'functions',
      'data structures',
      'pandas',
      'numpy',
      'data analysis',
      'data science',
      'machine learning',
      'kaggle',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'freecodecamp-curriculum',
    category: 'practice',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'nodejs_backend', 'sql', 'javascript'],
    isGenericOverview: true,
    title: 'freeCodeCamp Full Coding & Backend Certification Tracks',
    provider: 'freeCodeCamp',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.freecodecamp.org/learn',
    description:
      'Interactive coding challenges and certification projects across Python, Relational Databases, Backend APIs, and JavaScript.',
    domains: ['python', 'backend', 'sql', 'javascript'],
    keywords: ['coding', 'programming', 'api', 'backend', 'node', 'express', 'python', 'testing', 'sql'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'cs50-harvard-x',
    category: 'practice',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'sql', 'javascript', 'css', 'html'],
    isGenericOverview: true,
    title: "CS50's Introduction to Computer Science",
    provider: 'Harvard University (CS50)',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://cs50.harvard.edu/x/',
    description:
      'Harvard University foundational computer science course covering algorithms, data structures, memory, Python, SQL, and web programming.',
    domains: ['computer science', 'programming', 'algorithms', 'python', 'sql'],
    keywords: ['computer science', 'programming', 'algorithms', 'data structures', 'python', 'sql', 'web', 'cs50'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'webdev-learn-courses',
    category: 'practice',
    primarySubject: 'css',
    compatibleSubjects: ['css', 'html', 'javascript'],
    title: 'web.dev Modern Web Development Learning Paths',
    provider: 'Google web.dev',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://web.dev/learn',
    description:
      'Structured self-paced Google courses spanning modern HTML, CSS layout, responsive design, accessibility, and web performance.',
    domains: ['web development', 'frontend', 'css', 'html'],
    keywords: ['web development', 'frontend', 'html', 'css', 'responsive', 'accessibility', 'performance'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'exercism-tracks',
    category: 'practice',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'javascript', 'typescript'],
    isGenericOverview: true,
    title: 'Exercism Mentored Coding Tracks',
    provider: 'Exercism',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://exercism.org/',
    description:
      'Free structured coding tracks across Python, JavaScript, TypeScript, and 70+ languages with test-driven exercises and mentor feedback.',
    domains: ['programming', 'python', 'javascript', 'typescript'],
    keywords: ['programming', 'coding', 'python', 'javascript', 'typescript', 'algorithms', 'practice'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'odin-project-paths',
    category: 'practice',
    primarySubject: 'react',
    compatibleSubjects: ['react', 'nodejs_backend', 'javascript', 'css', 'html'],
    isGenericOverview: true,
    title: 'The Odin Project — Full-Stack JavaScript & Node.js Path',
    provider: 'The Odin Project',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.theodinproject.com/paths',
    description:
      'Free project-based open-source curriculum with guided coding assignments spanning HTML, CSS, JavaScript, React, and Node.js.',
    domains: ['react', 'nodejs', 'javascript', 'css'],
    keywords: ['full stack', 'react', 'node', 'nodejs', 'express', 'javascript', 'typescript', 'project', 'git'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'google-ml-crash-course',
    category: 'practice',
    primarySubject: 'ai_ml',
    title: 'Google Machine Learning Crash Course',
    provider: 'Google for Developers',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://developers.google.com/machine-learning/crash-course',
    description:
      'Interactive exercises and visualizations introducing ML fundamentals, gradient descent, classification, and neural nets.',
    domains: ['machine learning', 'ai'],
    keywords: ['machine learning', 'ml', 'ai', 'regression', 'classification', 'neural network', 'gradient', 'feature', 'data science'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'coursera-google-ux-design',
    category: 'practice',
    primarySubject: 'design_ux',
    title: 'Google UX Design Professional Certificate',
    provider: 'Google / Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/professional-certificates/google-ux-design',
    description:
      'Structured product design curriculum covering user research, wireframing, low-fidelity and high-fidelity prototypes in Figma, and usability testing.',
    domains: ['ui/ux', 'product design', 'figma', 'usability'],
    keywords: ['ui', 'ux', 'ui/ux', 'designer', 'figma', 'wireframe', 'prototype', 'usability', 'user research', 'design system'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'coursera-google-data-analytics',
    category: 'practice',
    primarySubject: 'sql',
    compatibleSubjects: ['sql', 'ai_ml', 'finance_economics'],
    title: 'Google Data Analytics Professional Certificate',
    provider: 'Google / Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
    description:
      'Industry-aligned data analytics pathway covering spreadsheets, SQL querying, data cleaning, R/Python exploration, and executive dashboards.',
    domains: ['data analytics', 'data analysis', 'sql', 'spreadsheets'],
    keywords: ['data analyst', 'data analysis', 'data analytics', 'sql', 'excel', 'spreadsheets', 'visualization', 'dashboard', 'statistics'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'nngroup-ux-articles',
    category: 'tutorial',
    primarySubject: 'design_ux',
    title: 'Nielsen Norman Group — UX Research & Usability Articles',
    provider: 'Nielsen Norman Group',
    type: 'Educational Article',
    url: 'https://www.nngroup.com/articles/',
    description:
      'Evidence-based articles on usability heuristics, information architecture, interaction design, UX research methods, and interface clarity.',
    domains: ['ui/ux', 'usability', 'ux research'],
    keywords: ['ui', 'ux', 'ui/ux', 'usability', 'heuristics', 'user research', 'wireframe', 'information architecture', 'interaction design'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'microsoft-learn-training',
    category: 'practice',
    primarySubject: 'git_devops',
    compatibleSubjects: ['git_devops', 'typescript', 'ai_ml', 'cybersecurity'],
    title: 'Microsoft Learn Interactive Role-Based Modules',
    provider: 'Microsoft Learn',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://learn.microsoft.com/en-us/training/',
    description:
      'Free hands-on sandboxes and modular learning paths covering TypeScript, Cloud, Docker, DevOps, AI, and security.',
    domains: ['cloud', 'devops', 'docker', 'typescript', 'security'],
    keywords: ['cloud', 'azure', 'devops', 'docker', 'ci/cd', 'architecture', 'security', 'typescript', 'ai'],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'khan-academy-cs',
    category: 'practice',
    primarySubject: 'javascript',
    compatibleSubjects: ['javascript', 'html', 'css', 'sql'],
    isGenericOverview: true,
    title: 'Khan Academy Interactive Computer Programming',
    provider: 'Khan Academy',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.khanacademy.org/computing/computer-programming',
    description:
      'Interactive step-by-step challenges for JavaScript, HTML/CSS, and SQL fundamentals.',
    domains: ['javascript', 'html', 'css', 'sql'],
    keywords: ['programming', 'javascript', 'html', 'css', 'sql', 'algorithm', 'beginner'],
    levels: ['Beginner'],
    language: 'en',
  },
  {
    id: 'khan-academy-finance',
    category: 'practice',
    primarySubject: 'finance_economics',
    title: 'Economics, Accounting & Finance Interactive Practice',
    provider: 'Khan Academy',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.khanacademy.org/economics-finance-domain',
    description:
      'Free structured lessons and practice problems on financial statements, accounting, valuation, and microeconomics.',
    domains: ['finance', 'economics', 'accounting'],
    keywords: ['finance', 'accounting', 'income statement', 'balance sheet', 'cash flow', 'npv', 'valuation', 'economics', 'budget'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'hubspot-academy',
    category: 'practice',
    primarySubject: 'business_management',
    title: 'HubSpot Academy Free Marketing Certifications',
    provider: 'HubSpot Academy',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://academy.hubspot.com/',
    description:
      'Free certification courses and practical exercises covering digital marketing, SEO, content strategy, and analytics.',
    domains: ['marketing', 'business'],
    keywords: ['marketing', 'seo', 'content', 'digital marketing', 'funnel', 'analytics', 'campaign', 'growth', 'business'],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mit-ocw',
    category: 'practice',
    primarySubject: 'python',
    compatibleSubjects: ['python', 'ai_ml', 'finance_economics'],
    isGenericOverview: true,
    title: 'MIT OpenCourseWare Assignments & Lecture Materials',
    provider: 'MIT OpenCourseWare',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://ocw.mit.edu/',
    description:
      'Open university problem sets, lecture notes, and exams across algorithms, systems, math, and computer science.',
    domains: ['computer science', 'algorithms', 'systems'],
    keywords: ['algorithm', 'algorithms', 'data structure', 'linear algebra', 'calculus', 'statistics', 'probability', 'computer science', 'systems'],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Academic Writing, Research Methodology, Public Speaking & GIS External Courses ---
  {
    id: 'coursera-writing-sciences',
    category: 'practice',
    primarySubject: 'academic_research',
    title: 'Writing in the Sciences (Stanford University)',
    provider: 'Stanford University / Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/learn/sciwrite',
    description:
      'University course teaching scientists and graduate researchers how to write clear, concise, impactful research papers and academic manuscripts.',
    domains: ['academic writing', 'research writing', 'scientific writing'],
    keywords: [
      'academic writing',
      'research writing',
      'scientific writing',
      'manuscript',
      'research paper',
      'peer review',
      'english proficiency',
      'graduate',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'coursera-academic-writing-research',
    category: 'practice',
    primarySubject: 'academic_research',
    title: 'Academic Writing and Research Skills Specialization',
    provider: 'Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/specializations/academic-writing-research-methods',
    description:
      'Structured academic program covering scholarly reading, research methodology, literature synthesis, academic writing conventions, and citation.',
    domains: ['academic writing', 'research methodology', 'research writing'],
    keywords: [
      'academic writing',
      'research methodology',
      'research writing',
      'literature review',
      'citation',
      'academic skills',
      'english proficiency',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'coursera-research-methods',
    category: 'practice',
    primarySubject: 'academic_research',
    title: 'Understanding Research Methods',
    provider: 'University of London / Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/learn/research-methods',
    description:
      'Demystifies qualitative and quantitative research methodology, formulating research questions, literature reviews, and postgraduate study design.',
    domains: ['research methodology', 'research design', 'academic research'],
    keywords: [
      'research methodology',
      'research methods',
      'research design',
      'qualitative',
      'quantitative',
      'literature review',
      'thesis',
      'postgraduate',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'coursera-public-speaking',
    category: 'practice',
    primarySubject: 'public_speaking',
    title: 'Introduction to Public Speaking (University of Washington)',
    provider: 'University of Washington / Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/learn/public-speaking',
    description:
      'Practical university speaking course covering speech organization, persuasive delivery, academic presentation framing, and audience engagement.',
    domains: ['public speaking', 'presentation skills', 'academic presentation'],
    keywords: [
      'public speaking',
      'presentation skills',
      'academic presentation',
      'speech',
      'oral presentation',
      'delivery',
      'english proficiency',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'spatialthoughts-qgis-course',
    category: 'practice',
    primarySubject: 'geography_gis',
    title: 'Introduction to QGIS — Free Open GIS Course',
    provider: 'Spatial Thoughts',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://spatialthoughts.com/courses/introduction-to-qgis/',
    description:
      'Self-paced, ad-free open course with hands-on exercises on GIS data creation, spatial joins, geoprocessing, and research map production in QGIS.',
    domains: ['gis', 'qgis', 'geography research', 'geographic information systems'],
    keywords: [
      'gis',
      'qgis',
      'geographic information systems',
      'geography',
      'geography research',
      'spatial analysis',
      'mapping',
      'cartography',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'coursera-ucdavis-gis',
    category: 'practice',
    primarySubject: 'geography_gis',
    title: 'Geographic Information Systems (GIS) Specialization',
    provider: 'UC Davis / Coursera',
    type: 'Free Online Course',
    pricing: 'Free Audit / Paid Certificate',
    isCourseProgram: true,
    url: 'https://www.coursera.org/specializations/gis',
    description:
      'University-level GIS specialization covering cartography, spatial data formats, geospatial analysis, remote sensing, and applied geography research.',
    domains: ['gis', 'geographic information systems', 'geography', 'geography research'],
    keywords: [
      'gis',
      'geographic information systems',
      'geography',
      'geography research',
      'spatial analysis',
      'geospatial',
      'cartography',
      'remote sensing',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },

  // --- Engineering & Economics/Finance Free Online Courses ---
  {
    id: 'khan-academy-electrical-engineering',
    category: 'practice',
    primarySubject: 'engineering',
    title: 'Electrical Engineering Interactive Course (Khan Academy)',
    provider: 'Khan Academy',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.khanacademy.org/science/electrical-engineering',
    description:
      'Free structured electrical engineering curriculum covering circuit analysis, resistors, op-amps, semiconductors, and signal systems.',
    domains: ['electrical engineering', 'circuits', 'engineering'],
    keywords: [
      'electrical engineering',
      'circuit analysis',
      'circuits',
      'ohm',
      'signal processing',
      'engineering',
      'systems engineering',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
  {
    id: 'mit-ocw-mechanical-engineering',
    category: 'practice',
    primarySubject: 'engineering',
    title: 'MIT OpenCourseWare — Mechanical Engineering Courses',
    provider: 'MIT OpenCourseWare',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://ocw.mit.edu/search/?d=Mechanical+Engineering',
    description:
      'Free MIT lecture notes, problem sets, and exams across engineering design, mechanics, dynamics, thermodynamics, and manufacturing.',
    domains: ['mechanical engineering', 'engineering', 'systems engineering'],
    keywords: [
      'mechanical engineering',
      'engineering design',
      'systems engineering',
      'systems thinking',
      'thermodynamics',
      'statics',
      'dynamics',
      'cad',
      'finite element',
      'engineering',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'mit-ocw-eecs',
    category: 'practice',
    primarySubject: 'engineering',
    compatibleSubjects: ['engineering', 'python'],
    title: 'MIT OpenCourseWare — Electrical Engineering & Computer Systems',
    provider: 'MIT OpenCourseWare',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://ocw.mit.edu/search/?d=Electrical+Engineering+and+Computer+Science',
    description:
      'Open university courses spanning circuits, electronics, signals and systems, control theory, and embedded hardware.',
    domains: ['electrical engineering', 'control systems', 'engineering'],
    keywords: [
      'electrical engineering',
      'circuit analysis',
      'circuits',
      'control systems',
      'signal processing',
      'systems engineering',
      'engineering',
    ],
    levels: ['Intermediate', 'Advanced'],
    language: 'en',
  },
  {
    id: 'khan-academy-microeconomics',
    category: 'practice',
    primarySubject: 'finance_economics',
    compatibleSubjects: ['finance_economics', 'business_management'],
    title: 'Microeconomics & Market Strategy Course (Khan Academy)',
    provider: 'Khan Academy',
    type: 'Free Online Course',
    pricing: 'Free',
    isCourseProgram: true,
    url: 'https://www.khanacademy.org/economics-finance-domain/microeconomics',
    description:
      'Interactive exercises and videos covering supply and demand, pricing, market structure, production costs, and business decision economics.',
    domains: ['economics', 'business', 'finance'],
    keywords: [
      'economics',
      'microeconomics',
      'supply',
      'demand',
      'pricing',
      'business',
      'finance',
      'strategy',
    ],
    levels: ['Beginner', 'Intermediate'],
    language: 'en',
  },
];

export interface ExploreResourceCatalogEntry {
  id: string;
  tabCategory: 'video' | 'documentation' | 'course';
  primarySubject: SubjectFamily;
  compatibleSubjects: SubjectFamily[];
  title: string;
  provider: string;
  type: VerifiedResourceType;
  url: string;
  description: string;
  domains: string[];
  keywords: string[];
  levels: KnowledgeLevel[];
  pricing?: 'Free' | 'Free Audit / Paid Certificate' | 'Paid';
  videoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  embedAllowed?: boolean;
}

export function getExploreResourceCatalog(): ExploreResourceCatalogEntry[] {
  return VERIFIED_RESOURCE_CATALOG.map((entry) => {
    const tabCategory =
      entry.category === 'video'
        ? 'video'
        : entry.category === 'tutorial'
        ? 'documentation'
        : 'course';
    const pricing = entry.pricing ?? (entry.category === 'practice' ? 'Free' : undefined);
    const type: VerifiedResourceType =
      tabCategory === 'course' && entry.type === 'Interactive Exercise'
        ? 'Free Online Course'
        : entry.type;

    return {
      id: entry.id,
      tabCategory,
      primarySubject: entry.primarySubject,
      compatibleSubjects: entry.compatibleSubjects ?? [entry.primarySubject],
      title: entry.title,
      provider: entry.provider,
      type,
      url: entry.url,
      description: entry.description,
      domains: entry.domains,
      keywords: entry.keywords,
      levels: entry.levels ?? ['Beginner', 'Intermediate'],
      pricing,
      videoId: entry.videoId,
      embedUrl: entry.embedUrl,
      thumbnailUrl: entry.thumbnailUrl,
      embedAllowed: entry.embedAllowed,
    };
  });
}

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsWholeTerm(text: string, tokens: Set<string>, term: string): boolean {
  const lower = term.toLowerCase().trim();
  if (!lower) return false;
  if (lower.includes(' ')) {
    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(lower)}([^a-z0-9]|$)`, 'i');
    return regex.test(text);
  }
  if (tokens.has(lower)) return true;
  return false;
}

function scoreKeywordsInText(
  keywords: string[],
  text: string,
  tokens: Set<string>,
  phraseWeight: number,
  exactTokenWeight: number,
  substringWeight: number
): number {
  if (!text) return 0;
  let score = 0;
  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();
    if (lowerKw.includes(' ')) {
      if (containsWholeTerm(text, tokens, lowerKw)) {
        score += phraseWeight;
      }
    } else if (tokens.has(lowerKw)) {
      score += exactTokenWeight;
    } else if (lowerKw.length >= 5 && text.includes(lowerKw)) {
      score += substringWeight;
    }
  }
  return score;
}

export const SUBJECT_DETECTION_TERMS: Record<SubjectFamily, string[]> = {
  css: [
    'css',
    'flexbox',
    'flex',
    'css grid',
    'grid layout',
    'responsive design',
    'responsive web',
    'media query',
    'media queries',
    'mobile-first',
    'box model',
    'stylesheet',
    'tailwind',
    'scss',
    'sass',
  ],
  html: ['html', 'html5', 'semantic markup', 'semantic html', 'semantic tags'],
  javascript: [
    'javascript',
    'js',
    'es6',
    'closure',
    'closures',
    'lexical scope',
    'block scope',
    'function scope',
    'hoisting',
    'array method',
    'array methods',
    'async/await',
    'promise',
    'promises',
    'event loop',
    'dom manipulation',
  ],
  typescript: ['typescript', 'tsconfig', 'static typing', 'type narrowing'],
  react: ['react', 'jsx', 'usestate', 'useeffect', 'usecontext', 'usereducer', 'virtual dom'],
  nodejs_backend: [
    'node',
    'nodejs',
    'node.js',
    'express',
    'expressjs',
    'middleware',
    'http server',
    'software architecture',
    'system design',
  ],
  sql: [
    'sql',
    'postgresql',
    'postgres',
    'sqlite',
    'mysql',
    'sql join',
    'sql joins',
    'inner join',
    'left join',
    'right join',
    'outer join',
    'relational schema',
    'relational schemas',
    'relational database',
    'foreign key',
    'primary key',
    'window function',
    'window functions',
    'cte',
    'group by',
    'subquery',
    'data analyst',
    'data analytics',
    'data querying',
    'business intelligence',
  ],
  python: [
    'python',
    'fastapi',
    'django',
    'pandas',
    'numpy',
    'matplotlib',
    'seaborn',
    'pytest',
    'venv',
    'list comprehension',
    'dataframe',
    'data cleaning',
    'exploratory data analysis',
  ],
  ai_ml: [
    'machine learning',
    'deep learning',
    'ai engineer',
    'artificial intelligence',
    'generative ai',
    'pytorch',
    'scikit',
    'sklearn',
    'neural network',
    'transformer',
    'transformers',
    'llm',
    'large language model',
    'prompt engineering',
    'rag',
    'retrieval augmented',
    'embeddings',
    'fine-tuning',
    'data science',
    'data analysis',
    'data analytics',
    'data analyst',
    'data visualization',
    'statistics',
    'hypothesis testing',
    'a/b testing',
    'exploratory data analysis',
    'eda',
  ],
  git_devops: [
    'git',
    'github',
    'docker',
    'dockerfile',
    'kubernetes',
    'ci/cd',
    'version control',
    'software architecture',
    'system design',
  ],
  design_ux: [
    'ui/ux',
    'ui design',
    'ux design',
    'user experience',
    'user interface',
    'user research',
    'usability',
    'usability testing',
    'figma',
    'wireframe',
    'wireframing',
    'prototype',
    'prototyping',
    'visual hierarchy',
    'typography',
    'color theory',
    'graphic design',
    'design thinking',
    'information architecture',
    'auto layout',
    'wcag',
    'a11y',
    'aria',
    'design system',
    'mockup',
  ],
  cybersecurity: ['cybersecurity', 'owasp', 'nist', 'sql injection', 'xss', 'csrf', 'vulnerability'],
  business_management: [
    'business',
    'business management',
    'project management',
    'product management',
    'operations management',
    'strategic management',
    'organizational',
    'stakeholder',
    'supply chain',
    'marketing',
    'seo',
    'okr',
    'swot',
    'leadership',
    'entrepreneurship',
    'digital marketing',
    'agile management',
  ],
  academic_research: [
    'academic writing',
    'research writing',
    'research methodology',
    'research methods',
    'research design',
    'literature review',
    'scholarly writing',
    'thesis',
    'dissertation',
    'citation',
    'english proficiency',
    'academic skills',
    'essay writing',
  ],
  public_speaking: [
    'public speaking',
    'presentation skills',
    'academic presentation',
    'oral presentation',
    'speech',
    'presentation',
    'visual communication',
    'rhetoric',
  ],
  geography_gis: [
    'geography',
    'geographic',
    'geography research',
    'geographic information systems',
    'environmental research',
    'environmental science',
    'gis',
    'qgis',
    'arcgis',
    'cartography',
    'spatial analysis',
    'geospatial',
    'remote sensing',
  ],
  finance_economics: ['finance', 'accounting', 'valuation', 'cash flow', 'balance sheet', 'economics'],
  engineering: [
    'engineering',
    'mechanical engineering',
    'electrical engineering',
    'civil engineering',
    'systems engineering',
    'systems design',
    'chemical engineering',
    'industrial engineering',
    'aerospace engineering',
    'engineering design',
    'electronics',
    'thermodynamics',
    'circuits',
    'circuit analysis',
    'ohm',
    'statics',
    'dynamics',
    'control systems',
    'cad',
    'finite element',
    'signal processing',
    'structural analysis',
    'materials science',
  ],
};

/**
 * Infers the primary SubjectFamily set strictly from the lesson itself
 * (title, description, and learning objectives) so career goals or unrelated
 * profile skills never leak another language/framework into the lesson.
 */
export function detectLessonSubjects(
  lessonTitle: string,
  lessonDescription = '',
  learningObjectives: string[] = []
): Set<SubjectFamily> {
  const titleLower = lessonTitle.toLowerCase();
  const titleTokens = new Set(tokenize(titleLower));
  const detailLower = [lessonDescription, ...learningObjectives].join(' ').toLowerCase();
  const detailTokens = new Set(tokenize(detailLower));
  const combinedLower = `${titleLower} ${detailLower}`.trim();
  const combinedTokens = new Set([...titleTokens, ...detailTokens]);

  const titleMatched = new Set<SubjectFamily>();
  const detailMatched = new Set<SubjectFamily>();

  (Object.keys(SUBJECT_DETECTION_TERMS) as SubjectFamily[]).forEach((family) => {
    const terms = SUBJECT_DETECTION_TERMS[family];
    for (const term of terms) {
      if (containsWholeTerm(titleLower, titleTokens, term)) {
        titleMatched.add(family);
      } else if (containsWholeTerm(combinedLower, combinedTokens, term)) {
        detailMatched.add(family);
      }
    }
    // Special CSS signal: "grid" + ("flexbox" or "responsive" or "layout") in title/details
    if (
      family === 'css' &&
      (titleTokens.has('grid') || titleTokens.has('responsive')) &&
      (combinedTokens.has('css') ||
        combinedTokens.has('flexbox') ||
        combinedTokens.has('layout') ||
        combinedTokens.has('styling') ||
        combinedTokens.has('breakpoints'))
    ) {
      titleMatched.add('css');
    }
    // Special SQL signal: "joins" + ("schema" or "schemas" or "relational" or "tables")
    if (
      family === 'sql' &&
      (combinedTokens.has('joins') || combinedTokens.has('join')) &&
      (combinedTokens.has('relational') ||
        combinedTokens.has('schema') ||
        combinedTokens.has('schemas') ||
        combinedTokens.has('database') ||
        combinedTokens.has('tables'))
    ) {
      titleMatched.add('sql');
    }
  });

  // Prevent software/AI/data engineering phrases ("Prompt Engineering", "Feature Engineering", "Software Engineering")
  // from falsely pulling physical/chemical/civil engineering courses into AI/software lessons.
  const hasNonPhysicalEngineeringModifier = [
    'prompt engineering',
    'software engineering',
    'feature engineering',
    'data engineering',
    'ml engineering',
    'ai engineering',
    'frontend engineering',
    'backend engineering',
    'social engineering',
    'reverse engineering',
  ].some((term) => containsWholeTerm(combinedLower, combinedTokens, term));

  const hasExplicitPhysicalEngineeringSignal = [
    'mechanical engineering',
    'electrical engineering',
    'civil engineering',
    'chemical engineering',
    'industrial engineering',
    'aerospace engineering',
    'systems engineering',
    'engineering design',
    'thermodynamics',
    'circuit analysis',
    'circuits',
    'statics',
    'dynamics',
    'finite element',
    'structural analysis',
    'materials science',
  ].some((term) => containsWholeTerm(combinedLower, combinedTokens, term));

  if (hasNonPhysicalEngineeringModifier && !hasExplicitPhysicalEngineeringSignal) {
    titleMatched.delete('engineering');
    detailMatched.delete('engineering');
  }

  // Prevent Engineering lessons ("Engineering Design Process", "Systems Engineering") from falsely matching UI/UX design
  const hasExplicitUiUxSignal = ['ui/ux', 'figma', 'wireframe', 'mockup', 'wcag', 'a11y', 'aria'].some(
    (term) => containsWholeTerm(combinedLower, combinedTokens, term)
  );
  if ((titleMatched.has('engineering') || detailMatched.has('engineering')) && !hasExplicitUiUxSignal) {
    titleMatched.delete('design_ux');
    detailMatched.delete('design_ux');
  }

  // If the lesson title itself establishes clear subject(s), keep those strict
  // and only include detail subjects if they also appear strongly or are HTML/CSS companions.
  if (titleMatched.size > 0) {
    const result = new Set<SubjectFamily>(titleMatched);
    // e.g., if title mentions CSS and detail explicitly teaches HTML+CSS together:
    if (titleMatched.has('css') && detailMatched.has('html') && detailLower.includes('html')) {
      result.add('html');
    }
    if (titleMatched.has('python') && detailMatched.has('ai_ml')) {
      result.add('ai_ml');
    }
    return result;
  }

  return detailMatched;
}

function entryMatchesSubjectSet(
  entry: CatalogEntry,
  detectedSubjects: Set<SubjectFamily>
): boolean {
  if (detectedSubjects.size === 0) return false;
  if (detectedSubjects.has(entry.primarySubject)) return true;
  if (entry.compatibleSubjects?.some((s) => detectedSubjects.has(s))) return true;
  return false;
}

/**
 * Checks whether a live YouTube video title/description aligns with the detected
 * lesson subjects and does NOT belong to a conflicting unrelated language/subject.
 */
function isYouTubeCandidateSubjectCompatible(
  videoTitle: string,
  videoDescription: string,
  detectedSubjects: Set<SubjectFamily>
): boolean {
  if (detectedSubjects.size === 0) return true;

  const videoText = `${videoTitle} ${videoDescription}`.toLowerCase();
  const videoTokens = new Set(tokenize(videoText));

  // If detected subjects are strictly CSS (or CSS+HTML), reject videos centered on JS, Python, SQL, PHP, Java, C++, etc.
  const conflictingSubjectTerms: { family: SubjectFamily; markers: string[] }[] = [
    { family: 'javascript', markers: ['javascript', 'ecmascript', 'vanilla js', 'js crash course'] },
    { family: 'python', markers: ['python', 'django', 'flask', 'fastapi'] },
    { family: 'sql', markers: ['sql', 'mysql', 'postgresql', 'sqlite'] },
    { family: 'react', markers: ['react', 'react.js', 'reactjs', 'next.js', 'nextjs'] },
    { family: 'nodejs_backend', markers: ['node.js', 'nodejs', 'express.js', 'expressjs'] },
    { family: 'typescript', markers: ['typescript'] },
  ];

  const titleLower = videoTitle.toLowerCase();
  const titleTokens = new Set(tokenize(titleLower));

  for (const conflict of conflictingSubjectTerms) {
    if (detectedSubjects.has(conflict.family)) continue;
    // If the video's OWN TITLE highlights a conflicting subject (e.g. "JavaScript Crash Course") -> reject immediately
    const conflictInVideoTitle = conflict.markers.some((m) =>
      containsWholeTerm(titleLower, titleTokens, m)
    );
    if (conflictInVideoTitle) {
      // Allow ONLY if video title ALSO explicitly centers on one of the detectedSubjects (e.g. "HTML & CSS for React Developers"? Still risky—prefer pure subject videos!)
      const hasDetectedInTitle = Array.from(detectedSubjects).some((subj) =>
        SUBJECT_DETECTION_TERMS[subj].some((term) =>
          containsWholeTerm(titleLower, titleTokens, term)
        )
      );
      if (!hasDetectedInTitle) {
        return false;
      }
      // Even if both appear (e.g., "HTML CSS JavaScript Full Course"), reject generic multi-language crash courses when lesson targets CSS specifically
      if (detectedSubjects.has('css') && !detectedSubjects.has('javascript') && conflict.family === 'javascript') {
        return false;
      }
    }
  }

  // Must match at least one term from the detected lesson subject(s) in title or description
  return Array.from(detectedSubjects).some((subj) =>
    SUBJECT_DETECTION_TERMS[subj].some((term) =>
      containsWholeTerm(videoText, videoTokens, term)
    )
  );
}

export interface MatchTrustedResourcesInput {
  lessonTitle: string;
  lessonDescription?: string;
  learningObjectives?: string[];
  stageTitle?: string;
  careerGoal?: string;
  knowledgeLevel?: KnowledgeLevel;
  knowledgeGaps?: string[];
  learningInterests?: string[];
  currentSkills?: string[];
  preferredLanguage?: string;
}

function inferLearningPurpose(
  title: string,
  description: string,
  index: number,
  isGenericOverview?: boolean
): string {
  const text = `${title} ${description}`.toLowerCase();
  if (
    index === 0 &&
    (text.includes('intro') ||
      text.includes('beginner') ||
      text.includes('basics') ||
      text.includes('101') ||
      text.includes('fundamental'))
  ) {
    return 'Beginner Introduction';
  }
  if (
    text.includes('project') ||
    text.includes('build') ||
    text.includes('hands-on') ||
    text.includes('workshop') ||
    text.includes('practical')
  ) {
    return 'Practical Demonstration';
  }
  if (isGenericOverview || text.includes('full course') || text.includes('complete')) {
    return 'Detailed Tutorial';
  }
  if (text.includes('deep') || text.includes('advanced') || text.includes('state of') || text.includes('architecture')) {
    return 'Deeper View';
  }
  const cycle = [
    'Concept Explanation',
    'Detailed Tutorial',
    'Practical Demonstration',
    'Beginner Introduction',
    'Deeper View',
  ];
  return cycle[index % cycle.length];
}

function toTrustedResourceItem(
  entry: CatalogEntry,
  matchScope: ResourceMatchScope,
  purposeIndex = 0
): TrustedResourceItem {
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    provider: entry.provider,
    type: entry.type,
    url: entry.url,
    description: entry.description,
    matchScope,
    ...(entry.category === 'video'
      ? {
          learningPurpose: inferLearningPurpose(
            entry.title,
            entry.description,
            purposeIndex,
            entry.isGenericOverview
          ),
        }
      : {}),
    ...(entry.videoId ? { videoId: entry.videoId } : {}),
    ...(entry.embedUrl ? { embedUrl: entry.embedUrl } : {}),
    ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    ...(entry.embedAllowed !== undefined ? { embedAllowed: entry.embedAllowed } : {}),
  };
}

const GENERIC_SUBJECT_ROOT_TOKENS = new Set([
  'css',
  'html',
  'html5',
  'javascript',
  'js',
  'typescript',
  'ts',
  'react',
  'node',
  'nodejs',
  'node.js',
  'sql',
  'python',
  'git',
  'docker',
  'security',
  'cybersecurity',
  'business',
  'marketing',
  'finance',
  'economics',
  'ui',
  'ux',
  'ai',
  'ml',
  'programming',
  'coding',
  'web',
]);

const OVERVIEW_LESSON_INTENT_TOKENS = new Set([
  'fundamentals',
  'fundamental',
  'basics',
  'basic',
  'introduction',
  'intro',
  'overview',
  'getting',
  'started',
  'foundations',
  'foundation',
  'primer',
  'essentials',
]);

function countSpecificKeywordMatches(
  keywords: string[],
  text: string,
  tokens: Set<string>
): number {
  if (!text) return 0;
  let specificMatches = 0;
  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase().trim();
    if (!lowerKw) continue;
    if (lowerKw.includes(' ')) {
      if (containsWholeTerm(text, tokens, lowerKw)) {
        specificMatches += 1;
      }
    } else if (!GENERIC_SUBJECT_ROOT_TOKENS.has(lowerKw) && tokens.has(lowerKw)) {
      specificMatches += 1;
    }
  }
  return specificMatches;
}

/**
 * Matches real, verified educational videos, written tutorials, and interactive
 * exercises/courses strictly tailored to the current lesson subject and student profile.
 *
 * Prioritization hierarchy:
 * 1. Exact lesson title
 * 2. Lesson description
 * 3. Learning objectives
 * 4. Student knowledge gaps from previous assessments (same subject only)
 * 5. Closely related topics within the same subject
 *
 * Never forces 2 videos when only 1 (or 0) relevant match exists.
 */
export async function matchTrustedResourcesForLesson(
  params: MatchTrustedResourcesInput
): Promise<TrustedResourcesBundle> {
  const lessonTitleLower = params.lessonTitle.toLowerCase();
  const lessonTitleTokens = new Set(tokenize(lessonTitleLower));

  const lessonDescLower = (params.lessonDescription ?? '').toLowerCase();
  const lessonDescTokens = new Set(tokenize(lessonDescLower));

  const objectivesText = (params.learningObjectives ?? []).join(' ').toLowerCase();
  const objectivesTokens = new Set(tokenize(objectivesText));

  const lessonDetailText = `${lessonDescLower} ${objectivesText}`.trim();
  const lessonDetailTokens = new Set([...lessonDescTokens, ...objectivesTokens]);

  const gapsText = (params.knowledgeGaps ?? []).join(' ').toLowerCase();
  const gapsTokens = new Set(tokenize(gapsText));

  // Same-subject context text (used ONLY as light tie-breaker AFTER strict subject isolation)
  const stageTextLower = (params.stageTitle ?? '').toLowerCase();
  const stageTokens = new Set(tokenize(stageTextLower));

  let detectedSubjects = detectLessonSubjects(
    params.lessonTitle,
    params.lessonDescription ?? '',
    params.learningObjectives ?? []
  );

  // Only when the lesson's own text establishes ZERO specific subjects (e.g., "Portfolio Case Study" or "Data Exploration"),
  // infer subject families from stageTitle + careerGoal so broad lessons still discover domain-relevant resources.
  if (detectedSubjects.size === 0 && (params.stageTitle || params.careerGoal)) {
    detectedSubjects = detectLessonSubjects(
      params.stageTitle ?? '',
      `${params.careerGoal ?? ''} ${params.lessonDescription ?? ''}`.trim(),
      params.learningObjectives ?? []
    );
  }

  const primaryLessonText = `${lessonTitleLower} ${lessonDetailText}`.trim();
  const primaryLessonTokens = new Set([...lessonTitleTokens, ...lessonDetailTokens]);
  const hasOverviewIntent = Array.from(lessonTitleTokens).some((t) =>
    OVERVIEW_LESSON_INTENT_TOKENS.has(t)
  );
  const preferredLang = (params.preferredLanguage ?? 'en').toLowerCase().slice(0, 2);

  interface ScoredEntry {
    entry: CatalogEntry;
    titleScore: number;
    lessonScore: number;
    gapScore: number;
    totalScore: number;
    matchScope: ResourceMatchScope;
  }

  const scored: ScoredEntry[] = [];

  for (const entry of VERIFIED_RESOURCE_CATALOG) {
    // 1. Strict subject-family gate: reject entries outside the lesson's subject family
    if (!entryMatchesSubjectSet(entry, detectedSubjects)) {
      continue;
    }

    // 2. Prioritize: (1) Lesson Title -> (2) Lesson Description -> (3) Learning Objectives -> (4) Knowledge Gaps -> (5) Related Same-Subject Context
    const titleScore = scoreKeywordsInText(
      entry.keywords,
      lessonTitleLower,
      lessonTitleTokens,
      14,
      9,
      4
    );
    const descriptionScore = scoreKeywordsInText(
      entry.keywords,
      lessonDescLower,
      lessonDescTokens,
      8,
      5,
      2
    );
    const objectivesScore = scoreKeywordsInText(
      entry.keywords,
      objectivesText,
      objectivesTokens,
      7,
      4,
      2
    );
    const gapScore = scoreKeywordsInText(
      entry.keywords,
      gapsText,
      gapsTokens,
      7,
      5,
      2
    );

    const stageSameSubjectScore = scoreKeywordsInText(
      entry.keywords,
      stageTextLower,
      stageTokens,
      3,
      2,
      1
    );

    const specificLessonMatches = countSpecificKeywordMatches(
      entry.keywords,
      primaryLessonText,
      primaryLessonTokens
    );

    const lessonScore = titleScore + descriptionScore + objectivesScore;

    let domainBoost = 0;
    for (const domain of entry.domains) {
      const lowerDom = domain.toLowerCase();
      if (lessonTitleLower.includes(lowerDom)) {
        domainBoost += 6;
      } else if (lessonDetailText.includes(lowerDom)) {
        domainBoost += 3;
      }
    }

    // Also reward direct overlap between lesson title/detail words and the resource title itself
    const entryTitleTokens = new Set(tokenize(entry.title));
    let resourceTitleOverlap = 0;
    for (const tok of lessonTitleTokens) {
      if (tok.length >= 3 && entryTitleTokens.has(tok)) {
        resourceTitleOverlap += 4;
      }
    }

    let levelBoost = 0;
    if (params.knowledgeLevel && entry.levels?.includes(params.knowledgeLevel)) {
      levelBoost += 1;
    }

    let languageBoost = 0;
    if (entry.language && entry.language === preferredLang) {
      languageBoost += 1;
    }

    // Slight preference for topic-specific resources over generic "Crash Course / Full Course"
    // when the lesson targets specific subtopics (e.g. Flexbox + Grid + Responsive Design).
    const specificityAdjustment = entry.isGenericOverview ? -6 : 2;

    // Slight preference for primarySubject direct match over compatible multi-subject fallback
    const primarySubjectBonus =
      detectedSubjects.size === 0 || detectedSubjects.has(entry.primarySubject) ? 6 : 0;

    const totalScore =
      lessonScore +
      gapScore +
      resourceTitleOverlap +
      domainBoost +
      stageSameSubjectScore +
      primarySubjectBonus +
      levelBoost +
      languageBoost +
      specificityAdjustment;

    // Exact match requires specific subtopic alignment OR overview-intent lesson matching foundational/overview resources.
    const isExactMatch =
      (specificLessonMatches >= 1 &&
        (titleScore >= 9 || lessonScore >= 14 || (resourceTitleOverlap >= 8 && lessonScore >= 8))) ||
      (hasOverviewIntent && (titleScore >= 9 || lessonScore >= 14));

    // Broader fallback allowed ONLY within the same subject family
    const isBroaderMatch =
      !isExactMatch &&
      (lessonScore >= 5 ||
        (gapScore >= 5 && domainBoost >= 3) ||
        (domainBoost >= 6 && totalScore >= 12) ||
        (stageSameSubjectScore >= 3 && totalScore >= 7));

    if (isExactMatch || isBroaderMatch) {
      scored.push({
        entry,
        titleScore,
        lessonScore,
        gapScore,
        totalScore,
        matchScope: isExactMatch ? 'exact' : 'broader',
      });
    }
  }

  scored.sort((a, b) => {
    if (a.matchScope !== b.matchScope) {
      return a.matchScope === 'exact' ? -1 : 1;
    }
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.lessonScore !== a.lessonScore) return b.lessonScore - a.lessonScore;
    return b.gapScore - a.gapScore;
  });

  // Target 3 to 5 distinct verified videos per lesson, strictly within detected subject families.
  // Exact matches rank first; fill up to 5 with broader same-subject verified videos only (never unrelated topics).
  const TARGET_MAX_VIDEOS = 5;
  const allRelevantVideos = scored.filter((s) => s.entry.category === 'video');
  const exactVideos = allRelevantVideos.filter((s) => s.matchScope === 'exact');
  const broaderVideos = allRelevantVideos.filter((s) => s.matchScope !== 'exact');

  const selectedCuratedEntries: ScoredEntry[] = [];
  const seenVideoKeys = new Set<string>();
  const addUniqueVideo = (candidate: ScoredEntry) => {
    if (selectedCuratedEntries.length >= TARGET_MAX_VIDEOS) return;
    const key = candidate.entry.videoId || candidate.entry.url;
    if (seenVideoKeys.has(key)) return;
    seenVideoKeys.add(key);
    selectedCuratedEntries.push(candidate);
  };

  for (const item of exactVideos) addUniqueVideo(item);
  for (const item of broaderVideos) addUniqueVideo(item);

  // If strictly matched videos within the subject still total < 3, backfill strictly from remaining
  // curated videos whose primarySubject is in detectedSubjects (same discipline only, never cross-domain padding).
  if (selectedCuratedEntries.length < 3 && detectedSubjects.size > 0) {
    const sameSubjectExtras = VERIFIED_RESOURCE_CATALOG.filter(
      (entry) =>
        entry.category === 'video' &&
        (detectedSubjects.has(entry.primarySubject) ||
          entry.compatibleSubjects?.some((s) => detectedSubjects.has(s)))
    );
    for (const entry of sameSubjectExtras) {
      if (selectedCuratedEntries.length >= 3) break;
      const key = entry.videoId || entry.url;
      if (seenVideoKeys.has(key)) continue;
      seenVideoKeys.add(key);
      selectedCuratedEntries.push({
        entry,
        titleScore: 0,
        lessonScore: 0,
        gapScore: 0,
        totalScore: 0,
        matchScope: 'broader',
      });
    }
  }

  let videos: TrustedResourceItem[] = selectedCuratedEntries.map((s, idx) =>
    toTrustedResourceItem(s.entry, s.matchScope, idx)
  );

  // Written tutorials / documentation / open textbooks (target 2 to 4 unique relevant guides)
  const TARGET_MAX_TUTORIALS = 4;
  const allTutorials = scored.filter((s) => s.entry.category === 'tutorial');
  const exactTutorials = allTutorials.filter((s) => s.matchScope === 'exact');
  const broaderTutorials = allTutorials.filter((s) => s.matchScope !== 'exact');
  const selectedTutorials: ScoredEntry[] = [];
  const seenTutorialUrls = new Set<string>();
  const addUniqueTutorial = (candidate: ScoredEntry) => {
    if (selectedTutorials.length >= TARGET_MAX_TUTORIALS) return;
    if (seenTutorialUrls.has(candidate.entry.url)) return;
    seenTutorialUrls.add(candidate.entry.url);
    selectedTutorials.push(candidate);
  };
  for (const item of exactTutorials) addUniqueTutorial(item);
  for (const item of broaderTutorials) addUniqueTutorial(item);
  if (selectedTutorials.length < 2 && detectedSubjects.size > 0) {
    for (const entry of VERIFIED_RESOURCE_CATALOG) {
      if (selectedTutorials.length >= 2) break;
      if (
        entry.category === 'tutorial' &&
        !seenTutorialUrls.has(entry.url) &&
        entryMatchesSubjectSet(entry, detectedSubjects)
      ) {
        seenTutorialUrls.add(entry.url);
        selectedTutorials.push({
          entry,
          titleScore: 0,
          lessonScore: 0,
          gapScore: 0,
          totalScore: 0,
          matchScope: 'broader',
        });
      }
    }
  }
  const tutorials = selectedTutorials.map((s) =>
    toTrustedResourceItem(s.entry, s.matchScope)
  );

  // Interactive courses & hands-on practice (1 to 2 relevant platforms)
  const allPractice = scored.filter((s) => s.entry.category === 'practice');
  const exactPractice = allPractice.filter((s) => s.matchScope === 'exact');
  const practicePool = exactPractice.length > 0 ? [...exactPractice, ...allPractice.filter((s) => s.matchScope !== 'exact')] : allPractice;
  const seenPracticeUrls = new Set<string>();
  const practice: TrustedResourceItem[] = [];
  for (const s of practicePool) {
    if (practice.length >= 2) break;
    if (seenPracticeUrls.has(s.entry.url)) continue;
    seenPracticeUrls.add(s.entry.url);
    practice.push(toTrustedResourceItem(s.entry, s.matchScope));
  }

  // Live YouTube Data API v3 integration when YOUTUBE_API_KEY is configured on server:
  // Merge live verified results with curated matches (up to 5 unique videos), keeping valid non-embeddable videos with external watch links.
  let youtubeSearchMode: 'youtube-data-api' | 'curated-oembed-verified' =
    'curated-oembed-verified';

  if (isYouTubeDataApiConfigured()) {
    const sameSubjectGaps = (params.knowledgeGaps ?? []).filter((gap) => {
      if (detectedSubjects.size === 0) return true;
      const gapLower = gap.toLowerCase();
      const gapTok = new Set(tokenize(gapLower));
      return Array.from(detectedSubjects).some((subj) =>
        SUBJECT_DETECTION_TERMS[subj].some((term) =>
          containsWholeTerm(gapLower, gapTok, term)
        )
      );
    });

    const queryParts = [params.lessonTitle];
    if (sameSubjectGaps.length > 0) {
      queryParts.push(sameSubjectGaps[0]);
    }
    queryParts.push('tutorial');

    const liveResult = await searchAndVerifyYouTubeVideos({
      query: queryParts.join(' '),
      maxResults: 12,
      relevanceLanguage: preferredLang,
    });

    if (liveResult.configured && liveResult.videos.length > 0) {
      const lessonTokensAll = new Set(tokenize(primaryLessonText));
      const scoredLive = liveResult.videos
        .filter((v) =>
          isYouTubeCandidateSubjectCompatible(
            v.title,
            v.description,
            detectedSubjects
          )
        )
        .map((v) => {
          const vText = `${v.title} ${v.description}`.toLowerCase();
          const vTokens = new Set(tokenize(vText));
          let relevance = 0;
          for (const tok of lessonTitleTokens) {
            if (tok.length >= 3 && vTokens.has(tok)) relevance += 5;
          }
          for (const tok of lessonTokensAll) {
            if (tok.length >= 4 && vTokens.has(tok)) relevance += 2;
          }
          for (const gap of sameSubjectGaps) {
            if (vText.includes(gap.toLowerCase())) relevance += 4;
          }
          if (v.embedAllowed) relevance += 1;
          return { video: v, relevance };
        })
        .filter((item) => item.relevance >= 5)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, TARGET_MAX_VIDEOS);

      if (scoredLive.length > 0) {
        youtubeSearchMode = 'youtube-data-api';
        const merged: TrustedResourceItem[] = [];
        const seenMerged = new Set<string>();
        scoredLive.forEach(({ video: v }, idx) => {
          if (seenMerged.has(v.videoId) || merged.length >= TARGET_MAX_VIDEOS) return;
          seenMerged.add(v.videoId);
          merged.push({
            id: `yt-api-${v.videoId}`,
            category: 'video',
            title: v.title,
            provider: v.channelTitle,
            type: 'Video Tutorial',
            url: v.url,
            description:
              v.description ||
              `Educational video lesson on ${params.lessonTitle} from ${v.channelTitle}.`,
            matchScope: 'exact',
            learningPurpose: inferLearningPurpose(v.title, v.description, idx, false),
            videoId: v.videoId,
            embedUrl: v.embedUrl,
            thumbnailUrl: v.thumbnailUrl,
            embedAllowed: v.embedAllowed,
            duration: v.duration,
          });
        });
        for (const curated of videos) {
          if (merged.length >= TARGET_MAX_VIDEOS) break;
          const key = curated.videoId || curated.url;
          if (seenMerged.has(key)) continue;
          seenMerged.add(key);
          merged.push(curated);
        }
        videos = merged.map((v, idx) => ({
          ...v,
          learningPurpose:
            v.learningPurpose || inferLearningPurpose(v.title, v.description, idx, false),
        }));
      }
    }
  }

  // Verify selected curated YouTube videos via oEmbed (6h cached; 900ms budget per check).
  // Preserve legitimate public videos whose owners disabled iframe embedding with embedAllowed=false (UI offers external YouTube link).
  if (youtubeSearchMode === 'curated-oembed-verified' && videos.length > 0) {
    const verifyWithBudget = (videoId: string) =>
      Promise.race([
        verifyYouTubeVideoOEmbed(videoId),
        new Promise<Awaited<ReturnType<typeof verifyYouTubeVideoOEmbed>>>((resolve) =>
          setTimeout(
            () =>
              resolve({
                videoId,
                valid: true,
                embedAllowed: true,
                unverifiedNetworkError: true,
              }),
            900
          )
        ),
      ]);

    const verifiedChecks = await Promise.all(
      videos.map(async (video) => {
        if (!video.videoId) return { video, keep: false };
        const check = await verifyWithBudget(video.videoId);
        if (!check.unverifiedNetworkError && !check.valid) {
          return { video, keep: false };
        }
        return {
          video: {
            ...video,
            title: check.title || video.title,
            provider: check.channelTitle || video.provider,
            embedAllowed: check.unverifiedNetworkError ? video.embedAllowed : check.embedAllowed,
          },
          keep: true,
        };
      })
    );
    videos = verifiedChecks.filter((c) => c.keep).map((c) => c.video);
  }

  const allSelected = [...videos, ...tutorials, ...practice];
  const usedBroaderFallback =
    allSelected.length > 0 && allSelected.some((item) => item.matchScope === 'broader');

  const videoCoverageNote =
    videos.length === 0
      ? 'No verified YouTube videos matched this specialized topic yet. Use the verified written guides and course exercises below instead of unverified links.'
      : videos.length < 3
      ? `Showing ${videos.length} verified topic-relevant video${videos.length === 1 ? '' : 's'} — Skillora avoids padding with unrelated videos when fewer exact matches exist.`
      : undefined;

  return {
    videos,
    tutorials,
    practice,
    usedBroaderFallback,
    youtubeSearchMode,
    ...(videoCoverageNote ? { videoCoverageNote } : {}),
  };
}

export interface MatchTrustedResourcesForCourseInput {
  courseTitle: string;
  courseDescription?: string;
  learningObjectives?: string[];
  lessonTitles?: string[];
  knowledgeLevel?: KnowledgeLevel;
  careerGoal?: string;
}

/**
 * Matches verified educational videos (target 3-5), official docs/tutorials (target 2-4),
 * and free online courses for a Roadmap Course (Stage) without AI latency.
 */
export async function matchTrustedResourcesForCourse(
  params: MatchTrustedResourcesForCourseInput
): Promise<TrustedResourcesBundle> {
  const combinedLessonsText = (params.lessonTitles ?? []).slice(0, 8).join('. ');
  const combinedDetail = [
    params.courseDescription ?? '',
    combinedLessonsText,
    ...(params.learningObjectives ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  const primaryBundle = await matchTrustedResourcesForLesson({
    lessonTitle: params.courseTitle,
    lessonDescription: combinedDetail,
    learningObjectives: params.learningObjectives,
    stageTitle: params.courseTitle,
    careerGoal: params.careerGoal,
    knowledgeLevel: params.knowledgeLevel,
    preferredLanguage: 'en',
  });

  // If course-level match returned fewer than 3 videos or 2 tutorials and lesson titles exist,
  // merge unique verified resources from representative lessons inside this course.
  if (
    (primaryBundle.videos.length < 3 || primaryBundle.tutorials.length < 2) &&
    (params.lessonTitles?.length ?? 0) > 0
  ) {
    const lessonBundles = await Promise.all(
      (params.lessonTitles ?? []).slice(0, 4).map((lTitle) =>
        matchTrustedResourcesForLesson({
          lessonTitle: lTitle,
          lessonDescription: params.courseDescription ?? '',
          learningObjectives: params.learningObjectives,
          stageTitle: params.courseTitle,
          careerGoal: params.careerGoal,
          knowledgeLevel: params.knowledgeLevel,
          preferredLanguage: 'en',
        })
      )
    );

    const videos: TrustedResourceItem[] = [];
    const seenVideoIds = new Set<string>();
    const tutorials: TrustedResourceItem[] = [];
    const seenTutorialUrls = new Set<string>();
    const practice: TrustedResourceItem[] = [];
    const seenPracticeUrls = new Set<string>();

    for (const bundle of [primaryBundle, ...lessonBundles]) {
      for (const v of bundle.videos) {
        const key = v.videoId || v.url;
        if (seenVideoIds.has(key) || videos.length >= 5) continue;
        seenVideoIds.add(key);
        videos.push(v);
      }
      for (const t of bundle.tutorials) {
        if (seenTutorialUrls.has(t.url) || tutorials.length >= 4) continue;
        seenTutorialUrls.add(t.url);
        tutorials.push(t);
      }
      for (const p of bundle.practice) {
        if (seenPracticeUrls.has(p.url) || practice.length >= 2) continue;
        seenPracticeUrls.add(p.url);
        practice.push(p);
      }
    }

    if (videos.length > 0 || tutorials.length > 0 || practice.length > 0) {
      const videoCoverageNote =
        videos.length > 0 && videos.length < 3
          ? `Showing ${videos.length} verified topic-relevant video${videos.length === 1 ? '' : 's'} — Skillora only lists verified subject matches.`
          : undefined;
      return {
        videos,
        tutorials,
        practice,
        usedBroaderFallback:
          primaryBundle.usedBroaderFallback ||
          [...videos, ...tutorials, ...practice].some((i) => i.matchScope === 'broader'),
        youtubeSearchMode: primaryBundle.youtubeSearchMode,
        ...(videoCoverageNote ? { videoCoverageNote } : {}),
      };
    }
  }

  const hasAnyResources =
    primaryBundle.videos.length > 0 ||
    primaryBundle.tutorials.length > 0 ||
    primaryBundle.practice.length > 0;

  if (hasAnyResources) {
    return primaryBundle;
  }

  // Fallback for broad/abstract course titles: use careerGoal + course context to ensure every course has relevant verified resources
  const goalContext = (params.careerGoal ?? '').trim();
  if (goalContext) {
    const goalBundle = await matchTrustedResourcesForLesson({
      lessonTitle: `${params.courseTitle} — ${goalContext}`,
      lessonDescription: `${combinedDetail} ${goalContext}`.trim(),
      learningObjectives: params.learningObjectives,
      stageTitle: goalContext,
      careerGoal: goalContext,
      knowledgeLevel: params.knowledgeLevel,
      preferredLanguage: 'en',
    });
    if (
      goalBundle.videos.length > 0 ||
      goalBundle.tutorials.length > 0 ||
      goalBundle.practice.length > 0
    ) {
      return { ...goalBundle, usedBroaderFallback: true };
    }
  }

  // Last-resort subject-family lookup so no course shows an empty resources panel
  const fallbackSubjects = detectLessonSubjects(
    `${params.courseTitle} ${goalContext}`,
    combinedDetail,
    params.learningObjectives ?? []
  );
  const subjectEntries = VERIFIED_RESOURCE_CATALOG.filter((entry) =>
    fallbackSubjects.size > 0
      ? entryMatchesSubjectSet(entry, fallbackSubjects)
      : entry.primarySubject === 'academic_research' || entry.primarySubject === 'python'
  );
  const fallbackVideos = subjectEntries
    .filter((e) => e.category === 'video')
    .slice(0, 4)
    .map((e, idx) => toTrustedResourceItem(e, 'broader', idx));
  const fallbackTutorials = subjectEntries
    .filter((e) => e.category === 'tutorial')
    .slice(0, 3)
    .map((e) => toTrustedResourceItem(e, 'broader'));
  const fallbackPractice = subjectEntries
    .filter((e) => e.category === 'practice')
    .slice(0, 2)
    .map((e) => toTrustedResourceItem(e, 'broader'));

  return {
    videos: fallbackVideos,
    tutorials: fallbackTutorials,
    practice: fallbackPractice,
    usedBroaderFallback: true,
    youtubeSearchMode: 'curated-oembed-verified',
    ...(fallbackVideos.length < 3
      ? {
          videoCoverageNote:
            fallbackVideos.length === 0
              ? 'No verified course videos matched yet — explore the written guides and open courses below.'
              : `Showing ${fallbackVideos.length} verified topic-relevant video${fallbackVideos.length === 1 ? '' : 's'} without padding off-topic content.`,
        }
      : {}),
  };
}

/**
 * Backward-compatible synchronous flat-list helper for existing callers.
 */
export function findVerifiedResourcesForLesson(params: {
  lessonTitle: string;
  lessonDescription?: string;
  stageTitle?: string;
  careerGoal?: string;
  learningObjectives?: string[];
  maxResults?: number;
}): MatchedVerifiedResource[] {
  const maxResults = params.maxResults ?? 4;
  const detectedSubjects = detectLessonSubjects(
    params.lessonTitle,
    params.lessonDescription ?? '',
    params.learningObjectives ?? []
  );

  const combinedText = [
    params.lessonTitle,
    params.lessonDescription ?? '',
    ...(params.learningObjectives ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const tokens = new Set(tokenize(combinedText));
  const scored: { entry: CatalogEntry; score: number }[] = [];

  for (const entry of VERIFIED_RESOURCE_CATALOG) {
    if (entry.category === 'video') continue;
    if (!entryMatchesSubjectSet(entry, detectedSubjects)) continue;
    const kwScore = scoreKeywordsInText(entry.keywords, combinedText, tokens, 6, 4, 2);
    let domScore = 0;
    for (const d of entry.domains) {
      if (combinedText.includes(d.toLowerCase())) domScore += 3;
    }
    const score = kwScore + domScore;
    if (score >= 4) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ entry }) => ({
    id: entry.id,
    title: entry.title,
    provider: entry.provider,
    type: entry.type,
    url: entry.url,
    description: entry.description,
  }));
}
