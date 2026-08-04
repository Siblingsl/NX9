/**
 * agent-director3d-bridge.ts — Agent 3D 摆位协议桥接（F-019）。
 *
 * 连接 LLM Agent 输出与 Director3d 场景。
 * 使用 validatePoseCommand 校验 Agent 输出，非法指令丢弃并 toast。
 */
import { validatePoseCommand, poseCommandSummary, type Director3dPoseCommand } from '@nx9/shared';
import type { Director3dShotState } from '@nx9/director3d';

export interface AgentPoseResult {
  success: boolean;
  command?: Director3dPoseCommand;
  errors: string[];
  summary?: string;
}

export interface Director3dPoseRequest {
  shotId: string;
  baseStateVersion: number;
  command: Director3dPoseCommand;
}

export interface Director3dPoseTransactionResult {
  ok: boolean;
  error?: string;
  summary?: string;
  nextState?: Director3dShotState;
}

/**
 * 接收 Agent 的 JSON 工具调用输出，校验并返回可应用的 3D 摆位指令。
 */
export function parseAgentPoseCommand(input: string | unknown): AgentPoseResult {
  let parsed: unknown;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { success: false, errors: ['JSON 解析失败，Agent 输出不是有效 JSON'] };
    }
  } else {
    parsed = input;
  }

  const result = validatePoseCommand(parsed);
  if (!result.valid) {
    return { success: false, errors: result.errors };
  }

  return {
    success: true,
    command: result.command,
    errors: [],
    summary: result.command ? poseCommandSummary(result.command) : undefined,
  };
}

export function createPoseRequest(
  input: string | unknown,
  shotId: string,
  baseStateVersion: number,
): AgentPoseResult & { request?: Director3dPoseRequest } {
  const parsed = parseAgentPoseCommand(input);
  if (!parsed.success || !parsed.command) return parsed;
  return {
    ...parsed,
    request: { shotId, baseStateVersion, command: parsed.command },
  };
}

export function applyPoseTransaction(
  state: Director3dShotState,
  request: Director3dPoseRequest,
  confirmed: boolean,
): Director3dPoseTransactionResult {
  if (!confirmed) return { ok: false, error: '未确认 Agent 摆位变更' };
  if (request.shotId !== state.shotId) return { ok: false, error: 'Agent 摆位镜头已切换' };
  if (request.baseStateVersion !== state.stateVersion) return { ok: false, error: 'Agent 摆位基准版本已过期，请重新生成' };

  const byId = new Map(state.objects.map((object) => [object.sourceCharacterId, object]));
  const byName = new Map(state.objects.map((object) => [object.name, object]));
  const missing: string[] = [];
  const objects = state.objects.map((object) => {
    const pose = request.command.characters.find((item) =>
      (item.characterId && item.characterId === object.sourceCharacterId) || item.name === object.name,
    );
    if (!pose) return object;
    return {
      ...object,
      transform: { ...object.transform, position: pose.position, rotation: pose.rotation, scale: pose.scale ?? object.transform.scale },
      posePresetId: pose.posePresetId ?? object.posePresetId,
    };
  });
  for (const pose of request.command.characters) {
    if (!byId.has(pose.characterId) && !byName.has(pose.name)) missing.push(pose.name);
  }
  if (missing.length > 0) return { ok: false, error: `未绑定当前镜头角色：${missing.join('、')}` };

  const nextState: Director3dShotState = {
    ...state,
    objects,
    camera: {
      ...state.camera,
      position: request.command.camera.position,
      target: request.command.camera.target,
      fov: request.command.camera.fov ?? state.camera.fov,
    },
    dirty: true,
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, summary: poseCommandSummary(request.command), nextState };
}
