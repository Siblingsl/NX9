/**
 * Block kind migration — 合并 / 删除节点时，旧工作区加载自动改写 type。
 * 目标：主产品面约 16 个 Dock 节点；迁移目标必须是最终活跃 kind（单跳）。
 */

export const BLOCK_KIND_MIGRATIONS: Record<string, string> = {
  // ── Hub / Agent → 生成或素材 ──
  'workflow-hub': 'asset-import',
  'wallet-hub': 'asset-import',
  'hub-market': 'asset-import',
  'hub-toolkit': 'asset-import',
  'vibe-workbench': 'asset-import',
  'param-inject': 'asset-import',
  'grok-agent': 'picture-gen',
  'codex-agent': 'picture-gen',
  'codex-picture': 'picture-gen',
  'comfy-builder': 'picture-gen',
  'comfy-market': 'picture-gen',
  'fal-market': 'picture-gen',
  'model-market': 'picture-gen',
  'comfy-workflow': 'picture-gen',
  'chat-model': 'picture-gen',
  'memo': 'asset-import',
  'blueprint': 'asset-import',
  'passthrough': 'asset-import',
  'recipe-spawn': 'asset-import',

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
  'frame-endpoints': 'clip-gen',
  'frame-sampler': 'clip-gen',

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
  'mesh-import': 'director-3d',
  'mesh-viewer': 'director-3d',

  // ── Prompt / 风格 → 生成或参考板 ──
  'prompt': 'picture-gen',
  'prompt-studio': 'picture-gen',
  'cinema-prompt': 'picture-gen',
  'camera-prompt': 'picture-gen',
  'angle-visual': 'picture-gen',
  'portrait-craft': 'picture-gen',
  'pose-craft': 'picture-gen',
  'prompt-diff': 'picture-gen',
  'grid-prompt-reverse': 'picture-gen',
  'portrait-flow': 'picture-gen',
  'portrait-meta': 'picture-gen',
  'style-lab': 'reference-board',
  'style-atelier': 'reference-board',
  'tag-atelier': 'reference-board',
  'reference-analyze': 'reference-board',
  'touch-up': 'inpaint-edit',

  // ── 增强 / 修图 ──
  'topaz-picture': 'local-enhance',
  'topaz-clip': 'local-enhance',
  'upscale-lite': 'local-enhance',
  'watermark-clean': 'local-enhance',
  'scale-fit': 'local-enhance',
  'control-preprocess': 'local-enhance',
  'bg-remove': 'local-enhance',
  'picture-diff': 'local-enhance',
  'sketch-pad': 'picture-gen',

  // ── 素材 / 工具收敛 ──
  'asset-bundle': 'iterator',
  'render-slot': 'asset-import',
  'preview-sink': 'asset-import',
  'picker': 'iterator',
  'batch-runner': 'iterator',
  'picture-merge': 'grid-compose',
  'grid-split': 'grid-compose',
  'web-view': 'asset-import',
  'thumbnail-maker': 'export-pack',
  'variant-fork': 'review-gate',
  'asset-watch': 'asset-import',
  'text-chunker': 'dialogue-sheet',

  // ── 角色/场景设定 → 素材导入（主路径改走素材库） ──
  'character-sheet': 'asset-import',
  'scene-card': 'asset-import',
};

/** 迁移时写入 data 的模式补丁，让主节点打开对应能力 */
export const BLOCK_KIND_MIGRATION_PATCHES: Record<string, Record<string, unknown>> = {
  'motion-story': { videoMode: 'motion' },
  'seedance-chain': { videoMode: 'chain', model: 'seedance' },
  'bridge-clip': { videoMode: 'bridge' },
  'lipsync-pass': { videoMode: 'lipsync' },
  'photo-speak': { videoMode: 'photo-speak' },
  'frame-endpoints': { videoMode: 'frame-endpoints' },
  'frame-sampler': { videoMode: 'frame-endpoints' },

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
  'mesh-import': { directorMode: 'import' },
  'mesh-viewer': { directorMode: 'viewer' },

  'cinema-prompt': { studioTab: 'cinema' },
  'camera-prompt': { studioTab: 'camera' },
  'angle-visual': { studioTab: 'angle' },
  'portrait-craft': { studioTab: 'portrait' },
  'pose-craft': { studioTab: 'pose' },
  'prompt-studio': { studioTab: 'cinema' },
  'style-atelier': { styleLabTab: 'style' },
  'tag-atelier': { styleLabTab: 'tag' },
  'style-lab': { styleLabTab: 'style' },

  'topaz-picture': { enhanceMode: 'picture' },
  'topaz-clip': { enhanceMode: 'clip' },
  'upscale-lite': { enhanceMode: 'upscale' },
  'watermark-clean': { enhanceMode: 'watermark' },
  'control-preprocess': { enhanceMode: 'control' },
  'scale-fit': { enhanceMode: 'scale' },
  'picture-diff': { enhanceMode: 'diff' },
  'bg-remove': { enhanceMode: 'bg-remove' },

  'shot-script': { deskTab: 'script' },
  'story-grid': { deskTab: 'grid' },
  'storyboard-preview': { deskTab: 'preview' },

  'grid-split': { gridMode: 'split' },
  'picture-merge': { gridMode: 'compose' },

  'blueprint': { memoKind: 'blueprint' },
  'text-chunker': { chunkMode: true },

  'character-sheet': { migrationNote: '角色设定已迁入素材库' },
  'scene-card': { migrationNote: '场景设定已迁入素材库' },
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
    const data = node.data ?? {};

    // 误把导演台迁到分镜台的旧会话：按标记还原
    if (
      kind === 'storyboard-desk' &&
      (data.migratedFrom === 'director-desk' || data.migratedFromDirectorDesk === true)
    ) {
      migratedCount += 1;
      const { migratedFrom: _m, migrationNote: _n, migratedFromDirectorDesk: _f, ...rest } = data;
      return {
        ...node,
        type: 'director-desk',
        data: rest,
      } as T;
    }

    const target = BLOCK_KIND_MIGRATIONS[kind];
    if (!target) return node;
    migratedCount += 1;
    const patch = BLOCK_KIND_MIGRATION_PATCHES[kind] ?? {};
    return {
      ...node,
      type: target,
      data: {
        ...data,
        ...patch,
        migratedFrom: kind,
        migrationNote: `已从「${kind}」合并/迁移至「${target}」`,
      },
    } as T;
  });
  return { nodes: nodesOut, migratedCount };
}
