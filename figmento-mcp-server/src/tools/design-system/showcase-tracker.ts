/**
 * DQ-HF-1 — in-memory tracker for the most recently created DS showcase.
 *
 * Used by canvas.ts create_frame to detect the "sibling of recent showcase"
 * mistake — when the agent creates a supplementary frame at the canvas root
 * right after a showcase, it almost always meant to nest. Warning only;
 * never blocks.
 */

export interface RecentShowcase {
  rootFrameId: string;
  width: number;
  timestamp: number;
}

const WINDOW_MS = 60_000;

let lastShowcase: RecentShowcase | null = null;

export function recordShowcase(rootFrameId: string, width: number): void {
  if (!rootFrameId || !Number.isFinite(width)) return;
  lastShowcase = { rootFrameId, width, timestamp: Date.now() };
}

export function getRecentShowcase(): RecentShowcase | null {
  if (!lastShowcase) return null;
  if (Date.now() - lastShowcase.timestamp > WINDOW_MS) {
    lastShowcase = null;
    return null;
  }
  return lastShowcase;
}

export function clearShowcaseTracker(): void {
  lastShowcase = null;
}

/**
 * Given the params passed to create_frame, return a warning string if the
 * caller is likely creating a sibling of the recent showcase by mistake.
 * Returns null when no warning applies.
 */
export function buildSiblingWarning(params: { parentId?: string; width?: number }): string | null {
  const recent = getRecentShowcase();
  if (!recent) return null;
  if (params.parentId) return null;
  if (!Number.isFinite(params.width)) return null;
  const paramW = params.width as number;
  if (paramW !== recent.width) return null;
  return (
    `Creating a frame with the same width (${paramW}) as the recent showcase at canvas root. ` +
    `Did you mean to nest inside the showcase frame (${recent.rootFrameId})? ` +
    `Pass parentId: "${recent.rootFrameId}" to nest. ` +
    `If a sibling is intentional, ignore this warning.`
  );
}
