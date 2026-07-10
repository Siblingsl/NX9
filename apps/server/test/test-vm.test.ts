import { describe, it, expect } from 'vitest';

describe('TEST-VM — View Mode (pure function tests)', () => {

  it('TEST-VM-001: 三模式切换 - view mode values are valid', () => {
    const VALID_MODES = ['explore', 'produce', 'review'] as const;
    type ViewMode = (typeof VALID_MODES)[number];

    const isValidMode = (v: string): v is ViewMode =>
      (VALID_MODES as readonly string[]).includes(v);

    expect(isValidMode('explore')).toBe(true);
    expect(isValidMode('produce')).toBe(true);
    expect(isValidMode('review')).toBe(true);
    expect(isValidMode('edit')).toBe(false);
    expect(isValidMode('')).toBe(false);

    const modes: ViewMode[] = ['explore', 'produce', 'review'];
    expect(modes).toHaveLength(3);
  });
});
