// server.ts
import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// server/roadmapGenerator.ts
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { createClient as createClient2 } from "@supabase/supabase-js";

// server/exploreResourcesService.ts
import { createClient } from "@supabase/supabase-js";

// server/youtubeService.ts
var YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
var SEARCH_CACHE_TTL_MS = 1e3 * 60 * 60 * 6;
var OEMBED_TIMEOUT_MS = 4500;
var searchCache = /* @__PURE__ */ new Map();
var oembedCache = /* @__PURE__ */ new Map();
function formatIso8601Duration(isoDuration) {
  if (typeof isoDuration !== "string" || !isoDuration.startsWith("PT")) {
    return void 0;
  }
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return void 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  if (seconds > 0) {
    return `${seconds}s`;
  }
  return void 0;
}
function isYouTubeDataApiConfigured() {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}
async function verifyYouTubeVideoOEmbed(videoId) {
  const cleanId = videoId.trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(cleanId)) {
    return { valid: false, videoId: cleanId, embedAllowed: false };
  }
  const cached = oembedCache.get(cleanId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${cleanId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      watchUrl
    )}&format=json`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS)
    });
    if (!res.ok) {
      const negative = {
        valid: false,
        videoId: cleanId,
        embedAllowed: false
      };
      oembedCache.set(cleanId, {
        expiresAt: Date.now() + 1e3 * 60 * 15,
        result: negative
      });
      return negative;
    }
    const payload = await res.json();
    const result = {
      valid: Boolean(payload.title && payload.author_name),
      videoId: cleanId,
      title: payload.title?.trim(),
      channelTitle: payload.author_name?.trim(),
      embedAllowed: Boolean(payload.html && payload.html.includes("<iframe")),
      thumbnailUrl: payload.thumbnail_url
    };
    oembedCache.set(cleanId, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      result
    });
    return result;
  } catch {
    return {
      valid: false,
      videoId: cleanId,
      embedAllowed: false,
      unverifiedNetworkError: true
    };
  }
}
async function searchAndVerifyYouTubeVideos(params) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, videos: [] };
  }
  const maxResults = Math.min(Math.max(params.maxResults ?? 8, 1), 12);
  const query = params.query.trim();
  if (!query) {
    return { configured: true, videos: [] };
  }
  const cacheKey = `${query.toLowerCase()}::${maxResults}::${params.relevanceLanguage ?? "en"}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { configured: true, videos: cached.videos };
  }
  try {
    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("safeSearch", "strict");
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("q", query);
    if (params.relevanceLanguage) {
      searchUrl.searchParams.set("relevanceLanguage", params.relevanceLanguage);
    }
    searchUrl.searchParams.set("key", apiKey);
    const searchRes = await fetch(searchUrl.toString(), {
      signal: AbortSignal.timeout(6e3)
    });
    if (!searchRes.ok) {
      return { configured: true, videos: [] };
    }
    const searchJson = await searchRes.json();
    const videoIds = (searchJson.items ?? []).map((item) => item.id?.videoId).filter((id) => typeof id === "string" && id.length > 0);
    if (videoIds.length === 0) {
      return { configured: true, videos: [] };
    }
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set("part", "snippet,contentDetails,status");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", apiKey);
    const videosRes = await fetch(videosUrl.toString(), {
      signal: AbortSignal.timeout(6e3)
    });
    if (!videosRes.ok) {
      return { configured: true, videos: [] };
    }
    const videosJson = await videosRes.json();
    const publicItems = (videosJson.items ?? []).filter((item) => {
      const videoId = item.id?.trim();
      const title = item.snippet?.title?.trim();
      const channelTitle = item.snippet?.channelTitle?.trim();
      if (!videoId || !title || !channelTitle) return false;
      if (item.status?.privacyStatus && item.status.privacyStatus !== "public") return false;
      return true;
    });
    const verifiedList = await Promise.all(
      publicItems.map(async (item) => {
        const videoId = item.id.trim();
        const title = item.snippet.title.trim();
        const channelTitle = item.snippet.channelTitle.trim();
        const embedAllowedByApi = item.status?.embeddable !== false;
        const oembed = await verifyYouTubeVideoOEmbed(videoId);
        if (!oembed.unverifiedNetworkError && !oembed.valid) {
          return null;
        }
        const embedAllowed = embedAllowedByApi && (oembed.unverifiedNetworkError ? true : oembed.embedAllowed);
        const thumbnailUrl = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || oembed.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return {
          videoId,
          title: oembed.title || title,
          channelTitle: oembed.channelTitle || channelTitle,
          description: (item.snippet?.description ?? "").slice(0, 260).trim(),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
          thumbnailUrl,
          embedAllowed,
          duration: formatIso8601Duration(item.contentDetails?.duration),
          verifiedSource: "youtube-data-api"
        };
      })
    );
    const verified = verifiedList.filter((v) => Boolean(v)).slice(0, maxResults);
    searchCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      videos: verified
    });
    return { configured: true, videos: verified };
  } catch {
    return { configured: true, videos: [] };
  }
}

// server/verifiedResources.ts
var VERIFIED_RESOURCE_CATALOG = [
  // ==========================================
  // 1. VERIFIED YOUTUBE EDUCATIONAL VIDEOS
  // ==========================================
  // --- CSS, Flexbox, CSS Grid & Responsive Web Design ---
  {
    id: "yt-traversy-flexbox",
    category: "video",
    primarySubject: "css",
    videoId: "JJSoEo8JSnc",
    title: "Flexbox CSS In 20 Minutes",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=JJSoEo8JSnc",
    embedUrl: "https://www.youtube.com/embed/JJSoEo8JSnc?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/JJSoEo8JSnc/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical CSS Flexbox walkthrough covering flex containers, direction, justify-content, align-items, wrapping, and responsive alignment.",
    domains: ["css", "flexbox", "responsive", "layout"],
    keywords: [
      "css",
      "flexbox",
      "flex",
      "flex-direction",
      "justify-content",
      "align-items",
      "alignment",
      "responsive",
      "layout",
      "modern css"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-wds-css-grid",
    category: "video",
    primarySubject: "css",
    videoId: "9zBsdzdE4sM",
    title: "Learn CSS Grid in 20 Minutes",
    provider: "Web Dev Simplified",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=9zBsdzdE4sM",
    embedUrl: "https://www.youtube.com/embed/9zBsdzdE4sM?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/9zBsdzdE4sM/hqdefault.jpg",
    embedAllowed: true,
    description: "Step-by-step CSS Grid guide covering grid-template-columns, fr units, grid areas, gaps, auto-fit, and responsive two-dimensional layouts.",
    domains: ["css", "css grid", "grid", "layout", "responsive"],
    keywords: [
      "css",
      "grid",
      "css grid",
      "grid-template",
      "grid layout",
      "responsive",
      "layout",
      "modern css",
      "two-dimensional"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-traversy-css-grid",
    category: "video",
    primarySubject: "css",
    videoId: "jV8B24rSN5o",
    title: "CSS Grid Layout Crash Course",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=jV8B24rSN5o",
    embedUrl: "https://www.youtube.com/embed/jV8B24rSN5o?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/jV8B24rSN5o/hqdefault.jpg",
    embedAllowed: true,
    description: "Demonstrates CSS Grid tracks, fractions, alignment, nested grids, and combining CSS Grid with Flexbox for responsive layouts.",
    domains: ["css", "css grid", "grid", "flexbox", "layout"],
    keywords: [
      "css",
      "grid",
      "css grid",
      "flexbox",
      "grid layout",
      "responsive",
      "layout",
      "modern css"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-responsive-css",
    category: "video",
    primarySubject: "css",
    compatibleSubjects: ["html", "css"],
    videoId: "srvUrASNj0s",
    title: "Introduction To Responsive Web Design - HTML & CSS Tutorial",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=srvUrASNj0s",
    embedUrl: "https://www.youtube.com/embed/srvUrASNj0s?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/srvUrASNj0s/hqdefault.jpg",
    embedAllowed: true,
    description: "Comprehensive CSS responsive web design guide covering mobile-first CSS, media queries, fluid units, Flexbox, and CSS Grid layouts.",
    domains: ["css", "responsive design", "flexbox", "grid", "media queries"],
    keywords: [
      "responsive design",
      "responsive web design",
      "responsive",
      "mobile-first",
      "media queries",
      "media query",
      "flexbox",
      "css grid",
      "grid",
      "css",
      "modern css",
      "layout"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-kevin-powell-responsive",
    category: "video",
    primarySubject: "css",
    videoId: "VQraviuwbzU",
    title: "5 simple tips to making responsive layouts the easy way",
    provider: "Kevin Powell",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=VQraviuwbzU",
    embedUrl: "https://www.youtube.com/embed/VQraviuwbzU?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/VQraviuwbzU/hqdefault.jpg",
    embedAllowed: true,
    description: "Modern CSS responsive design practices emphasizing mobile-first patterns, fluid widths, media queries, and avoiding rigid breakpoints.",
    domains: ["css", "responsive design", "layout"],
    keywords: [
      "responsive",
      "responsive design",
      "mobile-first",
      "media queries",
      "media query",
      "layout",
      "modern css",
      "css"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-kevin-powell-flexbox",
    category: "video",
    primarySubject: "css",
    videoId: "u044iM9xsWU",
    title: "Learn flexbox the easy way",
    provider: "Kevin Powell",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=u044iM9xsWU",
    embedUrl: "https://www.youtube.com/embed/u044iM9xsWU?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/u044iM9xsWU/hqdefault.jpg",
    embedAllowed: true,
    description: "Clear mental model for CSS Flexbox covering main vs cross axes, flex-wrap, flex-grow/shrink, gaps, and responsive navigation bars.",
    domains: ["css", "flexbox", "layout"],
    keywords: [
      "flexbox",
      "flex",
      "alignment",
      "responsive",
      "css",
      "modern css",
      "layout"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-traversy-css",
    category: "video",
    primarySubject: "css",
    isGenericOverview: true,
    videoId: "yfoY53QXEnI",
    title: "CSS Crash Course For Absolute Beginners",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=yfoY53QXEnI",
    embedUrl: "https://www.youtube.com/embed/yfoY53QXEnI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/yfoY53QXEnI/hqdefault.jpg",
    embedAllowed: true,
    description: "Covers CSS selectors, box model, typography, positioning, flexbox layout essentials, and styling basics.",
    domains: ["css", "styling", "box model", "layout"],
    keywords: [
      "css",
      "box model",
      "selector",
      "selectors",
      "styling",
      "positioning",
      "flexbox",
      "layout"
    ],
    levels: ["Beginner"],
    language: "en"
  },
  // --- HTML ---
  {
    id: "yt-traversy-html",
    category: "video",
    primarySubject: "html",
    videoId: "UB1O30fR-EE",
    title: "HTML Crash Course For Absolute Beginners",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=UB1O30fR-EE",
    embedUrl: "https://www.youtube.com/embed/UB1O30fR-EE?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/UB1O30fR-EE/hqdefault.jpg",
    embedAllowed: true,
    description: "Introduces HTML5 document structure, semantic tags, headings, lists, forms, tables, and web accessibility basics.",
    domains: ["html", "html5", "semantic", "markup"],
    keywords: ["html", "html5", "semantic", "semantic markup", "tag", "form", "accessibility", "markup"],
    levels: ["Beginner"],
    language: "en"
  },
  // --- JavaScript ---
  {
    id: "yt-traversy-js-crash",
    category: "video",
    primarySubject: "javascript",
    isGenericOverview: true,
    videoId: "hdI2bqOjy3c",
    title: "JavaScript Crash Course For Beginners",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=hdI2bqOjy3c",
    embedUrl: "https://www.youtube.com/embed/hdI2bqOjy3c?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/hdI2bqOjy3c/hqdefault.jpg",
    embedAllowed: true,
    description: "Covers modern JavaScript syntax, variables (let/const), data types, arrays, objects, functions, loops, conditionals, and DOM basics.",
    domains: ["javascript", "es6", "syntax", "data structures"],
    keywords: [
      "javascript",
      "js",
      "modern javascript",
      "syntax",
      "variable",
      "let",
      "const",
      "array",
      "object",
      "data structure",
      "data structures",
      "function",
      "es6",
      "dom"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-js-full",
    category: "video",
    primarySubject: "javascript",
    videoId: "jS4aFq5-91M",
    title: "JavaScript Programming - Full Course",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=jS4aFq5-91M",
    embedUrl: "https://www.youtube.com/embed/jS4aFq5-91M?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/jS4aFq5-91M/hqdefault.jpg",
    embedAllowed: true,
    description: "Structured JavaScript course building from modern syntax, variables, scope, functions, arrays, and objects through interactive mini-projects.",
    domains: ["javascript", "syntax", "scope", "data structures"],
    keywords: [
      "javascript",
      "js",
      "syntax",
      "scope",
      "data structure",
      "data structures",
      "array",
      "object",
      "function",
      "loop",
      "string",
      "modern javascript"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-wds-closures",
    category: "video",
    primarySubject: "javascript",
    videoId: "47SPG8TvUXA",
    title: "Learn Closures In 13 Minutes",
    provider: "Web Dev Simplified",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=47SPG8TvUXA",
    embedUrl: "https://www.youtube.com/embed/47SPG8TvUXA?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/47SPG8TvUXA/hqdefault.jpg",
    embedAllowed: true,
    description: "Visual walkthrough of JavaScript lexical scope, inner and outer functions, and how closures preserve variable references.",
    domains: ["javascript", "scope", "closures"],
    keywords: [
      "closure",
      "closures",
      "scope",
      "lexical scope",
      "block scope",
      "function scope",
      "javascript",
      "js"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-wds-array-methods",
    category: "video",
    primarySubject: "javascript",
    videoId: "R8rmfD9Y5-c",
    title: "8 Must Know JavaScript Array Methods",
    provider: "Web Dev Simplified",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=R8rmfD9Y5-c",
    embedUrl: "https://www.youtube.com/embed/R8rmfD9Y5-c?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/R8rmfD9Y5-c/hqdefault.jpg",
    embedAllowed: true,
    description: "Focused walkthrough of map, filter, find, reduce, some, every, forEach, and includes for transforming JavaScript array data structures.",
    domains: ["javascript", "arrays", "data structures"],
    keywords: [
      "array",
      "arrays",
      "array method",
      "array methods",
      "map",
      "filter",
      "reduce",
      "data structure",
      "data structures",
      "javascript",
      "modern javascript"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-traversy-async-js",
    category: "video",
    primarySubject: "javascript",
    videoId: "PoRJizFvM7s",
    title: "Async JS Crash Course - Callbacks, Promises, Async Await",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=PoRJizFvM7s",
    embedUrl: "https://www.youtube.com/embed/PoRJizFvM7s?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/PoRJizFvM7s/hqdefault.jpg",
    embedAllowed: true,
    description: "Explains asynchronous JavaScript control flow step by step, comparing callbacks, Promises, Promise.all, and async/await.",
    domains: ["javascript", "async", "promises"],
    keywords: [
      "async",
      "await",
      "async/await",
      "promise",
      "promises",
      "callback",
      "asynchronous",
      "fetch",
      "javascript"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-wds-promises",
    category: "video",
    primarySubject: "javascript",
    videoId: "DHvZLI7Db8E",
    title: "JavaScript Promises In 10 Minutes",
    provider: "Web Dev Simplified",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=DHvZLI7Db8E",
    embedUrl: "https://www.youtube.com/embed/DHvZLI7Db8E?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/DHvZLI7Db8E/hqdefault.jpg",
    embedAllowed: true,
    description: "Focused explanation of creating and consuming Promises with resolve, reject, .then, .catch, and chaining.",
    domains: ["javascript", "promises", "async"],
    keywords: ["promise", "promises", "then", "catch", "async", "asynchronous", "javascript"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-wds-async-await",
    category: "video",
    primarySubject: "javascript",
    videoId: "V_Kr9OSfDeU",
    title: "JavaScript Async Await",
    provider: "Web Dev Simplified",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=V_Kr9OSfDeU",
    embedUrl: "https://www.youtube.com/embed/V_Kr9OSfDeU?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/V_Kr9OSfDeU/hqdefault.jpg",
    embedAllowed: true,
    description: "Refactors Promise chains into readable async/await functions with proper try/catch error handling.",
    domains: ["javascript", "async", "promises"],
    keywords: ["async", "await", "async/await", "try/catch", "error handling", "promise", "fetch", "javascript"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-fireship-async",
    category: "video",
    primarySubject: "javascript",
    videoId: "vn3tm0quoqE",
    title: "The Async Await Episode I Promised",
    provider: "Fireship",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=vn3tm0quoqE",
    embedUrl: "https://www.youtube.com/embed/vn3tm0quoqE?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/vn3tm0quoqE/hqdefault.jpg",
    embedAllowed: true,
    description: "Fast-paced breakdown of the JavaScript event loop, microtasks, Promises, and async/await concurrency patterns.",
    domains: ["javascript", "event loop", "async"],
    keywords: ["event loop", "microtask", "async", "await", "promise", "concurrency", "javascript"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- React ---
  {
    id: "yt-mosh-react",
    category: "video",
    primarySubject: "react",
    videoId: "SqcY0GlETPk",
    title: "React Tutorial for Beginners",
    provider: "Programming with Mosh",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=SqcY0GlETPk",
    embedUrl: "https://www.youtube.com/embed/SqcY0GlETPk?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/SqcY0GlETPk/hqdefault.jpg",
    embedAllowed: true,
    description: "Builds modern React UIs step by step using functional components, JSX, props, state, and event handling.",
    domains: ["react", "jsx", "components"],
    keywords: ["react", "jsx", "component", "props", "state", "usestate", "hook", "hooks"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-netninja-react",
    category: "video",
    primarySubject: "react",
    videoId: "j942wKiXFu8",
    title: "Full React Tutorial #1 - Introduction",
    provider: "Net Ninja",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=j942wKiXFu8",
    embedUrl: "https://www.youtube.com/embed/j942wKiXFu8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/j942wKiXFu8/hqdefault.jpg",
    embedAllowed: true,
    description: "Introduces React component architecture, virtual DOM, project setup, and building composable web interfaces.",
    domains: ["react", "virtual dom", "hooks"],
    keywords: ["react", "component", "virtual dom", "hooks", "router", "spa"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- TypeScript ---
  {
    id: "yt-traversy-typescript",
    category: "video",
    primarySubject: "typescript",
    videoId: "BCg4U1FzODs",
    title: "TypeScript Crash Course",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=BCg4U1FzODs",
    embedUrl: "https://www.youtube.com/embed/BCg4U1FzODs?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/BCg4U1FzODs/hqdefault.jpg",
    embedAllowed: true,
    description: "Covers TypeScript compiler configuration, basic types, unions, interfaces, functions, classes, and generics.",
    domains: ["typescript", "static typing"],
    keywords: ["typescript", "ts", "interface", "generic", "union", "static typing", "tsconfig"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Node.js & Express ---
  {
    id: "yt-traversy-nodejs",
    category: "video",
    primarySubject: "nodejs_backend",
    videoId: "fBNz5xF-Kx4",
    title: "Node.js Crash Course",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=fBNz5xF-Kx4",
    embedUrl: "https://www.youtube.com/embed/fBNz5xF-Kx4?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/fBNz5xF-Kx4/hqdefault.jpg",
    embedAllowed: true,
    description: "Explains Node.js core modules (fs, path, http, events), npm packages, and building an HTTP server without frameworks.",
    domains: ["node", "nodejs", "backend"],
    keywords: ["node", "nodejs", "node.js", "npm", "http server", "backend", "runtime"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-traversy-express",
    category: "video",
    primarySubject: "nodejs_backend",
    videoId: "L72fhGm1tfE",
    title: "Express JS Crash Course",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=L72fhGm1tfE",
    embedUrl: "https://www.youtube.com/embed/L72fhGm1tfE?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/L72fhGm1tfE/hqdefault.jpg",
    embedAllowed: true,
    description: "Shows how to structure Express.js routes, middleware, REST API endpoints, request parsing, and response status codes.",
    domains: ["express", "nodejs", "rest api", "backend"],
    keywords: ["express", "expressjs", "middleware", "route", "routing", "rest", "api", "backend", "endpoint"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- SQL & Relational Databases ---
  {
    id: "yt-sql-joins-joey",
    category: "video",
    primarySubject: "sql",
    videoId: "2HVMiPPuPIM",
    title: "SQL Joins Tutorial for Beginners - Inner Join, Left Join, Right Join, Full Outer Join",
    provider: "Joey Blue",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=2HVMiPPuPIM",
    embedUrl: "https://www.youtube.com/embed/2HVMiPPuPIM?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/2HVMiPPuPIM/hqdefault.jpg",
    embedAllowed: true,
    description: "Focused walkthrough of SQL relational table joins (INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN) and foreign key relationships.",
    domains: ["sql", "sql joins", "relational", "database"],
    keywords: [
      "sql",
      "join",
      "joins",
      "sql joins",
      "inner join",
      "left join",
      "right join",
      "outer join",
      "relational",
      "foreign key",
      "schema",
      "schemas"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-sql",
    category: "video",
    primarySubject: "sql",
    videoId: "HXV3zeQKqGY",
    title: "SQL Tutorial - Full Database Course for Beginners",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=HXV3zeQKqGY",
    embedUrl: "https://www.youtube.com/embed/HXV3zeQKqGY?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/HXV3zeQKqGY/hqdefault.jpg",
    embedAllowed: true,
    description: "Walks through relational database design, schemas, primary/foreign keys, SELECT queries, JOINs, and aggregations.",
    domains: ["sql", "relational database", "schema"],
    keywords: [
      "sql",
      "database",
      "relational",
      "relational schema",
      "relational schemas",
      "table",
      "schema",
      "schemas",
      "join",
      "joins",
      "query",
      "postgres",
      "postgresql",
      "foreign key",
      "primary key"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-mosh-sql",
    category: "video",
    primarySubject: "sql",
    isGenericOverview: true,
    videoId: "7S_tz1z_5bA",
    title: "SQL Course for Beginners [Full Course]",
    provider: "Programming with Mosh",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=7S_tz1z_5bA",
    embedUrl: "https://www.youtube.com/embed/7S_tz1z_5bA?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/7S_tz1z_5bA/hqdefault.jpg",
    embedAllowed: true,
    description: "Structured SQL tutorial covering SELECT, WHERE, ORDER BY, INNER/OUTER JOINs, and relational table queries.",
    domains: ["sql", "database", "relational"],
    keywords: ["sql", "database", "relational", "join", "joins", "select", "query"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Git & Docker ---
  {
    id: "yt-fcc-git",
    category: "video",
    primarySubject: "git_devops",
    videoId: "RGOj5yH7evk",
    title: "Git and GitHub for Beginners - Crash Course",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=RGOj5yH7evk",
    embedUrl: "https://www.youtube.com/embed/RGOj5yH7evk?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/RGOj5yH7evk/hqdefault.jpg",
    embedAllowed: true,
    description: "Teaches Git initialization, staging, commits, branching, merging, resolving conflicts, and pull request workflows on GitHub.",
    domains: ["git", "github", "version control"],
    keywords: ["git", "github", "version control", "branch", "merge", "commit", "pull request", "repository"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-docker",
    category: "video",
    primarySubject: "git_devops",
    videoId: "fqMOX6JJhGo",
    title: "Docker Tutorial for Beginners - A Full DevOps Course on How to Run Applications in Containers",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=fqMOX6JJhGo",
    embedUrl: "https://www.youtube.com/embed/fqMOX6JJhGo?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/fqMOX6JJhGo/hqdefault.jpg",
    embedAllowed: true,
    description: "Explains containers vs VMs, Docker images, Dockerfiles, networking, volumes, and multi-service Docker Compose workflows.",
    domains: ["docker", "devops", "containers"],
    keywords: ["docker", "container", "dockerfile", "compose", "deployment", "devops", "ci/cd", "kubernetes"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Python ---
  {
    id: "yt-fcc-python",
    category: "video",
    primarySubject: "python",
    videoId: "rfscVS0vtbw",
    title: "Learn Python - Full Course for Beginners [Tutorial]",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=rfscVS0vtbw",
    embedUrl: "https://www.youtube.com/embed/rfscVS0vtbw?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/rfscVS0vtbw/hqdefault.jpg",
    embedAllowed: true,
    description: "Complete Python fundamentals covering variables, strings, lists, tuples, dictionaries, functions, loops, and classes.",
    domains: ["python", "python fundamentals"],
    keywords: [
      "python",
      "python fundamentals",
      "syntax",
      "variable",
      "list",
      "tuple",
      "dictionary",
      "data structures",
      "function",
      "functions",
      "class",
      "oop",
      "loop"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-mosh-python-1hr",
    category: "video",
    primarySubject: "python",
    videoId: "kqtD5dpn9C8",
    title: "Python for Beginners - Learn Coding with Python in 1 Hour",
    provider: "Programming with Mosh",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=kqtD5dpn9C8",
    embedUrl: "https://www.youtube.com/embed/kqtD5dpn9C8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/kqtD5dpn9C8/hqdefault.jpg",
    embedAllowed: true,
    description: "Concise Python syntax and fundamentals tutorial covering variables, strings, lists, tuples, conditionals, loops, and functions.",
    domains: ["python", "python fundamentals"],
    keywords: [
      "python",
      "python fundamentals",
      "syntax",
      "variable",
      "list",
      "tuple",
      "loop",
      "function",
      "functions",
      "conditionals"
    ],
    levels: ["Beginner"],
    language: "en"
  },
  // --- AI, Machine Learning & Data Analysis ---
  {
    id: "yt-fcc-ml-everybody",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "i_LwzRVP7bg",
    title: "Machine Learning for Everybody \u2013 Full Course",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=i_LwzRVP7bg",
    embedUrl: "https://www.youtube.com/embed/i_LwzRVP7bg?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/i_LwzRVP7bg/hqdefault.jpg",
    embedAllowed: true,
    description: "Accessible introduction to supervised and unsupervised machine learning, classification, regression, neural networks, and model evaluation.",
    domains: ["ai", "machine learning", "data science"],
    keywords: [
      "machine learning",
      "ml",
      "ai",
      "data science",
      "supervised learning",
      "classification",
      "regression",
      "neural network",
      "python"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-data-analysis-python",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "r-uOLxNrNk8",
    title: "Data Analysis with Python - Full Course for Beginners (Numpy, Pandas, Matplotlib, Seaborn)",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=r-uOLxNrNk8",
    embedUrl: "https://www.youtube.com/embed/r-uOLxNrNk8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/r-uOLxNrNk8/hqdefault.jpg",
    embedAllowed: true,
    description: "Hands-on data analysis workflow using Python, NumPy, Pandas DataFrames, data cleaning, and statistical visualization.",
    domains: ["data science", "data analysis", "python", "ai"],
    keywords: [
      "data analysis",
      "data science",
      "pandas",
      "numpy",
      "matplotlib",
      "python",
      "statistics",
      "ai",
      "visualization"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- UI/UX Design & Figma ---
  {
    id: "yt-fcc-uiux-figma",
    category: "video",
    primarySubject: "design_ux",
    videoId: "c9Wg6Cb_YlU",
    title: "UI / UX Design Tutorial \u2013 Wireframe, Mockup & Design in Figma",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=c9Wg6Cb_YlU",
    embedUrl: "https://www.youtube.com/embed/c9Wg6Cb_YlU?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/c9Wg6Cb_YlU/hqdefault.jpg",
    embedAllowed: true,
    description: "End-to-end UI/UX product design walkthrough covering visual hierarchy, typography, wireframing, mockups, and prototyping in Figma.",
    domains: ["ui/ux", "design", "figma"],
    keywords: [
      "ui",
      "ux",
      "ui/ux",
      "design",
      "figma",
      "wireframe",
      "mockup",
      "prototype",
      "typography",
      "visual design",
      "creativity"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-ajsmart-figma",
    category: "video",
    primarySubject: "design_ux",
    videoId: "FTFaQWZBqQ8",
    title: "Figma UI Design Tutorial: Get Started in Just 24 Minutes!",
    provider: "AJ&Smart",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=FTFaQWZBqQ8",
    embedUrl: "https://www.youtube.com/embed/FTFaQWZBqQ8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/FTFaQWZBqQ8/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical introduction to Figma frames, components, layout grids, and rapid interface prototyping.",
    domains: ["figma", "ui/ux", "design"],
    keywords: ["figma", "ui", "ux", "design", "prototype", "components", "layout"],
    levels: ["Beginner"],
    language: "en"
  },
  // --- Cybersecurity ---
  {
    id: "yt-simplilearn-cybersecurity",
    category: "video",
    primarySubject: "cybersecurity",
    videoId: "inWWhr5tnEA",
    title: "What Is Cyber Security | How It Works? | Cyber Security In 7 Minutes | Cyber Security | Simplilearn",
    provider: "Simplilearn",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=inWWhr5tnEA",
    embedUrl: "https://www.youtube.com/embed/inWWhr5tnEA?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/inWWhr5tnEA/hqdefault.jpg",
    embedAllowed: true,
    description: "Clear overview of cybersecurity fundamentals, common threat vectors, defensive controls, and security hygiene.",
    domains: ["cybersecurity", "security", "it"],
    keywords: ["cybersecurity", "security", "network security", "threats", "it", "defense", "authentication"],
    levels: ["Beginner"],
    language: "en"
  },
  {
    id: "yt-mycs-cybersecurity",
    category: "video",
    primarySubject: "cybersecurity",
    videoId: "U_P23SqJaDc",
    title: "Cyber Security Full Course for Beginner",
    provider: "My CS",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=U_P23SqJaDc",
    embedUrl: "https://www.youtube.com/embed/U_P23SqJaDc?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/U_P23SqJaDc/hqdefault.jpg",
    embedAllowed: true,
    description: "Detailed cybersecurity beginner curriculum covering threats, malware, cryptography, network security, and defensive operations.",
    domains: ["cybersecurity", "security", "network security"],
    keywords: ["cybersecurity", "security", "network security", "cryptography", "malware", "defense", "authentication"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-crashcourse-cybersecurity",
    category: "video",
    primarySubject: "cybersecurity",
    videoId: "bPVaOlJ6ln0",
    title: "Cybersecurity: Crash Course Computer Science #31",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=bPVaOlJ6ln0",
    embedUrl: "https://www.youtube.com/embed/bPVaOlJ6ln0?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/bPVaOlJ6ln0/hqdefault.jpg",
    embedAllowed: true,
    description: "Conceptual walkthrough of threat modeling, authentication, privilege isolation, access control, and security engineering.",
    domains: ["cybersecurity", "security", "authentication"],
    keywords: ["cybersecurity", "security", "authentication", "access control", "vulnerability", "threat"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Expanded Verified Videos: Python, AI Engineering, Data Analytics, SQL, UI/UX, React, TS, Node, Git ---
  {
    id: "yt-mosh-python-full",
    category: "video",
    primarySubject: "python",
    isGenericOverview: true,
    videoId: "_uQrJ0TkZlc",
    title: "Python Full Course for Beginners",
    provider: "Programming with Mosh",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=_uQrJ0TkZlc",
    embedUrl: "https://www.youtube.com/embed/_uQrJ0TkZlc?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/_uQrJ0TkZlc/hqdefault.jpg",
    embedAllowed: true,
    description: "Hands-on Python walkthrough covering variables, strings, lists, dictionaries, functions, OOP classes, modules, and automation projects.",
    domains: ["python", "python fundamentals", "oop"],
    keywords: ["python", "variables", "strings", "lists", "dictionaries", "functions", "loops", "oop", "classes", "modules"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-python-intermediate",
    category: "video",
    primarySubject: "python",
    videoId: "HGOBQPFzWKo",
    title: "Intermediate Python Programming Course",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=HGOBQPFzWKo",
    embedUrl: "https://www.youtube.com/embed/HGOBQPFzWKo?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/HGOBQPFzWKo/hqdefault.jpg",
    embedAllowed: true,
    description: "Intermediate Python deep dive covering collections, lambda functions, exceptions, decorators, generators, logging, and threading.",
    domains: ["python", "intermediate python", "software engineering"],
    keywords: ["python", "intermediate python", "decorators", "generators", "collections", "exceptions", "logging", "lambda", "data structures"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-fcc-python-everybody",
    category: "video",
    primarySubject: "python",
    compatibleSubjects: ["python", "sql", "ai_ml"],
    isGenericOverview: true,
    videoId: "8DvywoWv6fI",
    title: "Python for Everybody - Full University Python Course",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=8DvywoWv6fI",
    embedUrl: "https://www.youtube.com/embed/8DvywoWv6fI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/8DvywoWv6fI/hqdefault.jpg",
    embedAllowed: true,
    description: "University Python curriculum covering data structures, files, regular expressions, web APIs, JSON parsing, and databases with Python.",
    domains: ["python", "apis", "data"],
    keywords: ["python", "files", "json", "api", "data structures", "database", "sql", "regex"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-3b1b-neural-networks",
    category: "video",
    primarySubject: "ai_ml",
    videoId: "aircAruvnKk",
    title: "But what is a neural network? | Deep learning chapter 1",
    provider: "3Blue1Brown",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=aircAruvnKk",
    embedUrl: "https://www.youtube.com/embed/aircAruvnKk?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg",
    embedAllowed: true,
    description: "Visual conceptual intuition for neurons, layers, weights, biases, activation functions, and deep neural network representations.",
    domains: ["ai", "deep learning", "neural networks"],
    keywords: ["neural network", "neural networks", "deep learning", "ai", "weights", "layers", "activation", "ai engineer"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-3b1b-gradient-descent",
    category: "video",
    primarySubject: "ai_ml",
    videoId: "IHZwWFHWa-w",
    title: "Gradient descent, how neural networks learn | Deep Learning Chapter 2",
    provider: "3Blue1Brown",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=IHZwWFHWa-w",
    embedUrl: "https://www.youtube.com/embed/IHZwWFHWa-w?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/IHZwWFHWa-w/hqdefault.jpg",
    embedAllowed: true,
    description: "Visual explanation of loss/cost functions, gradient vectors, learning rates, optimization, and how neural models learn from data.",
    domains: ["ai", "deep learning", "machine learning", "optimization"],
    keywords: ["gradient descent", "loss function", "optimization", "deep learning", "neural network", "machine learning", "ai", "training"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-karpathy-micrograd",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "VMj-3S1tku0",
    title: "The spelled-out intro to neural networks and backpropagation: building micrograd",
    provider: "Andrej Karpathy",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=VMj-3S1tku0",
    embedUrl: "https://www.youtube.com/embed/VMj-3S1tku0?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/VMj-3S1tku0/hqdefault.jpg",
    embedAllowed: true,
    description: "From-scratch Python build of automatic differentiation (autograd), backpropagation, and a minimal neural network training loop.",
    domains: ["ai", "deep learning", "backpropagation", "pytorch"],
    keywords: ["backpropagation", "autograd", "neural network", "deep learning", "python", "pytorch", "gradient", "ai engineer"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-karpathy-intro-llms",
    category: "video",
    primarySubject: "ai_ml",
    videoId: "zjkBMFhNj_g",
    title: "[1hr Talk] Intro to Large Language Models",
    provider: "Andrej Karpathy",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=zjkBMFhNj_g",
    embedUrl: "https://www.youtube.com/embed/zjkBMFhNj_g?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/zjkBMFhNj_g/hqdefault.jpg",
    embedAllowed: true,
    description: "Clear systems overview of how LLMs are pre-trained, fine-tuned, aligned, tool-augmented, and deployed safely in AI engineering workflows.",
    domains: ["ai", "llm", "ai engineering", "generative ai"],
    keywords: ["llm", "large language model", "generative ai", "prompt engineering", "rag", "fine-tuning", "ai engineer", "ai", "transformer"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-karpathy-build-gpt",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "kCc8FmEb1nY",
    title: "Let's build GPT: from scratch, in code, spelled out.",
    provider: "Andrej Karpathy",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
    embedUrl: "https://www.youtube.com/embed/kCc8FmEb1nY?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/kCc8FmEb1nY/hqdefault.jpg",
    embedAllowed: true,
    description: "Step-by-step PyTorch implementation of tokenization, embeddings, self-attention, multi-head transformers, and autoregressive text generation.",
    domains: ["ai", "transformers", "llm", "pytorch"],
    keywords: ["gpt", "transformer", "transformers", "attention", "self-attention", "llm", "pytorch", "deep learning", "nlp", "ai engineer"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-mosh-ml-python",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "7eh4d6sabA0",
    title: "Python Machine Learning Tutorial (Data Science)",
    provider: "Programming with Mosh",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=7eh4d6sabA0",
    embedUrl: "https://www.youtube.com/embed/7eh4d6sabA0?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/7eh4d6sabA0/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical beginner demonstration building, splitting, training, and measuring accuracy of a scikit-learn classification model in Python.",
    domains: ["machine learning", "scikit-learn", "python", "ai"],
    keywords: ["machine learning", "scikit-learn", "sklearn", "classification", "model evaluation", "python", "data science", "ai"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-tensorflow-neural",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "tPYj3fFJGjk",
    title: "TensorFlow 2.0 Complete Course - Python Neural Networks for Beginners Tutorial",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=tPYj3fFJGjk",
    embedUrl: "https://www.youtube.com/embed/tPYj3fFJGjk?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/tPYj3fFJGjk/hqdefault.jpg",
    embedAllowed: true,
    description: "Covers core ML algorithms, linear regression, classification, clustering, neural networks, convolutional networks, and NLP workflows.",
    domains: ["ai", "machine learning", "deep learning", "nlp"],
    keywords: ["tensorflow", "deep learning", "neural network", "classification", "regression", "clustering", "nlp", "computer vision", "ai"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-numpy-tutorial",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "QUT1VHiLmmI",
    title: "Python NumPy Tutorial for Beginners",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=QUT1VHiLmmI",
    embedUrl: "https://www.youtube.com/embed/QUT1VHiLmmI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/QUT1VHiLmmI/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical guide to NumPy arrays, broadcasting, indexing, vectorized math, linear algebra, and numerical data processing.",
    domains: ["numpy", "data analysis", "python", "machine learning"],
    keywords: ["numpy", "array", "arrays", "linear algebra", "vectorization", "python", "data analysis", "data science", "ai"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-galli-pandas-tutorial",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "vmEHCJofslg",
    title: "Complete Python Pandas Data Science Tutorial! (Reading CSV/Excel files, Sorting, Filtering, Groupby)",
    provider: "Keith Galli",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=vmEHCJofslg",
    embedUrl: "https://www.youtube.com/embed/vmEHCJofslg?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/vmEHCJofslg/hqdefault.jpg",
    embedAllowed: true,
    description: "Hands-on walkthrough of Pandas DataFrames, loading CSV/Excel datasets, filtering rows, cleaning columns, and GroupBy aggregation.",
    domains: ["pandas", "data analysis", "data analytics", "python"],
    keywords: ["pandas", "dataframe", "data analysis", "data analyst", "data analytics", "csv", "excel", "cleaning", "groupby", "aggregation"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-alex-data-analyst-bootcamp",
    category: "video",
    primarySubject: "sql",
    compatibleSubjects: ["sql", "ai_ml", "python"],
    isGenericOverview: true,
    videoId: "rGx1QNdYzvs",
    title: "FREE Data Analyst Bootcamp!!",
    provider: "Alex The Analyst",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=rGx1QNdYzvs",
    embedUrl: "https://www.youtube.com/embed/rGx1QNdYzvs?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/rGx1QNdYzvs/hqdefault.jpg",
    embedAllowed: true,
    description: "Structured Data Analyst curriculum covering SQL querying, Excel modeling, Tableau/Power BI dashboards, Pandas exploratory analysis, and portfolio case studies.",
    domains: ["data analyst", "data analytics", "sql", "excel", "visualization"],
    keywords: ["data analyst", "data analytics", "data analysis", "sql", "excel", "tableau", "power bi", "dashboard", "visualization", "pandas"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-statistics-ds",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "sql", "finance_economics"],
    videoId: "xxpc-HPKN28",
    title: "Statistics - A Full University Course on Data Science Basics",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=xxpc-HPKN28",
    embedUrl: "https://www.youtube.com/embed/xxpc-HPKN28?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/xxpc-HPKN28/hqdefault.jpg",
    embedAllowed: true,
    description: "University statistics foundations covering distributions, descriptive statistics, probability, hypothesis testing, correlation, and regression.",
    domains: ["statistics", "data analysis", "data science", "ai"],
    keywords: ["statistics", "probability", "hypothesis testing", "regression", "correlation", "distribution", "data analyst", "data analysis", "a/b testing"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-data-science-full",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python", "sql"],
    isGenericOverview: true,
    videoId: "ua-CiDNNj30",
    title: "Learn Data Science Tutorial - Full Course for Beginners",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=ua-CiDNNj30",
    embedUrl: "https://www.youtube.com/embed/ua-CiDNNj30?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/ua-CiDNNj30/hqdefault.jpg",
    embedAllowed: true,
    description: "Foundational data science and analytics journey connecting exploratory statistics, data wrangling, visualization storytelling, and predictive modeling.",
    domains: ["data science", "data analysis", "statistics", "visualization"],
    keywords: ["data science", "data analysis", "data analytics", "statistics", "visualization", "eda", "exploratory", "python"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-wds-sql-60min",
    category: "video",
    primarySubject: "sql",
    videoId: "p3qvj9hO_Bo",
    title: "Learn SQL In 60 Minutes",
    provider: "Web Dev Simplified",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=p3qvj9hO_Bo",
    embedUrl: "https://www.youtube.com/embed/p3qvj9hO_Bo?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/p3qvj9hO_Bo/hqdefault.jpg",
    embedAllowed: true,
    description: "Focused SQL tutorial teaching database creation, SELECT filtering, aggregate GROUP BY functions, JOINs, and relational queries in 60 minutes.",
    domains: ["sql", "data analysis", "database"],
    keywords: ["sql", "select", "where", "group by", "aggregate", "join", "joins", "database", "data analyst", "query"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fireship-sql",
    category: "video",
    primarySubject: "sql",
    videoId: "Cz3WcZLRaWc",
    title: "MySQL - The Basics // Learn SQL in 23 Easy Steps",
    provider: "Fireship",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=Cz3WcZLRaWc",
    embedUrl: "https://www.youtube.com/embed/Cz3WcZLRaWc?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/Cz3WcZLRaWc/hqdefault.jpg",
    embedAllowed: true,
    description: "Fast-paced conceptual tour of relational keys, indexes, normalization, joins, and schema modeling in SQL.",
    domains: ["sql", "mysql", "database", "relational"],
    keywords: ["sql", "mysql", "relational", "index", "indexes", "foreign key", "primary key", "join", "schema"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-traversy-sql",
    category: "video",
    primarySubject: "sql",
    videoId: "nWeW3sCmD2k",
    title: "SQL Crash Course - Beginner to Intermediate",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=nWeW3sCmD2k",
    embedUrl: "https://www.youtube.com/embed/nWeW3sCmD2k?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/nWeW3sCmD2k/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical SQL walkthrough covering queries, subqueries, aggregations, joins, constraints, and real analytical queries.",
    domains: ["sql", "data analysis", "database"],
    keywords: ["sql", "query", "subquery", "join", "aggregate", "window", "database", "data analysis", "postgresql"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-uxmastery-what-is-ux",
    category: "video",
    primarySubject: "design_ux",
    videoId: "Ovj4hFxko7c",
    title: "What the #$%@ is UX Design?",
    provider: "UX Mastery",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=Ovj4hFxko7c",
    embedUrl: "https://www.youtube.com/embed/Ovj4hFxko7c?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/Ovj4hFxko7c/hqdefault.jpg",
    embedAllowed: true,
    description: "Concise conceptual introduction distinguishing UX research, information architecture, interaction design, usability, and visual UI.",
    domains: ["ui/ux", "ux design", "user research"],
    keywords: ["ux", "ui", "ui/ux", "ux design", "user experience", "user research", "usability", "information architecture", "design thinking"],
    levels: ["Beginner"],
    language: "en"
  },
  {
    id: "yt-designcourse-uiux-crash",
    category: "video",
    primarySubject: "design_ux",
    videoId: "YiLUYf4HDh4",
    title: "Learn UI/UX Design & Figma - 2022 Interactive Crash Course",
    provider: "DesignCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=YiLUYf4HDh4",
    embedUrl: "https://www.youtube.com/embed/YiLUYf4HDh4?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/YiLUYf4HDh4/hqdefault.jpg",
    embedAllowed: true,
    description: "Hands-on walkthrough of UI visual hierarchy, whitespace, alignment, color contrast, typography scale, and responsive layout critique.",
    domains: ["ui/ux", "ui design", "figma", "visual design"],
    keywords: ["ui", "ux", "ui/ux", "visual hierarchy", "typography", "color", "contrast", "spacing", "alignment", "figma", "layout"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-arash-figma-2026",
    category: "video",
    primarySubject: "design_ux",
    videoId: "1SNZRCVNizg",
    title: "Free Figma Crash Course for Beginners 2026 | UI/UX Design",
    provider: "DesignWithArash",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=1SNZRCVNizg",
    embedUrl: "https://www.youtube.com/embed/1SNZRCVNizg?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/1SNZRCVNizg/hqdefault.jpg",
    embedAllowed: true,
    description: "Step-by-step modern Figma workflow covering Auto Layout, reusable components, design tokens, wireframing, and interactive prototyping.",
    domains: ["figma", "ui/ux", "prototyping", "design system"],
    keywords: ["figma", "auto layout", "components", "design system", "wireframe", "prototype", "prototyping", "ui/ux", "ui", "ux"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-showalter-figma-intro",
    category: "video",
    primarySubject: "design_ux",
    videoId: "jk1T0CdLxwU",
    title: "Intro to Figma - Beginners guide to Figma Basics",
    provider: "Jesse Showalter",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=jk1T0CdLxwU",
    embedUrl: "https://www.youtube.com/embed/jk1T0CdLxwU?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/jk1T0CdLxwU/hqdefault.jpg",
    embedAllowed: true,
    description: "Beginner introduction to artboards/frames, vector styling, reusable UI styles, grids, and interface design fundamentals in Figma.",
    domains: ["figma", "ui/ux", "ui design"],
    keywords: ["figma", "ui", "ux", "ui/ux", "wireframe", "mockup", "grids", "typography", "design"],
    levels: ["Beginner"],
    language: "en"
  },
  {
    id: "yt-designcourse-figma-proto",
    category: "video",
    primarySubject: "design_ux",
    videoId: "3q3FV65ZrUs",
    title: "Figma Tutorial - A Free UI Design/Prototyping Tool. It's awesome.",
    provider: "DesignCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=3q3FV65ZrUs",
    embedUrl: "https://www.youtube.com/embed/3q3FV65ZrUs?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/3q3FV65ZrUs/hqdefault.jpg",
    embedAllowed: true,
    description: "Demonstrates translating low-fidelity wireframes into interactive clickable prototypes for usability testing and developer handoff.",
    domains: ["figma", "prototyping", "ui/ux", "wireframing"],
    keywords: ["figma", "prototype", "prototyping", "wireframe", "wireframing", "usability testing", "ui/ux", "ui design"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-react-full",
    category: "video",
    primarySubject: "react",
    videoId: "bMknfKXIFA8",
    title: "React Course - Beginner's Tutorial for React JavaScript Library [2022]",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=bMknfKXIFA8",
    embedUrl: "https://www.youtube.com/embed/bMknfKXIFA8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/bMknfKXIFA8/hqdefault.jpg",
    embedAllowed: true,
    description: "Project-driven React fundamentals course covering JSX, components, props, state, conditional rendering, forms, and effects.",
    domains: ["react", "frontend", "javascript"],
    keywords: ["react", "jsx", "components", "props", "state", "useeffect", "hooks", "forms"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-traversy-react",
    category: "video",
    primarySubject: "react",
    videoId: "w7ejDZ8SWv8",
    title: "React JS Crash Course",
    provider: "Traversy Media",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=w7ejDZ8SWv8",
    embedUrl: "https://www.youtube.com/embed/w7ejDZ8SWv8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/w7ejDZ8SWv8/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical React project crash course covering components, state hooks, event handling, API fetching, and routing.",
    domains: ["react", "frontend"],
    keywords: ["react", "hooks", "state", "props", "api", "routing", "components"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-typescript",
    category: "video",
    primarySubject: "typescript",
    videoId: "gp5H0Vw39yw",
    title: "Learn TypeScript - Full Course for Beginners",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=gp5H0Vw39yw",
    embedUrl: "https://www.youtube.com/embed/gp5H0Vw39yw?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/gp5H0Vw39yw/hqdefault.jpg",
    embedAllowed: true,
    description: "Comprehensive TypeScript guide covering type annotations, narrowing, interfaces, generics, enums, and React with TypeScript.",
    domains: ["typescript", "static typing"],
    keywords: ["typescript", "ts", "types", "interfaces", "generics", "enums", "narrowing", "react"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-mosh-typescript",
    category: "video",
    primarySubject: "typescript",
    videoId: "d56mG7DezGs",
    title: "TypeScript Tutorial for Beginners",
    provider: "Programming with Mosh",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=d56mG7DezGs",
    embedUrl: "https://www.youtube.com/embed/d56mG7DezGs?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/d56mG7DezGs/hqdefault.jpg",
    embedAllowed: true,
    description: "Structured TypeScript primer covering compiler configuration, tuples, unions, type aliases, interfaces, and debugging.",
    domains: ["typescript", "static typing"],
    keywords: ["typescript", "ts", "tsconfig", "union", "tuple", "interface", "type safety"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-node-express",
    category: "video",
    primarySubject: "nodejs_backend",
    videoId: "Oe421EPjeBE",
    title: "Node.js and Express.js - Full Course",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=Oe421EPjeBE",
    embedUrl: "https://www.youtube.com/embed/Oe421EPjeBE?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/Oe421EPjeBE/hqdefault.jpg",
    embedAllowed: true,
    description: "Deep full-course walkthrough building HTTP APIs, Express routers, middleware chains, JSON payloads, and backend services.",
    domains: ["nodejs", "express", "backend", "rest api"],
    keywords: ["node", "nodejs", "express", "middleware", "router", "rest", "api", "backend"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-fcc-git-professionals",
    category: "video",
    primarySubject: "git_devops",
    videoId: "Uszj_k0DGsg",
    title: "Git for Professionals Tutorial - Tools & Concepts for Mastering Version Control with Git",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=Uszj_k0DGsg",
    embedUrl: "https://www.youtube.com/embed/Uszj_k0DGsg?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/Uszj_k0DGsg/hqdefault.jpg",
    embedAllowed: true,
    description: "Intermediate Git mastery covering interactive rebase, cherry-picking, reflog recovery, branching strategies, and clean pull requests.",
    domains: ["git", "version control", "devops"],
    keywords: ["git", "rebase", "branch", "merge", "cherry-pick", "reflog", "version control", "github"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-brocode-python-full",
    category: "video",
    primarySubject: "python",
    videoId: "XKHEtdqhLK8",
    title: "Python Full Course for free \u{1F40D}",
    provider: "Bro Code",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=XKHEtdqhLK8",
    embedUrl: "https://www.youtube.com/embed/XKHEtdqhLK8?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/XKHEtdqhLK8/hqdefault.jpg",
    embedAllowed: true,
    description: "Step-by-step Python course covering variables, loops, functions, collections, file I/O, and object-oriented programming.",
    domains: ["python", "programming"],
    keywords: ["python", "variables", "loops", "functions", "dictionaries", "lists", "oop", "classes"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-microsoft-state-of-gpt",
    category: "video",
    primarySubject: "ai_ml",
    videoId: "bZQun8Y4L2A",
    title: "State of GPT | BRK216HFS",
    provider: "Microsoft Developer",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=bZQun8Y4L2A",
    embedUrl: "https://www.youtube.com/embed/bZQun8Y4L2A?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/bZQun8Y4L2A/hqdefault.jpg",
    embedAllowed: true,
    description: "Andrej Karpathy walks through LLM training stages (pretraining, supervised fine-tuning, RLHF), prompting strategies, RAG, and agent workflows.",
    domains: ["ai engineering", "llm", "prompt engineering"],
    keywords: ["gpt", "llm", "prompt engineering", "rlhf", "fine-tuning", "rag", "ai engineer", "transformers"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-fcc-data-analysis-python",
    category: "video",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml"],
    videoId: "GPVsHOlRBBI",
    title: "Data Analysis with Python Course - Numpy, Pandas, Data Visualization",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=GPVsHOlRBBI",
    embedUrl: "https://www.youtube.com/embed/GPVsHOlRBBI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/GPVsHOlRBBI/hqdefault.jpg",
    embedAllowed: true,
    description: "Comprehensive data analysis course using NumPy arrays, Pandas DataFrames, data cleaning, exploratory analysis, and Matplotlib visualizations.",
    domains: ["data analysis", "python", "pandas", "numpy"],
    keywords: ["data analysis", "data analyst", "numpy", "pandas", "data cleaning", "matplotlib", "visualization", "eda"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-wscube-data-analytics-course",
    category: "video",
    primarySubject: "sql",
    compatibleSubjects: ["sql", "python", "ai_ml"],
    videoId: "VaSjiJMrq24",
    title: "Data Analytics FULL Course for Beginners to Pro in 29 HOURS - 2025 Edition",
    provider: "WsCube Tech",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=VaSjiJMrq24",
    embedUrl: "https://www.youtube.com/embed/VaSjiJMrq24?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/VaSjiJMrq24/hqdefault.jpg",
    embedAllowed: true,
    description: "End-to-end data analytics curriculum bridging Excel/spreadsheets, SQL queries, Python Pandas, statistics, and interactive dashboards.",
    domains: ["data analytics", "data analyst", "sql", "bi"],
    keywords: ["data analyst", "data analytics", "excel", "sql", "dashboard", "statistics", "kpi", "exploratory"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-kunal-git-github",
    category: "video",
    primarySubject: "git_devops",
    videoId: "apGV9Kg7ics",
    title: "Complete Git and GitHub Tutorial",
    provider: "Kunal Kushwaha",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=apGV9Kg7ics",
    embedUrl: "https://www.youtube.com/embed/apGV9Kg7ics?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/apGV9Kg7ics/hqdefault.jpg",
    embedAllowed: true,
    description: "Practical Git workflow guide explaining commits, branching, merging, pull requests, resolving conflicts, and open-source collaboration.",
    domains: ["git", "github", "version control"],
    keywords: ["git", "github", "commit", "branch", "merge", "pull request", "version control"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-edureka-ml-full",
    category: "video",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    videoId: "GwIo3gDZCVQ",
    title: "Machine Learning Full Course - Learn Machine Learning 10 Hours | Machine Learning Tutorial | Edureka",
    provider: "edureka!",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=GwIo3gDZCVQ",
    embedUrl: "https://www.youtube.com/embed/GwIo3gDZCVQ?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/GwIo3gDZCVQ/hqdefault.jpg",
    embedAllowed: true,
    isGenericOverview: true,
    description: "Structured machine learning walkthrough covering supervised and unsupervised algorithms, regression, decision trees, evaluation metrics, and Python implementations.",
    domains: ["machine learning", "ai", "data science"],
    keywords: ["machine learning", "supervised learning", "regression", "classification", "clustering", "scikit-learn"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Academic Writing & Research Methodology ---
  {
    id: "yt-scribbr-methodology",
    category: "video",
    primarySubject: "academic_research",
    videoId: "yplWZs3dqNQ",
    title: "How to Write a Research Methodology in 4 Steps | Scribbr \u{1F393}",
    provider: "Scribbr",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=yplWZs3dqNQ",
    embedUrl: "https://www.youtube.com/embed/yplWZs3dqNQ?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/yplWZs3dqNQ/hqdefault.jpg",
    embedAllowed: true,
    description: "Step-by-step academic guide to structuring a thesis or journal research methodology section, explaining data collection, sampling, and analytical rationale.",
    domains: ["research methodology", "academic writing", "research writing"],
    keywords: [
      "research methodology",
      "methodology",
      "academic writing",
      "research writing",
      "thesis",
      "dissertation",
      "data collection",
      "qualitative",
      "quantitative",
      "research paper"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-scribbr-lit-review",
    category: "video",
    primarySubject: "academic_research",
    videoId: "kW6Uzn-8uMI",
    title: "4 TIPS for Writing a Literature Review's Intro, Body & Conclusion | Scribbr \u{1F393}",
    provider: "Scribbr",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=kW6Uzn-8uMI",
    embedUrl: "https://www.youtube.com/embed/kW6Uzn-8uMI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/kW6Uzn-8uMI/hqdefault.jpg",
    embedAllowed: true,
    description: "Explains how to synthesize scholarly sources, structure an academic literature review, and maintain a cohesive scholarly argument.",
    domains: ["academic writing", "literature review", "research writing"],
    keywords: [
      "academic writing",
      "research writing",
      "literature review",
      "scholarly",
      "synthesis",
      "thesis",
      "essay",
      "citation",
      "english proficiency"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-scribbr-research-design",
    category: "video",
    primarySubject: "academic_research",
    videoId: "3Dd8P6IYzdE",
    title: "Research Design: Defining Your Research Aims and Approach | Scribbr \u{1F393}",
    provider: "Scribbr",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=3Dd8P6IYzdE",
    embedUrl: "https://www.youtube.com/embed/3Dd8P6IYzdE?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/3Dd8P6IYzdE/hqdefault.jpg",
    embedAllowed: true,
    description: "Compares qualitative, quantitative, and mixed-methods research designs alongside inductive and deductive inquiry for postgraduate studies.",
    domains: ["research methodology", "research design", "academic research"],
    keywords: [
      "research design",
      "research methodology",
      "qualitative",
      "quantitative",
      "mixed methods",
      "thesis",
      "postgraduate",
      "academic research"
    ],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- Public Speaking & Academic Presentation ---
  {
    id: "yt-teded-visuals",
    category: "video",
    primarySubject: "public_speaking",
    videoId: "bw5tzcoEG88",
    title: "How to effectively use visuals in your presentation",
    provider: "TED-Ed",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=bw5tzcoEG88",
    embedUrl: "https://www.youtube.com/embed/bw5tzcoEG88?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/bw5tzcoEG88/hqdefault.jpg",
    embedAllowed: true,
    description: "Teaches how to design clear slides, charts, and visual aids that reinforce spoken academic and conference presentations without clutter.",
    domains: ["presentation skills", "academic presentation", "public speaking"],
    keywords: [
      "presentation",
      "presentation skills",
      "academic presentation",
      "public speaking",
      "visuals",
      "slides",
      "visual communication",
      "conference talk"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-teded-present-ideas",
    category: "video",
    primarySubject: "public_speaking",
    videoId: "1uTRlM6MbMo",
    title: "How to present your ideas effectively",
    provider: "TED-Ed",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=1uTRlM6MbMo",
    embedUrl: "https://www.youtube.com/embed/1uTRlM6MbMo?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/1uTRlM6MbMo/hqdefault.jpg",
    embedAllowed: true,
    description: "Breaks down how to structure a central idea, hook an audience, and communicate complex arguments clearly during spoken presentations.",
    domains: ["public speaking", "presentation skills", "academic presentation"],
    keywords: [
      "public speaking",
      "presentation",
      "presentation skills",
      "academic presentation",
      "speech",
      "storytelling",
      "delivery",
      "english proficiency"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-ted-guide-speaking",
    category: "video",
    primarySubject: "public_speaking",
    videoId: "HN0hkfD6c_c",
    title: "TED Talks: The Official TED Guide to Public Speaking | Chris Anderson | Talks at Google",
    provider: "Talks at Google",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=HN0hkfD6c_c",
    embedUrl: "https://www.youtube.com/embed/HN0hkfD6c_c?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/HN0hkfD6c_c/hqdefault.jpg",
    embedAllowed: true,
    description: "In-depth guide to public speaking mastery covering idea framing, rehearsal, vocal delivery, stage presence, and engaging diverse audiences.",
    domains: ["public speaking", "presentation skills", "oral communication"],
    keywords: [
      "public speaking",
      "presentation",
      "presentation skills",
      "academic presentation",
      "speaking",
      "delivery",
      "rehearsal",
      "rhetoric"
    ],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- Geography Research & GIS (Geographic Information Systems) ---
  {
    id: "yt-spatialthoughts-qgis",
    category: "video",
    primarySubject: "geography_gis",
    videoId: "pGm7w-LywO0",
    title: "Introduction to QGIS (Full Course, Ad-Free)",
    provider: "Spatial Thoughts",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=pGm7w-LywO0",
    embedUrl: "https://www.youtube.com/embed/pGm7w-LywO0?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/pGm7w-LywO0/hqdefault.jpg",
    embedAllowed: true,
    description: "Complete open-source GIS training covering vector/raster layers, coordinate reference systems, geoprocessing, spatial analysis, and map layouts in QGIS.",
    domains: ["gis", "qgis", "geography", "spatial analysis"],
    keywords: [
      "gis",
      "geographic information systems",
      "qgis",
      "geography",
      "geography research",
      "cartography",
      "spatial analysis",
      "geoprocessing",
      "mapping"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-giseducator-qgis",
    category: "video",
    primarySubject: "geography_gis",
    videoId: "OOuq7BkUxc0",
    title: "QGIS for Absolute Beginners 2025 | Complete Step by Step GIS Tutorial",
    provider: "GIS Educator",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=OOuq7BkUxc0",
    embedUrl: "https://www.youtube.com/embed/OOuq7BkUxc0?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/OOuq7BkUxc0/hqdefault.jpg",
    embedAllowed: true,
    description: "Hands-on GIS walkthrough teaching shapefile imports, attribute tables, digitizing geographic features, and exporting publication-ready research maps.",
    domains: ["gis", "qgis", "geography", "mapping"],
    keywords: [
      "gis",
      "qgis",
      "geographic information systems",
      "geography",
      "cartography",
      "shapefile",
      "raster",
      "vector",
      "map layout"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-geoskillpro-qgis",
    category: "video",
    primarySubject: "geography_gis",
    videoId: "2eb9FBFDOMU",
    title: "Module 1: QGIS Course Introduction and Learning Roadmap GIS for Beginners",
    provider: "GeoSkill Pro",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=2eb9FBFDOMU",
    embedUrl: "https://www.youtube.com/embed/2eb9FBFDOMU?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/2eb9FBFDOMU/hqdefault.jpg",
    embedAllowed: true,
    description: "Structured GIS orientation explaining core spatial data concepts, GIS workflows for geography research, and QGIS tooling.",
    domains: ["gis", "geography", "qgis"],
    keywords: [
      "gis",
      "geographic information systems",
      "geography",
      "geography research",
      "environmental",
      "environmental research",
      "spatial analysis",
      "qgis",
      "spatial data",
      "geospatial"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Business, Strategy, Entrepreneurship & Operations ---
  {
    id: "yt-cc-business-idea",
    category: "video",
    primarySubject: "business_management",
    videoId: "iywvlUk2Wfg",
    title: "How to Develop a Business Idea: Crash Course Business - Entrepreneurship #2",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=iywvlUk2Wfg",
    embedUrl: "https://www.youtube.com/embed/iywvlUk2Wfg?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/iywvlUk2Wfg/hqdefault.jpg",
    embedAllowed: true,
    description: "Covers identifying market opportunities, evaluating value propositions, analyzing competition, and validating business strategy.",
    domains: ["business", "entrepreneurship", "strategy", "marketing"],
    keywords: [
      "business",
      "entrepreneurship",
      "business strategy",
      "value proposition",
      "swot",
      "marketing",
      "market research",
      "product management"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-mvp-pivoting",
    category: "video",
    primarySubject: "business_management",
    videoId: "kmfC-i9WgH0",
    title: "Minimum Viable Product and Pivoting: Crash Course Business Entrepreneurship #6",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=kmfC-i9WgH0",
    embedUrl: "https://www.youtube.com/embed/kmfC-i9WgH0?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/kmfC-i9WgH0/hqdefault.jpg",
    embedAllowed: true,
    description: "Explains iterative product validation, MVP experimentation, agile pivots, and customer-driven business execution.",
    domains: ["business", "product management", "entrepreneurship", "agile"],
    keywords: [
      "business",
      "mvp",
      "agile",
      "product management",
      "project management",
      "strategy",
      "operations management",
      "okr"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-core-business-operations",
    category: "video",
    primarySubject: "business_management",
    videoId: "8bu1Ltpeiu4",
    title: "The Core of a Business - Key Activities & Resources: Crash Course Business Entrepreneurship #8",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=8bu1Ltpeiu4",
    embedUrl: "https://www.youtube.com/embed/8bu1Ltpeiu4?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/8bu1Ltpeiu4/hqdefault.jpg",
    embedAllowed: true,
    description: "Breaks down core operational activities, resource planning, supply chain execution, and organizational capability building.",
    domains: ["business", "operations management", "business management"],
    keywords: [
      "business",
      "operations",
      "operations management",
      "business management",
      "supply chain",
      "project management",
      "strategy",
      "leadership"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-customer-communication",
    category: "video",
    primarySubject: "business_management",
    videoId: "gaPWVChiyfk",
    title: "How to Communicate with Customers: Crash Course Entrepreneurship #11",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=gaPWVChiyfk",
    embedUrl: "https://www.youtube.com/embed/gaPWVChiyfk?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/gaPWVChiyfk/hqdefault.jpg",
    embedAllowed: true,
    description: "Walks through customer segmentation, marketing channels, brand positioning, and digital outreach strategies.",
    domains: ["marketing", "digital marketing", "business"],
    keywords: [
      "marketing",
      "digital marketing",
      "brand",
      "customer",
      "swot",
      "seo",
      "business",
      "communication"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-business-decisions",
    category: "video",
    primarySubject: "business_management",
    videoId: "vLxjUNINfnY",
    title: "How to Make Tough Decisions: Crash Course Business - Soft Skills #11",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=vLxjUNINfnY",
    embedUrl: "https://www.youtube.com/embed/vLxjUNINfnY?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/vLxjUNINfnY/hqdefault.jpg",
    embedAllowed: true,
    description: "Structured framework for strategic decision-making, stakeholder alignment, risk trade-offs, and management leadership.",
    domains: ["leadership", "business management", "project management"],
    keywords: [
      "leadership",
      "decision making",
      "project management",
      "business management",
      "stakeholder",
      "okr",
      "strategy"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- Engineering (General, Systems, Electrical, Chemical/Process) ---
  {
    id: "yt-cc-what-is-engineering",
    category: "video",
    primarySubject: "engineering",
    videoId: "btGYcizV0iI",
    title: "What is Engineering?: Crash Course Engineering #1",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=btGYcizV0iI",
    embedUrl: "https://www.youtube.com/embed/btGYcizV0iI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/btGYcizV0iI/hqdefault.jpg",
    embedAllowed: true,
    description: "Introduces engineering disciplines, the engineering design process, problem framing, prototyping, and systems thinking.",
    domains: ["engineering", "systems engineering", "mechanical engineering", "civil engineering"],
    keywords: [
      "engineering",
      "engineering design",
      "systems engineering",
      "systems thinking",
      "mechanical engineering",
      "civil engineering",
      "industrial engineering",
      "statics",
      "prototyping"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-khan-ohms-law",
    category: "video",
    primarySubject: "engineering",
    videoId: "FuIn1L3qeqI",
    title: "Ohm's law | Physics | Khan Academy",
    provider: "Khan Academy",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=FuIn1L3qeqI",
    embedUrl: "https://www.youtube.com/embed/FuIn1L3qeqI?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/FuIn1L3qeqI/hqdefault.jpg",
    embedAllowed: true,
    description: "Clear derivation and worked circuit examples of Ohm's Law (V = IR), voltage, current, and electrical resistance.",
    domains: ["electrical engineering", "circuits", "engineering", "physics"],
    keywords: [
      "electrical engineering",
      "circuit analysis",
      "circuits",
      "ohm",
      "voltage",
      "current",
      "resistance",
      "engineering"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-chemical-engineering",
    category: "video",
    primarySubject: "engineering",
    videoId: "aRKyJRAxjpM",
    title: "The History of Chemical Engineering: Crash Course Engineering #5",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=aRKyJRAxjpM",
    embedUrl: "https://www.youtube.com/embed/aRKyJRAxjpM?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/aRKyJRAxjpM/hqdefault.jpg",
    embedAllowed: true,
    description: "Explores process engineering, thermodynamics, unit operations, scale-up design, and industrial materials transformations.",
    domains: ["chemical engineering", "engineering", "thermodynamics", "industrial engineering"],
    keywords: [
      "chemical engineering",
      "thermodynamics",
      "process engineering",
      "industrial engineering",
      "materials science",
      "engineering"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-electrical-engineering",
    category: "video",
    primarySubject: "engineering",
    videoId: "3nB1Ntku06w",
    title: "The History of Electrical Engineering: Crash Course Engineering #4",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=3nB1Ntku06w",
    embedUrl: "https://www.youtube.com/embed/3nB1Ntku06w?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/3nB1Ntku06w/hqdefault.jpg",
    embedAllowed: true,
    description: "Explores core foundations of electrical engineering, electromagnetism, electric power systems, communications, and electronics.",
    domains: ["electrical engineering", "electronics", "systems design", "engineering"],
    keywords: [
      "electrical engineering",
      "electronics",
      "systems design",
      "systems engineering",
      "circuits",
      "electromagnetism",
      "power",
      "engineering"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-electrical-power",
    category: "video",
    primarySubject: "engineering",
    videoId: "uTWHMchUlws",
    title: "Electrical Power, Conductors, & Your Dream Home: Crash Course Engineering #21",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=uTWHMchUlws",
    embedUrl: "https://www.youtube.com/embed/uTWHMchUlws?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/uTWHMchUlws/hqdefault.jpg",
    embedAllowed: true,
    description: "Examines conductors, resistance, electrical power distribution, circuit safety, and practical electronics design principles.",
    domains: ["electrical engineering", "electronics", "circuits", "power systems"],
    keywords: [
      "electrical engineering",
      "electronics",
      "circuits",
      "circuit analysis",
      "conductors",
      "power",
      "voltage",
      "resistance",
      "engineering"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "yt-cc-signal-processing",
    category: "video",
    primarySubject: "engineering",
    videoId: "VjuFaPAIOHw",
    title: "YouTube Couldn't Exist Without Communications & Signal Processing: Crash Course Engineering #42",
    provider: "CrashCourse",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=VjuFaPAIOHw",
    embedUrl: "https://www.youtube.com/embed/VjuFaPAIOHw?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/VjuFaPAIOHw/hqdefault.jpg",
    embedAllowed: true,
    description: "Covers signal processing, communications systems, bandwidth capacity, noise filtering, and electrical systems design.",
    domains: ["electrical engineering", "signal processing", "systems design", "electronics"],
    keywords: [
      "electrical engineering",
      "signal processing",
      "systems design",
      "systems engineering",
      "electronics",
      "communications",
      "bandwidth",
      "engineering"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "yt-fcc-system-design",
    category: "video",
    primarySubject: "nodejs_backend",
    compatibleSubjects: ["nodejs_backend", "git_devops", "sql", "react"],
    videoId: "C842vFY5kRo",
    title: "System Design Course \u2013 APIs, Databases, Caching, CDNs, Load Balancing & Production Infra",
    provider: "freeCodeCamp.org",
    type: "Video Tutorial",
    url: "https://www.youtube.com/watch?v=C842vFY5kRo",
    embedUrl: "https://www.youtube.com/embed/C842vFY5kRo?rel=0",
    thumbnailUrl: "https://i.ytimg.com/vi/C842vFY5kRo/hqdefault.jpg",
    embedAllowed: true,
    description: "Complete course on software architecture and system design covering APIs, SQL/NoSQL scaling, caching, load balancing, and production architecture.",
    domains: ["software architecture", "system design", "backend", "full-stack"],
    keywords: [
      "software architecture",
      "system design",
      "architecture",
      "full-stack",
      "full stack",
      "api",
      "database",
      "sql",
      "caching",
      "load balancing",
      "scalability",
      "backend"
    ],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // ==========================================
  // 2. TRUSTED WRITTEN TUTORIALS & DOCS
  // ==========================================
  // --- CSS Tutorials ---
  {
    id: "mdn-css-flexbox",
    category: "tutorial",
    primarySubject: "css",
    title: "Basic Concepts of Flexbox (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts",
    description: "Official Mozilla guide explaining flex containers, main/cross axis alignment, flex-wrap, flex sizing, and spacing.",
    domains: ["css", "flexbox", "layout"],
    keywords: ["css", "flexbox", "flex", "alignment", "responsive", "layout", "modern css"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mdn-css-grid",
    category: "tutorial",
    primarySubject: "css",
    title: "Basic Concepts of CSS Grid Layout (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Basic_concepts",
    description: "Authoritative CSS Grid documentation covering grid tracks, fr units, grid lines, gutters, and two-dimensional layout patterns.",
    domains: ["css", "css grid", "grid", "layout"],
    keywords: ["css", "grid", "css grid", "grid layout", "layout", "responsive", "modern css"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mdn-responsive-design",
    category: "tutorial",
    primarySubject: "css",
    compatibleSubjects: ["html", "css"],
    title: "Responsive Web Design & Media Queries Guide (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design",
    description: "Official Mozilla lesson on responsive layouts combining Flexbox, CSS Grid, CSS media queries, fluid typography, and mobile-first breakpoints.",
    domains: ["css", "responsive design", "media queries"],
    keywords: ["responsive", "responsive design", "media query", "media queries", "mobile-first", "flexbox", "grid", "css", "modern css"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "webdev-learn-css",
    category: "tutorial",
    primarySubject: "css",
    title: "Learn CSS \u2014 Modern Layout & Styling Modules",
    provider: "web.dev (Google)",
    type: "Educational Article",
    url: "https://web.dev/learn/css",
    description: "Well-illustrated modular lessons on CSS box model, selectors, flexbox, grid, spacing, color, and typography.",
    domains: ["css", "layout", "styling"],
    keywords: ["css", "flexbox", "grid", "layout", "box model", "typography", "responsive", "modern css"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mdn-css",
    category: "tutorial",
    primarySubject: "css",
    isGenericOverview: true,
    title: "CSS Layout, Box Model & Styling Reference",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS",
    description: "Authoritative CSS reference covering selectors, specificity, Flexbox, CSS Grid, custom properties, and responsive design.",
    domains: ["css", "styling", "layout"],
    keywords: ["css", "flexbox", "grid", "layout", "box model", "responsive", "selector", "media query"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- HTML Tutorials ---
  {
    id: "mdn-html",
    category: "tutorial",
    primarySubject: "html",
    title: "HTML: HyperText Markup Language Guide",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML",
    description: "Official Mozilla guide to semantic HTML elements, document structure, forms, validation attributes, and accessibility.",
    domains: ["html", "html5", "semantic"],
    keywords: ["html", "html5", "semantic", "form", "element", "accessibility", "markup"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mdn-learn-web",
    category: "tutorial",
    primarySubject: "html",
    compatibleSubjects: ["html", "css", "javascript"],
    isGenericOverview: true,
    title: "Learn Web Development Structured Pathway",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Learn_web_development",
    description: "Foundational tutorials maintained by Mozilla spanning HTML, CSS, JavaScript, web forms, and browser APIs.",
    domains: ["web", "frontend", "html", "css", "javascript"],
    keywords: ["web", "frontend", "html", "css", "javascript", "dom", "browser", "accessibility"],
    levels: ["Beginner"],
    language: "en"
  },
  // --- JavaScript Tutorials ---
  {
    id: "mdn-js-grammar-types",
    category: "tutorial",
    primarySubject: "javascript",
    title: "JavaScript Grammar, Variables & Declarations (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types",
    description: "Authoritative guide on modern JavaScript syntax, var/let/const declarations, variable scope, hoisting, and literals.",
    domains: ["javascript", "syntax", "scope"],
    keywords: ["javascript", "js", "syntax", "grammar", "let", "const", "var", "hoisting", "scope", "declaration", "modern javascript"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mdn-js-scope",
    category: "tutorial",
    primarySubject: "javascript",
    title: "Scope in JavaScript \u2014 Global, Function & Block Scope",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Glossary/Scope",
    description: "Concise MDN reference distinguishing global scope, module scope, function scope, and lexical block scope.",
    domains: ["javascript", "scope", "closures"],
    keywords: ["scope", "block scope", "function scope", "lexical scope", "global scope", "closure", "javascript", "let", "const"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mdn-js-closures",
    category: "tutorial",
    primarySubject: "javascript",
    title: "Closures & Lexical Scoping Guide (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures",
    description: "Explains how nested functions retain access to outer lexical environments, private state patterns, and scope chains.",
    domains: ["javascript", "closures", "scope"],
    keywords: ["closure", "closures", "scope", "lexical", "function", "javascript", "private"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mdn-js-array",
    category: "tutorial",
    primarySubject: "javascript",
    title: "JavaScript Array & Array Methods Reference (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
    description: "Complete reference for JavaScript Array methods including map, filter, reduce, find, flatMap, and slice.",
    domains: ["javascript", "arrays", "data structures"],
    keywords: ["array", "arrays", "array method", "array methods", "map", "filter", "reduce", "data structures", "javascript", "modern javascript"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mdn-js-data-structures",
    category: "tutorial",
    primarySubject: "javascript",
    title: "JavaScript Data Types & Data Structures (MDN)",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures",
    description: "Covers primitives, objects, indexed collections (Arrays), and keyed collections (Maps, Sets) in modern JavaScript.",
    domains: ["javascript", "data structures"],
    keywords: ["data structure", "data structures", "data type", "array", "object", "map", "set", "primitive", "javascript", "js"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "jsinfo-data-types",
    category: "tutorial",
    primarySubject: "javascript",
    title: "Data Types, Arrays, Maps & Sets in Modern JavaScript",
    provider: "javascript.info",
    type: "Educational Article",
    url: "https://javascript.info/data-types",
    description: "Clear interactive reading with runnable examples covering JavaScript array methods, objects, Map/Set, and destructuring.",
    domains: ["javascript", "data structures", "arrays"],
    keywords: ["data structure", "data structures", "array", "array methods", "object", "map", "set", "destructuring", "syntax", "modern javascript", "javascript"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "jsinfo-closures",
    category: "tutorial",
    primarySubject: "javascript",
    title: "Variable Scope & Closure Deep Dive",
    provider: "javascript.info",
    type: "Educational Article",
    url: "https://javascript.info/closure",
    description: "Step-by-step visual guide to Lexical Environment records, nested functions, garbage collection, and scope exercises.",
    domains: ["javascript", "scope", "closures"],
    keywords: ["scope", "closure", "closures", "lexical", "let", "var", "function", "javascript"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "jsinfo-async",
    category: "tutorial",
    primarySubject: "javascript",
    title: "Promises, Async/Await & Error Handling",
    provider: "javascript.info",
    type: "Educational Article",
    url: "https://javascript.info/async",
    description: "Structured chapters explaining callbacks, Promise chaining, Promise.all, microtasks, and async/await syntax.",
    domains: ["javascript", "async", "promises"],
    keywords: ["async", "await", "async/await", "promise", "promises", "callback", "asynchronous", "fetch", "javascript"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mdn-javascript",
    category: "tutorial",
    primarySubject: "javascript",
    isGenericOverview: true,
    title: "JavaScript Guide & Language Reference",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    description: "Comprehensive Mozilla reference covering JavaScript syntax, functions, modules, promises, and object-oriented patterns.",
    domains: ["javascript"],
    keywords: ["javascript", "js", "es6", "module", "function", "dom", "promise", "syntax"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mdn-http-apis",
    category: "tutorial",
    primarySubject: "nodejs_backend",
    compatibleSubjects: ["nodejs_backend", "javascript", "python"],
    title: "HTTP & Web APIs Reference",
    provider: "MDN Web Docs",
    type: "Official Documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP",
    description: "Authoritative reference for HTTP methods, status codes, headers, cookies, CORS, caching, and REST communication.",
    domains: ["http", "rest api", "backend"],
    keywords: ["http", "https", "rest", "api", "cors", "headers", "status code", "request", "response", "cookies"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- React, TypeScript, Node.js & Express Tutorials ---
  {
    id: "react-official-learn",
    category: "tutorial",
    primarySubject: "react",
    title: "React Official Interactive Guide",
    provider: "React Docs (react.dev)",
    type: "Official Documentation",
    url: "https://react.dev/learn",
    description: "Official React guide teaching components, JSX, props, conditional rendering, hooks, and thinking in React.",
    domains: ["react", "components", "hooks"],
    keywords: ["react", "jsx", "component", "props", "hook", "usestate", "useeffect", "spa"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "react-managing-state",
    category: "tutorial",
    primarySubject: "react",
    title: "Managing State & Data Flow in React",
    provider: "React Docs (react.dev)",
    type: "Official Documentation",
    url: "https://react.dev/learn/managing-state",
    description: "Deep guide to structuring state cleanly, lifting state up, reducers, Context API, and avoiding redundant state.",
    domains: ["react", "state", "context"],
    keywords: ["react", "state", "context", "reducer", "usereducer", "usecontext", "data flow", "hooks"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "typescript-handbook",
    category: "tutorial",
    primarySubject: "typescript",
    title: "The TypeScript Handbook",
    provider: "TypeScript Official Docs",
    type: "Official Documentation",
    url: "https://www.typescriptlang.org/docs/handbook/intro.html",
    description: "Official TypeScript documentation explaining static type checking, interfaces, union types, narrowing, and generics.",
    domains: ["typescript", "types", "generics"],
    keywords: ["typescript", "ts", "interface", "generic", "narrowing", "union", "type safety", "static typing"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "nodejs-official-learn",
    category: "tutorial",
    primarySubject: "nodejs_backend",
    title: "Node.js Official Learning Guides",
    provider: "Node.js Foundation",
    type: "Official Documentation",
    url: "https://nodejs.org/learn/getting-started/introduction-to-nodejs",
    description: "Official Node.js guides covering V8 runtime concepts, event loop, asynchronous I/O, TypeScript/ESM, and servers.",
    domains: ["node", "nodejs", "backend"],
    keywords: ["node", "nodejs", "node.js", "event loop", "backend", "server", "npm", "api", "runtime"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "express-official-guide",
    category: "tutorial",
    primarySubject: "nodejs_backend",
    title: "Express.js Getting Started & Routing Guide",
    provider: "Express.js Docs",
    type: "Official Documentation",
    url: "https://expressjs.com/en/starter/installing/",
    description: "Official Express.js guide for setting up servers, defining REST routes, configuring middleware, and error handlers.",
    domains: ["express", "nodejs", "backend"],
    keywords: ["express", "expressjs", "middleware", "route", "routing", "rest", "api", "backend", "endpoint"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "freecodecamp-software-architecture",
    category: "tutorial",
    primarySubject: "nodejs_backend",
    compatibleSubjects: ["nodejs_backend", "git_devops", "react", "sql"],
    title: "An Introduction to Software Architecture Patterns",
    provider: "freeCodeCamp",
    type: "Educational Article",
    url: "https://www.freecodecamp.org/news/an-introduction-to-software-architecture-patterns/",
    description: "Practical guide to software architecture patterns including layered MVC, client-server systems, event-driven architecture, and microservices.",
    domains: ["software architecture", "system design", "full-stack"],
    keywords: [
      "software architecture",
      "architecture",
      "system design",
      "design patterns",
      "mvc",
      "microservices",
      "full-stack",
      "backend"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "martinfowler-architecture",
    category: "tutorial",
    primarySubject: "git_devops",
    compatibleSubjects: ["git_devops", "nodejs_backend"],
    title: "Software Architecture Guide",
    provider: "Martin Fowler",
    type: "Educational Article",
    url: "https://martinfowler.com/architecture/",
    description: "Authoritative guide to software architecture principles, evolutionary design, microservices trade-offs, and maintainable system boundaries.",
    domains: ["software architecture", "system design", "software engineering"],
    keywords: [
      "software architecture",
      "architecture",
      "system design",
      "microservices",
      "software engineering",
      "patterns"
    ],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- SQL Tutorials ---
  {
    id: "postgresql-joins-tutorial",
    category: "tutorial",
    primarySubject: "sql",
    title: "PostgreSQL Joins Between Tables Guide",
    provider: "PostgreSQL Global Development Group",
    type: "Official Documentation",
    url: "https://www.postgresql.org/docs/current/tutorial-join.html",
    description: "Official PostgreSQL guide demonstrating inner joins, outer joins, table aliases, and multi-table relational queries.",
    domains: ["sql", "sql joins", "relational", "postgresql"],
    keywords: ["sql", "join", "joins", "sql joins", "inner join", "outer join", "relational", "schema", "schemas", "postgresql", "postgres"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "postgresql-official-tutorial",
    category: "tutorial",
    primarySubject: "sql",
    title: "PostgreSQL Official SQL Tutorial & Docs",
    provider: "PostgreSQL Global Development Group",
    type: "Official Documentation",
    url: "https://www.postgresql.org/docs/current/tutorial.html",
    description: "Official PostgreSQL tutorial introducing relational tables, schemas, queries, joins, aggregates, views, and transactions.",
    domains: ["sql", "relational", "postgresql"],
    keywords: ["sql", "postgresql", "postgres", "database", "join", "joins", "query", "schema", "schemas", "index", "transaction", "relational", "normalization"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "sqlite-official-docs",
    category: "tutorial",
    primarySubject: "sql",
    title: "SQLite Documentation & SQL Syntax",
    provider: "SQLite Consortium",
    type: "Official Documentation",
    url: "https://www.sqlite.org/docs.html",
    description: "Official technical documentation for SQLite queries, data types, ACID transactions, and embedded SQL databases.",
    domains: ["sql", "sqlite", "database"],
    keywords: ["sqlite", "sql", "database", "table", "query", "acid", "relational"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- Git & Docker Tutorials ---
  {
    id: "git-official-docs",
    category: "tutorial",
    primarySubject: "git_devops",
    title: "Pro Git Book & Official Git Reference",
    provider: "Git Official Documentation",
    type: "Official Documentation",
    url: "https://git-scm.com/doc",
    description: "Official Git documentation and the complete free Pro Git book covering branching, rebasing, merging, and workflows.",
    domains: ["git", "version control"],
    keywords: ["git", "github", "version control", "branch", "merge", "commit", "rebase", "pull request"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "docker-get-started",
    category: "tutorial",
    primarySubject: "git_devops",
    title: "Docker Official Get Started Guide",
    provider: "Docker Docs",
    type: "Official Documentation",
    url: "https://docs.docker.com/get-started/",
    description: "Official introduction to containers, images, Dockerfiles, networking, and multi-container development with Compose.",
    domains: ["docker", "devops"],
    keywords: ["docker", "container", "dockerfile", "compose", "deployment", "devops", "ci/cd"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Python & AI/ML Tutorials ---
  {
    id: "python-official-tutorial",
    category: "tutorial",
    primarySubject: "python",
    title: "The Official Python 3 Tutorial",
    provider: "Python Software Foundation",
    type: "Official Documentation",
    url: "https://docs.python.org/3/tutorial/index.html",
    description: "Official Python tutorial covering data types, control flow, data structures, functions, modules, classes, and exceptions.",
    domains: ["python", "python fundamentals"],
    keywords: ["python", "python fundamentals", "variable", "loop", "list", "dict", "tuple", "data structures", "function", "functions", "class", "oop", "module", "exception", "venv"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "python-standard-library",
    category: "tutorial",
    primarySubject: "python",
    title: "Python Standard Library Reference",
    provider: "Python Software Foundation",
    type: "Official Documentation",
    url: "https://docs.python.org/3/library/index.html",
    description: "Complete reference for Python built-in functions, collections, pathlib, json, asyncio, and unittest modules.",
    domains: ["python", "standard library"],
    keywords: ["python", "library", "asyncio", "json", "unittest", "collections", "itertools", "file", "pathlib", "decorator"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "fastapi-official-tutorial",
    category: "tutorial",
    primarySubject: "python",
    title: "FastAPI User Guide & Tutorial",
    provider: "FastAPI Official Docs",
    type: "Official Documentation",
    url: "https://fastapi.tiangolo.com/tutorial/",
    description: "Official step-by-step guide to building typed REST APIs in Python with FastAPI and Pydantic validation.",
    domains: ["python", "fastapi", "api"],
    keywords: ["fastapi", "pydantic", "rest", "api", "backend", "endpoint", "python", "microservice"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "scikit-learn-user-guide",
    category: "tutorial",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    title: "scikit-learn Official User Guide",
    provider: "scikit-learn",
    type: "Official Documentation",
    url: "https://scikit-learn.org/stable/user_guide.html",
    description: "Official guide to supervised and unsupervised learning, cross-validation, preprocessing, and model evaluation.",
    domains: ["machine learning", "scikit-learn", "data science"],
    keywords: ["scikit", "sklearn", "machine learning", "classification", "clustering", "validation", "metrics", "f1", "scaling"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "pytorch-official-tutorials",
    category: "tutorial",
    primarySubject: "ai_ml",
    title: "PyTorch Official Learning Tutorials",
    provider: "PyTorch Foundation",
    type: "Official Documentation",
    url: "https://pytorch.org/tutorials/",
    description: "Official tutorials for tensors, autograd, neural network architectures, and deep learning workflows.",
    domains: ["deep learning", "pytorch", "ai"],
    keywords: ["pytorch", "deep learning", "tensor", "neural network", "transformer", "llm", "nlp", "computer vision"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- Design, Security, Business, Communication Tutorials ---
  {
    id: "w3c-wai-fundamentals",
    category: "tutorial",
    primarySubject: "design_ux",
    compatibleSubjects: ["design_ux", "html", "css"],
    title: "Web Accessibility Fundamentals (WCAG)",
    provider: "W3C Web Accessibility Initiative",
    type: "Official Documentation",
    url: "https://www.w3.org/WAI/fundamentals/",
    description: "Official W3C standards for accessible typography, color contrast, ARIA roles, keyboard navigation, and inclusive UX.",
    domains: ["accessibility", "wcag", "ui/ux"],
    keywords: ["accessibility", "wcag", "contrast", "a11y", "aria", "ux", "ui", "usability", "inclusive design"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "material-design-3",
    category: "tutorial",
    primarySubject: "design_ux",
    title: "Material Design 3 Foundations & Guidelines",
    provider: "Google Design",
    type: "Official Documentation",
    url: "https://m3.material.io/foundations",
    description: "Design system principles covering visual hierarchy, layout grids, typography scales, color tokens, and components.",
    domains: ["ui/ux", "design system"],
    keywords: ["ui", "ux", "design system", "typography", "color", "wireframe", "hierarchy", "spacing"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "figma-help-center",
    category: "tutorial",
    primarySubject: "design_ux",
    title: "Figma Official Learn & Help Guides",
    provider: "Figma",
    type: "Official Documentation",
    url: "https://help.figma.com/hc/en-us",
    description: "Official Figma guides covering frames, auto layout, components, prototyping, and collaborative design workflows.",
    domains: ["figma", "ui/ux"],
    keywords: ["figma", "prototype", "wireframe", "auto layout", "ui design", "mockup"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "owasp-top-ten",
    category: "tutorial",
    primarySubject: "cybersecurity",
    title: "OWASP Top 10 Web Application Security Risks",
    provider: "OWASP Foundation",
    type: "Official Documentation",
    url: "https://owasp.org/www-project-top-ten/",
    description: "Industry-standard reference detailing critical web security risks such as injection, broken auth, and access control.",
    domains: ["cybersecurity", "owasp", "security"],
    keywords: ["security", "cybersecurity", "owasp", "sql injection", "xss", "csrf", "authentication", "authorization", "vulnerability"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "nist-cybersecurity",
    category: "tutorial",
    primarySubject: "cybersecurity",
    title: "NIST Cybersecurity Framework",
    provider: "NIST",
    type: "Official Documentation",
    url: "https://www.nist.gov/cyberframework",
    description: "Authoritative framework for risk management, threat identification, access governance, and incident response.",
    domains: ["cybersecurity", "nist"],
    keywords: ["cybersecurity", "risk", "nist", "incident", "governance", "compliance", "network security", "least privilege"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "openstax-business",
    category: "tutorial",
    primarySubject: "business_management",
    title: "OpenStax Peer-Reviewed Business & Management Textbooks",
    provider: "OpenStax (Rice University)",
    type: "Educational Article",
    url: "https://openstax.org/subjects/business",
    description: "Free peer-reviewed university textbooks covering management, organizational behavior, entrepreneurship, and marketing.",
    domains: ["business", "management", "marketing"],
    keywords: ["management", "strategy", "business", "leadership", "operations", "marketing", "entrepreneurship", "okr", "swot", "agile"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "purdue-owl-writing",
    category: "tutorial",
    primarySubject: "academic_research",
    title: "Purdue Online Writing Lab (OWL)",
    provider: "Purdue University",
    type: "Educational Article",
    url: "https://owl.purdue.edu/owl/purdue_owl.html",
    description: "Authoritative university guides on academic writing, research papers, scholarly citations (APA/MLA/Chicago), and grammar.",
    domains: ["academic writing", "research writing", "english proficiency"],
    keywords: ["academic writing", "research writing", "essay", "thesis", "citation", "grammar", "scholarly", "english proficiency"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "purdue-owl-academic-writing",
    category: "tutorial",
    primarySubject: "academic_research",
    title: "Academic Writing & Thesis Structure Guide (Purdue OWL)",
    provider: "Purdue University",
    type: "Educational Article",
    url: "https://owl.purdue.edu/owl/general_writing/academic_writing/index.html",
    description: "Detailed university reference on scholarly tone, thesis statements, critical argumentation, paragraph cohesion, and graduate-level academic prose.",
    domains: ["academic writing", "research writing", "scholarly writing"],
    keywords: [
      "academic writing",
      "research writing",
      "scholarly tone",
      "thesis",
      "dissertation",
      "essay",
      "academic discourse",
      "english proficiency",
      "argumentation"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "purdue-owl-research",
    category: "tutorial",
    primarySubject: "academic_research",
    title: "Conducting Academic Research & Methodology Guide (Purdue OWL)",
    provider: "Purdue University",
    type: "Educational Article",
    url: "https://owl.purdue.edu/owl/research_and_citation/conducting_research/index.html",
    description: "Covers primary vs secondary research methodology, source evaluation, empirical inquiry, and integrating evidence into research papers.",
    domains: ["research methodology", "research writing", "academic research"],
    keywords: [
      "research methodology",
      "research methods",
      "research writing",
      "academic research",
      "primary research",
      "source evaluation",
      "literature review",
      "empirical"
    ],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "unc-writing-center-tips",
    category: "tutorial",
    primarySubject: "academic_research",
    compatibleSubjects: ["academic_research", "public_speaking"],
    title: "UNC Writing Center: Academic Writing, Literature Reviews & Presentations",
    provider: "UNC Chapel Hill Writing Center",
    type: "Educational Article",
    url: "https://writingcenter.unc.edu/tips-and-tools/",
    description: "Comprehensive university handouts on literature reviews, graduate theses, academic presentations, clarity, and scholarly revision.",
    domains: ["academic writing", "research methodology", "academic presentation"],
    keywords: [
      "academic writing",
      "literature review",
      "presentation",
      "academic presentation",
      "thesis",
      "dissertation",
      "research paper",
      "english proficiency"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- Geography Research & GIS Official Documentation ---
  {
    id: "qgis-gentle-intro",
    category: "tutorial",
    primarySubject: "geography_gis",
    title: "A Gentle Introduction to GIS (QGIS Official Documentation)",
    provider: "QGIS Project",
    type: "Official Documentation",
    url: "https://docs.qgis.org/latest/en/docs/gentle_gis_introduction/",
    description: "Official open-source GIS textbook introducing vector/raster data models, map projections, spatial analysis, and cartographic design for geography research.",
    domains: ["gis", "geographic information systems", "geography"],
    keywords: [
      "gis",
      "geographic information systems",
      "geography",
      "geography research",
      "qgis",
      "spatial analysis",
      "cartography",
      "map projections",
      "vector",
      "raster"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "qgis-training-manual",
    category: "tutorial",
    primarySubject: "geography_gis",
    title: "QGIS Official Training Manual & Spatial Analysis Modules",
    provider: "QGIS Project",
    type: "Official Documentation",
    url: "https://docs.qgis.org/latest/en/docs/training_manual/",
    description: "Step-by-step official QGIS curriculum covering map composition, spatial queries, terrain analysis, remote sensing, and geographic research workflows.",
    domains: ["gis", "qgis", "geography research", "spatial analysis"],
    keywords: [
      "qgis",
      "gis",
      "geographic information systems",
      "geography",
      "geography research",
      "spatial analysis",
      "geoprocessing",
      "cartography",
      "terrain"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "learn-arcgis-gallery",
    category: "tutorial",
    primarySubject: "geography_gis",
    title: "Learn ArcGIS Guided Spatial & Geography Tutorials",
    provider: "Esri Learn ArcGIS",
    type: "Official Documentation",
    url: "https://learn.arcgis.com/en/gallery/",
    description: "Guided scenario tutorials applying GIS mapping, environmental geography analysis, demographic spatial statistics, and story maps.",
    domains: ["gis", "arcgis", "geography", "geospatial", "environmental research"],
    keywords: [
      "arcgis",
      "gis",
      "geographic information systems",
      "geography",
      "geography research",
      "environmental",
      "environmental research",
      "spatial analysis",
      "spatial statistics",
      "story maps",
      "geospatial"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- Business, Management & Marketing Open Textbooks ---
  {
    id: "openstax-principles-management",
    category: "tutorial",
    primarySubject: "business_management",
    title: "Principles of Management (OpenStax Textbook)",
    provider: "OpenStax (Rice University)",
    type: "Educational Article",
    url: "https://openstax.org/details/books/principles-management",
    description: "Free peer-reviewed university textbook on organizational strategy, leadership, Agile/OKR planning, operations, and project execution.",
    domains: ["business", "business management", "project management", "leadership"],
    keywords: [
      "business management",
      "project management",
      "operations management",
      "organizational",
      "strategic management",
      "leadership",
      "okr",
      "agile",
      "stakeholder"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "openstax-principles-marketing",
    category: "tutorial",
    primarySubject: "business_management",
    title: "Principles of Marketing (OpenStax Textbook)",
    provider: "OpenStax (Rice University)",
    type: "Educational Article",
    url: "https://openstax.org/details/books/principles-marketing",
    description: "Open university marketing textbook covering SWOT analysis, digital marketing, market segmentation, pricing, and brand positioning.",
    domains: ["marketing", "digital marketing", "business"],
    keywords: [
      "marketing",
      "digital marketing",
      "swot",
      "seo",
      "market research",
      "brand",
      "strategy",
      "business"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "libretexts-business",
    category: "tutorial",
    primarySubject: "business_management",
    compatibleSubjects: ["business_management", "finance_economics"],
    title: "LibreTexts Open Business & Economics Library",
    provider: "LibreTexts",
    type: "Educational Article",
    url: "https://biz.libretexts.org/",
    description: "Peer-reviewed open educational modules covering business strategy, management, finance, marketing, and operations.",
    domains: ["business", "marketing", "finance", "economics"],
    keywords: [
      "business",
      "business management",
      "operations management",
      "marketing",
      "finance",
      "economics",
      "accounting"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- Engineering Documentation & Open Textbooks ---
  {
    id: "libretexts-engineering",
    category: "tutorial",
    primarySubject: "engineering",
    title: "Engineering LibreTexts Open Textbooks & Guides",
    provider: "LibreTexts",
    type: "Official Documentation",
    url: "https://eng.libretexts.org/",
    description: "Open-access university texts covering mechanical, electrical, civil, chemical, and systems engineering fundamentals, statics, circuits, and thermodynamics.",
    domains: ["engineering", "mechanical engineering", "electrical engineering", "civil engineering"],
    keywords: [
      "engineering",
      "mechanical engineering",
      "electrical engineering",
      "civil engineering",
      "systems engineering",
      "engineering design",
      "thermodynamics",
      "statics",
      "dynamics",
      "circuits",
      "circuit analysis",
      "control systems",
      "materials science"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "openstax-university-physics",
    category: "tutorial",
    primarySubject: "engineering",
    title: "University Physics Volume 1 \u2014 Mechanics & Thermodynamics (OpenStax)",
    provider: "OpenStax (Rice University)",
    type: "Educational Article",
    url: "https://openstax.org/details/books/university-physics-volume-1",
    description: "Calculus-based engineering physics reference covering mechanics, statics, rotational dynamics, fluid mechanics, and thermodynamics.",
    domains: ["engineering", "mechanical engineering", "civil engineering", "physics"],
    keywords: [
      "engineering",
      "mechanical engineering",
      "civil engineering",
      "statics",
      "dynamics",
      "mechanics",
      "thermodynamics",
      "physics"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "openstax-calculus",
    category: "tutorial",
    primarySubject: "engineering",
    title: "Calculus Volume 1 for Science & Engineering (OpenStax)",
    provider: "OpenStax (Rice University)",
    type: "Educational Article",
    url: "https://openstax.org/details/books/calculus-volume-1",
    description: "Free peer-reviewed calculus textbook covering limits, derivatives, differential modeling, and integration used across engineering.",
    domains: ["engineering", "mathematics", "calculus"],
    keywords: [
      "engineering",
      "calculus",
      "differential",
      "engineering design",
      "signal processing",
      "control systems"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // --- Expanded Official Documentation, Guides & Open Textbooks (HTTP 200 Verified) ---
  {
    id: "python-docs-controlflow",
    category: "tutorial",
    primarySubject: "python",
    title: "Python Official Tutorial \u2014 Control Flow & Functions",
    provider: "Python Software Foundation",
    type: "Official Documentation",
    url: "https://docs.python.org/3/tutorial/controlflow.html",
    description: "Official Python documentation covering if statements, for loops, range(), function definitions, default arguments, and lambda expressions.",
    domains: ["python", "control flow", "functions"],
    keywords: ["python", "control flow", "loops", "if", "functions", "arguments", "lambda"],
    levels: ["Beginner"],
    language: "en"
  },
  {
    id: "python-docs-datastructures",
    category: "tutorial",
    primarySubject: "python",
    title: "Python Official Tutorial \u2014 Lists, Tuples, Sets & Dictionaries",
    provider: "Python Software Foundation",
    type: "Official Documentation",
    url: "https://docs.python.org/3/tutorial/datastructures.html",
    description: "Authoritative reference on Python lists, list comprehensions, tuples, sets, dictionaries, and looping patterns.",
    domains: ["python", "data structures"],
    keywords: ["python", "list", "dictionary", "set", "tuple", "list comprehension", "data structures"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "python-docs-stdtypes",
    category: "tutorial",
    primarySubject: "python",
    title: "Python Built-in Types Reference",
    provider: "Python Software Foundation",
    type: "Official Documentation",
    url: "https://docs.python.org/3/library/stdtypes.html",
    description: "Complete documentation for numeric types, strings, booleans, sequence operations, mapping methods, and truthiness.",
    domains: ["python", "built-in types"],
    keywords: ["python", "strings", "integers", "dictionaries", "sets", "methods", "built-in"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "numpy-absolute-beginners",
    category: "tutorial",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml"],
    title: "NumPy: The Absolute Basics for Beginners",
    provider: "NumPy Official Docs",
    type: "Official Documentation",
    url: "https://numpy.org/doc/stable/user/absolute_beginners.html",
    description: "Official introduction to NumPy n-dimensional arrays, vectorization, indexing, slicing, broadcasting, and numerical operations.",
    domains: ["numpy", "python", "data analysis", "ai"],
    keywords: ["numpy", "ndarray", "vectorization", "matrix", "linear algebra", "data analysis", "python"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "pandas-10-minutes",
    category: "tutorial",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml"],
    title: "10 Minutes to Pandas \u2014 Official DataFrames User Guide",
    provider: "Pandas Official Docs",
    type: "Official Documentation",
    url: "https://pandas.pydata.org/docs/user_guide/10min.html",
    description: "Essential hands-on guide to Pandas Series, DataFrames, filtering, missing data handling, grouping, merging, and reshaping.",
    domains: ["pandas", "data analysis", "data analyst", "python"],
    keywords: ["pandas", "dataframe", "data cleaning", "groupby", "merge", "missing data", "eda", "data analysis"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "matplotlib-official-tutorials",
    category: "tutorial",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml"],
    title: "Matplotlib Official Tutorials & Visualization Guides",
    provider: "Matplotlib",
    type: "Official Documentation",
    url: "https://matplotlib.org/stable/tutorials/index.html",
    description: "Official tutorials covering pyplot basics, figure/axes anatomy, styling charts, subplots, and publication-ready plots.",
    domains: ["data visualization", "matplotlib", "data analysis"],
    keywords: ["matplotlib", "data visualization", "charts", "plotting", "eda", "python", "data analyst"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "seaborn-intro-tutorial",
    category: "tutorial",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml"],
    title: "An Introduction to Seaborn Statistical Visualization",
    provider: "Seaborn Official Docs",
    type: "Official Documentation",
    url: "https://seaborn.pydata.org/tutorial/introduction.html",
    description: "Explains relational plots, distributions, categorical summaries, and statistical estimation in Python.",
    domains: ["seaborn", "data visualization", "data analysis", "statistics"],
    keywords: ["seaborn", "visualization", "distributions", "exploratory data analysis", "eda", "data analyst"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "openstax-intro-statistics",
    category: "tutorial",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "sql", "python"],
    title: "Introductory Statistics (OpenStax Open Textbook)",
    provider: "OpenStax (Rice University)",
    type: "Educational Article",
    url: "https://openstax.org/details/books/introductory-statistics",
    description: "Free peer-reviewed university statistics textbook covering descriptive statistics, probability, sampling distributions, confidence intervals, and hypothesis testing.",
    domains: ["statistics", "data analysis", "data science", "a/b testing"],
    keywords: ["statistics", "probability", "hypothesis testing", "confidence interval", "a/b testing", "data analyst", "variance"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mode-sql-tutorial",
    category: "tutorial",
    primarySubject: "sql",
    title: "Mode Analytics SQL Tutorial (Basic, Intermediate & Advanced)",
    provider: "Mode",
    type: "Educational Article",
    url: "https://mode.com/sql-tutorial/",
    description: "Analyst-focused SQL tutorial progressing from SELECT/WHERE through GROUP BY aggregations, JOINs, CTEs, and window functions.",
    domains: ["sql", "data analysis", "data analyst"],
    keywords: ["sql", "data analyst", "group by", "joins", "window functions", "cte", "aggregation", "subquery"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "postgres-docs-select-lists",
    category: "tutorial",
    primarySubject: "sql",
    title: "PostgreSQL Official Docs \u2014 Queries & SELECT Lists",
    provider: "PostgreSQL Global Development Group",
    type: "Official Documentation",
    url: "https://www.postgresql.org/docs/current/queries-select-lists.html",
    description: "Official documentation explaining SELECT expressions, aliases, DISTINCT, filtering, and query execution behavior.",
    domains: ["sql", "postgresql", "databases"],
    keywords: ["sql", "postgresql", "select", "distinct", "aliases", "query"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "postgres-docs-aggregations",
    category: "tutorial",
    primarySubject: "sql",
    title: "PostgreSQL Tutorial \u2014 Aggregate Functions & GROUP BY",
    provider: "PostgreSQL Global Development Group",
    type: "Official Documentation",
    url: "https://www.postgresql.org/docs/current/tutorial-agg.html",
    description: "Clear walkthrough of aggregate functions (COUNT, SUM, AVG, MAX), GROUP BY clauses, HAVING filters, and analytical summaries.",
    domains: ["sql", "postgresql", "data analysis"],
    keywords: ["sql", "aggregate", "group by", "having", "count", "sum", "data analyst"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "huggingface-llm-course-ch1",
    category: "tutorial",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    title: "Hugging Face LLM Course \u2014 Transformer Models & Pipelines",
    provider: "Hugging Face",
    type: "Official Documentation",
    url: "https://huggingface.co/learn/llm-course/chapter1/1",
    description: "Free interactive open curriculum explaining how Large Language Models, tokenizers, attention, and transformer pipelines work.",
    domains: ["ai engineering", "llm", "transformers", "nlp"],
    keywords: ["llm", "transformers", "hugging face", "tokenization", "attention", "ai engineer", "nlp", "embeddings"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "huggingface-nlp-course-ch1",
    category: "tutorial",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    title: "Hugging Face NLP Course \u2014 Language Modeling Foundations",
    provider: "Hugging Face",
    type: "Official Documentation",
    url: "https://huggingface.co/learn/nlp-course/chapter1/1",
    description: "Structured guide to modern NLP architectures, encoder/decoder models, transfer learning, and fine-tuning workflows.",
    domains: ["nlp", "ai engineering", "transformers"],
    keywords: ["nlp", "transformers", "fine-tuning", "bert", "gpt", "ai engineer", "language models"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "prompt-engineering-guide",
    category: "tutorial",
    primarySubject: "ai_ml",
    title: "Prompt Engineering Guide \u2014 Techniques, CoT & RAG Patterns",
    provider: "DAIR.AI",
    type: "Educational Article",
    url: "https://www.promptingguide.ai/",
    description: "Open community guide covering zero-shot/few-shot prompting, chain-of-thought reasoning, Retrieval-Augmented Generation (RAG), tool use, and evaluation.",
    domains: ["prompt engineering", "ai engineering", "llm"],
    keywords: ["prompt engineering", "chain of thought", "rag", "few-shot", "llm", "ai engineer", "agents", "evaluation"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "google-rules-of-ml",
    category: "tutorial",
    primarySubject: "ai_ml",
    title: "Rules of Machine Learning: Best Practices for ML Engineering",
    provider: "Google Developers",
    type: "Official Documentation",
    url: "https://developers.google.com/machine-learning/guides/rules-of-ml",
    description: "Practical engineering handbook covering baseline pipelines, feature engineering, metrics alignment, leakage prevention, and model monitoring.",
    domains: ["ml engineering", "ai engineering", "machine learning"],
    keywords: ["ml engineering", "ai engineer", "feature engineering", "evaluation", "data leakage", "production ml", "monitoring"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "fastai-practical-dl",
    category: "tutorial",
    primarySubject: "ai_ml",
    compatibleSubjects: ["ai_ml", "python"],
    title: "Practical Deep Learning for Coders (fast.ai)",
    provider: "fast.ai",
    type: "Educational Article",
    url: "https://course.fast.ai/",
    description: "Open project-first guide to training neural networks, computer vision classifiers, NLP models, and deploying ML systems.",
    domains: ["deep learning", "machine learning", "ai engineering"],
    keywords: ["deep learning", "neural networks", "pytorch", "computer vision", "transfer learning", "ai engineer"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "laws-of-ux",
    category: "tutorial",
    primarySubject: "design_ux",
    title: "Laws of UX \u2014 Psychology & Interface Design Principles",
    provider: "Laws of UX",
    type: "Educational Article",
    url: "https://lawsofux.com/",
    description: "Illustrated reference of cognitive heuristics (Hick\u2019s Law, Fitts\u2019s Law, Miller\u2019s Law, Jakob\u2019s Law) with practical UI/UX takeaways.",
    domains: ["ui/ux", "ux design", "usability", "psychology"],
    keywords: ["ux design", "ui design", "usability", "heuristics", "cognitive load", "visual hierarchy", "information architecture"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "webdev-learn-design",
    category: "tutorial",
    primarySubject: "design_ux",
    compatibleSubjects: ["design_ux", "css"],
    title: "web.dev Learn Responsive & UI Design",
    provider: "web.dev (Google Chrome)",
    type: "Official Documentation",
    url: "https://web.dev/learn/design",
    description: "Structured guide covering responsive layouts, typography scale, color contrast, adaptive imagery, and component systems.",
    domains: ["ui design", "responsive design", "typography"],
    keywords: ["ui design", "responsive", "typography", "layout", "design systems", "ui/ux", "components"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "webdev-learn-accessibility",
    category: "tutorial",
    primarySubject: "design_ux",
    compatibleSubjects: ["design_ux", "html", "css"],
    title: "web.dev Learn Accessibility (WCAG, Contrast & Screen Readers)",
    provider: "web.dev (Google Chrome)",
    type: "Official Documentation",
    url: "https://web.dev/learn/accessibility",
    description: "Practical accessibility course covering color contrast, keyboard navigation, focus states, semantic landmarks, and inclusive UI.",
    domains: ["accessibility", "wcag", "ui/ux"],
    keywords: ["accessibility", "wcag", "a11y", "contrast", "keyboard navigation", "inclusive design", "ui/ux"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "figma-design-basics",
    category: "tutorial",
    primarySubject: "design_ux",
    title: "Figma Design Basics & UI Workflow Library",
    provider: "Figma Resource Library",
    type: "Official Documentation",
    url: "https://www.figma.com/resource-library/design-basics/",
    description: "Official Figma guides covering wireframing, visual hierarchy, color theory, typography, prototyping, and usability handoff.",
    domains: ["figma", "ui/ux", "graphic design"],
    keywords: ["figma", "wireframing", "prototyping", "typography", "color theory", "visual hierarchy", "ui/ux", "ui design"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "ixdf-ui-design-guide",
    category: "tutorial",
    primarySubject: "design_ux",
    title: "Interaction Design Foundation \u2014 User Interface (UI) Design Overview",
    provider: "Interaction Design Foundation",
    type: "Educational Article",
    url: "https://www.interaction-design.org/literature/topics/ui-design",
    description: "Foundational literature explaining interface patterns, affordances, consistency, visual design systems, and user-centered interaction.",
    domains: ["ui/ux", "ui design", "interaction design"],
    keywords: ["ui design", "ux design", "interaction design", "affordances", "wireframe", "prototype", "usability testing"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "react-docs-describing-ui",
    category: "tutorial",
    primarySubject: "react",
    title: "React Official Docs \u2014 Describing the UI (Components & Props)",
    provider: "React Team",
    type: "Official Documentation",
    url: "https://react.dev/learn/describing-the-ui",
    description: "Official interactive guide to React components, JSX syntax, props passing, conditional rendering, and pure rendering.",
    domains: ["react", "frontend", "components"],
    keywords: ["react", "components", "jsx", "props", "conditional rendering", "lists"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "react-docs-adding-interactivity",
    category: "tutorial",
    primarySubject: "react",
    title: "React Official Docs \u2014 Adding Interactivity & State",
    provider: "React Team",
    type: "Official Documentation",
    url: "https://react.dev/learn/adding-interactivity",
    description: "Explains event handling, useState snapshots, queueing updates, and updating objects/arrays cleanly in React.",
    domains: ["react", "state management"],
    keywords: ["react", "usestate", "state", "events", "interactivity", "immutability"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "ts-docs-everyday-types",
    category: "tutorial",
    primarySubject: "typescript",
    title: "TypeScript Handbook \u2014 Everyday Types & Interfaces",
    provider: "TypeScript Official Docs",
    type: "Official Documentation",
    url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
    description: "Official guide covering primitives, arrays, unions, type aliases, interfaces, and type assertions.",
    domains: ["typescript", "frontend", "backend"],
    keywords: ["typescript", "types", "interfaces", "unions", "type alias", "static typing"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "ts-docs-generics",
    category: "tutorial",
    primarySubject: "typescript",
    title: "TypeScript Handbook \u2014 Reusable Generics",
    provider: "TypeScript Official Docs",
    type: "Official Documentation",
    url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
    description: "Deep guide to generic functions, generic constraints, keyof types, and reusable type-safe abstractions.",
    domains: ["typescript", "generics"],
    keywords: ["typescript", "generics", "constraints", "keyof", "type narrowing"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "pro-git-book",
    category: "tutorial",
    primarySubject: "git_devops",
    title: "Pro Git Book (Complete Free Official Edition)",
    provider: "Git SCM",
    type: "Official Documentation",
    url: "https://git-scm.com/book/en/v2",
    description: "The official open-access book covering Git internals, staging, branching, rebasing, remotes, and team workflows.",
    domains: ["git", "version control", "devops"],
    keywords: ["git", "branching", "rebase", "merge", "commit", "version control", "github"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "portswigger-web-security",
    category: "tutorial",
    primarySubject: "cybersecurity",
    title: "PortSwigger Web Security Academy \u2014 Vulnerability Guides & Labs",
    provider: "PortSwigger",
    type: "Official Documentation",
    url: "https://portswigger.net/web-security",
    description: "Free industry-standard web security tutorials and labs covering SQL injection, XSS, CSRF, authentication flaws, and access control.",
    domains: ["cybersecurity", "web security", "appsec"],
    keywords: ["cybersecurity", "sql injection", "xss", "csrf", "authentication", "authorization", "vulnerability"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "atlassian-agile-coach",
    category: "tutorial",
    primarySubject: "business_management",
    title: "Atlassian Agile Coach \u2014 Scrum, Kanban & Product Roadmaps",
    provider: "Atlassian",
    type: "Educational Article",
    url: "https://www.atlassian.com/agile",
    description: "Practical guides on Agile ceremonies, Scrum sprints, Kanban flow, user stories, backlog prioritization, and stakeholder alignment.",
    domains: ["agile", "scrum", "product management", "project management"],
    keywords: ["agile", "scrum", "kanban", "sprint", "backlog", "product management", "project management"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  // ==========================================
  // 3. INTERACTIVE EXERCISES & FREE COURSES
  // ==========================================
  {
    id: "fcc-responsive-web",
    category: "practice",
    primarySubject: "css",
    compatibleSubjects: ["css", "html"],
    title: "Responsive Web Design (HTML & CSS) Interactive Projects",
    provider: "freeCodeCamp",
    type: "Interactive Exercise",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.freecodecamp.org/learn/2022/responsive-web-design",
    description: "Hands-on HTML5 and CSS coding challenges covering Flexbox, CSS Grid, media queries, accessibility, and responsive layouts.",
    domains: ["css", "flexbox", "grid", "responsive design", "html"],
    keywords: [
      "css",
      "flexbox",
      "grid",
      "css grid",
      "responsive",
      "responsive design",
      "media queries",
      "html",
      "layout",
      "modern css"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "fcc-js-algorithms",
    category: "practice",
    primarySubject: "javascript",
    title: "JavaScript Algorithms and Data Structures Certification",
    provider: "freeCodeCamp",
    type: "Interactive Exercise",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8",
    description: "Interactive browser-based coding exercises covering variables, scope, closures, arrays, array methods, objects, and data structures.",
    domains: ["javascript", "scope", "data structures"],
    keywords: [
      "javascript",
      "js",
      "modern javascript",
      "syntax",
      "scope",
      "closure",
      "closures",
      "data structure",
      "data structures",
      "algorithm",
      "array",
      "array methods",
      "object",
      "es6"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "sqlbolt-interactive",
    category: "practice",
    primarySubject: "sql",
    title: "SQLBolt \u2014 Interactive SQL Lessons & Query Exercises",
    provider: "SQLBolt",
    type: "Interactive Exercise",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://sqlbolt.com/",
    description: "Practice SQL SELECT, WHERE, INNER/OUTER JOINs, aggregations, and relational schemas directly in interactive browser tables.",
    domains: ["sql", "sql joins", "relational"],
    keywords: [
      "sql",
      "query",
      "join",
      "joins",
      "sql joins",
      "select",
      "database",
      "postgresql",
      "sqlite",
      "relational",
      "schema",
      "schemas",
      "aggregate"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "kaggle-learn",
    category: "practice",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml", "sql"],
    title: "Kaggle Learn Interactive Notebooks (Python, Pandas & ML)",
    provider: "Kaggle",
    type: "Interactive Exercise",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.kaggle.com/learn",
    description: "Hands-on interactive coding notebooks and programming exercises covering Python fundamentals, functions, data structures, Pandas, SQL, and ML.",
    domains: ["python", "data science", "ai"],
    keywords: [
      "python",
      "python fundamentals",
      "syntax",
      "functions",
      "data structures",
      "pandas",
      "numpy",
      "data analysis",
      "data science",
      "machine learning",
      "kaggle"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "freecodecamp-curriculum",
    category: "practice",
    primarySubject: "python",
    compatibleSubjects: ["python", "nodejs_backend", "sql", "javascript"],
    isGenericOverview: true,
    title: "freeCodeCamp Full Coding & Backend Certification Tracks",
    provider: "freeCodeCamp",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.freecodecamp.org/learn",
    description: "Interactive coding challenges and certification projects across Python, Relational Databases, Backend APIs, and JavaScript.",
    domains: ["python", "backend", "sql", "javascript"],
    keywords: ["coding", "programming", "api", "backend", "node", "express", "python", "testing", "sql"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "cs50-harvard-x",
    category: "practice",
    primarySubject: "python",
    compatibleSubjects: ["python", "sql", "javascript", "css", "html"],
    isGenericOverview: true,
    title: "CS50's Introduction to Computer Science",
    provider: "Harvard University (CS50)",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://cs50.harvard.edu/x/",
    description: "Harvard University foundational computer science course covering algorithms, data structures, memory, Python, SQL, and web programming.",
    domains: ["computer science", "programming", "algorithms", "python", "sql"],
    keywords: ["computer science", "programming", "algorithms", "data structures", "python", "sql", "web", "cs50"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "webdev-learn-courses",
    category: "practice",
    primarySubject: "css",
    compatibleSubjects: ["css", "html", "javascript"],
    title: "web.dev Modern Web Development Learning Paths",
    provider: "Google web.dev",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://web.dev/learn",
    description: "Structured self-paced Google courses spanning modern HTML, CSS layout, responsive design, accessibility, and web performance.",
    domains: ["web development", "frontend", "css", "html"],
    keywords: ["web development", "frontend", "html", "css", "responsive", "accessibility", "performance"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "exercism-tracks",
    category: "practice",
    primarySubject: "python",
    compatibleSubjects: ["python", "javascript", "typescript"],
    isGenericOverview: true,
    title: "Exercism Mentored Coding Tracks",
    provider: "Exercism",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://exercism.org/",
    description: "Free structured coding tracks across Python, JavaScript, TypeScript, and 70+ languages with test-driven exercises and mentor feedback.",
    domains: ["programming", "python", "javascript", "typescript"],
    keywords: ["programming", "coding", "python", "javascript", "typescript", "algorithms", "practice"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "odin-project-paths",
    category: "practice",
    primarySubject: "react",
    compatibleSubjects: ["react", "nodejs_backend", "javascript", "css", "html"],
    isGenericOverview: true,
    title: "The Odin Project \u2014 Full-Stack JavaScript & Node.js Path",
    provider: "The Odin Project",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.theodinproject.com/paths",
    description: "Free project-based open-source curriculum with guided coding assignments spanning HTML, CSS, JavaScript, React, and Node.js.",
    domains: ["react", "nodejs", "javascript", "css"],
    keywords: ["full stack", "react", "node", "nodejs", "express", "javascript", "typescript", "project", "git"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "google-ml-crash-course",
    category: "practice",
    primarySubject: "ai_ml",
    title: "Google Machine Learning Crash Course",
    provider: "Google for Developers",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://developers.google.com/machine-learning/crash-course",
    description: "Interactive exercises and visualizations introducing ML fundamentals, gradient descent, classification, and neural nets.",
    domains: ["machine learning", "ai"],
    keywords: ["machine learning", "ml", "ai", "regression", "classification", "neural network", "gradient", "feature", "data science"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "coursera-google-ux-design",
    category: "practice",
    primarySubject: "design_ux",
    title: "Google UX Design Professional Certificate",
    provider: "Google / Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/professional-certificates/google-ux-design",
    description: "Structured product design curriculum covering user research, wireframing, low-fidelity and high-fidelity prototypes in Figma, and usability testing.",
    domains: ["ui/ux", "product design", "figma", "usability"],
    keywords: ["ui", "ux", "ui/ux", "designer", "figma", "wireframe", "prototype", "usability", "user research", "design system"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "coursera-google-data-analytics",
    category: "practice",
    primarySubject: "sql",
    compatibleSubjects: ["sql", "ai_ml", "finance_economics"],
    title: "Google Data Analytics Professional Certificate",
    provider: "Google / Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/professional-certificates/google-data-analytics",
    description: "Industry-aligned data analytics pathway covering spreadsheets, SQL querying, data cleaning, R/Python exploration, and executive dashboards.",
    domains: ["data analytics", "data analysis", "sql", "spreadsheets"],
    keywords: ["data analyst", "data analysis", "data analytics", "sql", "excel", "spreadsheets", "visualization", "dashboard", "statistics"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "nngroup-ux-articles",
    category: "tutorial",
    primarySubject: "design_ux",
    title: "Nielsen Norman Group \u2014 UX Research & Usability Articles",
    provider: "Nielsen Norman Group",
    type: "Educational Article",
    url: "https://www.nngroup.com/articles/",
    description: "Evidence-based articles on usability heuristics, information architecture, interaction design, UX research methods, and interface clarity.",
    domains: ["ui/ux", "usability", "ux research"],
    keywords: ["ui", "ux", "ui/ux", "usability", "heuristics", "user research", "wireframe", "information architecture", "interaction design"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "microsoft-learn-training",
    category: "practice",
    primarySubject: "git_devops",
    compatibleSubjects: ["git_devops", "typescript", "ai_ml", "cybersecurity"],
    title: "Microsoft Learn Interactive Role-Based Modules",
    provider: "Microsoft Learn",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://learn.microsoft.com/en-us/training/",
    description: "Free hands-on sandboxes and modular learning paths covering TypeScript, Cloud, Docker, DevOps, AI, and security.",
    domains: ["cloud", "devops", "docker", "typescript", "security"],
    keywords: ["cloud", "azure", "devops", "docker", "ci/cd", "architecture", "security", "typescript", "ai"],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "khan-academy-cs",
    category: "practice",
    primarySubject: "javascript",
    compatibleSubjects: ["javascript", "html", "css", "sql"],
    isGenericOverview: true,
    title: "Khan Academy Interactive Computer Programming",
    provider: "Khan Academy",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.khanacademy.org/computing/computer-programming",
    description: "Interactive step-by-step challenges for JavaScript, HTML/CSS, and SQL fundamentals.",
    domains: ["javascript", "html", "css", "sql"],
    keywords: ["programming", "javascript", "html", "css", "sql", "algorithm", "beginner"],
    levels: ["Beginner"],
    language: "en"
  },
  {
    id: "khan-academy-finance",
    category: "practice",
    primarySubject: "finance_economics",
    title: "Economics, Accounting & Finance Interactive Practice",
    provider: "Khan Academy",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.khanacademy.org/economics-finance-domain",
    description: "Free structured lessons and practice problems on financial statements, accounting, valuation, and microeconomics.",
    domains: ["finance", "economics", "accounting"],
    keywords: ["finance", "accounting", "income statement", "balance sheet", "cash flow", "npv", "valuation", "economics", "budget"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "hubspot-academy",
    category: "practice",
    primarySubject: "business_management",
    title: "HubSpot Academy Free Marketing Certifications",
    provider: "HubSpot Academy",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://academy.hubspot.com/",
    description: "Free certification courses and practical exercises covering digital marketing, SEO, content strategy, and analytics.",
    domains: ["marketing", "business"],
    keywords: ["marketing", "seo", "content", "digital marketing", "funnel", "analytics", "campaign", "growth", "business"],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mit-ocw",
    category: "practice",
    primarySubject: "python",
    compatibleSubjects: ["python", "ai_ml", "finance_economics"],
    isGenericOverview: true,
    title: "MIT OpenCourseWare Assignments & Lecture Materials",
    provider: "MIT OpenCourseWare",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://ocw.mit.edu/",
    description: "Open university problem sets, lecture notes, and exams across algorithms, systems, math, and computer science.",
    domains: ["computer science", "algorithms", "systems"],
    keywords: ["algorithm", "algorithms", "data structure", "linear algebra", "calculus", "statistics", "probability", "computer science", "systems"],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  // --- Academic Writing, Research Methodology, Public Speaking & GIS External Courses ---
  {
    id: "coursera-writing-sciences",
    category: "practice",
    primarySubject: "academic_research",
    title: "Writing in the Sciences (Stanford University)",
    provider: "Stanford University / Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/learn/sciwrite",
    description: "University course teaching scientists and graduate researchers how to write clear, concise, impactful research papers and academic manuscripts.",
    domains: ["academic writing", "research writing", "scientific writing"],
    keywords: [
      "academic writing",
      "research writing",
      "scientific writing",
      "manuscript",
      "research paper",
      "peer review",
      "english proficiency",
      "graduate"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "coursera-academic-writing-research",
    category: "practice",
    primarySubject: "academic_research",
    title: "Academic Writing and Research Skills Specialization",
    provider: "Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/specializations/academic-writing-research-methods",
    description: "Structured academic program covering scholarly reading, research methodology, literature synthesis, academic writing conventions, and citation.",
    domains: ["academic writing", "research methodology", "research writing"],
    keywords: [
      "academic writing",
      "research methodology",
      "research writing",
      "literature review",
      "citation",
      "academic skills",
      "english proficiency"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "coursera-research-methods",
    category: "practice",
    primarySubject: "academic_research",
    title: "Understanding Research Methods",
    provider: "University of London / Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/learn/research-methods",
    description: "Demystifies qualitative and quantitative research methodology, formulating research questions, literature reviews, and postgraduate study design.",
    domains: ["research methodology", "research design", "academic research"],
    keywords: [
      "research methodology",
      "research methods",
      "research design",
      "qualitative",
      "quantitative",
      "literature review",
      "thesis",
      "postgraduate"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "coursera-public-speaking",
    category: "practice",
    primarySubject: "public_speaking",
    title: "Introduction to Public Speaking (University of Washington)",
    provider: "University of Washington / Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/learn/public-speaking",
    description: "Practical university speaking course covering speech organization, persuasive delivery, academic presentation framing, and audience engagement.",
    domains: ["public speaking", "presentation skills", "academic presentation"],
    keywords: [
      "public speaking",
      "presentation skills",
      "academic presentation",
      "speech",
      "oral presentation",
      "delivery",
      "english proficiency"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "spatialthoughts-qgis-course",
    category: "practice",
    primarySubject: "geography_gis",
    title: "Introduction to QGIS \u2014 Free Open GIS Course",
    provider: "Spatial Thoughts",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://spatialthoughts.com/courses/introduction-to-qgis/",
    description: "Self-paced, ad-free open course with hands-on exercises on GIS data creation, spatial joins, geoprocessing, and research map production in QGIS.",
    domains: ["gis", "qgis", "geography research", "geographic information systems"],
    keywords: [
      "gis",
      "qgis",
      "geographic information systems",
      "geography",
      "geography research",
      "spatial analysis",
      "mapping",
      "cartography"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "coursera-ucdavis-gis",
    category: "practice",
    primarySubject: "geography_gis",
    title: "Geographic Information Systems (GIS) Specialization",
    provider: "UC Davis / Coursera",
    type: "Free Online Course",
    pricing: "Free Audit / Paid Certificate",
    isCourseProgram: true,
    url: "https://www.coursera.org/specializations/gis",
    description: "University-level GIS specialization covering cartography, spatial data formats, geospatial analysis, remote sensing, and applied geography research.",
    domains: ["gis", "geographic information systems", "geography", "geography research"],
    keywords: [
      "gis",
      "geographic information systems",
      "geography",
      "geography research",
      "spatial analysis",
      "geospatial",
      "cartography",
      "remote sensing"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  // --- Engineering & Economics/Finance Free Online Courses ---
  {
    id: "khan-academy-electrical-engineering",
    category: "practice",
    primarySubject: "engineering",
    title: "Electrical Engineering Interactive Course (Khan Academy)",
    provider: "Khan Academy",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.khanacademy.org/science/electrical-engineering",
    description: "Free structured electrical engineering curriculum covering circuit analysis, resistors, op-amps, semiconductors, and signal systems.",
    domains: ["electrical engineering", "circuits", "engineering"],
    keywords: [
      "electrical engineering",
      "circuit analysis",
      "circuits",
      "ohm",
      "signal processing",
      "engineering",
      "systems engineering"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  },
  {
    id: "mit-ocw-mechanical-engineering",
    category: "practice",
    primarySubject: "engineering",
    title: "MIT OpenCourseWare \u2014 Mechanical Engineering Courses",
    provider: "MIT OpenCourseWare",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://ocw.mit.edu/search/?d=Mechanical+Engineering",
    description: "Free MIT lecture notes, problem sets, and exams across engineering design, mechanics, dynamics, thermodynamics, and manufacturing.",
    domains: ["mechanical engineering", "engineering", "systems engineering"],
    keywords: [
      "mechanical engineering",
      "engineering design",
      "systems engineering",
      "systems thinking",
      "thermodynamics",
      "statics",
      "dynamics",
      "cad",
      "finite element",
      "engineering"
    ],
    levels: ["Beginner", "Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "mit-ocw-eecs",
    category: "practice",
    primarySubject: "engineering",
    compatibleSubjects: ["engineering", "python"],
    title: "MIT OpenCourseWare \u2014 Electrical Engineering & Computer Systems",
    provider: "MIT OpenCourseWare",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://ocw.mit.edu/search/?d=Electrical+Engineering+and+Computer+Science",
    description: "Open university courses spanning circuits, electronics, signals and systems, control theory, and embedded hardware.",
    domains: ["electrical engineering", "control systems", "engineering"],
    keywords: [
      "electrical engineering",
      "circuit analysis",
      "circuits",
      "control systems",
      "signal processing",
      "systems engineering",
      "engineering"
    ],
    levels: ["Intermediate", "Advanced"],
    language: "en"
  },
  {
    id: "khan-academy-microeconomics",
    category: "practice",
    primarySubject: "finance_economics",
    compatibleSubjects: ["finance_economics", "business_management"],
    title: "Microeconomics & Market Strategy Course (Khan Academy)",
    provider: "Khan Academy",
    type: "Free Online Course",
    pricing: "Free",
    isCourseProgram: true,
    url: "https://www.khanacademy.org/economics-finance-domain/microeconomics",
    description: "Interactive exercises and videos covering supply and demand, pricing, market structure, production costs, and business decision economics.",
    domains: ["economics", "business", "finance"],
    keywords: [
      "economics",
      "microeconomics",
      "supply",
      "demand",
      "pricing",
      "business",
      "finance",
      "strategy"
    ],
    levels: ["Beginner", "Intermediate"],
    language: "en"
  }
];
function getExploreResourceCatalog() {
  return VERIFIED_RESOURCE_CATALOG.map((entry) => {
    const tabCategory = entry.category === "video" ? "video" : entry.category === "tutorial" ? "documentation" : "course";
    const pricing = entry.pricing ?? (entry.category === "practice" ? "Free" : void 0);
    const type = tabCategory === "course" && entry.type === "Interactive Exercise" ? "Free Online Course" : entry.type;
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
      levels: entry.levels ?? ["Beginner", "Intermediate"],
      pricing,
      videoId: entry.videoId,
      embedUrl: entry.embedUrl,
      thumbnailUrl: entry.thumbnailUrl,
      embedAllowed: entry.embedAllowed
    };
  });
}
function tokenize(input) {
  return input.toLowerCase().split(/[^a-z0-9+#./-]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function containsWholeTerm(text, tokens, term) {
  const lower = term.toLowerCase().trim();
  if (!lower) return false;
  if (lower.includes(" ")) {
    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(lower)}([^a-z0-9]|$)`, "i");
    return regex.test(text);
  }
  if (tokens.has(lower)) return true;
  return false;
}
function scoreKeywordsInText(keywords, text, tokens, phraseWeight, exactTokenWeight, substringWeight) {
  if (!text) return 0;
  let score = 0;
  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();
    if (lowerKw.includes(" ")) {
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
var SUBJECT_DETECTION_TERMS = {
  css: [
    "css",
    "flexbox",
    "flex",
    "css grid",
    "grid layout",
    "responsive design",
    "responsive web",
    "media query",
    "media queries",
    "mobile-first",
    "box model",
    "stylesheet",
    "tailwind",
    "scss",
    "sass"
  ],
  html: ["html", "html5", "semantic markup", "semantic html", "semantic tags"],
  javascript: [
    "javascript",
    "js",
    "es6",
    "closure",
    "closures",
    "lexical scope",
    "block scope",
    "function scope",
    "hoisting",
    "array method",
    "array methods",
    "async/await",
    "promise",
    "promises",
    "event loop",
    "dom manipulation"
  ],
  typescript: ["typescript", "tsconfig", "static typing", "type narrowing"],
  react: ["react", "jsx", "usestate", "useeffect", "usecontext", "usereducer", "virtual dom"],
  nodejs_backend: [
    "node",
    "nodejs",
    "node.js",
    "express",
    "expressjs",
    "middleware",
    "http server",
    "software architecture",
    "system design"
  ],
  sql: [
    "sql",
    "postgresql",
    "postgres",
    "sqlite",
    "mysql",
    "sql join",
    "sql joins",
    "inner join",
    "left join",
    "right join",
    "outer join",
    "relational schema",
    "relational schemas",
    "relational database",
    "foreign key",
    "primary key",
    "window function",
    "window functions",
    "cte",
    "group by",
    "subquery",
    "data analyst",
    "data analytics",
    "data querying",
    "business intelligence"
  ],
  python: [
    "python",
    "fastapi",
    "django",
    "pandas",
    "numpy",
    "matplotlib",
    "seaborn",
    "pytest",
    "venv",
    "list comprehension",
    "dataframe",
    "data cleaning",
    "exploratory data analysis"
  ],
  ai_ml: [
    "machine learning",
    "deep learning",
    "ai engineer",
    "artificial intelligence",
    "generative ai",
    "pytorch",
    "scikit",
    "sklearn",
    "neural network",
    "transformer",
    "transformers",
    "llm",
    "large language model",
    "prompt engineering",
    "rag",
    "retrieval augmented",
    "embeddings",
    "fine-tuning",
    "data science",
    "data analysis",
    "data analytics",
    "data analyst",
    "data visualization",
    "statistics",
    "hypothesis testing",
    "a/b testing",
    "exploratory data analysis",
    "eda"
  ],
  git_devops: [
    "git",
    "github",
    "docker",
    "dockerfile",
    "kubernetes",
    "ci/cd",
    "version control",
    "software architecture",
    "system design"
  ],
  design_ux: [
    "ui/ux",
    "ui design",
    "ux design",
    "user experience",
    "user interface",
    "user research",
    "usability",
    "usability testing",
    "figma",
    "wireframe",
    "wireframing",
    "prototype",
    "prototyping",
    "visual hierarchy",
    "typography",
    "color theory",
    "graphic design",
    "design thinking",
    "information architecture",
    "auto layout",
    "wcag",
    "a11y",
    "aria",
    "design system",
    "mockup"
  ],
  cybersecurity: ["cybersecurity", "owasp", "nist", "sql injection", "xss", "csrf", "vulnerability"],
  business_management: [
    "business",
    "business management",
    "project management",
    "product management",
    "operations management",
    "strategic management",
    "organizational",
    "stakeholder",
    "supply chain",
    "marketing",
    "seo",
    "okr",
    "swot",
    "leadership",
    "entrepreneurship",
    "digital marketing",
    "agile management"
  ],
  academic_research: [
    "academic writing",
    "research writing",
    "research methodology",
    "research methods",
    "research design",
    "literature review",
    "scholarly writing",
    "thesis",
    "dissertation",
    "citation",
    "english proficiency",
    "academic skills",
    "essay writing"
  ],
  public_speaking: [
    "public speaking",
    "presentation skills",
    "academic presentation",
    "oral presentation",
    "speech",
    "presentation",
    "visual communication",
    "rhetoric"
  ],
  geography_gis: [
    "geography",
    "geographic",
    "geography research",
    "geographic information systems",
    "environmental research",
    "environmental science",
    "gis",
    "qgis",
    "arcgis",
    "cartography",
    "spatial analysis",
    "geospatial",
    "remote sensing"
  ],
  finance_economics: ["finance", "accounting", "valuation", "cash flow", "balance sheet", "economics"],
  engineering: [
    "engineering",
    "mechanical engineering",
    "electrical engineering",
    "civil engineering",
    "systems engineering",
    "systems design",
    "chemical engineering",
    "industrial engineering",
    "aerospace engineering",
    "engineering design",
    "electronics",
    "thermodynamics",
    "circuits",
    "circuit analysis",
    "ohm",
    "statics",
    "dynamics",
    "control systems",
    "cad",
    "finite element",
    "signal processing",
    "structural analysis",
    "materials science"
  ]
};
function detectLessonSubjects(lessonTitle, lessonDescription = "", learningObjectives = []) {
  const titleLower = lessonTitle.toLowerCase();
  const titleTokens = new Set(tokenize(titleLower));
  const detailLower = [lessonDescription, ...learningObjectives].join(" ").toLowerCase();
  const detailTokens = new Set(tokenize(detailLower));
  const combinedLower = `${titleLower} ${detailLower}`.trim();
  const combinedTokens = /* @__PURE__ */ new Set([...titleTokens, ...detailTokens]);
  const titleMatched = /* @__PURE__ */ new Set();
  const detailMatched = /* @__PURE__ */ new Set();
  Object.keys(SUBJECT_DETECTION_TERMS).forEach((family) => {
    const terms = SUBJECT_DETECTION_TERMS[family];
    for (const term of terms) {
      if (containsWholeTerm(titleLower, titleTokens, term)) {
        titleMatched.add(family);
      } else if (containsWholeTerm(combinedLower, combinedTokens, term)) {
        detailMatched.add(family);
      }
    }
    if (family === "css" && (titleTokens.has("grid") || titleTokens.has("responsive")) && (combinedTokens.has("css") || combinedTokens.has("flexbox") || combinedTokens.has("layout") || combinedTokens.has("styling") || combinedTokens.has("breakpoints"))) {
      titleMatched.add("css");
    }
    if (family === "sql" && (combinedTokens.has("joins") || combinedTokens.has("join")) && (combinedTokens.has("relational") || combinedTokens.has("schema") || combinedTokens.has("schemas") || combinedTokens.has("database") || combinedTokens.has("tables"))) {
      titleMatched.add("sql");
    }
  });
  const hasNonPhysicalEngineeringModifier = [
    "prompt engineering",
    "software engineering",
    "feature engineering",
    "data engineering",
    "ml engineering",
    "ai engineering",
    "frontend engineering",
    "backend engineering",
    "social engineering",
    "reverse engineering"
  ].some((term) => containsWholeTerm(combinedLower, combinedTokens, term));
  const hasExplicitPhysicalEngineeringSignal = [
    "mechanical engineering",
    "electrical engineering",
    "civil engineering",
    "chemical engineering",
    "industrial engineering",
    "aerospace engineering",
    "systems engineering",
    "engineering design",
    "thermodynamics",
    "circuit analysis",
    "circuits",
    "statics",
    "dynamics",
    "finite element",
    "structural analysis",
    "materials science"
  ].some((term) => containsWholeTerm(combinedLower, combinedTokens, term));
  if (hasNonPhysicalEngineeringModifier && !hasExplicitPhysicalEngineeringSignal) {
    titleMatched.delete("engineering");
    detailMatched.delete("engineering");
  }
  const hasExplicitUiUxSignal = ["ui/ux", "figma", "wireframe", "mockup", "wcag", "a11y", "aria"].some(
    (term) => containsWholeTerm(combinedLower, combinedTokens, term)
  );
  if ((titleMatched.has("engineering") || detailMatched.has("engineering")) && !hasExplicitUiUxSignal) {
    titleMatched.delete("design_ux");
    detailMatched.delete("design_ux");
  }
  if (titleMatched.size > 0) {
    const result = new Set(titleMatched);
    if (titleMatched.has("css") && detailMatched.has("html") && detailLower.includes("html")) {
      result.add("html");
    }
    if (titleMatched.has("python") && detailMatched.has("ai_ml")) {
      result.add("ai_ml");
    }
    return result;
  }
  return detailMatched;
}
function entryMatchesSubjectSet(entry, detectedSubjects) {
  if (detectedSubjects.size === 0) return false;
  if (detectedSubjects.has(entry.primarySubject)) return true;
  if (entry.compatibleSubjects?.some((s) => detectedSubjects.has(s))) return true;
  return false;
}
function isYouTubeCandidateSubjectCompatible(videoTitle, videoDescription, detectedSubjects) {
  if (detectedSubjects.size === 0) return true;
  const videoText = `${videoTitle} ${videoDescription}`.toLowerCase();
  const videoTokens = new Set(tokenize(videoText));
  const conflictingSubjectTerms = [
    { family: "javascript", markers: ["javascript", "ecmascript", "vanilla js", "js crash course"] },
    { family: "python", markers: ["python", "django", "flask", "fastapi"] },
    { family: "sql", markers: ["sql", "mysql", "postgresql", "sqlite"] },
    { family: "react", markers: ["react", "react.js", "reactjs", "next.js", "nextjs"] },
    { family: "nodejs_backend", markers: ["node.js", "nodejs", "express.js", "expressjs"] },
    { family: "typescript", markers: ["typescript"] }
  ];
  const titleLower = videoTitle.toLowerCase();
  const titleTokens = new Set(tokenize(titleLower));
  for (const conflict of conflictingSubjectTerms) {
    if (detectedSubjects.has(conflict.family)) continue;
    const conflictInVideoTitle = conflict.markers.some(
      (m) => containsWholeTerm(titleLower, titleTokens, m)
    );
    if (conflictInVideoTitle) {
      const hasDetectedInTitle = Array.from(detectedSubjects).some(
        (subj) => SUBJECT_DETECTION_TERMS[subj].some(
          (term) => containsWholeTerm(titleLower, titleTokens, term)
        )
      );
      if (!hasDetectedInTitle) {
        return false;
      }
      if (detectedSubjects.has("css") && !detectedSubjects.has("javascript") && conflict.family === "javascript") {
        return false;
      }
    }
  }
  return Array.from(detectedSubjects).some(
    (subj) => SUBJECT_DETECTION_TERMS[subj].some(
      (term) => containsWholeTerm(videoText, videoTokens, term)
    )
  );
}
function inferLearningPurpose(title, description, index, isGenericOverview) {
  const text = `${title} ${description}`.toLowerCase();
  if (index === 0 && (text.includes("intro") || text.includes("beginner") || text.includes("basics") || text.includes("101") || text.includes("fundamental"))) {
    return "Beginner Introduction";
  }
  if (text.includes("project") || text.includes("build") || text.includes("hands-on") || text.includes("workshop") || text.includes("practical")) {
    return "Practical Demonstration";
  }
  if (isGenericOverview || text.includes("full course") || text.includes("complete")) {
    return "Detailed Tutorial";
  }
  if (text.includes("deep") || text.includes("advanced") || text.includes("state of") || text.includes("architecture")) {
    return "Deeper View";
  }
  const cycle = [
    "Concept Explanation",
    "Detailed Tutorial",
    "Practical Demonstration",
    "Beginner Introduction",
    "Deeper View"
  ];
  return cycle[index % cycle.length];
}
function toTrustedResourceItem(entry, matchScope, purposeIndex = 0) {
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    provider: entry.provider,
    type: entry.type,
    url: entry.url,
    description: entry.description,
    matchScope,
    ...entry.category === "video" ? {
      learningPurpose: inferLearningPurpose(
        entry.title,
        entry.description,
        purposeIndex,
        entry.isGenericOverview
      )
    } : {},
    ...entry.videoId ? { videoId: entry.videoId } : {},
    ...entry.embedUrl ? { embedUrl: entry.embedUrl } : {},
    ...entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {},
    ...entry.embedAllowed !== void 0 ? { embedAllowed: entry.embedAllowed } : {}
  };
}
var GENERIC_SUBJECT_ROOT_TOKENS = /* @__PURE__ */ new Set([
  "css",
  "html",
  "html5",
  "javascript",
  "js",
  "typescript",
  "ts",
  "react",
  "node",
  "nodejs",
  "node.js",
  "sql",
  "python",
  "git",
  "docker",
  "security",
  "cybersecurity",
  "business",
  "marketing",
  "finance",
  "economics",
  "ui",
  "ux",
  "ai",
  "ml",
  "programming",
  "coding",
  "web"
]);
var OVERVIEW_LESSON_INTENT_TOKENS = /* @__PURE__ */ new Set([
  "fundamentals",
  "fundamental",
  "basics",
  "basic",
  "introduction",
  "intro",
  "overview",
  "getting",
  "started",
  "foundations",
  "foundation",
  "primer",
  "essentials"
]);
function countSpecificKeywordMatches(keywords, text, tokens) {
  if (!text) return 0;
  let specificMatches = 0;
  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase().trim();
    if (!lowerKw) continue;
    if (lowerKw.includes(" ")) {
      if (containsWholeTerm(text, tokens, lowerKw)) {
        specificMatches += 1;
      }
    } else if (!GENERIC_SUBJECT_ROOT_TOKENS.has(lowerKw) && tokens.has(lowerKw)) {
      specificMatches += 1;
    }
  }
  return specificMatches;
}
async function matchTrustedResourcesForLesson(params) {
  const lessonTitleLower = params.lessonTitle.toLowerCase();
  const lessonTitleTokens = new Set(tokenize(lessonTitleLower));
  const lessonDescLower = (params.lessonDescription ?? "").toLowerCase();
  const lessonDescTokens = new Set(tokenize(lessonDescLower));
  const objectivesText = (params.learningObjectives ?? []).join(" ").toLowerCase();
  const objectivesTokens = new Set(tokenize(objectivesText));
  const lessonDetailText = `${lessonDescLower} ${objectivesText}`.trim();
  const lessonDetailTokens = /* @__PURE__ */ new Set([...lessonDescTokens, ...objectivesTokens]);
  const gapsText = (params.knowledgeGaps ?? []).join(" ").toLowerCase();
  const gapsTokens = new Set(tokenize(gapsText));
  const stageTextLower = (params.stageTitle ?? "").toLowerCase();
  const stageTokens = new Set(tokenize(stageTextLower));
  let detectedSubjects = detectLessonSubjects(
    params.lessonTitle,
    params.lessonDescription ?? "",
    params.learningObjectives ?? []
  );
  if (detectedSubjects.size === 0 && (params.stageTitle || params.careerGoal)) {
    detectedSubjects = detectLessonSubjects(
      params.stageTitle ?? "",
      `${params.careerGoal ?? ""} ${params.lessonDescription ?? ""}`.trim(),
      params.learningObjectives ?? []
    );
  }
  const primaryLessonText = `${lessonTitleLower} ${lessonDetailText}`.trim();
  const primaryLessonTokens = /* @__PURE__ */ new Set([...lessonTitleTokens, ...lessonDetailTokens]);
  const hasOverviewIntent = Array.from(lessonTitleTokens).some(
    (t) => OVERVIEW_LESSON_INTENT_TOKENS.has(t)
  );
  const preferredLang = (params.preferredLanguage ?? "en").toLowerCase().slice(0, 2);
  const scored = [];
  for (const entry of VERIFIED_RESOURCE_CATALOG) {
    if (!entryMatchesSubjectSet(entry, detectedSubjects)) {
      continue;
    }
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
    const specificityAdjustment = entry.isGenericOverview ? -6 : 2;
    const primarySubjectBonus = detectedSubjects.size === 0 || detectedSubjects.has(entry.primarySubject) ? 6 : 0;
    const totalScore = lessonScore + gapScore + resourceTitleOverlap + domainBoost + stageSameSubjectScore + primarySubjectBonus + levelBoost + languageBoost + specificityAdjustment;
    const isExactMatch = specificLessonMatches >= 1 && (titleScore >= 9 || lessonScore >= 14 || resourceTitleOverlap >= 8 && lessonScore >= 8) || hasOverviewIntent && (titleScore >= 9 || lessonScore >= 14);
    const isBroaderMatch = !isExactMatch && (lessonScore >= 5 || gapScore >= 5 && domainBoost >= 3 || domainBoost >= 6 && totalScore >= 12 || stageSameSubjectScore >= 3 && totalScore >= 7);
    if (isExactMatch || isBroaderMatch) {
      scored.push({
        entry,
        titleScore,
        lessonScore,
        gapScore,
        totalScore,
        matchScope: isExactMatch ? "exact" : "broader"
      });
    }
  }
  scored.sort((a, b) => {
    if (a.matchScope !== b.matchScope) {
      return a.matchScope === "exact" ? -1 : 1;
    }
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.lessonScore !== a.lessonScore) return b.lessonScore - a.lessonScore;
    return b.gapScore - a.gapScore;
  });
  const TARGET_MAX_VIDEOS = 5;
  const allRelevantVideos = scored.filter((s) => s.entry.category === "video");
  const exactVideos = allRelevantVideos.filter((s) => s.matchScope === "exact");
  const broaderVideos = allRelevantVideos.filter((s) => s.matchScope !== "exact");
  const selectedCuratedEntries = [];
  const seenVideoKeys = /* @__PURE__ */ new Set();
  const addUniqueVideo = (candidate) => {
    if (selectedCuratedEntries.length >= TARGET_MAX_VIDEOS) return;
    const key = candidate.entry.videoId || candidate.entry.url;
    if (seenVideoKeys.has(key)) return;
    seenVideoKeys.add(key);
    selectedCuratedEntries.push(candidate);
  };
  for (const item of exactVideos) addUniqueVideo(item);
  for (const item of broaderVideos) addUniqueVideo(item);
  if (selectedCuratedEntries.length < 3 && detectedSubjects.size > 0) {
    const sameSubjectExtras = VERIFIED_RESOURCE_CATALOG.filter(
      (entry) => entry.category === "video" && (detectedSubjects.has(entry.primarySubject) || entry.compatibleSubjects?.some((s) => detectedSubjects.has(s)))
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
        matchScope: "broader"
      });
    }
  }
  let videos = selectedCuratedEntries.map(
    (s, idx) => toTrustedResourceItem(s.entry, s.matchScope, idx)
  );
  const TARGET_MAX_TUTORIALS = 4;
  const allTutorials = scored.filter((s) => s.entry.category === "tutorial");
  const exactTutorials = allTutorials.filter((s) => s.matchScope === "exact");
  const broaderTutorials = allTutorials.filter((s) => s.matchScope !== "exact");
  const selectedTutorials = [];
  const seenTutorialUrls = /* @__PURE__ */ new Set();
  const addUniqueTutorial = (candidate) => {
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
      if (entry.category === "tutorial" && !seenTutorialUrls.has(entry.url) && entryMatchesSubjectSet(entry, detectedSubjects)) {
        seenTutorialUrls.add(entry.url);
        selectedTutorials.push({
          entry,
          titleScore: 0,
          lessonScore: 0,
          gapScore: 0,
          totalScore: 0,
          matchScope: "broader"
        });
      }
    }
  }
  const tutorials = selectedTutorials.map(
    (s) => toTrustedResourceItem(s.entry, s.matchScope)
  );
  const allPractice = scored.filter((s) => s.entry.category === "practice");
  const exactPractice = allPractice.filter((s) => s.matchScope === "exact");
  const practicePool = exactPractice.length > 0 ? [...exactPractice, ...allPractice.filter((s) => s.matchScope !== "exact")] : allPractice;
  const seenPracticeUrls = /* @__PURE__ */ new Set();
  const practice = [];
  for (const s of practicePool) {
    if (practice.length >= 2) break;
    if (seenPracticeUrls.has(s.entry.url)) continue;
    seenPracticeUrls.add(s.entry.url);
    practice.push(toTrustedResourceItem(s.entry, s.matchScope));
  }
  let youtubeSearchMode = "curated-oembed-verified";
  if (isYouTubeDataApiConfigured()) {
    const sameSubjectGaps = (params.knowledgeGaps ?? []).filter((gap) => {
      if (detectedSubjects.size === 0) return true;
      const gapLower = gap.toLowerCase();
      const gapTok = new Set(tokenize(gapLower));
      return Array.from(detectedSubjects).some(
        (subj) => SUBJECT_DETECTION_TERMS[subj].some(
          (term) => containsWholeTerm(gapLower, gapTok, term)
        )
      );
    });
    const queryParts = [params.lessonTitle];
    if (sameSubjectGaps.length > 0) {
      queryParts.push(sameSubjectGaps[0]);
    }
    queryParts.push("tutorial");
    const liveResult = await searchAndVerifyYouTubeVideos({
      query: queryParts.join(" "),
      maxResults: 12,
      relevanceLanguage: preferredLang
    });
    if (liveResult.configured && liveResult.videos.length > 0) {
      const lessonTokensAll = new Set(tokenize(primaryLessonText));
      const scoredLive = liveResult.videos.filter(
        (v) => isYouTubeCandidateSubjectCompatible(
          v.title,
          v.description,
          detectedSubjects
        )
      ).map((v) => {
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
      }).filter((item) => item.relevance >= 5).sort((a, b) => b.relevance - a.relevance).slice(0, TARGET_MAX_VIDEOS);
      if (scoredLive.length > 0) {
        youtubeSearchMode = "youtube-data-api";
        const merged = [];
        const seenMerged = /* @__PURE__ */ new Set();
        scoredLive.forEach(({ video: v }, idx) => {
          if (seenMerged.has(v.videoId) || merged.length >= TARGET_MAX_VIDEOS) return;
          seenMerged.add(v.videoId);
          merged.push({
            id: `yt-api-${v.videoId}`,
            category: "video",
            title: v.title,
            provider: v.channelTitle,
            type: "Video Tutorial",
            url: v.url,
            description: v.description || `Educational video lesson on ${params.lessonTitle} from ${v.channelTitle}.`,
            matchScope: "exact",
            learningPurpose: inferLearningPurpose(v.title, v.description, idx, false),
            videoId: v.videoId,
            embedUrl: v.embedUrl,
            thumbnailUrl: v.thumbnailUrl,
            embedAllowed: v.embedAllowed,
            duration: v.duration
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
          learningPurpose: v.learningPurpose || inferLearningPurpose(v.title, v.description, idx, false)
        }));
      }
    }
  }
  if (youtubeSearchMode === "curated-oembed-verified" && videos.length > 0) {
    const verifyWithBudget = (videoId) => Promise.race([
      verifyYouTubeVideoOEmbed(videoId),
      new Promise(
        (resolve) => setTimeout(
          () => resolve({
            videoId,
            valid: true,
            embedAllowed: true,
            unverifiedNetworkError: true
          }),
          900
        )
      )
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
            embedAllowed: check.unverifiedNetworkError ? video.embedAllowed : check.embedAllowed
          },
          keep: true
        };
      })
    );
    videos = verifiedChecks.filter((c) => c.keep).map((c) => c.video);
  }
  const allSelected = [...videos, ...tutorials, ...practice];
  const usedBroaderFallback = allSelected.length > 0 && allSelected.some((item) => item.matchScope === "broader");
  const videoCoverageNote = videos.length === 0 ? "No verified YouTube videos matched this specialized topic yet. Use the verified written guides and course exercises below instead of unverified links." : videos.length < 3 ? `Showing ${videos.length} verified topic-relevant video${videos.length === 1 ? "" : "s"} \u2014 Skillora avoids padding with unrelated videos when fewer exact matches exist.` : void 0;
  return {
    videos,
    tutorials,
    practice,
    usedBroaderFallback,
    youtubeSearchMode,
    ...videoCoverageNote ? { videoCoverageNote } : {}
  };
}
async function matchTrustedResourcesForCourse(params) {
  const combinedLessonsText = (params.lessonTitles ?? []).slice(0, 8).join(". ");
  const combinedDetail = [
    params.courseDescription ?? "",
    combinedLessonsText,
    ...params.learningObjectives ?? []
  ].filter(Boolean).join(" ");
  const primaryBundle = await matchTrustedResourcesForLesson({
    lessonTitle: params.courseTitle,
    lessonDescription: combinedDetail,
    learningObjectives: params.learningObjectives,
    stageTitle: params.courseTitle,
    careerGoal: params.careerGoal,
    knowledgeLevel: params.knowledgeLevel,
    preferredLanguage: "en"
  });
  if ((primaryBundle.videos.length < 3 || primaryBundle.tutorials.length < 2) && (params.lessonTitles?.length ?? 0) > 0) {
    const lessonBundles = await Promise.all(
      (params.lessonTitles ?? []).slice(0, 4).map(
        (lTitle) => matchTrustedResourcesForLesson({
          lessonTitle: lTitle,
          lessonDescription: params.courseDescription ?? "",
          learningObjectives: params.learningObjectives,
          stageTitle: params.courseTitle,
          careerGoal: params.careerGoal,
          knowledgeLevel: params.knowledgeLevel,
          preferredLanguage: "en"
        })
      )
    );
    const videos = [];
    const seenVideoIds = /* @__PURE__ */ new Set();
    const tutorials = [];
    const seenTutorialUrls = /* @__PURE__ */ new Set();
    const practice = [];
    const seenPracticeUrls = /* @__PURE__ */ new Set();
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
      const videoCoverageNote = videos.length > 0 && videos.length < 3 ? `Showing ${videos.length} verified topic-relevant video${videos.length === 1 ? "" : "s"} \u2014 Skillora only lists verified subject matches.` : void 0;
      return {
        videos,
        tutorials,
        practice,
        usedBroaderFallback: primaryBundle.usedBroaderFallback || [...videos, ...tutorials, ...practice].some((i) => i.matchScope === "broader"),
        youtubeSearchMode: primaryBundle.youtubeSearchMode,
        ...videoCoverageNote ? { videoCoverageNote } : {}
      };
    }
  }
  const hasAnyResources = primaryBundle.videos.length > 0 || primaryBundle.tutorials.length > 0 || primaryBundle.practice.length > 0;
  if (hasAnyResources) {
    return primaryBundle;
  }
  const goalContext = (params.careerGoal ?? "").trim();
  if (goalContext) {
    const goalBundle = await matchTrustedResourcesForLesson({
      lessonTitle: `${params.courseTitle} \u2014 ${goalContext}`,
      lessonDescription: `${combinedDetail} ${goalContext}`.trim(),
      learningObjectives: params.learningObjectives,
      stageTitle: goalContext,
      careerGoal: goalContext,
      knowledgeLevel: params.knowledgeLevel,
      preferredLanguage: "en"
    });
    if (goalBundle.videos.length > 0 || goalBundle.tutorials.length > 0 || goalBundle.practice.length > 0) {
      return { ...goalBundle, usedBroaderFallback: true };
    }
  }
  const fallbackSubjects = detectLessonSubjects(
    `${params.courseTitle} ${goalContext}`,
    combinedDetail,
    params.learningObjectives ?? []
  );
  const subjectEntries = VERIFIED_RESOURCE_CATALOG.filter(
    (entry) => fallbackSubjects.size > 0 ? entryMatchesSubjectSet(entry, fallbackSubjects) : entry.primarySubject === "academic_research" || entry.primarySubject === "python"
  );
  const fallbackVideos = subjectEntries.filter((e) => e.category === "video").slice(0, 4).map((e, idx) => toTrustedResourceItem(e, "broader", idx));
  const fallbackTutorials = subjectEntries.filter((e) => e.category === "tutorial").slice(0, 3).map((e) => toTrustedResourceItem(e, "broader"));
  const fallbackPractice = subjectEntries.filter((e) => e.category === "practice").slice(0, 2).map((e) => toTrustedResourceItem(e, "broader"));
  return {
    videos: fallbackVideos,
    tutorials: fallbackTutorials,
    practice: fallbackPractice,
    usedBroaderFallback: true,
    youtubeSearchMode: "curated-oembed-verified",
    ...fallbackVideos.length < 3 ? {
      videoCoverageNote: fallbackVideos.length === 0 ? "No verified course videos matched yet \u2014 explore the written guides and open courses below." : `Showing ${fallbackVideos.length} verified topic-relevant video${fallbackVideos.length === 1 ? "" : "s"} without padding off-topic content.`
    } : {}
  };
}

// server/exploreResourcesService.ts
var ExploreResourcesApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ExploreResourcesApiError";
    this.status = status;
    this.code = code;
  }
};
var MAX_FOR_YOU_ITEMS = 5;
var MIN_FOR_YOU_TARGET = 3;
var MAX_CONTINUE_LEARNING_ITEMS = 4;
var SERVER_CACHE_TTL_MS = 5 * 6e4;
var SUBJECT_LABELS = {
  css: "CSS & Layout",
  html: "HTML & Web Basics",
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React & Frontend",
  nodejs_backend: "Backend & Architecture",
  sql: "Database & SQL",
  python: "Python",
  ai_ml: "AI & Data Science",
  git_devops: "Software Engineering",
  design_ux: "UI/UX Design",
  cybersecurity: "Cybersecurity",
  business_management: "Business & Management",
  academic_research: "Academic Writing & Research",
  public_speaking: "Public Speaking & Presentations",
  geography_gis: "Geography & GIS",
  finance_economics: "Finance & Analytics",
  engineering: "Engineering & Systems"
};
var INTEREST_TO_SUBJECTS = {
  programming: {
    subjects: ["python", "javascript", "typescript", "sql", "git_devops", "nodejs_backend"],
    terms: ["programming", "coding", "algorithms", "data structures", "python", "javascript", "git"]
  },
  "web development": {
    subjects: ["html", "css", "javascript", "react", "nodejs_backend", "typescript", "sql"],
    terms: [
      "web",
      "html",
      "css",
      "javascript",
      "react",
      "node",
      "frontend",
      "backend",
      "responsive",
      "software architecture"
    ]
  },
  "full-stack web development": {
    subjects: ["react", "nodejs_backend", "sql", "javascript", "typescript", "css", "html"],
    terms: ["full-stack", "react", "node", "sql", "software architecture", "javascript", "typescript"]
  },
  "frontend development": {
    subjects: ["html", "css", "javascript", "react", "typescript", "design_ux"],
    terms: ["frontend", "css", "flexbox", "grid", "html", "react", "typescript", "responsive", "ui"]
  },
  "frontend developer": {
    subjects: ["html", "css", "javascript", "react", "typescript", "design_ux"],
    terms: ["frontend", "css", "flexbox", "grid", "html", "react", "typescript", "responsive", "ui"]
  },
  "backend development": {
    subjects: ["nodejs_backend", "python", "sql", "git_devops"],
    terms: ["backend", "api", "rest", "node", "express", "fastapi", "http", "sql", "database", "software architecture"]
  },
  "backend developer": {
    subjects: ["nodejs_backend", "python", "sql", "git_devops"],
    terms: ["backend", "api", "rest", "node", "express", "fastapi", "http", "sql", "database", "software architecture"]
  },
  "full-stack developer": {
    subjects: ["react", "nodejs_backend", "sql", "javascript", "typescript", "css", "html"],
    terms: ["full-stack", "react", "node", "express", "sql", "javascript", "typescript", "software architecture"]
  },
  "software architecture": {
    subjects: ["nodejs_backend", "git_devops", "sql"],
    terms: ["software architecture", "system design", "architecture", "microservices", "caching", "patterns"]
  },
  "ai engineer": {
    subjects: ["ai_ml", "python", "sql"],
    terms: ["ai", "machine learning", "deep learning", "pytorch", "llm", "python", "scikit", "ml", "neural network"]
  },
  "machine learning engineer": {
    subjects: ["ai_ml", "python", "sql"],
    terms: ["machine learning", "ml", "pytorch", "scikit", "sklearn", "deep learning", "python", "validation"]
  },
  "data analyst": {
    subjects: ["sql", "ai_ml", "python", "finance_economics"],
    terms: ["data analysis", "sql", "pandas", "numpy", "excel", "data visualization", "statistics", "python", "query"]
  },
  "data scientist": {
    subjects: ["ai_ml", "python", "sql"],
    terms: ["data science", "data analysis", "machine learning", "pandas", "numpy", "scikit", "python", "sql"]
  },
  "ai & data science": {
    subjects: ["ai_ml", "python", "sql"],
    terms: ["ai", "machine learning", "ml", "data science", "data analysis", "pandas", "pytorch", "scikit", "python"]
  },
  "data science": {
    subjects: ["ai_ml", "python", "sql"],
    terms: ["data science", "data analysis", "pandas", "numpy", "machine learning", "sql", "statistics"]
  },
  "ui/ux designer": {
    subjects: ["design_ux", "css", "html"],
    terms: ["ui/ux", "ui", "ux", "figma", "wireframe", "mockup", "prototype", "accessibility", "wcag", "typography", "design system"]
  },
  "ui/ux & product design": {
    subjects: ["design_ux", "css", "html"],
    terms: ["ui/ux", "ui", "ux", "figma", "wireframe", "prototype", "accessibility", "wcag", "design system"]
  },
  "cybersecurity specialist": {
    subjects: ["cybersecurity", "git_devops"],
    terms: ["cybersecurity", "security", "owasp", "nist", "network security", "authentication", "vulnerability"]
  },
  "business & management": {
    subjects: ["business_management"],
    terms: [
      "business",
      "business management",
      "project management",
      "marketing",
      "entrepreneurship",
      "strategy",
      "leadership",
      "okr",
      "swot",
      "agile",
      "seo"
    ]
  },
  "business management": {
    subjects: ["business_management"],
    terms: [
      "business",
      "business management",
      "project management",
      "operations management",
      "entrepreneurship",
      "marketing",
      "strategy",
      "leadership"
    ]
  },
  "business manager": {
    subjects: ["business_management"],
    terms: ["business management", "leadership", "strategy", "okr", "operations management", "stakeholder", "swot"]
  },
  "project manager": {
    subjects: ["business_management"],
    terms: ["project management", "agile", "okr", "stakeholder", "leadership", "operations management", "strategy"]
  },
  "digital marketer": {
    subjects: ["business_management"],
    terms: ["digital marketing", "marketing", "seo", "content", "analytics", "campaign", "growth", "swot"]
  },
  entrepreneurship: {
    subjects: ["business_management"],
    terms: ["entrepreneurship", "mvp", "business strategy", "value proposition", "business"]
  },
  marketing: {
    subjects: ["business_management"],
    terms: ["marketing", "digital marketing", "seo", "brand", "market research", "swot"]
  },
  engineering: {
    subjects: ["engineering"],
    terms: [
      "engineering",
      "mechanical engineering",
      "electrical engineering",
      "civil engineering",
      "systems engineering",
      "systems design",
      "electronics",
      "thermodynamics",
      "circuits"
    ]
  },
  "electrical engineering": {
    subjects: ["engineering"],
    terms: [
      "electrical engineering",
      "electronics",
      "circuits",
      "circuit analysis",
      "ohm",
      "signal processing",
      "systems design",
      "power"
    ]
  },
  "engineering & systems": {
    subjects: ["engineering"],
    terms: ["engineering", "electrical engineering", "mechanical engineering", "electronics", "systems design", "circuits"]
  },
  "design & creativity": {
    subjects: ["design_ux", "css", "html"],
    terms: ["design", "ui", "ux", "ui/ux", "figma", "typography", "accessibility", "wcag", "wireframe", "css"]
  },
  "cybersecurity & it": {
    subjects: ["cybersecurity", "git_devops"],
    terms: ["cybersecurity", "security", "owasp", "nist", "docker", "network security", "authentication"]
  },
  "communication & professional skills": {
    subjects: ["public_speaking", "academic_research"],
    terms: [
      "public speaking",
      "presentation skills",
      "academic presentation",
      "presentation",
      "communication",
      "technical writing",
      "speech"
    ]
  },
  "finance & data tools": {
    subjects: ["finance_economics", "sql"],
    terms: ["finance", "accounting", "economics", "valuation", "sql", "data analysis"]
  },
  "languages & academic skills": {
    subjects: ["academic_research", "public_speaking"],
    terms: [
      "academic writing",
      "research writing",
      "research methodology",
      "research design",
      "literature review",
      "academic presentation",
      "public speaking",
      "english proficiency",
      "essay",
      "citation",
      "thesis"
    ]
  },
  "geography & gis": {
    subjects: ["geography_gis"],
    terms: [
      "gis",
      "geographic information systems",
      "geography",
      "geography research",
      "spatial analysis",
      "environmental research",
      "qgis",
      "arcgis",
      "cartography"
    ]
  },
  "geography & environmental": {
    subjects: ["geography_gis"],
    terms: [
      "geography",
      "geography research",
      "geographic information systems",
      "gis",
      "spatial analysis",
      "environmental research",
      "qgis",
      "cartography"
    ]
  },
  "environmental research": {
    subjects: ["geography_gis", "academic_research"],
    terms: ["environmental research", "geography research", "spatial analysis", "gis", "research methodology"]
  }
};
var RELATED_SUBJECT_FAMILIES = {
  css: ["html", "design_ux", "react"],
  html: ["css", "javascript", "design_ux"],
  javascript: ["typescript", "react", "html", "nodejs_backend"],
  typescript: ["javascript", "react", "nodejs_backend"],
  react: ["javascript", "typescript", "css"],
  nodejs_backend: ["sql", "typescript", "git_devops", "javascript"],
  sql: ["nodejs_backend", "python", "finance_economics"],
  python: ["ai_ml", "sql", "nodejs_backend"],
  ai_ml: ["python", "sql"],
  git_devops: ["nodejs_backend", "cybersecurity", "typescript"],
  design_ux: ["css", "html"],
  cybersecurity: ["git_devops", "nodejs_backend"],
  business_management: ["finance_economics", "public_speaking"],
  academic_research: ["public_speaking", "geography_gis"],
  public_speaking: ["academic_research", "business_management"],
  geography_gis: ["academic_research"],
  finance_economics: ["business_management", "sql"],
  engineering: ["python", "git_devops"]
};
var GENERIC_STOP_TERMS = /* @__PURE__ */ new Set([
  "skill",
  "skills",
  "improve",
  "improving",
  "proficiency",
  "development",
  "student",
  "students",
  "master",
  "masters",
  "postgraduate",
  "graduate",
  "undergraduate",
  "study",
  "studies",
  "field",
  "career",
  "goal",
  "goals",
  "learn",
  "learning",
  "course",
  "courses",
  "basic",
  "basics",
  "fundamental",
  "fundamentals",
  "introduction",
  "intro",
  "tool",
  "tools",
  "language",
  "languages",
  "and",
  "or",
  "for",
  "the",
  "with",
  "from",
  "into",
  "data",
  "analysis",
  "research",
  "academic",
  "general",
  "professional",
  "beginner",
  "intermediate",
  "advanced",
  "system",
  "systems",
  "design",
  "management",
  "science",
  "sciences",
  "environment"
]);
var brokenVideoIds = /* @__PURE__ */ new Set();
var videoVerificationWarmed = false;
var videoVerificationInFlight = null;
function warmCatalogYouTubeVerification() {
  if (videoVerificationWarmed || videoVerificationInFlight) return;
  const catalogVideos = getExploreResourceCatalog().filter(
    (entry) => entry.tabCategory === "video" && Boolean(entry.videoId)
  );
  videoVerificationInFlight = Promise.allSettled(
    catalogVideos.map(async (video) => {
      if (!video.videoId) return;
      const result = await verifyYouTubeVideoOEmbed(video.videoId);
      if (!result.unverifiedNetworkError && (!result.valid || !result.embedAllowed)) {
        brokenVideoIds.add(video.videoId);
      }
    })
  ).then(() => {
    videoVerificationWarmed = true;
  }).finally(() => {
    videoVerificationInFlight = null;
  });
}
var exploreResponseCache = /* @__PURE__ */ new Map();
var exploreInFlight = /* @__PURE__ */ new Map();
function invalidateExploreResourcesServerCache(userId) {
  if (userId) {
    exploreResponseCache.delete(userId);
  } else {
    exploreResponseCache.clear();
  }
}
function createUserScopedSupabaseClient(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new ExploreResourcesApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function parseSubjectsAndTermsFromText(textList) {
  const subjects = /* @__PURE__ */ new Set();
  const terms = /* @__PURE__ */ new Set();
  const cleanedItems = textList.map((s) => s.trim()).filter(Boolean);
  const rawTextLower = cleanedItems.join(" ").toLowerCase();
  for (const clean of cleanedItems) {
    const lower = clean.toLowerCase();
    for (const tok of tokenize(lower)) {
      if (!GENERIC_STOP_TERMS.has(tok) && tok.length >= 2) {
        terms.add(tok);
      }
    }
    const mapped = INTEREST_TO_SUBJECTS[lower];
    if (mapped) {
      mapped.subjects.forEach((s) => subjects.add(s));
      mapped.terms.forEach((t) => terms.add(t));
    }
    if (/\b(academic writing|research writing|scholarly writing|thesis writing|dissertation|literature review|essay writing|english proficiency|research methodology|research methods|research design|academic skills)\b/i.test(
      lower
    )) {
      subjects.add("academic_research");
      terms.add("academic writing");
      terms.add("research writing");
      terms.add("research methodology");
    }
    if (/\b(public speaking|presentation skills|academic presentation|oral presentation|presentation|presentations|speech|rhetoric)\b/i.test(
      lower
    )) {
      subjects.add("public_speaking");
      terms.add("public speaking");
      terms.add("presentation skills");
      terms.add("academic presentation");
    }
    if (/\b(geography|geographic|geography research|geographic information systems|geospatial|gis|qgis|arcgis|cartography|spatial analysis|remote sensing|environmental research|environmental science)\b/i.test(
      lower
    )) {
      subjects.add("geography_gis");
      terms.add("geography");
      terms.add("geography research");
      terms.add("gis");
      terms.add("geographic information systems");
      if (/\benvironmental\b/i.test(lower)) {
        terms.add("environmental research");
      }
      if (/\bspatial\b/i.test(lower)) {
        terms.add("spatial analysis");
      }
    }
    if (/\b(electrical engineering|mechanical engineering|civil engineering|chemical engineering|industrial engineering|aerospace engineering|systems engineering|electronics|circuit analysis|circuits|signal processing|thermodynamics|engineering)\b/i.test(
      lower
    ) && !/\bsoftware engineer/i.test(lower)) {
      subjects.add("engineering");
      if (/\b(electrical|electronics|circuit|signal)\b/i.test(lower)) {
        terms.add("electrical engineering");
        terms.add("electronics");
        terms.add("circuits");
      }
      if (/\b(systems design|systems engineering)\b/i.test(lower)) {
        terms.add("systems design");
        terms.add("systems engineering");
      }
    }
    if (/\b(computer science|software engineer|software engineering|software developer)\b/i.test(lower)) {
      subjects.add("python");
      subjects.add("javascript");
      subjects.add("typescript");
      subjects.add("sql");
      subjects.add("git_devops");
      subjects.add("nodejs_backend");
      terms.add("computer science");
      terms.add("algorithms");
    }
    if (/\b(software architecture|system design)\b/i.test(lower)) {
      subjects.add("nodejs_backend");
      subjects.add("git_devops");
      terms.add("software architecture");
      terms.add("system design");
      terms.add("architecture");
    }
    if (/\b(frontend|front-end|ui engineer|web designer|css|flexbox|react)\b/i.test(lower)) {
      subjects.add("css");
      subjects.add("html");
      subjects.add("javascript");
      subjects.add("react");
    }
    if (/\b(full-stack|full stack|web developer|web dev|web development)\b/i.test(lower)) {
      subjects.add("html");
      subjects.add("css");
      subjects.add("javascript");
      subjects.add("react");
      subjects.add("nodejs_backend");
      subjects.add("sql");
    }
    if (/\b(backend|back-end|api developer|server|microservice)\b/i.test(lower)) {
      subjects.add("nodejs_backend");
      subjects.add("python");
      subjects.add("sql");
    }
    if (/\b(data scientist|data analyst|machine learning|ml engineer|ai engineer|deep learning|data engineer|ai & data)\b/i.test(lower)) {
      subjects.add("ai_ml");
      subjects.add("python");
      subjects.add("sql");
    }
    if (/\b(ux|ui\/ux|product design|graphic design|figma)\b/i.test(lower)) {
      subjects.add("design_ux");
    }
    if (/\b(cyber|security|infosec|pentest|soc analyst)\b/i.test(lower)) {
      subjects.add("cybersecurity");
    }
    if (/\b(devops|cloud|sre|platform engineer)\b/i.test(lower)) {
      subjects.add("git_devops");
    }
    if (/\b(finance|financial|accountant|investment|economics)\b/i.test(lower)) {
      subjects.add("finance_economics");
    }
    if (/\b(business|management|marketing|entrepreneur|entrepreneurship|digital marketing|seo|product manager|project management)\b/i.test(lower)) {
      subjects.add("business_management");
    }
    const itemTokens = new Set(tokenize(lower));
    Object.keys(SUBJECT_DETECTION_TERMS).forEach((family) => {
      if (family === "engineering" && /\bsoftware engineer/i.test(lower) && !/\b(electrical|mechanical|civil|chemical|electronics)\b/i.test(lower)) {
        return;
      }
      if ((family === "nodejs_backend" || family === "git_devops") && /\bsystems design\b/i.test(lower) && /\b(electrical|electronics|mechanical|hardware|engineering)\b/i.test(lower)) {
        return;
      }
      if (SUBJECT_DETECTION_TERMS[family].some(
        (term) => containsWholeTerm(lower, itemTokens, term)
      )) {
        subjects.add(family);
      }
    });
  }
  return { subjects, terms, rawTextLower };
}
function getSubdisciplinePenalty(entry, bucket) {
  const bucketText = bucket.rawTextLower;
  const entryDomains = entry.domains.join(" ").toLowerCase();
  if (/\b(electrical|electronics|circuits|signal)\b/.test(bucketText) && !/\b(chemical|mechanical)\b/.test(bucketText) && (/\bchemical engineering\b/.test(entryDomains) || entryDomains.includes("mechanical engineering") && !entryDomains.includes("electrical"))) {
    return 45;
  }
  if (/\bmechanical engineering\b/.test(bucketText) && !/\b(electrical|electronics|circuits)\b/.test(bucketText) && /\belectrical engineering\b/.test(entryDomains)) {
    return 35;
  }
  return 0;
}
function scoreBucketMatch(entry, bucket, allowCompatible = true) {
  if (bucket.subjects.size === 0 && bucket.terms.size === 0) return 0;
  let subjectScore = 0;
  const primaryMatch = bucket.subjects.has(entry.primarySubject);
  const compatibleMatch = allowCompatible && entry.compatibleSubjects.some((s) => bucket.subjects.has(s));
  if (primaryMatch) {
    subjectScore = 65;
  } else if (compatibleMatch) {
    subjectScore = 38;
  }
  const entryText = `${entry.title} ${entry.description} ${entry.domains.join(" ")} ${entry.keywords.join(" ")}`.toLowerCase();
  const entryTokens = new Set(tokenize(entryText));
  let specificTermHits = 0;
  for (const term of bucket.terms) {
    if (GENERIC_STOP_TERMS.has(term) || term.length < 2) continue;
    if (containsWholeTerm(entryText, entryTokens, term)) {
      specificTermHits += term.includes(" ") ? 1.6 : 1;
      if (specificTermHits >= 3.5) break;
    }
  }
  if (!primaryMatch && !compatibleMatch && specificTermHits < 2.5) {
    return 0;
  }
  const termBonus = Math.min(35, Math.round(specificTermHits * 11));
  const penalty = getSubdisciplinePenalty(entry, bucket);
  return Math.max(0, Math.min(100, subjectScore + termBonus - penalty));
}
function toResponseItem(entry, extra) {
  return {
    id: entry.id,
    tabCategory: entry.tabCategory,
    subject: entry.primarySubject,
    subjectLabel: SUBJECT_LABELS[entry.primarySubject] ?? "General",
    title: entry.title,
    provider: entry.provider,
    type: entry.type,
    url: entry.url,
    description: entry.description,
    levels: entry.levels,
    ...entry.pricing ? { pricing: entry.pricing } : {},
    ...entry.videoId ? { videoId: entry.videoId } : {},
    ...entry.embedUrl ? { embedUrl: entry.embedUrl } : {},
    ...entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {},
    ...entry.embedAllowed !== void 0 ? { embedAllowed: entry.embedAllowed } : {},
    ...extra?.matchReason ? { matchReason: extra.matchReason } : {},
    ...extra?.relationshipTier ? { relationshipTier: extra.relationshipTier } : {},
    ...extra?.relationshipLabel ? { relationshipLabel: extra.relationshipLabel } : {}
  };
}
function orderBalancedMultiDiscipline(items) {
  const buckets = /* @__PURE__ */ new Map();
  for (const item of items) {
    const arr = buckets.get(item.subject) ?? [];
    arr.push(item);
    buckets.set(item.subject, arr);
  }
  const preferredOrder = [
    "business_management",
    "geography_gis",
    "engineering",
    "academic_research",
    "design_ux",
    "react",
    "finance_economics",
    "public_speaking",
    "ai_ml",
    "sql",
    "cybersecurity",
    "python",
    "nodejs_backend",
    "javascript",
    "git_devops",
    "css",
    "typescript",
    "html"
  ];
  const orderedKeys = [
    ...preferredOrder.filter((k) => buckets.has(k)),
    ...Array.from(buckets.keys()).filter((k) => !preferredOrder.includes(k))
  ];
  const result = [];
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
function resolvePrimaryDirection(signals) {
  const explicit = (signals.primaryDirection ?? "").trim();
  if (explicit) {
    return { primaryDirection: explicit, source: "explicit" };
  }
  const roadmapFocus = (signals.activeRoadmapCareerGoal ?? "").trim() || (signals.activeRoadmapTitle ?? "").trim();
  if (roadmapFocus) {
    return { primaryDirection: roadmapFocus, source: "active_roadmap" };
  }
  const profileGoal = signals.careerGoal.trim();
  if (profileGoal) {
    return { primaryDirection: profileGoal, source: "profile_goal" };
  }
  const field = signals.fieldOfStudy.trim();
  if (field) {
    const fieldParsed = parseSubjectsAndTermsFromText([field]);
    if (fieldParsed.subjects.size > 0) {
      return { primaryDirection: field, source: "profile_goal" };
    }
  }
  return { primaryDirection: null, source: "unset" };
}
function buildContinueLearningResources(catalog, signals, knowledgeLevel) {
  const lessonTitle = (signals.currentLessonTitle ?? "").trim();
  const lessonText = (signals.currentLessonText ?? "").trim();
  const courseTitle = (signals.currentCourseTitle ?? "").trim();
  const hasGaps = signals.knowledgeGaps.length > 0 || signals.lowScoreSubjects.length > 0;
  if (!lessonTitle && !courseTitle && !hasGaps) {
    return [];
  }
  const lessonSubjects = lessonTitle ? detectLessonSubjects(lessonTitle, lessonText) : /* @__PURE__ */ new Set();
  const lessonBucket = parseSubjectsAndTermsFromText(
    [lessonTitle, lessonText].filter(Boolean)
  );
  lessonSubjects.forEach((s) => lessonBucket.subjects.add(s));
  const courseBucket = parseSubjectsAndTermsFromText(courseTitle ? [courseTitle] : []);
  const gapBucket = parseSubjectsAndTermsFromText([
    ...signals.knowledgeGaps,
    ...signals.lowScoreSubjects
  ]);
  const scored = [];
  for (const entry of catalog) {
    const lessonMatch = lessonBucket.subjects.size > 0 || lessonBucket.terms.size > 0 ? scoreBucketMatch(entry, lessonBucket, lessonSubjects.size === 0) : 0;
    const courseMatch = courseBucket.subjects.size > 0 || courseBucket.terms.size > 0 ? scoreBucketMatch(entry, courseBucket, true) : 0;
    const gapMatch = gapBucket.subjects.size > 0 || gapBucket.terms.size > 0 ? scoreBucketMatch(entry, gapBucket, true) : 0;
    const bestScore = Math.max(lessonMatch * 1.15, gapMatch * 1.05, courseMatch * 0.9);
    if (bestScore < 55) continue;
    let reason = "";
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
      tier: "direct",
      label: "Directly relevant"
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  const seenUrls = /* @__PURE__ */ new Set();
  const formatsSeen = /* @__PURE__ */ new Set();
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
  return selected.map(
    (item) => toResponseItem(item.entry, {
      matchReason: item.reason,
      relationshipTier: item.tier,
      relationshipLabel: item.label
    })
  );
}
function buildExploreResourcesForContext(signals, authenticated = true) {
  warmCatalogYouTubeVerification();
  const rawCatalog = getExploreResourceCatalog();
  const catalog = rawCatalog.filter(
    (entry) => entry.tabCategory !== "video" || (!entry.videoId || !brokenVideoIds.has(entry.videoId))
  );
  const { primaryDirection, source: primaryDirectionSource } = resolvePrimaryDirection(signals);
  const cleanPrimaryLower = (primaryDirection ?? "").trim().toLowerCase();
  const supportingInterests = Array.from(
    /* @__PURE__ */ new Set([
      ...signals.learningInterests.filter(
        (i) => i.trim() && i.trim().toLowerCase() !== cleanPrimaryLower
      ),
      ...signals.currentSkills.filter(
        (s) => s.trim() && s.trim().toLowerCase() !== cleanPrimaryLower
      )
    ])
  );
  const rawAllItems = catalog.map((entry) => toResponseItem(entry));
  const allItems = orderBalancedMultiDiscipline(rawAllItems);
  const videos = allItems.filter((item) => item.tabCategory === "video");
  const documentation = allItems.filter((item) => item.tabCategory === "documentation");
  const courses = allItems.filter((item) => item.tabCategory === "course").sort((a, b) => {
    const aFree = a.pricing === "Free" ? 0 : 1;
    const bFree = b.pricing === "Free" ? 0 : 1;
    return aFree - bFree;
  });
  const continueLearning = authenticated ? buildContinueLearningResources(catalog, signals, signals.knowledgeLevel) : [];
  let forYou = [];
  let fallbackLevelUsed = 0;
  let shortageNote = null;
  const hasReliableDirection = Boolean(authenticated && primaryDirection && primaryDirectionSource !== "unset");
  if (hasReliableDirection && primaryDirection) {
    const primaryBucket = parseSubjectsAndTermsFromText([
      primaryDirection,
      ...primaryDirectionSource === "explicit" ? [] : [signals.fieldOfStudy].filter(Boolean)
    ]);
    const lessonBucket = parseSubjectsAndTermsFromText(
      [signals.currentLessonTitle ?? "", signals.currentCourseTitle ?? ""].filter(Boolean)
    );
    const gapBucket = parseSubjectsAndTermsFromText([
      ...signals.knowledgeGaps,
      ...signals.lowScoreSubjects
    ]);
    const supportingBucket = parseSubjectsAndTermsFromText([
      ...signals.learningInterests,
      ...signals.currentSkills,
      ...signals.careerGoal && signals.careerGoal.trim().toLowerCase() !== cleanPrimaryLower ? [signals.careerGoal] : []
    ]);
    const picked = /* @__PURE__ */ new Map();
    const pickedUrls = /* @__PURE__ */ new Set();
    const tryAdd = (cand, maxTotal = MAX_FOR_YOU_ITEMS) => {
      if (picked.size >= maxTotal) return false;
      if (picked.has(cand.entry.id) || pickedUrls.has(cand.entry.url)) return false;
      picked.set(cand.entry.id, cand);
      pickedUrls.add(cand.entry.url);
      return true;
    };
    const directCandidates = [];
    for (const entry of catalog) {
      const primaryMatch = scoreBucketMatch(entry, primaryBucket, true);
      if (primaryMatch < 55) continue;
      const lessonMatch = scoreBucketMatch(entry, lessonBucket, true);
      const gapMatch = scoreBucketMatch(entry, gapBucket, true);
      const supportingMatch = scoreBucketMatch(entry, supportingBucket, true);
      const levelBonus = entry.levels.includes(signals.knowledgeLevel) ? 3 : 0;
      const combinedScore = primaryMatch * 1 + (lessonMatch >= 55 ? 24 : 0) + (gapMatch >= 55 ? 16 : 0) + (supportingMatch >= 55 ? 14 : 0) + levelBonus;
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
        tier: "direct",
        label: "Directly relevant",
        reason
      });
    }
    directCandidates.sort((a, b) => b.score - a.score);
    const directFormatFirst = ["video", "documentation", "course"];
    for (const fmt of directFormatFirst) {
      const topFmt = directCandidates.find(
        (c) => c.entry.tabCategory === fmt && !picked.has(c.entry.id) && !pickedUrls.has(c.entry.url)
      );
      if (topFmt) {
        tryAdd(topFmt, MAX_FOR_YOU_ITEMS);
      }
    }
    const supportingCandidates = [];
    if (supportingBucket.subjects.size > 0 || supportingBucket.terms.size > 0) {
      for (const entry of catalog) {
        if (picked.has(entry.id) || pickedUrls.has(entry.url)) continue;
        const supMatch = scoreBucketMatch(entry, supportingBucket, true);
        if (supMatch < 60) continue;
        const levelBonus = entry.levels.includes(signals.knowledgeLevel) ? 3 : 0;
        const gapMatch = scoreBucketMatch(entry, gapBucket, true);
        const primaryOverlap = scoreBucketMatch(entry, primaryBucket, true);
        const isPrimaryStrong = primaryOverlap >= 55;
        supportingCandidates.push({
          entry,
          score: supMatch + (primaryOverlap >= 38 ? 20 : 0) + (gapMatch >= 55 ? 12 : 0) + levelBonus,
          tier: isPrimaryStrong ? "direct" : "supporting",
          label: isPrimaryStrong ? "Directly relevant" : "Supporting interest",
          reason: isPrimaryStrong ? `Connects ${primaryDirection} with your supporting interests` : `Strengthens your direction via supporting interest`
        });
      }
      supportingCandidates.sort((a, b) => b.score - a.score);
    }
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
    if (picked.size >= MIN_FOR_YOU_TARGET && picked.size < MAX_FOR_YOU_ITEMS && supportingCandidates.length > 0) {
      const bestSupporting = supportingCandidates.find(
        (c) => !picked.has(c.entry.id) && !pickedUrls.has(c.entry.url)
      );
      if (bestSupporting) {
        tryAdd(bestSupporting, MAX_FOR_YOU_ITEMS);
      }
    }
    for (const cand of directCandidates) {
      if (picked.size >= MAX_FOR_YOU_ITEMS) break;
      tryAdd(cand, MAX_FOR_YOU_ITEMS);
    }
    if (picked.size < MIN_FOR_YOU_TARGET) {
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
                tier: "supporting",
                label: "Supporting interest",
                reason: clItem.matchReason || `Supports your current lesson`
              },
              MIN_FOR_YOU_TARGET
            );
          }
        }
        if (picked.size > beforeLevel1) fallbackLevelUsed = 1;
      }
      if (picked.size < MIN_FOR_YOU_TARGET && primaryBucket.subjects.size > 0) {
        const beforeLevel2 = picked.size;
        const level2Cands = [];
        for (const entry of catalog) {
          if (picked.has(entry.id) || pickedUrls.has(entry.url)) continue;
          const matchesPrimaryFamily = primaryBucket.subjects.has(entry.primarySubject) || entry.compatibleSubjects.some((s) => primaryBucket.subjects.has(s));
          if (!matchesPrimaryFamily) continue;
          const penalty = getSubdisciplinePenalty(entry, primaryBucket);
          if (penalty > 20) continue;
          level2Cands.push({
            entry,
            score: (primaryBucket.subjects.has(entry.primarySubject) ? 50 : 40) - penalty,
            tier: "direct",
            label: "Directly relevant",
            reason: `Related to your primary direction: ${primaryDirection}`
          });
        }
        level2Cands.sort((a, b) => b.score - a.score);
        for (const cand of level2Cands) {
          if (picked.size >= MIN_FOR_YOU_TARGET) break;
          tryAdd(cand, MIN_FOR_YOU_TARGET);
        }
        if (picked.size > beforeLevel2) fallbackLevelUsed = 2;
      }
      if (picked.size < MIN_FOR_YOU_TARGET && supportingCandidates.length > 0) {
        const beforeLevel3 = picked.size;
        for (const cand of supportingCandidates) {
          if (picked.size >= MIN_FOR_YOU_TARGET) break;
          tryAdd(cand, MIN_FOR_YOU_TARGET);
        }
        if (picked.size > beforeLevel3) fallbackLevelUsed = 3;
      }
      if (picked.size < MIN_FOR_YOU_TARGET) {
        const seedSubjects = /* @__PURE__ */ new Set([
          ...primaryBucket.subjects,
          ...supportingBucket.subjects
        ]);
        if (seedSubjects.size > 0) {
          const relatedFamilies = /* @__PURE__ */ new Set();
          for (const subj of seedSubjects) {
            for (const rel of RELATED_SUBJECT_FAMILIES[subj] ?? []) {
              if (!seedSubjects.has(rel)) relatedFamilies.add(rel);
            }
          }
          if (relatedFamilies.size > 0) {
            const level4Cands = catalog.filter(
              (entry) => !picked.has(entry.id) && !pickedUrls.has(entry.url) && relatedFamilies.has(entry.primarySubject)
            ).slice(0, 4);
            if (level4Cands.length > 0) {
              fallbackLevelUsed = 4;
              for (const entry of level4Cands) {
                if (picked.size >= MIN_FOR_YOU_TARGET) break;
                tryAdd(
                  {
                    entry,
                    score: 30,
                    tier: "related",
                    label: "Related discovery",
                    reason: `Closely related topic to complement ${primaryDirection}`
                  },
                  MIN_FOR_YOU_TARGET
                );
              }
            }
          }
        }
      }
    }
    forYou = Array.from(picked.values()).map(
      (item) => toResponseItem(item.entry, {
        matchReason: item.reason,
        relationshipTier: item.tier,
        relationshipLabel: item.label
      })
    );
    if (forYou.length === 0) {
      shortageNote = `No verified catalog resources currently match "${primaryDirection}". Explore related topics or browse the verified library in Discover More.`;
    } else if (forYou.length < MIN_FOR_YOU_TARGET) {
      shortageNote = `Showing ${forYou.length} verified resource${forYou.length === 1 ? "" : "s"} matching "${primaryDirection}". Additional verified matches are limited right now\u2014use Discover More to explore broader subjects.`;
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
      fallbackLevelUsed
    },
    forYou,
    continueLearning,
    all: allItems,
    videos,
    documentation,
    courses
  };
}
async function handleGetExploreResourcesRequest(params) {
  const authHeader = params.authorizationHeader ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return buildExploreResourcesForContext(
      {
        primaryDirection: "",
        learningInterests: [],
        careerGoal: "",
        knowledgeLevel: "Beginner",
        fieldOfStudy: "",
        currentSkills: [],
        activeRoadmapTitle: null,
        roadmapSubjectsText: "",
        knowledgeGaps: [],
        lowScoreSubjects: [],
        recentAssessmentsCount: 0
      },
      false
    );
  }
  const supabase = createUserScopedSupabaseClient(token);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    throw new ExploreResourcesApiError(
      401,
      "INVALID_SESSION",
      "Your session has expired or is invalid. Please sign in again."
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
  const computePromise = (async () => {
    const [profileRes, roadmapRes, attemptsRes, quizRes] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("learning_roadmaps").select("id, title, career_goal, status, roadmap_data").eq("user_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("assessment_attempts").select("subject, difficulty, score_percent, strengths, knowledge_gaps, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("lesson_knowledge_checks").select("lesson_title, knowledge_gaps, score, completed_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(10)
    ]);
    if (profileRes.error && profileRes.error.code === "42501") {
      throw new ExploreResourcesApiError(
        403,
        "RLS_DENIED",
        "Access to student profile was denied."
      );
    }
    const profileRow = profileRes.data ?? {};
    const userMeta = user.user_metadata ?? {};
    const roadmapRow = roadmapRes.data ?? null;
    const roadmapData = roadmapRow?.roadmap_data ?? {};
    const learningInterests = Array.isArray(profileRow.learning_interests) ? profileRow.learning_interests.filter(
      (s) => typeof s === "string" && s.trim().length > 0
    ) : [];
    const dbPrimaryDirection = typeof profileRow.primary_direction === "string" ? profileRow.primary_direction.trim() : "";
    const metaPrimaryDirection = typeof userMeta.primary_direction === "string" ? userMeta.primary_direction.trim() : "";
    const explicitPrimaryDirection = dbPrimaryDirection || metaPrimaryDirection;
    const careerGoal = typeof profileRow.career_goal === "string" ? profileRow.career_goal.trim() : "";
    const knowledgeLevel = profileRow.knowledge_level === "Beginner" || profileRow.knowledge_level === "Intermediate" || profileRow.knowledge_level === "Advanced" ? profileRow.knowledge_level : "Beginner";
    const fieldOfStudy = typeof profileRow.field_of_study === "string" ? profileRow.field_of_study.trim() : "";
    const educationLevel = typeof profileRow.education_level === "string" ? profileRow.education_level.trim() : "";
    const university = typeof profileRow.university === "string" ? profileRow.university.trim() : "";
    const currentSkills = Array.isArray(profileRow.current_skills) ? profileRow.current_skills.filter(
      (s) => typeof s === "string" && s.trim().length > 0
    ) : [];
    const activeRoadmapTitle = roadmapRow && typeof roadmapRow.title === "string" && roadmapRow.title.trim() ? roadmapRow.title.trim() : null;
    const activeRoadmapCareerGoal = roadmapRow && typeof roadmapRow.career_goal === "string" && roadmapRow.career_goal.trim() ? roadmapRow.career_goal.trim() : null;
    const rawStages = Array.isArray(roadmapData.stages) ? roadmapData.stages : [];
    let currentCourseTitle = null;
    let currentLessonTitle = null;
    let currentLessonText = "";
    const roadmapTopics = [];
    if (activeRoadmapTitle) roadmapTopics.push(activeRoadmapTitle);
    if (activeRoadmapCareerGoal) roadmapTopics.push(activeRoadmapCareerGoal);
    for (const sRaw of rawStages) {
      if (!sRaw || typeof sRaw !== "object") continue;
      const s = sRaw;
      const stageTitle = typeof s.title === "string" ? s.title.trim() : "";
      if (stageTitle) roadmapTopics.push(stageTitle);
      const lessons = Array.isArray(s.lessons) ? s.lessons : [];
      for (const lRaw of lessons) {
        if (!lRaw || typeof lRaw !== "object") continue;
        const l = lRaw;
        const lTitle = typeof l.title === "string" ? l.title.trim() : "";
        if (l.completed !== true && lTitle) {
          roadmapTopics.push(lTitle);
          if (!currentLessonTitle) {
            currentCourseTitle = stageTitle || null;
            currentLessonTitle = lTitle;
            const lDesc = typeof l.description === "string" ? l.description.trim() : "";
            const lObj = Array.isArray(l.learningObjectives) ? l.learningObjectives.filter((o) => typeof o === "string").join(" ") : "";
            currentLessonText = [stageTitle, lDesc, lObj].filter(Boolean).join(" ");
          }
        }
      }
    }
    const attemptRows = Array.isArray(attemptsRes.data) ? attemptsRes.data : [];
    const attemptGaps = [];
    const lowScoreSubjects = [];
    for (const row of attemptRows) {
      const r = row;
      const score = Number(r.score_percent);
      if (!Number.isNaN(score) && score < 70 && typeof r.subject === "string") {
        lowScoreSubjects.push(r.subject);
      }
      if (Array.isArray(r.knowledge_gaps)) {
        for (const g of r.knowledge_gaps) {
          if (typeof g === "string" && g.trim()) attemptGaps.push(g.trim());
        }
      }
    }
    const quizRows = !quizRes.error && Array.isArray(quizRes.data) ? quizRes.data : [];
    const quizGaps = [];
    for (const row of quizRows) {
      const r = row;
      if (Array.isArray(r.knowledge_gaps)) {
        for (const g of r.knowledge_gaps) {
          if (typeof g === "string" && g.trim()) quizGaps.push(g.trim());
        }
      }
    }
    const embeddedQuizGaps = Array.isArray(roadmapData.knowledgeCheckAttempts) ? roadmapData.knowledgeCheckAttempts.flatMap((attempt) => {
      const gaps = attempt.knowledgeGaps ?? attempt.knowledge_gaps;
      return Array.isArray(gaps) ? gaps.filter((g) => typeof g === "string" && g.trim().length > 0) : [];
    }) : [];
    const knowledgeGaps = Array.from(
      /* @__PURE__ */ new Set([...quizGaps, ...embeddedQuizGaps, ...attemptGaps])
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
        roadmapSubjectsText: roadmapTopics.join(" "),
        knowledgeGaps,
        lowScoreSubjects,
        recentAssessmentsCount: attemptRows.length + quizRows.length
      },
      true
    );
    exploreResponseCache.set(userId, {
      expiresAt: Date.now() + SERVER_CACHE_TTL_MS,
      payload
    });
    return payload;
  })().finally(() => {
    exploreInFlight.delete(userId);
  });
  exploreInFlight.set(userId, computePromise);
  return computePromise;
}

// server/roadmapGenerator.ts
var RoadmapApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RoadmapApiError";
    this.status = status;
    this.code = code;
  }
};
var inFlightByUser = /* @__PURE__ */ new Map();
var generationHistoryByUser = /* @__PURE__ */ new Map();
var COOLDOWN_MS = 1500;
var WINDOW_MS = 10 * 6e4;
var MAX_GENERATIONS_PER_WINDOW = 15;
function enforceRateLimit(userId) {
  const now = Date.now();
  const timestamps = (generationHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < COOLDOWN_MS) {
    const waitSeconds = Math.ceil((COOLDOWN_MS - (now - lastTs)) / 1e3);
    throw new RoadmapApiError(
      429,
      "RATE_LIMITED_COOLDOWN",
      `Please wait ${waitSeconds} seconds before generating another learning roadmap.`
    );
  }
  if (timestamps.length >= MAX_GENERATIONS_PER_WINDOW) {
    throw new RoadmapApiError(
      429,
      "RATE_LIMITED_WINDOW",
      "You have generated several roadmaps recently. Please wait a few minutes before generating another one."
    );
  }
  generationHistoryByUser.set(userId, timestamps);
}
function recordGenerationTimestamp(userId) {
  const now = Date.now();
  const timestamps = (generationHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );
  timestamps.push(now);
  generationHistoryByUser.set(userId, timestamps);
}
function createUserScopedSupabaseClient2(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new RoadmapApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient2(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}
function sanitizeTextNoUrls(text, fallback = "") {
  if (typeof text !== "string") return fallback;
  const cleaned = text.replace(/https?:\/\/[^\s)]+/gi, "").replace(/\bwww\.[^\s)]+/gi, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || fallback;
}
function sanitizeStringList(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
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
function normalizeDifficulty(value) {
  if (value === "Beginner" || value === "Intermediate" || value === "Advanced") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("adv")) return "Advanced";
    if (lower.includes("beg") || lower.includes("found")) return "Beginner";
  }
  return "Intermediate";
}
function extractKeywords(text) {
  return text.toLowerCase().split(/[^a-z0-9+#]+/).map((token) => token.trim()).filter((token) => token.length >= 2);
}
function analyzeAssessmentsForProfile(attempts, profile) {
  if (attempts.length === 0) {
    return {
      hasAnyAttempts: false,
      hasRelevantAttempts: false,
      sourceAssessmentId: null,
      relevantSubjects: [],
      latestRelevantAttempts: [],
      progressionNotes: []
    };
  }
  const profileKeywords = /* @__PURE__ */ new Set([
    ...extractKeywords(profile.primaryDirection),
    ...extractKeywords(profile.careerGoal),
    ...extractKeywords(profile.fieldOfStudy),
    ...profile.learningInterests.flatMap((item) => extractKeywords(item)),
    ...profile.currentSkills.flatMap((item) => extractKeywords(item))
  ]);
  const bySubject = /* @__PURE__ */ new Map();
  for (const attempt of attempts) {
    const key = attempt.subject.trim();
    if (!key) continue;
    const list = bySubject.get(key) ?? [];
    list.push(attempt);
    bySubject.set(key, list);
  }
  const scoredSubjects = [];
  for (const [subject, subjectAttempts] of bySubject.entries()) {
    const subjectTokens = extractKeywords(subject);
    const isDirectMatch = profileKeywords.size === 0 || subjectTokens.some((tok) => profileKeywords.has(tok)) || Array.from(profileKeywords).some((kw) => subject.toLowerCase().includes(kw));
    scoredSubjects.push({
      subject,
      isDirectMatch,
      latest: subjectAttempts[0],
      all: subjectAttempts
    });
  }
  const directMatches = scoredSubjects.filter((item) => item.isDirectMatch);
  const relevantList = directMatches.length > 0 ? directMatches : scoredSubjects;
  const progressionNotes = [];
  for (const item of relevantList) {
    if (item.all.length >= 2) {
      const newest = item.all[0];
      const oldest = item.all[item.all.length - 1];
      const delta = newest.scorePercent - oldest.scorePercent;
      const trend = delta > 0 ? `improved by +${delta}% (from ${oldest.scorePercent}% to ${newest.scorePercent}%)` : delta < 0 ? `decreased by ${delta}% (from ${oldest.scorePercent}% to ${newest.scorePercent}%)` : `remained steady at ${newest.scorePercent}%`;
      progressionNotes.push(
        `${item.subject}: ${item.all.length} attempts, score ${trend} across ${oldest.createdAt.slice(0, 10)} to ${newest.createdAt.slice(0, 10)}.`
      );
    } else {
      progressionNotes.push(
        `${item.subject}: 1 completed attempt (${item.latest.difficulty}, ${item.latest.scorePercent}% on ${item.latest.createdAt.slice(0, 10)}).`
      );
    }
  }
  const sourceAssessmentId = directMatches.length > 0 ? directMatches[0].latest.id : attempts[0]?.id ?? null;
  return {
    hasAnyAttempts: true,
    hasRelevantAttempts: directMatches.length > 0 || attempts.length > 0,
    sourceAssessmentId,
    relevantSubjects: relevantList.map((item) => item.subject),
    latestRelevantAttempts: relevantList.map((item) => item.latest).slice(0, 6),
    progressionNotes: progressionNotes.slice(0, 6)
  };
}
var ROADMAP_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Concise, motivating roadmap title tailored to the student career goal."
    },
    careerGoal: {
      type: Type.STRING,
      description: "Normalized career goal or learning objective for this roadmap."
    },
    description: {
      type: Type.STRING,
      description: "2-3 sentence overview of what this personalized roadmap builds toward."
    },
    estimatedTotalDuration: {
      type: Type.STRING,
      description: 'Realistic total duration based on preferred daily study hours (e.g. "10 weeks").'
    },
    personalizationExplanation: {
      type: Type.STRING,
      description: "Clear explanation of why these stages were chosen based on the student profile, study hours, and assessment strengths/gaps (or clearly stating it is provisional pending assessments)."
    },
    assessmentValidated: {
      type: Type.BOOLEAN,
      description: "True only if relevant skill assessment results informed this roadmap; false if provisional."
    },
    milestones: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 to 5 clear milestone checkpoints marking progression toward the primary learning direction."
    },
    completionCriteria: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 to 5 measurable completion criteria proving readiness in the primary learning direction."
    },
    stages: {
      type: Type.ARRAY,
      description: "Ordered sequence of 4 to 8 learning stages.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: 'Stable identifier such as "stage-1".'
          },
          title: {
            type: Type.STRING,
            description: "Clear stage title."
          },
          description: {
            type: Type.STRING,
            description: "What the student learns and achieves in this stage."
          },
          learningObjectives: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "2 to 4 measurable learning objectives for this stage."
          },
          estimatedDuration: {
            type: Type.STRING,
            description: 'Estimated time to finish this stage (e.g. "2 weeks").'
          },
          difficulty: {
            type: Type.STRING,
            description: "One of: Beginner, Intermediate, Advanced."
          },
          prerequisites: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Realistic prerequisite concepts or prior stages."
          },
          lessons: {
            type: Type.ARRAY,
            description: "3 to 5 cohesive, non-filler actionable lessons inside this stage (2 to 4 allowed for focused capstone stages).",
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'Stable lesson ID such as "stage-1-lesson-1".'
                },
                title: {
                  type: Type.STRING,
                  description: "Actionable lesson title."
                },
                description: {
                  type: Type.STRING,
                  description: "Brief summary of what the lesson covers."
                },
                estimatedTime: {
                  type: Type.STRING,
                  description: 'Realistic study time (e.g. "45 mins").'
                },
                learningObjectives: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "1 to 3 focused lesson objectives."
                },
                completionCriteria: {
                  type: Type.STRING,
                  description: "Specific measurable criterion to consider this lesson mastered."
                },
                completed: {
                  type: Type.BOOLEAN,
                  description: "Always false for newly generated roadmaps."
                }
              },
              required: ["id", "title", "description", "estimatedTime", "learningObjectives", "completionCriteria", "completed"]
            }
          },
          practiceActivities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "2 to 3 hands-on practice activities suited to the subject domain."
          },
          suggestedMiniProject: {
            type: Type.STRING,
            description: "One concrete, portfolio-worthy mini-project appropriate to the domain."
          },
          milestone: {
            type: Type.STRING,
            description: "One tangible milestone unlocked upon finishing this stage."
          },
          completionCriteria: {
            type: Type.STRING,
            description: "Concrete completion criterion to pass this stage."
          },
          status: {
            type: Type.STRING,
            description: 'Always "upcoming" initially.'
          }
        },
        required: [
          "id",
          "title",
          "description",
          "learningObjectives",
          "estimatedDuration",
          "difficulty",
          "prerequisites",
          "lessons",
          "practiceActivities",
          "suggestedMiniProject",
          "milestone",
          "completionCriteria",
          "status"
        ]
      }
    }
  },
  required: [
    "title",
    "careerGoal",
    "description",
    "estimatedTotalDuration",
    "personalizationExplanation",
    "assessmentValidated",
    "milestones",
    "completionCriteria",
    "stages"
  ]
};
function buildPromptForStudent(profile, analysis) {
  const effectiveGoal = profile.primaryDirection || profile.careerGoal || (profile.learningInterests.length > 0 ? `Skill Mastery in ${profile.learningInterests.slice(0, 2).join(" & ")}` : profile.fieldOfStudy ? `Career Readiness in ${profile.fieldOfStudy}` : "Foundational Career & Technical Skill Development");
  const levelGuidance = profile.knowledgeLevel === "Advanced" ? "- Calibration Rule (Advanced Learner): Do NOT waste early stages on introductory tutorials or basic syntax for their listed skills. Start immediately at Intermediate/Advanced applied architecture, optimization, and capstone-level work unless diagnostic gaps require brief remediation." : profile.knowledgeLevel === "Intermediate" ? "- Calibration Rule (Intermediate Learner): Respect their starting level and existing skills. Skip ultra-basic novice introductions for tools/skills they already know (unless diagnostic assessment gaps show weaknesses there) and start Stage 1 at a practical bridging/Intermediate level leading into deeper specialization." : "- Calibration Rule (Beginner Learner): Start with clean, logically sequenced fundamentals and build progressively toward applied projects.";
  const weeklyHours = Math.max(1, Math.round(profile.preferredHoursPerDay * 7 * 10) / 10);
  const lines = [
    "Design a personalized, comprehensive, realistic learning roadmap for the following student profile (anonymized, no PII):",
    "",
    "=== STUDENT PROFILE ===",
    `- Primary Learning Direction (Core Foundation): ${effectiveGoal}`,
    ...profile.careerGoal && profile.careerGoal.trim().toLowerCase() !== effectiveGoal.trim().toLowerCase() ? [`- Broader Career Goal: ${profile.careerGoal}`] : [],
    `- Education Background: ${profile.educationLevel || "Not specified"}`,
    `- Field of Study: ${profile.fieldOfStudy || "Not specified"}`,
    `- Current Knowledge Level: ${profile.knowledgeLevel}`,
    `- Preferred Study Pace: ${profile.preferredHoursPerDay} hour(s) per day (~${weeklyHours} hours/week)`,
    `- Supporting Learning Interests (secondary context only): ${profile.learningInterests.length > 0 ? profile.learningInterests.join(", ") : "None specified"}`,
    `- Existing Skills (treat carefully alongside assessment evidence): ${profile.currentSkills.length > 0 ? profile.currentSkills.join(", ") : "None listed"}`,
    levelGuidance,
    "",
    "=== SKILL ASSESSMENT EVIDENCE ==="
  ];
  if (!analysis.hasAnyAttempts) {
    lines.push(
      "- Assessment Status: NO skill assessments completed yet.",
      "- Instruction: Set assessmentValidated to false. Generate a provisional roadmap grounded in their primary direction, starting level, existing skills, education background, and study pace, and clearly note in personalizationExplanation that taking a skill assessment will validate and refine future stages."
    );
  } else {
    lines.push(
      `- Assessment Status: ${analysis.latestRelevantAttempts.length} subject(s) assessed.`,
      "- Latest Subject Performance:"
    );
    for (const attempt of analysis.latestRelevantAttempts) {
      lines.push(
        `  * ${attempt.subject} (${attempt.difficulty}, ${attempt.createdAt.slice(0, 10)}): ${attempt.correctAnswers}/${attempt.totalQuestions} (${attempt.scorePercent}%) | Strengths: ${attempt.strengths.length > 0 ? attempt.strengths.join(", ") : "None recorded"} | Knowledge Gaps: ${attempt.knowledgeGaps.length > 0 ? attempt.knowledgeGaps.join(", ") : "None recorded"}`
      );
    }
    if (analysis.progressionNotes.length > 0) {
      lines.push("- Progression Across Attempts:");
      for (const note of analysis.progressionNotes) {
        lines.push(`  * ${note}`);
      }
    }
    lines.push(
      "- Instruction: Set assessmentValidated to true. Prioritize closing recorded knowledge gaps BEFORE advancing into complex topics, even if onboarding skills list advanced buzzwords."
    );
  }
  lines.push(
    "",
    "=== GENERATION REQUIREMENTS ===",
    `- Anchor the entire roadmap strictly around the Primary Learning Direction ("${effectiveGoal}"). Treat supporting interests only as optional context, never replacing the primary direction.`,
    "- Support the exact domain of the student goal (e.g., AI Engineer, Data Analyst, UI/UX Designer, Frontend/Backend/Full-Stack Developer, Cybersecurity, Business/Product/Project Management, Digital Marketing, Finance, GIS, Academic Research, etc.). Do NOT default to Python unless the student goal/interests involve Python or Data/AI.",
    "- Generate between 4 and 8 logically sequenced stages progressing cleanly from their starting point through core domain pillars, applied practice, and portfolio/capstone readiness.",
    "- Each stage must include 3 to 5 focused, distinct lessons (2 to 4 allowed for focused capstone stages), realistic prerequisites referencing prior concepts/stages, 2 to 4 measurable learningObjectives, 2 to 3 domain-authentic practiceActivities, 1 realistic suggestedMiniProject, 1 concrete stage milestone, and 1 measurable completionCriteria.",
    "- Do NOT pad stages with repetitive filler lessons or repeat the same lesson scope across stages.",
    "- Every lesson must include 1 to 3 focused learningObjectives and a specific measurable completionCriteria.",
    "- Include 3 to 5 roadmap-level milestones and 3 to 5 roadmap-level completionCriteria.",
    `- Scale estimatedDuration and estimatedTotalDuration realistically around ~${weeklyHours} hours/week (${profile.preferredHoursPerDay}h/day).`,
    '- Keep all lesson.completed = false and all stage.status = "upcoming".',
    "- Never include URLs, hyperlinks, fake certificate promises, guaranteed employment claims, or promises of automatic mastery from finishing the roadmap."
  );
  return lines.join("\n");
}
function validateAndNormalizeRoadmap(raw, profile, analysis) {
  if (!raw || typeof raw !== "object") {
    throw new RoadmapApiError(
      502,
      "AI_INVALID_RESPONSE",
      "The AI service returned an empty or malformed roadmap structure."
    );
  }
  const obj = raw;
  const rawStages = Array.isArray(obj.stages) ? obj.stages : [];
  if (rawStages.length < 4 || rawStages.length > 8) {
    throw new RoadmapApiError(
      502,
      "AI_STAGE_COUNT_INVALID",
      "The generated roadmap did not contain the expected 4 to 8 stages. Please retry."
    );
  }
  const stages = rawStages.map((stageRaw, sIdx) => {
    const stageObj = stageRaw && typeof stageRaw === "object" ? stageRaw : {};
    const stageNum = sIdx + 1;
    const stableStageId = `stage-${stageNum}`;
    const rawLessons = Array.isArray(stageObj.lessons) ? stageObj.lessons : [];
    if (rawLessons.length === 0) {
      throw new RoadmapApiError(
        502,
        "AI_EMPTY_LESSONS",
        `Stage ${stageNum} did not include lessons. Please retry generation.`
      );
    }
    const lessons = rawLessons.slice(0, 6).map((lessonRaw, lIdx) => {
      const lessonObj = lessonRaw && typeof lessonRaw === "object" ? lessonRaw : {};
      const lessonNum = lIdx + 1;
      const lessonTitle = sanitizeTextNoUrls(
        lessonObj.title,
        `Stage ${stageNum} Lesson ${lessonNum}`
      );
      const lessonDescription = sanitizeTextNoUrls(
        lessonObj.description,
        `Core study module covering ${lessonTitle}.`
      );
      const estimatedTime = sanitizeTextNoUrls(lessonObj.estimatedTime, "45 mins");
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
        learningObjectives: lessonObjectives.length > 0 ? lessonObjectives : [`Understand ${lessonTitle}`],
        completionCriteria: lessonCriteria,
        completed: false
        // Never invent completed lessons
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
      learningObjectives: learningObjectives.length > 0 ? learningObjectives : [`Apply foundational concepts from ${stageTitle}`],
      estimatedDuration: sanitizeTextNoUrls(stageObj.estimatedDuration, "2 weeks"),
      difficulty: normalizeDifficulty(stageObj.difficulty),
      prerequisites,
      lessons,
      practiceActivities: practiceActivities.length > 0 ? practiceActivities : [`Complete hands-on exercises for ${stageTitle}`],
      suggestedMiniProject: sanitizeTextNoUrls(
        stageObj.suggestedMiniProject,
        `Build a practical mini-project demonstrating ${stageTitle}.`
      ),
      milestone: stageMilestone,
      completionCriteria: stageCompletionCriteria,
      status: "upcoming"
      // Always upcoming initially
    };
  });
  const fallbackGoal = profile.primaryDirection || profile.careerGoal || profile.learningInterests[0] || profile.fieldOfStudy || "Personalized Learning Path";
  const assessmentValidated = analysis.hasRelevantAttempts;
  const rawExplanation = sanitizeTextNoUrls(
    obj.personalizationExplanation,
    assessmentValidated ? "This roadmap was tailored to your career goal, daily study pace, and skill assessment performance." : "Provisional roadmap tailored to your primary direction, starting level, and daily study pace. Complete a skill assessment to validate your baseline and refine future recommendations."
  );
  const milestones = sanitizeStringList(obj.milestones, 6);
  const completionCriteria = sanitizeStringList(obj.completionCriteria, 6);
  const resolvedCareerGoal = sanitizeTextNoUrls(obj.careerGoal, fallbackGoal);
  const resolvedPrimaryDirection = profile.primaryDirection || resolvedCareerGoal || fallbackGoal;
  return {
    title: sanitizeTextNoUrls(obj.title, `${fallbackGoal} Roadmap`),
    careerGoal: resolvedCareerGoal,
    primaryDirection: resolvedPrimaryDirection,
    description: sanitizeTextNoUrls(
      obj.description,
      `A personalized ${stages.length}-stage roadmap designed for ${fallbackGoal}.`
    ),
    estimatedTotalDuration: sanitizeTextNoUrls(obj.estimatedTotalDuration, "8\u201312 weeks"),
    personalizationExplanation: rawExplanation,
    assessmentValidated,
    confirmed: false,
    milestones: milestones.length > 0 ? milestones : stages.slice(0, 4).map((s) => s.milestone),
    completionCriteria: completionCriteria.length > 0 ? completionCriteria : [
      `Complete all ${stages.length} stages tailored to ${fallbackGoal}.`,
      "Finish each stage mini-project and pass lesson knowledge checks."
    ],
    stages
  };
}
function stripMarkdownJsonFence(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function mapGeminiError(err) {
  if (err instanceof RoadmapApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "Unknown AI error");
  const lower = rawMessage.toLowerCase();
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid")) {
    return new RoadmapApiError(
      502,
      "GEMINI_CONFIG_ERROR",
      "The AI service key is invalid. Please check GEMINI_API_KEY in Settings > Secrets."
    );
  }
  if (lower.includes("permission_denied") || lower.includes("403")) {
    return new RoadmapApiError(
      502,
      "GEMINI_PERMISSION_DENIED",
      "AI roadmap generation could not be authorized. Please verify GEMINI_API_KEY in Settings > Secrets."
    );
  }
  if (lower.includes("resource_exhausted") || lower.includes("429")) {
    return new RoadmapApiError(
      429,
      "GEMINI_QUOTA_EXCEEDED",
      "The AI service is temporarily busy due to quota limits. Please wait a moment and try again."
    );
  }
  if (err instanceof Error && err.name === "AbortError" || lower.includes("abort") || lower.includes("timeout") || lower.includes("deadline_exceeded") || lower.includes("etimedout")) {
    return new RoadmapApiError(
      504,
      "GEMINI_TIMEOUT",
      "Roadmap generation took too long and timed out. Please try again."
    );
  }
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand") || lower.includes("overloaded") || lower.includes("500") || lower.includes("502") || lower.includes("504") || lower.includes("fetch failed") || lower.includes("econnreset") || lower.includes("enotfound") || lower.includes("network")) {
    return new RoadmapApiError(
      503,
      "GEMINI_SERVICE_UNAVAILABLE",
      "The AI service is temporarily unavailable due to high demand or a network issue. Please try again in a moment."
    );
  }
  if (lower.includes("404") || lower.includes("not_found")) {
    return new RoadmapApiError(
      502,
      "GEMINI_MODEL_UNAVAILABLE",
      "The configured AI model is temporarily unavailable. Please try again shortly."
    );
  }
  return new RoadmapApiError(
    502,
    "GEMINI_GENERATION_FAILED",
    "We could not generate your personalized roadmap right now. Please try again in a moment."
  );
}
async function generateWithGemini(profile, analysis) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new RoadmapApiError(
      503,
      "GEMINI_KEY_MISSING",
      "GEMINI_API_KEY is not configured on the server."
    );
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const systemInstruction = [
    "You are Skillora\u2019s curriculum architect AI for university students, graduates, and young professionals.",
    "Generate realistic, structured, domain-authentic personalized learning roadmaps across ANY discipline (software, AI/data, UI/UX design, business, marketing, finance, product management, languages, etc.).",
    "Strict truthfulness rules:",
    "- Never fabricate URLs, external links, accredited certificates, or guaranteed job/salary outcomes.",
    '- Never invent completed lessons or past achievements; all lessons start with completed=false and stages start with status="upcoming".',
    "- Do not assume self-reported onboarding skills equal mastery when assessment scores are missing or show gaps.",
    "- If assessment gaps exist, explicitly address those fundamentals early before progressing to advanced stages.",
    "- If no assessments have been taken, clearly mark assessmentValidated=false and explain that the roadmap is provisional.",
    "- Return strictly valid JSON conforming to the response schema."
  ].join("\n");
  const prompt = buildPromptForStudent(profile, analysis);
  const attemptModel = async (model, timeoutMs, thinkingLevel) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: ROADMAP_RESPONSE_SCHEMA,
          abortSignal: controller.signal,
          thinkingConfig: { thinkingLevel }
        }
      });
      return (response.text ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  };
  let responseText = "";
  try {
    responseText = await attemptModel("gemini-4-hydrogen", 35e3, ThinkingLevel.LOW);
    if (!responseText) {
      throw new Error("EMPTY_PRIMARY_RESPONSE");
    }
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message.toLowerCase() : "";
    const isPermanent = msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("permission_denied") || msg.includes("invalid_argument") || msg.includes("403");
    if (isPermanent) {
      throw mapGeminiError(primaryErr);
    }
    console.warn(
      "[Skillora][Roadmap] Primary model gemini-4-hydrogen fell back to gemini-3.1-flash-lite:",
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    );
    try {
      responseText = await attemptModel("gemini-3.1-flash-lite", 25e3, ThinkingLevel.MINIMAL);
    } catch (fallbackErr) {
      throw mapGeminiError(fallbackErr);
    }
  }
  if (!responseText) {
    throw new RoadmapApiError(
      502,
      "AI_EMPTY_RESPONSE",
      "The AI service returned an empty roadmap response. Please try again."
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(responseText));
  } catch {
    throw new RoadmapApiError(
      502,
      "AI_JSON_PARSE_ERROR",
      "The AI service returned an unreadable response format. Please try again."
    );
  }
  return validateAndNormalizeRoadmap(parsed, profile, analysis);
}
async function handleGenerateRoadmapRequest(params) {
  const authHeader = params.authorizationHeader?.trim() || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new RoadmapApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with an active Skillora session to generate your roadmap."
    );
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new RoadmapApiError(
      401,
      "INVALID_AUTH_TOKEN",
      "Missing authentication token. Please sign in again."
    );
  }
  const supabase = createUserScopedSupabaseClient2(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new RoadmapApiError(
      401,
      "UNAUTHORIZED",
      "Your session has expired or is invalid. Please sign in again."
    );
  }
  const authenticatedUserId = userData.user.id;
  const existingInFlight = inFlightByUser.get(authenticatedUserId);
  if (existingInFlight) {
    const record = await existingInFlight;
    return { statusCode: 200, record };
  }
  enforceRateLimit(authenticatedUserId);
  const task = (async () => {
    const { data: existingActiveRows, error: activeFetchError } = await supabase.from("learning_roadmaps").select("id").eq("user_id", authenticatedUserId).eq("status", "active");
    if (activeFetchError) {
      throw new RoadmapApiError(
        activeFetchError.code === "42501" ? 403 : 500,
        activeFetchError.code || "ROADMAP_LOOKUP_FAILED",
        activeFetchError.code === "42501" ? "Permission denied while checking your existing roadmaps." : activeFetchError.message || "Could not inspect existing roadmaps."
      );
    }
    const previousActiveIds = (existingActiveRows ?? []).map((row) => row.id).filter((id) => typeof id === "string" && id.length > 0);
    if (previousActiveIds.length > 0 && params.replaceActive !== true) {
      throw new RoadmapApiError(
        409,
        "ACTIVE_ROADMAP_EXISTS",
        "You already have an active learning roadmap. Please confirm before regenerating and archiving your current plan."
      );
    }
    const [profileResult, attemptsResult] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("id", authenticatedUserId).maybeSingle(),
      supabase.from("assessment_attempts").select(
        "id, subject, difficulty, total_questions, correct_answers, score_percent, strengths, knowledge_gaps, created_at"
      ).eq("user_id", authenticatedUserId).order("created_at", { ascending: false }).limit(25)
    ]);
    if (profileResult.error) {
      throw new RoadmapApiError(
        profileResult.error.code === "42501" ? 403 : 500,
        profileResult.error.code || "PROFILE_FETCH_FAILED",
        "Could not load your student profile for roadmap personalization."
      );
    }
    if (attemptsResult.error) {
      throw new RoadmapApiError(
        attemptsResult.error.code === "42501" ? 403 : 500,
        attemptsResult.error.code || "ATTEMPTS_FETCH_FAILED",
        "Could not load your assessment history for roadmap personalization."
      );
    }
    const profileRow = profileResult.data ?? {};
    const userMeta = userData.user.user_metadata ?? {};
    const dbPrimary = typeof profileRow.primary_direction === "string" ? profileRow.primary_direction.trim() : "";
    const metaPrimary = typeof userMeta.primary_direction === "string" ? userMeta.primary_direction.trim() : "";
    const primaryDirection = dbPrimary || metaPrimary;
    const rawHours = Number(profileRow.preferred_hours_per_day);
    const preferredHoursPerDay = Number.isFinite(rawHours) && rawHours > 0 ? Math.min(16, rawHours) : 2;
    const sanitizedProfile = {
      primaryDirection,
      careerGoal: typeof profileRow.career_goal === "string" ? profileRow.career_goal.trim() : "",
      educationLevel: typeof profileRow.education_level === "string" ? profileRow.education_level.trim() : typeof userMeta.education_level === "string" ? userMeta.education_level.trim() : "",
      fieldOfStudy: typeof profileRow.field_of_study === "string" ? profileRow.field_of_study.trim() : "",
      knowledgeLevel: normalizeDifficulty(profileRow.knowledge_level),
      preferredHoursPerDay,
      currentSkills: parseStringArray(profileRow.current_skills),
      learningInterests: parseStringArray(profileRow.learning_interests)
    };
    const attempts = (attemptsResult.data ?? []).map((row) => {
      const r = row;
      const totalQ = Number(r.total_questions) || 0;
      const correctA = Number(r.correct_answers) || 0;
      const rawScore = Number(r.score_percent);
      const scorePercent = Number.isFinite(rawScore) ? Math.round(rawScore) : totalQ > 0 ? Math.round(correctA / totalQ * 100) : 0;
      return {
        id: typeof r.id === "string" ? r.id : String(r.id ?? ""),
        subject: typeof r.subject === "string" ? r.subject : "Assessment",
        difficulty: normalizeDifficulty(r.difficulty),
        totalQuestions: totalQ,
        correctAnswers: correctA,
        scorePercent,
        strengths: parseStringArray(r.strengths),
        knowledgeGaps: parseStringArray(r.knowledge_gaps),
        createdAt: typeof r.created_at === "string" ? r.created_at : (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    const assessmentAnalysis = analyzeAssessmentsForProfile(attempts, sanitizedProfile);
    const roadmapData = await generateWithGemini(sanitizedProfile, assessmentAnalysis);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const insertPayload = {
      user_id: authenticatedUserId,
      title: roadmapData.title,
      career_goal: roadmapData.careerGoal,
      description: roadmapData.description,
      source_assessment_id: assessmentAnalysis.sourceAssessmentId,
      roadmap_data: roadmapData,
      status: "active",
      updated_at: nowIso
    };
    const { data: insertedRow, error: insertError } = await supabase.from("learning_roadmaps").insert(insertPayload).select("*").single();
    if (insertError || !insertedRow) {
      throw new RoadmapApiError(
        insertError?.code === "42501" ? 403 : 500,
        insertError?.code || "ROADMAP_INSERT_FAILED",
        insertError?.code === "42501" ? "Permission denied while saving your generated roadmap to Supabase." : insertError?.message || "Failed to save your generated roadmap."
      );
    }
    if (previousActiveIds.length > 0) {
      const { error: archiveError } = await supabase.from("learning_roadmaps").update({ status: "archived", updated_at: nowIso }).eq("user_id", authenticatedUserId).in("id", previousActiveIds);
      if (archiveError) {
        console.warn(
          "[Skillora] New roadmap created, but archiving previous active roadmap failed:",
          archiveError.message
        );
      }
    }
    recordGenerationTimestamp(authenticatedUserId);
    invalidateExploreResourcesServerCache(authenticatedUserId);
    return insertedRow;
  })();
  inFlightByUser.set(authenticatedUserId, task);
  try {
    const record = await task;
    return { statusCode: 201, record };
  } finally {
    inFlightByUser.delete(authenticatedUserId);
  }
}

// server/lessonGenerator.ts
import { GoogleGenAI as GoogleGenAI2, ThinkingLevel as ThinkingLevel2, Type as Type2 } from "@google/genai";
import { createClient as createClient3 } from "@supabase/supabase-js";
var LessonApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "LessonApiError";
    this.status = status;
    this.code = code;
  }
};
var inFlightLessonRequests = /* @__PURE__ */ new Map();
var inFlightCourseResources = /* @__PURE__ */ new Map();
var serverLessonCache = /* @__PURE__ */ new Map();
var courseResourcesCache = /* @__PURE__ */ new Map();
var SERVER_LESSON_CACHE_TTL_MS = 1e3 * 60 * 60 * 2;
var MAX_SERVER_LESSON_CACHE_ENTRIES = 250;
var COURSE_RESOURCES_CACHE_TTL_MS = 1e3 * 60 * 30;
var lessonHistoryByUser = /* @__PURE__ */ new Map();
var clarifyHistoryByUser = /* @__PURE__ */ new Map();
var LESSON_COOLDOWN_MS = 1200;
var LESSON_WINDOW_MS = 10 * 6e4;
var MAX_LESSONS_PER_WINDOW = 35;
var CLARIFY_COOLDOWN_MS = 2e3;
var CLARIFY_WINDOW_MS = 10 * 6e4;
var MAX_CLARIFIES_PER_WINDOW = 30;
var PRIMARY_LESSON_MODEL = "gemini-4-hydrogen";
var FALLBACK_LESSON_MODEL = "gemini-3.1-flash-lite";
var PRIMARY_LESSON_TIMEOUT_MS = 32e3;
var FALLBACK_LESSON_TIMEOUT_MS = 24e3;
var CURRENT_LESSON_CONTENT_VERSION = 2;
function getCachedServerLesson(cacheKey) {
  const hit = serverLessonCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    serverLessonCache.delete(cacheKey);
    return null;
  }
  serverLessonCache.delete(cacheKey);
  serverLessonCache.set(cacheKey, hit);
  return hit.content;
}
function setCachedServerLesson(cacheKey, content) {
  if (serverLessonCache.has(cacheKey)) {
    serverLessonCache.delete(cacheKey);
  }
  while (serverLessonCache.size >= MAX_SERVER_LESSON_CACHE_ENTRIES) {
    const oldestKey = serverLessonCache.keys().next().value;
    if (!oldestKey) break;
    serverLessonCache.delete(oldestKey);
  }
  serverLessonCache.set(cacheKey, {
    expiresAt: Date.now() + SERVER_LESSON_CACHE_TTL_MS,
    content
  });
}
async function generateJsonWithTimeoutAndFallback(params) {
  const attemptModel = async (model, timeoutMs, useLowThinking) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await params.ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
          abortSignal: controller.signal,
          ...useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel2.LOW } } : {}
        }
      });
      return (response.text ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const primaryText = await attemptModel(PRIMARY_LESSON_MODEL, PRIMARY_LESSON_TIMEOUT_MS, true);
    if (primaryText) return primaryText;
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const isAuthOrKeyFatal = msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("permission_denied") || msg.includes("invalid_argument") || msg.includes("403");
    if (isAuthOrKeyFatal) {
      throw err;
    }
  }
  return attemptModel(FALLBACK_LESSON_MODEL, FALLBACK_LESSON_TIMEOUT_MS, false);
}
function enforceSlidingRateLimit(historyMap, userId, cooldownMs, windowMs, maxCount, actionLabel) {
  const now = Date.now();
  const timestamps = (historyMap.get(userId) ?? []).filter(
    (ts) => now - ts < windowMs
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (now - lastTs)) / 1e3);
    throw new LessonApiError(
      429,
      "RATE_LIMITED_COOLDOWN",
      `Please wait ${waitSeconds}s before requesting another ${actionLabel}.`
    );
  }
  if (timestamps.length >= maxCount) {
    throw new LessonApiError(
      429,
      "RATE_LIMITED_WINDOW",
      `You have made many ${actionLabel} requests recently. Please wait a few minutes and try again.`
    );
  }
  historyMap.set(userId, timestamps);
}
function recordHistory(historyMap, userId, windowMs) {
  const now = Date.now();
  const timestamps = (historyMap.get(userId) ?? []).filter(
    (ts) => now - ts < windowMs
  );
  timestamps.push(now);
  historyMap.set(userId, timestamps);
}
function createUserScopedSupabaseClient3(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new LessonApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient3(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function sanitizeTextNoUrls2(text, fallback = "") {
  if (typeof text !== "string") return fallback;
  const cleaned = text.replace(/https?:\/\/[^\s)]+/gi, "").replace(/\bwww\.[^\s)]+/gi, "").replace(/\s+\n/g, "\n").trim();
  return cleaned || fallback;
}
function parseStringArray2(value, maxItems = 6) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const cleaned = sanitizeTextNoUrls2(item);
    if (cleaned) result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
}
function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new LessonApiError(
      503,
      "GEMINI_KEY_MISSING",
      "GEMINI_API_KEY is not configured on the server."
    );
  }
  return new GoogleGenAI2({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function stripMarkdownJsonFence2(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function mapGeminiError2(err) {
  if (err instanceof LessonApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "Unknown AI error");
  const lower = rawMessage.toLowerCase();
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid")) {
    return new LessonApiError(
      502,
      "GEMINI_CONFIG_ERROR",
      "The AI service key is invalid. Please check GEMINI_API_KEY in Settings > Secrets."
    );
  }
  if (lower.includes("permission_denied") || lower.includes("403")) {
    return new LessonApiError(
      502,
      "GEMINI_PERMISSION_DENIED",
      "AI lesson generation could not be authorized. Please verify GEMINI_API_KEY in Settings > Secrets."
    );
  }
  if (lower.includes("resource_exhausted") || lower.includes("429")) {
    return new LessonApiError(
      429,
      "GEMINI_QUOTA_EXCEEDED",
      "The AI service is temporarily busy due to quota limits. Please wait a moment and try again."
    );
  }
  if (err instanceof Error && err.name === "AbortError" || lower.includes("abort") || lower.includes("timeout") || lower.includes("deadline_exceeded") || lower.includes("etimedout")) {
    return new LessonApiError(
      504,
      "GEMINI_TIMEOUT",
      "Lesson generation took too long and timed out. Please retry."
    );
  }
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand") || lower.includes("overloaded") || lower.includes("500") || lower.includes("502") || lower.includes("504") || lower.includes("fetch failed") || lower.includes("econnreset") || lower.includes("enotfound") || lower.includes("network")) {
    return new LessonApiError(
      503,
      "GEMINI_SERVICE_UNAVAILABLE",
      "The AI service is temporarily unavailable due to high demand or a network issue. Please try again in a moment."
    );
  }
  if (lower.includes("404") || lower.includes("not_found")) {
    return new LessonApiError(
      502,
      "GEMINI_MODEL_UNAVAILABLE",
      "The configured AI model is temporarily unavailable. Please try again shortly."
    );
  }
  return new LessonApiError(
    502,
    "GEMINI_GENERATION_FAILED",
    "We could not generate the lesson content right now. Please try again."
  );
}
var LESSON_RESPONSE_SCHEMA = {
  type: Type2.OBJECT,
  properties: {
    isProgrammingTopic: {
      type: Type2.BOOLEAN,
      description: "True if the lesson involves programming/SQL/technical code; false otherwise."
    },
    overview: {
      type: Type2.STRING,
      description: "Clear 2-3 sentence introduction explaining the lesson learning objective and why it matters."
    },
    personalizationNote: {
      type: Type2.STRING,
      description: "1-2 sentences connecting this lesson to the student career goal, level, or assessment knowledge gaps."
    },
    prerequisites: {
      type: Type2.ARRAY,
      items: { type: Type2.STRING },
      description: "2 to 3 specific prerequisite concepts helpful before starting this lesson."
    },
    completionCriteria: {
      type: Type2.STRING,
      description: "Specific, measurable completion criterion confirming mastery of this lesson."
    },
    keyTakeaways: {
      type: Type2.ARRAY,
      items: { type: Type2.STRING },
      description: "3 to 5 crisp key takeaways."
    },
    learnSteps: {
      type: Type2.ARRAY,
      description: "4 to 6 substantive, domain-accurate step-by-step teaching sections.",
      items: {
        type: Type2.OBJECT,
        properties: {
          stepNumber: { type: Type2.INTEGER },
          title: { type: Type2.STRING },
          explanation: {
            type: Type2.STRING,
            description: "Substantive, well-structured explanation (4-5 sentences) teaching concepts clearly with zero fluff."
          },
          keyPoint: {
            type: Type2.STRING,
            description: "One memorable rule of thumb or core insight for this step."
          }
        },
        required: ["stepNumber", "title", "explanation", "keyPoint"]
      }
    },
    examples: {
      type: Type2.ARRAY,
      description: "2 to 3 step-by-step worked examples illustrating how to apply the lesson concepts.",
      items: {
        type: Type2.OBJECT,
        properties: {
          title: { type: Type2.STRING },
          context: { type: Type2.STRING, description: "When and why this example applies in real work." },
          explanation: { type: Type2.STRING, description: "Step-by-step walkthrough of how the worked example works." },
          codeSnippet: {
            type: Type2.STRING,
            description: "Clean runnable code snippet if programming/technical; empty string if non-programming."
          },
          language: {
            type: Type2.STRING,
            description: "Programming language name (e.g. python, javascript, sql) or empty string."
          },
          expectedOutput: {
            type: Type2.STRING,
            description: "Expected output or concrete real-world result."
          }
        },
        required: ["title", "context", "explanation"]
      }
    },
    practicalApplications: {
      type: Type2.ARRAY,
      items: { type: Type2.STRING },
      description: "2 to 4 concrete real-world applications or workplace use cases for these concepts."
    },
    keyTerminology: {
      type: Type2.ARRAY,
      description: "3 to 5 essential terms or concepts defined clearly for this lesson.",
      items: {
        type: Type2.OBJECT,
        properties: {
          term: { type: Type2.STRING },
          definition: { type: Type2.STRING }
        },
        required: ["term", "definition"]
      }
    },
    commonMistakes: {
      type: Type2.ARRAY,
      description: "2 to 4 common student mistakes or misconceptions and how to avoid them.",
      items: {
        type: Type2.OBJECT,
        properties: {
          mistake: { type: Type2.STRING },
          howToAvoid: { type: Type2.STRING }
        },
        required: ["mistake", "howToAvoid"]
      }
    },
    summary: {
      type: Type2.STRING,
      description: "2-3 sentence synthesis summarizing what the student learned and can now apply."
    },
    whatToLearnNext: {
      type: Type2.STRING,
      description: "1-2 sentence guidance explaining what to study next and how this lesson bridges forward."
    },
    guidedExercises: {
      type: Type2.ARRAY,
      description: "1 to 2 substantive domain-authentic hands-on tasks with clear steps and expected outcomes.",
      items: {
        type: Type2.OBJECT,
        properties: {
          title: { type: Type2.STRING },
          prompt: { type: Type2.STRING, description: "Clear task prompt for the student." },
          steps: {
            type: Type2.ARRAY,
            items: { type: Type2.STRING },
            description: "3 to 5 actionable steps to complete the task."
          },
          expectedOutcome: {
            type: Type2.STRING,
            description: "What a strong completed deliverable or output should look like."
          },
          hint: {
            type: Type2.STRING,
            description: "A helpful hint without giving away the entire answer."
          }
        },
        required: ["title", "prompt", "steps", "expectedOutcome", "hint"]
      }
    },
    practiceQuestions: {
      type: Type2.ARRAY,
      description: "3 to 5 multiple-choice knowledge check questions strictly testing the generated lesson material.",
      items: {
        type: Type2.OBJECT,
        properties: {
          id: { type: Type2.STRING },
          question: { type: Type2.STRING },
          options: {
            type: Type2.ARRAY,
            items: { type: Type2.STRING },
            description: "Exactly 4 clear answer choices."
          },
          correctAnswerIndex: {
            type: Type2.INTEGER,
            description: "Zero-based index (0 to 3) of the correct option."
          },
          explanation: {
            type: Type2.STRING,
            description: "Clear explanation of why the correct option is right and common pitfalls."
          }
        },
        required: ["id", "question", "options", "correctAnswerIndex", "explanation"]
      }
    }
  },
  required: [
    "isProgrammingTopic",
    "overview",
    "personalizationNote",
    "prerequisites",
    "completionCriteria",
    "keyTakeaways",
    "learnSteps",
    "examples",
    "practicalApplications",
    "keyTerminology",
    "commonMistakes",
    "summary",
    "whatToLearnNext",
    "guidedExercises",
    "practiceQuestions"
  ]
};
async function fetchVerifiedUserAndContext(params) {
  const authHeader = params.authorizationHeader?.trim() || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new LessonApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with an active Skillora session to study lessons."
    );
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new LessonApiError(
      401,
      "INVALID_AUTH_TOKEN",
      "Missing authentication token. Please sign in again."
    );
  }
  const supabase = createUserScopedSupabaseClient3(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new LessonApiError(
      401,
      "UNAUTHORIZED",
      "Your session has expired or is invalid. Please sign in again."
    );
  }
  const userId = userData.user.id;
  const [roadmapResult, profileResult, attemptsResult, quizGapsResult] = await Promise.all([
    supabase.from("learning_roadmaps").select("id, title, career_goal, roadmap_data").eq("id", params.roadmapId).eq("user_id", userId).maybeSingle(),
    supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("assessment_attempts").select("subject, difficulty, score_percent, strengths, knowledge_gaps, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("lesson_knowledge_checks").select("lesson_title, knowledge_gaps, score, completed_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(8)
  ]);
  if (roadmapResult.error) {
    throw new LessonApiError(
      roadmapResult.error.code === "42501" ? 403 : 500,
      roadmapResult.error.code || "ROADMAP_FETCH_FAILED",
      "Could not load your roadmap from Supabase."
    );
  }
  if (!roadmapResult.data) {
    throw new LessonApiError(
      404,
      "ROADMAP_NOT_FOUND",
      "The selected learning roadmap could not be found."
    );
  }
  const roadmapRow = roadmapResult.data;
  const roadmapData = roadmapRow.roadmap_data ?? {};
  const stages = Array.isArray(roadmapData.stages) ? roadmapData.stages : [];
  const stage = stages.find((s) => s.id === params.stageId);
  if (!stage) {
    throw new LessonApiError(404, "STAGE_NOT_FOUND", "The selected stage was not found in this roadmap.");
  }
  const lessons = Array.isArray(stage.lessons) ? stage.lessons : [];
  const lesson = lessons.find((l) => l.id === params.lessonId);
  if (!lesson) {
    throw new LessonApiError(404, "LESSON_NOT_FOUND", "The selected lesson was not found in this stage.");
  }
  const profileRow = profileResult.data ?? {};
  const userMeta = userData.user.user_metadata ?? {};
  const dbPrimary = typeof profileRow.primary_direction === "string" ? profileRow.primary_direction.trim() : "";
  const metaPrimary = typeof userMeta.primary_direction === "string" ? userMeta.primary_direction.trim() : "";
  const primaryDirection = dbPrimary || metaPrimary;
  const careerGoal = typeof roadmapRow.career_goal === "string" && roadmapRow.career_goal.trim() || primaryDirection || typeof profileRow.career_goal === "string" && profileRow.career_goal.trim() || "Career Skill Mastery";
  const knowledgeLevel = profileRow.knowledge_level === "Beginner" || profileRow.knowledge_level === "Intermediate" || profileRow.knowledge_level === "Advanced" ? profileRow.knowledge_level : "Beginner";
  const fieldOfStudy = typeof profileRow.field_of_study === "string" ? profileRow.field_of_study.trim() : "";
  const currentSkills = Array.isArray(profileRow.current_skills) ? profileRow.current_skills.filter((s) => typeof s === "string") : [];
  const learningInterests = Array.isArray(profileRow.learning_interests) ? profileRow.learning_interests.filter((s) => typeof s === "string") : [];
  const attemptSummaries = (attemptsResult.data ?? []).map((row) => {
    const r = row;
    const strengths = Array.isArray(r.strengths) ? r.strengths.filter((s) => typeof s === "string") : [];
    const gaps = Array.isArray(r.knowledge_gaps) ? r.knowledge_gaps.filter((s) => typeof s === "string") : [];
    return {
      subject: typeof r.subject === "string" ? r.subject : "Assessment",
      difficulty: typeof r.difficulty === "string" ? r.difficulty : "Intermediate",
      scorePercent: Number(r.score_percent) || 0,
      strengths,
      gaps
    };
  });
  const tableQuizGaps = !quizGapsResult.error && Array.isArray(quizGapsResult.data) ? quizGapsResult.data.flatMap((row) => {
    const gaps = row.knowledge_gaps;
    return Array.isArray(gaps) ? gaps.filter((g) => typeof g === "string") : [];
  }) : [];
  const fallbackQuizGaps = Array.isArray(roadmapData.knowledgeCheckAttempts) ? roadmapData.knowledgeCheckAttempts.flatMap((attempt) => {
    const gaps = attempt.knowledgeGaps ?? attempt.knowledge_gaps;
    return Array.isArray(gaps) ? gaps.filter((g) => typeof g === "string") : [];
  }) : [];
  const allKnowledgeGaps = Array.from(
    new Set([
      ...tableQuizGaps,
      ...fallbackQuizGaps,
      ...attemptSummaries.flatMap((a) => a.gaps)
    ].filter(Boolean))
  ).slice(0, 10);
  const siblingLessonTitles = lessons.filter((l) => l.id !== params.lessonId && typeof l.title === "string").map((l) => String(l.title).trim()).filter(Boolean);
  const flatLessons = [];
  for (const s of stages) {
    const stTitle = typeof s.title === "string" ? s.title : "Learning Stage";
    const stLessons = Array.isArray(s.lessons) ? s.lessons : [];
    for (const l of stLessons) {
      flatLessons.push({
        stageTitle: stTitle,
        lessonId: typeof l.id === "string" ? l.id : "",
        lessonTitle: typeof l.title === "string" ? l.title : "Lesson"
      });
    }
  }
  const currentFlatIndex = flatLessons.findIndex((item) => item.lessonId === params.lessonId);
  const nextFlatItem = currentFlatIndex >= 0 && currentFlatIndex < flatLessons.length - 1 ? flatLessons[currentFlatIndex + 1] : null;
  const generatedLessonsMap = roadmapData.generatedLessons && typeof roadmapData.generatedLessons === "object" && !Array.isArray(roadmapData.generatedLessons) ? roadmapData.generatedLessons : {};
  const persistedLesson = generatedLessonsMap[params.lessonId] ?? null;
  return {
    supabase,
    userId,
    roadmapId: String(roadmapRow.id),
    persistedLesson,
    careerGoal,
    knowledgeLevel,
    fieldOfStudy,
    currentSkills,
    learningInterests,
    attemptSummaries: attemptSummaries.slice(0, 5),
    allKnowledgeGaps,
    stageTitle: typeof stage.title === "string" ? stage.title : "Learning Stage",
    stageId: params.stageId,
    lessonId: params.lessonId,
    stageDifficulty: typeof stage.difficulty === "string" ? stage.difficulty : knowledgeLevel,
    stagePrerequisites: Array.isArray(stage.prerequisites) ? stage.prerequisites.filter((p) => typeof p === "string") : [],
    lessonTitle: typeof lesson.title === "string" ? lesson.title : "Lesson",
    lessonDescription: typeof lesson.description === "string" ? lesson.description : "",
    lessonEstimatedTime: typeof lesson.estimatedTime === "string" ? lesson.estimatedTime : "45 mins",
    lessonObjectives: Array.isArray(lesson.learningObjectives) ? lesson.learningObjectives.filter((o) => typeof o === "string") : [],
    lessonCompletionCriteria: typeof lesson.completionCriteria === "string" ? lesson.completionCriteria.trim() : "",
    siblingLessonTitles,
    nextLessonTitle: nextFlatItem?.lessonTitle,
    nextLessonStageTitle: nextFlatItem?.stageTitle
  };
}
async function persistGeneratedLessonToRoadmap(params) {
  try {
    const { data, error } = await params.supabase.from("learning_roadmaps").select("roadmap_data").eq("id", params.roadmapId).eq("user_id", params.userId).maybeSingle();
    if (error || !data) return;
    const currentData = data.roadmap_data ?? {};
    const existingMap = currentData.generatedLessons && typeof currentData.generatedLessons === "object" && !Array.isArray(currentData.generatedLessons) ? currentData.generatedLessons : {};
    const updatedRoadmapData = {
      ...currentData,
      generatedLessons: {
        ...existingMap,
        [params.lessonId]: params.content
      }
    };
    await params.supabase.from("learning_roadmaps").update({
      roadmap_data: updatedRoadmapData,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", params.roadmapId).eq("user_id", params.userId);
  } catch (err) {
    console.warn(
      "[Skillora][Lesson] Non-fatal error persisting lesson to Supabase:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
async function validateAndNormalizeLessonContent(raw, ctx, precomputedTrustedResources) {
  if (!raw || typeof raw !== "object") {
    throw new LessonApiError(
      502,
      "AI_INVALID_LESSON",
      "The AI service returned an unreadable lesson structure. Please try again."
    );
  }
  const obj = raw;
  const rawSteps = Array.isArray(obj.learnSteps) ? obj.learnSteps : [];
  if (rawSteps.length < 2) {
    throw new LessonApiError(
      502,
      "AI_INCOMPLETE_LESSON",
      "Generated lesson explanations were too brief. Please try again."
    );
  }
  const learnSteps = rawSteps.slice(0, 6).map((sRaw, idx) => {
    const s = sRaw && typeof sRaw === "object" ? sRaw : {};
    return {
      stepNumber: idx + 1,
      title: sanitizeTextNoUrls2(s.title, `Step ${idx + 1}`),
      explanation: sanitizeTextNoUrls2(
        s.explanation,
        `Core explanation for ${ctx.lessonTitle}.`
      ),
      keyPoint: sanitizeTextNoUrls2(s.keyPoint, "Focus on understanding the underlying principle.")
    };
  });
  const rawExamples = Array.isArray(obj.examples) ? obj.examples : [];
  const examples = rawExamples.slice(0, 3).map((eRaw, idx) => {
    const e = eRaw && typeof eRaw === "object" ? eRaw : {};
    const codeSnippet = typeof e.codeSnippet === "string" && e.codeSnippet.trim() ? e.codeSnippet.trim() : void 0;
    const language = codeSnippet && typeof e.language === "string" && e.language.trim() ? e.language.trim().toLowerCase() : void 0;
    const expectedOutput = sanitizeTextNoUrls2(e.expectedOutput);
    return {
      title: sanitizeTextNoUrls2(e.title, `Example ${idx + 1}`),
      context: sanitizeTextNoUrls2(e.context, "Practical application context."),
      explanation: sanitizeTextNoUrls2(e.explanation, "Step-by-step walkthrough."),
      codeSnippet,
      language,
      expectedOutput: expectedOutput || void 0
    };
  });
  const rawExercises = Array.isArray(obj.guidedExercises) ? obj.guidedExercises : [];
  const guidedExercises = rawExercises.slice(0, 2).map((gRaw, idx) => {
    const g = gRaw && typeof gRaw === "object" ? gRaw : {};
    const steps = parseStringArray2(g.steps, 5);
    return {
      title: sanitizeTextNoUrls2(g.title, `Guided Exercise ${idx + 1}`),
      prompt: sanitizeTextNoUrls2(g.prompt, `Apply ${ctx.lessonTitle} in a focused practice task.`),
      steps: steps.length > 0 ? steps : [
        "Review the lesson concepts and examples.",
        "Draft your solution step by step.",
        "Compare your result against the expected outcome."
      ],
      expectedOutcome: sanitizeTextNoUrls2(
        g.expectedOutcome,
        "A clear, accurate solution aligned with the lesson learning objectives."
      ),
      hint: sanitizeTextNoUrls2(
        g.hint,
        "Revisit the key points in the Learn tab before finalizing your approach."
      )
    };
  });
  const rawQuestions = Array.isArray(obj.practiceQuestions) ? obj.practiceQuestions : [];
  if (rawQuestions.length < 3) {
    throw new LessonApiError(
      502,
      "AI_INCOMPLETE_QUIZ",
      "Generated practice questions were incomplete. Please retry."
    );
  }
  const practiceQuestions = rawQuestions.slice(0, 5).map((qRaw, idx) => {
    const q = qRaw && typeof qRaw === "object" ? qRaw : {};
    const options = parseStringArray2(q.options, 4);
    const normalizedOptions = options.length >= 2 ? options : ["Concept A", "Concept B", "Concept C", "Concept D"];
    const rawCorrect = Number(q.correctAnswerIndex);
    const correctAnswerIndex = Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < normalizedOptions.length ? rawCorrect : 0;
    return {
      id: `${ctx.lessonId}-q-${idx + 1}`,
      question: sanitizeTextNoUrls2(q.question, `Knowledge check question ${idx + 1}`),
      options: normalizedOptions,
      correctAnswerIndex,
      explanation: sanitizeTextNoUrls2(
        q.explanation,
        "Review the Learn section to verify how this concept works."
      )
    };
  });
  const trustedResources = precomputedTrustedResources ?? await matchTrustedResourcesForLesson({
    lessonTitle: ctx.lessonTitle,
    lessonDescription: ctx.lessonDescription,
    learningObjectives: ctx.lessonObjectives,
    stageTitle: ctx.stageTitle,
    careerGoal: ctx.careerGoal,
    knowledgeLevel: ctx.knowledgeLevel,
    knowledgeGaps: ctx.allKnowledgeGaps,
    learningInterests: ctx.learningInterests,
    currentSkills: ctx.currentSkills,
    preferredLanguage: "en"
  });
  const verifiedResources = [
    ...trustedResources.tutorials,
    ...trustedResources.practice,
    ...trustedResources.videos
  ].map((item) => ({
    id: item.id,
    title: item.title,
    provider: item.provider,
    type: item.type,
    url: item.url,
    description: item.description
  }));
  const keyTakeaways = parseStringArray2(obj.keyTakeaways, 5);
  const prerequisites = parseStringArray2(obj.prerequisites, 4);
  const practicalApplications = parseStringArray2(obj.practicalApplications, 4);
  const rawTerms = Array.isArray(obj.keyTerminology) ? obj.keyTerminology : [];
  const keyTerminology = rawTerms.slice(0, 6).map((tRaw) => {
    const t = tRaw && typeof tRaw === "object" ? tRaw : {};
    return {
      term: sanitizeTextNoUrls2(t.term),
      definition: sanitizeTextNoUrls2(t.definition)
    };
  }).filter((item) => Boolean(item.term && item.definition));
  const rawMistakes = Array.isArray(obj.commonMistakes) ? obj.commonMistakes : [];
  const commonMistakes = rawMistakes.slice(0, 4).map((mRaw) => {
    const m = mRaw && typeof mRaw === "object" ? mRaw : {};
    return {
      mistake: sanitizeTextNoUrls2(m.mistake),
      howToAvoid: sanitizeTextNoUrls2(m.howToAvoid)
    };
  }).filter((item) => Boolean(item.mistake && item.howToAvoid));
  const summary = sanitizeTextNoUrls2(
    obj.summary,
    `In this lesson on ${ctx.lessonTitle}, you explored core concepts, worked examples, and practical execution strategies tailored to ${ctx.careerGoal}.`
  );
  const defaultNext = ctx.nextLessonTitle ? `Next, continue to "${ctx.nextLessonTitle}"${ctx.nextLessonStageTitle && ctx.nextLessonStageTitle !== ctx.stageTitle ? ` (${ctx.nextLessonStageTitle})` : ""} to build on these foundations.` : `Review your Knowledge Check results and apply ${ctx.lessonTitle} in your stage mini-project.`;
  const whatToLearnNext = sanitizeTextNoUrls2(obj.whatToLearnNext, defaultNext);
  return {
    contentVersion: CURRENT_LESSON_CONTENT_VERSION,
    roadmapId: ctx.roadmapId,
    stageId: String(ctx.stageId),
    lessonId: String(ctx.lessonId),
    lessonTitle: ctx.lessonTitle,
    stageTitle: ctx.stageTitle,
    isProgrammingTopic: obj.isProgrammingTopic === true,
    overview: sanitizeTextNoUrls2(
      obj.overview,
      ctx.lessonDescription || `Focused study module on ${ctx.lessonTitle}.`
    ),
    personalizationNote: sanitizeTextNoUrls2(
      obj.personalizationNote,
      `Tailored to your ${ctx.knowledgeLevel} level and goal: ${ctx.careerGoal}.`
    ),
    prerequisites: prerequisites.length > 0 ? prerequisites : ctx.stagePrerequisites.length > 0 ? ctx.stagePrerequisites.slice(0, 3) : [`Core familiarity with ${ctx.stageTitle} foundations`],
    completionCriteria: sanitizeTextNoUrls2(
      obj.completionCriteria,
      ctx.lessonCompletionCriteria || `Complete the guided practice task and pass the ${ctx.lessonTitle} Knowledge Check.`
    ),
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : ctx.lessonObjectives.length > 0 ? ctx.lessonObjectives.slice(0, 4) : [`Core principles of ${ctx.lessonTitle}`],
    learnSteps,
    examples: examples.length > 0 ? examples : [
      {
        title: `Applying ${ctx.lessonTitle}`,
        context: `Real-world scenario aligned with ${ctx.careerGoal}.`,
        explanation: "Break the problem into small steps, apply the core concept, and verify the outcome."
      }
    ],
    practicalApplications: practicalApplications.length > 0 ? practicalApplications : [`Applying ${ctx.lessonTitle} workflows in real ${ctx.careerGoal} deliverables.`],
    keyTerminology,
    commonMistakes,
    summary,
    whatToLearnNext,
    ...ctx.nextLessonTitle ? { nextLessonTitle: ctx.nextLessonTitle } : {},
    ...ctx.nextLessonStageTitle ? { nextLessonStageTitle: ctx.nextLessonStageTitle } : {},
    guidedExercises: guidedExercises.length > 0 ? guidedExercises : [
      {
        title: `Practice: ${ctx.lessonTitle}`,
        prompt: `Apply the principles of ${ctx.lessonTitle} to a small real-world scenario.`,
        steps: [
          "Identify the input or goal.",
          "Apply the core technique covered in the Learn steps.",
          "Verify your result against the expected outcome."
        ],
        expectedOutcome: "Clear, repeatable solution demonstrating the core concept.",
        hint: "Focus on one step at a time and check edge cases."
      }
    ],
    practiceQuestions,
    verifiedResources,
    trustedResources,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function handleGenerateLessonContentRequest(params) {
  if (!params.roadmapId || !params.stageId || !params.lessonId) {
    throw new LessonApiError(
      400,
      "MISSING_LESSON_IDENTIFIERS",
      "Roadmap ID, stage ID, and lesson ID are required."
    );
  }
  const ctx = await fetchVerifiedUserAndContext(params);
  const gapSignature = ctx.allKnowledgeGaps.slice(0, 6).join("|");
  const cacheKey = `${ctx.userId}:${ctx.roadmapId}:${ctx.stageId}:${ctx.lessonId}:${ctx.knowledgeLevel}:${gapSignature}`;
  const lockKey = `${ctx.userId}:${ctx.roadmapId}:${ctx.lessonId}`;
  if (!params.forceRegenerate) {
    const cached = getCachedServerLesson(cacheKey);
    if (cached && (cached.contentVersion ?? 1) >= CURRENT_LESSON_CONTENT_VERSION) {
      return cached;
    }
    if (ctx.persistedLesson && (ctx.persistedLesson.contentVersion ?? 1) >= CURRENT_LESSON_CONTENT_VERSION && Array.isArray(ctx.persistedLesson.learnSteps) && ctx.persistedLesson.learnSteps.length > 0) {
      let hydrated = ctx.persistedLesson;
      const existingVideos = hydrated.trustedResources?.videos?.length ?? 0;
      const existingTutorials = hydrated.trustedResources?.tutorials?.length ?? 0;
      if (!hydrated.trustedResources || existingVideos === 0 && existingTutorials === 0) {
        const refreshedResources = await matchTrustedResourcesForLesson({
          lessonTitle: ctx.lessonTitle,
          lessonDescription: ctx.lessonDescription,
          learningObjectives: ctx.lessonObjectives,
          stageTitle: ctx.stageTitle,
          careerGoal: ctx.careerGoal,
          knowledgeLevel: ctx.knowledgeLevel,
          knowledgeGaps: ctx.allKnowledgeGaps,
          learningInterests: ctx.learningInterests,
          currentSkills: ctx.currentSkills,
          preferredLanguage: "en"
        });
        hydrated = {
          ...hydrated,
          trustedResources: refreshedResources,
          verifiedResources: [
            ...refreshedResources.tutorials,
            ...refreshedResources.practice,
            ...refreshedResources.videos
          ].map((item) => ({
            id: item.id,
            title: item.title,
            provider: item.provider,
            type: item.type,
            url: item.url,
            description: item.description
          }))
        };
      }
      setCachedServerLesson(cacheKey, hydrated);
      return hydrated;
    }
  }
  const existingInFlight = inFlightLessonRequests.get(lockKey);
  if (existingInFlight) {
    return existingInFlight;
  }
  enforceSlidingRateLimit(
    lessonHistoryByUser,
    ctx.userId,
    LESSON_COOLDOWN_MS,
    LESSON_WINDOW_MS,
    MAX_LESSONS_PER_WINDOW,
    "lesson generation"
  );
  const task = (async () => {
    const ai = createGeminiClient();
    const systemInstruction = [
      "You are Skillora\u2019s personalized AI educator.",
      "Generate comprehensive, well-structured, accurate study material for a single lesson.",
      "Rules:",
      "- Include substantive depth: 4 to 6 learnSteps (4-5 focused sentences each), 2 to 3 worked examples with concrete walkthroughs, 2 to 4 practicalApplications, 3 to 5 keyTerminology entries, 2 to 4 commonMistakes with fixes, a concise summary, whatToLearnNext guidance, 1 to 2 guidedExercises, and 3 to 5 practiceQuestions.",
      "- If the lesson is a programming/technical topic, include clean, accurate code examples and practical expected outputs.",
      "- If the lesson is non-programming (UI/UX design, product, business, marketing, finance, communication, geography, engineering, academic writing, languages, etc.), set isProgrammingTopic=false, omit codeSnippet, and provide rich domain-authentic frameworks, critiques, scenarios, and exercises.",
      "- Do NOT repeat generic boilerplate or duplicate material from sibling lessons in the same course; focus strictly on this specific lesson topic.",
      "- Never invent URLs, links, video IDs, course titles, or claims of live code execution or guaranteed job outcomes.",
      "- Ground all practice questions directly in the concepts taught in learnSteps and examples.",
      "- Return strictly valid JSON matching the schema."
    ].join("\n");
    const promptLines = [
      "Create personalized educational content for this lesson (student PII omitted):",
      "",
      `- Career Goal / Primary Direction: ${ctx.careerGoal}`,
      `- Field of Study: ${ctx.fieldOfStudy || "Not specified"}`,
      `- Knowledge Level: ${ctx.knowledgeLevel} (Stage Difficulty: ${ctx.stageDifficulty})`,
      `- Stage: ${ctx.stageTitle}`,
      `- Lesson Title: ${ctx.lessonTitle}`,
      `- Lesson Summary: ${ctx.lessonDescription || "Core lesson in this stage"}`,
      `- Learning Objectives: ${ctx.lessonObjectives.length > 0 ? ctx.lessonObjectives.join("; ") : "Master core concepts"}`,
      `- Completion Criteria: ${ctx.lessonCompletionCriteria || "Demonstrate concept understanding via guided practice and quiz"}`,
      `- Prerequisites: ${ctx.stagePrerequisites.length > 0 ? ctx.stagePrerequisites.join("; ") : "None"}`,
      ...ctx.siblingLessonTitles.length > 0 ? [
        `- Other Lessons in This Course (do NOT duplicate their topics here): ${ctx.siblingLessonTitles.join(
          "; "
        )}`
      ] : [],
      ...ctx.nextLessonTitle ? [
        `- Next Lesson in Sequence (bridge to this in whatToLearnNext): ${ctx.nextLessonTitle}`
      ] : [],
      `- Self-Reported Skills: ${ctx.currentSkills.length > 0 ? ctx.currentSkills.join(", ") : "None listed"}`,
      `- Identified Assessment Knowledge Gaps: ${ctx.allKnowledgeGaps.length > 0 ? ctx.allKnowledgeGaps.join(", ") : "No prior gaps recorded yet"}`
    ];
    if (ctx.attemptSummaries.length > 0) {
      promptLines.push("- Recent Assessment Context:");
      for (const a of ctx.attemptSummaries) {
        promptLines.push(
          `  * ${a.subject} (${a.difficulty}): ${a.scorePercent}% | Gaps: ${a.gaps.length > 0 ? a.gaps.join(", ") : "None"}`
        );
      }
    }
    const trustedResourcesPromise = matchTrustedResourcesForLesson({
      lessonTitle: ctx.lessonTitle,
      lessonDescription: ctx.lessonDescription,
      learningObjectives: ctx.lessonObjectives,
      stageTitle: ctx.stageTitle,
      careerGoal: ctx.careerGoal,
      knowledgeLevel: ctx.knowledgeLevel,
      knowledgeGaps: ctx.allKnowledgeGaps,
      learningInterests: ctx.learningInterests,
      currentSkills: ctx.currentSkills,
      preferredLanguage: "en"
    });
    let responseText = "";
    try {
      responseText = await generateJsonWithTimeoutAndFallback({
        ai,
        contents: promptLines.join("\n"),
        systemInstruction,
        responseSchema: LESSON_RESPONSE_SCHEMA
      });
    } catch (err) {
      throw mapGeminiError2(err);
    }
    if (!responseText) {
      throw new LessonApiError(
        502,
        "AI_EMPTY_RESPONSE",
        "The AI service returned an empty lesson response. Please retry."
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(stripMarkdownJsonFence2(responseText));
    } catch {
      throw new LessonApiError(
        502,
        "AI_JSON_PARSE_ERROR",
        "Could not parse the generated lesson structure. Please retry."
      );
    }
    const trustedResources = await trustedResourcesPromise;
    const validated = await validateAndNormalizeLessonContent(parsed, ctx, trustedResources);
    setCachedServerLesson(cacheKey, validated);
    await persistGeneratedLessonToRoadmap({
      supabase: ctx.supabase,
      userId: ctx.userId,
      roadmapId: ctx.roadmapId,
      lessonId: ctx.lessonId,
      content: validated
    });
    recordHistory(lessonHistoryByUser, ctx.userId, LESSON_WINDOW_MS);
    return validated;
  })();
  inFlightLessonRequests.set(lockKey, task);
  try {
    return await task;
  } finally {
    inFlightLessonRequests.delete(lockKey);
  }
}
async function handleGetCourseResourcesRequest(params) {
  if (!params.roadmapId || !params.stageId) {
    throw new LessonApiError(
      400,
      "MISSING_COURSE_IDENTIFIERS",
      "Roadmap ID and stage ID are required."
    );
  }
  const authHeader = params.authorizationHeader?.trim() || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new LessonApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with an active Skillora session to view course resources."
    );
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new LessonApiError(401, "INVALID_AUTH_TOKEN", "Missing authentication token.");
  }
  const supabase = createUserScopedSupabaseClient3(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new LessonApiError(
      401,
      "UNAUTHORIZED",
      "Your session has expired or is invalid. Please sign in again."
    );
  }
  const userId = userData.user.id;
  const cacheKey = `${userId}:${params.roadmapId}:${params.stageId}`;
  const cached = courseResourcesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bundle;
  }
  const existingInFlight = inFlightCourseResources.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }
  const task = (async () => {
    const [roadmapResult, profileResult] = await Promise.all([
      supabase.from("learning_roadmaps").select("id, career_goal, roadmap_data").eq("id", params.roadmapId).eq("user_id", userId).maybeSingle(),
      supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle()
    ]);
    if (roadmapResult.error) {
      throw new LessonApiError(
        roadmapResult.error.code === "42501" ? 403 : 500,
        roadmapResult.error.code || "ROADMAP_FETCH_FAILED",
        "Could not load course details from Supabase."
      );
    }
    if (!roadmapResult.data) {
      throw new LessonApiError(404, "ROADMAP_NOT_FOUND", "Learning roadmap not found.");
    }
    const roadmapRow = roadmapResult.data;
    const roadmapData = roadmapRow.roadmap_data ?? {};
    const stages = Array.isArray(roadmapData.stages) ? roadmapData.stages : [];
    const stage = stages.find((s) => s.id === params.stageId);
    if (!stage) {
      throw new LessonApiError(404, "STAGE_NOT_FOUND", "Course not found in this roadmap.");
    }
    const profileRow = profileResult.data ?? {};
    const rawLevel = profileRow.knowledge_level ?? stage.difficulty;
    const knowledgeLevel = rawLevel === "Beginner" || rawLevel === "Intermediate" || rawLevel === "Advanced" ? rawLevel : "Intermediate";
    const lessons = Array.isArray(stage.lessons) ? stage.lessons : [];
    const courseUserMeta = userData.user.user_metadata ?? {};
    const courseDbPrimary = typeof profileRow.primary_direction === "string" ? profileRow.primary_direction.trim() : "";
    const courseMetaPrimary = typeof courseUserMeta.primary_direction === "string" ? courseUserMeta.primary_direction.trim() : "";
    const coursePrimaryDirection = courseDbPrimary || courseMetaPrimary;
    const bundle = await matchTrustedResourcesForCourse({
      courseTitle: typeof stage.title === "string" ? stage.title : "Course",
      courseDescription: typeof stage.description === "string" ? stage.description : "",
      learningObjectives: Array.isArray(stage.learningObjectives) ? stage.learningObjectives.filter((o) => typeof o === "string") : [],
      lessonTitles: lessons.map((l) => typeof l.title === "string" ? l.title : "").filter(Boolean),
      knowledgeLevel,
      careerGoal: typeof roadmapRow.career_goal === "string" && roadmapRow.career_goal.trim() || coursePrimaryDirection || typeof profileRow.career_goal === "string" && profileRow.career_goal.trim() || ""
    });
    courseResourcesCache.set(cacheKey, {
      expiresAt: Date.now() + COURSE_RESOURCES_CACHE_TTL_MS,
      bundle
    });
    return bundle;
  })();
  inFlightCourseResources.set(cacheKey, task);
  try {
    return await task;
  } finally {
    if (inFlightCourseResources.get(cacheKey) === task) {
      inFlightCourseResources.delete(cacheKey);
    }
  }
}
var CLARIFY_RESPONSE_SCHEMA = {
  type: Type2.OBJECT,
  properties: {
    answer: {
      type: Type2.STRING,
      description: "Clear, encouraging, concise explanation answering the student question."
    },
    exampleSnippet: {
      type: Type2.STRING,
      description: "Optional short code snippet or concrete mini-example if helpful, otherwise empty string."
    },
    exampleLanguage: {
      type: Type2.STRING,
      description: "Programming language if exampleSnippet is code, otherwise empty string."
    }
  },
  required: ["answer"]
};
async function handleClarifyLessonRequest(params) {
  const trimmedQuestion = params.question?.trim() || "";
  if (!trimmedQuestion || trimmedQuestion.length < 3) {
    throw new LessonApiError(
      400,
      "INVALID_QUESTION",
      "Please enter a clear question about this lesson."
    );
  }
  if (trimmedQuestion.length > 600) {
    throw new LessonApiError(
      400,
      "QUESTION_TOO_LONG",
      "Please keep your clarification question under 600 characters."
    );
  }
  const ctx = await fetchVerifiedUserAndContext(params);
  enforceSlidingRateLimit(
    clarifyHistoryByUser,
    ctx.userId,
    CLARIFY_COOLDOWN_MS,
    CLARIFY_WINDOW_MS,
    MAX_CLARIFIES_PER_WINDOW,
    "clarification"
  );
  const ai = createGeminiClient();
  const attemptLines = ctx.attemptSummaries.length > 0 ? ctx.attemptSummaries.map(
    (a) => `${a.subject} (${a.difficulty}): ${a.scorePercent}%${a.gaps.length ? ` [Gaps: ${a.gaps.join(", ")}]` : ""}`
  ).join("; ") : "None recorded yet";
  const systemInstruction = [
    "You are a supportive Skillora tutor helping an authenticated student clarify concepts inside their active lesson.",
    "Adapt depth, terminology, and examples directly to their knowledge level, field of study, career goal, and knowledge gaps.",
    "Support step-by-step explanations, practical examples, practice exercises (give hints before full answers unless checking their submitted answer), and discipline-accurate guidance.",
    "Never assume programming unless the lesson or student context involves coding/software.",
    "Always resolve follow-up questions using prior conversation turns.",
    "Never invent URLs or claim code was executed.",
    "Return valid JSON matching the schema.",
    "",
    `STUDENT CONTEXT:`,
    `- Field of Study: ${ctx.fieldOfStudy || "General"}`,
    `- Knowledge Level: ${ctx.knowledgeLevel}`,
    `- Career Goal: ${ctx.careerGoal}`,
    `- Current Skills: ${ctx.currentSkills.join(", ") || "None listed"}`,
    `- Learning Interests: ${ctx.learningInterests.join(", ") || "None listed"}`,
    `- Recent Assessments: ${attemptLines}`,
    `- Knowledge Gaps: ${ctx.allKnowledgeGaps.join(", ") || "None recorded"}`,
    "",
    `LESSON CONTEXT:`,
    `- Stage: ${ctx.stageTitle} (${ctx.stageDifficulty})`,
    `- Lesson: ${ctx.lessonTitle}`,
    `- Description: ${ctx.lessonDescription || "Focused curriculum lesson"}`,
    `- Objectives: ${ctx.lessonObjectives.join("; ") || "Master core lesson concepts"}`,
    `- Active Study Tab: ${params.currentSection || "Learn"}`
  ].join("\n");
  const sanitizedHistory = Array.isArray(params.history) ? params.history.filter(
    (h) => Boolean(h) && (h.sender === "user" || h.sender === "assistant") && typeof h.text === "string" && h.text.trim().length > 0
  ).slice(-8) : [];
  const contents = [
    ...sanitizedHistory.map((h) => ({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text.trim().slice(0, 1200) }]
    })),
    {
      role: "user",
      parts: [{ text: trimmedQuestion }]
    }
  ];
  let responseText = "";
  try {
    responseText = await generateJsonWithTimeoutAndFallback({
      ai,
      contents,
      systemInstruction,
      responseSchema: CLARIFY_RESPONSE_SCHEMA
    });
  } catch (err) {
    throw mapGeminiError2(err);
  }
  if (!responseText) {
    throw new LessonApiError(
      502,
      "AI_EMPTY_RESPONSE",
      "The AI tutor returned an empty response. Please try again."
    );
  }
  let parsed = {};
  try {
    parsed = JSON.parse(stripMarkdownJsonFence2(responseText));
  } catch {
    throw new LessonApiError(
      502,
      "AI_CLARIFY_PARSE_ERROR",
      "Could not read the clarification response. Please try again."
    );
  }
  recordHistory(clarifyHistoryByUser, ctx.userId, CLARIFY_WINDOW_MS);
  const answer = sanitizeTextNoUrls2(
    parsed.answer,
    "Try breaking this concept into smaller steps and reviewing the example in this lesson."
  );
  const exampleSnippet = typeof parsed.exampleSnippet === "string" && parsed.exampleSnippet.trim() ? parsed.exampleSnippet.trim() : void 0;
  const exampleLanguage = exampleSnippet && typeof parsed.exampleLanguage === "string" && parsed.exampleLanguage.trim() ? parsed.exampleLanguage.trim().toLowerCase() : void 0;
  return {
    answer,
    exampleSnippet,
    exampleLanguage
  };
}

// server/knowledgeCheckService.ts
import crypto2 from "crypto";
import { GoogleGenAI as GoogleGenAI3, ThinkingLevel as ThinkingLevel3, Type as Type3 } from "@google/genai";
import { createClient as createClient4 } from "@supabase/supabase-js";

// shared/knowledgeCheckConfig.ts
var DEFAULT_ADAPTIVE_THRESHOLDS = {
  advanceMinPercent: 80,
  practiceMinPercent: 50,
  topicStrongMinPercent: 80,
  topicModerateMinPercent: 50
};
function normalizeAdaptiveThresholds(overrides) {
  const practiceRaw = Number(overrides?.practiceMinPercent);
  const advanceRaw = Number(overrides?.advanceMinPercent);
  const topicModRaw = Number(overrides?.topicModerateMinPercent);
  const topicStrongRaw = Number(overrides?.topicStrongMinPercent);
  const practiceMinPercent = Number.isFinite(practiceRaw) && practiceRaw >= 1 && practiceRaw <= 95 ? Math.round(practiceRaw) : DEFAULT_ADAPTIVE_THRESHOLDS.practiceMinPercent;
  const advanceMinPercent = Number.isFinite(advanceRaw) && advanceRaw > practiceMinPercent && advanceRaw <= 100 ? Math.round(advanceRaw) : Math.max(practiceMinPercent + 1, DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent);
  const topicModerateMinPercent = Number.isFinite(topicModRaw) && topicModRaw >= 1 && topicModRaw <= 95 ? Math.round(topicModRaw) : DEFAULT_ADAPTIVE_THRESHOLDS.topicModerateMinPercent;
  const topicStrongMinPercent = Number.isFinite(topicStrongRaw) && topicStrongRaw > topicModerateMinPercent && topicStrongRaw <= 100 ? Math.round(topicStrongRaw) : Math.max(
    topicModerateMinPercent + 1,
    DEFAULT_ADAPTIVE_THRESHOLDS.topicStrongMinPercent
  );
  return {
    advanceMinPercent,
    practiceMinPercent,
    topicStrongMinPercent,
    topicModerateMinPercent
  };
}
function classifyTopicProficiency(accuracyPercent, thresholds = DEFAULT_ADAPTIVE_THRESHOLDS) {
  if (accuracyPercent >= thresholds.topicStrongMinPercent) return "Strong";
  if (accuracyPercent >= thresholds.topicModerateMinPercent) return "Moderate";
  return "Needs Improvement";
}
function getAdaptiveRecommendationTier(scorePercent, thresholds = DEFAULT_ADAPTIVE_THRESHOLDS) {
  if (scorePercent >= thresholds.advanceMinPercent) return "next_lesson";
  if (scorePercent >= thresholds.practiceMinPercent) return "additional_practice";
  return "review_fundamentals";
}

// server/knowledgeCheckService.ts
var KnowledgeCheckApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "KnowledgeCheckApiError";
    this.status = status;
    this.code = code;
  }
};
var EPHEMERAL_SECRET = crypto2.randomBytes(32).toString("hex");
var SESSION_TTL_MS = 12 * 60 * 60 * 1e3;
var checkedAnswersBySubmission = /* @__PURE__ */ new Map();
var inFlightSubmissions = /* @__PURE__ */ new Map();
var completedSubmissionsCache = /* @__PURE__ */ new Map();
var quizStartHistoryByUser = /* @__PURE__ */ new Map();
var QUIZ_COOLDOWN_MS = 2e3;
var QUIZ_WINDOW_MS = 10 * 6e4;
var MAX_QUIZZES_PER_WINDOW = 40;
function cleanupMemoryStores() {
  const now = Date.now();
  for (const [key, entry] of checkedAnswersBySubmission.entries()) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      checkedAnswersBySubmission.delete(key);
    }
  }
  for (const [key, entry] of completedSubmissionsCache.entries()) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      completedSubmissionsCache.delete(key);
    }
  }
}
function getQuizSigningSecret() {
  const explicit = process.env.KNOWLEDGE_CHECK_SIGNING_SECRET?.trim();
  if (explicit) return explicit;
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) {
    return crypto2.createHash("sha256").update(`skillora-kc:${gemini}`).digest("hex");
  }
  return EPHEMERAL_SECRET;
}
function signQuizSessionToken(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto2.createHmac("sha256", getQuizSigningSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}
function verifyQuizSessionToken(token, expectedUserId) {
  const trimmed = token?.trim() || "";
  const parts = trimmed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new KnowledgeCheckApiError(
      400,
      "INVALID_QUIZ_TOKEN",
      "Quiz session token is invalid. Please start a fresh Knowledge Check."
    );
  }
  const [body, providedSig] = parts;
  const expectedSig = crypto2.createHmac("sha256", getQuizSigningSecret()).update(body).digest("base64url");
  const sigBufA = Buffer.from(providedSig, "utf8");
  const sigBufB = Buffer.from(expectedSig, "utf8");
  if (sigBufA.length !== sigBufB.length || !crypto2.timingSafeEqual(sigBufA, sigBufB)) {
    throw new KnowledgeCheckApiError(
      403,
      "QUIZ_TOKEN_SIGNATURE_INVALID",
      "Quiz verification failed. Please restart the Knowledge Check."
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new KnowledgeCheckApiError(
      400,
      "QUIZ_TOKEN_MALFORMED",
      "Could not read your active quiz session. Please restart the Knowledge Check."
    );
  }
  if (parsed.userId !== expectedUserId) {
    throw new KnowledgeCheckApiError(
      403,
      "QUIZ_USER_MISMATCH",
      "This Knowledge Check session belongs to a different account."
    );
  }
  if (!parsed.submissionId || !parsed.roadmapId || !parsed.lessonId || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new KnowledgeCheckApiError(
      400,
      "QUIZ_TOKEN_INCOMPLETE",
      "Quiz session payload is incomplete. Please restart the Knowledge Check."
    );
  }
  if (Date.now() - Number(parsed.issuedAt || 0) > SESSION_TTL_MS) {
    throw new KnowledgeCheckApiError(
      410,
      "QUIZ_TOKEN_EXPIRED",
      "This Knowledge Check session expired. Please start a new attempt."
    );
  }
  return parsed;
}
function getServerAdaptiveThresholds(overrides) {
  const envAdvance = Number(process.env.KNOWLEDGE_CHECK_ADVANCE_MIN_PERCENT);
  const envPractice = Number(process.env.KNOWLEDGE_CHECK_PRACTICE_MIN_PERCENT);
  const envTopicStrong = Number(process.env.KNOWLEDGE_CHECK_TOPIC_STRONG_MIN_PERCENT);
  const envTopicMod = Number(process.env.KNOWLEDGE_CHECK_TOPIC_MODERATE_MIN_PERCENT);
  return normalizeAdaptiveThresholds({
    advanceMinPercent: overrides?.advanceMinPercent ?? (Number.isFinite(envAdvance) ? envAdvance : DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent),
    practiceMinPercent: overrides?.practiceMinPercent ?? (Number.isFinite(envPractice) ? envPractice : DEFAULT_ADAPTIVE_THRESHOLDS.practiceMinPercent),
    topicStrongMinPercent: overrides?.topicStrongMinPercent ?? (Number.isFinite(envTopicStrong) ? envTopicStrong : DEFAULT_ADAPTIVE_THRESHOLDS.topicStrongMinPercent),
    topicModerateMinPercent: overrides?.topicModerateMinPercent ?? (Number.isFinite(envTopicMod) ? envTopicMod : DEFAULT_ADAPTIVE_THRESHOLDS.topicModerateMinPercent)
  });
}
function createUserScopedSupabaseClient4(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new KnowledgeCheckApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient4(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
async function authenticateBearerRequest(authorizationHeader) {
  const authHeader = authorizationHeader?.trim() || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new KnowledgeCheckApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with an active Skillora session."
    );
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new KnowledgeCheckApiError(
      401,
      "INVALID_AUTH_TOKEN",
      "Missing authentication token. Please sign in again."
    );
  }
  const supabase = createUserScopedSupabaseClient4(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    throw new KnowledgeCheckApiError(
      401,
      "UNAUTHORIZED",
      "Your session has expired or is invalid. Please sign in again."
    );
  }
  return { userId: userData.user.id, supabase };
}
function createGeminiClient2() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new KnowledgeCheckApiError(
      503,
      "GEMINI_KEY_MISSING",
      "GEMINI_API_KEY is not configured on the server."
    );
  }
  return new GoogleGenAI3({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function stripMarkdownJsonFence3(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function mapGeminiError3(err) {
  if (err instanceof KnowledgeCheckApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "Unknown AI error");
  const lower = rawMessage.toLowerCase();
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid")) {
    return new KnowledgeCheckApiError(
      502,
      "GEMINI_CONFIG_ERROR",
      "The AI service key is invalid. Please verify GEMINI_API_KEY in Settings > Secrets."
    );
  }
  if (lower.includes("permission_denied") || lower.includes("403")) {
    return new KnowledgeCheckApiError(
      502,
      "GEMINI_PERMISSION_DENIED",
      "AI quiz generation could not be authorized. Please check GEMINI_API_KEY."
    );
  }
  if (lower.includes("resource_exhausted") || lower.includes("429")) {
    return new KnowledgeCheckApiError(
      429,
      "GEMINI_QUOTA_EXCEEDED",
      "The AI service is temporarily busy due to quota limits. Please wait a moment and try again."
    );
  }
  if (err instanceof Error && err.name === "AbortError" || lower.includes("abort") || lower.includes("timeout") || lower.includes("deadline_exceeded") || lower.includes("etimedout")) {
    return new KnowledgeCheckApiError(
      504,
      "GEMINI_TIMEOUT",
      "Knowledge Check generation took too long and timed out. Please retry."
    );
  }
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand") || lower.includes("overloaded") || lower.includes("500") || lower.includes("502") || lower.includes("504") || lower.includes("fetch failed") || lower.includes("econnreset") || lower.includes("enotfound") || lower.includes("network")) {
    return new KnowledgeCheckApiError(
      503,
      "GEMINI_SERVICE_UNAVAILABLE",
      "The AI service is temporarily unavailable due to high demand or a network issue. Please try again in a moment."
    );
  }
  if (lower.includes("404") || lower.includes("not_found")) {
    return new KnowledgeCheckApiError(
      502,
      "GEMINI_MODEL_UNAVAILABLE",
      "The configured AI model is temporarily unavailable. Please try again shortly."
    );
  }
  return new KnowledgeCheckApiError(
    502,
    "GEMINI_QUIZ_FAILED",
    "We could not generate your Knowledge Check right now. Please try again."
  );
}
function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/https?:\/\/[^\s)]+/gi, "").replace(/\bwww\.[^\s)]+/gi, "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}
function enforceQuizRateLimit(userId) {
  const now = Date.now();
  const timestamps = (quizStartHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < QUIZ_WINDOW_MS
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < QUIZ_COOLDOWN_MS) {
    const waitSec = Math.ceil((QUIZ_COOLDOWN_MS - (now - lastTs)) / 1e3);
    throw new KnowledgeCheckApiError(
      429,
      "RATE_LIMITED_COOLDOWN",
      `Please wait ${waitSec}s before starting another Knowledge Check.`
    );
  }
  if (timestamps.length >= MAX_QUIZZES_PER_WINDOW) {
    throw new KnowledgeCheckApiError(
      429,
      "RATE_LIMITED_WINDOW",
      "You have started many Knowledge Checks recently. Please pause briefly and try again."
    );
  }
  timestamps.push(now);
  quizStartHistoryByUser.set(userId, timestamps);
}
function isMissingTableError(err) {
  if (!err) return false;
  const code = err.code || "";
  const msg = (err.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("lesson_knowledge_checks") && (msg.includes("does not exist") || msg.includes("could not find"));
}
var QUIZ_GENERATION_SCHEMA = {
  type: Type3.OBJECT,
  properties: {
    questions: {
      type: Type3.ARRAY,
      description: "Generate 4 multiple-choice questions (between 3 and 5) directly testing the lesson learning objectives.",
      items: {
        type: Type3.OBJECT,
        properties: {
          topic: {
            type: Type3.STRING,
            description: "Short 2-4 word concept or sub-skill name (e.g., Closures, Array Methods, SQL Joins)."
          },
          objective: {
            type: Type3.STRING,
            description: "The specific lesson learning objective tested by this question."
          },
          question: {
            type: Type3.STRING,
            description: "Clear, unambiguous multiple-choice question testing comprehension or application."
          },
          options: {
            type: Type3.ARRAY,
            items: { type: Type3.STRING },
            description: "Exactly 4 distinct multiple-choice answer options."
          },
          correctAnswerIndex: {
            type: Type3.INTEGER,
            description: "Zero-based index (0 to 3) of the single correct option."
          },
          optionExplanations: {
            type: Type3.ARRAY,
            items: { type: Type3.STRING },
            description: "Exactly 4 short explanations corresponding index-for-index to each option, stating clearly why that option is correct or incorrect."
          },
          conceptExplanation: {
            type: Type3.STRING,
            description: "Concise 1-2 sentence explanation of the underlying concept behind this question."
          }
        },
        required: [
          "topic",
          "objective",
          "question",
          "options",
          "correctAnswerIndex",
          "optionExplanations",
          "conceptExplanation"
        ]
      }
    }
  },
  required: ["questions"]
};
function findNextLessonInRoadmap(stages, currentStageId, currentLessonId) {
  const flattened = [];
  for (const stage of stages) {
    const sId = typeof stage.id === "string" ? stage.id : "";
    const lessons = Array.isArray(stage.lessons) ? stage.lessons : [];
    for (const lesson of lessons) {
      const lId = typeof lesson.id === "string" ? lesson.id : "";
      const lTitle = typeof lesson.title === "string" ? lesson.title : "Next Lesson";
      if (sId && lId) {
        flattened.push({ stageId: sId, lessonId: lId, lessonTitle: lTitle });
      }
    }
  }
  const idx = flattened.findIndex(
    (entry) => entry.stageId === currentStageId && entry.lessonId === currentLessonId
  );
  if (idx >= 0 && idx + 1 < flattened.length) {
    return flattened[idx + 1];
  }
  return null;
}
async function handleStartKnowledgeCheck(params) {
  cleanupMemoryStores();
  if (!params.roadmapId || !params.stageId || !params.lessonId) {
    throw new KnowledgeCheckApiError(
      400,
      "MISSING_LESSON_IDENTIFIERS",
      "Roadmap ID, stage ID, and lesson ID are required to start a Knowledge Check."
    );
  }
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  enforceQuizRateLimit(userId);
  const [roadmapRes, profileRes, priorGapsRes] = await Promise.all([
    supabase.from("learning_roadmaps").select("id, title, career_goal, roadmap_data").eq("id", params.roadmapId).eq("user_id", userId).maybeSingle(),
    supabase.from("student_profiles").select("career_goal, knowledge_level, field_of_study").eq("id", userId).maybeSingle(),
    supabase.from("lesson_knowledge_checks").select("knowledge_gaps, completed_at").eq("user_id", userId).eq("lesson_id", params.lessonId).order("completed_at", { ascending: false }).limit(5)
  ]);
  if (roadmapRes.error) {
    throw new KnowledgeCheckApiError(
      roadmapRes.error.code === "42501" ? 403 : 500,
      roadmapRes.error.code || "ROADMAP_FETCH_FAILED",
      "Could not load your roadmap from Supabase."
    );
  }
  if (!roadmapRes.data) {
    throw new KnowledgeCheckApiError(
      404,
      "ROADMAP_NOT_FOUND",
      "The selected learning roadmap could not be found."
    );
  }
  const roadmapRow = roadmapRes.data;
  const roadmapData = roadmapRow.roadmap_data ?? {};
  const stages = Array.isArray(roadmapData.stages) ? roadmapData.stages : [];
  const stage = stages.find((s) => s.id === params.stageId);
  if (!stage) {
    throw new KnowledgeCheckApiError(404, "STAGE_NOT_FOUND", "Stage not found in this roadmap.");
  }
  const lessons = Array.isArray(stage.lessons) ? stage.lessons : [];
  const lesson = lessons.find((l) => l.id === params.lessonId);
  if (!lesson) {
    throw new KnowledgeCheckApiError(404, "LESSON_NOT_FOUND", "Lesson not found in this stage.");
  }
  const lessonTitle = sanitizeText(lesson.title, "Lesson");
  const lessonDescription = sanitizeText(lesson.description, "");
  const stageTitle = sanitizeText(stage.title, "Learning Stage");
  const lessonObjectives = Array.isArray(lesson.learningObjectives) ? lesson.learningObjectives.filter((o) => typeof o === "string").map((o) => sanitizeText(o)).filter(Boolean) : [];
  const tableLessonGaps = !priorGapsRes.error && Array.isArray(priorGapsRes.data) ? priorGapsRes.data.flatMap((row) => {
    const gaps = row.knowledge_gaps;
    return Array.isArray(gaps) ? gaps.filter((g) => typeof g === "string") : [];
  }) : [];
  const fallbackLessonGaps = Array.isArray(roadmapData.knowledgeCheckAttempts) ? roadmapData.knowledgeCheckAttempts.filter((a) => (a.lessonId ?? a.lesson_id) === params.lessonId).flatMap((a) => {
    const gaps = a.knowledgeGaps ?? a.knowledge_gaps;
    return Array.isArray(gaps) ? gaps.filter((g) => typeof g === "string") : [];
  }) : [];
  const priorLessonGaps = Array.from(
    new Set([...tableLessonGaps, ...fallbackLessonGaps].filter(Boolean))
  ).slice(0, 6);
  const profileRow = profileRes.data ?? {};
  const knowledgeLevel = profileRow.knowledge_level === "Beginner" || profileRow.knowledge_level === "Intermediate" || profileRow.knowledge_level === "Advanced" ? profileRow.knowledge_level : typeof stage.difficulty === "string" ? stage.difficulty : "Intermediate";
  const targetCount = Math.min(5, Math.max(3, Number(params.questionCount) || 4));
  const ai = createGeminiClient2();
  const systemInstruction = [
    "You are Skillora\u2019s assessment specialist generating a Lesson Knowledge Check.",
    `Generate exactly ${targetCount} multiple-choice questions strictly tailored to the current lesson and its learning objectives.`,
    "Rules:",
    '- Each question must map to a concise 2-4 word topic tag (e.g., "Variable Scope", "Async Promises", "Index Design") so Skillora can detect topic-level knowledge gaps.',
    "- Provide exactly 4 clear, distinct answer options.",
    "- Set correctAnswerIndex (0 to 3) accurately.",
    "- Provide optionExplanations as a 4-item array aligned 1-to-1 with options[0..3], keeping each explanation to 1 clear, concise sentence.",
    "- Provide conceptExplanation summarizing the core underlying principle in 1 concise sentence.",
    "- Never include URLs.",
    "- Vary correctAnswerIndex across questions so answers are not all index 0.",
    "- Return strictly valid JSON matching the schema."
  ].join("\n");
  const prompt = [
    `Stage: ${stageTitle} (${knowledgeLevel} level)`,
    `Lesson Title: ${lessonTitle}`,
    `Lesson Summary: ${lessonDescription || "Core concepts and applied skills"}`,
    `Learning Objectives:
${lessonObjectives.length > 0 ? lessonObjectives.map((o, i) => `${i + 1}. ${o}`).join("\n") : `1. Master the core concepts of ${lessonTitle}`}`,
    priorLessonGaps.length > 0 ? `Student Prior Knowledge Gaps in this lesson (reinforce with clear diagnostic questions): ${priorLessonGaps.join(", ")}` : "Student Prior Knowledge Gaps: None recorded yet for this lesson."
  ].join("\n\n");
  const generateQuizWithModel = async (model, timeoutMs, useLowThinking) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: QUIZ_GENERATION_SCHEMA,
          abortSignal: controller.signal,
          ...useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel3.LOW } } : {}
        }
      });
      return (response.text ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  };
  let responseText = "";
  try {
    responseText = await generateQuizWithModel("gemini-4-hydrogen", 2e4, true);
    if (!responseText) {
      throw new Error("EMPTY_PRIMARY_RESPONSE");
    }
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message.toLowerCase() : "";
    const isAuthOrKeyFatal = msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("permission_denied") || msg.includes("invalid_argument") || msg.includes("403");
    if (isAuthOrKeyFatal) {
      throw mapGeminiError3(primaryErr);
    }
    try {
      responseText = await generateQuizWithModel("gemini-3.1-flash-lite", 18e3, false);
    } catch (fallbackErr) {
      throw mapGeminiError3(fallbackErr);
    }
  }
  if (!responseText) {
    throw new KnowledgeCheckApiError(
      502,
      "AI_EMPTY_RESPONSE",
      "The AI service returned an empty Knowledge Check response. Please retry."
    );
  }
  let parsed = {};
  try {
    parsed = JSON.parse(stripMarkdownJsonFence3(responseText));
  } catch {
    throw new KnowledgeCheckApiError(
      502,
      "AI_QUIZ_PARSE_ERROR",
      "Could not read the generated Knowledge Check questions. Please retry."
    );
  }
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawQuestions.length < 3) {
    throw new KnowledgeCheckApiError(
      502,
      "AI_QUIZ_TOO_FEW_QUESTIONS",
      "The AI service generated too few questions. Please retry."
    );
  }
  const normalizedQuestions = rawQuestions.slice(0, 5).map((qRaw, idx) => {
    const q = qRaw && typeof qRaw === "object" ? qRaw : {};
    const rawOptions = Array.isArray(q.options) ? q.options.map((o) => sanitizeText(o)).filter(Boolean).slice(0, 4) : [];
    while (rawOptions.length < 4) {
      rawOptions.push(`Option ${String.fromCharCode(65 + rawOptions.length)}`);
    }
    const rawCorrect = Number(q.correctAnswerIndex);
    const correctAnswerIndex = Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < 4 ? rawCorrect : 0;
    const rawOptionExps = Array.isArray(q.optionExplanations) ? q.optionExplanations.map((e) => sanitizeText(e)) : [];
    const conceptExplanation = sanitizeText(
      q.conceptExplanation,
      `Understanding how ${lessonTitle} applies to ${sanitizeText(q.topic, lessonTitle)} helps prevent common mistakes.`
    );
    const optionExplanations = rawOptions.map((_, oIdx) => {
      const exp = rawOptionExps[oIdx];
      if (exp) return exp;
      if (oIdx === correctAnswerIndex) {
        return "This option accurately applies the concept taught in this lesson.";
      }
      return "This option misses a key requirement of the underlying concept.";
    });
    const fallbackObj = lessonObjectives[idx % Math.max(1, lessonObjectives.length)] || `Apply ${lessonTitle}`;
    return {
      id: `kc-${params.lessonId}-q${idx + 1}-${crypto2.randomBytes(3).toString("hex")}`,
      topic: sanitizeText(q.topic, `Objective ${idx + 1}`),
      objective: sanitizeText(q.objective, fallbackObj),
      question: sanitizeText(q.question, `Question ${idx + 1} on ${lessonTitle}`),
      options: rawOptions,
      correctAnswerIndex,
      optionExplanations,
      conceptExplanation
    };
  });
  const submissionId = crypto2.randomUUID();
  const nextLesson = findNextLessonInRoadmap(stages, params.stageId, params.lessonId);
  const sessionPayload = {
    submissionId,
    userId,
    roadmapId: String(roadmapRow.id),
    stageId: params.stageId,
    lessonId: params.lessonId,
    lessonTitle,
    nextLesson,
    issuedAt: Date.now(),
    questions: normalizedQuestions
  };
  const quizToken = signQuizSessionToken(sessionPayload);
  const clientQuestions = normalizedQuestions.map((q) => ({
    id: q.id,
    topic: q.topic,
    objective: q.objective,
    question: q.question,
    options: q.options
  }));
  return {
    submissionId,
    quizToken,
    roadmapId: sessionPayload.roadmapId,
    stageId: sessionPayload.stageId,
    lessonId: sessionPayload.lessonId,
    lessonTitle: sessionPayload.lessonTitle,
    questions: clientQuestions
  };
}
async function handleCheckSingleAnswer(params) {
  cleanupMemoryStores();
  const { userId } = await authenticateBearerRequest(params.authorizationHeader);
  const session = verifyQuizSessionToken(params.quizToken, userId);
  const question = session.questions.find((q) => q.id === params.questionId);
  if (!question) {
    throw new KnowledgeCheckApiError(
      404,
      "QUESTION_NOT_FOUND",
      "That question does not belong to your current Knowledge Check."
    );
  }
  const chosen = Number(params.selectedOptionIndex);
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= question.options.length) {
    throw new KnowledgeCheckApiError(
      400,
      "INVALID_OPTION_INDEX",
      "Please select a valid multiple-choice option."
    );
  }
  let lockedEntry = checkedAnswersBySubmission.get(session.submissionId);
  if (!lockedEntry) {
    lockedEntry = { createdAt: Date.now(), answers: /* @__PURE__ */ new Map() };
    checkedAnswersBySubmission.set(session.submissionId, lockedEntry);
  }
  const finalSelectedIdx = lockedEntry.answers.has(question.id) ? lockedEntry.answers.get(question.id) : chosen;
  if (!lockedEntry.answers.has(question.id)) {
    lockedEntry.answers.set(question.id, finalSelectedIdx);
  }
  const isCorrect = finalSelectedIdx === question.correctAnswerIndex;
  return {
    questionId: question.id,
    selectedOptionIndex: finalSelectedIdx,
    correctAnswerIndex: question.correctAnswerIndex,
    isCorrect,
    answerExplanation: question.optionExplanations[finalSelectedIdx] || "",
    correctOptionExplanation: question.optionExplanations[question.correctAnswerIndex] || "",
    conceptExplanation: question.conceptExplanation
  };
}
function evaluateKnowledgeCheckSubmission(params) {
  const thresholds = normalizeAdaptiveThresholds(params.thresholds);
  const answerDetails = params.questions.map((q) => {
    const rawChosen = params.submittedAnswers[q.id];
    const selectedOptionIndex = typeof rawChosen === "number" && Number.isInteger(rawChosen) && rawChosen >= 0 && rawChosen < q.options.length ? rawChosen : -1;
    if (selectedOptionIndex < 0) {
      throw new KnowledgeCheckApiError(
        400,
        "UNANSWERED_QUESTIONS",
        "Please answer every question before submitting your Knowledge Check."
      );
    }
    const isCorrect = selectedOptionIndex === q.correctAnswerIndex;
    return {
      questionId: q.id,
      topic: q.topic,
      objective: q.objective,
      question: q.question,
      options: q.options,
      selectedOptionIndex,
      correctAnswerIndex: q.correctAnswerIndex,
      isCorrect,
      answerExplanation: q.optionExplanations[selectedOptionIndex] || "",
      correctOptionExplanation: q.optionExplanations[q.correctAnswerIndex] || "",
      conceptExplanation: q.conceptExplanation
    };
  });
  const totalQuestions = answerDetails.length;
  const correctAnswers = answerDetails.filter((a) => a.isCorrect).length;
  const score = totalQuestions > 0 ? Math.round(correctAnswers / totalQuestions * 100) : 0;
  const topicBuckets = /* @__PURE__ */ new Map();
  for (const ans of answerDetails) {
    const normalizedKey = ans.topic.trim().toLowerCase();
    const bucket = topicBuckets.get(normalizedKey) ?? {
      topic: ans.topic.trim() || "Lesson Concept",
      totalQuestions: 0,
      correctAnswers: 0
    };
    bucket.totalQuestions += 1;
    if (ans.isCorrect) bucket.correctAnswers += 1;
    topicBuckets.set(normalizedKey, bucket);
  }
  const topicBreakdown = Array.from(
    topicBuckets.values()
  ).map((b) => {
    const accuracyPercent = Math.round(b.correctAnswers / b.totalQuestions * 100);
    return {
      topic: b.topic,
      totalQuestions: b.totalQuestions,
      correctAnswers: b.correctAnswers,
      accuracyPercent,
      proficiency: classifyTopicProficiency(accuracyPercent, thresholds)
    };
  });
  const needsImprovementTopics = topicBreakdown.filter((t) => t.proficiency === "Needs Improvement").map((t) => t.topic);
  const moderateTopics = topicBreakdown.filter((t) => t.proficiency === "Moderate").map((t) => t.topic);
  const focusTopics = needsImprovementTopics.length > 0 ? needsImprovementTopics : moderateTopics;
  const action = getAdaptiveRecommendationTier(score, thresholds);
  let recommendation;
  if (action === "next_lesson") {
    recommendation = {
      action,
      title: params.nextLesson ? `Ready for Next Lesson: ${params.nextLesson.lessonTitle}` : "Strong Mastery Achieved",
      description: params.nextLesson ? `You scored ${score}% (at or above the ${thresholds.advanceMinPercent}% mastery threshold). Move on to "${params.nextLesson.lessonTitle}" next${focusTopics.length > 0 ? `, while keeping an eye on: ${focusTopics.join(", ")}.` : "."}` : `You scored ${score}% and demonstrated strong command of ${params.lessonTitle}.`,
      thresholdsUsed: {
        advanceMinPercent: thresholds.advanceMinPercent,
        practiceMinPercent: thresholds.practiceMinPercent
      },
      targetStageId: params.nextLesson?.stageId ?? null,
      targetLessonId: params.nextLesson?.lessonId ?? null,
      targetLessonTitle: params.nextLesson?.lessonTitle ?? null,
      focusTopics
    };
  } else if (action === "additional_practice") {
    recommendation = {
      action,
      title: "Recommended: Additional Practice",
      description: `You scored ${score}% (${thresholds.practiceMinPercent}\u2013${thresholds.advanceMinPercent - 1}% range). Work through the Guided Practice Exercises or external labs${focusTopics.length > 0 ? ` focusing on ${focusTopics.join(", ")}` : ""}, then retake the Knowledge Check.`,
      thresholdsUsed: {
        advanceMinPercent: thresholds.advanceMinPercent,
        practiceMinPercent: thresholds.practiceMinPercent
      },
      targetStageId: params.stageId,
      targetLessonId: params.lessonId,
      targetLessonTitle: params.lessonTitle,
      focusTopics
    };
  } else {
    recommendation = {
      action,
      title: "Recommended: Review Lesson & Fundamentals",
      description: `You scored ${score}% (below ${thresholds.practiceMinPercent}%). Revisit the Learn step-by-step explanations and video resources${focusTopics.length > 0 ? ` for ${focusTopics.join(", ")}` : ""} before retaking the Knowledge Check.`,
      thresholdsUsed: {
        advanceMinPercent: thresholds.advanceMinPercent,
        practiceMinPercent: thresholds.practiceMinPercent
      },
      targetStageId: params.stageId,
      targetLessonId: params.lessonId,
      targetLessonTitle: params.lessonTitle,
      focusTopics
    };
  }
  return {
    userId: params.userId,
    roadmapId: params.roadmapId,
    stageId: params.stageId,
    lessonId: params.lessonId,
    lessonTitle: params.lessonTitle,
    submissionId: params.submissionId,
    score,
    totalQuestions,
    correctAnswers,
    answers: answerDetails,
    topicBreakdown,
    knowledgeGaps: needsImprovementTopics,
    recommendation,
    completedAt: params.completedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapDbRowToAttemptRecord(row) {
  const answers = Array.isArray(row.answers) ? row.answers : [];
  const topicBreakdown = Array.isArray(row.topic_breakdown) ? row.topic_breakdown : Array.isArray(row.topicBreakdown) ? row.topicBreakdown : [];
  const knowledgeGaps = Array.isArray(row.knowledge_gaps) ? row.knowledge_gaps.filter((g) => typeof g === "string") : Array.isArray(row.knowledgeGaps) ? row.knowledgeGaps.filter((g) => typeof g === "string") : [];
  const recRaw = row.recommendation ?? {};
  const thresholds = getServerAdaptiveThresholds();
  const score = Number(row.score) || 0;
  const action = recRaw.action === "next_lesson" || recRaw.action === "additional_practice" || recRaw.action === "review_fundamentals" ? recRaw.action : getAdaptiveRecommendationTier(score, thresholds);
  const recommendation = {
    action,
    title: typeof recRaw.title === "string" && recRaw.title ? recRaw.title : "Adaptive Recommendation",
    description: typeof recRaw.description === "string" ? recRaw.description : "",
    thresholdsUsed: recRaw.thresholdsUsed && typeof recRaw.thresholdsUsed === "object" ? {
      advanceMinPercent: Number(recRaw.thresholdsUsed.advanceMinPercent) || thresholds.advanceMinPercent,
      practiceMinPercent: Number(recRaw.thresholdsUsed.practiceMinPercent) || thresholds.practiceMinPercent
    } : {
      advanceMinPercent: thresholds.advanceMinPercent,
      practiceMinPercent: thresholds.practiceMinPercent
    },
    targetStageId: typeof recRaw.targetStageId === "string" ? recRaw.targetStageId : null,
    targetLessonId: typeof recRaw.targetLessonId === "string" ? recRaw.targetLessonId : null,
    targetLessonTitle: typeof recRaw.targetLessonTitle === "string" ? recRaw.targetLessonTitle : null,
    focusTopics: Array.isArray(recRaw.focusTopics) ? recRaw.focusTopics.filter((t) => typeof t === "string") : knowledgeGaps
  };
  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    userId: typeof row.user_id === "string" ? row.user_id : typeof row.userId === "string" ? row.userId : "",
    roadmapId: typeof row.roadmap_id === "string" ? row.roadmap_id : typeof row.roadmapId === "string" ? row.roadmapId : "",
    stageId: typeof row.stage_id === "string" ? row.stage_id : typeof row.stageId === "string" ? row.stageId : "",
    lessonId: typeof row.lesson_id === "string" ? row.lesson_id : typeof row.lessonId === "string" ? row.lessonId : "",
    lessonTitle: typeof row.lesson_title === "string" ? row.lesson_title : typeof row.lessonTitle === "string" ? row.lessonTitle : "Lesson Knowledge Check",
    submissionId: typeof row.submission_id === "string" ? row.submission_id : typeof row.submissionId === "string" ? row.submissionId : "",
    score,
    totalQuestions: Number(row.total_questions ?? row.totalQuestions) || answers.length,
    correctAnswers: Number(row.correct_answers ?? row.correctAnswers) || 0,
    answers,
    topicBreakdown,
    knowledgeGaps,
    recommendation,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : typeof row.completedAt === "string" ? row.completedAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function persistToRoadmapFallback(supabase, userId, payload) {
  const { data: roadmapRow, error: fetchErr } = await supabase.from("learning_roadmaps").select("id, roadmap_data").eq("id", payload.roadmapId).eq("user_id", userId).maybeSingle();
  if (fetchErr || !roadmapRow) {
    throw new KnowledgeCheckApiError(
      fetchErr?.code === "42501" ? 403 : 404,
      fetchErr?.code || "ROADMAP_NOT_FOUND",
      "Could not locate your roadmap record to save the Knowledge Check result."
    );
  }
  const rawData = roadmapRow.roadmap_data ?? {};
  const existingList = Array.isArray(rawData.knowledgeCheckAttempts) ? rawData.knowledgeCheckAttempts : [];
  const duplicate = existingList.find(
    (item) => (item.submissionId === payload.submissionId || item.submission_id === payload.submissionId) && typeof payload.submissionId === "string"
  );
  if (duplicate) {
    return {
      attempt: mapDbRowToAttemptRecord({ ...duplicate, user_id: userId }),
      duplicatePrevented: true
    };
  }
  const savedRecord = {
    ...payload,
    id: `kc-attempt-${payload.submissionId}`
  };
  const updatedRoadmapData = {
    ...rawData,
    knowledgeCheckAttempts: [savedRecord, ...existingList].slice(0, 150)
  };
  const { error: updateErr } = await supabase.from("learning_roadmaps").update({
    roadmap_data: updatedRoadmapData,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", payload.roadmapId).eq("user_id", userId);
  if (updateErr) {
    throw new KnowledgeCheckApiError(
      updateErr.code === "42501" ? 403 : 500,
      updateErr.code || "KNOWLEDGE_CHECK_SAVE_FAILED",
      "Could not save your Knowledge Check attempt to Supabase."
    );
  }
  return { attempt: savedRecord, duplicatePrevented: false };
}
async function fetchUserKnowledgeCheckHistoryWithMeta(supabase, userId) {
  let tableAttempts = [];
  let storageMode = "lesson_knowledge_checks";
  let schemaMigrationRequired = false;
  const { data: tableRows, error: tableError } = await supabase.from("lesson_knowledge_checks").select("*").eq("user_id", userId).order("completed_at", { ascending: false }).limit(200);
  if (tableError) {
    if (isMissingTableError(tableError)) {
      storageMode = "roadmap_jsonb_fallback";
      schemaMigrationRequired = true;
    } else {
      throw new KnowledgeCheckApiError(
        tableError.code === "42501" ? 403 : 500,
        tableError.code || "HISTORY_FETCH_FAILED",
        "Could not load your Knowledge Check history from Supabase."
      );
    }
  } else {
    tableAttempts = (tableRows ?? []).map(
      (row) => mapDbRowToAttemptRecord(row)
    );
  }
  const { data: roadmapRows, error: roadmapError } = await supabase.from("learning_roadmaps").select("id, user_id, roadmap_data").eq("user_id", userId).limit(25);
  if (roadmapError && storageMode === "roadmap_jsonb_fallback") {
    throw new KnowledgeCheckApiError(
      roadmapError.code === "42501" ? 403 : 500,
      roadmapError.code || "HISTORY_FALLBACK_FAILED",
      "Could not load your Knowledge Check history."
    );
  }
  const fallbackAttempts = [];
  for (const r of roadmapRows ?? []) {
    const row = r;
    const rData = row.roadmap_data ?? {};
    const list = Array.isArray(rData.knowledgeCheckAttempts) ? rData.knowledgeCheckAttempts : [];
    for (const item of list) {
      fallbackAttempts.push(
        mapDbRowToAttemptRecord({
          ...item,
          user_id: userId,
          roadmap_id: String(row.id ?? item.roadmapId ?? "")
        })
      );
    }
  }
  const bySubmissionId = /* @__PURE__ */ new Map();
  for (const attempt of [...tableAttempts, ...fallbackAttempts]) {
    const key = attempt.submissionId || attempt.id;
    if (!key) continue;
    if (!bySubmissionId.has(key)) {
      bySubmissionId.set(key, attempt);
    }
  }
  const merged = Array.from(bySubmissionId.values()).sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  return { attempts: merged, storageMode, schemaMigrationRequired };
}
async function handleSubmitKnowledgeCheck(params) {
  cleanupMemoryStores();
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  const session = verifyQuizSessionToken(params.quizToken, userId);
  const dedupeKey = `${userId}:${session.submissionId}`;
  const cached = completedSubmissionsCache.get(dedupeKey);
  if (cached) {
    return {
      attempt: cached.attempt,
      duplicatePrevented: true,
      storageMode: cached.storageMode
    };
  }
  const existingInFlight = inFlightSubmissions.get(dedupeKey);
  if (existingInFlight) {
    const res = await existingInFlight;
    return { ...res, duplicatePrevented: true };
  }
  const task = (async () => {
    const lockedAnswers = checkedAnswersBySubmission.get(session.submissionId)?.answers;
    const mergedAnswers = {
      ...params.answers ?? {}
    };
    if (lockedAnswers) {
      for (const [qId, chosenIdx] of lockedAnswers.entries()) {
        mergedAnswers[qId] = chosenIdx;
      }
    }
    const evaluated = evaluateKnowledgeCheckSubmission({
      userId,
      roadmapId: session.roadmapId,
      stageId: session.stageId,
      lessonId: session.lessonId,
      lessonTitle: session.lessonTitle,
      submissionId: session.submissionId,
      questions: session.questions,
      submittedAnswers: mergedAnswers,
      nextLesson: session.nextLesson,
      thresholds: getServerAdaptiveThresholds()
    });
    const { data: existingRow, error: lookupError } = await supabase.from("lesson_knowledge_checks").select("*").eq("user_id", userId).eq("submission_id", session.submissionId).maybeSingle();
    if (!lookupError && existingRow) {
      const existingAttempt = mapDbRowToAttemptRecord(
        existingRow
      );
      completedSubmissionsCache.set(dedupeKey, {
        createdAt: Date.now(),
        attempt: existingAttempt,
        storageMode: "lesson_knowledge_checks"
      });
      return {
        attempt: existingAttempt,
        duplicatePrevented: true,
        storageMode: "lesson_knowledge_checks"
      };
    }
    if (lookupError && isMissingTableError(lookupError)) {
      const fallbackResult = await persistToRoadmapFallback(
        supabase,
        userId,
        evaluated
      );
      completedSubmissionsCache.set(dedupeKey, {
        createdAt: Date.now(),
        attempt: fallbackResult.attempt,
        storageMode: "roadmap_jsonb_fallback"
      });
      return {
        ...fallbackResult,
        storageMode: "roadmap_jsonb_fallback"
      };
    }
    if (lookupError) {
      throw new KnowledgeCheckApiError(
        lookupError.code === "42501" ? 403 : 500,
        lookupError.code || "KNOWLEDGE_CHECK_LOOKUP_FAILED",
        "Could not verify existing quiz submissions in Supabase."
      );
    }
    const insertPayload = {
      user_id: userId,
      roadmap_id: evaluated.roadmapId,
      stage_id: evaluated.stageId,
      lesson_id: evaluated.lessonId,
      lesson_title: evaluated.lessonTitle,
      submission_id: evaluated.submissionId,
      score: evaluated.score,
      total_questions: evaluated.totalQuestions,
      correct_answers: evaluated.correctAnswers,
      answers: evaluated.answers,
      topic_breakdown: evaluated.topicBreakdown,
      knowledge_gaps: evaluated.knowledgeGaps,
      recommendation: evaluated.recommendation,
      completed_at: evaluated.completedAt
    };
    const { data: insertedRow, error: insertError } = await supabase.from("lesson_knowledge_checks").insert(insertPayload).select("*").single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raceRow } = await supabase.from("lesson_knowledge_checks").select("*").eq("user_id", userId).eq("submission_id", session.submissionId).maybeSingle();
        if (raceRow) {
          const raceAttempt = mapDbRowToAttemptRecord(
            raceRow
          );
          completedSubmissionsCache.set(dedupeKey, {
            createdAt: Date.now(),
            attempt: raceAttempt,
            storageMode: "lesson_knowledge_checks"
          });
          return {
            attempt: raceAttempt,
            duplicatePrevented: true,
            storageMode: "lesson_knowledge_checks"
          };
        }
      }
      if (isMissingTableError(insertError)) {
        const fallbackResult = await persistToRoadmapFallback(
          supabase,
          userId,
          evaluated
        );
        completedSubmissionsCache.set(dedupeKey, {
          createdAt: Date.now(),
          attempt: fallbackResult.attempt,
          storageMode: "roadmap_jsonb_fallback"
        });
        return {
          ...fallbackResult,
          storageMode: "roadmap_jsonb_fallback"
        };
      }
      throw new KnowledgeCheckApiError(
        insertError.code === "42501" ? 403 : 500,
        insertError.code || "KNOWLEDGE_CHECK_INSERT_FAILED",
        "Could not save your Knowledge Check attempt to Supabase."
      );
    }
    const savedAttempt = mapDbRowToAttemptRecord(
      insertedRow
    );
    completedSubmissionsCache.set(dedupeKey, {
      createdAt: Date.now(),
      attempt: savedAttempt,
      storageMode: "lesson_knowledge_checks"
    });
    return {
      attempt: savedAttempt,
      duplicatePrevented: false,
      storageMode: "lesson_knowledge_checks"
    };
  })();
  inFlightSubmissions.set(dedupeKey, task);
  try {
    return await task;
  } finally {
    inFlightSubmissions.delete(dedupeKey);
  }
}
async function handleGetKnowledgeCheckHistory(params) {
  const { userId, supabase } = await authenticateBearerRequest(params.authorizationHeader);
  return fetchUserKnowledgeCheckHistoryWithMeta(supabase, userId);
}

// server/assistantService.ts
import crypto3 from "crypto";
import { GoogleGenAI as GoogleGenAI4, ThinkingLevel as ThinkingLevel4, Type as Type4 } from "@google/genai";
import { createClient as createClient5 } from "@supabase/supabase-js";
var AssistantApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AssistantApiError";
    this.status = status;
    this.code = code;
  }
};
var chatHistoryByUser = /* @__PURE__ */ new Map();
var CHAT_COOLDOWN_MS = 2500;
var CHAT_WINDOW_MS = 10 * 6e4;
var MAX_CHAT_PER_WINDOW = 30;
var MAX_MESSAGE_CHARS = 2e3;
var MAX_CONTEXT_TURNS = 12;
function enforceSlidingRateLimit2(userId) {
  const now = Date.now();
  const timestamps = (chatHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < CHAT_WINDOW_MS
  );
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs && now - lastTs < CHAT_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((CHAT_COOLDOWN_MS - (now - lastTs)) / 1e3);
    throw new AssistantApiError(
      429,
      "RATE_LIMITED_COOLDOWN",
      `Please wait ${waitSeconds}s before sending another message.`
    );
  }
  if (timestamps.length >= MAX_CHAT_PER_WINDOW) {
    throw new AssistantApiError(
      429,
      "RATE_LIMITED_WINDOW",
      "You have sent many messages recently. Please wait a few minutes before continuing."
    );
  }
  chatHistoryByUser.set(userId, timestamps);
}
function recordChatUsage(userId) {
  const now = Date.now();
  const timestamps = (chatHistoryByUser.get(userId) ?? []).filter(
    (ts) => now - ts < CHAT_WINDOW_MS
  );
  timestamps.push(now);
  chatHistoryByUser.set(userId, timestamps);
}
function createUserScopedSupabaseClient5(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || "";
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new AssistantApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient5(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
var AUTH_TIMEOUT_MS = 6e3;
var PERSONALIZATION_QUERY_TIMEOUT_MS = 3500;
var PERSISTENCE_TIMEOUT_MS = 5e3;
var GEMINI_HTTP_TIMEOUT_MS = 45e3;
var PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
var FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite";
var PRIMARY_STREAM_FIRST_TOKEN_TIMEOUT_MS = 8500;
var FALLBACK_STREAM_FIRST_TOKEN_TIMEOUT_MS = 18e3;
var PRIMARY_JSON_TIMEOUT_MS = 12e3;
var FALLBACK_JSON_TIMEOUT_MS = 22e3;
var STREAM_IDLE_TIMEOUT_MS = 25e3;
var STREAM_MAX_TOTAL_MS = 55e3;
var JSON_MAX_TOTAL_MS = 4e4;
var PRIMARY_CIRCUIT_COOLDOWN_MS = 12e4;
var primaryCircuitOpenUntil = 0;
var primaryCircuitReason = "";
var halfOpenProbeInFlight = false;
var MAX_CONCURRENT_PER_USER = 2;
var MAX_CONCURRENT_GLOBAL_AI = 16;
var GLOBAL_QUEUE_WAIT_MS = 3500;
var activeRequestsByUser = /* @__PURE__ */ new Map();
var activeGlobalAiCalls = 0;
var globalAiWaiters = [];
function createRequestId(provided) {
  const clean = provided?.trim();
  if (clean && /^[a-zA-Z0-9_-]{6,40}$/.test(clean)) return clean;
  return `req_${crypto3.randomUUID().slice(0, 8)}`;
}
function acquireUserConcurrencySlot(userId) {
  const current = activeRequestsByUser.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_PER_USER) {
    throw new AssistantApiError(
      429,
      "CONCURRENT_REQUEST_LIMIT",
      "Your previous question is still finishing. Please wait a moment before sending another."
    );
  }
  activeRequestsByUser.set(userId, current + 1);
  return () => {
    const next = (activeRequestsByUser.get(userId) ?? 1) - 1;
    if (next <= 0) activeRequestsByUser.delete(userId);
    else activeRequestsByUser.set(userId, next);
  };
}
async function acquireGlobalAiSlot(signal) {
  if (activeGlobalAiCalls < MAX_CONCURRENT_GLOBAL_AI) {
    activeGlobalAiCalls += 1;
    let released2 = false;
    return () => {
      if (released2) return;
      released2 = true;
      activeGlobalAiCalls = Math.max(0, activeGlobalAiCalls - 1);
      const next = globalAiWaiters.shift();
      if (next) next();
    };
  }
  await new Promise((resolve, reject) => {
    let settled = false;
    const onWake = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (activeGlobalAiCalls < MAX_CONCURRENT_GLOBAL_AI) {
        activeGlobalAiCalls += 1;
        resolve();
      } else {
        reject(
          new AssistantApiError(
            503,
            "AI_CAPACITY_BUSY",
            "The AI Study Companion is handling high demand right now. Please retry in a few seconds."
          )
        );
      }
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const idx = globalAiWaiters.indexOf(onWake);
      if (idx !== -1) globalAiWaiters.splice(idx, 1);
      reject(new AssistantApiError(499, "CLIENT_ABORTED", "Request was cancelled."));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      const idx = globalAiWaiters.indexOf(onWake);
      if (idx !== -1) globalAiWaiters.splice(idx, 1);
      reject(
        new AssistantApiError(
          503,
          "AI_CAPACITY_BUSY",
          "The AI Study Companion is handling high demand right now. Please retry in a few seconds."
        )
      );
    }, GLOBAL_QUEUE_WAIT_MS);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    globalAiWaiters.push(onWake);
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeGlobalAiCalls = Math.max(0, activeGlobalAiCalls - 1);
    const next = globalAiWaiters.shift();
    if (next) next();
  };
}
function shouldTryPrimaryModel() {
  const now = Date.now();
  if (now < primaryCircuitOpenUntil) {
    return { usePrimary: false, isHalfOpenProbe: false };
  }
  if (primaryCircuitOpenUntil > 0) {
    if (halfOpenProbeInFlight) {
      return { usePrimary: false, isHalfOpenProbe: false };
    }
    halfOpenProbeInFlight = true;
    return { usePrimary: true, isHalfOpenProbe: true };
  }
  return { usePrimary: true, isHalfOpenProbe: false };
}
function recordPrimarySuccess(wasHalfOpenProbe) {
  if (wasHalfOpenProbe) {
    halfOpenProbeInFlight = false;
  }
  primaryCircuitOpenUntil = 0;
  primaryCircuitReason = "";
}
function recordPrimaryFailure(reason, wasHalfOpenProbe) {
  if (wasHalfOpenProbe) {
    halfOpenProbeInFlight = false;
  }
  primaryCircuitOpenUntil = Date.now() + PRIMARY_CIRCUIT_COOLDOWN_MS;
  primaryCircuitReason = reason.slice(0, 80);
  console.warn(
    `[Skillora][Assistant] Circuit opened for ${PRIMARY_GEMINI_MODEL} (${PRIMARY_CIRCUIT_COOLDOWN_MS}ms, reason=${primaryCircuitReason}); routing to ${FALLBACK_GEMINI_MODEL}.`
  );
}
async function withTimeout(promise, timeoutMs, timeoutCode, timeoutMessage) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new AssistantApiError(504, timeoutCode, timeoutMessage));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function settledWithinBudget(promiseLike, timeoutMs, fallbackValue) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promiseLike).catch(() => fallbackValue),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
var cachedGeminiKeyHash = "";
var cachedGeminiClient = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AssistantApiError(
      503,
      "GEMINI_KEY_MISSING",
      "AI Learning Assistant is unavailable because GEMINI_API_KEY is not configured on the server."
    );
  }
  const keyHash = crypto3.createHash("sha256").update(apiKey).digest("hex");
  if (!cachedGeminiClient || cachedGeminiKeyHash !== keyHash) {
    cachedGeminiKeyHash = keyHash;
    cachedGeminiClient = new GoogleGenAI4({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        },
        timeout: GEMINI_HTTP_TIMEOUT_MS
      }
    });
  }
  return cachedGeminiClient;
}
function isPermanentGeminiError(err) {
  const rawMessage = err instanceof Error ? err.message : String(err ?? "");
  const lower = rawMessage.toLowerCase();
  return lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("permission_denied") || lower.includes("403") || lower.includes("invalid_argument");
}
function isTransientOrFallbackEligibleError(err) {
  if (isPermanentGeminiError(err)) return false;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "");
  const lower = rawMessage.toLowerCase();
  return lower.includes("429") || lower.includes("resource_exhausted") || lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("504") || lower.includes("404") || lower.includes("not_found") || lower.includes("internal") || lower.includes("unavailable") || lower.includes("high demand") || lower.includes("overloaded") || lower.includes("deadline_exceeded") || lower.includes("timeout") || lower.includes("etimedout") || lower.includes("econnreset") || lower.includes("enotfound") || lower.includes("fetch failed") || lower.includes("network") || lower.includes("aborterror") || lower.includes("aborted");
}
function computeExponentialBackoffMs(attemptIndex) {
  const base = Math.min(2400, 600 * Math.pow(2, Math.max(0, attemptIndex - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}
function classifyGeminiErrorCategory(err) {
  if (err instanceof AssistantApiError) return err.code;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "");
  const lower = rawMessage.toLowerCase();
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid")) return "GEMINI_CONFIG_ERROR";
  if (lower.includes("permission_denied") || lower.includes("403")) return "GEMINI_PERMISSION_DENIED";
  if (lower.includes("resource_exhausted") || lower.includes("429")) return "GEMINI_QUOTA_EXCEEDED";
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand") || lower.includes("overloaded")) return "GEMINI_HIGH_DEMAND";
  if (lower.includes("deadline_exceeded") || lower.includes("timeout") || lower.includes("etimedout") || lower.includes("abort")) return "GEMINI_TIMEOUT";
  if (lower.includes("500") || lower.includes("502") || lower.includes("504")) return "GEMINI_UPSTREAM_5XX";
  if (lower.includes("not_found") || lower.includes("404")) return "GEMINI_MODEL_UNAVAILABLE";
  if (lower.includes("fetch failed") || lower.includes("econnreset") || lower.includes("enotfound") || lower.includes("network")) return "GEMINI_NETWORK_ERROR";
  return "GEMINI_CHAT_FAILED";
}
function mapGeminiError4(err) {
  if (err instanceof AssistantApiError) return err;
  const category = classifyGeminiErrorCategory(err);
  switch (category) {
    case "GEMINI_TIMEOUT":
      return new AssistantApiError(
        504,
        category,
        "The AI Study Companion took too long to respond. Please retry."
      );
    case "GEMINI_CONFIG_ERROR":
      return new AssistantApiError(
        502,
        category,
        "The AI service key is invalid. Please check GEMINI_API_KEY in Settings > Secrets."
      );
    case "GEMINI_PERMISSION_DENIED":
      return new AssistantApiError(
        502,
        category,
        "AI Study Companion request could not be authorized. Please verify GEMINI_API_KEY in Settings > Secrets."
      );
    case "GEMINI_QUOTA_EXCEEDED":
      return new AssistantApiError(
        429,
        category,
        "The AI Study Companion is temporarily busy due to quota limits. Please wait a moment and try again."
      );
    case "GEMINI_HIGH_DEMAND":
    case "GEMINI_UPSTREAM_5XX":
      return new AssistantApiError(
        503,
        category,
        "The AI Study Companion is experiencing temporary high demand. Please retry in a few seconds."
      );
    case "GEMINI_MODEL_UNAVAILABLE":
      return new AssistantApiError(
        502,
        category,
        "The configured AI model is currently unavailable. Please try again shortly."
      );
    case "GEMINI_NETWORK_ERROR":
      return new AssistantApiError(
        503,
        category,
        "Temporary network issue reaching the AI service. Please retry."
      );
    default:
      return new AssistantApiError(
        502,
        "GEMINI_CHAT_FAILED",
        "Could not reach your AI Study Companion right now. Please try again."
      );
  }
}
function isMissingAssistantTableError(err) {
  if (!err) return false;
  const code = (err.code || "").toUpperCase();
  const msg = (err.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("assistant_conversations") || msg.includes("assistant_messages") || msg.includes("schema cache");
}
function sanitizeTextNoUrls3(text, fallback = "") {
  if (typeof text !== "string") return fallback;
  const cleaned = text.replace(/https?:\/\/[^\s)]+/gi, "").replace(/\bwww\.[^\s)]+/gi, "").replace(/[ \t]+\n/g, "\n").trim();
  return cleaned || fallback;
}
function buildConversationTitle(firstMessage) {
  const cleaned = firstMessage.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Study Conversation";
  return cleaned.length > 64 ? `${cleaned.slice(0, 61).trim()}...` : cleaned;
}
function isValidUuid(id) {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim()
  );
}
function parseStringArray3(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
      }
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}
function parseKnowledgeLevel(value) {
  if (typeof value !== "string") return "Beginner";
  const normalized = value.trim().toLowerCase();
  if (normalized === "advanced") return "Advanced";
  if (normalized === "intermediate") return "Intermediate";
  return "Beginner";
}
function parsePositiveNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}
async function authenticateAssistantUser(authorizationHeader) {
  const authHeader = authorizationHeader?.trim() || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new AssistantApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with your Skillora account to use the AI Study Companion."
    );
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new AssistantApiError(
      401,
      "INVALID_AUTH_TOKEN",
      "Missing authentication token. Please sign in again."
    );
  }
  const supabase = createUserScopedSupabaseClient5(accessToken);
  const { data: userData, error: userError } = await withTimeout(
    supabase.auth.getUser(accessToken),
    AUTH_TIMEOUT_MS,
    "AUTH_TIMEOUT",
    "Authentication verification timed out. Please try again."
  );
  if (userError || !userData.user?.id) {
    throw new AssistantApiError(
      401,
      "UNAUTHORIZED",
      "Your session has expired or is invalid. Please sign in again."
    );
  }
  return {
    userId: userData.user.id,
    supabase,
    authMeta: userData.user.user_metadata ?? {}
  };
}
async function fetchAuthenticatedStudentContext(params) {
  const { userId, supabase, authMeta } = await authenticateAssistantUser(
    params.authorizationHeader
  );
  const requestedRoadmapId = isValidUuid(params.lessonContext?.roadmapId) ? params.lessonContext.roadmapId.trim() : null;
  const emptySingle = { data: null, error: null };
  const emptyList = { data: [], error: null };
  const roadmapPromise = requestedRoadmapId ? settledWithinBudget(
    supabase.from("learning_roadmaps").select("id, title, career_goal, status, roadmap_data, updated_at").eq("id", requestedRoadmapId).eq("user_id", userId).maybeSingle(),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    emptySingle
  ) : settledWithinBudget(
    supabase.from("learning_roadmaps").select("id, title, career_goal, status, roadmap_data, updated_at").eq("user_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    emptySingle
  );
  const [profileRes, primaryRoadmapRes, attemptsRes, quizRes] = await Promise.all([
    settledWithinBudget(
      supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptySingle
    ),
    roadmapPromise,
    settledWithinBudget(
      supabase.from("assessment_attempts").select("subject, difficulty, score_percent, strengths, knowledge_gaps, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptyList
    ),
    settledWithinBudget(
      supabase.from("lesson_knowledge_checks").select("lesson_id, lesson_title, score, knowledge_gaps, recommendation, completed_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(8),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptyList
    )
  ]);
  if (profileRes.error?.code === "42501") {
    throw new AssistantApiError(
      403,
      "RLS_DENIED",
      "Access to student profile was denied."
    );
  }
  let resolvedRoadmapRow = primaryRoadmapRes.data ?? null;
  if (!resolvedRoadmapRow && requestedRoadmapId) {
    const fallbackActiveRes = await settledWithinBudget(
      supabase.from("learning_roadmaps").select("id, title, career_goal, status, roadmap_data, updated_at").eq("user_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      emptySingle
    );
    resolvedRoadmapRow = fallbackActiveRes.data ?? null;
  }
  const profileRow = profileRes.data ?? {};
  const studentName = typeof profileRow.full_name === "string" && profileRow.full_name.trim() || typeof profileRow.name === "string" && profileRow.name.trim() || typeof authMeta.full_name === "string" && authMeta.full_name.trim() || typeof authMeta.name === "string" && authMeta.name.trim() || "Student";
  const educationLevel = typeof profileRow.education_level === "string" && profileRow.education_level.trim() || typeof authMeta.education_level === "string" && authMeta.education_level.trim() || "";
  const fieldOfStudy = typeof profileRow.field_of_study === "string" && profileRow.field_of_study.trim() || typeof authMeta.field_of_study === "string" && authMeta.field_of_study.trim() || "";
  const roadmapRow = resolvedRoadmapRow;
  const activeRoadmapData = roadmapRow && roadmapRow.roadmap_data && typeof roadmapRow.roadmap_data === "object" ? roadmapRow.roadmap_data : null;
  const dbPrimaryDirection = typeof profileRow.primary_direction === "string" ? profileRow.primary_direction.trim() : "";
  const metaPrimaryDirection = typeof authMeta.primary_direction === "string" ? authMeta.primary_direction.trim() : "";
  const primaryDirection = dbPrimaryDirection || metaPrimaryDirection;
  const careerGoal = typeof profileRow.career_goal === "string" && profileRow.career_goal.trim() || typeof authMeta.career_goal === "string" && authMeta.career_goal.trim() || typeof roadmapRow?.career_goal === "string" && roadmapRow.career_goal.trim() || "";
  const knowledgeLevel = parseKnowledgeLevel(
    profileRow.knowledge_level ?? authMeta.knowledge_level
  );
  const dbSkills = parseStringArray3(profileRow.current_skills);
  const currentSkills = dbSkills.length > 0 ? dbSkills : parseStringArray3(authMeta.current_skills);
  const dbInterests = parseStringArray3(profileRow.learning_interests);
  const learningInterests = dbInterests.length > 0 ? dbInterests : parseStringArray3(authMeta.learning_interests);
  const preferredHoursPerDay = parsePositiveNumber(
    profileRow.preferred_hours_per_day ?? profileRow.daily_study_hours ?? authMeta.preferred_hours_per_day,
    2
  );
  const activeRoadmapId = roadmapRow ? String(roadmapRow.id) : null;
  const activeRoadmapTitle = roadmapRow && typeof roadmapRow.title === "string" && roadmapRow.title.trim() ? roadmapRow.title.trim() : null;
  const activeRoadmapCareerGoal = roadmapRow && typeof roadmapRow.career_goal === "string" && roadmapRow.career_goal.trim() ? roadmapRow.career_goal.trim() : null;
  const rawStages = Array.isArray(activeRoadmapData?.stages) ? activeRoadmapData.stages : [];
  let totalLessonsCount = 0;
  let completedLessonsCount = 0;
  const stagesSummary = [];
  const roadmapTopicTokens = [];
  if (activeRoadmapTitle) roadmapTopicTokens.push(activeRoadmapTitle);
  if (activeRoadmapCareerGoal) roadmapTopicTokens.push(activeRoadmapCareerGoal);
  let matchedRequestedLesson = null;
  let firstIncompleteLesson = null;
  let firstLessonFallback = null;
  for (const st of rawStages) {
    if (!st || typeof st !== "object") continue;
    const stageId = typeof st.id === "string" ? st.id : "";
    const stageTitle = typeof st.title === "string" ? st.title : "Learning Stage";
    const stageDifficulty = typeof st.difficulty === "string" ? st.difficulty : knowledgeLevel;
    roadmapTopicTokens.push(stageTitle);
    const lessons = Array.isArray(st.lessons) ? st.lessons : [];
    let stageCompleted = 0;
    for (const l of lessons) {
      if (!l || typeof l !== "object") continue;
      totalLessonsCount += 1;
      const isCompleted = l.completed === true;
      if (isCompleted) {
        completedLessonsCount += 1;
        stageCompleted += 1;
      }
      const lessonId = typeof l.id === "string" ? l.id : "";
      const lessonTitle = typeof l.title === "string" ? l.title : "Lesson";
      const lessonDescription = typeof l.description === "string" ? l.description : "";
      const learningObjectives = Array.isArray(l.learningObjectives) ? l.learningObjectives.filter((o) => typeof o === "string" && o.trim().length > 0) : [];
      if (!isCompleted) {
        roadmapTopicTokens.push(lessonTitle);
      }
      const candidateLesson = activeRoadmapId ? {
        roadmapId: activeRoadmapId,
        stageId,
        stageTitle,
        lessonId,
        lessonTitle,
        lessonDescription,
        learningObjectives,
        completed: isCompleted
      } : null;
      if (candidateLesson && !firstLessonFallback) {
        firstLessonFallback = candidateLesson;
      }
      if (candidateLesson && !isCompleted && !firstIncompleteLesson) {
        firstIncompleteLesson = candidateLesson;
      }
      if (candidateLesson && params.lessonContext?.lessonId && lessonId === params.lessonContext.lessonId && (!params.lessonContext.stageId || stageId === params.lessonContext.stageId)) {
        matchedRequestedLesson = candidateLesson;
      }
    }
    stagesSummary.push({
      id: stageId,
      title: stageTitle,
      difficulty: stageDifficulty,
      completedCount: stageCompleted,
      totalCount: lessons.length
    });
  }
  const roadmapProgressPercent = totalLessonsCount > 0 ? Math.round(completedLessonsCount / totalLessonsCount * 100) : 0;
  const currentLesson = matchedRequestedLesson ?? firstIncompleteLesson ?? firstLessonFallback;
  const attemptSummaries = (Array.isArray(attemptsRes.data) ? attemptsRes.data : []).map((row) => {
    const r = row;
    const rawScore = Number(r.score_percent);
    return {
      subject: typeof r.subject === "string" && r.subject.trim() ? r.subject.trim() : "Assessment",
      difficulty: typeof r.difficulty === "string" && r.difficulty.trim() ? r.difficulty.trim() : "Intermediate",
      scorePercent: Number.isFinite(rawScore) ? rawScore : 0,
      strengths: parseStringArray3(r.strengths),
      gaps: parseStringArray3(r.knowledge_gaps),
      createdAt: typeof r.created_at === "string" ? r.created_at : ""
    };
  });
  const tableQuizSummaries = !quizRes.error && Array.isArray(quizRes.data) ? quizRes.data.map((row) => {
    const r = row;
    const rec = r.recommendation && typeof r.recommendation === "object" ? r.recommendation : {};
    const rawScore = Number(r.score);
    return {
      lessonId: typeof r.lesson_id === "string" ? r.lesson_id : "",
      lessonTitle: typeof r.lesson_title === "string" && r.lesson_title.trim() ? r.lesson_title.trim() : "Lesson Check",
      score: Number.isFinite(rawScore) ? rawScore : 0,
      knowledgeGaps: parseStringArray3(r.knowledge_gaps),
      actionType: typeof rec.actionType === "string" ? rec.actionType : "",
      completedAt: typeof r.completed_at === "string" ? r.completed_at : ""
    };
  }) : [];
  const embeddedQuizSummaries = Array.isArray(activeRoadmapData?.knowledgeCheckAttempts) ? activeRoadmapData.knowledgeCheckAttempts.map((attempt) => {
    const rec = attempt.recommendation && typeof attempt.recommendation === "object" ? attempt.recommendation : {};
    const gaps = attempt.knowledgeGaps ?? attempt.knowledge_gaps;
    const rawScore = Number(attempt.score);
    return {
      lessonId: String(attempt.lessonId ?? attempt.lesson_id ?? ""),
      lessonTitle: String(attempt.lessonTitle ?? attempt.lesson_title ?? "Lesson Check"),
      score: Number.isFinite(rawScore) ? rawScore : 0,
      knowledgeGaps: parseStringArray3(gaps),
      actionType: typeof rec.actionType === "string" ? rec.actionType : "",
      completedAt: String(attempt.completedAt ?? attempt.completed_at ?? "")
    };
  }) : [];
  const knowledgeCheckSummaries = tableQuizSummaries.length > 0 ? tableQuizSummaries : embeddedQuizSummaries;
  const lowScoreSubjects = attemptSummaries.filter((a) => a.scorePercent < 70).map((a) => a.subject);
  const allKnowledgeGaps = Array.from(
    /* @__PURE__ */ new Set([
      ...knowledgeCheckSummaries.flatMap((q) => q.knowledgeGaps),
      ...attemptSummaries.flatMap((a) => a.gaps)
    ])
  ).slice(0, 12);
  const explorePayload = buildExploreResourcesForContext(
    {
      primaryDirection,
      learningInterests,
      careerGoal,
      knowledgeLevel,
      fieldOfStudy,
      currentSkills,
      activeRoadmapTitle,
      activeRoadmapCareerGoal,
      roadmapSubjectsText: roadmapTopicTokens.join(" "),
      knowledgeGaps: allKnowledgeGaps,
      lowScoreSubjects,
      recentAssessmentsCount: attemptSummaries.length + knowledgeCheckSummaries.length
    },
    true
  );
  return {
    userId,
    supabase,
    studentName,
    educationLevel,
    fieldOfStudy,
    primaryDirection,
    careerGoal,
    knowledgeLevel,
    currentSkills,
    learningInterests,
    preferredHoursPerDay,
    activeRoadmapId,
    activeRoadmapTitle,
    activeRoadmapCareerGoal,
    activeRoadmapData,
    roadmapProgressPercent,
    completedLessonsCount,
    totalLessonsCount,
    stagesSummary,
    isExplicitStudyLesson: Boolean(matchedRequestedLesson),
    currentLesson,
    attemptSummaries: attemptSummaries.slice(0, 6),
    knowledgeCheckSummaries: knowledgeCheckSummaries.slice(0, 6),
    allKnowledgeGaps,
    personalizedResources: explorePayload.forYou
  };
}
function readFallbackStore(ctx) {
  const raw = ctx.activeRoadmapData?.assistantConversations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => Boolean(item && typeof item === "object")).map((item) => ({
    conversation: {
      id: String(item.conversation?.id ?? crypto3.randomUUID()),
      title: String(item.conversation?.title ?? "Study Conversation"),
      activeRoadmapId: item.conversation?.activeRoadmapId ?? null,
      activeStageId: item.conversation?.activeStageId ?? null,
      activeLessonId: item.conversation?.activeLessonId ?? null,
      createdAt: String(item.conversation?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()),
      updatedAt: String(item.conversation?.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString())
    },
    messages: Array.isArray(item.messages) ? item.messages : []
  }));
}
async function writeFallbackStore(ctx, entries) {
  if (!ctx.activeRoadmapId || !ctx.activeRoadmapData) {
    return "ephemeral";
  }
  const { data: latestRow } = await settledWithinBudget(
    ctx.supabase.from("learning_roadmaps").select("roadmap_data").eq("id", ctx.activeRoadmapId).eq("user_id", ctx.userId).maybeSingle(),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    { data: null, error: null }
  );
  const latestData = latestRow && typeof latestRow === "object" && latestRow.roadmap_data && typeof latestRow.roadmap_data === "object" ? latestRow.roadmap_data : ctx.activeRoadmapData;
  const trimmed = entries.slice(0, 10).map((entry) => {
    const seenIds = /* @__PURE__ */ new Set();
    const dedupedMessages = entry.messages.filter((m) => {
      if (!m?.id || seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    return {
      ...entry,
      messages: dedupedMessages.slice(-40)
    };
  });
  const nextData = {
    ...latestData,
    assistantConversations: trimmed
  };
  const { error } = await ctx.supabase.from("learning_roadmaps").update({
    roadmap_data: nextData,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", ctx.activeRoadmapId).eq("user_id", ctx.userId);
  if (error) {
    return "ephemeral";
  }
  ctx.activeRoadmapData = nextData;
  return "roadmap_fallback";
}
function mapCatalogEntriesToRecommended(entries) {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    provider: e.provider,
    type: e.type,
    tabCategory: e.tabCategory,
    subjectLabel: "subjectLabel" in e ? e.subjectLabel : String(e.primarySubject),
    url: e.url
  }));
}
var ASSISTANT_QUERY_STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "beginner",
  "by",
  "can",
  "could",
  "do",
  "does",
  "explain",
  "for",
  "from",
  "give",
  "help",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "learn",
  "me",
  "more",
  "my",
  "of",
  "on",
  "or",
  "please",
  "step",
  "tell",
  "that",
  "the",
  "this",
  "to",
  "understand",
  "want",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "would",
  "you",
  "your"
]);
function extractTopicTokens(text) {
  return Array.from(
    new Set(
      tokenize(text.toLowerCase()).filter(
        (t) => t.length >= 2 && !ASSISTANT_QUERY_STOP_WORDS.has(t)
      )
    )
  );
}
function selectCatalogResourcesForTurn(ctx, userMessage) {
  const catalog = getExploreResourceCatalog();
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const queryLower = userMessage.toLowerCase();
  const queryTokens = extractTopicTokens(queryLower);
  const lessonTitleLower = (ctx.currentLesson?.lessonTitle ?? "").toLowerCase();
  const lessonTokens = lessonTitleLower ? extractTopicTokens(lessonTitleLower) : [];
  const lessonOverlapsQuery = ctx.isExplicitStudyLesson || queryTokens.length === 0 || queryTokens.some((tok) => lessonTokens.includes(tok) || lessonTitleLower.includes(tok));
  const queryScored = [];
  for (const entry of catalog) {
    const haystack = `${entry.title} ${entry.description} ${entry.keywords.join(" ")} ${entry.domains.join(" ")}`.toLowerCase();
    const hayTokens = new Set(tokenize(haystack));
    let hits = 0;
    for (const tok of queryTokens) {
      if (containsWholeTerm(haystack, hayTokens, tok)) {
        hits += 2;
      }
    }
    if (lessonTitleLower && lessonOverlapsQuery) {
      for (const kw of entry.keywords) {
        if (lessonTitleLower.includes(kw.toLowerCase())) {
          hits += 1.5;
        }
      }
    }
    if (hits > 0) {
      queryScored.push({ entry, score: hits });
    }
  }
  queryScored.sort((a, b) => b.score - a.score);
  const combined = [];
  const seen = /* @__PURE__ */ new Set();
  if (queryScored.length > 0) {
    for (const q of queryScored.slice(0, 6)) {
      if (!seen.has(q.entry.id)) {
        seen.add(q.entry.id);
        combined.push(...mapCatalogEntriesToRecommended([q.entry]));
      }
    }
  }
  for (const item of ctx.personalizedResources.slice(0, 8)) {
    if (!seen.has(item.id) && byId.has(item.id)) {
      seen.add(item.id);
      combined.push({
        id: item.id,
        title: item.title,
        provider: item.provider,
        type: item.type,
        tabCategory: item.tabCategory,
        subjectLabel: item.subjectLabel,
        url: item.url
      });
    }
  }
  return combined.slice(0, 12);
}
var ASSISTANT_CHAT_SCHEMA = {
  type: Type4.OBJECT,
  properties: {
    answer: {
      type: Type4.STRING,
      description: "Clear, personalized, encouraging study companion response. Explain step-by-step when teaching concepts, provide hints before full answers during practice, and keep explanations tailored to the student level and discipline."
    },
    codeSnippet: {
      type: Type4.STRING,
      description: "Optional short runnable code/query/syntax snippet ONLY when the topic involves programming, HTML/CSS, SQL, or technical syntax. Leave empty string for non-programming subjects like Academic Writing, Public Speaking, Geography, or Management."
    },
    language: {
      type: Type4.STRING,
      description: "Code language label (e.g. python, javascript, css, sql, typescript) if codeSnippet is provided; otherwise empty string."
    },
    recommendedResourceIds: {
      type: Type4.ARRAY,
      items: { type: Type4.STRING },
      description: "Up to 3 exact resource IDs from the VERIFIED RESOURCE CANDIDATES list when recommending study resources or when helpful for weak topics/career goal. Leave empty array if none are relevant."
    },
    suggestedFollowUps: {
      type: Type4.ARRAY,
      items: { type: Type4.STRING },
      description: "2 or 3 short natural follow-up prompts the student might want to ask next based on this turn."
    }
  },
  required: ["answer", "recommendedResourceIds", "suggestedFollowUps"]
};
function buildStudentSystemInstruction(ctx, candidateResources, outputMode = "json") {
  const attemptLines = ctx.attemptSummaries.length > 0 ? ctx.attemptSummaries.slice(0, 4).map(
    (a) => `- ${a.subject} (${a.difficulty}): ${a.scorePercent}% | Strengths: ${a.strengths.slice(0, 4).join(", ") || "None"} | Gaps: ${a.gaps.slice(0, 4).join(", ") || "None"}`
  ).join("\n") : "No diagnostic skill assessments completed yet.";
  const quizLines = ctx.knowledgeCheckSummaries.length > 0 ? ctx.knowledgeCheckSummaries.slice(0, 4).map(
    (q) => `- Lesson "${q.lessonTitle}": ${q.score}% (${q.actionType || "completed"}) | Gaps: ${q.knowledgeGaps.slice(0, 4).join(", ") || "None"}`
  ).join("\n") : "No lesson knowledge checks completed yet.";
  const lessonBlock = ctx.currentLesson ? [
    ctx.isExplicitStudyLesson ? `Active / Current Lesson (student is studying this lesson now): "${ctx.currentLesson.lessonTitle}"` : `Next Suggested Roadmap Lesson (background context only \u2014 only reference if relevant to the student's question): "${ctx.currentLesson.lessonTitle}"`,
    `Stage: "${ctx.currentLesson.stageTitle}"`,
    `Status: ${ctx.currentLesson.completed ? "Completed" : "In Progress"}`,
    ctx.currentLesson.lessonDescription ? `Description: ${ctx.currentLesson.lessonDescription.slice(0, 320)}` : null,
    ctx.currentLesson.learningObjectives.length > 0 ? `Learning Objectives: ${ctx.currentLesson.learningObjectives.slice(0, 4).join("; ")}` : null
  ].filter(Boolean).join("\n") : "No active lesson selected yet.";
  const stageLines = ctx.stagesSummary.length > 0 ? ctx.stagesSummary.slice(0, 6).map(
    (s, idx) => `${idx + 1}. ${s.title} (${s.difficulty}) \u2014 ${s.completedCount}/${s.totalCount} lessons done`
  ).join("\n") : "No active roadmap generated yet.";
  const resourceLines = candidateResources.length > 0 ? candidateResources.slice(0, 6).map(
    (r) => outputMode === "json" ? `- ID="${r.id}" | ${r.title} (${r.provider}, ${r.type}, Subject: ${r.subjectLabel})` : `- ${r.title} (${r.provider}, ${r.type}, Subject: ${r.subjectLabel})`
  ).join("\n") : "No matching catalog resources available.";
  const formatRules = outputMode === "json" ? [
    "4. VERIFIED RESOURCES ONLY: Never write raw URLs in answer text and never invent external websites. Whenever resources help (or are requested), select up to 3 exact IDs from VERIFIED RESOURCE CANDIDATES in `recommendedResourceIds`.",
    "5. CODE SNIPPETS: Only populate `codeSnippet` and `language` when discussing programming, markup/CSS, SQL, or technical commands. Leave both empty strings for non-coding subjects.",
    "6. OUTPUT FORMAT: Return valid JSON strictly matching the response schema."
  ] : [
    "4. VERIFIED RESOURCES ONLY: Never write raw URLs and never invent external websites. When resources are helpful or requested, mention up to 2 relevant resource titles from the VERIFIED RESOURCE CANDIDATES list naturally by name.",
    "5. CODE SNIPPETS: If and ONLY IF the topic requires programming, markup/CSS, SQL, or technical commands, include at most ONE concise fenced code block (```language ... ```). Omit code blocks for non-coding topics.",
    "6. OUTPUT FORMAT: Write a clear, friendly, readable plain-text response directly for the student. Never output JSON, JSON schemas, internal instructions, or meta commentary."
  ];
  return [
    "You are the Skillora AI Study Companion \u2014 an accurate, empathetic, personalized academic and career mentor.",
    "",
    "AUTHENTICATED STUDENT PROFILE:",
    `- Name: ${ctx.studentName}`,
    `- Education Level: ${ctx.educationLevel || "Not specified"}`,
    `- Field of Study: ${ctx.fieldOfStudy || "General"}`,
    `- Knowledge Level: ${ctx.knowledgeLevel}`,
    `- Primary Learning Direction: ${ctx.primaryDirection || ctx.careerGoal || "Not specified"}`,
    `- Career Goal: ${ctx.careerGoal || "Not specified"}`,
    `- Current Skills: ${ctx.currentSkills.join(", ") || "None listed"}`,
    `- Supporting Learning Interests: ${ctx.learningInterests.join(", ") || "None listed"}`,
    `- Daily Study Availability: ${ctx.preferredHoursPerDay} hours/day`,
    "",
    "CURRENT LEARNING ROADMAP & PROGRESS:",
    `- Active Roadmap: ${ctx.activeRoadmapTitle || "None generated yet"} (${ctx.completedLessonsCount}/${ctx.totalLessonsCount} lessons completed, ${ctx.roadmapProgressPercent}%)`,
    stageLines,
    "",
    "CURRENT LESSON CONTEXT:",
    lessonBlock,
    "",
    "RECENT DIAGNOSTIC ASSESSMENTS:",
    attemptLines,
    "",
    "RECENT LESSON KNOWLEDGE CHECKS:",
    quizLines,
    "",
    `IDENTIFIED KNOWLEDGE GAPS: ${ctx.allKnowledgeGaps.join(", ") || "None recorded yet"}`,
    "",
    outputMode === "json" ? "VERIFIED RESOURCE CANDIDATES (ONLY recommend IDs from this exact list):" : "VERIFIED RESOURCE CANDIDATES (mention by title only if helpful; verified cards are attached separately):",
    resourceLines,
    "",
    "CRITICAL BEHAVIOR RULES:",
    "1. ANSWER THE EXACT QUESTION FIRST: Directly answer what the student actually asked right now \u2014 clearly, accurately, and calibrated to their knowledge level. Never hijack general or direct questions with generic greetings, repetitive profile recaps, forced career speeches, or unrelated lesson detours.",
    "2. NATURAL PERSONALIZATION & PEDAGOGICAL MODES:",
    "   - Connect explanations or examples to their Primary Learning Direction, active roadmap, skills, or lesson ONLY when genuinely helpful or when asked about their learning path/study plan.",
    "   - Concept explanations: Break concepts down step-by-step in plain language with practical real-world examples.",
    "   - Practice & weak areas: When asked for practice or help with gaps, generate tailored exercises and give a helpful hint BEFORE giving away answers unless the student already submitted an attempt.",
    "   - Explaining mistakes: Diagnose why a misconception happens and guide them to the right reasoning constructively.",
    `3. MULTI-TURN CONTEXT & TOPIC SHIFTS: Resolve genuine follow-ups ("give a practical example", "make it simpler", "quiz me on that") using recent turns, while letting the student's current message cleanly override earlier unrelated topics.`,
    ...formatRules
  ].join("\n");
}
async function loadMinimalRoadmapFallbackStore(supabase, userId) {
  const { data: row } = await settledWithinBudget(
    supabase.from("learning_roadmaps").select("id, roadmap_data").eq("user_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    { data: null, error: null }
  );
  const roadmapRow = row ?? null;
  const activeRoadmapId = roadmapRow ? String(roadmapRow.id) : null;
  const activeRoadmapData = roadmapRow && roadmapRow.roadmap_data && typeof roadmapRow.roadmap_data === "object" ? roadmapRow.roadmap_data : null;
  const raw = activeRoadmapData?.assistantConversations;
  const entries = Array.isArray(raw) ? raw.filter((item) => Boolean(item && typeof item === "object")).map((item) => ({
    conversation: {
      id: String(item.conversation?.id ?? crypto3.randomUUID()),
      title: String(item.conversation?.title ?? "Study Conversation"),
      activeRoadmapId: item.conversation?.activeRoadmapId ?? null,
      activeStageId: item.conversation?.activeStageId ?? null,
      activeLessonId: item.conversation?.activeLessonId ?? null,
      createdAt: String(item.conversation?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()),
      updatedAt: String(item.conversation?.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString())
    },
    messages: Array.isArray(item.messages) ? item.messages : []
  })) : [];
  return { activeRoadmapId, activeRoadmapData, entries };
}
async function handleListAssistantConversations(params) {
  const { userId, supabase } = await authenticateAssistantUser(params.authorizationHeader);
  const convRes = await settledWithinBudget(
    supabase.from("assistant_conversations").select(
      "id, title, active_roadmap_id, active_stage_id, active_lesson_id, created_at, updated_at"
    ).eq("user_id", userId).order("updated_at", { ascending: false }).limit(20),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    {
      data: null,
      error: { code: "TIMEOUT", message: "Conversation list query timed out" }
    }
  );
  const convRows = convRes.data;
  const convErr = convRes.error;
  if (convErr) {
    if (convErr.code !== "TIMEOUT" && !isMissingAssistantTableError(convErr)) {
      throw new AssistantApiError(
        convErr.code === "42501" ? 403 : 500,
        convErr.code || "CONVERSATIONS_LOAD_FAILED",
        "Could not load your AI Study Companion conversations."
      );
    }
    const fallback = await loadMinimalRoadmapFallbackStore(supabase, userId);
    const fallbackStore = fallback.entries.sort(
      (a, b) => b.conversation.updatedAt.localeCompare(a.conversation.updatedAt)
    );
    const conversations2 = fallbackStore.map((s) => s.conversation);
    const targetId = params.conversationId && conversations2.some((c) => c.id === params.conversationId) ? params.conversationId : conversations2[0]?.id ?? null;
    const activeEntry = fallbackStore.find((s) => s.conversation.id === targetId);
    return {
      conversations: conversations2,
      activeConversationId: targetId,
      messages: activeEntry?.messages ?? [],
      storageMode: fallback.activeRoadmapId ? "roadmap_fallback" : "ephemeral"
    };
  }
  const conversations = (convRows ?? []).map((row) => {
    const r = row;
    return {
      id: String(r.id),
      title: typeof r.title === "string" && r.title.trim() ? r.title : "Study Conversation",
      activeRoadmapId: typeof r.active_roadmap_id === "string" ? r.active_roadmap_id : null,
      activeStageId: typeof r.active_stage_id === "string" ? r.active_stage_id : null,
      activeLessonId: typeof r.active_lesson_id === "string" ? r.active_lesson_id : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at)
    };
  });
  const activeConversationId = params.conversationId && conversations.some((c) => c.id === params.conversationId) ? params.conversationId : conversations[0]?.id ?? null;
  if (!activeConversationId) {
    return {
      conversations,
      activeConversationId: null,
      messages: [],
      storageMode: "table"
    };
  }
  const msgRes = await settledWithinBudget(
    supabase.from("assistant_messages").select(
      "id, conversation_id, sender, content, code_snippet, code_language, recommended_resources, suggested_follow_ups, created_at"
    ).eq("conversation_id", activeConversationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
    PERSONALIZATION_QUERY_TIMEOUT_MS,
    {
      data: null,
      error: { code: "TIMEOUT", message: "Messages query timed out" }
    }
  );
  const msgRows = msgRes.data;
  const msgErr = msgRes.error;
  if (msgErr) {
    if (msgErr.code === "TIMEOUT") {
      return {
        conversations,
        activeConversationId,
        messages: [],
        storageMode: "table"
      };
    }
    throw new AssistantApiError(
      msgErr.code === "42501" ? 403 : 500,
      msgErr.code || "MESSAGES_LOAD_FAILED",
      "Could not load conversation messages."
    );
  }
  const messages = (msgRows ?? []).slice().reverse().map((row) => {
    const r = row;
    return {
      id: String(r.id),
      conversationId: String(r.conversation_id),
      sender: r.sender === "user" ? "user" : "assistant",
      text: String(r.content ?? ""),
      createdAt: String(r.created_at),
      ...typeof r.code_snippet === "string" && r.code_snippet.trim() ? { codeSnippet: r.code_snippet } : {},
      ...typeof r.code_language === "string" && r.code_language.trim() ? { language: r.code_language } : {},
      ...Array.isArray(r.recommended_resources) ? {
        recommendedResources: r.recommended_resources
      } : {},
      ...Array.isArray(r.suggested_follow_ups) ? {
        suggestedFollowUps: r.suggested_follow_ups.filter(
          (f) => typeof f === "string"
        )
      } : {}
    };
  });
  return {
    conversations,
    activeConversationId,
    messages,
    storageMode: "table"
  };
}
async function handleCreateAssistantConversation(params) {
  const ctx = await fetchAuthenticatedStudentContext({
    authorizationHeader: params.authorizationHeader,
    lessonContext: params.lessonContext
  });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const title = params.title?.trim() ? buildConversationTitle(params.title.trim()) : "New Study Conversation";
  const newConv = {
    id: crypto3.randomUUID(),
    title,
    activeRoadmapId: ctx.activeRoadmapId,
    activeStageId: ctx.currentLesson?.stageId ?? null,
    activeLessonId: ctx.currentLesson?.lessonId ?? null,
    createdAt: now,
    updatedAt: now
  };
  const { data, error } = await ctx.supabase.from("assistant_conversations").insert({
    id: newConv.id,
    user_id: ctx.userId,
    title: newConv.title,
    active_roadmap_id: newConv.activeRoadmapId,
    active_stage_id: newConv.activeStageId,
    active_lesson_id: newConv.activeLessonId,
    created_at: now,
    updated_at: now
  }).select(
    "id, title, active_roadmap_id, active_stage_id, active_lesson_id, created_at, updated_at"
  ).single();
  if (error) {
    if (!isMissingAssistantTableError(error)) {
      throw new AssistantApiError(
        error.code === "42501" ? 403 : 500,
        error.code || "CONVERSATION_CREATE_FAILED",
        "Could not start a new conversation right now."
      );
    }
    const existing = readFallbackStore(ctx);
    const mode = await writeFallbackStore(ctx, [
      { conversation: newConv, messages: [] },
      ...existing
    ]);
    return { conversation: newConv, storageMode: mode };
  }
  return {
    conversation: {
      id: String(data.id),
      title: String(data.title),
      activeRoadmapId: data.active_roadmap_id ?? null,
      activeStageId: data.active_stage_id ?? null,
      activeLessonId: data.active_lesson_id ?? null,
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at)
    },
    storageMode: "table"
  };
}
async function handleDeleteAssistantConversation(params) {
  const convId = params.conversationId?.trim();
  if (!isValidUuid(convId)) {
    throw new AssistantApiError(400, "INVALID_CONVERSATION_ID", "Invalid conversation ID.");
  }
  const { userId, supabase } = await authenticateAssistantUser(params.authorizationHeader);
  const { error } = await settledWithinBudget(
    supabase.from("assistant_conversations").delete().eq("id", convId).eq("user_id", userId),
    PERSISTENCE_TIMEOUT_MS,
    { error: { code: "TIMEOUT", message: "Conversation delete timed out" } }
  );
  if (error) {
    if (error.code !== "TIMEOUT" && !isMissingAssistantTableError(error)) {
      throw new AssistantApiError(
        error.code === "42501" ? 403 : 500,
        error.code || "CONVERSATION_DELETE_FAILED",
        "Could not delete conversation."
      );
    }
    const fallback = await loadMinimalRoadmapFallbackStore(supabase, userId);
    if (fallback.activeRoadmapId && fallback.activeRoadmapData) {
      const filtered = fallback.entries.filter((s) => s.conversation.id !== convId);
      const nextData = {
        ...fallback.activeRoadmapData,
        assistantConversations: filtered.slice(0, 10)
      };
      await settledWithinBudget(
        supabase.from("learning_roadmaps").update({
          roadmap_data: nextData,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", fallback.activeRoadmapId).eq("user_id", userId),
        PERSISTENCE_TIMEOUT_MS,
        { error: null }
      );
    }
    return { deleted: true };
  }
  return { deleted: true };
}
function resolveRecommendedResourcesFromIds(recommendedIds, candidateById, fullCatalogById) {
  const recommendedResources = [];
  const seenRecIds = /* @__PURE__ */ new Set();
  for (const rawId of recommendedIds) {
    const cleanId = rawId.trim();
    if (!cleanId || seenRecIds.has(cleanId)) continue;
    const fromCandidate = candidateById.get(cleanId);
    if (fromCandidate) {
      seenRecIds.add(cleanId);
      recommendedResources.push(fromCandidate);
    } else {
      const fromCatalog = fullCatalogById.get(cleanId);
      if (fromCatalog) {
        seenRecIds.add(cleanId);
        recommendedResources.push(...mapCatalogEntriesToRecommended([fromCatalog]));
      }
    }
    if (recommendedResources.length >= 3) break;
  }
  return recommendedResources;
}
function stripUrlsKeepWhitespace(text) {
  return text.replace(/https?:\/\/[^\s)]+/gi, "").replace(/\bwww\.[^\s)]+/gi, "");
}
function stripJsonCodeFences(rawText) {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}
function selectStreamRecommendedResources(candidateResources, userMessage, answerText) {
  if (candidateResources.length === 0) return [];
  const queryLower = userMessage.toLowerCase();
  const wantsResources = /\b(resource|resources|video|videos|tutorial|tutorials|course|courses|docs|documentation|recommend|where can i learn|study material|materials)\b/.test(
    queryLower
  );
  const asksGeneralTrack = /\b(track|direction|roadmap|path|plan|focus|for me|my goal)\b/.test(queryLower);
  const queryTokens = extractTopicTokens(queryLower);
  const answerLower = answerText.toLowerCase();
  const scored = [];
  for (const r of candidateResources) {
    const titleLower = r.title.toLowerCase();
    const subjLower = r.subjectLabel.toLowerCase();
    const metaTokens = new Set(tokenize(`${titleLower} ${subjLower}`));
    let score = 0;
    if (answerLower.includes(titleLower)) score += 5;
    for (const tok of queryTokens) {
      if (containsWholeTerm(`${titleLower} ${subjLower}`, metaTokens, tok)) {
        score += 2;
      }
    }
    if (score >= 2) {
      scored.push({ item: r, score });
    } else if (wantsResources && (asksGeneralTrack || queryTokens.length <= 2)) {
      scored.push({ item: r, score: 1 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, wantsResources ? 3 : 2).map((s) => s.item);
}
function buildStreamSuggestedFollowUps(ctx, userMessage) {
  const queryLower = userMessage.toLowerCase();
  const suggestions = [];
  if (!queryLower.includes("example")) {
    suggestions.push("Can you give me a practical real-world example of this?");
  }
  if (!queryLower.includes("quiz") && !queryLower.includes("practice")) {
    suggestions.push("Give me a quick practice question with a hint.");
  }
  if (ctx.currentLesson?.lessonTitle && !queryLower.includes(ctx.currentLesson.lessonTitle.toLowerCase())) {
    suggestions.push(`How does this connect to "${ctx.currentLesson.lessonTitle}"?`);
  } else {
    suggestions.push("What should I focus on next for my study goal?");
  }
  return suggestions.slice(0, 3);
}
function extractCodeBlockFromMarkdownText(rawText) {
  const match = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/.exec(rawText);
  if (!match) {
    return { cleanText: rawText.trim() };
  }
  const language = match[1]?.trim().toLowerCase() || void 0;
  const codeSnippet = match[2]?.trim() || void 0;
  const cleanText = rawText.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    cleanText: cleanText || rawText.trim(),
    ...codeSnippet ? { codeSnippet, language } : {}
  };
}
var MAX_HISTORY_TURN_CHARS = 1e3;
var MAX_HISTORY_TOTAL_CHARS = 5e3;
function trimAndBudgetHistory(turns) {
  const cleaned = turns.map((t) => ({
    sender: t.sender,
    text: t.text.trim().slice(0, MAX_HISTORY_TURN_CHARS)
  })).filter((t) => t.text.length > 0).slice(-MAX_CONTEXT_TURNS);
  const budgeted = [];
  let remainingChars = MAX_HISTORY_TOTAL_CHARS;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const turn = cleaned[i];
    if (turn.text.length > remainingChars && budgeted.length > 0) {
      break;
    }
    const boundedText = turn.text.length > remainingChars ? turn.text.slice(0, remainingChars) : turn.text;
    remainingChars -= boundedText.length;
    budgeted.unshift({ sender: turn.sender, text: boundedText });
  }
  return budgeted;
}
function normalizeGeminiContents(priorHistory, currentMessage) {
  const contents = [];
  for (const turn of priorHistory) {
    const role = turn.sender === "user" ? "user" : "model";
    const text = turn.text.trim();
    if (!text) continue;
    if (contents.length === 0 && role !== "user") continue;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      const prevText = prev.parts?.[0]?.text ?? "";
      prev.parts = [{ text: `${prevText}

${text}`.slice(-MAX_HISTORY_TURN_CHARS) }];
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  const last = contents[contents.length - 1];
  if (last && last.role === "user") {
    const prevText = last.parts?.[0]?.text ?? "";
    if (prevText === currentMessage) {
      return contents;
    }
    last.parts = [{ text: `${prevText}

${currentMessage}`.slice(-MAX_MESSAGE_CHARS) }];
    return contents;
  }
  contents.push({
    role: "user",
    parts: [{ text: currentMessage }]
  });
  return contents;
}
async function prepareChatContextAndHistory(params) {
  const trimmedMessage = typeof params.message === "string" ? params.message.trim() : "";
  if (!trimmedMessage || trimmedMessage.length < 2) {
    throw new AssistantApiError(
      400,
      "INVALID_MESSAGE",
      "Please enter a clear question or prompt for your AI Study Companion."
    );
  }
  if (trimmedMessage.length > MAX_MESSAGE_CHARS) {
    throw new AssistantApiError(
      400,
      "MESSAGE_TOO_LONG",
      `Please keep your message under ${MAX_MESSAGE_CHARS} characters.`
    );
  }
  const contextStart = Date.now();
  const ctx = await fetchAuthenticatedStudentContext({
    authorizationHeader: params.authorizationHeader,
    lessonContext: params.lessonContext
  });
  const contextMs = Date.now() - contextStart;
  enforceSlidingRateLimit2(ctx.userId);
  let targetConversationId = isValidUuid(params.conversationId) ? params.conversationId.trim() : null;
  let priorHistory = [];
  let storageMode = "table";
  let activeConversation = null;
  const historyStart = Date.now();
  if (targetConversationId) {
    const convLookup = await settledWithinBudget(
      ctx.supabase.from("assistant_conversations").select(
        "id, title, active_roadmap_id, active_stage_id, active_lesson_id, created_at, updated_at"
      ).eq("id", targetConversationId).eq("user_id", ctx.userId).maybeSingle(),
      PERSONALIZATION_QUERY_TIMEOUT_MS,
      { data: null, error: { code: "TIMEOUT", message: "Lookup timed out" } }
    );
    const convErr = convLookup.error;
    const convRow = convLookup.data;
    if (convErr) {
      if (convErr.code === "TIMEOUT") {
        storageMode = ctx.activeRoadmapId ? "roadmap_fallback" : "ephemeral";
      } else if (!isMissingAssistantTableError(convErr)) {
        throw new AssistantApiError(
          convErr.code === "42501" ? 403 : 500,
          convErr.code || "CONVERSATION_LOOKUP_FAILED",
          "Could not verify your conversation."
        );
      } else {
        storageMode = ctx.activeRoadmapId ? "roadmap_fallback" : "ephemeral";
      }
      const fallbackEntry = readFallbackStore(ctx).find(
        (s) => s.conversation.id === targetConversationId
      );
      if (fallbackEntry) {
        activeConversation = fallbackEntry.conversation;
        priorHistory = fallbackEntry.messages.slice(-MAX_CONTEXT_TURNS).map((m) => ({ sender: m.sender, text: m.text }));
      }
    } else if (convRow) {
      activeConversation = {
        id: String(convRow.id),
        title: String(convRow.title),
        activeRoadmapId: convRow.active_roadmap_id ?? null,
        activeStageId: convRow.active_stage_id ?? null,
        activeLessonId: convRow.active_lesson_id ?? null,
        createdAt: String(convRow.created_at),
        updatedAt: String(convRow.updated_at)
      };
      const priorRes = await settledWithinBudget(
        ctx.supabase.from("assistant_messages").select("sender, content").eq("conversation_id", targetConversationId).eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(MAX_CONTEXT_TURNS),
        PERSONALIZATION_QUERY_TIMEOUT_MS,
        { data: [], error: null }
      );
      if (Array.isArray(priorRes.data)) {
        priorHistory = priorRes.data.slice().reverse().map((r) => ({
          sender: r.sender === "user" ? "user" : "assistant",
          text: String(r.content ?? "")
        }));
      }
    } else {
      targetConversationId = null;
    }
  }
  if (priorHistory.length === 0 && Array.isArray(params.history)) {
    priorHistory = params.history.filter(
      (h) => Boolean(h) && (h.sender === "user" || h.sender === "assistant") && typeof h.text === "string" && h.text.trim().length > 0
    ).slice(-MAX_CONTEXT_TURNS).map((h) => ({
      sender: h.sender,
      text: h.text.trim()
    }));
  }
  if (activeConversation?.activeRoadmapId && ctx.activeRoadmapId && activeConversation.activeRoadmapId !== ctx.activeRoadmapId) {
    priorHistory = [];
  }
  const budgetedHistory = trimAndBudgetHistory(priorHistory);
  const historyMs = Date.now() - historyStart;
  const candidateResources = selectCatalogResourcesForTurn(ctx, trimmedMessage);
  const candidateById = new Map(candidateResources.map((r) => [r.id, r]));
  const fullCatalogById = new Map(
    getExploreResourceCatalog().map((c) => [c.id, c])
  );
  const contents = normalizeGeminiContents(budgetedHistory, trimmedMessage);
  return {
    trimmedMessage,
    ctx,
    targetConversationId,
    activeConversation,
    storageMode,
    candidateResources,
    candidateById,
    fullCatalogById,
    contents,
    timings: { contextMs, historyMs }
  };
}
function deriveDeterministicUuid(seed) {
  const bytes = crypto3.createHash("sha256").update(seed).digest();
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
async function persistAssistantTurn(params) {
  const { ctx, targetConversationId } = params;
  let { activeConversation, storageMode } = params;
  const nowUser = (/* @__PURE__ */ new Date()).toISOString();
  const nowAssistant = new Date(Date.now() + 5).toISOString();
  if (!activeConversation) {
    activeConversation = {
      id: targetConversationId ?? crypto3.randomUUID(),
      title: buildConversationTitle(params.trimmedMessage),
      activeRoadmapId: ctx.activeRoadmapId,
      activeStageId: ctx.currentLesson?.stageId ?? null,
      activeLessonId: ctx.currentLesson?.lessonId ?? null,
      createdAt: nowUser,
      updatedAt: nowAssistant
    };
  } else {
    const shouldAutoTitle = activeConversation.title === "New Study Conversation" || activeConversation.title === "Study Conversation";
    activeConversation = {
      ...activeConversation,
      title: shouldAutoTitle ? buildConversationTitle(params.trimmedMessage) : activeConversation.title,
      activeRoadmapId: ctx.activeRoadmapId ?? activeConversation.activeRoadmapId ?? null,
      activeStageId: ctx.currentLesson?.stageId ?? activeConversation.activeStageId ?? null,
      activeLessonId: ctx.currentLesson?.lessonId ?? activeConversation.activeLessonId ?? null,
      updatedAt: nowAssistant
    };
  }
  const validClientTurnId = isValidUuid(params.clientTurnId) ? params.clientTurnId.trim() : null;
  const userMessageId = validClientTurnId ?? crypto3.randomUUID();
  const assistantMessageId = validClientTurnId ? deriveDeterministicUuid(`assistant:${validClientTurnId}`) : crypto3.randomUUID();
  const userMessage = {
    id: userMessageId,
    conversationId: activeConversation.id,
    sender: "user",
    text: params.trimmedMessage,
    createdAt: nowUser
  };
  const assistantMessage = {
    id: assistantMessageId,
    conversationId: activeConversation.id,
    sender: "assistant",
    text: params.answer,
    createdAt: nowAssistant,
    ...params.codeSnippet ? { codeSnippet: params.codeSnippet } : {},
    ...params.language ? { language: params.language } : {},
    ...params.recommendedResources.length > 0 ? { recommendedResources: params.recommendedResources } : {},
    ...params.suggestedFollowUps.length > 0 ? { suggestedFollowUps: params.suggestedFollowUps } : {}
  };
  if (storageMode === "table") {
    const upsertRes = await settledWithinBudget(
      ctx.supabase.from("assistant_conversations").upsert(
        {
          id: activeConversation.id,
          user_id: ctx.userId,
          title: activeConversation.title,
          active_roadmap_id: activeConversation.activeRoadmapId,
          active_stage_id: activeConversation.activeStageId,
          active_lesson_id: activeConversation.activeLessonId,
          created_at: activeConversation.createdAt,
          updated_at: activeConversation.updatedAt
        },
        { onConflict: "id" }
      ),
      PERSISTENCE_TIMEOUT_MS,
      { error: { code: "TIMEOUT", message: "Persistence timed out" } }
    );
    if (upsertRes.error) {
      if (isMissingAssistantTableError(upsertRes.error) || upsertRes.error.code === "TIMEOUT") {
        storageMode = ctx.activeRoadmapId ? "roadmap_fallback" : "ephemeral";
      } else {
        console.error("[Skillora] Assistant conversation upsert failed:", upsertRes.error.code);
        storageMode = ctx.activeRoadmapId ? "roadmap_fallback" : "ephemeral";
      }
    } else {
      const insertMsgsRes = await settledWithinBudget(
        ctx.supabase.from("assistant_messages").upsert(
          [
            {
              id: userMessage.id,
              conversation_id: activeConversation.id,
              user_id: ctx.userId,
              sender: "user",
              content: userMessage.text,
              created_at: userMessage.createdAt
            },
            {
              id: assistantMessage.id,
              conversation_id: activeConversation.id,
              user_id: ctx.userId,
              sender: "assistant",
              content: assistantMessage.text,
              code_snippet: assistantMessage.codeSnippet ?? null,
              code_language: assistantMessage.language ?? null,
              recommended_resources: assistantMessage.recommendedResources ?? [],
              suggested_follow_ups: assistantMessage.suggestedFollowUps ?? [],
              created_at: assistantMessage.createdAt
            }
          ],
          { onConflict: "id", ignoreDuplicates: true }
        ),
        PERSISTENCE_TIMEOUT_MS,
        { error: { code: "TIMEOUT", message: "Message save timed out" } }
      );
      if (insertMsgsRes.error) {
        storageMode = ctx.activeRoadmapId ? "roadmap_fallback" : "ephemeral";
      }
    }
  }
  if (storageMode !== "table") {
    const existingStore = readFallbackStore(ctx);
    const existingEntry = existingStore.find(
      (e) => e.conversation.id === activeConversation.id
    );
    const existingMsgs = existingEntry?.messages ?? [];
    const seenIds = new Set(existingMsgs.map((m) => m.id));
    const toAppend = [userMessage, assistantMessage].filter((m) => !seenIds.has(m.id));
    const nextEntry = {
      conversation: activeConversation,
      messages: [...existingMsgs, ...toAppend]
    };
    const otherEntries = existingStore.filter(
      (e) => e.conversation.id !== activeConversation.id
    );
    storageMode = await settledWithinBudget(
      writeFallbackStore(ctx, [nextEntry, ...otherEntries]),
      PERSISTENCE_TIMEOUT_MS,
      "ephemeral"
    );
  }
  return {
    conversation: activeConversation,
    userMessage,
    assistantMessage,
    storageMode
  };
}
function buildModelExecutionPlan(isStream) {
  const { usePrimary, isHalfOpenProbe } = shouldTryPrimaryModel();
  const plan = [];
  if (usePrimary) {
    plan.push({
      model: PRIMARY_GEMINI_MODEL,
      thinkingLevel: ThinkingLevel4.LOW,
      firstTokenTimeoutMs: isStream ? PRIMARY_STREAM_FIRST_TOKEN_TIMEOUT_MS : PRIMARY_JSON_TIMEOUT_MS,
      isPrimary: true,
      isHalfOpenProbe
    });
  }
  plan.push({
    model: FALLBACK_GEMINI_MODEL,
    thinkingLevel: ThinkingLevel4.MINIMAL,
    firstTokenTimeoutMs: isStream ? FALLBACK_STREAM_FIRST_TOKEN_TIMEOUT_MS : FALLBACK_JSON_TIMEOUT_MS,
    isPrimary: false,
    isHalfOpenProbe: false
  });
  plan.push({
    model: FALLBACK_GEMINI_MODEL,
    thinkingLevel: ThinkingLevel4.MINIMAL,
    firstTokenTimeoutMs: isStream ? FALLBACK_STREAM_FIRST_TOKEN_TIMEOUT_MS : FALLBACK_JSON_TIMEOUT_MS,
    isPrimary: false,
    isHalfOpenProbe: false
  });
  return plan;
}
async function handleAssistantChatRequest(params) {
  const requestId = createRequestId(params.requestId);
  const reqStart = Date.now();
  const prepared = await prepareChatContextAndHistory(params);
  const releaseUserSlot = acquireUserConcurrencySlot(prepared.ctx.userId);
  let releaseGlobalSlot = null;
  try {
    const systemInstruction = buildStudentSystemInstruction(
      prepared.ctx,
      prepared.candidateResources,
      "json"
    );
    const ai = getGeminiClient();
    releaseGlobalSlot = await acquireGlobalAiSlot();
    const executionPlan = buildModelExecutionPlan(false);
    let responseText = "";
    let modelUsed = executionPlan[0].model;
    let lastError = null;
    for (let idx = 0; idx < executionPlan.length; idx += 1) {
      const step = executionPlan[idx];
      const elapsedMs = Date.now() - reqStart;
      const remainingBudgetMs = JSON_MAX_TOTAL_MS - elapsedMs;
      if (remainingBudgetMs <= 1500) {
        lastError = lastError ?? new AssistantApiError(
          504,
          "GEMINI_TIMEOUT",
          "The AI Study Companion took too long to respond. Please retry."
        );
        break;
      }
      const attemptTimeoutMs = Math.min(step.firstTokenTimeoutMs, remainingBudgetMs);
      const attemptController = new AbortController();
      let attemptTimedOut = false;
      const attemptTimer = setTimeout(() => {
        attemptTimedOut = true;
        attemptController.abort();
      }, attemptTimeoutMs);
      try {
        const response = await ai.models.generateContent({
          model: step.model,
          contents: prepared.contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: step.thinkingLevel },
            responseMimeType: "application/json",
            responseSchema: ASSISTANT_CHAT_SCHEMA,
            abortSignal: attemptController.signal
          }
        });
        responseText = (response.text ?? "").trim();
        modelUsed = step.model;
        if (step.isPrimary) {
          recordPrimarySuccess(step.isHalfOpenProbe);
        }
        break;
      } catch (innerErr) {
        clearTimeout(attemptTimer);
        const category = attemptTimedOut ? "GEMINI_TIMEOUT" : classifyGeminiErrorCategory(innerErr);
        lastError = attemptTimedOut ? new AssistantApiError(
          504,
          "GEMINI_TIMEOUT",
          "The AI Study Companion took too long to respond. Please retry."
        ) : innerErr;
        if (step.isPrimary) {
          recordPrimaryFailure(category, step.isHalfOpenProbe);
        }
        const hasNext = idx + 1 < executionPlan.length;
        if (!hasNext || !attemptTimedOut && !isTransientOrFallbackEligibleError(innerErr)) {
          throw mapGeminiError4(lastError);
        }
        if (!step.isPrimary) {
          const backoffMs = computeExponentialBackoffMs(idx);
          if (Date.now() - reqStart + backoffMs + 1500 >= JSON_MAX_TOTAL_MS) {
            throw mapGeminiError4(lastError);
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      } finally {
        clearTimeout(attemptTimer);
      }
    }
    if (!responseText && lastError) {
      throw mapGeminiError4(lastError);
    }
    let parsed = {};
    try {
      parsed = JSON.parse(stripJsonCodeFences(responseText) || "{}");
    } catch {
      const plainFallback = sanitizeTextNoUrls3(responseText);
      if (plainFallback && !plainFallback.startsWith("{") && !plainFallback.startsWith("[")) {
        parsed = { answer: plainFallback, recommendedResourceIds: [], suggestedFollowUps: [] };
      } else {
        throw new AssistantApiError(
          502,
          "AI_RESPONSE_PARSE_ERROR",
          "The AI Study Companion returned an unreadable response. Please retry."
        );
      }
    }
    recordChatUsage(prepared.ctx.userId);
    const answer = sanitizeTextNoUrls3(
      parsed.answer,
      "Let us work through this step by step. Could you share which part you would like to focus on first?"
    );
    const codeSnippet = typeof parsed.codeSnippet === "string" && parsed.codeSnippet.trim() ? parsed.codeSnippet.trim() : void 0;
    const language = codeSnippet && typeof parsed.language === "string" && parsed.language.trim() ? parsed.language.trim().toLowerCase() : void 0;
    const recommendedIds = Array.isArray(parsed.recommendedResourceIds) ? parsed.recommendedResourceIds.filter((id) => typeof id === "string") : [];
    const recommendedResources = resolveRecommendedResourcesFromIds(
      recommendedIds,
      prepared.candidateById,
      prepared.fullCatalogById
    );
    const suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps.map((s) => sanitizeTextNoUrls3(s)).filter((s) => s.length > 0 && s.length <= 110).slice(0, 3) : [];
    const saved = await persistAssistantTurn({
      ctx: prepared.ctx,
      targetConversationId: prepared.targetConversationId,
      activeConversation: prepared.activeConversation,
      storageMode: prepared.storageMode,
      trimmedMessage: prepared.trimmedMessage,
      answer,
      codeSnippet,
      language,
      recommendedResources,
      suggestedFollowUps,
      clientTurnId: params.clientTurnId
    });
    const totalMs = Date.now() - reqStart;
    console.info(
      `[Skillora][Assistant][${requestId}] JSON completed model=${modelUsed} totalMs=${totalMs} contextMs=${prepared.timings.contextMs} historyMs=${prepared.timings.historyMs} turns=${prepared.contents.length} answerLen=${answer.length} storage=${saved.storageMode}`
    );
    return {
      requestId,
      ...saved,
      diagnostics: {
        modelUsed,
        totalMs,
        contextMs: prepared.timings.contextMs,
        historyMs: prepared.timings.historyMs
      }
    };
  } catch (err) {
    const mapped = mapGeminiError4(err);
    console.error(
      `[Skillora][Assistant][${requestId}] JSON failed status=${mapped.status} code=${mapped.code} totalMs=${Date.now() - reqStart}`
    );
    throw mapped;
  } finally {
    releaseGlobalSlot?.();
    releaseUserSlot();
  }
}
async function handleAssistantChatStreamRequest(params) {
  const requestId = createRequestId(params.requestId);
  const reqStart = Date.now();
  const prepared = await prepareChatContextAndHistory(params);
  const releaseUserSlot = acquireUserConcurrencySlot(prepared.ctx.userId);
  let releaseGlobalSlot = null;
  try {
    const streamInstruction = buildStudentSystemInstruction(
      prepared.ctx,
      prepared.candidateResources,
      "stream"
    );
    const ai = getGeminiClient();
    releaseGlobalSlot = await acquireGlobalAiSlot(params.signal);
    params.onStart?.({
      requestId,
      conversationId: prepared.activeConversation?.id ?? prepared.targetConversationId ?? null
    });
    const executionPlan = buildModelExecutionPlan(true);
    let fullOutput = "";
    let firstTokenMs = null;
    let chunkCount = 0;
    let modelUsed = executionPlan[0].model;
    let lastError = null;
    for (let idx = 0; idx < executionPlan.length; idx += 1) {
      if (params.signal?.aborted) {
        throw new AssistantApiError(499, "CLIENT_ABORTED", "Request was cancelled.");
      }
      const step = executionPlan[idx];
      const elapsedMs = Date.now() - reqStart;
      const remainingTotalMs = STREAM_MAX_TOTAL_MS - elapsedMs;
      if (remainingTotalMs <= 1500) {
        lastError = lastError ?? new AssistantApiError(
          504,
          "GEMINI_TIMEOUT",
          "The AI Study Companion took too long to respond. Please retry."
        );
        break;
      }
      const attemptController = new AbortController();
      let attemptTimedOut = false;
      let firstTokenTimedOut = false;
      const forwardAbort = () => attemptController.abort();
      if (params.signal) {
        params.signal.addEventListener("abort", forwardAbort, { once: true });
      }
      let idleTimer;
      const totalTimer = setTimeout(() => {
        attemptTimedOut = true;
        attemptController.abort();
      }, remainingTotalMs);
      const firstTokenLimit = Math.min(step.firstTokenTimeoutMs, remainingTotalMs);
      const firstTokenTimer = setTimeout(() => {
        if (chunkCount === 0) {
          firstTokenTimedOut = true;
          attemptController.abort();
        }
      }, firstTokenLimit);
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          attemptTimedOut = true;
          attemptController.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };
      try {
        const stream = await ai.models.generateContentStream({
          model: step.model,
          contents: prepared.contents,
          config: {
            systemInstruction: streamInstruction,
            thinkingConfig: { thinkingLevel: step.thinkingLevel },
            abortSignal: attemptController.signal
          }
        });
        for await (const chunk of stream) {
          const rawPiece = chunk.text ?? "";
          if (!rawPiece) continue;
          if (chunkCount === 0) {
            clearTimeout(firstTokenTimer);
            firstTokenMs = Date.now() - reqStart;
            if (step.isPrimary) {
              recordPrimarySuccess(step.isHalfOpenProbe);
            }
          }
          resetIdleTimer();
          chunkCount += 1;
          fullOutput += rawPiece;
          const cleanDelta = stripUrlsKeepWhitespace(rawPiece);
          if (cleanDelta) {
            params.onDelta(cleanDelta);
          }
        }
        modelUsed = step.model;
        if (chunkCount === 0) {
          if (step.isPrimary) {
            recordPrimaryFailure("EMPTY_STREAM", step.isHalfOpenProbe);
          }
          if (idx + 1 < executionPlan.length) {
            if (!step.isPrimary) {
              const backoffMs = computeExponentialBackoffMs(idx);
              if (Date.now() - reqStart + backoffMs + 1500 < STREAM_MAX_TOTAL_MS) {
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
              }
            }
            continue;
          }
        }
        if (chunkCount > 0) {
          break;
        }
      } catch (innerErr) {
        if (params.signal?.aborted) {
          throw new AssistantApiError(499, "CLIENT_ABORTED", "Request was cancelled.");
        }
        const timedOutBeforeFirstToken = firstTokenTimedOut || attemptTimedOut && chunkCount === 0;
        const category = timedOutBeforeFirstToken ? "GEMINI_FIRST_TOKEN_TIMEOUT" : attemptTimedOut ? "GEMINI_TIMEOUT" : classifyGeminiErrorCategory(innerErr);
        lastError = timedOutBeforeFirstToken || attemptTimedOut ? new AssistantApiError(
          504,
          "GEMINI_TIMEOUT",
          "The AI Study Companion took too long to respond. Please retry."
        ) : innerErr;
        if (step.isPrimary) {
          recordPrimaryFailure(category, step.isHalfOpenProbe);
        }
        if (chunkCount > 0) {
          throw mapGeminiError4(lastError);
        }
        const canFailoverOrRetry = idx + 1 < executionPlan.length && (timedOutBeforeFirstToken || isTransientOrFallbackEligibleError(innerErr));
        if (!canFailoverOrRetry) {
          throw mapGeminiError4(lastError);
        }
        if (!step.isPrimary) {
          const backoffMs = computeExponentialBackoffMs(idx);
          if (Date.now() - reqStart + backoffMs + 1500 >= STREAM_MAX_TOTAL_MS) {
            throw mapGeminiError4(lastError);
          }
          console.warn(
            `[Skillora][Assistant][${requestId}] Transient error on ${step.model} (${category}), retrying in ${backoffMs}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        } else {
          console.warn(
            `[Skillora][Assistant][${requestId}] Failing over from ${step.model} (${category}) to ${FALLBACK_GEMINI_MODEL}.`
          );
        }
      } finally {
        clearTimeout(firstTokenTimer);
        clearTimeout(totalTimer);
        if (idleTimer) clearTimeout(idleTimer);
        if (params.signal) {
          params.signal.removeEventListener("abort", forwardAbort);
        }
      }
    }
    const extracted = extractCodeBlockFromMarkdownText(fullOutput);
    const answer = sanitizeTextNoUrls3(extracted.cleanText);
    if (!answer) {
      if (lastError) {
        throw mapGeminiError4(lastError);
      }
      throw new AssistantApiError(
        502,
        "AI_EMPTY_RESPONSE",
        "The AI Study Companion returned an empty response. Please retry."
      );
    }
    recordChatUsage(prepared.ctx.userId);
    const recommendedResources = selectStreamRecommendedResources(
      prepared.candidateResources,
      prepared.trimmedMessage,
      answer
    );
    const suggestedFollowUps = buildStreamSuggestedFollowUps(
      prepared.ctx,
      prepared.trimmedMessage
    );
    const saved = await persistAssistantTurn({
      ctx: prepared.ctx,
      targetConversationId: prepared.targetConversationId,
      activeConversation: prepared.activeConversation,
      storageMode: prepared.storageMode,
      trimmedMessage: prepared.trimmedMessage,
      answer,
      codeSnippet: extracted.codeSnippet,
      language: extracted.language,
      recommendedResources,
      suggestedFollowUps,
      clientTurnId: params.clientTurnId
    });
    const totalMs = Date.now() - reqStart;
    const resolvedFirstTokenMs = firstTokenMs ?? totalMs;
    console.info(
      `[Skillora][Assistant][${requestId}] Stream completed model=${modelUsed} firstTokenMs=${resolvedFirstTokenMs} totalMs=${totalMs} contextMs=${prepared.timings.contextMs} historyMs=${prepared.timings.historyMs} chunks=${chunkCount} answerLen=${answer.length} storage=${saved.storageMode}`
    );
    return {
      requestId,
      ...saved,
      diagnostics: {
        modelUsed,
        firstTokenMs: resolvedFirstTokenMs,
        totalMs,
        contextMs: prepared.timings.contextMs,
        historyMs: prepared.timings.historyMs,
        chunks: chunkCount
      }
    };
  } catch (err) {
    if (err instanceof AssistantApiError && err.code === "CLIENT_ABORTED") {
      console.info(
        `[Skillora][Assistant][${requestId}] Client aborted stream after ${Date.now() - reqStart}ms`
      );
      throw err;
    }
    const mapped = mapGeminiError4(err);
    console.error(
      `[Skillora][Assistant][${requestId}] Stream failed status=${mapped.status} code=${mapped.code} totalMs=${Date.now() - reqStart}`
    );
    throw mapped;
  } finally {
    releaseGlobalSlot?.();
    releaseUserSlot();
  }
}

// server/notificationService.ts
import { createClient as createClient6 } from "@supabase/supabase-js";
import { setVapidDetails, sendNotification } from "web-push";

// shared/inactivityEngine.ts
function isMeaningfulLearningActivity(event) {
  if (!event || !event.timestamp) return false;
  const parsedMs = new Date(event.timestamp).getTime();
  if (!Number.isFinite(parsedMs)) return false;
  switch (event.type) {
    case "lesson_completed":
    case "knowledge_check":
    case "assessment":
    case "practical_exercise":
      return true;
    case "lesson_study": {
      const dur = Number(event.durationSeconds ?? 0);
      if (Number.isFinite(dur) && dur >= 10) return true;
      return event.completed === true && Number.isFinite(dur) && dur >= 1;
    }
    default:
      return false;
  }
}
function resolveSafeTimeZone(timeZone) {
  const candidate = (timeZone ?? "").trim();
  if (candidate) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(/* @__PURE__ */ new Date());
      return candidate;
    } catch {
    }
  }
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      new Intl.DateTimeFormat("en-US", { timeZone: detected }).format(/* @__PURE__ */ new Date());
      return detected;
    }
  } catch {
  }
  return "UTC";
}
function getLocalDateAndClockInTimeZone(date, timeZone) {
  const safeTz = resolveSafeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  const year = map.year || "1970";
  const month = map.month || "01";
  const day = map.day || "01";
  const rawHour = Number(map.hour ?? 0);
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 0;
  const rawMinute = Number(map.minute ?? 0);
  const minute = Number.isFinite(rawMinute) ? rawMinute % 60 : 0;
  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
    totalMinutes: hour * 60 + minute
  };
}
function getDateKeyInTimeZone(dateInput, timeZone) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return null;
  return getLocalDateAndClockInTimeZone(date, timeZone).dateKey;
}
function diffDateKeysDays(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 864e5);
}
function normalizePreferredTime(value) {
  const match = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2])));
    return {
      normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      hour,
      minute,
      totalMinutes: hour * 60 + minute
    };
  }
  return { normalized: "18:00", hour: 18, minute: 0, totalMinutes: 18 * 60 };
}
function isNotificationsPausedAt(prefs, now = /* @__PURE__ */ new Date()) {
  if (prefs.paused) return true;
  if (prefs.pausedUntil) {
    const untilMs = new Date(prefs.pausedUntil).getTime();
    if (Number.isFinite(untilMs) && untilMs > now.getTime()) {
      return true;
    }
  }
  return false;
}
function buildInactivityReminderMessage(params) {
  const direction = (params.primaryDirection ?? "").trim();
  const nextLesson = (params.nextLessonTitle ?? "").trim();
  if (params.tier === "gentle_1d") {
    return {
      title: "Keep your Skillora momentum going",
      body: nextLesson ? `Ready for a short session? Continue "${nextLesson}"${direction ? ` in your ${direction} path` : ""}.` : `A focused 15-minute study session today keeps your${direction ? ` ${direction}` : ""} skills sharp.`
    };
  }
  if (params.tier === "followup_2_3d") {
    return {
      title: `Pick up where you left off (${params.inactiveDays} days away)`,
      body: nextLesson ? `Your next lesson "${nextLesson}" is ready whenever you have a few minutes today.` : `Even one lesson or Knowledge Check today gets your${direction ? ` ${direction}` : ""} streak rolling again.`
    };
  }
  return {
    title: "Ready for a fresh restart on Skillora?",
    body: nextLesson ? `It\u2019s been ${params.inactiveDays} days\u2014jump back into "${nextLesson}" at your own pace. Your progress is saved.` : `Your learning path${direction ? ` for ${direction}` : ""} and all completed progress are waiting whenever you\u2019re ready to restart.`
  };
}
function evaluateInactivityReminder(input) {
  const now = input.now ? new Date(input.now) : /* @__PURE__ */ new Date();
  const resolvedTimeZone = resolveSafeTimeZone(input.timeZone);
  const localClock = getLocalDateAndClockInTimeZone(now, resolvedTimeZone);
  const preferred = normalizePreferredTime(input.preferredTime);
  const meaningful = input.events.filter(isMeaningfulLearningActivity).map((evt) => ({
    event: evt,
    ms: new Date(evt.timestamp).getTime()
  })).sort((a, b) => b.ms - a.ms);
  if (meaningful.length === 0) {
    return {
      shouldNotify: false,
      tier: null,
      suppressedReason: "no_meaningful_activity",
      lastMeaningfulActivityAt: null,
      inactiveDays: 0,
      elapsedHours: 0,
      cycleKey: null,
      dedupeKey: null,
      title: null,
      body: null,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  const latest = meaningful[0];
  const lastActivityMs = latest.ms;
  const lastMeaningfulActivityAt = new Date(lastActivityMs).toISOString();
  const lastDateKey = getDateKeyInTimeZone(new Date(lastActivityMs), resolvedTimeZone) ?? localClock.dateKey;
  const calendarDaysInactive = Math.max(0, diffDateKeysDays(lastDateKey, localClock.dateKey));
  const elapsedMs = Math.max(0, now.getTime() - lastActivityMs);
  const elapsedHours = elapsedMs / 36e5;
  let tier = null;
  if (elapsedHours >= 168 && calendarDaysInactive >= 7) {
    tier = "restart_7d";
  } else if (elapsedHours >= 48 && calendarDaysInactive >= 2) {
    tier = "followup_2_3d";
  } else if (elapsedHours >= 24 && calendarDaysInactive >= 1) {
    tier = "gentle_1d";
  }
  if (!tier) {
    return {
      shouldNotify: false,
      tier: null,
      suppressedReason: "active_recently",
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey: null,
      dedupeKey: null,
      title: null,
      body: null,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  const cycleKey = String(Math.floor(lastActivityMs / 1e3));
  const dedupeKey = `inactivity:${cycleKey}:${tier}`;
  const { title, body } = buildInactivityReminderMessage({
    tier,
    inactiveDays: Math.max(1, calendarDaysInactive),
    primaryDirection: input.primaryDirection,
    nextLessonTitle: input.nextLessonTitle
  });
  if (input.inactivityRemindersEnabled === false) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: "disabled",
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  if (isNotificationsPausedAt({ paused: input.paused, pausedUntil: input.pausedUntil }, now)) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: "paused",
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  if (input.enforcePreferredTimeWindow && localClock.totalMinutes < preferred.totalMinutes) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: "before_preferred_time",
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  const history = input.sentHistory ?? [];
  if (history.some((entry) => entry.dedupeKey === dedupeKey)) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: "already_sent_for_cycle",
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  const cooldownMs = 20 * 36e5;
  const tooRecentInCycle = history.some((entry) => {
    if (!entry.dedupeKey.startsWith(`inactivity:${cycleKey}:`)) return false;
    const sentMs = new Date(entry.sentAt).getTime();
    return Number.isFinite(sentMs) && now.getTime() - sentMs >= 0 && now.getTime() - sentMs < cooldownMs;
  });
  if (tooRecentInCycle) {
    return {
      shouldNotify: false,
      tier,
      suppressedReason: "cooldown_active",
      lastMeaningfulActivityAt,
      inactiveDays: calendarDaysInactive,
      elapsedHours: Number(elapsedHours.toFixed(1)),
      cycleKey,
      dedupeKey,
      title,
      body,
      resolvedTimeZone,
      localDateKey: localClock.dateKey
    };
  }
  return {
    shouldNotify: true,
    tier,
    suppressedReason: null,
    lastMeaningfulActivityAt,
    inactiveDays: calendarDaysInactive,
    elapsedHours: Number(elapsedHours.toFixed(1)),
    cycleKey,
    dedupeKey,
    title,
    body,
    resolvedTimeZone,
    localDateKey: localClock.dateKey
  };
}

// server/notificationService.ts
var NotificationApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "NotificationApiError";
    this.status = status;
    this.code = code;
  }
};
function getSupabaseEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ""
  };
}
function getVapidEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@skillora.app";
  return { publicKey, privateKey, subject };
}
var vapidConfiguredSuccessfully = null;
function ensureWebPushConfigured() {
  const { publicKey, privateKey, subject } = getVapidEnv();
  if (!publicKey || !privateKey) {
    return { configured: false, publicKey: "" };
  }
  if (vapidConfiguredSuccessfully === true) {
    return { configured: true, publicKey };
  }
  try {
    setVapidDetails(subject, publicKey, privateKey);
    vapidConfiguredSuccessfully = true;
    return { configured: true, publicKey };
  } catch (err) {
    vapidConfiguredSuccessfully = false;
    console.warn(
      "[Skillora][Notifications] Invalid VAPID configuration; Web Push disabled:",
      err instanceof Error ? err.message : String(err)
    );
    return { configured: false, publicKey: "" };
  }
}
function getPushPublicConfig() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  const vapid = ensureWebPushConfigured();
  const serviceRoleConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);
  return {
    pushConfigured: vapid.configured,
    vapidPublicKey: vapid.configured ? vapid.publicKey : "",
    serviceRoleConfigured,
    schedulerConfigured: vapid.configured && serviceRoleConfigured
  };
}
function createUserScopedClient(accessToken) {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new NotificationApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient6(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function createServiceRoleClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient6(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
async function authenticateRequest(authorizationHeader) {
  const header = authorizationHeader?.trim() || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new NotificationApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with an active Skillora session."
    );
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    throw new NotificationApiError(401, "INVALID_AUTH_TOKEN", "Missing access token.");
  }
  const supabase = createUserScopedClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    throw new NotificationApiError(
      401,
      "UNAUTHORIZED",
      "Your session is invalid or expired. Please sign in again."
    );
  }
  return { userId: data.user.id, supabase };
}
function isMissingNotificationTableError(err) {
  if (!err) return false;
  const code = (err.code ?? "").toUpperCase();
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || (msg.includes("notification_preferences") || msg.includes("push_subscriptions") || msg.includes("notification_deliveries")) && (msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("schema cache"));
}
function defaultNotificationPreferences(timezone = "UTC") {
  return {
    inAppEnabled: true,
    pushEnabled: false,
    preferredTime: "18:00",
    timezone: resolveSafeTimeZone(timezone),
    paused: false,
    pausedUntil: null,
    streakReminders: true,
    inactivityReminders: true,
    weeklyDigest: true,
    aiInsightAlerts: true,
    lastMeaningfulActivityAt: null
  };
}
function mapRowToPreferences(row) {
  const pausedUntilRaw = typeof row.paused_until === "string" && row.paused_until.trim() ? row.paused_until : null;
  return {
    inAppEnabled: row.in_app_enabled !== false,
    pushEnabled: row.push_enabled === true,
    preferredTime: normalizePreferredTime(
      typeof row.preferred_time === "string" ? row.preferred_time : "18:00"
    ).normalized,
    timezone: resolveSafeTimeZone(typeof row.timezone === "string" ? row.timezone : "UTC"),
    paused: row.paused === true,
    pausedUntil: pausedUntilRaw,
    streakReminders: row.streak_reminders !== false,
    inactivityReminders: row.inactivity_reminders !== false,
    weeklyDigest: row.weekly_digest !== false,
    aiInsightAlerts: row.ai_insight_alerts !== false,
    lastMeaningfulActivityAt: typeof row.last_meaningful_activity_at === "string" ? row.last_meaningful_activity_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : void 0
  };
}
async function fetchUserMeaningfulContext(supabase, userId) {
  const [profileRes, roadmapsRes, sessionsRes, kcRes, assessRes] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("learning_roadmaps").select("id, status, career_goal, roadmap_data").eq("user_id", userId).order("updated_at", { ascending: false }).limit(10),
    supabase.from("learning_sessions").select("client_session_id, activity_type, duration_seconds, started_at, ended_at, completed, lesson_title").eq("user_id", userId).order("started_at", { ascending: false }).limit(200),
    supabase.from("lesson_knowledge_checks").select("id, lesson_title, score, completed_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(100),
    supabase.from("assessment_attempts").select("id, subject, score_percent, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
  ]);
  const events = [];
  let primaryDirection = "";
  if (profileRes.data && typeof profileRes.data === "object") {
    const p = profileRes.data;
    primaryDirection = typeof p.primary_direction === "string" && p.primary_direction.trim() || typeof p.career_goal === "string" && p.career_goal.trim() || "";
  }
  let nextLessonTitle = "";
  let nextLessonTargetUrl = "/#/dashboard";
  if (Array.isArray(roadmapsRes.data)) {
    for (const rRow of roadmapsRes.data) {
      const r = rRow;
      const data = r.roadmap_data && typeof r.roadmap_data === "object" ? r.roadmap_data : null;
      const stages = data && Array.isArray(data.stages) ? data.stages : [];
      for (const sRaw of stages) {
        if (!sRaw || typeof sRaw !== "object") continue;
        const stage = sRaw;
        const lessons = Array.isArray(stage.lessons) ? stage.lessons : [];
        for (const lRaw of lessons) {
          if (!lRaw || typeof lRaw !== "object") continue;
          const lesson = lRaw;
          if (lesson.completed === true && typeof lesson.completedAt === "string" && lesson.completedAt) {
            events.push({
              type: "lesson_completed",
              timestamp: lesson.completedAt,
              title: typeof lesson.title === "string" ? lesson.title : "Completed Lesson",
              completed: true
            });
          } else if (!nextLessonTitle && r.status === "active" && lesson.completed !== true && typeof lesson.title === "string") {
            nextLessonTitle = lesson.title;
            nextLessonTargetUrl = "/#/roadmap";
          }
        }
      }
      if (!primaryDirection && r.status === "active") {
        const roadmapDir = data && typeof data.primaryDirection === "string" && data.primaryDirection.trim() ? data.primaryDirection.trim() : typeof r.career_goal === "string" ? r.career_goal.trim() : "";
        if (roadmapDir) {
          primaryDirection = roadmapDir;
        }
      }
    }
  }
  if (Array.isArray(sessionsRes.data)) {
    for (const sRaw of sessionsRes.data) {
      const s = sRaw;
      const ts = typeof s.ended_at === "string" && s.ended_at || typeof s.started_at === "string" && s.started_at || "";
      if (!ts) continue;
      events.push({
        type: s.activity_type === "knowledge_check" ? "knowledge_check" : s.activity_type === "assessment" ? "assessment" : "lesson_study",
        timestamp: ts,
        durationSeconds: Number(s.duration_seconds ?? 0),
        completed: s.completed !== false,
        title: typeof s.lesson_title === "string" ? s.lesson_title : void 0
      });
    }
  }
  if (Array.isArray(kcRes.data)) {
    for (const kRaw of kcRes.data) {
      const k = kRaw;
      if (typeof k.completed_at === "string" && k.completed_at) {
        events.push({
          type: "knowledge_check",
          timestamp: k.completed_at,
          title: typeof k.lesson_title === "string" ? k.lesson_title : void 0,
          completed: true
        });
      }
    }
  }
  if (Array.isArray(assessRes.data)) {
    for (const aRaw of assessRes.data) {
      const a = aRaw;
      if (typeof a.created_at === "string" && a.created_at) {
        events.push({
          type: "assessment",
          timestamp: a.created_at,
          title: typeof a.subject === "string" ? a.subject : void 0,
          completed: true
        });
      }
    }
  }
  return {
    events,
    primaryDirection,
    nextLessonTitle,
    nextLessonTargetUrl
  };
}
async function handleGetNotificationPreferences(params) {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);
  const [prefRes, subRes] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true)
  ]);
  if (prefRes.error) {
    if (isMissingNotificationTableError(prefRes.error)) {
      return {
        preferences: defaultNotificationPreferences(),
        activeSubscriptionCount: 0,
        schemaMigrationRequired: true
      };
    }
    throw new NotificationApiError(
      500,
      prefRes.error.code || "PREFS_LOAD_ERROR",
      prefRes.error.message || "Could not load notification preferences."
    );
  }
  const preferences = prefRes.data ? mapRowToPreferences(prefRes.data) : defaultNotificationPreferences();
  return {
    preferences,
    activeSubscriptionCount: subRes.error ? 0 : subRes.count ?? 0,
    schemaMigrationRequired: false
  };
}
async function handleUpdateNotificationPreferences(params) {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);
  const existing = await handleGetNotificationPreferences({
    authorizationHeader: params.authorizationHeader
  });
  const merged = {
    ...existing.preferences,
    ...params.updates,
    preferredTime: normalizePreferredTime(
      params.updates.preferredTime ?? existing.preferences.preferredTime
    ).normalized,
    timezone: resolveSafeTimeZone(params.updates.timezone ?? existing.preferences.timezone),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (existing.schemaMigrationRequired) {
    return {
      preferences: merged,
      schemaMigrationRequired: true
    };
  }
  const dbPayload = {
    user_id: userId,
    in_app_enabled: merged.inAppEnabled,
    push_enabled: merged.pushEnabled,
    preferred_time: merged.preferredTime,
    timezone: merged.timezone,
    paused: merged.paused,
    paused_until: merged.pausedUntil,
    streak_reminders: merged.streakReminders,
    inactivity_reminders: merged.inactivityReminders,
    weekly_digest: merged.weeklyDigest,
    ai_insight_alerts: merged.aiInsightAlerts,
    last_meaningful_activity_at: merged.lastMeaningfulActivityAt,
    updated_at: merged.updatedAt
  };
  const { data, error } = await supabase.from("notification_preferences").upsert(dbPayload, { onConflict: "user_id" }).select("*").single();
  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { preferences: merged, schemaMigrationRequired: true };
    }
    throw new NotificationApiError(
      error.code === "42501" ? 403 : 500,
      error.code || "PREFS_SAVE_ERROR",
      error.message || "Could not save notification preferences."
    );
  }
  return {
    preferences: mapRowToPreferences(data),
    schemaMigrationRequired: false
  };
}
async function handleRegisterPushSubscription(params) {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);
  const endpoint = params.endpoint.trim();
  const p256dh = params.p256dh.trim();
  const auth = params.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    throw new NotificationApiError(
      400,
      "INVALID_SUBSCRIPTION",
      "Push subscription endpoint and encryption keys are required."
    );
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    throw new NotificationApiError(400, "INVALID_ENDPOINT", "Invalid push endpoint URL.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new NotificationApiError(
      400,
      "INSECURE_ENDPOINT",
      "Push subscription endpoint must use HTTPS."
    );
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: (params.userAgent ?? "").slice(0, 240) || null,
      is_active: true,
      updated_at: nowIso
    },
    { onConflict: "user_id,endpoint" }
  );
  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { saved: false, schemaMigrationRequired: true };
    }
    throw new NotificationApiError(
      error.code === "42501" ? 403 : 500,
      error.code || "SUBSCRIPTION_SAVE_ERROR",
      error.message || "Failed to save push subscription."
    );
  }
  return { saved: true, schemaMigrationRequired: false };
}
async function handleRemovePushSubscription(params) {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);
  let query = supabase.from("push_subscriptions").update({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", userId);
  if (params.endpoint?.trim()) {
    query = query.eq("endpoint", params.endpoint.trim());
  }
  const { error } = await query;
  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { removed: false, schemaMigrationRequired: true };
    }
    throw new NotificationApiError(
      500,
      error.code || "SUBSCRIPTION_REMOVE_ERROR",
      error.message || "Could not remove push subscription."
    );
  }
  return { removed: true, schemaMigrationRequired: false };
}
async function sendWebPushToSubscriptions(params) {
  let sentCount = 0;
  let failedCount = 0;
  let lastError = null;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const sub of params.subscriptions) {
    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        JSON.stringify(params.payload),
        { TTL: 3600 }
      );
      sentCount += 1;
      await params.supabase.from("push_subscriptions").update({ last_used_at: nowIso, updated_at: nowIso }).eq("id", sub.id).eq("user_id", params.userId);
    } catch (err) {
      failedCount += 1;
      const statusCode = typeof err === "object" && err !== null && "statusCode" in err ? Number(err.statusCode) : 0;
      lastError = err instanceof Error ? err.message : String(err ?? "Push send error");
      if (statusCode === 404 || statusCode === 410) {
        await params.supabase.from("push_subscriptions").update({ is_active: false, updated_at: nowIso }).eq("id", sub.id).eq("user_id", params.userId);
      }
    }
  }
  return { sentCount, failedCount, lastError };
}
async function handleSendTestPush(params) {
  const { userId, supabase } = await authenticateRequest(params.authorizationHeader);
  const vapid = ensureWebPushConfigured();
  if (!vapid.configured) {
    throw new NotificationApiError(
      503,
      "VAPID_NOT_CONFIGURED",
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured on the server yet."
    );
  }
  const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).eq("is_active", true);
  if (error) {
    if (isMissingNotificationTableError(error)) {
      throw new NotificationApiError(
        503,
        "MIGRATION_REQUIRED",
        "Run the notifications Supabase migration before sending push notifications."
      );
    }
    throw new NotificationApiError(500, error.code || "SUB_LOAD_ERROR", error.message);
  }
  const activeSubs = subs ?? [];
  if (activeSubs.length === 0) {
    throw new NotificationApiError(
      400,
      "NO_PUSH_SUBSCRIPTION",
      "Enable browser notifications in this browser first so a push subscription is registered."
    );
  }
  const result = await sendWebPushToSubscriptions({
    supabase,
    userId,
    subscriptions: activeSubs,
    payload: {
      title: "Skillora Study Reminder Ready",
      body: "External browser notifications are connected for your account.",
      url: "/#/dashboard",
      tag: "skillora-test-push"
    }
  });
  if (result.sentCount === 0 && result.failedCount > 0) {
    throw new NotificationApiError(
      502,
      "PUSH_DELIVERY_FAILED",
      result.lastError || "Push service rejected the notification."
    );
  }
  return { sentCount: result.sentCount, failedCount: result.failedCount };
}
async function dispatchScheduledInactivityNotifications(now = /* @__PURE__ */ new Date()) {
  const admin = createServiceRoleClient();
  if (!admin) {
    throw new NotificationApiError(
      503,
      "SERVICE_ROLE_NOT_CONFIGURED",
      "SUPABASE_SERVICE_ROLE_KEY is required on the server for scheduled background dispatch."
    );
  }
  const { data: prefRows, error: prefError } = await admin.from("notification_preferences").select("*").eq("inactivity_reminders", true).limit(500);
  if (prefError) {
    if (isMissingNotificationTableError(prefError)) {
      throw new NotificationApiError(
        503,
        "MIGRATION_REQUIRED",
        "notification_preferences table is not provisioned in Supabase yet."
      );
    }
    throw new NotificationApiError(500, prefError.code || "DISPATCH_LOAD_ERROR", prefError.message);
  }
  const rows = prefRows ?? [];
  const vapid = ensureWebPushConfigured();
  const skippedReasons = {};
  let triggeredReminders = 0;
  let pushSentCount = 0;
  let pushFailedCount = 0;
  let inAppRecordedCount = 0;
  for (const row of rows) {
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    if (!userId) continue;
    const prefs = mapRowToPreferences(row);
    if (!prefs.inAppEnabled && !prefs.pushEnabled) {
      skippedReasons.all_channels_disabled = (skippedReasons.all_channels_disabled ?? 0) + 1;
      continue;
    }
    const [context, deliveriesRes] = await Promise.all([
      fetchUserMeaningfulContext(admin, userId),
      admin.from("notification_deliveries").select("dedupe_key, tier, sent_at").eq("user_id", userId).order("sent_at", { ascending: false }).limit(30)
    ]);
    const sentHistory = (deliveriesRes.data ?? []).map((d) => ({
      dedupeKey: typeof d.dedupe_key === "string" ? d.dedupe_key : "",
      tier: typeof d.tier === "string" ? d.tier : "",
      sentAt: typeof d.sent_at === "string" ? d.sent_at : ""
    }));
    const evaluation = evaluateInactivityReminder({
      events: context.events,
      now,
      timeZone: prefs.timezone,
      preferredTime: prefs.preferredTime,
      paused: prefs.paused,
      pausedUntil: prefs.pausedUntil,
      inactivityRemindersEnabled: prefs.inactivityReminders,
      sentHistory,
      primaryDirection: context.primaryDirection,
      nextLessonTitle: context.nextLessonTitle,
      enforcePreferredTimeWindow: true
    });
    if (!evaluation.shouldNotify || !evaluation.tier || !evaluation.dedupeKey || !evaluation.title || !evaluation.body) {
      const reason = evaluation.suppressedReason || "skipped";
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
      continue;
    }
    triggeredReminders += 1;
    if (prefs.inAppEnabled) {
      const { error: inAppErr } = await admin.from("notification_deliveries").upsert(
        {
          user_id: userId,
          dedupe_key: evaluation.dedupeKey,
          tier: evaluation.tier,
          channel: "in_app",
          title: evaluation.title,
          body: evaluation.body,
          target_url: context.nextLessonTargetUrl,
          status: "sent",
          sent_at: now.toISOString()
        },
        { onConflict: "user_id,dedupe_key,channel", ignoreDuplicates: true }
      );
      if (!inAppErr) {
        inAppRecordedCount += 1;
      }
    }
    if (prefs.pushEnabled && vapid.configured) {
      const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).eq("is_active", true);
      const activeSubs = subs ?? [];
      if (activeSubs.length > 0) {
        const pushRes = await sendWebPushToSubscriptions({
          supabase: admin,
          userId,
          subscriptions: activeSubs,
          payload: {
            title: evaluation.title,
            body: evaluation.body,
            url: context.nextLessonTargetUrl,
            tag: evaluation.dedupeKey
          }
        });
        pushSentCount += pushRes.sentCount;
        pushFailedCount += pushRes.failedCount;
        await admin.from("notification_deliveries").upsert(
          {
            user_id: userId,
            dedupe_key: evaluation.dedupeKey,
            tier: evaluation.tier,
            channel: "push",
            title: evaluation.title,
            body: evaluation.body,
            target_url: context.nextLessonTargetUrl,
            status: pushRes.sentCount > 0 ? "sent" : "failed",
            error_message: pushRes.sentCount > 0 ? null : pushRes.lastError,
            sent_at: now.toISOString()
          },
          { onConflict: "user_id,dedupe_key,channel", ignoreDuplicates: true }
        );
      }
    }
  }
  return {
    evaluatedUsers: rows.length,
    triggeredReminders,
    pushSentCount,
    pushFailedCount,
    inAppRecordedCount,
    skippedReasons
  };
}
function verifyCronAuthorization(reqHeaders) {
  const configuredSecret = process.env.CRON_SECRET?.trim() || "";
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }
  const headerVal = (typeof reqHeaders["x-cron-secret"] === "string" ? reqHeaders["x-cron-secret"] : "") || (reqHeaders.authorization?.startsWith("Bearer ") ? reqHeaders.authorization.slice(7).trim() : "");
  return headerVal === configuredSecret;
}
var schedulerInterval = null;
function startNotificationScheduler() {
  if (schedulerInterval) return;
  const config = getPushPublicConfig();
  if (!config.serviceRoleConfigured) {
    return;
  }
  const intervalMs = 15 * 6e4;
  schedulerInterval = setInterval(() => {
    void dispatchScheduledInactivityNotifications().catch((err) => {
      console.warn(
        "[Skillora][Notifications] Scheduled dispatch cycle skipped/failed:",
        err instanceof Error ? err.message : String(err)
      );
    });
  }, intervalMs);
  schedulerInterval.unref?.();
}

// server/achievementService.ts
import { createClient as createClient7 } from "@supabase/supabase-js";

// shared/achievementEngine.ts
var XP_REWARDS = {
  LESSON_FIRST_COMPLETION: 50,
  KNOWLEDGE_CHECK_FIRST_PASS: 25,
  STAGE_FIRST_COMPLETION: 150,
  PATH_FIRST_COMPLETION: 500
};
var KNOWLEDGE_CHECK_PASS_MIN_PERCENT = DEFAULT_ADAPTIVE_THRESHOLDS.advanceMinPercent;
var EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT = 90;
var EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT = 3;
var EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP = 500;
var BADGE_DEFINITIONS = [
  // Learning Milestones
  {
    id: "first_lesson_completed",
    title: "First Lesson Completed",
    description: "Complete your very first guided lesson in a Skillora Learning Path.",
    unlockRequirement: "Complete 1 lesson",
    iconName: "BookOpen",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Common"
  },
  {
    id: "first_step",
    title: "First Step",
    description: "Take your opening step by completing a verified Learning Path lesson.",
    unlockRequirement: "Complete 1 lesson",
    iconName: "Zap",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Common"
  },
  {
    id: "first_course_completed",
    title: "First Course Completed",
    description: "Finish every lesson inside a complete course stage of your Learning Path.",
    unlockRequirement: "Complete 1 full course stage",
    iconName: "GraduationCap",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Uncommon"
  },
  {
    id: "stage_master",
    title: "Stage Master",
    description: "Master and complete all lessons within a Learning Path stage.",
    unlockRequirement: "Complete 1 full learning stage",
    iconName: "Layers",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Uncommon"
  },
  {
    id: "first_learning_path_completed",
    title: "First Learning Path Completed",
    description: "Complete every stage and lesson across an entire personalized Learning Path.",
    unlockRequirement: "Complete 1 full learning path",
    iconName: "Trophy",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Epic"
  },
  {
    id: "path_finisher",
    title: "Path Finisher",
    description: "See an entire multi-stage Skillora Learning Path through to completion.",
    unlockRequirement: "Complete 1 full learning path",
    iconName: "Award",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Epic"
  },
  {
    id: "roadmap_explorer",
    title: "Roadmap Explorer",
    description: "Explore breadth across Skillora by creating 2+ roadmaps or studying across 3+ stages.",
    unlockRequirement: "2 roadmaps or 3 distinct stages with completed lessons",
    iconName: "Compass",
    category: "milestone",
    categoryLabel: "Learning Milestones",
    rarity: "Uncommon"
  },
  // Consistency
  {
    id: "streak_3_days",
    title: "3-Day Learning Streak",
    description: "Show up for 3 consecutive days of meaningful study, quizzes, or lessons.",
    unlockRequirement: "Achieve a 3-day study streak",
    iconName: "Flame",
    category: "consistency",
    categoryLabel: "Consistency",
    rarity: "Common"
  },
  {
    id: "streak_7_days",
    title: "7-Day Learning Streak",
    description: "Sustain an unbroken 7-day week of verified Skillora learning activity.",
    unlockRequirement: "Achieve a 7-day study streak",
    iconName: "Flame",
    category: "consistency",
    categoryLabel: "Consistency",
    rarity: "Uncommon"
  },
  {
    id: "streak_14_days",
    title: "14-Day Learning Streak",
    description: "Maintain two full consecutive weeks of deliberate daily learning.",
    unlockRequirement: "Achieve a 14-day study streak",
    iconName: "Flame",
    category: "consistency",
    categoryLabel: "Consistency",
    rarity: "Rare"
  },
  {
    id: "streak_30_days",
    title: "30-Day Learning Streak",
    description: "Build an extraordinary 30-day habit of continuous daily skill growth.",
    unlockRequirement: "Achieve a 30-day study streak",
    iconName: "Flame",
    category: "consistency",
    categoryLabel: "Consistency",
    rarity: "Epic"
  },
  {
    id: "streak_100_days",
    title: "100-Day Learning Streak",
    description: "Join the top tier of lifelong learners with a 100-day unbroken streak.",
    unlockRequirement: "Achieve a 100-day study streak",
    iconName: "Crown",
    category: "consistency",
    categoryLabel: "Consistency",
    rarity: "Legendary"
  },
  // Knowledge & Practice
  {
    id: "knowledge_seeker",
    title: "Knowledge Seeker",
    description: `Pass your first Lesson Knowledge Check with a score of ${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}% or higher.`,
    unlockRequirement: `Pass 1 knowledge check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
    iconName: "ShieldCheck",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Common"
  },
  {
    id: "skill_assessor",
    title: "Skill Assessor",
    description: "Complete a diagnostic skill assessment to benchmark your strengths and gaps.",
    unlockRequirement: "Complete 1 diagnostic assessment",
    iconName: "Cpu",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Common"
  },
  {
    id: "knowledge_master",
    title: "Knowledge Master",
    description: `Demonstrate sustained mastery by passing 5 distinct Lesson Knowledge Checks (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+).`,
    unlockRequirement: "Pass 5 distinct knowledge checks",
    iconName: "ShieldCheck",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Rare"
  },
  {
    id: "quiz_champion",
    title: "Quiz Champion",
    description: `Excel in recall and application by passing 10 distinct Lesson Knowledge Checks (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+).`,
    unlockRequirement: "Pass 10 distinct knowledge checks",
    iconName: "Trophy",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Rare"
  },
  {
    id: "perfect_score",
    title: "Perfect Score",
    description: "Achieve a flawless 100% score on any Knowledge Check or Diagnostic Assessment.",
    unlockRequirement: "Score 100% on a quiz or assessment",
    iconName: "Star",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Rare"
  },
  {
    id: "practice_champion",
    title: "Practice Champion",
    description: "Dedicate sustained effort across 10 meaningful study sessions or completed lessons.",
    unlockRequirement: "Complete 10 meaningful study activities",
    iconName: "Target",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Uncommon"
  },
  {
    id: "skill_builder",
    title: "Skill Builder",
    description: "Combine theory and benchmarking by completing 5 lessons and 1 diagnostic assessment.",
    unlockRequirement: "Complete 5 lessons & 1 diagnostic",
    iconName: "CheckCircle2",
    category: "knowledge_practice",
    categoryLabel: "Knowledge & Practice",
    rarity: "Uncommon"
  },
  // Excellence
  {
    id: "fast_learner",
    title: "Fast Learner",
    description: "Demonstrate high focus by completing 3 or more lessons in a single calendar day.",
    unlockRequirement: "Complete 3 lessons in 1 day",
    iconName: "Zap",
    category: "excellence",
    categoryLabel: "Excellence",
    rarity: "Uncommon"
  },
  {
    id: "consistent_learner",
    title: "Consistent Learner",
    description: "Build reliable momentum with 7 consecutive days of meaningful learning activity.",
    unlockRequirement: "Achieve a 7-day study streak",
    iconName: "Flame",
    category: "excellence",
    categoryLabel: "Excellence",
    rarity: "Uncommon"
  },
  {
    id: "learning_excellence",
    title: "Learning Excellence",
    description: "Complete at least 1 course stage while maintaining a 90%+ average across 3+ graded evaluations.",
    unlockRequirement: "1 course done & 90%+ avg (3+ graded)",
    iconName: "Sparkles",
    category: "excellence",
    categoryLabel: "Excellence",
    rarity: "Epic"
  },
  {
    id: "subject_expert",
    title: "Subject Expert",
    description: "Reach 1,000+ XP within a single learning direction or complete a full Learning Path.",
    unlockRequirement: "1,000+ XP in 1 direction or 1 path done",
    iconName: "Crown",
    category: "excellence",
    categoryLabel: "Excellence",
    rarity: "Legendary"
  }
];
var LEVEL_THRESHOLDS = [
  { level: 1, minXp: 0, title: "Curious Explorer" },
  { level: 2, minXp: 150, title: "Active Learner" },
  { level: 3, minXp: 350, title: "Skill Builder" },
  { level: 4, minXp: 650, title: "Stage Navigator" },
  { level: 5, minXp: 1050, title: "Path Achiever" },
  { level: 6, minXp: 1600, title: "Domain Specialist" },
  { level: 7, minXp: 2300, title: "Master Scholar" },
  { level: 8, minXp: 3200, title: "Skillora Fellow" }
];
function computeLevelInfo(totalXpInput) {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(totalXpInput) ? totalXpInput : 0));
  let current = LEVEL_THRESHOLDS[0];
  let nextMinXp = LEVEL_THRESHOLDS[1].minXp;
  if (totalXp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].minXp) {
    const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const step = 1e3;
    const extraLevels = Math.floor((totalXp - last.minXp) / step);
    const level = last.level + extraLevels;
    const minXp = last.minXp + extraLevels * step;
    nextMinXp = minXp + step;
    current = {
      level,
      minXp,
      title: extraLevels === 0 ? last.title : `Skillora Fellow Tier ${extraLevels + 1}`
    };
  } else {
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
      const candidate = LEVEL_THRESHOLDS[i];
      const next = LEVEL_THRESHOLDS[i + 1];
      if (!next || totalXp < next.minXp) {
        current = candidate;
        nextMinXp = next ? next.minXp : candidate.minXp + 1e3;
        break;
      }
    }
  }
  const xpIntoCurrentLevel = Math.max(0, totalXp - current.minXp);
  const xpNeededForNextLevel = Math.max(1, nextMinXp - current.minXp);
  const xpToNextLevel = Math.max(0, nextMinXp - totalXp);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(xpIntoCurrentLevel / xpNeededForNextLevel * 100))
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
    progressPercent
  };
}
function normalizeDirectionLabel(raw) {
  const clean = (raw || "").trim();
  return clean || "General Learning";
}
function normalizeDirectionKey(raw) {
  return normalizeDirectionLabel(raw).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "general_learning";
}
function resolveRoadmapDirection(roadmap) {
  if (!roadmap) return "General Learning";
  return normalizeDirectionLabel(
    roadmap.roadmapData?.primaryDirection || roadmap.careerGoal || roadmap.title
  );
}
function formatCertificateTypeLabel(type) {
  switch (type) {
    case "course_completion":
      return "Course Completion Certificate";
    case "path_completion":
      return "Learning Path Completion Certificate";
    case "excellence":
      return "Excellence Award Certificate";
  }
}
function defaultTemplateForCertificateType(type) {
  switch (type) {
    case "excellence":
      return "excellence_award";
    case "path_completion":
      return "modern_professional";
    case "course_completion":
    default:
      return "classic_academic";
  }
}
function maskStudentNameForPrivacy(fullName, visibility) {
  const clean = (fullName || "").trim() || "Skillora Learner";
  if (visibility === "full_name") return clean;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return `${parts[0].slice(0, 1).toUpperCase()}.`;
  }
  return parts.map((p) => `${p.slice(0, 1).toUpperCase()}.`).join(" ");
}
function stableHash32(input, seed = 2166136261) {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
function generateDeterministicCertificateNumber(seedKey, issuedAtIso) {
  const year = (() => {
    const d = new Date(issuedAtIso);
    return Number.isFinite(d.getTime()) ? d.getUTCFullYear() : (/* @__PURE__ */ new Date()).getUTCFullYear();
  })();
  const h1 = stableHash32(seedKey, 2166136261).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  const h2 = stableHash32(`${seedKey}:${issuedAtIso.slice(0, 10)}`, 2654435761).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  return `SKL-${year}-${h1}-${h2}`;
}
function buildCertificateVerificationDigest(params) {
  const payload = [
    params.certificateNumber,
    params.certificateType,
    params.title,
    params.direction,
    params.completionDate.slice(0, 10)
  ].join("|");
  const p1 = stableHash32(payload, 2166136261).toString(16).toUpperCase().padStart(8, "0");
  const p2 = stableHash32(`${payload}:skillora`, 1367130551).toString(16).toUpperCase().padStart(8, "0");
  return `${p1}-${p2}`;
}
function buildLessonEventKey(roadmapId, stageId, lessonId) {
  return `lesson:${roadmapId}:${stageId}:${lessonId}`;
}
function buildKnowledgeCheckPassEventKey(roadmapId, stageId, lessonId) {
  return `kc_pass:${roadmapId}:${stageId}:${lessonId}`;
}
function buildStageEventKey(roadmapId, stageId) {
  return `stage:${roadmapId}:${stageId}`;
}
function buildPathEventKey(roadmapId) {
  return `path:${roadmapId}`;
}
function buildCourseCertificateKey(roadmapId, stageId) {
  return `course:${roadmapId}:${stageId}`;
}
function buildPathCertificateKey(roadmapId) {
  return `path:${roadmapId}`;
}
function buildExcellenceCertificateKey(direction) {
  return `excellence:${normalizeDirectionKey(direction)}`;
}
function addDaysUtc(dateKey, delta) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}
function diffDateKeysUtc(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5);
}
function computeStreakSummaryForAchievements(params) {
  const safeTz = resolveSafeTimeZone(params.timeZone);
  const now = params.now ?? /* @__PURE__ */ new Date();
  const events = [];
  for (const rm of params.roadmaps) {
    for (const stage of rm.roadmapData?.stages ?? []) {
      for (const lesson of stage.lessons ?? []) {
        if (lesson.completed && lesson.completedAt) {
          events.push({
            type: "lesson_completed",
            timestamp: lesson.completedAt,
            completed: true
          });
        }
      }
    }
  }
  for (const kc of params.knowledgeCheckAttempts) {
    if (kc.completedAt) {
      events.push({
        type: "knowledge_check",
        timestamp: kc.completedAt,
        completed: true
      });
    }
  }
  for (const att of params.assessmentAttempts) {
    if (att.createdAt) {
      events.push({
        type: "assessment",
        timestamp: att.createdAt,
        completed: true
      });
    }
  }
  for (const sess of params.learningSessions) {
    const ts = sess.endedAt || sess.startedAt;
    if (!ts) continue;
    const candidate = {
      type: sess.activityType === "knowledge_check" ? "knowledge_check" : sess.activityType === "assessment" ? "assessment" : "lesson_study",
      timestamp: ts,
      durationSeconds: sess.durationSeconds,
      completed: sess.completed
    };
    if (isMeaningfulLearningActivity(candidate)) {
      events.push(candidate);
    }
  }
  const latestTsByDateKey = /* @__PURE__ */ new Map();
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
      maxStreakEndTimestamp: null
    };
  }
  let longestStreakDays = 0;
  let run = 0;
  let prevKey = null;
  const milestoneTargets = [3, 7, 14, 30, 100];
  const milestoneTimestamps = {};
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
        milestoneTimestamps[target] = latestTsByDateKey.get(key) ?? void 0;
      }
    }
    prevKey = key;
  }
  const todayKey = getDateKeyInTimeZone(now, safeTz) ?? "";
  const yesterdayKey = todayKey ? addDaysUtc(todayKey, -1) : "";
  let currentStreakDays = 0;
  if (todayKey && latestTsByDateKey.has(todayKey) || yesterdayKey && latestTsByDateKey.has(yesterdayKey)) {
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
    maxStreakEndTimestamp: milestoneTimestamps[7] ?? null
  };
}
function safeIsoOrFallback(candidate, fallback) {
  if (candidate) {
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (fallback) {
    const ms = new Date(fallback).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return (/* @__PURE__ */ new Date()).toISOString();
}
function pickLatestIso(timestamps, fallback) {
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
function evaluateVerifiedAchievements(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const nowIso = now.toISOString();
  const safeTz = resolveSafeTimeZone(input.timeZone);
  const studentName = (input.studentName || "").trim() || "Skillora Learner";
  const roadmapById = /* @__PURE__ */ new Map();
  for (const rm of input.roadmaps) {
    if (rm?.id) roadmapById.set(rm.id, rm);
  }
  const persistedLedgerMap = /* @__PURE__ */ new Map();
  for (const entry of input.persistedLedger ?? []) {
    if (entry.eventKey && !persistedLedgerMap.has(entry.eventKey)) {
      persistedLedgerMap.set(entry.eventKey, entry);
    }
  }
  const persistedBadgeMap = /* @__PURE__ */ new Map();
  for (const badgeRow of input.persistedBadges ?? []) {
    const id = badgeRow.badgeId;
    if (!persistedBadgeMap.has(id)) {
      persistedBadgeMap.set(id, badgeRow);
    }
  }
  const persistedCertMap = /* @__PURE__ */ new Map();
  for (const cert of input.persistedCertificates ?? []) {
    if (cert.certificateKey && !persistedCertMap.has(cert.certificateKey)) {
      persistedCertMap.set(cert.certificateKey, cert);
    }
  }
  const derivedEventsMap = /* @__PURE__ */ new Map();
  const registerDerivedEvent = (candidate) => {
    if (derivedEventsMap.has(candidate.eventKey)) return;
    const existing = persistedLedgerMap.get(candidate.eventKey);
    const roadmapDir = candidate.roadmapId && roadmapById.has(candidate.roadmapId) ? resolveRoadmapDirection(roadmapById.get(candidate.roadmapId)) : null;
    const resolvedDirection = existing?.direction?.trim() || candidate.direction?.trim() || roadmapDir || "General Learning";
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
      awardedAt: existing?.awardedAt ?? candidate.awardedAt
    });
  };
  let activeCompletedLessons = 0;
  let activeCompletedStages = 0;
  let activeCompletedPaths = 0;
  const distinctStagesWithCompletedLessons = /* @__PURE__ */ new Set();
  const completedLessonsPerDay = /* @__PURE__ */ new Map();
  const passingKcsByStage = /* @__PURE__ */ new Map();
  const sortedPassingKcs = input.knowledgeCheckAttempts.filter((kc) => Number(kc.score) >= KNOWLEDGE_CHECK_PASS_MIN_PERCENT).slice().sort(
    (a, b) => new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()
  );
  for (const kc of sortedPassingKcs) {
    if (!kc.roadmapId || !kc.stageId) continue;
    const stageKey = `${kc.roadmapId}:${kc.stageId}`;
    const list = passingKcsByStage.get(stageKey) ?? [];
    list.push(kc);
    passingKcsByStage.set(stageKey, list);
  }
  for (const roadmap of input.roadmaps) {
    if (!roadmap?.id) continue;
    const roadmapFallbackTs = safeIsoOrFallback(roadmap.updatedAt || roadmap.createdAt, nowIso);
    const direction = resolveRoadmapDirection(roadmap);
    const stages = roadmap.roadmapData?.stages ?? [];
    let totalLessonsInRoadmap = 0;
    let completedLessonsInRoadmap = 0;
    const roadmapCompletionTimestamps = [];
    for (const stage of stages) {
      if (!stage?.id) continue;
      const lessons = stage.lessons ?? [];
      totalLessonsInRoadmap += lessons.length;
      let stageCompletedLessons = 0;
      const stageCompletionTimestamps = [];
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
                latestTs: new Date(lessonTs).getTime() > new Date(existingDay.latestTs).getTime() ? lessonTs : existingDay.latestTs
              });
            }
          }
          registerDerivedEvent({
            eventKey: buildLessonEventKey(roadmap.id, stage.id, lesson.id),
            eventType: "lesson_completed",
            xpAmount: XP_REWARDS.LESSON_FIRST_COMPLETION,
            title: `Completed lesson: ${lesson.title || "Lesson"}`,
            direction,
            roadmapId: roadmap.id,
            stageId: stage.id,
            lessonId: lesson.id,
            awardedAt: lessonTs
          });
        }
      }
      if (lessons.length > 0 && stageCompletedLessons === lessons.length) {
        activeCompletedStages += 1;
        registerDerivedEvent({
          eventKey: buildStageEventKey(roadmap.id, stage.id),
          eventType: "stage_completed",
          xpAmount: XP_REWARDS.STAGE_FIRST_COMPLETION,
          title: `Completed course stage: ${stage.title || "Learning Stage"}`,
          direction,
          roadmapId: roadmap.id,
          stageId: stage.id,
          lessonId: null,
          awardedAt: pickLatestIso(stageCompletionTimestamps, roadmapFallbackTs)
        });
      }
    }
    if (stages.length > 0 && totalLessonsInRoadmap > 0 && completedLessonsInRoadmap === totalLessonsInRoadmap) {
      activeCompletedPaths += 1;
      registerDerivedEvent({
        eventKey: buildPathEventKey(roadmap.id),
        eventType: "path_completed",
        xpAmount: XP_REWARDS.PATH_FIRST_COMPLETION,
        title: `Completed learning path: ${roadmap.title || roadmap.careerGoal || "Learning Path"}`,
        direction,
        roadmapId: roadmap.id,
        stageId: null,
        lessonId: null,
        awardedAt: pickLatestIso(roadmapCompletionTimestamps, roadmapFallbackTs)
      });
    }
  }
  const passedLessonKeys = /* @__PURE__ */ new Set();
  for (const kc of sortedPassingKcs) {
    if (!kc.roadmapId || !kc.stageId || !kc.lessonId) continue;
    const eventKey = buildKnowledgeCheckPassEventKey(kc.roadmapId, kc.stageId, kc.lessonId);
    passedLessonKeys.add(eventKey);
    const roadmapDir = roadmapById.has(kc.roadmapId) ? resolveRoadmapDirection(roadmapById.get(kc.roadmapId)) : "General Learning";
    registerDerivedEvent({
      eventKey,
      eventType: "knowledge_check_passed",
      xpAmount: XP_REWARDS.KNOWLEDGE_CHECK_FIRST_PASS,
      title: `Passed Knowledge Check: ${kc.lessonTitle || "Lesson Quiz"} (${kc.score}%)`,
      direction: roadmapDir,
      roadmapId: kc.roadmapId,
      stageId: kc.stageId,
      lessonId: kc.lessonId,
      awardedAt: safeIsoOrFallback(kc.completedAt, nowIso)
    });
  }
  for (const persisted of persistedLedgerMap.values()) {
    if (!derivedEventsMap.has(persisted.eventKey)) {
      const roadmapDir = persisted.roadmapId && roadmapById.has(persisted.roadmapId) ? resolveRoadmapDirection(roadmapById.get(persisted.roadmapId)) : null;
      derivedEventsMap.set(persisted.eventKey, {
        ...persisted,
        direction: persisted.direction?.trim() || roadmapDir || "General Learning"
      });
    }
  }
  const allLedgerEntries = Array.from(derivedEventsMap.values()).sort(
    (a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
  );
  const newlyEligibleEvents = Array.from(derivedEventsMap.values()).filter(
    (evt) => !persistedLedgerMap.has(evt.eventKey)
  );
  let totalXp = 0;
  let lessonXp = 0;
  let knowledgeCheckXp = 0;
  let stageXp = 0;
  let pathXp = 0;
  let ledgerLessonsCount = 0;
  let ledgerPassedKcCount = 0;
  let ledgerStagesCount = 0;
  let ledgerPathsCount = 0;
  const directionAccMap = /* @__PURE__ */ new Map();
  for (const entry of allLedgerEntries) {
    totalXp += entry.xpAmount;
    switch (entry.eventType) {
      case "lesson_completed":
        lessonXp += entry.xpAmount;
        ledgerLessonsCount += 1;
        break;
      case "knowledge_check_passed":
        knowledgeCheckXp += entry.xpAmount;
        ledgerPassedKcCount += 1;
        break;
      case "stage_completed":
        stageXp += entry.xpAmount;
        ledgerStagesCount += 1;
        break;
      case "path_completed":
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
      lastAwardedAt: null
    };
    acc.totalXp += entry.xpAmount;
    if (entry.eventType === "lesson_completed") acc.completedLessons += 1;
    if (entry.eventType === "knowledge_check_passed") acc.passedKnowledgeChecks += 1;
    if (entry.eventType === "stage_completed") acc.completedCourses += 1;
    if (entry.eventType === "path_completed") acc.completedPaths += 1;
    if (!acc.lastAwardedAt || new Date(entry.awardedAt).getTime() > new Date(acc.lastAwardedAt).getTime()) {
      acc.lastAwardedAt = entry.awardedAt;
    }
    directionAccMap.set(dirKey, acc);
  }
  const resolvedActiveDirection = (() => {
    if (input.activeDirection && input.activeDirection.trim()) {
      return input.activeDirection.trim();
    }
    const activeRm = input.roadmaps.find((r) => r.status === "active") ?? input.roadmaps[0];
    return activeRm ? resolveRoadmapDirection(activeRm) : "";
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
        lastAwardedAt: null
      });
    }
  }
  const directionXpBreakdown = Array.from(directionAccMap.values()).map((acc) => ({
    ...acc,
    levelInfo: computeLevelInfo(acc.totalXp)
  })).sort((a, b) => {
    if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
    return a.direction.localeCompare(b.direction);
  });
  const activeDirectionKey = resolvedActiveDirection ? normalizeDirectionKey(resolvedActiveDirection) : "";
  const activeDirectionXp = activeDirectionKey ? directionAccMap.get(activeDirectionKey)?.totalXp ?? 0 : totalXp;
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
    now
  });
  const maxObservedStreak = Math.max(
    streakSummary.currentStreakDays,
    streakSummary.longestStreakDays
  );
  const completedStudySessionsCount = input.learningSessions.filter(
    (s) => s.completed || s.durationSeconds >= 60
  ).length;
  const practiceActivitiesCount = Math.max(
    completedLessonsCount,
    completedStudySessionsCount
  );
  const gradedEvaluations = [
    ...input.knowledgeCheckAttempts.map((kc) => ({
      score: Number(kc.score) || 0,
      timestamp: safeIsoOrFallback(kc.completedAt, nowIso),
      roadmapId: kc.roadmapId,
      stageId: kc.stageId
    })),
    ...input.assessmentAttempts.map((att) => ({
      score: Number(att.scorePercent) || 0,
      timestamp: safeIsoOrFallback(att.createdAt, nowIso),
      roadmapId: null,
      stageId: null
    }))
  ];
  const averageQuizAndAssessmentScore = gradedEvaluations.length > 0 ? Math.round(
    gradedEvaluations.reduce((sum, item) => sum + item.score, 0) / gradedEvaluations.length
  ) : null;
  const perfectScoreAttempt = gradedEvaluations.filter((item) => item.score >= 100).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
  const fastLearnerDay = Array.from(completedLessonsPerDay.values()).filter((d) => d.count >= 3).sort((a, b) => new Date(a.latestTs).getTime() - new Date(b.latestTs).getTime())[0];
  const maxLessonsInOneDay = Array.from(completedLessonsPerDay.values()).reduce(
    (max, d) => Math.max(max, d.count),
    0
  );
  const certificateEligibility = [];
  const derivedCertsMap = /* @__PURE__ */ new Map();
  const registerCertificate = (candidate) => {
    const existing = persistedCertMap.get(candidate.certificateKey);
    if (existing) {
      derivedCertsMap.set(candidate.certificateKey, existing);
      return;
    }
    const seed = `${input.userId || "local"}:${candidate.certificateKey}`;
    const certificateNumber = generateDeterministicCertificateNumber(
      seed,
      candidate.issuedAt
    );
    const verificationDigest = buildCertificateVerificationDigest({
      certificateNumber,
      certificateType: candidate.certificateType,
      title: candidate.title,
      direction: candidate.direction,
      completionDate: candidate.completionDate
    });
    derivedCertsMap.set(candidate.certificateKey, {
      id: candidate.certificateKey,
      certificateNumber,
      verificationDigest,
      ...candidate
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
    const pathCompletionTimestamps = [];
    for (let sIdx = 0; sIdx < stages.length; sIdx += 1) {
      const stage = stages[sIdx];
      if (!stage?.id) continue;
      const lessons = stage.lessons ?? [];
      const totalLessons = lessons.length;
      const completedLessons = lessons.filter((l) => l.completed === true).length;
      totalPathLessons += totalLessons;
      completedPathLessons += completedLessons;
      const stageCompletionTsList = lessons.filter((l) => l.completed).map((l) => safeIsoOrFallback(l.completedAt, roadmapFallbackTs));
      pathCompletionTimestamps.push(...stageCompletionTsList);
      const stagePassedKcs = passingKcsByStage.get(`${roadmap.id}:${stage.id}`) ?? [];
      const hasPassedStageKc = stagePassedKcs.length >= 1;
      if (hasPassedStageKc) stagesWithPassedKc += 1;
      const allStageLessonsDone = totalLessons > 0 && completedLessons === totalLessons;
      const courseCertKey = buildCourseCertificateKey(roadmap.id, stage.id);
      const alreadyEarned = persistedCertMap.has(courseCertKey);
      const courseEligible = allStageLessonsDone && hasPassedStageKc || alreadyEarned;
      const checklist = [
        {
          label: "Complete all course lessons",
          completed: allStageLessonsDone,
          detail: `${completedLessons} / ${totalLessons} lessons completed`
        },
        {
          label: `Pass at least 1 Knowledge Check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
          completed: hasPassedStageKc,
          detail: hasPassedStageKc ? `${stagePassedKcs.length} passed (${Math.max(...stagePassedKcs.map((k) => k.score))}% best)` : "0 / 1 quiz passed in this course"
        }
      ];
      const lessonWeight = totalLessons > 0 ? completedLessons / totalLessons * 75 : 0;
      const quizWeight = hasPassedStageKc ? 25 : 0;
      const courseProgressPct = courseEligible ? 100 : Math.min(99, Math.round(lessonWeight + quizWeight));
      const courseCompletionDate = allStageLessonsDone && hasPassedStageKc ? pickLatestIso(
        [
          ...stageCompletionTsList,
          stagePassedKcs[0]?.completedAt
        ],
        roadmapFallbackTs
      ) : null;
      certificateEligibility.push({
        certificateKey: courseCertKey,
        certificateType: "course_completion",
        certificateTypeLabel: formatCertificateTypeLabel("course_completion"),
        title: stage.title || `Course ${sIdx + 1}`,
        direction,
        roadmapId: roadmap.id,
        stageId: stage.id,
        eligible: courseEligible,
        earned: courseEligible,
        completionDate: courseCompletionDate,
        progressPercent: courseProgressPct,
        checklist
      });
      if (courseEligible && courseCompletionDate) {
        registerCertificate({
          certificateKey: courseCertKey,
          certificateType: "course_completion",
          certificateTypeLabel: formatCertificateTypeLabel("course_completion"),
          title: stage.title || `Course ${sIdx + 1}`,
          direction,
          studentName,
          roadmapId: roadmap.id,
          stageId: stage.id,
          templateId: defaultTemplateForCertificateType("course_completion"),
          publicNameVisibility: "full_name",
          issuerName: "Skillora",
          issuerDesignation: "Academic & Curriculum Verification Board",
          status: "valid",
          completionDate: courseCompletionDate,
          issuedAt: courseCompletionDate,
          metadata: {
            roadmapTitle: roadmap.title,
            stageNumber: sIdx + 1,
            lessonsCompleted: completedLessons,
            bestQuizScore: Math.max(...stagePassedKcs.map((k) => k.score))
          }
        });
      }
    }
    const pathCertKey = buildPathCertificateKey(roadmap.id);
    const pathAlreadyEarned = persistedCertMap.has(pathCertKey);
    const allPathLessonsDone = stages.length > 0 && totalPathLessons > 0 && completedPathLessons === totalPathLessons;
    const allStagesHavePassedKc = stages.length > 0 && stagesWithPassedKc === stages.length;
    const pathEligible = allPathLessonsDone && allStagesHavePassedKc || pathAlreadyEarned;
    const pathChecklist = [
      {
        label: "Complete all lessons across every stage",
        completed: allPathLessonsDone,
        detail: `${completedPathLessons} / ${totalPathLessons} lessons completed`
      },
      {
        label: `Verify every stage with a passing Knowledge Check (${KNOWLEDGE_CHECK_PASS_MIN_PERCENT}%+)`,
        completed: allStagesHavePassedKc,
        detail: `${stagesWithPassedKc} / ${stages.length} stages verified by quiz`
      }
    ];
    const pathLessonWeight = totalPathLessons > 0 ? completedPathLessons / totalPathLessons * 70 : 0;
    const pathKcWeight = stages.length > 0 ? stagesWithPassedKc / stages.length * 30 : 0;
    const pathProgressPct = pathEligible ? 100 : Math.min(99, Math.round(pathLessonWeight + pathKcWeight));
    const pathCompletionDate = allPathLessonsDone && allStagesHavePassedKc ? pickLatestIso(
      [
        ...pathCompletionTimestamps,
        ...stages.flatMap(
          (st) => (passingKcsByStage.get(`${roadmap.id}:${st.id}`) ?? []).map(
            (k) => k.completedAt
          )
        )
      ],
      roadmapFallbackTs
    ) : null;
    certificateEligibility.push({
      certificateKey: pathCertKey,
      certificateType: "path_completion",
      certificateTypeLabel: formatCertificateTypeLabel("path_completion"),
      title: roadmap.title || `${direction} Learning Path`,
      direction,
      roadmapId: roadmap.id,
      stageId: null,
      eligible: pathEligible,
      earned: pathEligible,
      completionDate: pathCompletionDate,
      progressPercent: pathProgressPct,
      checklist: pathChecklist
    });
    if (pathEligible && pathCompletionDate) {
      registerCertificate({
        certificateKey: pathCertKey,
        certificateType: "path_completion",
        certificateTypeLabel: formatCertificateTypeLabel("path_completion"),
        title: roadmap.title || `${direction} Learning Path`,
        direction,
        studentName,
        roadmapId: roadmap.id,
        stageId: null,
        templateId: defaultTemplateForCertificateType("path_completion"),
        publicNameVisibility: "full_name",
        issuerName: "Skillora",
        issuerDesignation: "Academic & Curriculum Verification Board",
        status: "valid",
        completionDate: pathCompletionDate,
        issuedAt: pathCompletionDate,
        metadata: {
          stagesCount: stages.length,
          totalLessons: totalPathLessons
        }
      });
    }
  }
  const excellenceTargetDirection = resolvedActiveDirection || directionXpBreakdown[0]?.direction || "";
  if (excellenceTargetDirection) {
    const dirSummary = directionAccMap.get(normalizeDirectionKey(excellenceTargetDirection));
    const dirXp = dirSummary?.totalXp ?? 0;
    const dirCourses = dirSummary?.completedCourses ?? 0;
    const dirRoadmapIds = new Set(
      input.roadmaps.filter(
        (r) => normalizeDirectionKey(resolveRoadmapDirection(r)) === normalizeDirectionKey(excellenceTargetDirection)
      ).map((r) => r.id)
    );
    const dirKcs = input.knowledgeCheckAttempts.filter(
      (kc) => dirRoadmapIds.has(kc.roadmapId)
    );
    const dirGraded = [
      ...dirKcs.map((k) => ({ score: Number(k.score) || 0, ts: k.completedAt })),
      ...input.assessmentAttempts.map((a) => ({ score: Number(a.scorePercent) || 0, ts: a.createdAt }))
    ];
    const dirGradedCount = dirGraded.length;
    const dirAvgScore = dirGradedCount > 0 ? Math.round(dirGraded.reduce((s, g) => s + g.score, 0) / dirGradedCount) : 0;
    const exCertKey = buildExcellenceCertificateKey(excellenceTargetDirection);
    const exAlreadyEarned = persistedCertMap.has(exCertKey);
    const meetsCourse = dirCourses >= 1;
    const meetsAvg = dirGradedCount >= EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT && dirAvgScore >= EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT;
    const meetsXp = dirXp >= EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP;
    const exEligible = meetsCourse && meetsAvg && meetsXp || exAlreadyEarned;
    const exCompletionDate = meetsCourse && meetsAvg && meetsXp ? pickLatestIso(
      dirGraded.map((g) => g.ts),
      nowIso
    ) : null;
    const exPct = exEligible ? 100 : Math.min(
      99,
      Math.round(
        (meetsCourse ? 34 : 0) + Math.min(1, dirXp / EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP) * 33 + Math.min(1, dirGradedCount / EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT) * (dirAvgScore >= EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT ? 33 : 16)
      )
    );
    certificateEligibility.push({
      certificateKey: exCertKey,
      certificateType: "excellence",
      certificateTypeLabel: formatCertificateTypeLabel("excellence"),
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
          label: "Complete at least 1 full course in this direction",
          completed: meetsCourse,
          detail: `${dirCourses} / 1 course completed`
        },
        {
          label: `Achieve ${EXCELLENCE_CERTIFICATE_MIN_AVG_PERCENT}%+ average across ${EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT}+ graded quizzes/assessments`,
          completed: meetsAvg,
          detail: dirGradedCount > 0 ? `${dirAvgScore}% avg across ${dirGradedCount} graded` : `0 / ${EXCELLENCE_CERTIFICATE_MIN_GRADED_COUNT} graded evaluations`
        },
        {
          label: `Earn ${EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP}+ XP in ${excellenceTargetDirection}`,
          completed: meetsXp,
          detail: `${dirXp} / ${EXCELLENCE_CERTIFICATE_MIN_DIRECTION_XP} XP`
        }
      ]
    });
    if (exEligible && exCompletionDate) {
      registerCertificate({
        certificateKey: exCertKey,
        certificateType: "excellence",
        certificateTypeLabel: formatCertificateTypeLabel("excellence"),
        title: `Excellence in ${excellenceTargetDirection}`,
        direction: excellenceTargetDirection,
        studentName,
        roadmapId: null,
        stageId: null,
        templateId: defaultTemplateForCertificateType("excellence"),
        publicNameVisibility: "full_name",
        issuerName: "Skillora",
        issuerDesignation: "Academic & Curriculum Verification Board",
        status: "valid",
        completionDate: exCompletionDate,
        issuedAt: exCompletionDate,
        metadata: {
          averageScore: dirAvgScore,
          gradedCount: dirGradedCount,
          directionXp: dirXp
        }
      });
    }
  }
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
  const earliestForType = (type) => {
    const matches = allLedgerEntries.filter((e) => e.eventType === type).sort((a, b) => new Date(a.awardedAt).getTime() - new Date(b.awardedAt).getTime());
    return matches[0]?.awardedAt ?? nowIso;
  };
  const nthForType = (type, indexZeroBased) => {
    const matches = allLedgerEntries.filter((e) => e.eventType === type).sort((a, b) => new Date(a.awardedAt).getTime() - new Date(b.awardedAt).getTime());
    return matches[indexZeroBased]?.awardedAt ?? matches[matches.length - 1]?.awardedAt ?? nowIso;
  };
  const earliestAssessmentTs = (() => {
    const sorted = input.assessmentAttempts.filter((a) => Boolean(a.createdAt)).slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted[0]?.createdAt ? safeIsoOrFallback(sorted[0].createdAt, nowIso) : nowIso;
  })();
  const badges = BADGE_DEFINITIONS.map((def) => {
    const persisted = persistedBadgeMap.get(def.id);
    let unlockedNow = false;
    let progressCurrent = 0;
    let progressTarget = 1;
    let progressLabel = "";
    let derivedUnlockedAt = null;
    switch (def.id) {
      case "first_lesson_completed":
      case "first_step":
        progressTarget = 1;
        progressCurrent = Math.min(1, completedLessonsCount);
        unlockedNow = completedLessonsCount >= 1;
        progressLabel = unlockedNow ? "1 / 1 lesson" : "0 / 1 lesson";
        if (unlockedNow) derivedUnlockedAt = earliestForType("lesson_completed");
        break;
      case "first_course_completed":
      case "stage_master":
        progressTarget = 1;
        progressCurrent = Math.min(1, completedStagesCount);
        unlockedNow = completedStagesCount >= 1;
        progressLabel = unlockedNow ? "1 / 1 course stage" : "0 / 1 course stage";
        if (unlockedNow) derivedUnlockedAt = earliestForType("stage_completed");
        break;
      case "first_learning_path_completed":
      case "path_finisher":
        progressTarget = 1;
        progressCurrent = Math.min(1, completedPathsCount);
        unlockedNow = completedPathsCount >= 1;
        progressLabel = unlockedNow ? "1 / 1 learning path" : "0 / 1 learning path";
        if (unlockedNow) derivedUnlockedAt = earliestForType("path_completed");
        break;
      case "roadmap_explorer": {
        const roadmapCount = input.roadmaps.length;
        const stageReach = distinctStagesWithCompletedLessons.size;
        unlockedNow = roadmapCount >= 2 || stageReach >= 3;
        progressTarget = roadmapCount >= 2 ? 2 : 3;
        progressCurrent = unlockedNow ? progressTarget : Math.max(roadmapCount, Math.min(2, stageReach));
        progressLabel = unlockedNow ? roadmapCount >= 2 ? `${roadmapCount} roadmaps explored` : `${stageReach} stages explored` : `${stageReach} / 3 stages or ${roadmapCount} / 2 paths`;
        if (unlockedNow) {
          derivedUnlockedAt = input.roadmaps[1]?.createdAt || earliestForType("lesson_completed");
        }
        break;
      }
      case "streak_3_days":
        progressTarget = 3;
        progressCurrent = Math.min(3, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 3;
        progressLabel = `${progressCurrent} / 3 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[3], nowIso);
        }
        break;
      case "streak_7_days":
      case "consistent_learner":
        progressTarget = 7;
        progressCurrent = Math.min(7, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 7;
        progressLabel = `${progressCurrent} / 7 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[7], nowIso);
        }
        break;
      case "streak_14_days":
        progressTarget = 14;
        progressCurrent = Math.min(14, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 14;
        progressLabel = `${progressCurrent} / 14 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[14], nowIso);
        }
        break;
      case "streak_30_days":
        progressTarget = 30;
        progressCurrent = Math.min(30, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 30;
        progressLabel = `${progressCurrent} / 30 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[30], nowIso);
        }
        break;
      case "streak_100_days":
        progressTarget = 100;
        progressCurrent = Math.min(100, maxObservedStreak);
        unlockedNow = maxObservedStreak >= 100;
        progressLabel = `${progressCurrent} / 100 day streak`;
        if (unlockedNow) {
          derivedUnlockedAt = safeIsoOrFallback(streakSummary.milestoneTimestamps[100], nowIso);
        }
        break;
      case "knowledge_seeker":
        progressTarget = 1;
        progressCurrent = Math.min(1, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 1;
        progressLabel = unlockedNow ? "1 / 1 passed quiz" : "0 / 1 passed quiz";
        if (unlockedNow) derivedUnlockedAt = earliestForType("knowledge_check_passed");
        break;
      case "skill_assessor":
        progressTarget = 1;
        progressCurrent = Math.min(1, assessmentsCount);
        unlockedNow = assessmentsCount >= 1;
        progressLabel = unlockedNow ? "1 / 1 assessment" : "0 / 1 assessment";
        if (unlockedNow) derivedUnlockedAt = earliestAssessmentTs;
        break;
      case "knowledge_master":
        progressTarget = 5;
        progressCurrent = Math.min(5, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 5;
        progressLabel = `${progressCurrent} / 5 passed quizzes`;
        if (unlockedNow) derivedUnlockedAt = nthForType("knowledge_check_passed", 4);
        break;
      case "quiz_champion":
        progressTarget = 10;
        progressCurrent = Math.min(10, passedKnowledgeChecksCount);
        unlockedNow = passedKnowledgeChecksCount >= 10;
        progressLabel = `${progressCurrent} / 10 passed quizzes`;
        if (unlockedNow) derivedUnlockedAt = nthForType("knowledge_check_passed", 9);
        break;
      case "perfect_score":
        progressTarget = 1;
        progressCurrent = perfectScoreAttempt ? 1 : 0;
        unlockedNow = Boolean(perfectScoreAttempt);
        progressLabel = unlockedNow ? "100% achieved" : "Best: " + (gradedEvaluations.length > 0 ? `${Math.max(...gradedEvaluations.map((g) => g.score))}%` : "0%");
        if (unlockedNow && perfectScoreAttempt) {
          derivedUnlockedAt = perfectScoreAttempt.timestamp;
        }
        break;
      case "practice_champion":
        progressTarget = 10;
        progressCurrent = Math.min(10, practiceActivitiesCount);
        unlockedNow = practiceActivitiesCount >= 10;
        progressLabel = `${progressCurrent} / 10 study activities`;
        if (unlockedNow) derivedUnlockedAt = nthForType("lesson_completed", 9);
        break;
      case "skill_builder": {
        const lessonPart = Math.min(5, completedLessonsCount);
        const assessPart = Math.min(1, assessmentsCount);
        progressTarget = 6;
        progressCurrent = lessonPart + assessPart;
        unlockedNow = completedLessonsCount >= 5 && assessmentsCount >= 1;
        progressLabel = `${lessonPart}/5 lessons \xB7 ${assessPart}/1 diagnostic`;
        if (unlockedNow) {
          derivedUnlockedAt = pickLatestIso(
            [nthForType("lesson_completed", 4), earliestAssessmentTs],
            nowIso
          );
        }
        break;
      }
      case "fast_learner":
        progressTarget = 3;
        unlockedNow = Boolean(fastLearnerDay);
        progressCurrent = unlockedNow ? 3 : Math.min(3, maxLessonsInOneDay);
        progressLabel = unlockedNow ? "3 / 3 lessons in 1 day" : `${Math.min(3, maxLessonsInOneDay)} / 3 lessons in 1 day`;
        if (unlockedNow && fastLearnerDay) {
          derivedUnlockedAt = fastLearnerDay.latestTs;
        }
        break;
      case "learning_excellence": {
        const avg = averageQuizAndAssessmentScore ?? 0;
        const hasCourse = completedStagesCount >= 1;
        const hasGraded = gradedEvaluations.length >= 3 && avg >= 90;
        unlockedNow = hasCourse && hasGraded;
        progressTarget = 2;
        progressCurrent = (hasCourse ? 1 : 0) + (hasGraded ? 1 : 0);
        progressLabel = unlockedNow ? `${avg}% avg \xB7 ${completedStagesCount} course` : `${completedStagesCount}/1 course \xB7 ${avg}% avg (${gradedEvaluations.length}/3 graded)`;
        if (unlockedNow) {
          derivedUnlockedAt = pickLatestIso(
            [earliestForType("stage_completed"), gradedEvaluations[2]?.timestamp],
            nowIso
          );
        }
        break;
      }
      case "subject_expert":
        progressTarget = 1e3;
        progressCurrent = Math.min(1e3, maxSingleDirectionXp);
        unlockedNow = maxSingleDirectionXp >= 1e3 || completedPathsCount >= 1;
        progressLabel = unlockedNow ? completedPathsCount >= 1 ? "Path mastered" : "1,000+ direction XP" : `${maxSingleDirectionXp} / 1,000 direction XP`;
        if (unlockedNow) {
          derivedUnlockedAt = completedPathsCount >= 1 ? earliestForType("path_completed") : allLedgerEntries[0]?.awardedAt ?? nowIso;
        }
        break;
    }
    const isUnlocked = Boolean(persisted) || unlockedNow;
    const unlockedAt = persisted?.unlockedAt ? safeIsoOrFallback(persisted.unlockedAt, nowIso) : isUnlocked ? derivedUnlockedAt ?? nowIso : null;
    if (isUnlocked && progressCurrent < progressTarget) {
      progressCurrent = progressTarget;
    }
    return {
      ...def,
      unlocked: isUnlocked,
      unlockedAt,
      progressCurrent,
      progressTarget,
      progressLabel: isUnlocked && def.id === "consistent_learner" ? "7 / 7 day streak" : isUnlocked && def.category === "consistency" ? `${progressTarget} / ${progressTarget} day streak` : progressLabel
    };
  });
  const verifiedBadgesToPersist = badges.filter((b) => b.unlocked).map((b) => ({
    badgeId: b.id,
    unlockedAt: b.unlockedAt ?? nowIso,
    metadata: {
      title: b.title,
      category: b.category,
      rarity: b.rarity,
      unlockRequirement: b.unlockRequirement
    }
  }));
  const newlyUnlockedBadges = verifiedBadgesToPersist.filter(
    (b) => !persistedBadgeMap.has(b.badgeId)
  );
  const recentAchievements = [
    ...allCertificates.map((cert) => ({
      id: `cert-${cert.certificateKey}`,
      kind: "certificate",
      certificateId: cert.id,
      title: `Certificate Earned: ${cert.title}`,
      subtitle: `${cert.certificateTypeLabel} \xB7 ${cert.certificateNumber}`,
      direction: cert.direction,
      timestamp: cert.issuedAt
    })),
    ...badges.filter((b) => b.unlocked && b.unlockedAt).map((b) => ({
      id: `badge-${b.id}`,
      kind: "badge",
      badgeId: b.id,
      title: `Badge Unlocked: ${b.title}`,
      subtitle: `${b.categoryLabel} \xB7 ${b.rarity}`,
      timestamp: b.unlockedAt
    })),
    ...allLedgerEntries.slice(0, 15).map((entry) => ({
      id: `xp-${entry.eventKey}`,
      kind: "xp",
      eventType: entry.eventType,
      title: entry.title,
      subtitle: `${entry.direction || "General"} \xB7 +${entry.xpAmount} XP`,
      direction: entry.direction ?? null,
      xpAmount: entry.xpAmount,
      timestamp: entry.awardedAt
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 18);
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
        averageQuizAndAssessmentScore
      }
    },
    verifiedEventsToPersist: allLedgerEntries,
    newlyEligibleEvents,
    verifiedBadgesToPersist,
    newlyUnlockedBadges,
    verifiedCertificatesToPersist: allCertificates,
    newlyEligibleCertificates
  };
}

// server/achievementService.ts
var AchievementApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AchievementApiError";
    this.status = status;
    this.code = code;
  }
};
var PHASE8_BADGE_IDS = /* @__PURE__ */ new Set([
  "first_step",
  "knowledge_seeker",
  "consistent_learner",
  "stage_master",
  "path_finisher",
  "skill_assessor"
]);
function getSupabaseEnv2() {
  return {
    supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ""
  };
}
function createUserScopedClient2(accessToken) {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv2();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new AchievementApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient7(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function createAnonPublicClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv2();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new AchievementApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase configuration is missing on the server."
    );
  }
  return createClient7(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
function createServiceRoleClient2() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv2();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient7(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
async function authenticateBearerRequest2(authorizationHeader) {
  const header = authorizationHeader?.trim() || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new AchievementApiError(
      401,
      "MISSING_AUTH_TOKEN",
      "Please sign in with an active Skillora session."
    );
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    throw new AchievementApiError(401, "INVALID_AUTH_TOKEN", "Missing access token.");
  }
  const supabase = createUserScopedClient2(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    throw new AchievementApiError(
      401,
      "UNAUTHORIZED",
      "Your session is invalid or expired. Please sign in again."
    );
  }
  const meta = data.user.user_metadata ?? {};
  const authFullName = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : "";
  return { userId: data.user.id, authFullName, supabase };
}
function isMissingSchemaError(err) {
  if (!err) return false;
  const code = (err.code || "").toUpperCase();
  const msg = (err.message || "").toLowerCase();
  return code === "42P01" || code === "42883" || code === "42703" || code === "PGRST204" || code === "PGRST205" || code === "PGRST202" || msg.includes("could not find the table") || msg.includes("could not find the function") || msg.includes("could not find the") || msg.includes("does not exist");
}
function mapRoadmapRow(row) {
  const roadmapDataRaw = row.roadmap_data && typeof row.roadmap_data === "object" ? row.roadmap_data : {
    title: typeof row.title === "string" ? row.title : "Learning Path",
    careerGoal: typeof row.career_goal === "string" ? row.career_goal : "",
    description: typeof row.description === "string" ? row.description : "",
    estimatedTotalDuration: "",
    personalizationExplanation: "",
    assessmentValidated: false,
    stages: []
  };
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    title: typeof row.title === "string" ? row.title : roadmapDataRaw.title || "Learning Path",
    careerGoal: typeof row.career_goal === "string" ? row.career_goal : roadmapDataRaw.careerGoal || "",
    description: typeof row.description === "string" ? row.description : roadmapDataRaw.description || "",
    sourceAssessmentId: typeof row.source_assessment_id === "string" ? row.source_assessment_id : null,
    roadmapData: {
      ...roadmapDataRaw,
      stages: Array.isArray(roadmapDataRaw.stages) ? roadmapDataRaw.stages : []
    },
    status: row.status === "archived" ? "archived" : "active",
    createdAt: typeof row.created_at === "string" ? row.created_at : (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapKnowledgeCheckRow(row, fallbackUserId) {
  return {
    id: String(row.id ?? row.submission_id ?? ""),
    userId: typeof row.user_id === "string" ? row.user_id : fallbackUserId,
    roadmapId: String(row.roadmap_id ?? row.roadmapId ?? ""),
    stageId: String(row.stage_id ?? row.stageId ?? ""),
    lessonId: String(row.lesson_id ?? row.lessonId ?? ""),
    lessonTitle: String(row.lesson_title ?? row.lessonTitle ?? "Lesson Quiz"),
    submissionId: String(row.submission_id ?? row.submissionId ?? row.id ?? ""),
    score: Number(row.score) || 0,
    totalQuestions: Number(row.total_questions ?? row.totalQuestions) || 1,
    correctAnswers: Number(row.correct_answers ?? row.correctAnswers) || 0,
    answers: Array.isArray(row.answers) ? row.answers : [],
    topicBreakdown: Array.isArray(row.topic_breakdown) ? row.topic_breakdown : [],
    knowledgeGaps: Array.isArray(row.knowledge_gaps) ? row.knowledge_gaps.filter((g) => typeof g === "string") : [],
    recommendation: row.recommendation && typeof row.recommendation === "object" ? row.recommendation : {
      action: "additional_practice",
      title: "",
      description: "",
      thresholdsUsed: { advanceMinPercent: 80, practiceMinPercent: 50 },
      focusTopics: []
    },
    completedAt: typeof row.completed_at === "string" ? row.completed_at : typeof row.completedAt === "string" ? row.completedAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapSessionRow(row) {
  const rawType = row.activity_type;
  const activityType = rawType === "knowledge_check" ? "knowledge_check" : rawType === "assessment" ? "assessment" : "lesson_study";
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    clientSessionId: String(row.client_session_id ?? row.id ?? ""),
    roadmapId: typeof row.roadmap_id === "string" ? row.roadmap_id : null,
    stageId: typeof row.stage_id === "string" ? row.stage_id : null,
    lessonId: typeof row.lesson_id === "string" ? row.lesson_id : null,
    lessonTitle: typeof row.lesson_title === "string" ? row.lesson_title : null,
    activityType,
    durationSeconds: Number(row.duration_seconds) || 0,
    startedAt: typeof row.started_at === "string" ? row.started_at : (/* @__PURE__ */ new Date()).toISOString(),
    endedAt: typeof row.ended_at === "string" ? row.ended_at : typeof row.started_at === "string" ? row.started_at : (/* @__PURE__ */ new Date()).toISOString(),
    completed: row.completed !== false
  };
}
function mapAssessmentRow(row) {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    subject: typeof row.subject === "string" ? row.subject : "Skill Assessment",
    difficulty: row.difficulty === "Beginner" || row.difficulty === "Intermediate" || row.difficulty === "Advanced" ? row.difficulty : "Intermediate",
    totalQuestions: Number(row.total_questions) || 0,
    correctAnswers: Number(row.correct_answers) || 0,
    scorePercent: Number(row.score_percent) || 0,
    strengths: Array.isArray(row.strengths) ? row.strengths.filter((s) => typeof s === "string") : [],
    knowledgeGaps: Array.isArray(row.knowledge_gaps) ? row.knowledge_gaps.filter((s) => typeof s === "string") : [],
    createdAt: typeof row.created_at === "string" ? row.created_at : (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapXpLedgerRow(row) {
  const rawType = String(row.event_type ?? "lesson_completed");
  const eventType = rawType === "knowledge_check_passed" || rawType === "stage_completed" || rawType === "path_completed" ? rawType : "lesson_completed";
  return {
    id: String(row.id ?? row.event_key ?? ""),
    eventKey: String(row.event_key ?? ""),
    eventType,
    xpAmount: Number(row.xp_amount) || 0,
    title: String(row.title ?? "Verified Learning Milestone"),
    direction: typeof row.direction === "string" && row.direction.trim() ? row.direction.trim() : null,
    roadmapId: typeof row.roadmap_id === "string" ? row.roadmap_id : null,
    stageId: typeof row.stage_id === "string" ? row.stage_id : null,
    lessonId: typeof row.lesson_id === "string" ? row.lesson_id : null,
    awardedAt: typeof row.awarded_at === "string" ? row.awarded_at : (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapPersistedBadgeRow(row) {
  return {
    badgeId: String(row.badge_id ?? ""),
    unlockedAt: typeof row.unlocked_at === "string" ? row.unlocked_at : (/* @__PURE__ */ new Date()).toISOString(),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  };
}
function mapCertificateRow(row) {
  const rawType = String(row.certificate_type ?? "course_completion");
  const certificateType = rawType === "path_completion" || rawType === "excellence" ? rawType : "course_completion";
  const rawTemplate = String(row.template_id ?? "");
  const templateId = rawTemplate === "classic_academic" || rawTemplate === "modern_professional" || rawTemplate === "excellence_award" ? rawTemplate : defaultTemplateForCertificateType(certificateType);
  const publicNameVisibility = row.public_name_visibility === "initials" ? "initials" : "full_name";
  const status = row.status === "revoked" ? "revoked" : "valid";
  return {
    id: String(row.id ?? row.certificate_key ?? ""),
    certificateNumber: String(row.certificate_number ?? ""),
    certificateKey: String(row.certificate_key ?? ""),
    certificateType,
    certificateTypeLabel: formatCertificateTypeLabel(certificateType),
    title: String(row.title ?? "Skillora Certificate"),
    direction: String(row.direction ?? "General Learning"),
    studentName: String(row.student_name ?? "Skillora Learner"),
    roadmapId: typeof row.roadmap_id === "string" ? row.roadmap_id : null,
    stageId: typeof row.stage_id === "string" ? row.stage_id : null,
    templateId,
    publicNameVisibility,
    issuerName: typeof row.issuer_name === "string" ? row.issuer_name : "Skillora",
    issuerDesignation: typeof row.issuer_designation === "string" ? row.issuer_designation : "Academic & Curriculum Verification Board",
    status,
    completionDate: typeof row.completion_date === "string" ? row.completion_date : (/* @__PURE__ */ new Date()).toISOString(),
    issuedAt: typeof row.issued_at === "string" ? row.issued_at : (/* @__PURE__ */ new Date()).toISOString(),
    verificationDigest: typeof row.verification_digest === "string" ? row.verification_digest : "",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  };
}
async function fetchCanonicalUserProgressSources(supabase, userId, authFullName, requestedTimeZone) {
  const [roadmapsRes, kcRes, sessionsRes, assessmentsRes, notifPrefsRes, profileRes] = await Promise.all([
    supabase.from("learning_roadmaps").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("lesson_knowledge_checks").select("*").eq("user_id", userId).order("completed_at", { ascending: false }),
    supabase.from("learning_sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(1e3),
    supabase.from("assessment_attempts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(300),
    supabase.from("notification_preferences").select("timezone").eq("user_id", userId).maybeSingle(),
    supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle()
  ]);
  if (roadmapsRes.error && !isMissingSchemaError(roadmapsRes.error)) {
    throw new AchievementApiError(
      roadmapsRes.error.code === "42501" ? 403 : 500,
      roadmapsRes.error.code || "ROADMAP_LOAD_FAILED",
      "Could not load your learning roadmaps to verify achievements."
    );
  }
  const roadmaps = (roadmapsRes.data ?? []).map(
    (row) => mapRoadmapRow(row)
  );
  const kcByKey = /* @__PURE__ */ new Map();
  if (!kcRes.error && Array.isArray(kcRes.data)) {
    for (const row of kcRes.data) {
      const mapped = mapKnowledgeCheckRow(row, userId);
      const key = mapped.submissionId || mapped.id;
      if (key && !kcByKey.has(key)) kcByKey.set(key, mapped);
    }
  }
  for (const row of roadmapsRes.data ?? []) {
    const rmId = String(row.id ?? "");
    const rmData = row.roadmap_data && typeof row.roadmap_data === "object" ? row.roadmap_data : {};
    const fallbackList = Array.isArray(rmData.knowledgeCheckAttempts) ? rmData.knowledgeCheckAttempts : [];
    for (const rawAttempt of fallbackList) {
      const mapped = mapKnowledgeCheckRow(
        { ...rawAttempt, roadmap_id: rawAttempt.roadmapId ?? rmId },
        userId
      );
      const key = mapped.submissionId || mapped.id;
      if (key && !kcByKey.has(key)) kcByKey.set(key, mapped);
    }
  }
  const learningSessions = !sessionsRes.error && Array.isArray(sessionsRes.data) ? sessionsRes.data.map((row) => mapSessionRow(row)) : [];
  const assessmentAttempts = !assessmentsRes.error && Array.isArray(assessmentsRes.data) ? assessmentsRes.data.map((row) => mapAssessmentRow(row)) : [];
  const dbTimeZone = !notifPrefsRes.error && notifPrefsRes.data && typeof notifPrefsRes.data.timezone === "string" ? notifPrefsRes.data.timezone : void 0;
  const profileRow = !profileRes.error && profileRes.data ? profileRes.data : null;
  const profileName = profileRow && typeof profileRow.full_name === "string" && profileRow.full_name.trim() ? profileRow.full_name.trim() : profileRow && typeof profileRow.name === "string" && profileRow.name.trim() ? profileRow.name.trim() : "";
  const studentName = profileName || authFullName || "Skillora Learner";
  const activeDirection = (profileRow && typeof profileRow.primary_direction === "string" ? profileRow.primary_direction.trim() : "") || (profileRow && typeof profileRow.career_goal === "string" ? profileRow.career_goal.trim() : "");
  const resolvedTimeZone = resolveSafeTimeZone(requestedTimeZone || dbTimeZone);
  return {
    studentName,
    activeDirection,
    roadmaps,
    knowledgeCheckAttempts: Array.from(kcByKey.values()),
    learningSessions,
    assessmentAttempts,
    resolvedTimeZone
  };
}
async function readPersistedAchievementRows(client, userId) {
  const [ledgerRes, badgesRes, certsRes] = await Promise.all([
    client.from("achievement_xp_ledger").select("*").eq("user_id", userId).order("awarded_at", { ascending: false }),
    client.from("user_achievements").select("*").eq("user_id", userId).order("unlocked_at", { ascending: false }),
    client.from("certificates").select("*").eq("user_id", userId).order("issued_at", { ascending: false })
  ]);
  if (isMissingSchemaError(ledgerRes.error) || isMissingSchemaError(badgesRes.error)) {
    return {
      ledger: [],
      badges: [],
      certificates: [],
      schemaMigrationRequired: true,
      certificatesSchemaMigrationRequired: true
    };
  }
  if (ledgerRes.error) {
    throw new AchievementApiError(
      ledgerRes.error.code === "42501" ? 403 : 500,
      ledgerRes.error.code || "ACHIEVEMENT_LEDGER_LOAD_FAILED",
      "Failed to load XP ledger from Supabase."
    );
  }
  if (badgesRes.error) {
    throw new AchievementApiError(
      badgesRes.error.code === "42501" ? 403 : 500,
      badgesRes.error.code || "ACHIEVEMENT_BADGES_LOAD_FAILED",
      "Failed to load achievement badges from Supabase."
    );
  }
  const certificatesSchemaMigrationRequired = isMissingSchemaError(certsRes.error);
  if (certsRes.error && !certificatesSchemaMigrationRequired) {
    throw new AchievementApiError(
      certsRes.error.code === "42501" ? 403 : 500,
      certsRes.error.code || "CERTIFICATES_LOAD_FAILED",
      "Failed to load certificates from Supabase."
    );
  }
  return {
    ledger: (ledgerRes.data ?? []).map((r) => mapXpLedgerRow(r)),
    badges: (badgesRes.data ?? []).map(
      (r) => mapPersistedBadgeRow(r)
    ),
    certificates: certificatesSchemaMigrationRequired ? [] : (certsRes.data ?? []).map((r) => mapCertificateRow(r)),
    schemaMigrationRequired: false,
    certificatesSchemaMigrationRequired
  };
}
async function handleSyncUserAchievements(params) {
  const { userId, authFullName, supabase } = await authenticateBearerRequest2(
    params.authorizationHeader
  );
  const sources = await fetchCanonicalUserProgressSources(
    supabase,
    userId,
    authFullName,
    params.timeZone
  );
  const beforePersisted = await readPersistedAchievementRows(supabase, userId);
  let schemaMigrationRequired = beforePersisted.schemaMigrationRequired;
  let certificatesSchemaMigrationRequired = beforePersisted.certificatesSchemaMigrationRequired;
  let persistedInDatabase = !schemaMigrationRequired;
  let persistedLedger = beforePersisted.ledger;
  let persistedBadges = beforePersisted.badges;
  let persistedCertificates = beforePersisted.certificates;
  if (!schemaMigrationRequired) {
    const serviceClient = createServiceRoleClient2();
    if (serviceClient) {
      const preEval = evaluateVerifiedAchievements({
        userId,
        studentName: sources.studentName,
        activeDirection: sources.activeDirection,
        roadmaps: sources.roadmaps,
        knowledgeCheckAttempts: sources.knowledgeCheckAttempts,
        learningSessions: sources.learningSessions,
        assessmentAttempts: sources.assessmentAttempts,
        persistedLedger: beforePersisted.ledger,
        persistedBadges: beforePersisted.badges,
        persistedCertificates: beforePersisted.certificates,
        timeZone: sources.resolvedTimeZone
      });
      if (preEval.newlyEligibleEvents.length > 0) {
        const ledgerRowsWithDir = preEval.newlyEligibleEvents.map((evt) => ({
          user_id: userId,
          event_key: evt.eventKey,
          event_type: evt.eventType,
          xp_amount: evt.xpAmount,
          title: evt.title,
          direction: evt.direction || "General Learning",
          roadmap_id: evt.roadmapId ?? null,
          stage_id: evt.stageId ?? null,
          lesson_id: evt.lessonId ?? null,
          awarded_at: evt.awardedAt
        }));
        let { error: upsertLedgerErr } = await serviceClient.from("achievement_xp_ledger").upsert(ledgerRowsWithDir, {
          onConflict: "user_id,event_key",
          ignoreDuplicates: true
        });
        if (upsertLedgerErr && isMissingSchemaError(upsertLedgerErr)) {
          certificatesSchemaMigrationRequired = true;
          const legacyRows = preEval.newlyEligibleEvents.map((evt) => ({
            user_id: userId,
            event_key: evt.eventKey,
            event_type: evt.eventType,
            xp_amount: evt.xpAmount,
            title: evt.title,
            roadmap_id: evt.roadmapId ?? null,
            stage_id: evt.stageId ?? null,
            lesson_id: evt.lessonId ?? null,
            awarded_at: evt.awardedAt
          }));
          const retry = await serviceClient.from("achievement_xp_ledger").upsert(legacyRows, {
            onConflict: "user_id,event_key",
            ignoreDuplicates: true
          });
          upsertLedgerErr = retry.error;
        }
        if (upsertLedgerErr) {
          if (isMissingSchemaError(upsertLedgerErr)) {
            schemaMigrationRequired = true;
            persistedInDatabase = false;
          } else {
            throw new AchievementApiError(
              500,
              upsertLedgerErr.code || "ACHIEVEMENT_LEDGER_PERSIST_FAILED",
              "Failed to persist verified XP events."
            );
          }
        }
      }
      if (!schemaMigrationRequired && preEval.newlyUnlockedBadges.length > 0) {
        const badgeRowsToInsert = preEval.newlyUnlockedBadges.map((b) => ({
          user_id: userId,
          badge_id: b.badgeId,
          unlocked_at: b.unlockedAt,
          metadata: b.metadata
        }));
        let { error: upsertBadgeErr } = await serviceClient.from("user_achievements").upsert(badgeRowsToInsert, {
          onConflict: "user_id,badge_id",
          ignoreDuplicates: true
        });
        if (upsertBadgeErr && upsertBadgeErr.code === "23514") {
          certificatesSchemaMigrationRequired = true;
          const legacyBadges = badgeRowsToInsert.filter(
            (b) => PHASE8_BADGE_IDS.has(b.badge_id)
          );
          if (legacyBadges.length > 0) {
            const retry = await serviceClient.from("user_achievements").upsert(legacyBadges, {
              onConflict: "user_id,badge_id",
              ignoreDuplicates: true
            });
            upsertBadgeErr = retry.error;
          } else {
            upsertBadgeErr = null;
          }
        }
        if (upsertBadgeErr) {
          if (isMissingSchemaError(upsertBadgeErr)) {
            schemaMigrationRequired = true;
            persistedInDatabase = false;
          } else {
            throw new AchievementApiError(
              500,
              upsertBadgeErr.code || "ACHIEVEMENT_BADGES_PERSIST_FAILED",
              "Failed to persist unlocked achievement badges."
            );
          }
        }
      }
      if (!schemaMigrationRequired && !certificatesSchemaMigrationRequired && preEval.newlyEligibleCertificates.length > 0) {
        const certRowsToInsert = preEval.newlyEligibleCertificates.map((c) => ({
          user_id: userId,
          certificate_number: c.certificateNumber,
          certificate_key: c.certificateKey,
          certificate_type: c.certificateType,
          title: c.title,
          direction: c.direction,
          student_name: c.studentName,
          roadmap_id: c.roadmapId,
          stage_id: c.stageId,
          template_id: c.templateId,
          public_name_visibility: c.publicNameVisibility,
          issuer_name: c.issuerName,
          issuer_designation: c.issuerDesignation,
          status: c.status,
          completion_date: c.completionDate,
          issued_at: c.issuedAt,
          verification_digest: c.verificationDigest,
          metadata: c.metadata ?? {}
        }));
        const { error: upsertCertErr } = await serviceClient.from("certificates").upsert(certRowsToInsert, {
          onConflict: "user_id,certificate_key",
          ignoreDuplicates: true
        });
        if (upsertCertErr) {
          if (isMissingSchemaError(upsertCertErr)) {
            certificatesSchemaMigrationRequired = true;
          } else {
            throw new AchievementApiError(
              500,
              upsertCertErr.code || "CERTIFICATES_PERSIST_FAILED",
              "Failed to persist issued certificates."
            );
          }
        }
      }
    } else {
      const { error: rpcError } = await supabase.rpc("sync_verified_user_achievements", {
        p_timezone: sources.resolvedTimeZone
      });
      if (rpcError) {
        if (isMissingSchemaError(rpcError)) {
          schemaMigrationRequired = true;
          persistedInDatabase = false;
        } else {
          console.warn(
            "[Skillora][Achievements] sync_verified_user_achievements RPC warning:",
            rpcError.message
          );
          persistedInDatabase = false;
        }
      }
    }
    if (!schemaMigrationRequired && persistedInDatabase) {
      const afterPersisted = await readPersistedAchievementRows(supabase, userId);
      persistedLedger = afterPersisted.ledger;
      persistedBadges = afterPersisted.badges;
      persistedCertificates = afterPersisted.certificates;
      certificatesSchemaMigrationRequired = certificatesSchemaMigrationRequired || afterPersisted.certificatesSchemaMigrationRequired;
    }
  }
  const finalEval = evaluateVerifiedAchievements({
    userId,
    studentName: sources.studentName,
    activeDirection: sources.activeDirection,
    roadmaps: sources.roadmaps,
    knowledgeCheckAttempts: sources.knowledgeCheckAttempts,
    learningSessions: sources.learningSessions,
    assessmentAttempts: sources.assessmentAttempts,
    persistedLedger,
    persistedBadges,
    persistedCertificates,
    timeZone: sources.resolvedTimeZone
  });
  const beforeKeys = new Set(beforePersisted.ledger.map((e) => e.eventKey));
  const beforeBadgeIds = new Set(beforePersisted.badges.map((b) => b.badgeId));
  const beforeCertKeys = new Set(beforePersisted.certificates.map((c) => c.certificateKey));
  const newlyAwardedEvents = persistedInDatabase ? persistedLedger.filter((e) => !beforeKeys.has(e.eventKey)) : [];
  const newlyAwardedXp = newlyAwardedEvents.reduce((sum, e) => sum + e.xpAmount, 0);
  const newlyUnlockedBadgeIds = persistedInDatabase ? persistedBadges.filter((b) => !beforeBadgeIds.has(b.badgeId)).map((b) => b.badgeId) : [];
  const newlyIssuedCertificateIds = persistedInDatabase && !certificatesSchemaMigrationRequired ? persistedCertificates.filter((c) => !beforeCertKeys.has(c.certificateKey)).map((c) => c.id) : [];
  return {
    authenticated: true,
    persistedInDatabase,
    schemaMigrationRequired,
    certificatesSchemaMigrationRequired,
    ...finalEval.summary,
    newlyAwardedXp,
    newlyUnlockedBadgeIds,
    newlyIssuedCertificateIds
  };
}
async function handleVerifyCertificatePublic(rawCertificateNumber) {
  const cleaned = rawCertificateNumber.trim().toUpperCase();
  if (!cleaned) {
    return {
      found: false,
      authentic: false,
      certificateNumber: ""
    };
  }
  const serviceClient = createServiceRoleClient2();
  if (serviceClient) {
    const { data: data2, error: error2 } = await serviceClient.from("certificates").select(
      "certificate_number, certificate_type, title, direction, student_name, public_name_visibility, issuer_name, issuer_designation, status, completion_date, issued_at, verification_digest"
    ).ilike("certificate_number", cleaned).maybeSingle();
    if (error2) {
      if (isMissingSchemaError(error2)) {
        return {
          found: false,
          authentic: false,
          certificateNumber: cleaned
        };
      }
      throw new AchievementApiError(
        500,
        error2.code || "CERTIFICATE_VERIFY_FAILED",
        "Could not verify certificate ID."
      );
    }
    if (!data2) {
      return {
        found: false,
        authentic: false,
        certificateNumber: cleaned
      };
    }
    const row = data2;
    const certType = row.certificate_type === "path_completion" || row.certificate_type === "excellence" ? row.certificate_type : "course_completion";
    const privacyMode = row.public_name_visibility === "initials" ? "initials" : "full_name";
    const status = row.status === "revoked" ? "revoked" : "valid";
    return {
      found: true,
      authentic: status === "valid",
      certificateNumber: String(row.certificate_number ?? cleaned),
      certificateType: certType,
      certificateTypeLabel: formatCertificateTypeLabel(certType),
      title: String(row.title ?? "Skillora Certificate"),
      direction: String(row.direction ?? "General Learning"),
      studentDisplayName: maskStudentNameForPrivacy(
        String(row.student_name ?? "Skillora Learner"),
        privacyMode
      ),
      privacyMode,
      issuedAt: typeof row.issued_at === "string" ? row.issued_at : void 0,
      completionDate: typeof row.completion_date === "string" ? row.completion_date : void 0,
      status,
      issuerName: typeof row.issuer_name === "string" ? row.issuer_name : "Skillora",
      issuerDesignation: typeof row.issuer_designation === "string" ? row.issuer_designation : "Academic & Curriculum Verification Board",
      verificationDigest: typeof row.verification_digest === "string" ? row.verification_digest : void 0
    };
  }
  const anon = createAnonPublicClient();
  const { data, error } = await anon.rpc("verify_certificate_public", {
    p_certificate_number: cleaned
  });
  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        found: false,
        authentic: false,
        certificateNumber: cleaned
      };
    }
    throw new AchievementApiError(
      500,
      error.code || "CERTIFICATE_VERIFY_RPC_FAILED",
      "Could not verify certificate ID."
    );
  }
  if (!data || typeof data !== "object") {
    return {
      found: false,
      authentic: false,
      certificateNumber: cleaned
    };
  }
  return data;
}
async function handleUpdateCertificatePreferences(params) {
  const { userId, supabase } = await authenticateBearerRequest2(params.authorizationHeader);
  const certificateId = params.certificateId.trim();
  if (!certificateId) {
    throw new AchievementApiError(400, "INVALID_CERTIFICATE_ID", "Certificate ID is required.");
  }
  if (params.templateId !== void 0 && params.templateId !== "classic_academic" && params.templateId !== "modern_professional" && params.templateId !== "excellence_award") {
    throw new AchievementApiError(400, "INVALID_TEMPLATE", "Unsupported certificate template.");
  }
  if (params.publicNameVisibility !== void 0 && params.publicNameVisibility !== "full_name" && params.publicNameVisibility !== "initials") {
    throw new AchievementApiError(
      400,
      "INVALID_PRIVACY_MODE",
      "Unsupported privacy visibility setting."
    );
  }
  const serviceClient = createServiceRoleClient2();
  if (serviceClient) {
    const updates = {};
    if (params.templateId) updates.template_id = params.templateId;
    if (params.publicNameVisibility) {
      updates.public_name_visibility = params.publicNameVisibility;
    }
    const { data: data2, error: error2 } = await serviceClient.from("certificates").update(updates).eq("id", certificateId).eq("user_id", userId).select("*").maybeSingle();
    if (error2) {
      if (isMissingSchemaError(error2)) {
        throw new AchievementApiError(
          409,
          "CERTIFICATES_MIGRATION_REQUIRED",
          "Run the Phase 9 certificates migration in Supabase to save display preferences."
        );
      }
      throw new AchievementApiError(
        500,
        error2.code || "CERTIFICATE_PREFS_UPDATE_FAILED",
        "Could not update certificate display preferences."
      );
    }
    if (!data2) {
      throw new AchievementApiError(
        404,
        "CERTIFICATE_NOT_FOUND",
        "Certificate not found or you do not have permission to update it."
      );
    }
    return mapCertificateRow(data2);
  }
  const { data, error } = await supabase.rpc("update_certificate_display_preferences", {
    p_certificate_id: certificateId,
    p_template_id: params.templateId ?? null,
    p_public_name_visibility: params.publicNameVisibility ?? null
  });
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new AchievementApiError(
        409,
        "CERTIFICATES_MIGRATION_REQUIRED",
        "Run the Phase 9 certificates migration in Supabase to save display preferences."
      );
    }
    throw new AchievementApiError(
      400,
      error.code || "CERTIFICATE_PREFS_UPDATE_FAILED",
      error.message || "Could not update certificate display preferences."
    );
  }
  return mapCertificateRow(data);
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function startServer() {
  const app = express();
  const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3e3;
  const isProduction = process.env.NODE_ENV === "production" || path.basename(__filename) === "server.js";
  if (isProduction && !process.env.NODE_ENV) {
    process.env.NODE_ENV = "production";
  }
  app.use(express.json());
  app.get("/api/config/supabase", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
    });
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      supabaseConfigured: Boolean(
        process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
      )
    });
  });
  app.post("/api/roadmaps/generate", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const replaceActive = body.replaceActive === true;
      const result = await handleGenerateRoadmapRequest({
        authorizationHeader: req.headers.authorization,
        replaceActive
      });
      res.status(result.statusCode).json({ roadmap: result.record });
    } catch (err) {
      if (err instanceof RoadmapApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message
        });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/roadmaps/generate:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while generating your learning roadmap."
      });
    }
  });
  app.post("/api/lessons/generate", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const lessonContent = await handleGenerateLessonContentRequest({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === "string" ? body.roadmapId.trim() : "",
        stageId: typeof body.stageId === "string" ? body.stageId.trim() : "",
        lessonId: typeof body.lessonId === "string" ? body.lessonId.trim() : "",
        forceRegenerate: body.forceRegenerate === true
      });
      res.status(200).json({ lessonContent });
    } catch (err) {
      if (err instanceof LessonApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message
        });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/lessons/generate:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while generating lesson content."
      });
    }
  });
  app.post("/api/courses/resources", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const resources = await handleGetCourseResourcesRequest({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === "string" ? body.roadmapId.trim() : "",
        stageId: typeof body.stageId === "string" ? body.stageId.trim() : ""
      });
      res.status(200).json({ resources });
    } catch (err) {
      if (err instanceof LessonApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message
        });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/courses/resources:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while loading course resources."
      });
    }
  });
  app.post("/api/lessons/clarify", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const clarification = await handleClarifyLessonRequest({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === "string" ? body.roadmapId.trim() : "",
        stageId: typeof body.stageId === "string" ? body.stageId.trim() : "",
        lessonId: typeof body.lessonId === "string" ? body.lessonId.trim() : "",
        question: typeof body.question === "string" ? body.question : "",
        currentSection: typeof body.currentSection === "string" ? body.currentSection : void 0,
        history: Array.isArray(body.history) ? body.history : void 0
      });
      res.status(200).json({ clarification });
    } catch (err) {
      if (err instanceof LessonApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message
        });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/lessons/clarify:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while answering your question."
      });
    }
  });
  app.post("/api/knowledge-checks/start", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const quiz = await handleStartKnowledgeCheck({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === "string" ? body.roadmapId.trim() : "",
        stageId: typeof body.stageId === "string" ? body.stageId.trim() : "",
        lessonId: typeof body.lessonId === "string" ? body.lessonId.trim() : "",
        questionCount: typeof body.questionCount === "number" ? body.questionCount : void 0
      });
      res.status(200).json({ quiz });
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/knowledge-checks/start:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while preparing your Knowledge Check."
      });
    }
  });
  app.post("/api/knowledge-checks/check-answer", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const feedback = await handleCheckSingleAnswer({
        authorizationHeader: req.headers.authorization,
        quizToken: typeof body.quizToken === "string" ? body.quizToken : "",
        questionId: typeof body.questionId === "string" ? body.questionId : "",
        selectedOptionIndex: Number(body.selectedOptionIndex)
      });
      res.status(200).json({ feedback });
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/knowledge-checks/check-answer:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while checking your answer."
      });
    }
  });
  app.post("/api/knowledge-checks/submit", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const rawAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
      const result = await handleSubmitKnowledgeCheck({
        authorizationHeader: req.headers.authorization,
        quizToken: typeof body.quizToken === "string" ? body.quizToken : "",
        answers: rawAnswers
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/knowledge-checks/submit:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while submitting your Knowledge Check."
      });
    }
  });
  app.get("/api/knowledge-checks/history", async (req, res) => {
    try {
      const history = await handleGetKnowledgeCheckHistory({
        authorizationHeader: req.headers.authorization
      });
      res.status(200).json(history);
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in GET /api/knowledge-checks/history:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while loading your Knowledge Check history."
      });
    }
  });
  app.get("/api/resources/explore", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const bypassCache = req.query.refresh === "1";
      const payload = await handleGetExploreResourcesRequest({
        authorizationHeader: req.headers.authorization,
        bypassCache
      });
      res.status(200).json(payload);
    } catch (err) {
      if (err instanceof ExploreResourcesApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in GET /api/resources/explore:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while loading Explore Resources."
      });
    }
  });
  app.get("/api/assistant/conversations", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId.trim() : void 0;
      const result = await handleListAssistantConversations({
        authorizationHeader: req.headers.authorization,
        conversationId
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in GET /api/assistant/conversations");
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while loading conversations."
      });
    }
  });
  app.post("/api/assistant/conversations", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await handleCreateAssistantConversation({
        authorizationHeader: req.headers.authorization,
        title: typeof body.title === "string" ? body.title : void 0,
        lessonContext: body.lessonContext && typeof body.lessonContext === "object" ? body.lessonContext : void 0
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/assistant/conversations");
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while creating a conversation."
      });
    }
  });
  app.delete("/api/assistant/conversations/:id", async (req, res) => {
    try {
      const result = await handleDeleteAssistantConversation({
        authorizationHeader: req.headers.authorization,
        conversationId: req.params.id
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in DELETE /api/assistant/conversations/:id");
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while deleting the conversation."
      });
    }
  });
  app.post("/api/assistant/chat", async (req, res) => {
    const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
    res.setHeader("X-Request-Id", requestId);
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await handleAssistantChatRequest({
        authorizationHeader: req.headers.authorization,
        conversationId: typeof body.conversationId === "string" ? body.conversationId.trim() : void 0,
        message: typeof body.message === "string" ? body.message : "",
        history: Array.isArray(body.history) ? body.history : void 0,
        lessonContext: body.lessonContext && typeof body.lessonContext === "object" ? body.lessonContext : void 0,
        clientTurnId: typeof body.clientTurnId === "string" ? body.clientTurnId.trim() : void 0,
        requestId
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ requestId, code: err.code, error: err.message });
        return;
      }
      console.error(`[Skillora][${requestId}] Unexpected error in POST /api/assistant/chat`);
      res.status(500).json({
        requestId,
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while reaching the AI Study Companion."
      });
    }
  });
  app.post("/api/assistant/chat/stream", async (req, res) => {
    const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
    res.setHeader("X-Request-Id", requestId);
    const abortController = new AbortController();
    let sseStarted = false;
    let clientClosed = false;
    let keepaliveTimer;
    const clearKeepalive = () => {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = void 0;
      }
    };
    const handleClose = () => {
      if (res.writableFinished) return;
      clientClosed = true;
      clearKeepalive();
      abortController.abort();
    };
    res.on("close", handleClose);
    const writeSse = (event, data) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
    };
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await handleAssistantChatStreamRequest({
        authorizationHeader: req.headers.authorization,
        conversationId: typeof body.conversationId === "string" ? body.conversationId.trim() : void 0,
        message: typeof body.message === "string" ? body.message : "",
        history: Array.isArray(body.history) ? body.history : void 0,
        lessonContext: body.lessonContext && typeof body.lessonContext === "object" ? body.lessonContext : void 0,
        clientTurnId: typeof body.clientTurnId === "string" ? body.clientTurnId.trim() : void 0,
        requestId,
        signal: abortController.signal,
        onStart: ({ requestId: startedReqId, conversationId: convId }) => {
          if (clientClosed || res.headersSent) return;
          sseStarted = true;
          res.status(200);
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.flushHeaders?.();
          writeSse("start", { requestId: startedReqId, conversationId: convId });
          clearKeepalive();
          keepaliveTimer = setInterval(() => {
            if (!clientClosed && !res.writableEnded) {
              res.write(": keepalive\n\n");
            }
          }, 8e3);
        },
        onDelta: (deltaText) => {
          if (deltaText) {
            writeSse("delta", { text: deltaText });
          }
        }
      });
      clearKeepalive();
      if (!sseStarted && !res.headersSent) {
        res.status(200).json(result);
        return;
      }
      writeSse("done", result);
      if (!res.writableEnded) res.end();
    } catch (err) {
      clearKeepalive();
      if (clientClosed) {
        if (!res.writableEnded) res.end();
        return;
      }
      const status = err instanceof AssistantApiError ? err.status : 500;
      const code = err instanceof AssistantApiError ? err.code : "INTERNAL_SERVER_ERROR";
      const message = err instanceof AssistantApiError ? err.message : "An unexpected error occurred while reaching the AI Study Companion.";
      if (sseStarted || res.headersSent) {
        writeSse("error", { requestId, status, code, error: message });
        if (!res.writableEnded) res.end();
      } else {
        res.status(status).json({ requestId, code, error: message });
      }
    } finally {
      clearKeepalive();
      res.off("close", handleClose);
    }
  });
  app.get("/api/notifications/config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getPushPublicConfig());
  });
  app.get("/api/notifications/preferences", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const result = await handleGetNotificationPreferences({
        authorizationHeader: req.headers.authorization
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in GET /api/notifications/preferences:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while loading notification preferences."
      });
    }
  });
  app.put("/api/notifications/preferences", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await handleUpdateNotificationPreferences({
        authorizationHeader: req.headers.authorization,
        updates: body
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in PUT /api/notifications/preferences:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while saving notification preferences."
      });
    }
  });
  app.post("/api/notifications/subscriptions", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await handleRegisterPushSubscription({
        authorizationHeader: req.headers.authorization,
        endpoint: typeof body.endpoint === "string" ? body.endpoint : "",
        p256dh: typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "",
        auth: typeof body.keys?.auth === "string" ? body.keys.auth : "",
        userAgent: typeof body.userAgent === "string" ? body.userAgent : void 0
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/notifications/subscriptions:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while registering your push subscription."
      });
    }
  });
  app.delete("/api/notifications/subscriptions", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await handleRemovePushSubscription({
        authorizationHeader: req.headers.authorization,
        endpoint: typeof body.endpoint === "string" ? body.endpoint : void 0
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in DELETE /api/notifications/subscriptions:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while disabling push notifications."
      });
    }
  });
  app.post("/api/notifications/test-push", async (req, res) => {
    try {
      const result = await handleSendTestPush({
        authorizationHeader: req.headers.authorization
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/notifications/test-push:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while sending your test push notification."
      });
    }
  });
  app.post("/api/notifications/dispatch-scheduled", async (req, res) => {
    if (!verifyCronAuthorization(req.headers)) {
      res.status(401).json({
        code: "UNAUTHORIZED_CRON",
        error: "Valid CRON_SECRET authorization is required."
      });
      return;
    }
    try {
      const summary = await dispatchScheduledInactivityNotifications();
      res.status(200).json(summary);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/notifications/dispatch-scheduled:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred during scheduled notification dispatch."
      });
    }
  });
  app.get("/api/achievements", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const timeZone = typeof req.query.timeZone === "string" ? req.query.timeZone.trim() : void 0;
      const summary = await handleSyncUserAchievements({
        authorizationHeader: req.headers.authorization,
        timeZone
      });
      res.status(200).json(summary);
    } catch (err) {
      if (err instanceof AchievementApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in GET /api/achievements:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while loading your achievements and XP."
      });
    }
  });
  app.post("/api/achievements/sync", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const timeZone = typeof body.timeZone === "string" ? body.timeZone.trim() : void 0;
      const summary = await handleSyncUserAchievements({
        authorizationHeader: req.headers.authorization,
        timeZone
      });
      res.status(200).json(summary);
    } catch (err) {
      if (err instanceof AchievementApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error("[Skillora] Unexpected error in POST /api/achievements/sync:", err);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while syncing your achievements and XP."
      });
    }
  });
  app.get("/api/certificates/verify/:certificateNumber", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const result = await handleVerifyCertificatePublic(req.params.certificateNumber || "");
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AchievementApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error(
        "[Skillora] Unexpected error in GET /api/certificates/verify/:certificateNumber:",
        err
      );
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while verifying that certificate ID."
      });
    }
  });
  app.patch("/api/certificates/:id/preferences", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const certificate = await handleUpdateCertificatePreferences({
        authorizationHeader: req.headers.authorization,
        certificateId: req.params.id || "",
        templateId: body.templateId === "classic_academic" || body.templateId === "modern_professional" || body.templateId === "excellence_award" ? body.templateId : void 0,
        publicNameVisibility: body.publicNameVisibility === "full_name" || body.publicNameVisibility === "initials" ? body.publicNameVisibility : void 0
      });
      res.status(200).json({ certificate });
    } catch (err) {
      if (err instanceof AchievementApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error(
        "[Skillora] Unexpected error in PATCH /api/certificates/:id/preferences:",
        err
      );
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        error: "An unexpected error occurred while saving certificate preferences."
      });
    }
  });
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    const indexHtmlPath = path.join(distPath, "index.html");
    if (!fs.existsSync(indexHtmlPath)) {
      console.warn(
        `[Skillora] Warning: production build not found at ${indexHtmlPath}. Run "npm run build" before starting in production.`
      );
    }
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Skillora server running on http://0.0.0.0:${PORT}`);
    warmCatalogYouTubeVerification();
    startNotificationScheduler();
  });
  server.on("error", (err) => {
    console.error("Skillora server failed to listen:", err);
    process.exit(1);
  });
  const shutdown = (signal) => {
    console.log(`Received ${signal}, shutting down Skillora server...`);
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
startServer().catch((err) => {
  console.error("Failed to start Skillora server:", err);
  process.exit(1);
});
