import type { FlowBlock, FlowLink } from '../types/workspace';

export type WorkflowTemplateStatus = 'ga' | 'beta' | 'deprecated';

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  category: 'video' | 'image' | 'story' | 'tool';
  /** ga=启动器默认；beta=可用但实验；deprecated=隐藏于启动器（历史 id 仍可按 id 加载） */
  status: WorkflowTemplateStatus;
  build: () => { blocks: FlowBlock[]; links: FlowLink[] };
}

/** 启动器 / 命令面板 / 模板面板只展示非 deprecated */
export function isWorkflowTemplateListed(tpl: Pick<WorkflowTemplate, 'status'>): boolean {
  return tpl.status !== 'deprecated';
}

export function listWorkflowTemplates(includeDeprecated = false): WorkflowTemplate[] {
  if (includeDeprecated) return WORKFLOW_TEMPLATES;
  return WORKFLOW_TEMPLATES.filter(isWorkflowTemplateListed);
}

const DX = 300;
/** 行距必须大于最高节点卡（图像生成带预览区约 300px），否则同列相邻节点互相遮挡 */
const DY = 420;
const BX = 100;
const BY = 100;

function uid(seed: string) {
  return `${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 模板节点必须直接写活跃 kind；禁止经 migrate 垫片静默改写（F-013） */
function node(type: string, col: number, row: number, data: Record<string, unknown> = {}): FlowBlock {
  return {
    id: uid(type),
    type,
    position: { x: BX + col * DX, y: BY + row * DY },
    data: {
      blockIndex: col + row + 1,
      status: 'idle',
      ...data,
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
    description: '编剧台角色设定 → 图像生成 → 素材预览',
    category: 'story',
    status: 'ga',
    build() {
      const a = node('script-desk', 0, 0, { playbookStepId: 'script-desk' });
      const b = node('picture-gen', 1, 0);
      // 结果预览位：asset-import 不接任何口型（accepts=[]），改用活跃 kind 画布钉板承接出图
      const c = node('media-pin', 2, 0, { pinKind: 'picture' });
      return {
        blocks: [a, b, c],
        links: [
          edge(a.id, b.id),
          edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
        ],
      };
    },
  },
  {
    id: 'tpl-text-to-picture',
    label: '文生图',
    description: '提示词 → 图像生成 → 结果预览',
    category: 'image',
    status: 'ga',
    build() {
      const a = node('picture-gen', 0, 0, { content: 'cinematic portrait, soft lighting' });
      const b = node('picture-gen', 1, 0);
      const c = node('media-pin', 2, 0, { pinKind: 'picture' });
      return {
        blocks: [a, b, c],
        // F-013 把原「提示词」节点并入 picture-gen 后 a→b 成为同 kind 非法边，
        // 提示词已随 content 落在 a 上，此处只保留「出图 → 结果预览」主干
        links: [edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'picture' })],
      };
    },
  },
  {
    id: 'tpl-image-to-clip',
    label: '图生视频',
    description: '参考图 + 运镜提示 → 视频生成',
    category: 'video',
    status: 'ga',
    build() {
      const a = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const b = node('picture-gen', 0, 1, { studioTab: 'camera', selectedPresetIds: ['cam-dolly-in'] });
      const c = node('clip-gen', 1, 0);
      // 结果预览位：asset-import 不接任何口型（accepts=[]），改用活跃 kind 画布钉板承接成片
      const d = node('media-pin', 2, 0, { pinKind: 'clip' });
      return {
        blocks: [a, b, c, d],
        links: [
          edge(a.id, c.id),
          edge(b.id, c.id),
          edge(c.id, d.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
        ],
      };
    },
  },
  {
    id: 'tpl-storyboard-grid',
    label: '分镜九宫格',
    description: '电影感 + 分镜网格 → 切分 → 预览',
    category: 'story',
    status: 'ga',
    build() {
      const a = node('picture-gen', 0, 0, { studioTab: 'cinema' });
      const b = node('storyboard-desk', 1, 0, { rows: 3, cols: 3 });
      const c = node('grid-compose', 2, 0, { gridMode: 'split', rows: 3, cols: 3 });
      // 结果预览位：asset-import 不接任何口型（accepts=[]），改用活跃 kind 画布钉板承接切分结果
      const d = node('media-pin', 3, 0, { pinKind: 'picture' });
      return {
        blocks: [a, b, c, d],
        links: [
          edge(a.id, b.id),
          edge(b.id, c.id),
          edge(c.id, d.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
        ],
      };
    },
  },
  {
    id: 'tpl-character-turnaround',
    label: '角色三视图',
    description: '参考板风格约束 + 多角度提示 → 批量出图 → 横向拼合',
    category: 'story',
    status: 'ga',
    build() {
      const a = node('reference-board', 0, 0, { styleLabTab: 'style' });
      const b = node('picture-gen', 1, 0, { studioTab: 'angle' });
      const c = node('picture-gen', 2, 0);
      const d = node('grid-compose', 3, 0, { gridMode: 'compose', direction: 'horizontal' });
      return {
        blocks: [a, b, c, d],
        // F-013 把原「多角度提示」节点并入 picture-gen 后 b→c 成为同 kind 非法边；
        // b 保留自身配置作为独立出图节点，参考板 → 出图 → 拼合主干不变
        links: [edge(a.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-grid-vision',
    label: '宫格三层反推',
    description: '分镜台 → 宫格反推提示 → 视频生成',
    category: 'story',
    status: 'beta',
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
    status: 'ga',
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
    status: 'ga',
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
    status: 'ga',
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
    description: '参考板 + 角色设定 → 图像生成 → 连贯性检查',
    category: 'story',
    status: 'ga',
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
    status: 'ga',
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
    description: '视频剪辑 → 字幕台烧录 → 调色预览 → 素材预览',
    category: 'tool',
    status: 'ga',
    build() {
      const a = node('clip-editor', 0, 0);
      const b = node('caption-asr', 1, 0, { captionMode: 'burn' });
      const c = node('clip-editor', 2, 0, { editorMode: 'grade' });
      // 结果预览位：asset-import 不接任何口型（accepts=[]），改用活跃 kind 画布钉板承接调色结果
      const d = node('media-pin', 3, 0, { pinKind: 'clip' });
      return {
        blocks: [a, b, c, d],
        links: [
          edge(a.id, b.id),
          edge(b.id, c.id),
          edge(c.id, d.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
        ],
      };
    },
  },
  {
    id: 'tpl-spatial-pipeline',
    label: '空间生产链',
    description: '导演台场面调度 → 灯光 → 深度 → 生图',
    category: 'tool',
    status: 'beta',
    build() {
      const a = node('director-desk', 0, 0, { directorMode: 'blocking' });
      const b = node('director-desk', 1, 0, { directorMode: 'light' });
      const c = node('director-desk', 2, 0, { directorMode: 'depth' });
      const d = node('picture-gen', 3, 0);
      return {
        blocks: [a, b, c, d],
        // 原 light-rig / depth-pass 已被 F-013 并入导演台，三台同 kind 无法相连；
        // 三个导演台（场面调度 / 灯光 / 深度）各自保留模式配置，仅深度 → 生图 可连
        links: [edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-sclass-seedance',
    label: 'Seedance 参考生成（Beta）',
    description:
      '分镜台 → 视频生成（model=seedance，需参考图/视频，非独立 videoMode）→ 导演台审阅 → 交付',
    category: 'story',
    status: 'beta',
    build() {
      const a = node('storyboard-desk', 0, 0);
      const b = node('clip-gen', 1, 0, {
        videoMode: 'single',
        videoGenMode: 'omni-ref',
        model: 'seedance',
      });
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
    status: 'ga',
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
    status: 'ga',
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
    status: 'ga',
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
    status: 'ga',
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
    status: 'ga',
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
    status: 'ga',
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
    status: 'ga',
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
    label: 'Bridge 续拍序列（Beta）',
    description: '单镜出片 → Bridge 续拍（需上游视频尾帧）→ 再单镜 → 导演台批审',
    category: 'video',
    status: 'beta',
    build() {
      const a = node('clip-gen', 0, 0, { videoMode: 'single' });
      const b = node('clip-gen', 1, 0, { videoMode: 'bridge', videoGenMode: 'bridge' });
      const c = node('clip-gen', 2, 0, { videoMode: 'single' });
      const d = node('director-desk', 3, 0, { studioTab: 'deliver' });
      return {
        blocks: [a, b, c, d],
        // 原 bridge-clip 已被 F-013 并入 clip-gen（videoMode=bridge），三段视频生成同 kind 无法相连；
        // 单镜 / 续拍 / 再单镜 三段保留各自配置，仅 再单镜 → 导演台批审 可连
        links: [edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-cover-export',
    label: '封面导出',
    description: '封面制作 → 交付打包（单图封面 + manifest）',
    category: 'image',
    status: 'deprecated',
    build() {
      const a = node('export-pack', 0, 0);
      const b = node('export-pack', 1, 0);
      // 原 thumbnail-maker（封面制作）已被 F-013 并入 export-pack，两段交付打包同 kind 无法相连；
      // 保留两个节点作为封面 / 成片两条独立交付位，不再硬凑连线
      return { blocks: [a, b], links: [] };
    },
  },
  {
    id: 'tpl-toonflow-lite',
    label: 'AI 编剧流水线',
    description: '剧本拆分 → 分镜台 → 宫格 → 导演台',
    category: 'story',
    status: 'ga',
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
    label: '线稿分镜（Beta）',
    description: '分镜台线稿风格批量 → 宫格联系板 → 导演台（线稿由分镜台 line-art 批次产出）',
    category: 'story',
    status: 'beta',
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
    status: 'ga',
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
    status: 'ga',
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
  {
    id: 'tpl-ai-short-film',
    label: 'AI 短片（有声成片）',
    description:
      '编剧台 → 分镜台（挂图像生成）→ 导演台 → 视频 → 声音（对白/BGM）→ 智能剪辑 → 导出',
    category: 'story',
    status: 'ga',
    build() {
      const script = node('script-desk', 0, 2, {
        playbookStepId: 'script-desk',
        playbookStepIndex: 1,
      });
      const desk = node('storyboard-desk', 2, 2, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 2,
        showExecPorts: true,
      });
      // SF-10: 图像生成放在分镜台上方一列，拉开行距避免压住镜台
      const picture = node('picture-gen', 2, 0, {
        playbookStepId: 'storyboard-desk',
        playbookStepIndex: 2,
        showExecPorts: true,
      });
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
      // SF-02 / SF-18: 对白 cast + BGM 双节点，一次模板即可两轨进剪辑
      const soundCast = node('sound-gen', 5.5, 4, {
        playbookStepId: 'sound-gen',
        playbookStepIndex: 5,
        soundMode: 'cast',
        showExecPorts: false,
      });
      const soundBgm = node('sound-gen', 7, 4, {
        playbookStepId: 'sound-gen',
        playbookStepIndex: 5,
        soundMode: 'music',
        showExecPorts: false,
      });
      // SF-19: 可选音效节点（导入挂轨）
      const soundSfx = node('sound-gen', 5.5, 5.5, {
        playbookStepId: 'sound-gen',
        playbookStepIndex: 5,
        soundMode: 'sfx',
        showExecPorts: false,
      });
      const editor = node('clip-editor', 8.5, 2, {
        playbookStepId: 'smart-edit',
        playbookStepIndex: 6,
        profile: 'drama',
        showExecPorts: false,
      });
      // SF-14: 默认 Remotion 多轨成片（吃时间线 VO/BGM/字幕），不用会丢音轨的 ffmpeg-episode
      const pack = node('export-pack', 10.5, 2, {
        playbookStepId: 'export',
        playbookStepIndex: 7,
        exportMode: 'remotion-episode',
      });
      return {
        blocks: [script, desk, picture, directorDesk, video, soundCast, soundBgm, soundSfx, editor, pack],
        links: [
          edge(script.id, desk.id, { sourceHandle: 'prompt', targetHandle: 'prompt' }),
          edge(picture.id, desk.id, {
            sourceHandle: 'exec-picture',
            targetHandle: 'exec-picture',
          }),
          edge(desk.id, directorDesk.id, { sourceHandle: 'prompt', targetHandle: 'prompt' }),
          edge(directorDesk.id, video.id, {
            sourceHandle: 'picture',
            targetHandle: 'picture',
          }),
          edge(desk.id, soundCast.id, { sourceHandle: 'prompt', targetHandle: 'prompt' }),
          edge(video.id, editor.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
          edge(soundCast.id, editor.id, { sourceHandle: 'sound', targetHandle: 'sound' }),
          edge(soundBgm.id, editor.id, { sourceHandle: 'sound', targetHandle: 'sound' }),
          edge(soundSfx.id, editor.id, { sourceHandle: 'sound', targetHandle: 'sound' }),
          edge(editor.id, pack.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
        ],
      };
    },
  },

  /* ──────────────────────────────────────────────────────────────────────────
   * 增量追加：多格推演（multi-grid）· 角色设定表（character-sheet-desk）·
   * BGM 节拍运镜。以上能力见 docs/NX9-MULTI-GRID-DEDUCTION.md /
   * docs/NX9-CHARACTER-SHEET.md / docs/NX9-CAMERA-MOVE-TIMELINE.md /
   * docs/NX9-BEAT-GRID-IMPORT.md，入口索引见
   * docs/NX9-NEW-CAPABILITY-ENTRYPOINTS.md。
   * 既有 28 条模板原样保留（只做追加）。
   * ────────────────────────────────────────────────────────────────────────── */

  {
    id: 'tpl-multigrid-multicam',
    label: '多机位推演（9 宫格）',
    description:
      '关键帧 → 多格推演（3 方位 × 3 景别）→ 逐格图交视频生成，或拼成宫格联系板；模式可在工作区切到 25 宫格',
    category: 'video',
    status: 'ga',
    build() {
      const a = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const b = node('multi-grid', 1, 0, {
        multiGridMode: 'multi-cam-9',
        multiGridRows: 3,
        multiGridCols: 3,
        aspectRatio: '16:9',
      });
      const c = node('clip-gen', 2, 0, { videoMode: 'single' });
      const d = node('grid-compose', 2, 1, { gridMode: 'split', rows: 3, cols: 3 });
      return {
        blocks: [a, b, c, d],
        links: [
          // 源图走左右数据口，避免落到多格推演的上下能力口
          edge(a.id, b.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
          // 多格推演只发图片，视频生成吃 image → prompt 主口
          edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(b.id, d.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
        ],
      };
    },
  },
  {
    id: 'tpl-multigrid-story',
    label: '剧情推演四宫格',
    description:
      '分镜关键帧 + 剧情方向 → 多格推演四宫格（起因 / 冲突 / 转折 / 收束）→ 视频生成 → 交付打包',
    category: 'story',
    status: 'ga',
    build() {
      const a = node('storyboard-desk', 0, 0, { rows: 3, cols: 3 });
      const b = node('multi-grid', 1, 0, {
        multiGridMode: 'story-predict-4',
        aspectRatio: '16:9',
        // 节点文本即剧情方向：留空时由上游剧本 / 分镜文本自然驱动四宫格节拍
        storyDirection: '主角在雨夜追查线索，中途被旧识截停',
      });
      const c = node('clip-gen', 2, 0, { videoMode: 'single' });
      const d = node('export-pack', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [
          edge(a.id, b.id, { sourceHandle: 'prompt', targetHandle: 'prompt' }),
          edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(c.id, d.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
        ],
      };
    },
  },
  {
    id: 'tpl-multigrid-frame',
    label: '画面推演（N 秒前 / M 秒后）',
    description:
      '当前帧 → 多格推演画面推演（前置 / 当前 / 后续时间格，前后格互为收尾帧）→ 视频生成 → 交付打包',
    category: 'video',
    status: 'beta',
    build() {
      const a = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const b = node('multi-grid', 1, 0, {
        multiGridMode: 'frame-predict',
        aspectRatio: '16:9',
        frameBeforeSec: 5,
        frameAfterSec: 3,
        frameMotion: '主体向画面右侧走出，镜头缓慢跟随',
      });
      const c = node('clip-gen', 2, 0, { videoMode: 'single' });
      const d = node('export-pack', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [
          edge(a.id, b.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
          edge(b.id, c.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(c.id, d.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
        ],
      };
    },
  },
  {
    id: 'tpl-character-sheet-desk',
    label: '角色设定表（三视图 / 表情 / 动作）',
    description:
      '角色参考图 + 风格约束 → 角色设定表（默认整套版面，可切三视图 / 表情表 / 动作表）→ 宫格拼合 → 交付打包',
    category: 'story',
    status: 'ga',
    build() {
      const ref = node('asset-import', 0, 0, { mediaKind: 'picture' });
      const board = node('reference-board', 0, 1, { styleLabTab: 'style' });
      const sheet = node('character-sheet-desk', 1, 0, {
        characterSheetKind: 'full',
        // 严格档 = 最贴参考图（图生图强度 0.58），角色一致性优先
        consistency: 'strict',
        aspectRatio: '3:4',
      });
      const grid = node('grid-compose', 2, 0, { gridMode: 'compose', direction: 'vertical' });
      const pack = node('export-pack', 3, 0);
      return {
        blocks: [ref, board, sheet, grid, pack],
        links: [
          // 参考图优先：asset-import 先入边，会被解析为该节点的源参考图
          edge(ref.id, sheet.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
          edge(board.id, sheet.id, { sourceHandle: 'prompt', targetHandle: 'prompt' }),
          edge(sheet.id, grid.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
          edge(grid.id, pack.id, { sourceHandle: 'picture', targetHandle: 'picture' }),
        ],
      };
    },
  },
  {
    id: 'tpl-bgm-beat-camera',
    label: 'BGM 节拍运镜成片（Beta）',
    description:
      'BGM → 关键帧 + 视频生成（在视频工作区的运镜时间轴里用大师运镜库编排片段、从 BGM 分析真实节拍并逐段对齐）→ 智能剪辑 → 成片导出',
    category: 'video',
    status: 'beta',
    build() {
      // 运镜时间轴 / 大师运镜库 / BGM 节拍网格都是工作区能力（编辑器状态为会话级），
      // 不落节点字段；模板只负责把「BGM + 画面 + 剪辑 + 导出」这条链一次拉起。
      const bgm = node('sound-gen', 0, 0, {
        soundMode: 'music',
        content: '低鼓点电子配乐，120 BPM，节奏清晰，适合快切',
      });
      const keyframe = node('picture-gen', 0, 1, { studioTab: 'camera', aspectRatio: '16:9' });
      const video = node('clip-gen', 1, 0, {
        videoMode: 'single',
        content: '按运镜时间轴逐段推进：推近 → 环绕 → 拉远，段边界对齐 BGM 真实节拍',
      });
      const editor = node('clip-editor', 2, 0, { profile: 'drama' });
      const pack = node('export-pack', 3, 0, { exportMode: 'remotion-episode' });
      return {
        blocks: [bgm, keyframe, video, editor, pack],
        links: [
          edge(keyframe.id, video.id, { sourceHandle: 'picture', targetHandle: 'prompt' }),
          edge(video.id, editor.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
          edge(bgm.id, editor.id, { sourceHandle: 'sound', targetHandle: 'sound' }),
          edge(editor.id, pack.id, { sourceHandle: 'clip', targetHandle: 'clip' }),
        ],
      };
    },
  },
];
