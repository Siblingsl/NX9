import type { ScriptDeskSkillId } from '../types/screenplay-package';
import type { SkillLane } from '../types/skills';

/** 编剧台芯片 ID → 独立 Skill 项目 name */
export const SCRIPT_DESK_CHIP_TO_SKILL: Record<ScriptDeskSkillId, string> = {
  topic: 'script-skill-topic',
  world: 'script-skill-world',
  character: 'script-skill-character',
  plot: 'script-skill-plot',
  pacing: 'script-skill-pacing',
  dialogue: 'script-skill-dialogue',
  hooks: 'script-skill-hooks',
  consistency: 'script-skill-consistency',
  generate: 'script-skill-generate',
  ingest: 'script-skill-ingest',
};

/** Agent / 生产管线能力 → 独立 Skill 项目 name */
export const AGENT_CAPABILITY_TO_SKILL = {
  'dialogue-extract': 'agent-dialogue-extract',
  'shot-script': 'agent-shot-script',
  skeleton: 'script-skeleton',
  adaptation: 'agent-adaptation',
  screenplay: 'agent-screenplay',
  'director-plan': 'agent-director-plan',
  'extract-assets': 'agent-extract-assets',
  'novel-events': 'agent-novel-events',
  'scene-split': 'agent-scene-split',
  environments: 'agent-environments',
  'storyboard-table': 'production-storyboard-table',
  'breakdown-planner': 'breakdown-episode-planner',
  'breakdown-shots': 'breakdown-episode-shots',
} as const;

export type AgentCapabilityId = keyof typeof AGENT_CAPABILITY_TO_SKILL;

/** Gen Template 内置 Skill（B 类 · 文档 P0） */
export const BUILTIN_GEN_SKILL_IDS = [
  'gen-bible-character',
  'gen-bible-scene',
  'gen-character-sheet-master',
  'gen-depth-action-replica',
  'gen-director-batch-shot',
  'gen-studio-image',
  'gen-studio-sketch',
  'gen-studio-video',
] as const;

/** 主制片链路内置 Skill（可注入 / 文档强制） */
export const BUILTIN_SKILL_IDS: readonly string[] = [
  ...Object.values(SCRIPT_DESK_CHIP_TO_SKILL),
  ...Object.values(AGENT_CAPABILITY_TO_SKILL),
  ...BUILTIN_GEN_SKILL_IDS,
];

const BUILTIN_SKILL_ID_SET = new Set(BUILTIN_SKILL_IDS);

/** 资料 / 工具类（有用但当前不走主链 system 注入） */
export function resolveSkillLane(skillId: string, metaLane?: string): SkillLane {
  if (metaLane === 'builtin' || metaLane === 'library') return metaLane;
  if (BUILTIN_SKILL_ID_SET.has(skillId) || skillId.startsWith('gen-')) return 'builtin';
  return 'library';
}

/** 芯片短名或完整项目名 → 可加载的 Skill 目录名 */
export function resolveScriptDeskSkillName(chipOrName: string): string {
  const id = (chipOrName ?? '').trim();
  if (!id) return 'script-skill-topic';
  if (id.startsWith('script-skill-')) return id;
  const mapped = SCRIPT_DESK_CHIP_TO_SKILL[id as ScriptDeskSkillId];
  if (mapped) return mapped;
  return `script-skill-${id}`;
}

export function resolveAgentSkillName(capability: AgentCapabilityId | string): string {
  const id = (capability ?? '').trim() as AgentCapabilityId;
  return AGENT_CAPABILITY_TO_SKILL[id] ?? id;
}

/** 去掉 YAML frontmatter，供 LLM system 注入 */
export function skillBodyForInjection(raw: string): string {
  const text = (raw ?? '').replace(/^\uFEFF/, '');
  const stripped = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return stripped.trim();
}

/** 判断 Skill 正文是否仍为骨架占位（尚未加厚） */
export function isSkillStubContent(body: string): boolean {
  const t = (body ?? '').trim();
  if (t.length < 120) return true;
  return /待补充/.test(t);
}
