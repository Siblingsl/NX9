/**
 * clip-gen 出片请求组装器 —— VG-01/02/03/07 收口单点。
 *
 * 所有活跃执行路径（flow-runner 级联、core-pipeline 批量）统一经此组装
 * `proxyVideo` 请求体：热门玩法装配、参考图/视频数组、生成模式分发、
 * 高级参数（seed / negativePrompt / modelParams）与音频开关在此收敛。
 */
import {
  buildClipGenPlaybookPack,
  extractReferencePack,
  gatherUpstream,
  lookupReferencePlaybook,
  readClipGenPlaybook,
  resolveMentionsForPrompt,
  resolveVideoGenParams,
  validateSClassReferences,
  SCLASS_MAX_REF_IMAGES,
  SCLASS_MAX_REF_VIDEOS,
  type GenPromptPack,
  type MentionRef,
  type ReferencePack,
  type UpstreamPolicy,
} from '@nx9/shared';

export interface ClipGenGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface ClipGenGraphEdge {
  source: string;
  target: string;
}

export interface ClipGenRequestInput {
  /** clip-gen 节点 data */
  data: Record<string, unknown>;
  /** 已完成镜头级组装的 prompt（角色/引导/mention 解析后） */
  prompt: string;
  /** 首帧参考（镜头首帧 / 引导合成图 / 上游首图） */
  imageUrl?: string;
  /** 覆盖时长（批量按镜头时长） */
  durationSec?: number;
  upstreamPictures?: string[];
  upstreamClips?: string[];
  /** 上游参考板引用包（无本地玩法时兜底） */
  upstreamReferencePack?: ReferencePack | null;
  /**
   * Skill 拼装包获取器（玩法装配用）。
   * 默认由调用方注入 getGenPack；测试可传 null 跳过。
   */
  resolveGenPack?: (skillId: string) => Promise<GenPromptPack | null>;
  /** Bridge 等已自带首帧语义的路径跳过模式分发 */
  applyModeDispatch?: boolean;
  /**
   * VG-15: 首尾帧来源。
   * - node（默认）：工作台 FrameStrip 的 start/end，适合无上游单镜
   * - shot：批量/按镜出片，首帧强制用 input.imageUrl，尾帧用 input.lastFrameUrl 或节点 endFrameUrl
   */
  keyframeSource?: 'node' | 'shot';
  /** 镜级尾帧（keyframeSource=shot 时优先于节点 endFrameUrl） */
  lastFrameUrl?: string;
}

export interface ClipGenRequestResult {
  /** 直接传给 api.proxyVideo 的请求体 */
  body: Record<string, unknown>;
  /** 最终 prompt（玩法装配后） */
  prompt: string;
  /** 非空表示应阻断出片（enforce 未就绪 / 模式缺前置） */
  blocked?: string;
  playbookId?: string;
  referenceImages: string[];
  referenceVideos: string[];
}

/** 与工作台 videoGenMode 同一词表（避免 UI 模块反向依赖，此处只读字段） */
function readGenMode(data: Record<string, unknown>): string {
  const raw = data.videoGenMode as string | undefined;
  if (raw) return raw;
  if (data.useKeyframePair) return 'keyframe';
  if (data.videoMode === 'bridge') return 'bridge';
  return 'text-to-video';
}

function dedupe(urls: Array<string | undefined | null>): string[] {
  return [...new Set(urls.filter((u): u is string => Boolean(u && u.trim())))];
}

/** 查找连入 clip-gen 的 reference-board 引用包（兼容旧路径） */
export function findUpstreamReferencePack(
  blockId: string,
  nodes: ClipGenGraphNode[],
  edges: ClipGenGraphEdge[],
): ReferencePack | null {
  const incoming = edges.filter((e) => e.target === blockId);
  for (const edge of incoming) {
    const src = nodes.find((n) => n.id === edge.source);
    if (!src || src.type !== 'reference-board') continue;
    const pack = extractReferencePack((src.data ?? {}) as Record<string, unknown>);
    if (pack) return pack;
  }
  return null;
}

/**
 * VG-16: 收集 clip-gen 上游参考板 + 图/视频，供批量与级联同口径。
 */
