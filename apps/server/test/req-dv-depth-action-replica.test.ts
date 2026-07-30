/**
 * REQ-DV：深度视频动作复刻 / 参考板 Playbook 验收
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assembleReferencePrompt,
  buildReferencePack,
  createSlotsFromPlaybook,
  lookupReferencePlaybook,
  switchPlaybook,
  validateReferenceSlots,
  BUILTIN_GEN_SKILL_IDS,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');

describe('REQ-DV depth-action-replica', () => {
  it('Skill 项目齐全且含 prompt-pack', () => {
    const dir = resolve(root, 'skills/gen-depth-action-replica');
    expect(existsSync(resolve(dir, 'metadata.json'))).toBe(true);
    expect(existsSync(resolve(dir, 'SKILL.md'))).toBe(true);
    expect(existsSync(resolve(dir, 'templates/prompt-pack.md'))).toBe(true);
    const pack = readFileSync(resolve(dir, 'templates/prompt-pack.md'), 'utf8');
    expect(pack).toMatch(/## template/);
    expect(pack).toMatch(/## constraints/);
  });

  it('BUILTIN_GEN_SKILL_IDS 含 gen-depth-action-replica', () => {
    expect([...BUILTIN_GEN_SKILL_IDS]).toContain('gen-depth-action-replica');
  });

  it('Playbook registry 含主玩法与 stub', () => {
    expect(lookupReferencePlaybook('depth-action-replica')?.skillId).toBe(
      'gen-depth-action-replica',
    );
    expect(lookupReferencePlaybook('first-last-frame')?.stub).toBe(true);
  });

  it('转换中阻断就绪', () => {
    const pb = lookupReferencePlaybook('depth-action-replica')!;
    const slots = createSlotsFromPlaybook(pb);
    const depth = slots.find((s) => s.role === 'depth_motion')!;
    depth.convertStatus = 'converting';
    depth.sourceVideoUrl = '/media/x.mp4';
    slots.find((s) => s.role === 'character')!.assetUrl = '/media/c.png';
    const r = validateReferenceSlots(slots, true);
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/转换中/);
  });

  it('装配含深度锁与人物锁', () => {
    const board = switchPlaybook('depth-action-replica');
    board.slots.find((s) => s.role === 'depth_motion')!.assetUrl = '/media/depth.mp4';
    board.slots.find((s) => s.role === 'depth_motion')!.convertStatus = 'ready';
    const chars = board.slots.filter((s) => s.role === 'character');
    chars[0]!.assetUrl = '/media/a.png';
    chars[1]!.assetUrl = '/media/b.png';
    board.slots.find((s) => s.role === 'scene')!.assetUrl = '/media/scene.png';
    board.userPromptExtras = '韩式 MV 质感';
    board.aspect = '9:16';
    const { prompt, blocked } = assembleReferencePrompt(board, {
      skillId: 'gen-depth-action-replica',
      quality: 'Cinematic continuous shot.',
      constraints: 'Constraints: no watermark.',
    });
    expect(blocked).toBe(false);
    expect(prompt).toMatch(/@深度视频/);
    expect(prompt).toMatch(/@人物/);
    expect(prompt).toMatch(/9:16/);
  });

  it('引用包含 clips + images 且确认后 ready', () => {
    const board = switchPlaybook('depth-action-replica');
    board.slots.find((s) => s.role === 'depth_motion')!.assetUrl = '/d.mp4';
    board.slots.find((s) => s.role === 'character')!.assetUrl = '/c.png';
    board.assembledPrompt = 'test prompt with @深度视频';
    board.enforce = true;
    const pack = buildReferencePack(board);
    expect(pack.videoUrls).toContain('/d.mp4');
    expect(pack.imageUrls).toContain('/c.png');
    expect(pack.ready).toBe(true);
  });

  it('后端暴露 depth-video 路由', () => {
    const ctrl = readFileSync(
      resolve(root, 'apps/server/src/modules/montage/montage.controller.ts'),
      'utf8',
    );
    expect(ctrl).toMatch(/depth-video/);
    const svc = readFileSync(
      resolve(root, 'apps/server/src/modules/montage/montage.service.ts'),
      'utf8',
    );
    expect(svc).toMatch(/convertDepthVideo/);
  });

  it('参考板 socket 支持 clip', () => {
    const sock = readFileSync(
      resolve(root, 'packages/shared/src/catalog/socket-registry.ts'),
      'utf8',
    );
    expect(sock).toMatch(/'reference-board': \{ accepts: \['prompt', 'picture', 'clip'\], emits: \['prompt', 'picture', 'clip'\] \}/);
  });
});
