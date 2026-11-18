export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  url: string;
  embedUrl: string;
  thumbnailUrl: string;
  embedAllowed: boolean;
  /** Only populated when verified via YouTube Data API contentDetails.duration */
  duration?: string;
  verifiedSource: 'youtube-data-api' | 'curated-oembed-verified';
}

export interface YouTubeSearchResponse {
  configured: boolean;
  videos: YouTubeVideoMetadata[];
}

export interface YouTubeOEmbedVerification {
  valid: boolean;
  videoId: string;
  title?: string;
  channelTitle?: string;
  embedAllowed: boolean;
  thumbnailUrl?: string;
  unverifiedNetworkError?: boolean;
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const OEMBED_TIMEOUT_MS = 4_500;

const searchCache = new Map<string, { expiresAt: number; videos: YouTubeVideoMetadata[] }>();
const oembedCache = new Map<string, { expiresAt: number; result: YouTubeOEmbedVerification }>();

/**
 * Formats ISO 8601 YouTube durations (e.g. "PT13M42S", "PT1H20M") into concise readable strings.
 */
export function formatIso8601Duration(isoDuration: unknown): string | undefined {
  if (typeof isoDuration !== 'string' || !isoDuration.startsWith('PT')) {
    return undefined;
  }
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;

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
  return undefined;
}

export function isYouTubeDataApiConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

/**
 * Verifies a single YouTube video ID via official YouTube oEmbed endpoint:
 * - Confirms video exists & is publicly accessible
 * - Confirms embeddable HTML iframe support
 * - Returns authoritative YouTube title and author_name
 */
export async function verifyYouTubeVideoOEmbed(
  videoId: string
): Promise<YouTubeOEmbedVerification> {
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
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });
    if (!res.ok) {
      const negative: YouTubeOEmbedVerification = {
        valid: false,
        videoId: cleanId,
        embedAllowed: false,
      };
      oembedCache.set(cleanId, {
        expiresAt: Date.now() + 1000 * 60 * 15,
        result: negative,
      });
      return negative;
    }

    const payload = (await res.json()) as {
      title?: string;
      author_name?: string;
      html?: string;
      thumbnail_url?: string;
    };

    const result: YouTubeOEmbedVerification = {
      valid: Boolean(payload.title && payload.author_name),
      videoId: cleanId,
      title: payload.title?.trim(),
      channelTitle: payload.author_name?.trim(),
      embedAllowed: Boolean(payload.html && payload.html.includes('<iframe')),
      thumbnailUrl: payload.thumbnail_url,
    };

    oembedCache.set(cleanId, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      result,
    });
    return result;
  } catch {
    return {
      valid: false,
      videoId: cleanId,
      embedAllowed: false,
      unverifiedNetworkError: true,
    };
  }
}

/**
 * Server-side adapter for YouTube Data API v3.
 * Never exposes YOUTUBE_API_KEY to the browser.
 * Returns { configured: false, videos: [] } cleanly when YOUTUBE_API_KEY is not set
 * so callers can fall back to the oEmbed-verified curated video registry.
 */
export async function searchAndVerifyYouTubeVideos(params: {
  query: string;
  maxResults?: number;
  relevanceLanguage?: string;
}): Promise<YouTubeSearchResponse> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, videos: [] };
  }

  const maxResults = Math.min(Math.max(params.maxResults ?? 8, 1), 12);
  const query = params.query.trim();
  if (!query) {
    return { configured: true, videos: [] };
  }

  const cacheKey = `${query.toLowerCase()}::${maxResults}::${params.relevanceLanguage ?? 'en'}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { configured: true, videos: cached.videos };
  }

  try {
    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('safeSearch', 'strict');
    searchUrl.searchParams.set('maxResults', String(maxResults));
    searchUrl.searchParams.set('q', query);
    if (params.relevanceLanguage) {
      searchUrl.searchParams.set('relevanceLanguage', params.relevanceLanguage);
    }
    searchUrl.searchParams.set('key', apiKey);

    const searchRes = await fetch(searchUrl.toString(), {
      signal: AbortSignal.timeout(6_000),
    });
    if (!searchRes.ok) {
      return { configured: true, videos: [] };
    }

    const searchJson = (await searchRes.json()) as {
      items?: Array<{ id?: { videoId?: string } }>;
    };
    const videoIds = (searchJson.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (videoIds.length === 0) {
      return { configured: true, videos: [] };
    }

    // Fetch authoritative snippet, contentDetails.duration, and status.embeddable
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set('part', 'snippet,contentDetails,status');
    videosUrl.searchParams.set('id', videoIds.join(','));
    videosUrl.searchParams.set('key', apiKey);

    const videosRes = await fetch(videosUrl.toString(), {
      signal: AbortSignal.timeout(6_000),
    });
    if (!videosRes.ok) {
      return { configured: true, videos: [] };
    }

    const videosJson = (await videosRes.json()) as {
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          channelTitle?: string;
          description?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
        contentDetails?: {
          duration?: string;
        };
        status?: {
          embeddable?: boolean;
          privacyStatus?: string;
        };
      }>;
    };

    const publicItems = (videosJson.items ?? []).filter((item) => {
      const videoId = item.id?.trim();
      const title = item.snippet?.title?.trim();
      const channelTitle = item.snippet?.channelTitle?.trim();
      if (!videoId || !title || !channelTitle) return false;
      if (item.status?.privacyStatus && item.status.privacyStatus !== 'public') return false;
      return true;
    });

    const verifiedList = await Promise.all(
      publicItems.map(async (item): Promise<YouTubeVideoMetadata | null> => {
        const videoId = item.id!.trim();
        const title = item.snippet!.title!.trim();
        const channelTitle = item.snippet!.channelTitle!.trim();
        const embedAllowedByApi = item.status?.embeddable !== false;

        // Cross-verify public accessibility & embeddability via oEmbed
        const oembed = await verifyYouTubeVideoOEmbed(videoId);
        if (!oembed.unverifiedNetworkError && !oembed.valid) {
          return null;
        }

        const embedAllowed =
          embedAllowedByApi &&
          (oembed.unverifiedNetworkError ? true : oembed.embedAllowed);

        const thumbnailUrl =
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          oembed.thumbnailUrl ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        return {
          videoId,
          title: oembed.title || title,
          channelTitle: oembed.channelTitle || channelTitle,
          description: (item.snippet?.description ?? '').slice(0, 260).trim(),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
          thumbnailUrl,
          embedAllowed,
          duration: formatIso8601Duration(item.contentDetails?.duration),
          verifiedSource: 'youtube-data-api',
        };
      })
    );

    const verified = verifiedList
      .filter((v): v is YouTubeVideoMetadata => Boolean(v))
      .slice(0, maxResults);

    searchCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      videos: verified,
    });

    return { configured: true, videos: verified };
  } catch {
    return { configured: true, videos: [] };
  }
}
