import { lazy, memo, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BLOCK_CATALOG, lookupBlock } from '@nx9/shared';

/** Lazy-loaded block components — only parsed when first rendered */
function lazyBlock(loader: () => Promise<{ default: ComponentType<NodeProps> }>) {
  return lazy(loader);
}

/** 精简后活跃节点加载器（已删除 kind 由 migrate 改写后不会再 spawn） */
const blockLoaders: Record<string, () => Promise<{ default: ComponentType<NodeProps> }>> = {
  'picture-gen': () => import('./core/PictureGenBlock').then((m) => ({ default: m.default })),
  'clip-gen': () => import('./core/ClipGenBlock').then((m) => ({ default: m.default })),
  'sound-gen': () => import('./core/SoundGenBlock').then((m) => ({ default: m.default })),
  'clip-editor': () => import('./core/ClipEditorBlock').then((m) => ({ default: m.default })),
  'director-desk': () => import('./core/DirectorDeskBlock').then((m) => ({ default: m.default })),

  'storyboard-desk': () =>
    import('./craft/StoryboardDeskBlock').then((m) => ({ default: m.default })),
  'asset-gate': () => import('./craft/AssetGateBlock').then((m) => ({ default: m.default })),

  'asset-import': () => import('./input/AssetImportBlock').then((m) => ({ default: m.default })),
  'link-parser': () => import('./utility/LinkParserBlock').then((m) => ({ default: m.default })),

  'dialogue-sheet': () => import('./nx9/DialogueSheetBlock').then((m) => ({ default: m.default })),
  'reference-board': () => import('./nx9/ReferenceBoardBlock').then((m) => ({ default: m.default })),
  'continuity-check': () => import('./nx9/ContinuityCheckBlock').then((m) => ({ default: m.default })),
  'caption-asr': () => import('./nx9/CaptionAsrBlock').then((m) => ({ default: m.default })),
  'inpaint-edit': () => import('./nx9/InpaintEditBlock').then((m) => ({ default: m.default })),
  'export-pack': () => import('./nx9/ExportPackBlock').then((m) => ({ default: m.default })),
  'review-gate': () => import('./nx9/ReviewGateBlock').then((m) => ({ default: m.default })),

  'director-3d': () => import('./spatial/Director3dBlock').then((m) => ({ default: m.default })),

  'local-enhance': () => import('./utility/LocalEnhanceBlock').then((m) => ({ default: m.default })),
  'grid-compose': () => import('./utility/GridComposeBlock').then((m) => ({ default: m.default })),
  iterator: () => import('./utility/IteratorBlock').then((m) => ({ default: m.default })),
};

const GenericBlock = lazyBlock(() => import('./shared/GenericBlock'));

function BlockSuspenseFallback({ type }: { type?: string }) {
  const meta = lookupBlock(type ?? '');
  return (
    <div className="nx9-stage-card animate-pulse" style={{ opacity: 0.7 }}>
      <div className="nx9-stage-card__head">
        <span className="nx9-stage-card__title" style={{ opacity: 0.45 }}>
          {meta?.label ?? type ?? '模块'}
        </span>
      </div>
      <div className="nx9-stage-card__body">
        <div className="nx9-stage-card__media">
          <div className="nx9-stage-card__media-empty">加载中…</div>
        </div>
      </div>
    </div>
  );
}

/** 将 Suspense 限制在单个节点内，避免懒加载块卸载整个画布 */
function withBlockSuspense(Inner: LazyExoticComponent<ComponentType<NodeProps>>) {
  const Wrapped = memo(function BlockWithSuspense(props: NodeProps) {
    return (
      <Suspense fallback={<BlockSuspenseFallback type={props.type} />}>
        <Inner {...props} />
      </Suspense>
    );
  });
  Wrapped.displayName = 'BlockWithSuspense';
  return Wrapped;
}

/** 应用模板前预加载块 chunk，减少首帧 suspend */
export async function preloadBlockTypes(types: string[]) {
  const unique = [...new Set(types.filter(Boolean))];
  await Promise.all(
    unique.map((type) => {
      const loader = blockLoaders[type];
      return loader ? loader() : import('./shared/GenericBlock');
    }),
  );
}

export const blockTypes = Object.fromEntries(
  BLOCK_CATALOG.map((def) => [
    def.kind,
    withBlockSuspense(
      blockLoaders[def.kind] ? lazyBlock(blockLoaders[def.kind]) : GenericBlock,
    ),
  ]),
);
