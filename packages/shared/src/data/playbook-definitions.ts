export type PlaybookId =
  | 'pb-ai-comic-3d'
  | 'pb-ai-comic-live'
  | 'pb-anime'
  | 'pb-ai-short-film'
  | 'pb-viral-short'
  | 'pb-ecom-image'
  | 'pb-ecom-video'
  | 'pb-line-art-episode'
  | 'pb-character-ip'
  | 'pb-voice-drama'
  | 'pb-seedance-sclass'
  | 'pb-blank-advanced';

export type PlaybookStepAction =
  | { type: 'open_rail'; tab: 'script' | 'storyboard' | 'inspector' | 'library'; sub?: string }
  | { type: 'open_panel'; panel: 'storyboard-full' | 'episode-studio' | 'director-3d' }
  | { type: 'load_template'; templateId: string; mode: 'merge' | 'replace' }
  | { type: 'focus_block'; kind: string; spawnIfMissing?: boolean }
  | { type: 'run_cascade'; fromKind: string }
  | { type: 'run_batch'; blockKinds?: string[] }
  | {
      type: 'storyboard_action';
      action:
        | 'approve_all_pending'
        | 'batch_line_art'
        | 'batch_keyframes'
        | 'approve_all_keyframes'
        | 'batch_videos'
        | 'sync_preview'
        | 'simple_export';
    }
  | { type: 'set_view_mode'; mode: 'explore' | 'produce' | 'review' }
  | { type: 'spawn_camera_blocks'; mode: '3d' | 'live' }
  | { type: 'wait_user'; hint: string };

export interface PlaybookStepDef {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  readinessKey: string;
  primaryAction: PlaybookStepAction;
  secondaryActions?: PlaybookStepAction[];
  templateIds?: string[];
  canvasNodeKinds?: string[];
  stepIndex?: number;
  verifyHint: string;
  optional?: true;
}

export interface PlaybookDefinition {
  id: PlaybookId;
  label: string;
  subtitle: string;
  icon: string;
  category: 'episode' | 'short' | 'asset' | 'advanced';
  estimatedMinutes: number;
  featured: boolean;
  steps: PlaybookStepDef[];
  bootstrapTemplates: { templateId: string; mode: 'merge' | 'replace' }[];
}

