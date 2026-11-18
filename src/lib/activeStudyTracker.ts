export const DEFAULT_STUDY_IDLE_TIMEOUT_MS = 60_000;
export const DEFAULT_MEDIA_IDLE_TIMEOUT_MS = 180_000;

export interface StudyTickContext {
  isVisible: boolean;
  lastInteractionAt: number;
  nowMs: number;
  idleTimeoutMs?: number;
  mediaPlaying?: boolean;
  mediaIdleTimeoutMs?: number;
}

/**
 * Determines whether the current 1-second study timer tick represents active learning
 * rather than idle browser time. Returns false whenever the tab is hidden or the
 * student has not interacted within the active threshold.
 */
export function shouldCountStudyTick(ctx: StudyTickContext): boolean {
  if (!ctx.isVisible) return false;
  if (!Number.isFinite(ctx.lastInteractionAt) || !Number.isFinite(ctx.nowMs)) {
    return false;
  }
  const elapsedSinceInteraction = Math.max(0, ctx.nowMs - ctx.lastInteractionAt);
  const threshold = ctx.mediaPlaying
    ? (ctx.mediaIdleTimeoutMs ?? DEFAULT_MEDIA_IDLE_TIMEOUT_MS)
    : (ctx.idleTimeoutMs ?? DEFAULT_STUDY_IDLE_TIMEOUT_MS);

  return elapsedSinceInteraction <= threshold;
}

export interface BrowserActiveTimerOptions {
  idleTimeoutMs?: number;
  mediaIdleTimeoutMs?: number;
  isMediaPlaying?: () => boolean;
  isActivePhase?: () => boolean;
  onSecondTick?: (activeSeconds: number) => void;
}

export interface BrowserActiveTimerController {
  getActiveSeconds: () => number;
  reset: () => void;
  markInteraction: () => void;
  destroy: () => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
  'focus',
];

/**
 * Attaches lightweight browser interaction + visibility listeners and counts only
 * genuine active study seconds (excluding hidden tabs and idle periods).
 */
export function createBrowserActiveStudyTimer(
  options: BrowserActiveTimerOptions = {}
): BrowserActiveTimerController {
  let activeSeconds = 0;
  let lastInteractionAt = Date.now();
  let destroyed = false;

  const markInteraction = () => {
    if (destroyed) return;
    lastInteractionAt = Date.now();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      lastInteractionAt = Date.now();
    }
  };

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, markInteraction, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);
  }

  const intervalId =
    typeof window !== 'undefined'
      ? window.setInterval(() => {
          if (destroyed) return;
          if (options.isActivePhase && !options.isActivePhase()) return;

          const isVisible =
            typeof document === 'undefined' || document.visibilityState === 'visible';
          const mediaPlaying = options.isMediaPlaying ? options.isMediaPlaying() : false;

          if (
            shouldCountStudyTick({
              isVisible,
              lastInteractionAt,
              nowMs: Date.now(),
              idleTimeoutMs: options.idleTimeoutMs,
              mediaPlaying,
              mediaIdleTimeoutMs: options.mediaIdleTimeoutMs,
            })
          ) {
            activeSeconds += 1;
            options.onSecondTick?.(activeSeconds);
          }
        }, 1000)
      : null;

  return {
    getActiveSeconds: () => activeSeconds,
    reset: () => {
      activeSeconds = 0;
      lastInteractionAt = Date.now();
    },
    markInteraction,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (intervalId !== null && typeof window !== 'undefined') {
        window.clearInterval(intervalId);
      }
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        for (const evt of ACTIVITY_EVENTS) {
          window.removeEventListener(evt, markInteraction);
        }
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    },
  };
}
