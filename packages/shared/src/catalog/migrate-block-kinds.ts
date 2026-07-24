/**
 * Block kind migration — 合并 / 删除节点时，旧工作区加载自动改写 type。
 * 目标：主产品面约 16 个 Dock 节点；迁移目标必须是最终活跃 kind（单跳）。
 */

import {
  isScreenplayPackage,
  migrateDialogueSheetDataToPackage,
} from '../types/screenplay-package';

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

  // ── 3D 空间 → 统一导演台 ──
  'blocking-stage': 'director-desk',
  'light-rig': 'director-desk',
  'depth-pass': 'director-desk',
  'panorama-sphere': 'director-desk',
  'panorama-flat': 'director-desk',
  'multi-view-3d': 'director-desk',
  'mesh-import': 'director-desk',
  'mesh-viewer': 'director-desk',
  'director-3d': 'director-desk',

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
  'variant-fork': 'director-desk',
  'review-gate': 'director-desk',
  'asset-watch': 'asset-import',
  'text-chunker': 'script-desk',
  'dialogue-sheet': 'script-desk',

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

  'blocking-stage': { directorMode: 'blocking', migrationNote: '已合并到统一导演台' },
  'light-rig': { directorMode: 'light', migrationNote: '已合并到统一导演台' },
  'depth-pass': { directorMode: 'depth', migrationNote: '已合并到统一导演台' },
  'panorama-sphere': { directorMode: 'panorama', migrationNote: '已合并到统一导演台' },
  'panorama-flat': { directorMode: 'panorama', migrationNote: '已合并到统一导演台' },
  'mesh-import': { directorMode: 'import', migrationNote: '已合并到统一导演台' },
  'mesh-viewer': { directorMode: 'viewer', migrationNote: '已合并到统一导演台' },
  'director-3d': { migrationNote: '3D 舞台已合并到统一导演台' },

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
  'dialogue-sheet': { migrationNote: '剧本拆分已升级为编剧台' },

  'character-sheet': { migrationNote: '角色设定已迁入素材库' },
  'scene-card': { migrationNote: '场景设定已迁入素材库' },

  'review-gate': {
    studioTab: 'deliver',
    migrationNote: '关键帧/成片批审已并入导演台「审阅送出」',
  },
  'variant-fork': {
    studioTab: 'deliver',
    migrationNote: '变体分叉已收敛至导演台',
  },
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

function migrateScriptDeskNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const pkg = isScreenplayPackage(data.package)
    ? data.package
    : migrateDialogueSheetDataToPackage(data);
  const legacy =
    data.legacyScriptBreakdown
    ?? (data.scriptBreakdown && (data.scriptBreakdown as { version?: number }).version === 1
      ? data.scriptBreakdown
      : undefined);
  const next: Record<string, unknown> = {
    ...data,
    package: pkg,
    entryMode: data.entryMode === 'agent' || data.entryMode === 'ingest' ? data.entryMode : 'ingest',
  };
  if (legacy) next.legacyScriptBreakdown = legacy;
  return next;
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

    // 已是 script-desk：补 package / legacy 字段
    if (kind === 'script-desk') {
      const nextData = migrateScriptDeskNodeData(data);
      if (nextData !== data) {
        migratedCount += 1;
        return { ...node, data: nextData } as T;
      }
      return node;
    }

    // 审阅关卡：由 stripReviewGateFromGraph 物理拆除并改线，此处不改成第二个导演台
    if (kind === 'review-gate') {
      return node;
    }

    const target = BLOCK_KIND_MIGRATIONS[kind];
    if (!target) return node;
    migratedCount += 1;
    const patch = BLOCK_KIND_MIGRATION_PATCHES[kind] ?? {};
    let nextData: Record<string, unknown> = {
      ...data,
      ...patch,
      migratedFrom: kind,
      migrationNote: `已从「${kind}」合并/迁移至「${target}」`,
    };
    if (target === 'script-desk') {
      nextData = migrateScriptDeskNodeData(nextData);
      if (data.scriptBreakdown && (data.scriptBreakdown as { version?: number }).version === 1) {
        nextData.legacyScriptBreakdown = data.scriptBreakdown;
      }
    }
    return {
      ...node,
      type: target,
      data: nextData,
    } as T;
  });
  return { nodes: nodesOut, migratedCount };
}

export interface MigratableLink {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  edgeType?: string;
}

/**
 * 物理拆除审阅关卡节点：入边/出边桥接。
 * - 图上已有导演台：删除全部 review-gate，桥接到下游（缺出边时接到 clip-gen）
 * - 图上无导演台：保留第一个 review-gate 并改写为 director-desk，其余删除并桥接
 */
