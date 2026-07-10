export interface ContinuationInput {
  sourcePrompt: string;
  endFrameDescription?: string;
  nextPrompt: string;
}

export function buildBridgeContinuationPrompt(input: ContinuationInput): string {
  const parts: string[] = [];
  if (input.sourcePrompt.trim()) parts.push(`前情：${input.sourcePrompt.trim()}`);
  if (input.endFrameDescription?.trim()) parts.push(`尾帧：${input.endFrameDescription.trim()}`);
  if (input.nextPrompt.trim()) parts.push(`接续：${input.nextPrompt.trim()}`);
  parts.push('保持镜头连贯性，避免跳切');
  return parts.join('\n');
}
