import type { AssetLibraryKind } from '@nx9/shared';

export const ENTITY_CARD_TABS = new Set<AssetLibraryKind>(['costume', 'scene', 'prop']);
/** P-18：支持多选批量治理的 Tab */
export const BATCHABLE_TABS = new Set<AssetLibraryKind>(['character', 'costume', 'scene', 'prop']);

export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export const KIND_META: Record<
  AssetLibraryKind,
  { newLabel: string; emptyHint: string; promptPlaceholder: string }
> = {
  character: {
    newLabel: '新建角色',
    emptyHint: '角色设定主入口：档案、三视图、设定板生成；用「复制 @」粘贴到生成节点 Prompt',
    promptPlaceholder: '一致性 prompt…',
  },
  costume: {
    newLabel: '新建服装',
    emptyHint: '创建服装套装，维护面料/配色/标志物；用「复制 @」粘贴到 Prompt',
    promptPlaceholder: '造型、面料、配色、标志物…',
  },
  scene: {
    newLabel: '新建场景',
    emptyHint: '场景设定主入口：空间锚点、多参考图、环境圣经同步；用「复制 @」粘贴到 Prompt',
    promptPlaceholder: '环境、光线、空间描述…',
  },
  prop: {
    newLabel: '新建道具',
    emptyHint: '创建道具档案，维护外观 Prompt 与参考图；用「复制 @」粘贴到 Prompt',
    promptPlaceholder: '外形、材质、标志细节…',
  },
  shot: {
    newLabel: '新建镜头',
    emptyHint: '公共运镜词典（仅公共库可见）· 可新建条目，或检查筛选条件',
    promptPlaceholder: '运镜、景别、机位描述…',
  },
  emotion: {
    newLabel: '（已停用新建）',
    emptyHint: '情绪库已降级：请用镜头「推荐情绪」标签，或角色表情格。此处仅兼容旧条目。',
    promptPlaceholder: '表情、氛围…',
  },
  hook: {
    newLabel: '（已停用新建）',
    emptyHint: '爆点已退出素材库：请在编剧台维护 brief.hooks。此处仅兼容旧条目。',
    promptPlaceholder: '爆点文案…',
  },
  style: {
    newLabel: '新建风格',
    emptyHint: '轻量美学词典：名称、Prompt、可选参考图；分镜帧可点选风格资产',
    promptPlaceholder: '画面美学、光影、材质…',
  },
  sound: {
    newLabel: '新建声音',
    emptyHint: '配音 / 音效 / BGM 词典：名称、Prompt、可选音频；用「复制 @」粘贴到 Prompt',
    promptPlaceholder: '声音描述…',
  },
};
