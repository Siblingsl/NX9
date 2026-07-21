/** 节点跟随工作区内容类型 — 新增节点 MUST 择一（壳层定位不在此列） */
export type AttachedWorkspaceType =
  | 'generation'   // Prompt + 素材 + 生成参数 + 运行
  | 'editor'       // 结构化编辑（角色、参考板等）
  | 'config'       // 模型/导出/预处理等配置
  | 'tool'         // 单次处理任务
  | 'report'       // 分析报告只读 + 修复入口
  | 'preview'      // 媒体/3D 预览
  | 'timeline'     // 视频时间线
  | 'board'        // 参考板 Mood Board
  | 'table'        // 对白表、配音表
  | 'task'         // 批处理任务队列
  | 'control'      // 轻量流程控制
  | 'none';        // 无节点工作区（纯路由节点）

/** 功能六类 — 决定画布摘要样式 */
export type NodeFunctionalClass =
  | 'generation'      // A. AI 生成
  | 'resource-editor' // B. 资源编辑
  | 'media-editor'    // C. 媒体编辑
  | 'processing-tool' // D. 工具处理
  | 'analysis-report' // E. 分析报告
  | 'pipeline-control'; // F. 流程控制

export interface AttachedWorkspaceSpec {
  kind: string;
  functionalClass: NodeFunctionalClass;
  workspaceType: AttachedWorkspaceType;
  /** 是否挂载节点跟随 Prompt Bar 壳层（MUST true 当 workspaceType !== 'none'） */
  attachToNode: boolean;
  /** 画布是否强制紧凑（MUST true 除 control/none 外） */
  compactCanvas: boolean;
  /** 是否展示运行按钮 */
  showRun: boolean;
  /** 是否展示结果预览入口 */
  showPreview: boolean;
  /** 实施阶段 P1|P2|P3|P4|frozen */
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'frozen';
  /** 备注 */
  note?: string;
}

/**
 * ATTACHED_WORKSPACE_REGISTRY — 全量节点跟随工作区注册表。
 *
 * 数据来源：NX9-BOTTOM-WORKSPACE-REFACTOR-SPEC-v1.md §7 全量节点映射表。
 * 规则：新增 kind 时在此登记 + 运行 gen-attached-workspace-doc.mjs。
 * 禁止在 UI 层写 if (kind === 'xxx') 散落逻辑。
 */
