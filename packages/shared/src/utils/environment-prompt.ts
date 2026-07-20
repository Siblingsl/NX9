import type { EnvironmentProfile } from '../types/environment';

export function buildEnvironmentContextPrompt(env: EnvironmentProfile): string {
  if (!env) return '';
  const parts: string[] = [];
  if (env.name?.trim()) parts.push(`Location: ${env.name.trim()}`);
  if (env.descriptionZh?.trim()) parts.push(`Description: ${env.descriptionZh.trim()}`);
  if (env.lighting?.trim()) parts.push(`Lighting: ${env.lighting.trim()}`);
  if (env.era?.trim()) parts.push(`Era / style: ${env.era.trim()}`);
  if (env.props && env.props.length > 0) parts.push(`Prop anchors: ${env.props.join(', ')}`);
  if (env.consistencyPrompt?.trim()) parts.push(`Continuity lock: ${env.consistencyPrompt.trim()}`);
  if (parts.length === 0) return '';
  parts.push('Keep architecture scale, materials and light logic consistent across shots.');
  return `Environment:\n${parts.join('\n')}`;
}

export function enrichPromptWithEnvironment(base: string, env: EnvironmentProfile): string {
  const context = buildEnvironmentContextPrompt(env);
  const trimmed = base.trim();
  if (!context) return trimmed;
  return trimmed ? `${trimmed}\n\n${context}` : context;
}
