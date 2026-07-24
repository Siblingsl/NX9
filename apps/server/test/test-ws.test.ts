import { describe, it, expect } from 'vitest';
import { FIXTURE_WS, FIXTURE_WS_IMPORT, FIXTURE_SHOTS } from './fixtures';

describe('TEST-WS — Workspace fixtures & contracts', () => {

  it('TEST-WS-001: FIXTURE_WS has valid creation fields', () => {
    expect(FIXTURE_WS.title).toBeTruthy();
    expect(FIXTURE_WS.ownerId).toBeTruthy();
    expect(FIXTURE_WS.ownerId).toContain('fixture');
  });

  it('TEST-WS-002: FIXTURE_WS_IMPORT is valid v3 workspace with correct data', () => {
    expect(FIXTURE_WS_IMPORT.version).toBe(3);
    expect(FIXTURE_WS_IMPORT.blocks).toHaveLength(6);
    expect(FIXTURE_WS_IMPORT.links).toHaveLength(2);

    const blockTypes = FIXTURE_WS_IMPORT.blocks.map((b: any) => b.type);
    expect(blockTypes).toContain('picture-gen');
    expect(blockTypes).toContain('clip-gen');
    expect(blockTypes).toContain('sound-gen');
    // shot-script migrates to storyboard-desk
    expect(blockTypes.some((t: string) => t === 'shot-script' || t === 'storyboard-desk')).toBe(true);
    expect(blockTypes).toContain('director-desk');

    expect(FIXTURE_WS_IMPORT.storyboard).toBeDefined();
    expect(FIXTURE_WS_IMPORT.voice.profiles).toHaveLength(1);
    expect(FIXTURE_WS_IMPORT.canvasAppearance.theme).toBe('dark');
  });

  it('TEST-WS-003: FIXTURE_SHOTS has 3 shots with correct indices & statuses', () => {
    expect(FIXTURE_SHOTS).toHaveLength(3);
    expect(FIXTURE_SHOTS[0].index).toBe(1);
    expect(FIXTURE_SHOTS[1].index).toBe(2);
    expect(FIXTURE_SHOTS[2].index).toBe(3);
    expect(FIXTURE_SHOTS[0].status).toBe('draft');
    expect(FIXTURE_SHOTS[1].status).toBe('review');
    expect(FIXTURE_SHOTS[2].status).toBe('approved');
    expect(FIXTURE_SHOTS[2].linkedBlockId).toBe('blk-pic-001');
  });

  it('TEST-WS-004: Workspace export schema shape', () => {
    const exportPayload = { schema: 'nx9-workspace-export', version: 2, exportedAt: Date.now(), workspace: FIXTURE_WS_IMPORT };
    expect(exportPayload.schema).toBe('nx9-workspace-export');
    expect(exportPayload.workspace.blocks).toBeDefined();
    expect(exportPayload.workspace.storyboard).toBeDefined();
  });
});
