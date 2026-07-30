export interface ProviderCredential {
  id: string;
  label: string;
  protocol: 'openai-compat' | 'modelscope' | 'volcengine' | 'comfyui' | 'jimeng-cli' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}

/** 一个保存的连接配置（可复用在各个模态下拉里选择） */
export interface ModelConnection {
  id: string;
  label: string;
  kind: 'llm' | 'image' | 'video' | 'audio';
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  isActive?: boolean;
  icon?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 内置主流官方模型连接预设 */
export const BUILTIN_CONNECTION_PRESETS: Omit<ModelConnection, 'id' | 'apiKey' | 'isActive' | 'createdAt' | 'updatedAt'>[] = [
  { label: 'OpenAI', kind: 'llm', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'OpenAI (兼容出图)', kind: 'image', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'dall-e-3' },
  { label: 'xAI Grok', kind: 'llm', provider: 'xai', baseUrl: 'https://api.x.ai/v1', model: 'grok-2' },
  { label: 'xAI Grok Imagine', kind: 'video', provider: 'xai', baseUrl: 'https://api.x.ai/v1', model: 'grok-imagine-video' },
  { label: 'Google Gemini', kind: 'llm', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { label: 'Google Gemini / Imagen', kind: 'image', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'imagen-4' },
  { label: 'Anthropic Claude', kind: 'llm', provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-haiku' },
  { label: 'DeepSeek', kind: 'llm', provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Groq', kind: 'llm', provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant' },
  { label: 'Together AI', kind: 'llm', provider: 'together', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.1-8B-Instruct-Turbo' },
  { label: 'OpenRouter', kind: 'llm', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { label: 'Azure OpenAI', kind: 'llm', provider: 'azure', baseUrl: 'https://YOUR-RESOURCE.openai.azure.com', model: 'gpt-4o' },
  { label: 'GrokGo 本地桥', kind: 'video', provider: 'grokgo', baseUrl: 'http://127.0.0.1:8787/v1', model: 'grok-imagine-video' },
  { label: 'LocalAI', kind: 'llm', provider: 'localai', baseUrl: 'http://127.0.0.1:8080/v1', model: 'llama-3.1-8b' },
  { label: 'Ollama', kind: 'llm', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
  { label: '通用 OpenAI 兼容 (TTS)', kind: 'audio', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'tts-1' },
];

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
  /** Base URL for OpenAI-compatible primary image/video/LLM provider. */
  primaryBaseUrl?: string;
  /** Video provider routing: xAI official, local GrokGo test bridge, or custom OpenAI-compatible endpoint. */
  videoProvider?: 'custom' | 'xai' | 'grokgo';
  /** Video generation key for OpenAI-compatible /videos/generations providers. */
  videoApiKey?: string;
  /** Video generation Base URL; falls back to primaryBaseUrl/OpenAI when empty. */
  videoBaseUrl?: string;
  /** xAI official API key for Grok Imagine video. */
  xaiApiKey?: string;
  /** xAI official Base URL; defaults to https://api.x.ai/v1. */
  xaiBaseUrl?: string;
  /** Local GrokGo bridge API key for test flow. */
  grokGoApiKey?: string;
  /** Local GrokGo bridge Base URL; defaults to http://127.0.0.1:8787/v1. */
  grokGoBaseUrl?: string;
  rhApiKey?: string;
  /** Google Gemini / Imagen API Key（AI Studio） */
  geminiApiKey?: string;
  /** Gemini API Base URL，默认 https://generativelanguage.googleapis.com/v1beta */
  geminiBaseUrl?: string;
  llmApiKey?: string;
  /** Base URL for chat/text models; falls back to primaryBaseUrl/OpenAI when empty. */
  llmBaseUrl?: string;
  /** Default chat/text model used by script breakdown and LLM helpers. */
  llmModel?: string;
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
  /** 保存的连接配置列表（每个模态可以有多个连接，UI 下拉切换） */
  connections?: ModelConnection[];
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
  /** BGM 音乐生成 Provider：suno | udio | elevenlabs */
  bgmProvider?: string;
  /** BGM 音乐生成 API Key */
  bgmApiKey?: string;
}
