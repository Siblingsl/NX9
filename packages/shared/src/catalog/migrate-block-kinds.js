/**
 * §9.6 — Deprecated block kind migration for workspace / ZIP load.
 */
export const BLOCK_KIND_MIGRATIONS = {
    // P0 — Hub / Integrate placeholders
    'workflow-hub': 'passthrough',
    'wallet-hub': 'passthrough',
    'hub-market': 'passthrough',
    'hub-toolkit': 'passthrough',
    'vibe-workbench': 'passthrough',
    'param-inject': 'passthrough',
    'grok-agent': 'passthrough',
    'codex-agent': 'passthrough',
    'codex-picture': 'picture-gen',
    'comfy-builder': 'comfy-market',
    // P1 — Legacy concealed
    'multi-view-3d': 'director-3d',
    'panorama-flat': 'panorama-sphere',
    'portrait-flow': 'picture-gen',
    'portrait-meta': 'prompt',
    'web-view': 'link-parser',
    'frame-sampler': 'frame-endpoints',
    'touch-up': 'picture-gen',
    'clip-sink': 'preview-sink',
    // P2 — Craft / utility / integrate merges
    'cinema-prompt': 'prompt-studio',
    'camera-prompt': 'prompt-studio',
    'angle-visual': 'prompt-studio',
    'portrait-craft': 'prompt-studio',
    'pose-craft': 'prompt-studio',
    'style-atelier': 'style-lab',
    'tag-atelier': 'style-lab',
    'topaz-picture': 'local-enhance',
    'topaz-clip': 'local-enhance',
    'fal-market': 'model-market',
    'comfy-market': 'model-market',
    'blueprint': 'memo',
    'render-slot': 'preview-sink',
    'asset-bundle': 'iterator',
};
/** Extra node.data fields applied when migrating to merged blocks */
export const BLOCK_KIND_MIGRATION_PATCHES = {
    'cinema-prompt': { studioTab: 'cinema' },
    'camera-prompt': { studioTab: 'camera' },
    'angle-visual': { studioTab: 'angle' },
    'portrait-craft': { studioTab: 'portrait' },
    'pose-craft': { studioTab: 'pose' },
    'style-atelier': { styleLabTab: 'style' },
    'tag-atelier': { styleLabTab: 'tag' },
    'topaz-picture': { enhanceMode: 'picture' },
    'topaz-clip': { enhanceMode: 'clip' },
    'fal-market': { marketSource: 'fal' },
    'comfy-market': { marketSource: 'comfy' },
    'blueprint': { memoKind: 'blueprint' },
};
export const DEPRECATED_BLOCK_KINDS = Object.keys(BLOCK_KIND_MIGRATIONS);
export function getBlockKindMigrationTarget(kind) {
    return BLOCK_KIND_MIGRATIONS[kind];
}
export function isDeprecatedBlockKind(kind) {
    return kind in BLOCK_KIND_MIGRATIONS;
}
export function migrateBlockKind(kind) {
    return BLOCK_KIND_MIGRATIONS[kind] ?? kind;
}
export function migrateBlockKinds(nodes) {
    let migratedCount = 0;
    const nodesOut = nodes.map((node) => {
        const kind = String(node.type ?? '');
        const target = BLOCK_KIND_MIGRATIONS[kind];
        if (!target)
            return node;
        migratedCount += 1;
        const patch = BLOCK_KIND_MIGRATION_PATCHES[kind] ?? {};
        return {
            ...node,
            type: target,
            data: {
                ...(node.data ?? {}),
                ...patch,
                migratedFrom: kind,
                migrationNote: `已从废弃模块「${kind}」迁移至「${target}」`,
            },
        };
    });
    return { nodes: nodesOut, migratedCount };
}