export const ATTACHED_WORKSPACE_REGISTRY: Record<string, AttachedWorkspaceSpec> = {
  // ── §7.1 AI 生成类 → Generation ──
  'prompt': {
    kind: 'prompt',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'picture-gen': {
    kind: 'picture-gen',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'clip-gen': {
    kind: 'clip-gen',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'storyboard-preview': {
    kind: 'storyboard-preview',
    functionalClass: 'media-editor',
    workspaceType: 'preview',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
    note: '已合并至 storyboard-desk',
  },
  'storyboard-desk': {
    kind: 'storyboard-desk',
    functionalClass: 'media-editor',
    workspaceType: 'preview',
    /** 自有 ScreenModal 分镜台，预览也可内嵌；底部工作区作兼容 */
    attachToNode: false,
    compactCanvas: false,
    showRun: true,
    showPreview: true,
    phase: 'P1',
    note: '分镜台：分镜表编辑 + 关键帧预览出图 + 顶部 exec-picture + 一致性评分',
  },
  'motion-story': {
    kind: 'motion-story',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'photo-speak': {
    kind: 'photo-speak',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'sound-gen': {
    kind: 'sound-gen',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'music-gen': {
    kind: 'music-gen',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
    note: 'concealed',
  },
  'inpaint-edit': {
    kind: 'inpaint-edit',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'shot-script': {
    kind: 'shot-script',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P1',
  },
  'style-lab': {
    kind: 'style-lab',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'story-grid': {
    kind: 'story-grid',
    functionalClass: 'generation',
    workspaceType: 'table',
    attachToNode: false,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
    note: '已合并至 storyboard-desk',
  },
  'prompt-studio': {
    kind: 'prompt-studio',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'grid-prompt-reverse': {
    kind: 'grid-prompt-reverse',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'chat-model': {
    kind: 'chat-model',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'seedance-chain': {
    kind: 'seedance-chain',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'bridge-clip': {
    kind: 'bridge-clip',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
    note: '逻辑+生成混合',
  },
  'caption-asr': {
    kind: 'caption-asr',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'director-desk': {
    kind: 'director-desk',
    functionalClass: 'generation',
    workspaceType: 'none',
    /** 自有 ScreenModal 导演台，不走底部 Attached Workspace */
    attachToNode: false,
    /** 必须 false：保留摘要卡节点 UI */
    compactCanvas: false,
    showRun: true,
    showPreview: true,
    phase: 'P1',
    note: '关键帧批生产：画布摘要卡 + ScreenModal 队列/批出/审阅',
  },
  'thumbnail-maker': {
    kind: 'thumbnail-maker',
    functionalClass: 'generation',
    workspaceType: 'generation',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P3',
    note: 'concealed；偏输出整理',
  },

  // ── §7.2 资源编辑类 → Editor / Board / Table ──
  'asset-gate': {
    kind: 'asset-gate',
    functionalClass: 'analysis-report',
    workspaceType: 'report',
    /** 自有 ScreenModal 门禁台 */
    attachToNode: false,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
    note: '设定检查：画布暗色门禁表 + ScreenModal 总览/角色/场景',
  },
  'reference-board': {
    kind: 'reference-board',
    functionalClass: 'resource-editor',
    workspaceType: 'board',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P3',
  },
  'dialogue-sheet': {
    kind: 'dialogue-sheet',
    functionalClass: 'resource-editor',
    workspaceType: 'table',
    /** 自有 ScreenModal 分镜台，不走底部 Attached Workspace */
    attachToNode: false,
    /** 必须 false：否则 StageDeck 用 CanvasNodeShell 盖掉暗色分镜表节点 UI */
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P3',
    note: '剧本拆分：画布暗色迷你表 + ScreenModal 导演/文本/分镜表',
  },
  'voice-cast': {
    kind: 'voice-cast',
    functionalClass: 'resource-editor',
    workspaceType: 'table',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P3',
    note: '可复用 table 壳',
  },

  // ── §7.3 媒体编辑类 → Timeline / Preview ──
  'clip-editor': {
    kind: 'clip-editor',
    functionalClass: 'media-editor',
    workspaceType: 'timeline',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: true,
    phase: 'P3',
    note: '禁止压成 Prompt',
  },
  'director-3d': {
    kind: 'director-3d',
    functionalClass: 'media-editor',
    workspaceType: 'none',
    attachToNode: false,
    compactCanvas: false,
    showRun: false,
    showPreview: true,
    phase: 'P3',
    note: '节点卡自含 + 全屏 3D 舞台，无底部工作区',
  },
  'mesh-viewer': {
    kind: 'mesh-viewer',
    functionalClass: 'media-editor',
    workspaceType: 'preview',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: true,
    phase: 'P3',
  },
  'preview-sink': {
    kind: 'preview-sink',
    functionalClass: 'media-editor',
    workspaceType: 'preview',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: true,
    phase: 'P2',
  },
  'blocking-stage': {
    kind: 'blocking-stage',
    functionalClass: 'media-editor',
    workspaceType: 'editor',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: true,
    phase: 'P4',
  },
  'panorama-sphere': {
    kind: 'panorama-sphere',
    functionalClass: 'media-editor',
    workspaceType: 'preview',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: true,
    phase: 'P4',
    note: 'concealed',
  },

  // ── §7.4 工具处理类 → Tool ──
  'bg-remove': {
    kind: 'bg-remove',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'upscale-lite': {
    kind: 'upscale-lite',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'grid-split': {
    kind: 'grid-split',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'grid-compose': {
    kind: 'grid-compose',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'frame-endpoints': {
    kind: 'frame-endpoints',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'text-chunker': {
    kind: 'text-chunker',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'link-parser': {
    kind: 'link-parser',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'scale-fit': {
    kind: 'scale-fit',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'picture-merge': {
    kind: 'picture-merge',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'picture-diff': {
    kind: 'picture-diff',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'local-enhance': {
    kind: 'local-enhance',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'watermark-clean': {
    kind: 'watermark-clean',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'asset-import': {
    kind: 'asset-import',
    functionalClass: 'processing-tool',
    workspaceType: 'none',
    attachToNode: false,
    compactCanvas: false,
    showRun: false,
    showPreview: true,
    phase: 'P2',
    note: '节点内多文件上传，无跟随工作区',
  },
  'mesh-import': {
    kind: 'mesh-import',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P2',
  },
  'sketch-pad': {
    kind: 'sketch-pad',
    functionalClass: 'processing-tool',
    workspaceType: 'tool',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: true,
    phase: 'P4',
  },

  // ── §7.5 配置类 → Config ──
  'export-pack': {
    kind: 'export-pack',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P2',
  },
  'subtitle-burn': {
    kind: 'subtitle-burn',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P2',
  },
  'audio-mix': {
    kind: 'audio-mix',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P2',
  },
  'comfy-workflow': {
    kind: 'comfy-workflow',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P4',
  },
  'model-market': {
    kind: 'model-market',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P4',
  },
  'color-grade': {
    kind: 'color-grade',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P4',
  },
  'control-preprocess': {
    kind: 'control-preprocess',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P4',
  },
  'depth-pass': {
    kind: 'depth-pass',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P4',
  },
  'light-rig': {
    kind: 'light-rig',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P4',
  },
  'lipsync-pass': {
    kind: 'lipsync-pass',
    functionalClass: 'processing-tool',
    workspaceType: 'config',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P4',
  },

  // ── §7.6 分析报告类 → Report ──
  'continuity-check': {
    kind: 'continuity-check',
    functionalClass: 'analysis-report',
    workspaceType: 'report',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'reference-analyze': {
    kind: 'reference-analyze',
    functionalClass: 'analysis-report',
    workspaceType: 'report',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'prompt-diff': {
    kind: 'prompt-diff',
    functionalClass: 'analysis-report',
    workspaceType: 'report',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'review-gate': {
    kind: 'review-gate',
    functionalClass: 'pipeline-control',
    workspaceType: 'report',
    attachToNode: true,
    compactCanvas: true,
    showRun: false,
    showPreview: false,
    phase: 'P2',
    note: '无结果时用 control',
  },

  // ── §7.7 流程控制类 → Control / None ──
  'iterator': {
    kind: 'iterator',
    functionalClass: 'pipeline-control',
    workspaceType: 'control',
    attachToNode: true,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'picker': {
    kind: 'picker',
    functionalClass: 'pipeline-control',
    workspaceType: 'control',
    attachToNode: true,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'passthrough': {
    kind: 'passthrough',
    functionalClass: 'pipeline-control',
    workspaceType: 'none',
    attachToNode: false,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'variant-fork': {
    kind: 'variant-fork',
    functionalClass: 'pipeline-control',
    workspaceType: 'control',
    attachToNode: true,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'recipe-spawn': {
    kind: 'recipe-spawn',
    functionalClass: 'pipeline-control',
    workspaceType: 'control',
    attachToNode: true,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
  },
  'batch-runner': {
    kind: 'batch-runner',
    functionalClass: 'pipeline-control',
    workspaceType: 'task',
    attachToNode: true,
    compactCanvas: true,
    showRun: true,
    showPreview: false,
    phase: 'P2',
  },
  'asset-watch': {
    kind: 'asset-watch',
    functionalClass: 'pipeline-control',
    workspaceType: 'control',
    attachToNode: true,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P2',
    note: 'concealed',
  },
  'beat-sync': {
    kind: 'beat-sync',
    functionalClass: 'pipeline-control',
    workspaceType: 'control',
    attachToNode: true,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P4',
    note: 'concealed',
  },
  'memo': {
    kind: 'memo',
    functionalClass: 'pipeline-control',
    workspaceType: 'none',
    attachToNode: false,
    compactCanvas: false,
    showRun: false,
    showPreview: false,
    phase: 'P4',
    note: '双击内联编辑',
  },
};

/** 根据 kind 查找 AttachedWorkspaceSpec，找不到返回 null */
export function resolveAttachedWorkspace(kind: string): AttachedWorkspaceSpec | null {
  return ATTACHED_WORKSPACE_REGISTRY[kind] ?? null;
}

/** 已实现屏幕弹窗工作区内容类型（功能在 AttachedWorkspaceRouter） */
const IMPLEMENTED_WORKSPACE_TYPES = new Set<AttachedWorkspaceType>([
  'generation',
  'tool',
  'report',
  'control',
  'task',
  'preview',
  'table',
  'config',
]);

/**
 * 是否使用 L1 统一摘要卡（CanvasNodeShell）。
 * 生成类等：摘要 + 底部工作区；完整表单不进画布卡。
 * 见 docs/NX9-CANVAS-NODE-CONTRACT.md
 */
export function shouldUseCompactNodeShell(kind: string): boolean {
  const spec = resolveAttachedWorkspace(kind);
  if (!spec?.attachToNode) return false;
  if (spec.workspaceType === 'none') return false;
  if (spec.compactCanvas) return true;
  return IMPLEMENTED_WORKSPACE_TYPES.has(spec.workspaceType);
}
