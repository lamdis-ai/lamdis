// Shared formatting utilities

/**
 * Format a duration given in milliseconds into a compact human string.
 * - < 1s: "Xms"
 * - 1s..59.999s: "Xs Yms"
 * - >= 60s: "Xm Ys" (seconds omitted when 0)
 */
export function formatDuration(ms?: number | null): string {
  if (ms == null || !isFinite(ms as number)) return '—';
  const v = Math.max(0, Math.round(Number(ms)));
  if (v < 1000) return `${v}ms`;
  const totalSec = Math.floor(v / 1000);
  const remMs = v % 1000;
  if (totalSec < 60) return `${totalSec}s ${remMs}ms`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec ? `${min}m ${sec}s` : `${min}m`;
}

/**
 * Format a start/end pair into a duration using formatDuration.
 */
export function formatDurationBetween(start?: string | Date | null, end?: string | Date | null): string {
  const a = start ? new Date(start).getTime() : 0;
  const b = end ? new Date(end).getTime() : 0;
  if (!a || !b || b < a) return '—';
  return formatDuration(b - a);
}
