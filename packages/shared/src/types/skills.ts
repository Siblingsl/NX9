/** Skill catalog entry — frontmatter only (used in lists / selectors) */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
}

/** Full skill including the raw SKILL.md body (used when editing / injecting into LLM) */
export interface SkillDetail extends SkillSummary {
  content: string;
}
