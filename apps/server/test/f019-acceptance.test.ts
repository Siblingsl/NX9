/**
 * F-019 Agent 3D 摆位协议验收
 * - validatePoseCommand 合法指令通过
 * - validatePoseCommand 非法指令拒绝（非对象/版本/角色/camera/空角色）
 * - parseAgentPoseCommand 处理 JSON 字符串和对象
 * - 非法指令不产生成功结果（场景不变）
 * - 合法指令含 summary
 * - 越界值 clamp 不拒绝
 * - UI 层非法指令不触发 onPose
 * - bridge 源码守卫
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validatePoseCommand,
  poseCommandSummary,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

// ─── 合法指令夹具 ───
const VALID_POSE = {
  version: 1,
  characters: [
    {
      characterId: 'ch-a1',
      name: '男主角',
      position: [1.0, 0, 3.0],
      rotation: [0, 180, 0],
      scale: [1, 1, 1],
    },
  ],
  camera: { position: [0, 1.6, 5], target: [0, 1.6, 0], fov: 45 },
  lookAt: '男主角',
};

describe('F-019 Agent 3D 摆位协议', () => {

  // ═══════════ validatePoseCommand 合法指令 ═══════════
  it('合法指令通过校验', () => {
    const result = validatePoseCommand(VALID_POSE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.command).toBeDefined();
  });

  it('合法指令 characters 列表完整', () => {
    const result = validatePoseCommand(VALID_POSE);
    expect(result.command!.characters).toHaveLength(1);
    expect(result.command!.characters[0].name).toBe('男主角');
    expect(result.command!.characters[0].position).toEqual([1, 0, 3]);
  });

  it('合法指令 camera 字段完整', () => {
    const result = validatePoseCommand(VALID_POSE);
    expect(result.command!.camera.position).toEqual([0, 1.6, 5]);
    expect(result.command!.camera.target).toEqual([0, 1.6, 0]);
    expect(result.command!.camera.fov).toBe(45);
  });

  it('合法指令含 lookAt', () => {
    const result = validatePoseCommand(VALID_POSE);
    expect(result.command!.lookAt).toBe('男主角');
  });

  it('合法指令含 posePresetId', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [
        { name: 'A', position: [0, 0, 0], rotation: [0, 0, 0], posePresetId: 'idle' },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.command!.characters[0].posePresetId).toBe('idle');
  });

  // ═══════════ validatePoseCommand 非法指令：场景不变 ═══════════
  it('拒绝非对象输入', () => {
    const result = validatePoseCommand(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('输入必须是 JSON 对象');
    expect(result.command).toBeUndefined();
  });

  it('拒绝字符串输入', () => {
    const result = validatePoseCommand('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('输入必须是 JSON 对象');
  });

  it('拒绝不支持的协议版本', () => {
    const result = validatePoseCommand({ ...VALID_POSE, version: 99 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('不支持的协议版本');
  });

  it('拒绝缺少 characters 数组', () => {
    const result = validatePoseCommand({
      version: 1,
      camera: { position: [0, 0, 0], target: [0, 0, 0] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('characters');
  });

  it('拒绝 characters 非数组', () => {
    const result = validatePoseCommand({
      version: 1,
      characters: 'not-array',
      camera: { position: [0, 0, 0], target: [0, 0, 0] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('characters 必须是数组');
  });

  it('拒绝 character 缺少 name', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [{ position: [0, 0, 0], rotation: [0, 0, 0] } as any],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('缺少 name');
  });

  it('拒绝 character position 不是 [x,y,z] 数组', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [{ name: 'A', position: 'bad', rotation: [0, 0, 0] } as any],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('position');
  });

  it('拒绝 character position 长度不足 3', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [{ name: 'A', position: [1, 2], rotation: [0, 0, 0] } as any],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('position');
  });

  it('拒绝 character 非对象', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [null],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('不是对象');
  });

  it('拒绝缺少 camera position/target', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      camera: { fov: 45 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('camera');
  });

  it('拒绝 camera.position 非数组', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      camera: { position: 'bad', target: [0, 0, 0] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('camera');
  });

  it('空 characters 且无其他错误时仍拒绝', () => {
    const result = validatePoseCommand({
      version: 1,
      characters: [],
      camera: { position: [0, 0, 0], target: [0, 0, 0] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('至少需要一个角色');
  });

  // ═══════════ 越界值 clamp 不拒绝 ═══════════
  it('越界 position 被 clamp 到合法范围', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [
        { name: 'A', position: [999, 999, 999], rotation: [0, 0, 0] },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.command!.characters[0].position).toEqual([50, 50, 50]);
  });

  it('越界 rotation 被 clamp', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [
        { name: 'A', position: [0, 0, 0], rotation: [999, -999, 300] },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.command!.characters[0].rotation).toEqual([180, -180, 180]);
  });

  it('越界 fov 被 clamp', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      camera: { position: [0, 0, 0], target: [0, 0, 0], fov: 999 },
    });
    expect(result.valid).toBe(true);
    expect(result.command!.camera.fov).toBe(160);
  });

  it('缺 rotation 默认 [0,0,0]', () => {
    const result = validatePoseCommand({
      ...VALID_POSE,
      characters: [{ name: 'A', position: [1, 2, 3] } as any],
    });
    expect(result.valid).toBe(true);
    expect(result.command!.characters[0].rotation).toEqual([0, 0, 0]);
  });

  // ═══════════ poseCommandSummary ═══════════
  it('poseCommandSummary 返回角色与镜头信息', () => {
    const result = validatePoseCommand(VALID_POSE);
    const summary = poseCommandSummary(result.command!);
    expect(summary).toContain('男主角');
    expect(summary).toContain('cam at');
  });

  // ═══════════ Bridge：parseAgentPoseCommand ═══════════
  it('bridge 源码存在且导入 validatePoseCommand', () => {
    const src = readWeb('engine/agent-director3d-bridge.ts');

    expect(src).toContain('validatePoseCommand');
    expect(src).toContain('parseAgentPoseCommand');
    expect(src).toContain('from \'@nx9/shared\'');
  });

  it('bridge 处理 JSON 字符串非法输入', () => {
    const src = readWeb('engine/agent-director3d-bridge.ts');

    // 必须包含 JSON.parse 的 try-catch
    expect(src).toContain('try');
    expect(src).toContain('JSON.parse');
    // 返回 { success: false, errors: [...] }
    expect(src).toContain('JSON 解析失败');
  });

  it('bridge 将 validatePoseCommand 失败转为 success: false', () => {
    const src = readWeb('engine/agent-director3d-bridge.ts');

    expect(src).toContain('success: false');
    expect(src).toContain('validatePoseCommand(parsed)');
    expect(src).toContain('result.errors');
  });

  // ═══════════ UI 层：agent-pose-input 非法指令不修改场景 ═══════════
  it('agent-pose-input 非法 JSON 仅设置 error，不调用 onPose', () => {
    const src = readWeb('blocks/core/director-desk/agent-pose-input.tsx');

    // 非法时：setError + return（不调用 onPose）
    expect(src).toContain('setError');
    expect(src).toContain('return');
    // 只有 success 时才调用 onPose
    expect(src).toContain('result.success');
    expect(src).toContain('onPose');
  });

  it('agent-pose-input 调用 parseAgentPoseCommand', () => {
    const src = readWeb('blocks/core/director-desk/agent-pose-input.tsx');

    expect(src).toContain('parseAgentPoseCommand');
  });

  // ═══════════ 导演台 3D 嵌入：onPose 守卫 ═══════════
  it('director-3d-stage-embed agent-pose-input 通过 agent-pose-input 模块可达', () => {
    const src = readWeb('blocks/core/director-desk/agent-pose-input.tsx');

    expect(src).toContain('parseAgentPoseCommand');
    expect(src).toContain('onPose');
  });

  it('agent-pose-input 导入 bridge', () => {
    const src = readWeb('blocks/core/director-desk/agent-pose-input.tsx');
    expect(src).toContain('agent-director3d-bridge');
  });

  // ═══════════ 协议 schema 源码守卫 ═══════════
  it('director3d-pose-schema 导出 validatePoseCommand 和 poseCommandSummary', () => {
    const src = readFileSync(
      resolve(root, 'packages/shared/src/utils/director3d-pose-schema.ts'),
      'utf8',
    );

    expect(src).toContain('export function validatePoseCommand');
    expect(src).toContain('export function poseCommandSummary');
    expect(src).toContain('Director3dPoseCommand');
  });

  // ═══════════ 组合测：非法指令全链路不产生有效结果 ═══════════
  it('非法指令链：validate→bridge→UI 全程无有效结果产出', () => {
    // 多个样本非法输入，每一级 validate 都返回 valid: false
    const badSamples: unknown[] = [
      null,
      'not json string',
      {},
      { version: 2, characters: [], camera: {} },
      { version: 1 },
      { version: 1, characters: [{ name: 'X' }] },
      { version: 1, characters: [{ name: 'X', position: [0, 0, 0], rotation: [0, 0, 0] }] },
      { version: 1, characters: [], camera: { position: [0, 0, 0], target: [0, 0, 0] } },
    ];

    for (const sample of badSamples) {
      const result = validatePoseCommand(sample);
      expect(result.valid).toBe(false);
      expect(result.command).toBeUndefined();
    }
  });
});
