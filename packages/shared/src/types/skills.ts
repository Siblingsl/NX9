/** 技能库分组：内置生产 / 其他有用资料 */
export type SkillLane = 'builtin' | 'library';

/** Skill metadata (from metadata.json) */
export interface SkillMetadata {
  name: string;
  title: string;
  description: string;
  version: string;
  entry: string;
  tags?: string[];
  author?: string;
  status?: 'draft' | 'stable' | 'deprecated';
  language?: string;
  updated_at?: string;
  compatibility?: Record<string, string>;
  dependencies?: string[];
  resources?: Record<string, string>;
  nx9?: {
    promptId?: string;
    category?: string;
    priority?: 'P0' | 'P1' | 'P2';
    /** builtin = 主制片链路；library = 资料/工具（有用但非主链注入） */
    lane?: SkillLane;
  };
}

/** Skill catalog entry — for list views */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version?: string;
  status?: string;
  tags?: string[];
  promptId?: string;
  category?: string;
  priority?: string;
  lane?: SkillLane;
}

/** Full skill detail including body and resource files */
export interface SkillDetail extends SkillSummary {
  content: string;
  metadata?: SkillMetadata;
  files?: { name: string; content: string }[];
}

/** Validation result for a skill */
export interface SkillValidationResult {
  valid: boolean;
  errors: { file: string; message: string }[];
}

/** Connection status per channel */
export interface ConnectionChannelStatus {
  channel: 'llm' | 'image' | 'video' | 'audio';
  status: 'ready' | 'partial' | 'missing' | 'probe_failed';
  configured: boolean;
  effectiveKeySource: string;
  effectiveBaseUrl: string;
  model?: string;
  hints: string[];
}

/** Full connection status response */
export interface ConnectionStatus {
  channels: ConnectionChannelStatus[];
  advancedProviderCount: number;
  overallReady: boolean;
}
