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

function edge(
  source: string,
  target: string,
  handles?: { sourceHandle?: string; targetHandle?: string },
): FlowLink {
  return {
    id: uid('e'),
    source,
    target,
    sourceHandle: handles?.sourceHandle,
    targetHandle: handles?.targetHandle,
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'tpl-nx9-character-pipeline',
    label: '角色设定 → 出图',
    description: '角色设定 → 提示词 → 图像生成 → 预览（F-013 更新）',
    category: 'story',
    build() {
      const a = node('script-desk', 0, 0, { playbookStepId: 'script-desk' });
      const b = node('picture-gen', 1, 0);
      const c = node('asset-import', 2, 0);
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
      };
    },
  },
  {
    id: 'tpl-text-to-picture',
    label: '文生图',
    description: '提示词 → 图像生成 → 结果预览',
    category: 'image',
    build() {
      const a = node('picture-gen', 0, 0, { content: 'cinematic portrait, soft lighting' });
      const b = node('picture-gen', 1, 0);
      const c = node('asset-import', 2, 0);
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
      const b = node('picture-gen', 0, 1, { studioTab: 'camera', selectedPresetIds: ['cam-dolly-in'] });
      const c = node('clip-gen', 1, 0);
      const d = node('asset-import', 2, 0);
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
      const a = node('picture-gen', 0, 0, { studioTab: 'cinema' });
      const b = node('storyboard-desk', 1, 0, { rows: 3, cols: 3 });
      const c = node('grid-compose', 2, 0, { gridMode: 'split', rows: 3, cols: 3 });
      const d = node('asset-import', 3, 0);
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
      const a = node('reference-board', 0, 0, { styleLabTab: 'style' });
      const b = node('picture-gen', 1, 0, { studioTab: 'angle' });
      const c = node('picture-gen', 2, 0);
      const d = node('grid-compose', 3, 0, { gridMode: 'compose', direction: 'horizontal' });
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
      const b = node('picture-gen', 1, 0, { rows: 3, cols: 3 });
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
    description: '参考板 + 角色 → 图像生成 + 连贯性检查（F-035 更新）',
    category: 'story',
    build() {
      const a = node('reference-board', 0, 0);
      const b = node('script-desk', 0, 1, {});
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
      const b = node('caption-asr', 1, 0, { captionMode: 'burn' });
      const c = node('clip-editor', 2, 0, { editorMode: 'grade' });
      const d = node('asset-import', 3, 0);
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
      const a = node('director-desk', 0, 0, { directorMode: 'blocking' });
      const b = node('director-desk', 1, 0, { directorMode: 'light' });
      const c = node('director-desk', 2, 0, { directorMode: 'depth' });
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
    description: '分镜台 → Seedance 连续镜头 → 导演台审阅 → 交付  (F-035 更新)',
    category: 'story',
    build() {
      const a = node('storyboard-desk', 0, 0);
      const b = node('clip-gen', 1, 0, { videoMode: 'seedance', model: 'seedance' });
      const c = node('director-desk', 2, 0, { queueFilter: 'all' });
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
    description: '视频 → 智能剪辑 → 交付打包（竖屏 9:16 流程）',
    category: 'video',
    build() {
      const a = node('clip-gen', 0, 0);
      const b = node('clip-editor', 1, 0, { profile: 'drama' });
      const c = node('export-pack', 2, 0, {});
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
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
    description: '对白表 → 多角色配音 → 智能剪辑（含 VO 音轨） → 导出交付',
    category: 'story',
    build() {
      const a = node('script-desk', 0, 0);
      const b = node('sound-gen', 1, 0);
      const c = node('clip-editor', 2, 0, { profile: 'voice-drama' });
      const d = node('export-pack', 3, 0, {});
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
    id: 'tpl-ecom-image',
    label: '电商生图',
    description: '商品素材 → 图像生成 → 导出',
    category: 'image',
    build() {
      const a = node('asset-import', 0, 0, {
        mediaKind: 'picture',
        playbookStepId: 'product-assets',
        playbookStepIndex: 1,
      });
      const b = node('picture-gen', 1, 0, {
        aspectRatio: '1:1',
        content:
          '电商主图，干净白底，柔和棚拍光，高清商品细节，突出材质与卖点，商业广告质感',
        // 短流程走左右数据口，不露底侧能力口（能力口专供分镜台竖直挂载）
        showExecPorts: false,
        playbookStepId: 'ecom-picture',
        playbookStepIndex: 2,
      });
      const c = node('export-pack', 2, 0, {
        playbookStepId: 'export',
        playbookStepIndex: 3,
      });
      return {
        blocks: [a, b, c],
        links: [
          // 左右数据口：避免挂到 picture-gen 底侧 exec-picture 能力口
          edge(a.id, b.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
        ],
      };
    },
  },
  {
    id: 'tpl-ecom-video',
    label: '电商生视频',
    description: '商品素材 → 图生视频/口播 → 智能剪辑 → 导出',
    category: 'video',
    build() {
      const a = node('asset-import', 0, 0, {
        mediaKind: 'picture',
        playbookStepId: 'product-assets',
        playbookStepIndex: 1,
      });
      const b = node('picture-gen', 0, 1, {
        aspectRatio: '9:16',
        content: '竖屏电商主视觉，干净背景，商品居中，突出卖点',
        showExecPorts: false,
        playbookStepId: 'product-assets',
        playbookStepIndex: 1,
      });
      const c = node('clip-gen', 1, 0, {
        videoMode: 'single',
        content: '商品旋转展示，突出卖点细节，电商带货短视频节奏',
        playbookStepId: 'ecom-video',
        playbookStepIndex: 2,
      });
      const d = node('clip-editor', 2, 0, {
        playbookStepId: 'smart-edit',
        playbookStepIndex: 3,
      });
      const e = node('export-pack', 3, 0, {
        playbookStepId: 'export',
        playbookStepIndex: 4,
      });
      return {
        blocks: [a, b, c, d, e],
        links: [
          edge(a.id, c.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(c.id, d.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
          edge(d.id, e.id, { sourceHandle: 'clip', targetHandle: 'prompt' }),
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
      const b = node('clip-gen', 1, 0, { videoMode: 'bridge' });
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
      const a = node('export-pack', 0, 0);
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
      '编剧台 → 分镜台（挂图像生成）→ 导演台批出与审阅 → 视频生成 → 智能剪辑 → 导出交付',
    category: 'story',
    build() {
      const script = node('script-desk', 0, 2, {
        playbookStepId: 'script-desk',
        playbookStepIndex: 1,
      });
      // F-005: asset-gate 已删除，编剧台直接连分镜台
      const desk = node('storyboard-desk', 2, 2, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 2,
        showExecPorts: true,
      });
      const picture = node('picture-gen', 2, 0, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 2,
        showExecPorts: true,
      });
      // 3D 已并入导演台，主链只保留一个导演台节点
      const directorDesk = node('director-desk', 4, 2, {
        playbookStepId: 'director-desk',
        playbookStepIndex: 3,
        queueFilter: 'missing',
        autoOpenReview: true,
        syncStyleToPicture: true,
        studioTab: 'deliver',
        showExecPorts: false,
      });
      const video = node('clip-gen', 5.5, 2, {
        playbookStepId: 'video-gen',
        playbookStepIndex: 4,
        videoMode: 'single',
        showExecPorts: false,
      });
      const editor = node('clip-editor', 7, 2, {
        playbookStepId: 'smart-edit',
        playbookStepIndex: 5,
        profile: 'drama',
        showExecPorts: false,
      });
      const pack = node('export-pack', 8.5, 2, {
        playbookStepId: 'export',
        playbookStepIndex: 6,
        exportMode: 'ffmpeg-episode',
      });
      return {
        blocks: [
          script,
          desk,
          picture,
          directorDesk,
          video,
          editor,
          pack,
        ],
        links: [
          // F-006: 数据边必须显式左右口；否则 RF 会落到先渲染的顶侧 exec-picture
          edge(script.id, desk.id, {
            sourceHandle: 'prompt',
            targetHandle: 'prompt',
          }),
          // 出图仅挂分镜台能力口；禁止直连导演台旁路
          edge(picture.id, desk.id, {
            sourceHandle: 'exec-picture',
            targetHandle: 'exec-picture',
          }),
          edge(desk.id, directorDesk.id, {
            sourceHandle: 'prompt',
            targetHandle: 'prompt',
          }),
          edge(directorDesk.id, video.id, {
            sourceHandle: 'picture',
            targetHandle: 'picture',
          }),
          edge(video.id, editor.id, {
            sourceHandle: 'clip',
            targetHandle: 'clip',
          }),
          edge(editor.id, pack.id, {
            sourceHandle: 'clip',
            targetHandle: 'clip',
          }),
        ],
      };
    },
  },
];