/** 核心 6 步：编剧台 → 分镜台 → 导演台 → 视频生成 → 智能剪辑 → 导出交付 */
const CORE_EPISODE_STEPS: PlaybookStepDef[] = [
  {
    id: 'script-desk',
    label: '① 编剧台',
    shortLabel: '编剧台',
    description: '选题、世界观与剧本成稿；产出可交给分镜台的剧本包',
    readinessKey: 'has_source_text',
    primaryAction: { type: 'focus_block', kind: 'script-desk', spawnIfMissing: true },
    canvasNodeKinds: ['script-desk'],
    stepIndex: 1,
    verifyHint: '编剧台已有成稿或剧本包',
  },
  {
    id: 'storyboard-desk',
    label: '② 分镜台',
    shortLabel: '分镜台',
    description: '拆镜、镜表、线稿与故事板总览；确认本集后进入导演台',
    readinessKey: 'story_grid_confirmed',
    primaryAction: { type: 'focus_block', kind: 'storyboard-desk', spawnIfMissing: true },
    canvasNodeKinds: ['storyboard-desk'],
    stepIndex: 2,
    verifyHint: '当前集分镜台已确认',
  },
  {
    id: 'director-desk',
    label: '③ 导演台',
    shortLabel: '导演台',
    description: '批出关键帧、台内审阅放行后推送视频生成',
    readinessKey: 'all_keyframes_approved',
    primaryAction: { type: 'focus_block', kind: 'director-desk', spawnIfMissing: true },
    secondaryActions: [
      { type: 'storyboard_action', action: 'batch_keyframes' },
      { type: 'set_view_mode', mode: 'review' },
      { type: 'storyboard_action', action: 'approve_all_keyframes' },
    ],
    canvasNodeKinds: ['director-desk', 'picture-gen'],
    stepIndex: 3,
    verifyHint: '全部 keyframeStatus = approved',
  },
  {
    id: 'video-gen',
    label: '④ 视频生成',
    shortLabel: '视频生成',
    description: '按已放行关键帧与运镜提示，逐镜生成镜头视频；可在视频工作区批准后进入剪辑',
    // F-007: 改为 has_video_assets（有视频即可，批准作为第④步内可选勾选）
    readinessKey: 'has_video_assets',
    primaryAction: { type: 'storyboard_action', action: 'batch_videos' },
    secondaryActions: [{ type: 'focus_block', kind: 'clip-gen', spawnIfMissing: true }],
    canvasNodeKinds: ['clip-gen'],
    stepIndex: 4,
    verifyHint: '全部镜头有 videoAssetId；漫剧 AI 编排前请在视频工作区批准',
  },
  {
    id: 'smart-edit',
    label: '⑤ 智能剪辑',
    shortLabel: '智能剪辑',
    description: '按本集已批准视频编排时间线，润色节奏与转场',
    // F-050: 要求有效时间线 + 用户确认（confirmedAt）
    readinessKey: 'has_timeline_confirmed',
    primaryAction: { type: 'focus_block', kind: 'clip-editor', spawnIfMissing: true },
    canvasNodeKinds: ['clip-editor'],
    stepIndex: 5,
    verifyHint: '智能剪辑时间线已确认送交导出（漫剧编排仅纳入 videoStatus=approved）',
  },
  {
    id: 'export',
    label: '⑥ 导出交付',
    shortLabel: '导出交付',
    description: '打包导出本集成片与交付物',
    readinessKey: 'export_ready',
    primaryAction: { type: 'focus_block', kind: 'export-pack', spawnIfMissing: true },
    secondaryActions: [{ type: 'storyboard_action', action: 'simple_export' }],
    canvasNodeKinds: ['export-pack'],
    stepIndex: 6,
    verifyHint: '导出成功',
  },
];

/** AI 短片 7 步：核心 6 步 + 声音（对白/BGM） */
const AI_SHORT_FILM_STEPS: PlaybookStepDef[] = [
  {
    id: 'script-desk',
    label: '① 编剧台',
    shortLabel: '编剧台',
    description: '选题、世界观与剧本成稿；产出可交给分镜台的剧本包',
    readinessKey: 'has_source_text',
    primaryAction: { type: 'focus_block', kind: 'script-desk', spawnIfMissing: true },
    canvasNodeKinds: ['script-desk'],
    stepIndex: 1,
    verifyHint: '编剧台已有成稿或剧本包',
  },
  {
    id: 'storyboard-desk',
    label: '② 分镜台',
    shortLabel: '分镜台',
    description: '拆镜、镜表、线稿与故事板总览；确认本集后进入导演台',
    readinessKey: 'story_grid_confirmed',
    primaryAction: { type: 'focus_block', kind: 'storyboard-desk', spawnIfMissing: true },
    canvasNodeKinds: ['storyboard-desk'],
    stepIndex: 2,
    verifyHint: '当前集分镜台已确认',
  },
  {
    id: 'director-desk',
    label: '③ 导演台',
    shortLabel: '导演台',
    description: '批出关键帧、台内审阅放行后推送视频生成',
    readinessKey: 'all_keyframes_approved',
    primaryAction: { type: 'focus_block', kind: 'director-desk', spawnIfMissing: true },
    secondaryActions: [
      { type: 'storyboard_action', action: 'batch_keyframes' },
      { type: 'set_view_mode', mode: 'review' },
      { type: 'storyboard_action', action: 'approve_all_keyframes' },
    ],
    canvasNodeKinds: ['director-desk', 'picture-gen'],
    stepIndex: 3,
    verifyHint: '全部 keyframeStatus = approved',
  },
  {
    id: 'video-gen',
    label: '④ 视频生成',
    shortLabel: '视频生成',
    description: '按已放行关键帧与运镜提示，逐镜生成镜头视频；可在视频工作区批准后进入剪辑',
    readinessKey: 'has_video_assets',
    primaryAction: { type: 'storyboard_action', action: 'batch_videos' },
    secondaryActions: [{ type: 'focus_block', kind: 'clip-gen', spawnIfMissing: true }],
    canvasNodeKinds: ['clip-gen'],
    stepIndex: 4,
    verifyHint: '全部镜头有 videoAssetId；漫剧 AI 编排前请在视频工作区批准',
  },
  {
    id: 'sound-gen',
    label: '⑤ 声音',
    shortLabel: '声音',
    description: '多角色配音、BGM 与音效；模板含三个声音节点，可一次挂齐',
    readinessKey: 'has_sound_assets',
    primaryAction: { type: 'focus_block', kind: 'sound-gen', spawnIfMissing: true },
    canvasNodeKinds: ['sound-gen'],
    stepIndex: 5,
    verifyHint: '声音节点已成功产出音频',
  },
  {
    id: 'smart-edit',
    label: '⑥ 智能剪辑',
    shortLabel: '智能剪辑',
    description: '编排已批准画面、对白与配乐时间线，确认后送交导出',
    readinessKey: 'has_timeline_confirmed',
    primaryAction: { type: 'focus_block', kind: 'clip-editor', spawnIfMissing: true },
    canvasNodeKinds: ['clip-editor'],
    stepIndex: 6,
    verifyHint: '智能剪辑时间线已确认送交导出（漫剧编排仅纳入 videoStatus=approved）',
  },
  {
    id: 'export',
    label: '⑦ 导出交付',
    shortLabel: '导出交付',
    description: '打包导出本集成片与交付物',
    readinessKey: 'export_ready',
    primaryAction: { type: 'focus_block', kind: 'export-pack', spawnIfMissing: true },
    secondaryActions: [{ type: 'storyboard_action', action: 'simple_export' }],
    canvasNodeKinds: ['export-pack'],
    stepIndex: 7,
    verifyHint: '导出成功',
  },
];