export function collectClipGenUpstream(
  blockId: string,
  nodes: ClipGenGraphNode[],
  edges: ClipGenGraphEdge[],
  data?: Record<string, unknown>,
): {
  pack: ReferencePack | null;
  pictures: string[];
  clips: string[];
} {
  const pack = findUpstreamReferencePack(blockId, nodes, edges);
  const blocks = nodes.map((n) => ({
    id: n.id,
    type: n.type || 'unknown',
    position: { x: 0, y: 0 },
    data: n.data ?? {},
  }));
  const links = edges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
  }));
  const gathered = gatherUpstream(
    blockId,
    blocks,
    links,
    data?.upstreamPolicy as UpstreamPolicy | undefined,
    (data?.primarySourceId as string | null | undefined) ?? null,
  );
  return {
    pack,
    pictures: gathered.pictures ?? [],
    clips: gathered.clips ?? [],
  };
}

/** VG-26: 把 @角色/@场景 及上游图视频 mention 解析进 prompt */
export function resolveClipGenPromptMentions(
  prompt: string,
  refs: {
    pictures?: string[];
    clips?: string[];
    characters?: Array<{
      id: string;
      name: string;
      consistencyPrompt?: string;
      referenceImageUrl?: string | null;
    }>;
    environments?: Array<{
      id: string;
      name: string;
      descriptionZh?: string;
      consistencyPrompt?: string;
    }>;
  },
): string {
  const mentions: MentionRef[] = [];
  (refs.pictures ?? []).forEach((url, i) => {
    mentions.push({ id: `pic-${i}`, kind: 'picture', url, label: `图 ${i + 1}` });
  });
  (refs.clips ?? []).forEach((url, i) => {
    mentions.push({ id: `clip-${i}`, kind: 'clip', url, label: `视频 ${i + 1}` });
  });
  for (const c of refs.characters ?? []) {
    mentions.push({
      id: c.id,
      kind: '角色',
      label: c.name,
      url: c.consistencyPrompt || c.referenceImageUrl || c.name,
    });
  }
  for (const env of refs.environments ?? []) {
    mentions.push({
      id: env.id,
      kind: '场景',
      label: env.name,
      url: env.consistencyPrompt || env.descriptionZh || env.name,
    });
  }
  if (mentions.length === 0) return prompt;
  return resolveMentionsForPrompt(prompt, mentions).resolved;
}

/**
 * 组装 clip-gen 视频请求体。
 * 返回 blocked 时调用方必须阻断出片并把原因写回节点。
 */
