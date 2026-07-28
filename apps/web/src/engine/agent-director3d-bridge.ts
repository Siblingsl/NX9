/**
 * agent-director3d-bridge.ts — Agent 3D 摆位协议桥接（F-019）。
 *
 * 连接 LLM Agent 输出与 Director3d 场景。
 * 使用 validatePoseCommand 校验 Agent 输出，非法指令丢弃并 toast。
 */
import { validatePoseCommand, poseCommandSummary, type Director3dPoseCommand } from '@nx9/shared';

export interface AgentPoseResult {
  success: boolean;
  command?: Director3dPoseCommand;
  errors: string[];
  summary?: string;
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
