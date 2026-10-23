const DEFAULT_BASE_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 5 * 60_000;

export function getFailureBackoffMs(
  failureCount: number,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
): number {
  const safeCount = Math.max(1, Math.floor(failureCount));
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (safeCount - 1));
}

export function shouldReportFailure(
  lastReportedAt: number,
  now = Date.now(),
  minimumIntervalMs = 60_000,
): boolean {
  return lastReportedAt === 0 || now - lastReportedAt >= minimumIntervalMs;
}

export function summarizeDatabaseError(error: unknown): string {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let message = "Unknown database error";
  let code = "";

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { message?: unknown; code?: unknown; cause?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim()) {
      message = candidate.message.split("\n", 1)[0];
    }
    if (typeof candidate.code === "string" && candidate.code.trim()) {
      code = candidate.code;
    }
    current = candidate.cause;
  }

  return code ? `${code}: ${message}` : message;
}
