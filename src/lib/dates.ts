/**
 * Format an ISO timestamp to a short time string for block headings.
 * e.g. "02:41" or "14:30"
 */
export function formatBlockTime(iso: string, timezone?: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
}

/**
 * Format an ISO timestamp to a readable date-time string.
 * e.g. "Aug 21, 2025 · 02:41"
 */
export function formatDateTime(iso: string, timezone?: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  });
  const timePart = formatBlockTime(iso, timezone);
  return `${datePart} · ${timePart}`;
}

/**
 * Format a relative time string.
 * e.g. "just now", "2m ago", "1h ago"
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Get current ISO timestamp.
 */
export function now(): string {
  return new Date().toISOString();
}
