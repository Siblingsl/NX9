export interface ProviderDef {
  id: string;
  label: string;
  modelId: string;
  defaultModel: string;
  concealed?: boolean;
}

/** 默认图片模型 id（节点未选模型时）。免费 API 默认 gemini-2.5-flash-image */
export const DEFAULT_PICTURE_MODEL = 'gemini-2.5-flash-image';
export const DEFAULT_VIDEO_MODEL = 'veo';
export const DEFAULT_TTS_MODEL = 'cloud';

export const PROVIDER_REGISTRY: ProviderDef[] = [
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image（免费）', modelId: 'gemini-2.5-flash-image', defaultModel: 'gemini-2.5-flash-image' },
  { id: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', modelId: 'gemini-3.1-flash-image', defaultModel: 'gemini-3.1-flash-image' },
  { id: 'dall-e-3', label: 'DALL·E 3', modelId: 'dall-e-3', defaultModel: 'dall-e-3' },
  { id: 'veo', label: 'Veo', modelId: 'veo', defaultModel: 'veo' },
  { id: 'seedance', label: 'Seedance', modelId: 'seedance', defaultModel: 'seedance', concealed: true },
  { id: 'cloud', label: 'Cloud TTS', modelId: 'cloud', defaultModel: 'cloud' },
];

export function resolveDefaultModel(kind: 'picture' | 'video' | 'tts'): string {
  switch (kind) {
    case 'picture': return DEFAULT_PICTURE_MODEL;
    case 'video': return DEFAULT_VIDEO_MODEL;
    case 'tts': return DEFAULT_TTS_MODEL;
  }
}

/** 视频级智能替换（video-edit）供应商能力位 */
export interface VideoEditProviderDef {
  id: string;
  label: string;
  /** Fal 队列模型 id（服务端 /api/montage/video-edit 任务队列调用） */
  falModel: string;
  /** 请求输入键位映射（不同模型的入参命名不同） */
  inputKeys: {
    video: string;
    mask?: string;
    prompt: string;
    /** 完整 mask 视频（由 SAM2 追踪任务产出）的入参键位；缺省无 */
    maskVideo?: string;
  };
  /** 是否要求 mask（不要求的模型按 prompt 全局重绘） */
  requiresMask: boolean;
  /**
   * 是否支持「首帧标注 → 自动跨帧追踪」：
   * true = 由 NX9 侧 VIDEO_TRACE_PROVIDERS（SAM2 视频分割）把首帧 mask
   * 传播为逐帧 mask 视频后，经 maskVideo 键位交给重绘模型（边缘全程稳定）。
   */
  supportsFrameTracking: boolean;
}

export const VIDEO_EDIT_PROVIDERS: VideoEditProviderDef[] = [
  {
    id: 'wan-vace',
    label: 'WAN VACE 视频重绘',
    falModel: 'fal-ai/wan-vace-14b',
    inputKeys: { video: 'video_url', mask: 'mask_image_url', maskVideo: 'mask_video_url', prompt: 'prompt' },
    requiresMask: true,
    supportsFrameTracking: true,
  },
];

export const DEFAULT_VIDEO_EDIT_PROVIDER = 'wan-vace';

export function resolveVideoEditProvider(id?: string): VideoEditProviderDef {
  return (
    VIDEO_EDIT_PROVIDERS.find((p) => p.id === id) ??
    VIDEO_EDIT_PROVIDERS.find((p) => p.id === DEFAULT_VIDEO_EDIT_PROVIDER) ??
    VIDEO_EDIT_PROVIDERS[0]
  );
}

/** 视频分割追踪（首帧 mask → 逐帧 mask 视频）供应商能力位 */
export interface VideoTraceProviderDef {
  id: string;
  label: string;
  /** Fal 队列模型 id（服务端 /api/montage/video-trace 任务队列调用） */
  falModel: string;
  inputKeys: {
    video: string;
    mask: string;
    prompt?: string;
  };
}

export const VIDEO_TRACE_PROVIDERS: VideoTraceProviderDef[] = [
  {
    id: 'sam2-video',
    label: 'SAM2 视频分割（首帧蒙版自动追踪）',
    falModel: 'fal-ai/sam2/video',
    inputKeys: { video: 'video_url', mask: 'mask_url', prompt: 'prompt' },
  },
];

export const DEFAULT_VIDEO_TRACE_PROVIDER = 'sam2-video';

export function resolveVideoTraceProvider(id?: string): VideoTraceProviderDef {
  return (
    VIDEO_TRACE_PROVIDERS.find((p) => p.id === id) ??
    VIDEO_TRACE_PROVIDERS.find((p) => p.id === DEFAULT_VIDEO_TRACE_PROVIDER) ??
    VIDEO_TRACE_PROVIDERS[0]
  );
}
