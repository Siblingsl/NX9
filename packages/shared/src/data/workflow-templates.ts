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
  {
    id: 'tpl-sclass-seedance',
    label: 'S-Class Seedance 连续镜头',
    description: '镜头脚本 → 导演台 → S-Class 分组 → 审阅门控 → 交付（Seedance 合规 ≤15s 分组）',
    category: 'story',
    build() {
      const a = node('shot-script', 0, 0);
      const b = node('director-desk', 1, 0);
      const c = node('motion-story', 2, 0, { sclassEnabled: true });
      const d = node('review-gate', 3, 0);
      const e = node('export-pack', 4, 0);
      return {
        blocks: [a, b, c, d, e],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id), edge(d.id, e.id)],
      };
    },
  },
  {
    id: 'tpl-novel-import',
    label: '小说拆镜 → 开拍',
    description: 'AI 对话 · 小说拆分为分镜 → 导演台 → 开拍准备（先 AI 拆镜）',
    category: 'story',
    build() {
      const a = node('chat-model', 0, 0, {
        systemPrompt: '你是短剧分镜编剧。将用户提供的小说/章节改写为分镜脚本，用 Markdown 表格输出：| 序号 | 景别 | 时长(s) | 动作描述 | 对白 |',
      });
      const b = node('shot-script', 0, 1);
      const c = node('director-desk', 1, 0, {});
      return {
        blocks: [a, b, c],
        links: [edge(a.id, b.id), edge(b.id, c.id)],
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
    description: '宫格生成 → 切分 → 连续性检查（分镜一致性审核流程）',
    category: 'story',
    build() {
      const a = node('story-grid', 0, 0, { rows: 3, cols: 3 });
      const b = node('grid-split', 1, 0, {});
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
      const a = node('dialogue-sheet', 0, 0);
      const b = node('voice-cast', 1, 0);
      const c = node('audio-mix', 2, 0);
      const d = node('clip-editor', 3, 0);
      return { blocks: [a, b, c, d], links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)] };
    },
  },
  {
    id: 'tpl-link-replicate',
    label: '爆款复刻（素材采集 → 分析 → 生成）',
    description: '从自媒体链接解析素材，分析参考片，生成相似风格内容',
    category: 'video',
    build() {
      const a = node('link-parser', 0, 0, { url: '', hint: '' });
      const b = node('chat-model', 1, 0, { skillId: '', prompt: '分析此素材的镜头语言、景别、节奏、风格特点' });
      const c = node('shot-script', 2, 0);
      const d = node('director-desk', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-bridge-sequence',
    label: 'Bridge 镜头序列',
    description: 'Clip → Bridge 续拍 → Clip → 审阅门控',
    category: 'video',
    build() {
      const a = node('clip-gen', 0, 0);
      const b = node('bridge-clip', 1, 0);
      const c = node('clip-gen', 2, 0);
      const d = node('review-gate', 3, 0);
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
    description: '文本切分 → 编剧台 → 故事板 → 线稿网格 → 审阅门控（完整编剧→分镜→审阅链）',
    category: 'story',
    build() {
      const a = node('text-chunker', 0, 0, { mode: 'paragraph' });
      const b = node('shot-script', 0, 1);
      const c = node('story-grid', 1, 0, { rows: 3, cols: 3, style: 'line-art' });
      const d = node('grid-split', 2, 0, { rows: 3, cols: 3 });
      const e = node('review-gate', 3, 0);
      return {
        blocks: [a, b, c, d, e],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id), edge(d.id, e.id)],
      };
    },
  },
  {
    id: 'tpl-line-art-storyboard',
    label: '线稿分镜',
    description: '镜头脚本 → 线稿网格 → 切分 → 审阅门控 → 出图/出片（线稿分镜全流程）',
    category: 'story',
    build() {
      const a = node('shot-script', 0, 0);
      const b = node('story-grid', 1, 0, { rows: 3, cols: 3, style: 'line-art' });
      const c = node('grid-split', 2, 0, { rows: 3, cols: 3 });
      const d = node('review-gate', 3, 0);
      return {
        blocks: [a, b, c, d],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id)],
      };
    },
  },
  {
    id: 'tpl-3d-preview',
    label: '3D 导演预演',
    description: '镜头脚本 → 3D 机位摆设 → 审阅 → 相机参数 → 出图（3D 导演台预演全流程）',
    category: 'story',
    build() {
      const a = node('shot-script', 0, 0);
      const b = node('director-3d', 1, 0);
      const c = node('review-gate', 2, 0);
      const d = node('prompt-studio', 3, 0, { studioTab: 'camera' });
      const e = node('picture-gen', 4, 0);
      return {
        blocks: [a, b, c, d, e],
        links: [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, d.id), edge(d.id, e.id)],
      };
    },
  },
  {
    id: 'tpl-pipeline-13-3d',
    label: '13 步 3D 管线',
    description: '剧本→场次→分镜→角色→环境→3D 机位→关键帧→审阅→视频→连贯→成片→门控→导出（13 步单链）',
    category: 'story',
    build() {
      const PIPELINE_DX = 280;
      const PIPELINE_Y = 200;
      const node = (type: string, stepIndex: number, extra: Record<string, unknown> = {}) => {
        const col = stepIndex - 1;
        return {
          id: uid(`pipe-${type}`),
          type,
          position: { x: 80 + col * PIPELINE_DX, y: PIPELINE_Y },
          data: {
            blockIndex: stepIndex,
            status: 'idle',
            playbookStepIndex: stepIndex,
            ...extra,
          },
        } as FlowBlock;
      };
      const edge = (source: FlowBlock, target: FlowBlock): FlowLink => ({
        id: uid('pipe-e'),
        source: source.id,
        target: target.id,
        sourceHandle: 'out',
        targetHandle: 'in',
      });

      const s1 = node('shot-script', 1, { playbookStepId: 'script' });
      const s2 = node('text-chunker', 2, { playbookStepId: 'scene-split' });
      const s3 = node('story-grid', 3, { playbookStepId: 'storyboard' });
      const s4 = node('character-sheet', 4, { playbookStepId: 'character-bible' });
      const s5 = node('scene-card', 5, { playbookStepId: 'environment-bible' });
      const s6 = node('director-3d', 6, { playbookStepId: 'camera-3d' });
      const s7 = node('picture-gen', 7, { playbookStepId: 'keyframe-gen' });
      const s8 = node('review-gate', 8, { playbookStepId: 'keyframe-review', gateMode: 'keyframe', label: '关键帧审阅' });
      const s9 = node('motion-story', 9, { playbookStepId: 'video-gen' });
      const s10 = node('continuity-check', 10, { playbookStepId: 'consistency' });
      const s11 = node('clip-editor', 11, { playbookStepId: 'episode-studio' });
      const s12 = node('review-gate', 12, { playbookStepId: 'review-gate', gateMode: 'video', label: '成片审阅' });
      const s13 = node('export-pack', 13, { playbookStepId: 'export' });

      const blocks = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13];
      const links = [
        edge(s1, s2), edge(s2, s3), edge(s3, s4), edge(s4, s5), edge(s5, s6),
        edge(s6, s7), edge(s7, s8), edge(s8, s9), edge(s9, s10), edge(s10, s11),
        edge(s11, s12), edge(s12, s13),
      ];
      return { blocks, links };
    },
  },
  {
    id: 'tpl-pipeline-13-live',
    label: '13 步真人管线',
    description: '剧本→场次→分镜→角色→环境→导演台→关键帧→审阅→视频→连贯→成片→门控→导出（13 步单链）',
    category: 'story',
    build() {
      const PIPELINE_DX = 280;
      const PIPELINE_Y = 200;
      const node = (type: string, stepIndex: number, extra: Record<string, unknown> = {}) => {
        const col = stepIndex - 1;
        return {
          id: uid(`pipe-${type}`),
          type,
          position: { x: 80 + col * PIPELINE_DX, y: PIPELINE_Y },
          data: {
            blockIndex: stepIndex,
            status: 'idle',
            playbookStepIndex: stepIndex,
            ...extra,
          },
        } as FlowBlock;
      };
      const edge = (source: FlowBlock, target: FlowBlock): FlowLink => ({
        id: uid('pipe-e'),
        source: source.id,
        target: target.id,
        sourceHandle: 'out',
        targetHandle: 'in',
      });

      const s1 = node('shot-script', 1, { playbookStepId: 'script' });
      const s2 = node('text-chunker', 2, { playbookStepId: 'scene-split' });
      const s3 = node('story-grid', 3, { playbookStepId: 'storyboard' });
      const s4 = node('character-sheet', 4, { playbookStepId: 'character-bible' });
      const s5 = node('scene-card', 5, { playbookStepId: 'environment-bible' });
      const s6 = node('director-desk', 6, { playbookStepId: 'camera-live' });
      const s7 = node('picture-gen', 7, { playbookStepId: 'keyframe-gen' });
      const s8 = node('review-gate', 8, { playbookStepId: 'keyframe-review', gateMode: 'keyframe', label: '关键帧审阅' });
      const s9 = node('clip-gen', 9, { playbookStepId: 'video-gen' });
      const s10 = node('continuity-check', 10, { playbookStepId: 'consistency' });
      const s11 = node('clip-editor', 11, { playbookStepId: 'episode-studio' });
      const s12 = node('review-gate', 12, { playbookStepId: 'review-gate', gateMode: 'video', label: '成片审阅' });
      const s13 = node('export-pack', 13, { playbookStepId: 'export' });

      const blocks = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13];
      const links = [
        edge(s1, s2), edge(s2, s3), edge(s3, s4), edge(s4, s5), edge(s5, s6),
        edge(s6, s7), edge(s7, s8), edge(s8, s9), edge(s9, s10), edge(s10, s11),
        edge(s11, s12), edge(s12, s13),
      ];
      return { blocks, links };
    },
  },
  {
    id: 'tpl-pipeline-11-anime',
    label: '11 步动漫管线',
    description: '剧本→场次→分镜→角色→环境→关键帧→审阅→视频→连贯→门控→导出（动漫 11 步）',
    category: 'story',
    build() {
      const PIPELINE_DX = 280;
      const PIPELINE_Y = 200;
      const node = (type: string, stepIndex: number, extra: Record<string, unknown> = {}) => {
        const col = stepIndex - 1;
        return {
          id: uid(`pipe-${type}`),
          type,
          position: { x: 80 + col * PIPELINE_DX, y: PIPELINE_Y },
          data: {
            blockIndex: stepIndex,
            status: 'idle',
            playbookStepIndex: stepIndex,
            ...extra,
          },
        } as FlowBlock;
      };
      const edge = (source: FlowBlock, target: FlowBlock): FlowLink => ({
        id: uid('pipe-e'),
        source: source.id,
        target: target.id,
        sourceHandle: 'out',
        targetHandle: 'in',
      });

      const s1 = node('shot-script', 1, { playbookStepId: 'script' });
      const s2 = node('text-chunker', 2, { playbookStepId: 'scene-split' });
      const s3 = node('story-grid', 3, { playbookStepId: 'storyboard' });
      const s4 = node('character-sheet', 4, { playbookStepId: 'character-bible' });
      const s5 = node('scene-card', 5, { playbookStepId: 'environment-bible' });
      const s6 = node('picture-gen', 6, { playbookStepId: 'keyframe-gen' });
      const s7 = node('review-gate', 7, { playbookStepId: 'keyframe-review', gateMode: 'keyframe', label: '关键帧审阅' });
      const s8 = node('clip-gen', 8, { playbookStepId: 'video-gen' });
      const s9 = node('continuity-check', 9, { playbookStepId: 'consistency' });
      const s10 = node('review-gate', 10, { playbookStepId: 'review-gate', gateMode: 'video', label: '成片审阅' });
      const s11 = node('export-pack', 11, { playbookStepId: 'export' });

      const blocks = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11];
      const links = [
        edge(s1, s2), edge(s2, s3), edge(s3, s4), edge(s4, s5), edge(s5, s6),
        edge(s6, s7), edge(s7, s8), edge(s8, s9), edge(s9, s10), edge(s10, s11),
      ];
      return { blocks, links };
    },
  },
];
