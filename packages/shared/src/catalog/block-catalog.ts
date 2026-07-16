import type { BlockDefinition, BlockCategory } from '../types/block';

/**
 * NX9 精简节点目录（合并后主产品面）。
 * 历史 kind 不在此表；加载时由 migrate-block-kinds 改写。
 */
export const BLOCK_CATALOG: BlockDefinition[] = [
  // ── 素材 ──
  {
    kind: 'asset-import',
    label: '素材导入',
    category: 'source',
    hint: '图像 / 视频 / 音频 / 3D 上传',
    glyph: 'Upload',
    accent: '#2E8B57',
  },
  {
    kind: 'mesh-import',
    label: '3D 导入',
    category: 'source',
    hint: 'glb/gltf/obj 模型上传',
    glyph: 'Box',
    accent: '#5E4D8A',
  },
  {
    kind: 'mesh-viewer',
    label: '3D 预览',
    category: 'source',
    hint: '模型预览与快照',
    glyph: 'Box',
    accent: '#5E4D8A',
  },

  // ── 生成 ──
  {
    kind: 'prompt',
    label: '提示词',
    category: 'generate',
    hint: '多行提示词 + 上游配对',
    glyph: 'Type',
    accent: '#A13D63',
  },
  {
    kind: 'picture-gen',
    label: '图像生成',
    category: 'generate',
    hint: '文生图 / 图生图 / 专业工具',
    glyph: 'Image',
    accent: '#c4a574',
  },
  {
    kind: 'clip-gen',
    label: '视频生成',
    category: 'generate',
    hint: '单镜图生视频 · Bridge 续拍 · 关联关键帧出片',
    glyph: 'Video',
    accent: '#A13D63',
  },
  {
    kind: 'clip-editor',
    label: '视频剪辑',
    category: 'generate',
    hint: '拼接转场 · 混音 · 调色（模式切换）',
    glyph: 'Scissors',
    accent: '#A13D63',
  },
  {
    kind: 'director-desk',
    label: '导演台',
    category: 'generate',
    hint: '关键帧批出 · 失败重试 · 角色/场景/风格锁 · 优先3D · 可送视频生成',
    glyph: 'Clapperboard',
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
    kind: 'chat-model',
    label: '对话模型',
    category: 'generate',
    hint: 'LLM 流式对话',
    glyph: 'Brain',
    accent: '#A13D63',
  },

  // ── 创作主路径 ──
  {
    kind: 'dialogue-sheet',
    label: '剧本拆分',
    category: 'craft',
    hint: '小说/剧本 → 集 · 镜 · 角色 · 场景',
    glyph: 'MessageSquareText',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'asset-gate',
    label: '设定检查',
    category: 'craft',
    hint: '新角色/场景入库门禁',
    glyph: 'GitBranch',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'character-sheet',
    label: '角色设定',
    category: 'craft',
    hint: '档案 · 设定图 · 三视图',
    glyph: 'UserSquare2',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'scene-card',
    label: '场景设定',
    category: 'craft',
    hint: '场景约束与参考',
    glyph: 'MapPin',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'storyboard-desk',
    label: '分镜台',
    category: 'craft',
    hint: '分镜表 + 关键帧预览出图',
    glyph: 'Clapperboard',
    accent: '#A13D63',
    nx9Native: true,
  },
  {
    kind: 'reference-board',
    label: '参考板',
    category: 'craft',
    hint: 'Mood board + 风格约束',
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
    kind: 'prompt-studio',
    label: 'Prompt 工作室',
    category: 'craft',
    hint: '电影感 / 运镜 / 角度 / 肖像 / 姿势',
    glyph: 'Sparkles',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'style-lab',
    label: '风格实验室',
    category: 'craft',
    hint: '艺术家风格 + 标签',
    glyph: 'Palette',
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
  },

  // ── 空间 ──
  {
    kind: 'director-3d',
    label: '3D 导演台',
    category: 'spatial',
    hint: '摆位 · 机位 · 灯光 · 截图写回',
    glyph: 'Box',
    accent: '#C4A574',
    nx9Native: true,
  },

  // ── 后期 / 交付 ──
  {
    kind: 'caption-asr',
    label: '字幕台',
    category: 'utility',
    hint: '语音转字幕 · 字幕烧录',
    glyph: 'Subtitles',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'local-enhance',
    label: '图像增强',
    category: 'utility',
    hint: '高清 · 放大 · 去水印 · 预处理',
    glyph: 'ZoomIn',
    accent: '#D97706',
    nx9Native: true,
  },
  {
    kind: 'bg-remove',
    label: '抠图',
    category: 'utility',
    hint: '背景移除',
    glyph: 'Eraser',
    accent: '#D97706',
  },
  {
    kind: 'frame-endpoints',
    label: '首尾帧',
    category: 'utility',
    hint: '视频首/尾帧提取',
    glyph: 'Film',
    accent: '#D97706',
  },
  {
    kind: 'grid-split',
    label: '宫格切分',
    category: 'utility',
    hint: '网格切图',
    glyph: 'Grid3x3',
    accent: '#D97706',
  },
  {
    kind: 'grid-compose',
    label: '宫格编辑',
    category: 'utility',
    hint: '宫格拼接',
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
  },
  {
    kind: 'text-chunker',
    label: '文本切分',
    category: 'utility',
    hint: '长文本分段',
    glyph: 'SplitSquareVertical',
    accent: '#D97706',
  },
  {
    kind: 'export-pack',
    label: '交付打包',
    category: 'utility',
    hint: '成片 / 静帧 / 音频导出',
    glyph: 'PackageOpen',
    accent: '#D97706',
    nx9Native: true,
  },

  // ── 流程 ──
  {
    kind: 'review-gate',
    label: '审阅关卡',
    category: 'support',
    hint: '批审通过后放行下游',
    glyph: 'ShieldCheck',
    accent: '#222222',
    nx9Native: true,
  },
  {
    kind: 'memo',
    label: '备忘',
    category: 'support',
    hint: '注释与灵感',
    glyph: 'Lightbulb',
    accent: '#222222',
  },
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

export function lookupBlock(kind: string): BlockDefinition | undefined {
  return BLOCK_CATALOG.find((b) => b.kind === kind);
}
