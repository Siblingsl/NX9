/**
 * UX 首用单车道：未解锁前，启动器/模板页只推「AI 漫剧核心流程」。
 * 解锁：用户点「查看全部配方」，或导出成片成功写回。
 */
export const FIRST_LANE_STORAGE_KEY = 'nx9.firstLane.unlocked';

/** 单车道允许的模板 id（与 playbook 核心漫剧对齐） */
export const FIRST_LANE_TEMPLATE_IDS = ['tpl-core-episode'] as const;

/** 单车道允许的 Playbook id */
export const FIRST_LANE_PLAYBOOK_IDS = ['pb-ai-comic-live'] as const;

export type FirstLaneTemplateId = (typeof FIRST_LANE_TEMPLATE_IDS)[number];

export function isFirstLaneUnlocked(): boolean {
  try {
    return localStorage.getItem(FIRST_LANE_STORAGE_KEY) === '1';
  } catch {
    return true; // 无 storage 时不挡专业用户
  }
}

export function unlockFirstLane(): void {
  try {
    localStorage.setItem(FIRST_LANE_STORAGE_KEY, '1');
  } catch {
    /* noop */
  }
}

export function resetFirstLaneForTests(): void {
  try {
    localStorage.removeItem(FIRST_LANE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function isFirstLaneTemplateId(id: string): boolean {
  return (FIRST_LANE_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function isFirstLanePlaybookId(id: string): boolean {
  return (FIRST_LANE_PLAYBOOK_IDS as readonly string[]).includes(id);
}

/** 单车道锁定时只返回主干模板；已解锁则原样返回 */
export function filterTemplatesForFirstLane<T extends { id: string }>(templates: T[]): T[] {
  if (isFirstLaneUnlocked()) return templates;
  return templates.filter((t) => isFirstLaneTemplateId(t.id));
}

export function filterPlaybooksForFirstLane<T extends { id: string }>(playbooks: T[]): T[] {
  if (isFirstLaneUnlocked()) return playbooks;
  return playbooks.filter((p) => isFirstLanePlaybookId(p.id));
}
