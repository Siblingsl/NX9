/**
 * Block kind migration — 合并 / 删除节点时，旧工作区加载自动改写 type。
 * 目标：主产品面约 30 个活跃 kind，其余一律迁到等价主节点。
 */

export const BLOCK_KIND_MIGRATIONS: Record<string, string> = {
  // ── 已废弃 Hub / Agent ──
  'workflow-hub': 'memo',
  'wallet-hub': 'memo',
  'hub-market': 'memo',
  'hub-toolkit': 'memo',
  'vibe-workbench': 'memo',
  'param-inject': 'memo',
  'grok-agent': 'chat-model',
  'codex-agent': 'chat-model',
  'codex-picture': 'picture-gen',
  'comfy-builder': 'picture-gen',
  'comfy-market': 'picture-gen',
  'fal-market': 'picture-gen',
  'model-market': 'picture-gen',
  'comfy-workflow': 'picture-gen',

  // ── 分镜家族 → 分镜台 ──
  'story-grid': 'storyboard-desk',
  'storyboard-preview': 'storyboard-desk',
  'shot-script': 'storyboard-desk',

  // ── 视频家族 → 视频生成 ──
  'motion-story': 'clip-gen',
  'seedance-chain': 'clip-gen',
  'bridge-clip': 'clip-gen',
  'lipsync-pass': 'clip-gen',
  'photo-speak': 'clip-gen',

  // ── 配音家族 → AI 配音 ──
  'voice-cast': 'sound-gen',
  'music-gen': 'sound-gen',

  // ── 字幕家族 → 字幕台 ──
  'subtitle-burn': 'caption-asr',

  // ── 后期 → 视频剪辑 ──
  'audio-mix': 'clip-editor',
  'color-grade': 'clip-editor',
  'beat-sync': 'clip-editor',
  'clip-sink': 'clip-editor',

  // ── 3D 空间 → 3D 导演台 ──
  'blocking-stage': 'director-3d',
  'light-rig': 'director-3d',
  'depth-pass': 'director-3d',
  'panorama-sphere': 'director-3d',
  'panorama-flat': 'director-3d',
  'multi-view-3d': 'director-3d',

  // ── Prompt / 风格 已合并 ──
  'cinema-prompt': 'prompt-studio',
  'camera-prompt': 'prompt-studio',
  'angle-visual': 'prompt-studio',
  'portrait-craft': 'prompt-studio',
  'pose-craft': 'prompt-studio',
  'prompt-diff': 'prompt-studio',
  'grid-prompt-reverse': 'prompt-studio',
  'style-atelier': 'style-lab',
  'tag-atelier': 'style-lab',
  'reference-analyze': 'reference-board',
  'portrait-flow': 'picture-gen',
  'portrait-meta': 'prompt',
  'touch-up': 'inpaint-edit',

  // ── 增强 / 修图 ──
  'topaz-picture': 'local-enhance',
  'topaz-clip': 'local-enhance',
  'upscale-lite': 'local-enhance',
  'watermark-clean': 'local-enhance',
  'scale-fit': 'local-enhance',
  'control-preprocess': 'local-enhance',
  'sketch-pad': 'picture-gen',

  // ── 素材 / 工具收敛 ──
  'asset-bundle': 'iterator',
  'render-slot': 'asset-import',
  'preview-sink': 'asset-import',
  'frame-sampler': 'frame-endpoints',
  'picker': 'iterator',
  'batch-runner': 'iterator',
  'picture-merge': 'grid-compose',
  'picture-diff': 'local-enhance',
  'link-parser': 'asset-import',
  'web-view': 'asset-import',
  'blueprint': 'memo',
  'passthrough': 'memo',
  'thumbnail-maker': 'export-pack',
  'variant-fork': 'review-gate',
  'recipe-spawn': 'memo',
  'asset-watch': 'asset-import',
};

/** 迁移时写入 data 的模式补丁，让主节点打开对应能力 */
export const BLOCK_KIND_MIGRATION_PATCHES: Record<string, Record<string, unknown>> = {
  'motion-story': { videoMode: 'motion' },
  'seedance-chain': { videoMode: 'chain', model: 'seedance' },
  'bridge-clip': { videoMode: 'bridge' },
  'lipsync-pass': { videoMode: 'lipsync' },
  'photo-speak': { videoMode: 'photo-speak' },

  'voice-cast': { soundMode: 'cast' },
  'music-gen': { soundMode: 'music' },

  'subtitle-burn': { captionMode: 'burn' },

  'audio-mix': { editorMode: 'audio' },
  'color-grade': { editorMode: 'grade' },
  'beat-sync': { editorMode: 'beat' },

  'blocking-stage': { directorMode: 'blocking' },
  'light-rig': { directorMode: 'light' },
  'depth-pass': { directorMode: 'depth' },
  'panorama-sphere': { directorMode: 'panorama' },
  'panorama-flat': { directorMode: 'panorama' },

  'cinema-prompt': { studioTab: 'cinema' },
  'camera-prompt': { studioTab: 'camera' },
  'angle-visual': { studioTab: 'angle' },
  'portrait-craft': { studioTab: 'portrait' },
  'pose-craft': { studioTab: 'pose' },
  'style-atelier': { styleLabTab: 'style' },
  'tag-atelier': { styleLabTab: 'tag' },

  'topaz-picture': { enhanceMode: 'picture' },
  'topaz-clip': { enhanceMode: 'clip' },
  'upscale-lite': { enhanceMode: 'upscale' },
  'watermark-clean': { enhanceMode: 'watermark' },
  'control-preprocess': { enhanceMode: 'control' },
  'scale-fit': { enhanceMode: 'scale' },
  'picture-diff': { enhanceMode: 'diff' },

  'shot-script': { deskTab: 'script' },
  'story-grid': { deskTab: 'grid' },
  'storyboard-preview': { deskTab: 'preview' },

  'blueprint': { memoKind: 'blueprint' },
};

export const DEPRECATED_BLOCK_KINDS = Object.keys(BLOCK_KIND_MIGRATIONS);

export interface MigratableNode {
  id: string;
  type?: string | null;
  data?: Record<string, unknown>;
}

export function getBlockKindMigrationTarget(kind: string): string | undefined {
  return BLOCK_KIND_MIGRATIONS[kind];
}

export function isDeprecatedBlockKind(kind: string): boolean {
  return kind in BLOCK_KIND_MIGRATIONS;
}

export function migrateBlockKind(kind: string): string {
  return BLOCK_KIND_MIGRATIONS[kind] ?? kind;
}

export function migrateBlockKinds<T extends MigratableNode>(
  nodes: T[],
): { nodes: T[]; migratedCount: number } {
  let migratedCount = 0;
  const nodesOut = nodes.map((node) => {
    const kind = String(node.type ?? '');
    const target = BLOCK_KIND_MIGRATIONS[kind];
    if (!target) return node;
    migratedCount += 1;
    const patch = BLOCK_KIND_MIGRATION_PATCHES[kind] ?? {};
    return {
      ...node,
      type: target,
      data: {
        ...(node.data ?? {}),
        ...patch,
        migratedFrom: kind,
        migrationNote: `已从「${kind}」合并/迁移至「${target}」`,
      },
    } as T;
  });
  return { nodes: nodesOut, migratedCount };
}
