/**
 * UX 术语统一：拆镜相关入口共用「拆镜」动词，避免
 * 「从成稿拆镜 / 同步最新成稿 / 只拆新增」三套说法。
 */
export const BREAKDOWN_VERB = '拆镜';

export function breakdownBusyLabel(): string {
  return `${BREAKDOWN_VERB}中…`;
}

export function breakdownBlockedLabel(): string {
  return '设定未就绪（硬模式）';
}

/** 拆镜页主 CTA / 节点卡下一步 */
export function breakdownPrimaryLabel(opts: {
  busy?: boolean;
  blocked?: boolean;
  /** 上游成稿已变 */
  stale?: boolean;
  /** 上游新增集数（可增量） */
  newEpisodeCount?: number;
  /** 本台已有镜表 */
  hasLocalShots?: boolean;
}): string {
  if (opts.busy) return breakdownBusyLabel();
  if (opts.blocked) return breakdownBlockedLabel();
  const n = opts.newEpisodeCount ?? 0;
  if (opts.stale && n > 0) return `${BREAKDOWN_VERB} · 新增 ${n} 集`;
  if (opts.stale) return `${BREAKDOWN_VERB} · 同步`;
  if (opts.hasLocalShots) return `${BREAKDOWN_VERB} · 同步`;
  return BREAKDOWN_VERB;
}

/** 仅拆新增的次按钮 */
export function breakdownNewOnlyLabel(count: number, busy?: boolean): string {
  if (busy) return breakdownBusyLabel();
  return `${BREAKDOWN_VERB} · 新增 ${count} 集`;
}

/** 编剧台送分镜后的下一步提示（与分镜台主按钮一致） */
export function breakdownNextStepHint(hasLocalBreakdown: boolean): string {
  return breakdownPrimaryLabel({ hasLocalShots: hasLocalBreakdown });
}