export function stripReviewGateFromGraph<T extends MigratableNode, L extends MigratableLink>(
  nodes: T[],
  links: L[],
): { nodes: T[]; links: L[]; strippedCount: number; rewiredCount: number } {
  const gates = nodes.filter((n) => String(n.type ?? '') === 'review-gate');
  if (gates.length === 0) {
    return { nodes, links, strippedCount: 0, rewiredCount: 0 };
  }

  const gateIds = new Set(gates.map((n) => n.id));
  const existingDesk = nodes.find(
    (n) => String(n.type ?? '') === 'director-desk' && !gateIds.has(n.id),
  );
  const clipGen = nodes.find((n) => String(n.type ?? '') === 'clip-gen' && !gateIds.has(n.id));

  const keepAsDeskId = existingDesk ? null : gates[0]?.id ?? null;
  const removeIds = new Set(
    [...gateIds].filter((id) => id !== keepAsDeskId),
  );
  // 无导演台时：第一个关卡改写为导演台，不删
  if (keepAsDeskId) removeIds.delete(keepAsDeskId);

  const incoming = links.filter((l) => gateIds.has(l.target) && !gateIds.has(l.source));
  const outgoing = links.filter((l) => gateIds.has(l.source) && !gateIds.has(l.target));

  const keptLinks = links.filter((l) => !gateIds.has(l.source) && !gateIds.has(l.target));
  const linkKey = (l: Pick<L, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) =>
    `${l.source}|${l.target}|${l.sourceHandle ?? ''}|${l.targetHandle ?? ''}`;
  const seen = new Set(keptLinks.map(linkKey));
  const bridged: L[] = [];
  let rewiredCount = 0;

  const pushBridge = (
    source: string,
    target: string,
    handles?: { sourceHandle?: string | null; targetHandle?: string | null },
  ) => {
    if (!source || !target || source === target) return;
    const next = {
      id: `rg-bridge-${source}-${target}-${rewiredCount}`,
      source,
      target,
      sourceHandle: handles?.sourceHandle ?? undefined,
      targetHandle: handles?.targetHandle ?? undefined,
    } as L;
    const key = linkKey(next);
    if (seen.has(key)) return;
    seen.add(key);
    bridged.push(next);
    rewiredCount += 1;
  };

  const deskId = existingDesk?.id ?? keepAsDeskId;

  if (keepAsDeskId) {
    for (const inn of incoming) {
      pushBridge(inn.source, keepAsDeskId, { sourceHandle: inn.sourceHandle });
    }
    if (outgoing.length > 0) {
      for (const out of outgoing) {
        pushBridge(keepAsDeskId, out.target, { targetHandle: out.targetHandle });
      }
    } else if (clipGen) {
      pushBridge(keepAsDeskId, clipGen.id);
    }
  } else {
    for (const inn of incoming) {
      const targets =
        outgoing.length > 0
          ? outgoing.map((o) => o.target)
          : clipGen
            ? [clipGen.id]
            : [];
      for (const target of targets) {
        pushBridge(inn.source, target, { sourceHandle: inn.sourceHandle });
      }
    }
    if (incoming.length === 0 && deskId) {
      for (const out of outgoing) {
        pushBridge(deskId, out.target, { targetHandle: out.targetHandle });
      }
    }
    if (
      existingDesk &&
      clipGen &&
      outgoing.some((l) => l.target === clipGen.id) &&
      !keptLinks.some((l) => l.source === existingDesk.id && l.target === clipGen.id) &&
      !bridged.some((l) => l.source === existingDesk.id && l.target === clipGen.id)
    ) {
      pushBridge(existingDesk.id, clipGen.id);
    }
  }

  const nodesOut = nodes
    .filter((n) => !removeIds.has(n.id))
    .map((n) => {
      if (keepAsDeskId && n.id === keepAsDeskId) {
        const patch = BLOCK_KIND_MIGRATION_PATCHES['review-gate'] ?? {};
        return {
          ...n,
          type: 'director-desk',
          data: {
            ...(n.data ?? {}),
            ...patch,
            migratedFrom: 'review-gate',
            migrationNote: '审阅关卡已升级为导演台（图上原无导演台）',
          },
        } as T;
      }
      if (existingDesk && n.id === existingDesk.id) {
        const prev = (n.data ?? {}) as Record<string, unknown>;
        return {
          ...n,
          data: {
            ...prev,
            studioTab: prev.studioTab ?? 'deliver',
            migratedReviewGate: true,
            migrationNote:
              (prev.migrationNote as string | undefined) ??
              '审阅关卡已拆除，批审改由导演台「审阅送出」承接',
          },
        } as T;
      }
      return n;
    });

  return {
    nodes: nodesOut,
    links: [...keptLinks, ...bridged],
    strippedCount: removeIds.size,
    rewiredCount,
  };
}
