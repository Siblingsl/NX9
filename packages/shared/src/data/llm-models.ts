/**
 * 内置文字模型目录（NX9 开箱可直选）。
 *
 * 词表诚实约定：
 * - `model` 是发给上游 OpenAI 兼容 /chat/completions 的模型串；
 *   各家命名随时间变化，本目录只保证「厂商家族名」稳定，具体串以你的网关/厂商文档为准；
 * - `baseUrl` 仅在该厂商的公开稳定端点已知时填写，供「设置 → 连接」一键对齐参考；
 * - 目录不含任何密钥，也不代表账号可用额度。
 */

export type LlmModelGroup =
  | 'deepseek'
  | 'glm'
  | 'qwen'
  | 'moonshot'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'local'
  | 'other';

export interface LlmModelDef {
  /** 目录内唯一 id */
  id: string;
  /** 中文可读名 */
  label: string;
  /** 厂商标识 */
  provider: string;
  /** OpenAI 兼容 model id（写入 llmModel） */
  model: string;
  /** 该厂商公开稳定的 OpenAI 兼容端点，供连接配置参考 */
  baseUrl?: string;
  hint?: string;
  group?: LlmModelGroup;
}

export const LLM_MODELS: LlmModelDef[] = [
  // —— DeepSeek ——
  {
    id: 'deepseek-chat',
    label: 'DeepSeek 对话（V3）',
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    group: 'deepseek',
    hint: '中文编排/拆镜性价比高',
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek 推理（R1）',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    baseUrl: 'https://api.deepseek.com/v1',
    group: 'deepseek',
    hint: '长链推理更稳，速度较慢',
  },

  // —— 智谱 GLM ——
  {
    id: 'glm-4-plus',
    label: '智谱 GLM-4 Plus',
    provider: 'zhipu',
    model: 'glm-4-plus',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    group: 'glm',
    hint: '国产中文强项；具体型号串以网关为准',
  },
  {
    id: 'glm-4-flash',
    label: '智谱 GLM-4 Flash',
    provider: 'zhipu',
    model: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    group: 'glm',
    hint: '轻量快速档',
  },

  // —— 阿里通义 Qwen ——
  {
    id: 'qwen-max',
    label: '通义千问 Qwen Max',
    provider: 'aliyun',
    model: 'qwen-max',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    group: 'qwen',
    hint: '中文长文与结构化输出稳定',
  },
  {
    id: 'qwen-plus',
    label: '通义千问 Qwen Plus',
    provider: 'aliyun',
    model: 'qwen-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    group: 'qwen',
    hint: '均衡档，日常拆镜够用',
  },

  // —— Kimi / Moonshot ——
  {
    id: 'moonshot-v1-8k',
    label: 'Kimi（Moonshot 8K）',
    provider: 'moonshot',
    model: 'moonshot-v1-8k',
    baseUrl: 'https://api.moonshot.cn/v1',
    group: 'moonshot',
    hint: '短上下文快速档',
  },
  {
    id: 'moonshot-v1-32k',
    label: 'Kimi（Moonshot 32K）',
    provider: 'moonshot',
    model: 'moonshot-v1-32k',
    baseUrl: 'https://api.moonshot.cn/v1',
    group: 'moonshot',
    hint: '长剧本/多集拆分推荐',
  },

  // —— OpenAI ——
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    group: 'openai',
    hint: '通用主力模型',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    group: 'openai',
    hint: '轻量低成本档',
  },

  // —— Anthropic ——
  {
    id: 'claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: 'https://api.anthropic.com/v1',
    group: 'anthropic',
    hint: '长文本改写强；需网关提供 Anthropic 兼容通道',
  },
  {
    id: 'claude-3-haiku',
    label: 'Claude 3 Haiku',
    provider: 'anthropic',
    model: 'claude-3-haiku',
    baseUrl: 'https://api.anthropic.com/v1',
    group: 'anthropic',
    hint: '轻量快速档；需网关提供 Anthropic 兼容通道',
  },

  // —— Google Gemini ——
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    group: 'google',
    hint: '快且便宜，适合批量拆镜',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    group: 'google',
    hint: '长上下文高阶档',
  },

  // —— xAI ——
  {
    id: 'grok-2',
    label: 'xAI Grok 2',
    provider: 'xai',
    model: 'grok-2',
    baseUrl: 'https://api.x.ai/v1',
    group: 'xai',
    hint: '与 Grok Imagine 视频同账号通道',
  },
  {
    id: 'grok-3',
    label: 'xAI Grok 3',
    provider: 'xai',
    model: 'grok-3',
    baseUrl: 'https://api.x.ai/v1',
    group: 'xai',
    hint: '型号串以网关为准',
  },

  // —— 本地 ——
  {
    id: 'ollama-qwen2.5-7b',
    label: '本地 Ollama · Qwen2.5 7B',
    provider: 'ollama',
    model: 'qwen2.5:7b',
    baseUrl: 'http://127.0.0.1:11434/v1',
    group: 'local',
    hint: '本机 Ollama，完全离线',
  },
  {
    id: 'ollama-llama3.1-8b',
    label: '本地 Ollama · Llama 3.1 8B',
    provider: 'ollama',
    model: 'llama3.1:8b',
    baseUrl: 'http://127.0.0.1:11434/v1',
    group: 'local',
    hint: '本机 Ollama，完全离线',
  },
  {
    id: 'localai-llama3.1-8b',
    label: '本地 LocalAI · Llama 3.1 8B',
    provider: 'localai',
    model: 'llama-3.1-8b',
    baseUrl: 'http://127.0.0.1:8080/v1',
    group: 'local',
    hint: '本机 LocalAI，完全离线',
  },

  // —— 聚合网关 ——
  {
    id: 'openrouter-gpt-4o-mini',
    label: 'OpenRouter · GPT-4o mini',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    baseUrl: 'https://openrouter.ai/api/v1',
    group: 'other',
    hint: '一个 Key 直连多家模型',
  },
];

/** 按 id 或上游 model 串查内置文字模型 */
export function lookupLlmModel(id?: string): LlmModelDef | undefined {
  const raw = (id ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return LLM_MODELS.find(
    (m) => m.id.toLowerCase() === lower || m.model.toLowerCase() === lower,
  );
}

export function isBuiltinLlmModelId(id?: string): boolean {
  return Boolean(lookupLlmModel(id));
}
