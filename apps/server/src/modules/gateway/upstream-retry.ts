export function isRetryableUpstreamStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function retryAfterMs(headers: Headers, attempt: number, maxMs = 30_000): number {
  const value = headers.get('retry-after');
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.min(maxMs, Math.max(0, seconds * 1000));
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(maxMs, Math.max(0, date - Date.now()));
  }
  return Math.min(maxMs, 500 * 2 ** attempt);
}
