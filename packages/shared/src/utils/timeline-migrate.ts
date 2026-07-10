import type { TimelinePayload } from '../types/timeline';

export function migrateTimelinePayload(p: TimelinePayload): TimelinePayload {
  if (p.version >= 2) return p;
  return {
    ...p,
    version: 2,
    aspect: '9:16',
    width: 1080,
    height: 1920,
  };
}
