import type { FlowBlock, FlowLink } from '../types/workspace';
import { BLOCK_KIND_MIGRATION_PATCHES, migrateBlockKind } from '../catalog/migrate-block-kinds';

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
  const migratedType = migrateBlockKind(type);
  const patch = BLOCK_KIND_MIGRATION_PATCHES[type] ?? {};
  return {
    id: uid(migratedType),
    type: migratedType,
    position: { x: BX + col * DX, y: BY + row * DY },
    data: {
      blockIndex: col + row + 1,
      status: 'idle',
      ...patch,
      ...data,
      ...(migratedType !== type ? { migratedFrom: type } : {}),
    },
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
      const b = node('storyboard-desk', 1, 0, { rows: 3, cols: 3 });
      const c = node('grid-split', 2, 0, { rows: 3, cols: 3 });
      const d = node('preview-sink', 3, 0);
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
      const a = node('storyboard-desk', 0, 0);
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
    description: '素材图 → 口播视频（clip-gen · photo-speak 模式）',
    category: 'video',
    build() {
      const a = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const b = node('clip-gen', 1, 0, {
        videoMode: 'photo-speak',
        content: '大家好，欢迎来到我的频道…',
      });
      const c = node('export-pack', 2, 0);
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
      };
    },
  },
  {
    id: 'tpl-shot-script-desk',
    label: '镜头脚本 → 分镜台',
    description: '分镜台 → 视频生成 → 交付打包',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0);
      const b = node('clip-gen', 1, 0);
      const c = node('export-pack', 2, 0);
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
      };
    },
  },
  {
    id: 'tpl-nx9-review-pipeline',
    label: '分镜 → 导演批审 → 交付',
    description: '分镜台 → 导演台（审阅送出）→ 交付打包',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0);
      const b = node('director-desk', 1, 0, { studioTab: 'deliver', queueFilter: 'missing' });
      const c = node('export-pack', 2, 0);
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
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
    description: '迭代器 → 图像生成 → 交付',
    category: 'tool',
    build() {
      const a = node('iterator', 0, 0);
      const b = node('picture-gen', 1, 0);
      const c = node('export-pack', 2, 0);
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
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
      const a = node('director-desk', 0, 0);
      const b = node('light-rig', 1, 0);
      const c = node('depth-pass', 2, 0);
      const d = node('picture-gen', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-sclass-seedance',
    label: 'S-Class Seedance 连续镜头',
    description: '分镜台 → Seedance 连续镜头 → 审阅 → 交付',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0);
      const b = node('clip-gen', 1, 0, { sclassEnabled: true, videoMode: 'chain', model: 'seedance' });
      const c = node('review-gate', 2, 0);
      const d = node('export-pack', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-novel-import',
    label: '小说拆镜 → 开拍',
    description: '剧本拆分 → 分镜台 → 开拍准备',
    category: 'story',
    build() {
      const a = node('script-desk', 0, 0);
      const b = node('storyboard-desk', 1, 0);
      return {
        blocks: [a, b],
        links: [edge(a.id, b.id)],
      };
    },
  },
  {
    id: 'tpl-vertical-episode',
    label: '竖屏单集合成',
    description: '视频 → 剪辑拼接 → 混音 → 交付打包（竖屏 9:16 流程）',
    category: 'video',
    build() {
      const a = node('clip-gen', 0, 0);
      const b = node('clip-editor', 1, 0, {});
      const c = node('audio-mix', 2, 0, {});
      const d = node('export-pack', 3, 0, {});
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-contact-sheet',
    label: '宫格联系板',
    description: '分镜台 → 宫格 → 连贯性检查',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0, { rows: 3, cols: 3 });
      const b = node('grid-compose', 1, 0, { gridMode: 'split' });
      const c = node('continuity-check', 2, 0, {});
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
      };
    },
  },
  {
    id: 'tpl-voice-drama',
    label: '声音剧',
    description: '对白表 → 多角色配音 → 混音 → 剪辑（完整声音后期链）',
    category: 'story',
    build() {
      const a = node('script-desk', 0, 0);
      const b = node('sound-gen', 1, 0);
      const c = node('audio-mix', 2, 0);
      const d = node('clip-editor', 3, 0);
      return { blocks: [a, b, c, d], links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)] };
    },
  },
  {
    id: 'tpl-link-replicate',
    label: '爆款复刻（链接采集 → 参考 → 生成）',
    description: '链接解析素材 → 参考板约束 → 图/视生成 → 导出',
    category: 'video',
    build() {
      const a = node('link-parser', 0, 0, { url: '', hint: '' });
      const b = node('reference-board', 1, 0);
      const c = node('picture-gen', 2, 0);
      const d = node('clip-gen', 3, 0);
      const e = node('export-pack', 4, 0);
      return {
        blocks: [a, b, c, d, e],
        links: [
          edge(a.id, b.id),
          edge(b.id, c.id),
          edge(c.id, d.id),
          edge(d.id, e.id),
        ],
      };
    },
  },
  {
    id: 'tpl-bridge-sequence',
    label: 'Bridge 镜头序列',
    description: 'Clip → Bridge 续拍 → Clip → 导演台批审',
    category: 'video',
    build() {
      const a = node('clip-gen', 0, 0);
      const b = node('bridge-clip', 1, 0);
      const c = node('clip-gen', 2, 0);
      const d = node('director-desk', 3, 0, { studioTab: 'deliver' });
      return { blocks: [a, b, c, d], links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)] };
    },
  },
  {
    id: 'tpl-cover-export',
    label: '封面导出',
    description: '封面制作 → 交付打包（单图封面 + manifest）',
    category: 'image',
    build() {
      const a = node('thumbnail-maker', 0, 0);
      const b = node('export-pack', 1, 0);
      return { blocks: [a, b], links: [edge(a.id, b.id)] };
    },
  },
  {
    id: 'tpl-toonflow-lite',
    label: 'AI 编剧流水线',
    description: '剧本拆分 → 分镜台 → 宫格 → 导演台',
    category: 'story',
    build() {
      const a = node('script-desk', 0, 0);
      const b = node('storyboard-desk', 1, 0, { rows: 3, cols: 3, style: 'line-art' });
      const c = node('grid-compose', 2, 0, { rows: 3, cols: 3, gridMode: 'split' });
      const d = node('director-desk', 3, 0, { studioTab: 'deliver' });
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-line-art-storyboard',
    label: '线稿分镜',
    description: '分镜台 → 宫格 → 导演台',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0, { rows: 3, cols: 3, style: 'line-art' });
      const b = node('grid-compose', 1, 0, { rows: 3, cols: 3, gridMode: 'split' });
      const c = node('director-desk', 2, 0, { studioTab: 'deliver' });
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
      };
    },
  },
  {
    id: 'tpl-3d-preview',
    label: '3D 导演预演',
    description: '分镜台 → 导演台 → 出图',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0);
      const b = node('director-desk', 1, 0);
      const d = node('picture-gen', 2, 0);
      return {
        blocks: [a, b, d],
        links: [edge(a.id, b.id), edge(b.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-core-episode',
    label: '核心成片流水线',
    description:
      '剧本拆分 → 设定检查 → 分镜台（图像生成 + 3D）→ 导演台批出与审阅 → 视频生成 → 导出',
    category: 'story',
    build() {
      const script = node('script-desk', 0, 2, {
        playbookStepId: 'script-breakdown',
        playbookStepIndex: 1,
      });
      const gate = node('asset-gate', 1, 2, {
        playbookStepId: 'story-grid',
        playbookStepIndex: 2,
      });
      const desk = node('storyboard-desk', 2.5, 2, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 3,
      });
      const picture = node('picture-gen', 2, 0, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 3,
      });
      const director3d = node('director-desk', 3, 0, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 3,
      });
      const directorDesk = node('director-desk', 3.5, 2, {
        playbookStepId: 'keyframe-review',
        playbookStepIndex: 4,
        queueFilter: 'missing',
        autoOpenReview: true,
        syncStyleToPicture: true,
        studioTab: 'deliver',
      });
      const video = node('clip-gen', 5.5, 2, {
        playbookStepId: 'video-gen',
        playbookStepIndex: 5,
        videoMode: 'single',
      });
      const pack = node('export-pack', 6.5, 2, {
        playbookStepId: 'export',
        playbookStepIndex: 6,
        exportMode: 'ffmpeg-episode',
      });
      return {
        blocks: [
          script,
          gate,
          desk,
          picture,
          director3d,
          directorDesk,
          video,
          pack,
        ],
        links: [
          {
            ...edge(script.id, gate.id),
            targetHandle: 'asset-gate',
          },
          {
            ...edge(gate.id, desk.id),
            sourceHandle: 'asset-gate',
          },
          {
            ...edge(picture.id, desk.id),
            sourceHandle: 'exec-picture',
            targetHandle: 'exec-picture',
          },
          {
            ...edge(director3d.id, desk.id),
            sourceHandle: 'exec-picture',
            targetHandle: 'exec-picture',
          },
          edge(picture.id, directorDesk.id),
          edge(desk.id, directorDesk.id),
          edge(directorDesk.id, video.id),
          edge(video.id, pack.id),
        ],
      };
    },
  },
];
