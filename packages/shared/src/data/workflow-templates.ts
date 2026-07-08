import type { FlowBlock, FlowLink } from '../types/workspace';

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  category: 'video' | 'image' | 'story' | 'tool';
  build: () => { blocks: FlowBlock[]; links: FlowLink[] };
}

const DX = 300;
const DY = 120;
const BX = 100;
const BY = 100;

function uid(seed: string) {
  return `${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function node(type: string, col: number, row: number, data: Record<string, unknown> = {}): FlowBlock {
  return {
    id: uid(type),
    type,
    position: { x: BX + col * DX, y: BY + row * DY },
    data: { blockIndex: col + row + 1, status: 'idle', ...data },
  };
}

function edge(source: string, target: string): FlowLink {
  return { id: uid('e'), source, target };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'tpl-nx9-character-pipeline',
    label: '角色设定 → 出图',
    description: '角色设定 → 提示词 → 图像生成 → 预览（NX9 默认配方）',
    category: 'story',
    build() {
      const a = node('character-sheet', 0, 0, { characterName: '新角色' });
      const b = node('prompt', 1, 0);
      const c = node('picture-gen', 2, 0);
      const d = node('preview-sink', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-text-to-picture',
    label: '文生图',
    description: '提示词 → 图像生成 → 结果预览',
    category: 'image',
    build() {
      const a = node('prompt', 0, 0, { content: 'cinematic portrait, soft lighting' });
      const b = node('picture-gen', 1, 0);
      const c = node('preview-sink', 2, 0);
      return { blocks: [a, b, c], links: [edge(a.id, b.id), edge(b.id, c.id)] };
    },
  },
  {
    id: 'tpl-image-to-clip',
    label: '图生视频',
    description: '参考图 + 运镜提示 → 视频生成',
    category: 'video',
    build() {
      const a = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const b = node('prompt-studio', 0, 1, { studioTab: 'camera', selectedPresetIds: ['cam-dolly-in'] });
      const c = node('clip-gen', 1, 0);
      const d = node('preview-sink', 2, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, c.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-storyboard-grid',
    label: '分镜九宫格',
    description: '电影感 + 分镜网格 → 切分 → 预览',
    category: 'story',
    build() {
      const a = node('prompt-studio', 0, 0, { studioTab: 'cinema' });
      const b = node('story-grid', 1, 0, { rows: 3, cols: 3 });
      const c = node('grid-split', 2, 0, { rows: 3, cols: 3 });
      const d = node('preview-sink', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-link-replicate',
    label: '爆款复刻',
    description: '链接解析 → 分镜提示 → 视频生成（小云雀/LibTV 思路）',
    category: 'video',
    build() {
      const a = node('link-parser', 0, 0);
      const b = node('chat-model', 1, 0, {
        systemPrompt: '你是分镜导演，把解析结果扩写为英文视频 prompt，每条 1-2 句。',
      });
      const c = node('clip-gen', 2, 0);
      const d = node('clip-editor', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-character-turnaround',
    label: '角色三视图',
    description: '风格工坊 + 多角度 → 批量出图（LibTV 角色设定流）',
    category: 'story',
    build() {
      const a = node('style-lab', 0, 0, { styleLabTab: 'style' });
      const b = node('prompt-studio', 1, 0, { studioTab: 'angle' });
      const c = node('picture-gen', 2, 0);
      const d = node('picture-merge', 3, 0, { direction: 'horizontal' });
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, c.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-grid-vision',
    label: '宫格三层反推',
    description: '分镜网格 → 宫格反推 → 视频生成（moyin/LibTV）',
    category: 'story',
    build() {
      const a = node('story-grid', 0, 0);
      const b = node('grid-prompt-reverse', 1, 0, { rows: 3, cols: 3 });
      const c = node('clip-gen', 2, 0);
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
      };
    },
  },
  {
    id: 'tpl-photo-speak',
    label: '照片说话',
    description: '素材图 + 文案 → 口播视频（小云雀）',
    category: 'video',
    build() {
      const a = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const b = node('prompt', 0, 1, { content: '大家好，欢迎来到我的频道…' });
      const c = node('photo-speak', 1, 0);
      const d = node('preview-sink', 2, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, c.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-shot-script-desk',
    label: '镜头脚本 → 导演台',
    description: 'NX9 镜头脚本 → 导演台 → 动效分镜（§9.4）',
    category: 'story',
    build() {
      const a = node('shot-script', 0, 0);
      const b = node('director-desk', 1, 0);
      const c = node('motion-story', 2, 0);
      const d = node('export-pack', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-nx9-review-pipeline',
    label: '分镜 → 审阅 → 交付',
    description: '镜头脚本 → 导演台 → 审阅关卡 → 交付打包（NX9 审片流）',
    category: 'story',
    build() {
      const a = node('shot-script', 0, 0);
      const b = node('director-desk', 1, 0);
      const c = node('review-gate', 2, 0);
      const d = node('export-pack', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-reference-picture',
    label: '参考板生图',
    description: '参考板 + 角色设定 → 图像生成（§9.4）',
    category: 'story',
    build() {
      const a = node('reference-board', 0, 0);
      const b = node('character-sheet', 0, 1);
      const c = node('picture-gen', 1, 0);
      const d = node('continuity-check', 2, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, c.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-batch-pictures',
    label: '批量生图',
    description: '文本切分 → 迭代器 → 图像生成 → 预览',
    category: 'tool',
    build() {
      const a = node('text-chunker', 0, 0, { mode: 'paragraph' });
      const b = node('iterator', 1, 0);
      const c = node('picture-gen', 2, 0);
      const d = node('preview-sink', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-av-post',
    label: '音视频后期',
    description: '视频 → 字幕烧录 → 调色 → 预览',
    category: 'tool',
    build() {
      const a = node('clip-editor', 0, 0);
      const b = node('subtitle-burn', 1, 0);
      const c = node('color-grade', 2, 0);
      const d = node('preview-sink', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-spatial-pipeline',
    label: '空间生产链',
    description: '场面调度 → 灯光 → 深度通道 → 生图',
    category: 'tool',
    build() {
      const a = node('blocking-stage', 0, 0);
      const b = node('light-rig', 1, 0);
      const c = node('depth-pass', 2, 0);
      const d = node('picture-gen', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
];