export async function buildClipGenVideoRequest(
  input: ClipGenRequestInput,
): Promise<ClipGenRequestResult> {
  const d = input.data;
  const model = (d.model as string) || 'veo';
  const applyModeDispatch = input.applyModeDispatch !== false;

  // —— 热门玩法装配（本地玩法优先于上游参考板） ——
  const playbook = readClipGenPlaybook(d);
  let activePack: ReferencePack | null = null;
  if (playbook) {
    const skillId = lookupReferencePlaybook(playbook.playbookId)?.skillId;
    const genPack =
      skillId && input.resolveGenPack ? await input.resolveGenPack(skillId) : null;
    // VG-17: 调用方已拼好镜级正文（含工作台补句）；节点 content 仅作未传 prompt 时的兜底
    const userExtras = (input.prompt || (d.content as string) || '').trim();
    activePack = buildClipGenPlaybookPack(playbook, userExtras, genPack);
  } else if (input.upstreamReferencePack) {
    activePack = input.upstreamReferencePack;
  }

  if (activePack?.enforce && (activePack.blockReason || !activePack.ready)) {
    return {
      body: {},
      prompt: input.prompt,
      blocked: activePack.blockReason || '热门玩法未就绪：请补齐必填槽位',
      playbookId: activePack.playbookId,
      referenceImages: [],
      referenceVideos: [],
    };
  }

  // 玩法装配提示词优先；否则用调用方组装好的镜头级 prompt
  const prompt = activePack?.assembledPrompt?.trim() || input.prompt;

  // —— 生成模式分发（VG-02） ——
  const mode = readGenMode(d);
  let imageUrl = input.imageUrl;
  let lastFrameUrl: string | undefined;
  const extraRefImages: string[] = [];
  if (applyModeDispatch) {
    if (mode === 'keyframe') {
      // VG-15: 批量按镜取首帧，禁止节点级 startFrameUrl 盖掉每镜 imageUrl
      if (input.keyframeSource === 'shot') {
        imageUrl = input.imageUrl;
        lastFrameUrl =
          (input.lastFrameUrl as string | undefined)
          || (d.endFrameUrl as string | undefined)
          || undefined;
      } else {
        imageUrl = (d.startFrameUrl as string | undefined) || imageUrl;
        lastFrameUrl = (d.endFrameUrl as string | undefined) || undefined;
      }
      if (!imageUrl) {
        return {
          body: {},
          prompt,
          blocked: '首尾帧模式需要先上传首图',
          playbookId: activePack?.playbookId,
          referenceImages: [],
          referenceVideos: [],
        };
      }
    } else if (mode === 'image-to-video') {
      imageUrl = imageUrl || input.upstreamPictures?.[0];
      if (!imageUrl) {
        return {
          body: {},
          prompt,
          blocked: '图生视频模式需要首图：请连接图像节点或上传参考图',
          playbookId: activePack?.playbookId,
          referenceImages: [],
          referenceVideos: [],
        };
      }
    } else if (mode === 'image-ref' || mode === 'omni-ref') {
      const refFrame = d.referenceFrameUrl as string | undefined;
      if (refFrame) extraRefImages.push(refFrame);
    }
  }

  // —— 参考数组（VG-01） ——
  const referenceImagesAll = dedupe([
    ...(activePack?.imageUrls ?? []),
    ...extraRefImages,
    ...(input.upstreamPictures ?? []),
  ]);
  const referenceVideosAll = dedupe([
    ...(activePack?.videoUrls ?? []),
    activePack?.depthVideoUrl,
    ...(input.upstreamClips ?? []),
  ]);
  if (model === 'seedance') {
    const refError = validateSClassReferences(
      referenceImagesAll.length,
      referenceVideosAll.length,
    );
    if (refError) {
      return {
        body: {},
        prompt,
        blocked: refError,
        playbookId: activePack?.playbookId,
        referenceImages: referenceImagesAll,
        referenceVideos: referenceVideosAll,
      };
    }
  }
  const referenceImages = referenceImagesAll.slice(0, SCLASS_MAX_REF_IMAGES);
  const referenceVideos = referenceVideosAll.slice(0, SCLASS_MAX_REF_VIDEOS);

  if (model.startsWith('grok-imagine-video') && !imageUrl) {
    return {
      body: {},
      prompt,
      blocked: 'Grok Imagine 当前需要首图，请先连接图像生成节点或上传参考图',
      playbookId: activePack?.playbookId,
      referenceImages,
      referenceVideos,
    };
  }

  // —— 尺寸/时长参数（玩法可锁画幅） ——
  const videoParams = resolveVideoGenParams({
    resolution: d.resolution as string | undefined,
    orientation: d.orientation as string | undefined,
    aspect: (activePack?.aspect as string | undefined) || (d.aspect as string | undefined),
    durationSec: input.durationSec ?? (d.durationSec as number | undefined),
  });

  // —— 高级参数（VG-03） ——
  const seedRaw = d.seed;
  const seed =
    seedRaw === null || seedRaw === undefined || seedRaw === ''
      ? undefined
      : Number(seedRaw);
  const negativePrompt = ((d.negativePrompt as string) ?? '').trim() || undefined;
  const modelParams = ((d.modelParams as string) ?? '').trim() || undefined;

  const body: Record<string, unknown> = {
    prompt,
    model,
    imageUrl,
    duration: videoParams.durationSec,
    aspect_ratio: videoParams.aspect,
    size: videoParams.size,
    resolution: videoParams.resolution,
    generateAudio: (d.generateAudio as boolean | undefined) ?? false,
    ...(lastFrameUrl ? { lastFrameUrl } : {}),
    ...(referenceImages.length ? { referenceImages } : {}),
    ...(referenceVideos.length ? { referenceVideos } : {}),
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(modelParams ? { modelParams } : {}),
  };

  return {
    body,
    prompt,
    playbookId: activePack?.playbookId,
    referenceImages,
    referenceVideos,
  };
}
