/**
 * REQ-DV：深度视频动作复刻 / 视频热门玩法验收
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assembleReferencePrompt,
  buildClipGenPlaybookPack,
  buildClipGenPlaybookPatch,
  buildReferencePack,
  clearClipGenPlaybookPatch,
  createSlotsFromPlaybook,
  lookupReferencePlaybook,
  readClipGenPlaybook,
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

  it('Playbook registry 含主玩法', () => {
    expect(lookupReferencePlaybook('depth-action-replica')?.skillId).toBe(
      'gen-depth-action-replica',
    );
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
    board.slots.push({
      id: 'character-extra',
      role: 'character',
      label: '人物2',
      mediaType: 'image',
      required: false,
      lock: true,
      assetUrl: '/media/b.png',
    });
    board.slots.push({
      id: 'scene-1',
      role: 'scene',
      label: '场景',
      mediaType: 'image',
      required: false,
      lock: true,
      assetUrl: '/media/scene.png',
    });
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

  it('clip-gen 玩法 patch 可读可清，运行时即时装配', () => {
    const patch = buildClipGenPlaybookPatch('depth-action-replica');
    expect(patch.videoPlaybookId).toBe('depth-action-replica');
    expect(Array.isArray(patch.videoPlaybookSlots)).toBe(true);
    const state = readClipGenPlaybook(patch);
    expect(state?.playbookId).toBe('depth-action-replica');
    state!.slots.find((s) => s.role === 'depth_motion')!.assetUrl = '/d.mp4';
    state!.slots.find((s) => s.role === 'character')!.assetUrl = '/c.png';
    const pack = buildClipGenPlaybookPack(state!, '补句：霓虹街头', {
      skillId: 'gen-depth-action-replica',
      quality: 'Cinematic.',
      constraints: 'no watermark',
    });
    expect(pack.ready).toBe(true);
    expect(pack.assembledPrompt).toMatch(/@深度视频/);
    expect(pack.depthVideoUrl).toBe('/d.mp4');
    const cleared = clearClipGenPlaybookPatch();
    expect(readClipGenPlaybook(cleared)).toBeNull();
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

  it('视频工作区挂载热门玩法入口；参考板保持轻量', () => {
    const videoWs = readFileSync(
      resolve(
        root,
        'apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx',
      ),
      'utf8',
    );
    expect(videoWs).toMatch(/VideoPlaybookMenu/);
    expect(videoWs).toMatch(/VideoPlaybookTools/);
    const boardWs = readFileSync(
      resolve(
        root,
        'apps/web/src/engine/stage-deck/chrome/attached-workspace/tool/ReferenceBoardWorkspace.tsx',
      ),
      'utf8',
    );
    expect(boardWs).toMatch(/风格约束/);
    expect(boardWs).not.toMatch(/VideoPlaybookMenu|switchPlaybook/);
  });
});
