/** Mark node as pending when async run starts */
export function withPendingTake(data: Record<string, unknown>): Record<string, unknown> {
  if (data.status === 'running') {
    return {
      ...data,
      pendingSince: data.pendingSince ?? Date.now(),
    };
  }
  if (data.status === 'done' || data.status === 'success' || data.status === 'error') {
    const next = { ...data };
    delete next.pendingSince;
    return next;
  }
  return data;
}

export function formatPendingElapsed(pendingSince: number): string {
  const sec = Math.floor((Date.now() - pendingSince) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
