import type { BlockDefinition, BlockCategory } from '../types/block';

/**
 * NX9 画布节点目录（漫剧 + 爆款复刻主产品面）。
 * 历史 kind 不在此表；加载时由 migrate-block-kinds 改写。
 *
 * Dock 默认可见 ≈ 16；concealed = 高级/命令面板可搜。
 * ScreenModal 弹窗节点（script-desk / asset-gate /
 * storyboard-desk / continuity-check）仅登记；编剧台 UI 由功能 3 升级。
 * 角色/场景设定主入口为素材库，不再提供画布节点。
 */
export const BLOCK_CATALOG: BlockDefinition[] = [
  // ── 素材 / 复刻入口 ──
  {
    kind: 'asset-import',
    label: '素材导入',
    category: 'source',
    hint: '图像 / 视频 / 音频上传',
    glyph: 'Upload',
    accent: '#2E8B57',
  },
  {
    kind: 'link-parser',
    label: '链接采集',
    category: 'source',
    hint: '爆款链接解析 · 素材采集 · 风格拆解入口',
    glyph: 'Link',
    accent: '#2E8B57',
    nx9Native: true,
  },

  // ── 生成 ──
  {
    kind: 'picture-gen',
    label: '图像生成',
    category: 'generate',
    hint: '文生图 / 图生图',
    glyph: 'Image',
    accent: '#c4a574',
  },
  {
    kind: 'clip-gen',
    label: '视频生成',
    category: 'generate',
    hint: '单镜/续拍 · 本集批出 · 回写镜头',
    glyph: 'Video',
    accent: '#A13D63',
  },
  {
    kind: 'clip-editor',
    label: '智能剪辑',
    category: 'generate',
    hint: '智能编排时间线 · Remotion/HF/FFmpeg 成片',
    glyph: 'Scissors',
    accent: '#A13D63',
  },
  {
    kind: 'sound-gen',
    label: 'AI 配音',
    category: 'generate',
    hint: '单轨 TTS · 多角色配音 · BGM',
    glyph: 'Music',
    accent: '#A13D63',
  },
  {
    kind: 'director-desk',
    label: '导演台',
    category: 'generate',
    hint: '3D 机位 · 关键帧批出 · 风格锁 · 审阅 · 送视频',
    glyph: 'Clapperboard',
    accent: '#A13D63',
    nx9Native: true,
  },

  // ── 创作主路径（含 ScreenModal 弹窗，UI 冻结） ──
  {
    kind: 'script-desk',
    label: '编剧台',
    category: 'craft',
    hint: 'Agent 共创 / 上传成稿 · Bible draft · 确认交接',
    glyph: 'MessageSquareText',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'asset-gate',
    label: '设定检查',
    category: 'craft',
    hint: 'Bible/镜需求对照 · 缺口补齐 · 放行',
    glyph: 'GitBranch',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'storyboard-desk',
    label: '分镜台',
    category: 'craft',
    hint: '成稿拆镜 · 镜表编辑 · 构图确认',
    glyph: 'Clapperboard',
    accent: '#A13D63',
    nx9Native: true,
  },
  {
    kind: 'reference-board',
    label: '参考板',
    category: 'craft',
    hint: 'Mood board · 风格约束 · 复刻参考',
    glyph: 'LayoutDashboard',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'continuity-check',
    label: '连贯性检查',
    category: 'craft',
    hint: '多镜服装/光影/轴线报告',
    glyph: 'ScanEye',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'inpaint-edit',
    label: '局部重绘',
    category: 'craft',
    hint: '蒙版局部修改',
    glyph: 'Brush',
    accent: '#D97706',
    nx9Native: true,
    concealed: true,
  },

  // ── 空间（高级）— director-3d 已合并到 director-desk，目录已下架 ──

  // ── 后期 / 交付 ──
  {
    kind: 'caption-asr',
    label: '字幕台',
    category: 'utility',
    hint: '语音转字幕 · 字幕烧录',
    glyph: 'Subtitles',
    accent: '#D97706',
    nx9Native: true,
    concealed: true,
  },
  {
    kind: 'local-enhance',
    label: '图像增强',
    category: 'utility',
    hint: '高清 · 放大 · 去水印 · 抠图 · 预处理',
    glyph: 'ZoomIn',
    accent: '#D97706',
    nx9Native: true,
    concealed: true,
  },
  {
    kind: 'grid-compose',
    label: '宫格',
    category: 'utility',
    hint: '宫格切分与拼接（图文复刻）',
    glyph: 'LayoutGrid',
    accent: '#D97706',
  },
  {
    kind: 'iterator',
    label: '迭代器',
    category: 'utility',
    hint: '批量驱动下游',
    glyph: 'Repeat',
    accent: '#D97706',
    concealed: true,
  },
  {
    kind: 'export-pack',
    label: '交付打包',
    category: 'utility',
    hint: '交付 ZIP / 成片 / 工程包',
    glyph: 'PackageOpen',
    accent: '#D97706',
    nx9Native: true,
  },

  // ── 流程：审阅关卡已并入导演台（见 BLOCK_KIND_MIGRATIONS）──
];

export function isBlockSpawnable(block: BlockDefinition): boolean {
  return !block.deprecated;
}

export function isDockVisible(block: BlockDefinition): boolean {
  return isBlockSpawnable(block) && !block.concealed;
}

export function getSpawnableBlocks(): BlockDefinition[] {
  return BLOCK_CATALOG.filter(isBlockSpawnable);
}

export function getDockBlocks(): BlockDefinition[] {
  return BLOCK_CATALOG.filter(isDockVisible);
}

function spawnableInCategory(category: BlockCategory): BlockDefinition[] {
  return BLOCK_CATALOG.filter((b) => b.category === category && isDockVisible(b));
}

export const BLOCK_GROUPS: Record<BlockCategory, { title: string; items: BlockDefinition[] }> = {
  source: { title: '素材', items: spawnableInCategory('source') },
  generate: { title: '生成', items: spawnableInCategory('generate') },
  hub: { title: 'Hub', items: spawnableInCategory('hub') },
  integrate: { title: '集成', items: spawnableInCategory('integrate') },
  craft: { title: '创作', items: spawnableInCategory('craft') },
  utility: { title: '工具', items: spawnableInCategory('utility') },
  support: { title: '辅助', items: spawnableInCategory('support') },
  spatial: { title: '空间', items: spawnableInCategory('spatial') },
};

/**
 * 仅程序化 spawn（拖出/内部创建），不进 Dock / 命令面板 / getSpawnableBlocks。
 * 与「隐藏旧节点」无关：这是新设计的画布钉图能力。
 */
export const INTERNAL_BLOCKS: BlockDefinition[] = [
  {
    kind: 'media-pin',
    label: '画布钉图',
    category: 'utility',
    hint: '从生成结果或上游拖出的单图钉板 · 可连下游',
    glyph: 'Pin',
    accent: '#c4a574',
  },
];

export function lookupBlock(kind: string): BlockDefinition | undefined {
  return (
    BLOCK_CATALOG.find((b) => b.kind === kind) ??
    INTERNAL_BLOCKS.find((b) => b.kind === kind)
  );
}
