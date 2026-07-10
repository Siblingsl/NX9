import type { EnvironmentProfile } from '../types/environment';

export function buildEnvironmentContextPrompt(env: EnvironmentProfile): string {
  if (!env) return '';
  const parts: string[] = [];
  if (env.lighting?.trim()) parts.push(`Lighting: ${env.lighting.trim()}`);
  if (env.era?.trim()) parts.push(`Era: ${env.era.trim()}`);
  if (env.props && env.props.length > 0) parts.push(`Props: ${env.props.join(', ')}`);
  if (parts.length === 0) return '';
  return `Environment:\n${parts.join('\n')}`;
}

export function enrichPromptWithEnvironment(base: string, env: EnvironmentProfile): string {
  const context = buildEnvironmentContextPrompt(env);
  const trimmed = base.trim();
  if (!context) return trimmed;
  return trimmed ? `${trimmed}\n\n${context}` : context;
}