export const PLAYBOOK_DEFINITIONS: PlaybookDefinition[] = [
  {
    id: 'pb-ai-short-film',
    label: 'AI 短片',
    subtitle: '编剧→分镜→导演→视频→声音→智能剪辑→导出（有声成片）',
    icon: 'Film',
    category: 'episode',
    estimatedMinutes: 50,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-ai-short-film', mode: 'replace' }],
    steps: AI_SHORT_FILM_STEPS,
  },
  {
    id: 'pb-ai-comic-live',
    label: 'AI 漫剧（核心流程）',
    subtitle: '编剧台→分镜台→导演台→视频生成→智能剪辑→导出交付',
    icon: 'Film',
    category: 'episode',
    estimatedMinutes: 40,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-core-episode', mode: 'replace' }],
    steps: CORE_EPISODE_STEPS,
  },
  {
    id: 'pb-ai-comic-3d',
    label: 'AI 漫剧 · 3D 风格',
    subtitle: '同核心 6 步；导演台内可摆位、定机位并回写分镜',
    icon: 'Clapperboard',
    category: 'episode',
    estimatedMinutes: 45,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-core-episode', mode: 'replace' }],
    steps: CORE_EPISODE_STEPS,
  },
  {
    id: 'pb-anime',
    label: 'AI 漫剧 · 动漫',
    subtitle: '同核心 6 步，适合动漫风格出图与出片',
    icon: 'PenTool',
    category: 'episode',
    estimatedMinutes: 40,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-core-episode', mode: 'replace' }],
    steps: CORE_EPISODE_STEPS,
  },
  {
    id: 'pb-viral-short',
    label: '爆款短视频',
    subtitle: '链接复刻 / 热点二创 → 竖屏快发 ≤60s',
    icon: 'Zap',
    category: 'short',
    estimatedMinutes: 20,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-link-replicate', mode: 'replace' }],
    steps: [
      {
        id: 'source',
        label: '① 链接采集',
        description: '粘贴爆款视频/图文链接并解析素材',
        readinessKey: 'has_source_text',
        primaryAction: { type: 'focus_block', kind: 'link-parser', spawnIfMissing: true },
        canvasNodeKinds: ['link-parser', 'asset-import'],
        verifyHint: '链接采集节点已有 URL 或解析结果',
      },
      {
        id: 'analyze',
        label: '② 参考约束',
        description: '用参考板整理风格、镜头与画面约束',
        // F-007: 爆款参考步使用 has_reference_board
        readinessKey: 'has_reference_board',
        primaryAction: { type: 'focus_block', kind: 'reference-board', spawnIfMissing: true },
        canvasNodeKinds: ['reference-board', 'link-parser'],
        verifyHint: '参考板已有参考图或风格备注',
      },
      {
        id: 'generate',
        label: '③ 生成',
        description: '图像 / 视频生成仿作内容',
        // F-007: 爆款生成使用 has_viral_output
        readinessKey: 'has_viral_output',
        primaryAction: { type: 'focus_block', kind: 'clip-gen', spawnIfMissing: true },
        canvasNodeKinds: ['picture-gen', 'clip-gen'],
        verifyHint: '已生成图像或视频',
      },
      {
        // F-030: 爆款流程补智能剪辑
        id: 'smart-edit',
        label: '④ 智能剪辑',
        shortLabel: '智能剪辑',
        description: '裁切节奏、加字幕与转场，整理成爆款短片',
        readinessKey: 'has_timeline_draft',
        primaryAction: { type: 'focus_block', kind: 'clip-editor', spawnIfMissing: true },
        canvasNodeKinds: ['clip-editor'],
        optional: true,
        verifyHint: '可选：智能剪辑节点时间线已有片段，可跳过直达导出',
      },
      {
        id: 'export',
        label: '⑤ 导出',
        description: '交付打包导出',
        readinessKey: 'export_ready',
        primaryAction: { type: 'focus_block', kind: 'export-pack', spawnIfMissing: true },
        canvasNodeKinds: ['export-pack'],
        verifyHint: '导出成功',
      },
    ],
  },
  {
    id: 'pb-ecom-image',
    label: '电商生图',
    subtitle: '商品素材 → 主图/详情图 → 导出',
    icon: 'ShoppingBag',
    category: 'short',
    estimatedMinutes: 12,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-ecom-image', mode: 'replace' }],
    steps: [
      {
        id: 'product-assets',
        label: '① 商品素材',
        shortLabel: '商品素材',
        description: '上传产品实拍、白底图或竞品参考图',
        readinessKey: 'has_product_media',
        primaryAction: { type: 'focus_block', kind: 'asset-import', spawnIfMissing: true },
        canvasNodeKinds: ['asset-import'],
        stepIndex: 1,
        verifyHint: '素材导入节点已有商品图片',
      },
      {
        id: 'ecom-picture',
        label: '② 电商生图',
        shortLabel: '电商生图',
        description: '填写卖点与风格，生成主图、详情图或多角度商品图',
        readinessKey: 'canvas_node_done picture-gen',
        primaryAction: { type: 'focus_block', kind: 'picture-gen', spawnIfMissing: true },
        canvasNodeKinds: ['picture-gen'],
        stepIndex: 2,
        verifyHint: '图像生成节点已成功出图',
      },
      {
        id: 'export',
        label: '③ 导出交付',
        shortLabel: '导出',
        description: '打包导出电商图片交付物',
        readinessKey: 'export_ready',
        primaryAction: { type: 'focus_block', kind: 'export-pack', spawnIfMissing: true },
        canvasNodeKinds: ['export-pack'],
        stepIndex: 3,
        verifyHint: '导出成功',
      },
    ],
  },
  {
    id: 'pb-ecom-video',
    label: '电商生视频',
    subtitle: '商品图 → 图生视频/口播 → 智能剪辑 → 导出',
    icon: 'ShoppingBag',
    category: 'short',
    estimatedMinutes: 20,
    featured: true,
    bootstrapTemplates: [{ templateId: 'tpl-ecom-video', mode: 'replace' }],
    steps: [
      {
        id: 'product-assets',
        label: '① 商品素材',
        shortLabel: '商品素材',
        description: '导入商品主图，或先用图像生成补齐主视觉',
        readinessKey: 'has_product_media',
        primaryAction: { type: 'focus_block', kind: 'asset-import', spawnIfMissing: true },
        secondaryActions: [{ type: 'focus_block', kind: 'picture-gen', spawnIfMissing: true }],
        canvasNodeKinds: ['asset-import', 'picture-gen'],
        stepIndex: 1,
        verifyHint: '已有商品图（导入或生成）',
      },
      {
        id: 'ecom-video',
        label: '② 电商生视频',
        shortLabel: '电商生视频',
        description: '图生视频展示卖点，或口播介绍商品',
        readinessKey: 'canvas_node_done clip-gen',
        primaryAction: { type: 'focus_block', kind: 'clip-gen', spawnIfMissing: true },
        canvasNodeKinds: ['clip-gen'],
        stepIndex: 2,
        verifyHint: '视频生成节点已成功出片',
      },
      {
        id: 'smart-edit',
        label: '③ 智能剪辑',
        shortLabel: '智能剪辑',
        description: '裁切节奏、加字幕与转场，整理成带货短片',
        readinessKey: 'canvas_node_done clip-editor',
        primaryAction: { type: 'focus_block', kind: 'clip-editor', spawnIfMissing: true },
        canvasNodeKinds: ['clip-editor'],
        stepIndex: 3,
        verifyHint: '智能剪辑节点已完成编排',
        optional: true,
      },
      {
        id: 'export',
        label: '④ 导出交付',
        shortLabel: '导出',
        description: '打包导出电商短视频交付物',
        readinessKey: 'export_ready',
        primaryAction: { type: 'focus_block', kind: 'export-pack', spawnIfMissing: true },
        canvasNodeKinds: ['export-pack'],
        stepIndex: 4,
        verifyHint: '导出成功',
      },
    ],
  },
  {
    id: 'pb-line-art-episode',
    label: '线稿分镜单集',
    subtitle: '进阶：线稿 → 批审 → 出图/出片',
    icon: 'PenTool',
    category: 'episode',
    estimatedMinutes: 30,
    featured: false,
    bootstrapTemplates: [{ templateId: 'tpl-line-art-storyboard', mode: 'merge' }],
    steps: [
      {
        id: 'shot-script',
        label: '分镜脚本',
        description: '在 Script Tab 编写分镜脚本',
        readinessKey: 'has_source_text',
        primaryAction: { type: 'open_rail', tab: 'script' },
        verifyHint: '脚本内容已填入',
      },
      {
        id: 'story-grid',
        label: '故事板网格',
        description: '写入故事板网格，确认镜头列表',
        readinessKey: 'has_storyboard_shots',
        primaryAction: { type: 'open_rail', tab: 'storyboard' },
        verifyHint: '故事板有镜头',
      },
      {
        id: 'line-art',
        label: '批量线稿',
        description: '对故事板批量 AI 生成线稿',
        readinessKey: 'has_line_art_thumbnails',
        primaryAction: { type: 'storyboard_action', action: 'batch_line_art' },
        verifyHint: '≥50% 镜头有线稿缩略图',
      },
      {
        id: 'approve',
        label: '批审',
        description: '审阅线稿，全部 approved',
        readinessKey: 'all_shots_approved',
        primaryAction: { type: 'set_view_mode', mode: 'review' },
        secondaryActions: [{ type: 'storyboard_action', action: 'approve_all_pending' }],
        verifyHint: '所有镜头 marked approved',
      },
      {
        id: 'export',
        label: '导出',
        description: 'export-pack 导出',
        readinessKey: 'export_ready',
        primaryAction: { type: 'storyboard_action', action: 'simple_export' },
        verifyHint: '可成功导出',
      },
    ],
  },
  {
    id: 'pb-character-ip',
    label: '角色 IP 设定',
    subtitle: '进阶：Backlot 角色 → 三视图',
    icon: 'UserCircle',
    category: 'asset',
    estimatedMinutes: 15,
    featured: false,
    bootstrapTemplates: [{ templateId: 'tpl-nx9-character-pipeline', mode: 'merge' }],
    steps: [
      {
        id: 'new-character',
        label: '新建角色',
        description: '在 Backlot 中新建或导入角色',
        readinessKey: 'has_character_refs',
        primaryAction: { type: 'open_rail', tab: 'library', sub: 'character' },
        verifyHint: '角色已创建在 Backlot 中',
      },
      {
        id: 'export',
        label: '导出',
        description: '导出角色包',
        readinessKey: 'canvas_node_done',
        primaryAction: { type: 'focus_block', kind: 'export-pack' },
        verifyHint: '角色包导出成功',
      },
    ],
  },
  {
    id: 'pb-voice-drama',
    label: '声音剧',
    subtitle: '对白 → 多角色配音 → 智能剪辑音轨 → 导出',
    icon: 'Headphones',
    category: 'asset',
    estimatedMinutes: 20,
    featured: false,
    bootstrapTemplates: [{ templateId: 'tpl-voice-drama', mode: 'replace' }],
    steps: [
      {
        id: 'script-desk',
        label: '① 对白稿',
        shortLabel: '对白稿',
        description: '编写对白稿或导入剧本',
        readinessKey: 'has_source_text',
        primaryAction: { type: 'focus_block', kind: 'script-desk', spawnIfMissing: true },
        canvasNodeKinds: ['script-desk'],
        stepIndex: 1,
        verifyHint: '对白稿已就绪',
      },
      {
        id: 'sound-gen',
        label: '② 配音',
        shortLabel: '配音',
        description: '多角色批量 TTS / BGM',
        readinessKey: 'has_sound_assets',
        primaryAction: { type: 'focus_block', kind: 'sound-gen', spawnIfMissing: true },
        canvasNodeKinds: ['sound-gen'],
        stepIndex: 2,
        verifyHint: '声音节点已成功产出音频',
      },
      {
        id: 'smart-edit',
        label: '③ 智能剪辑',
        shortLabel: '剪辑',
        description: '注入对白与 BGM 轨，确认时间线',
        readinessKey: 'has_timeline_confirmed',
        primaryAction: { type: 'focus_block', kind: 'clip-editor', spawnIfMissing: true },
        canvasNodeKinds: ['clip-editor'],
        stepIndex: 3,
        verifyHint: '时间线已确认',
      },
      {
        id: 'export',
        label: '④ 导出',
        shortLabel: '导出',
        description: '导出音频/成片交付包',
        readinessKey: 'export_ready',
        primaryAction: { type: 'focus_block', kind: 'export-pack', spawnIfMissing: true },
        canvasNodeKinds: ['export-pack'],
        stepIndex: 4,
        verifyHint: '导出成功',
      },
    ],
  },
  {
    id: 'pb-seedance-sclass',
    label: 'Seedance 连续镜头',
    subtitle: '进阶：Seedance 动效链',
    icon: 'Camera',
    category: 'advanced',
    estimatedMinutes: 30,
    featured: false,
    bootstrapTemplates: [{ templateId: 'tpl-sclass-seedance', mode: 'merge' }],
    steps: [
      {
        id: 'shot-script',
        label: '分镜脚本',
        description: '编写 shot-script',
        readinessKey: 'has_source_text',
        primaryAction: { type: 'open_rail', tab: 'script' },
        verifyHint: '有输入',
      },
      {
        id: 'export',
        label: '导出',
        description: '导出成片',
        readinessKey: 'export_ready',
        primaryAction: { type: 'storyboard_action', action: 'simple_export' },
        verifyHint: '导出成功',
      },
    ],
  },
  {
    id: 'pb-blank-advanced',
    label: '自由模式',
    subtitle: '从空白开始，自行搭建节点（全部节点仍可用）',
    icon: 'Box',
    category: 'advanced',
    estimatedMinutes: 0,
    featured: false,
    steps: [],
    bootstrapTemplates: [],
  },
];
