export interface ProviderCredential {
  id: string;
  label: string;
  protocol: 'openai-compat' | 'modelscope' | 'volcengine' | 'comfyui' | 'jimeng-cli' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface CloudTarget {
  id: string;
  label: string;
  driver: 'cos' | 'oss' | 'webdav';
  config: Record<string, string>;
}

export interface AppPreferences {
  snapToGrid: boolean;
  gridSize: number;
  autoSaveIntervalMs: number;
  showBlockIndex: boolean;
  reduceMotion: boolean;
  workflowEnabled?: boolean;
  autoAdvanceEnabled?: boolean;
  taskNotificationsEnabled?: boolean;
  showEngineDebug?: boolean;
  /** Use Stage Deck Canvas instead of legacy FlowSurface */
  stageDeckCanvas?: boolean;
  /** 默认图像质量 */
  defaultImageQuality?: 'auto' | 'high' | 'medium' | 'low';
  /** 默认图像宽高比 */
  defaultImageAspect?: string;
  /** 默认视频分辨率 */
  defaultVideoResolution?: '480' | '720' | '1080';
  /** 默认视频时长 */
  defaultVideoDuration?: number;
}

/** LuxTTS 无 GPU 时的用户保底选择 */
export type LuxTtsNoGpuFallback = 'cpu' | 'cloud';

export interface AppSettings {
  primaryApiKey?: string;
  rhApiKey?: string;
  llmApiKey?: string;
  /** TTS provider key (OpenAI-compatible /audio/speech). Falls back to primaryApiKey. */
  ttsApiKey?: string;
  /** Base URL for the TTS provider; defaults to https://api.openai.com/v1 */
  ttsBaseUrl?: string;
  categoryKeys?: Record<string, string>;
  exportPath?: string;
  autoBackupPath?: string;
  assetLibraryPath?: string;
  advancedProviders?: ProviderCredential[];
  cloudTargets?: CloudTarget[];
  preferences?: AppPreferences;
  /** Enable routing TTS to local Voicebox (http://127.0.0.1:17493) */
  voiceboxEnabled?: boolean;
  voiceboxBaseUrl?: string;
  /** Voicebox profile name or id; falls back to voiceId in voice line */
  voiceboxDefaultProfile?: string;
  /** Enable routing TTS to local LuxTTS sidecar (voice cloning) */
  luxTtsEnabled?: boolean;
  luxTtsBaseUrl?: string;
  /** Default reference clip for cloning when block does not specify one (/media/audio/...) */
  luxTtsDefaultReferenceAudio?: string;
  /** Pre-encode default reference on first TTS (warms cache) */
  luxTtsWarmOnProbe?: boolean;
  luxTtsNumSteps?: number;
  luxTtsTShift?: number;
  luxTtsSpeed?: number;
  luxTtsRms?: number;
  luxTtsRefDuration?: number;
  luxTtsReturnSmooth?: boolean;
  /**
   * 无 GPU（LuxTTS 跑在 CPU）时的保底策略：
   * - cloud：跳过本地 LuxTTS，改走 Voicebox / 云端 TTS（默认，更快）
   * - cpu：仍用 LuxTTS CPU 推理（较慢，完全离线）
   */
  luxTtsNoGpuFallback?: 'cpu' | 'cloud';
}
