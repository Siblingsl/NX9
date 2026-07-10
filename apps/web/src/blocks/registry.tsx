import { lazy, memo, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BLOCK_CATALOG, lookupBlock } from '@nx9/shared';

/** Lazy-loaded block components — only parsed when first rendered */
function lazyBlock(loader: () => Promise<{ default: ComponentType<NodeProps> }>) {
  return lazy(loader);
}

const blockLoaders: Record<string, () => Promise<{ default: ComponentType<NodeProps> }>> = {
  prompt: () => import('./core/PromptBlock').then((m) => ({ default: m.default })),
  'picture-gen': () => import('./core/PictureGenBlock').then((m) => ({ default: m.default })),
  'clip-gen': () => import('./core/ClipGenBlock').then((m) => ({ default: m.default })),
  'chat-model': () => import('./core/ChatModelBlock').then((m) => ({ default: m.default })),
  'sound-gen': () => import('./core/SoundGenBlock').then((m) => ({ default: m.default })),
  'director-desk': () => import('./core/DirectorDeskBlock').then((m) => ({ default: m.default })),
  'motion-story': () => import('./core/MotionStoryBlock').then((m) => ({ default: m.default })),
  'grid-split': () => import('./utility/GridSplitBlock').then((m) => ({ default: m.default })),
  'grid-compose': () => import('./utility/GridComposeBlock').then((m) => ({ default: m.default })),
  'story-grid': () => import('./craft/StoryGridBlock').then((m) => ({ default: m.default })),
  'asset-import': () => import('./input/AssetImportBlock').then((m) => ({ default: m.default })),
  'preview-sink': () => import('./input/PreviewSinkBlock').then((m) => ({ default: m.default })),
  passthrough: () => import('./core/PassthroughBlock').then((m) => ({ default: m.default })),
  memo: () => import('./core/MemoBlock').then((m) => ({ default: m.default })),
  'text-chunker': () => import('./utility/TextChunkerBlock').then((m) => ({ default: m.default })),
  iterator: () => import('./utility/IteratorBlock').then((m) => ({ default: m.default })),
  picker: () => import('./utility/PickerBlock').then((m) => ({ default: m.default })),
  'clip-editor': () => import('./core/ClipEditorBlock').then((m) => ({ default: m.default })),
  'asset-bundle': () => import('./input/AssetBundleBlock').then((m) => ({ default: m.default })),
  'render-slot': () => import('./input/RenderSlotBlock').then((m) => ({ default: m.default })),
  'frame-endpoints': () => import('./utility/FrameEndpointsBlock').then((m) => ({ default: m.default })),
  'scale-fit': () => import('./utility/ScaleFitBlock').then((m) => ({ default: m.default })),
  'picture-merge': () => import('./utility/PictureMergeBlock').then((m) => ({ default: m.default })),
  'picture-diff': () => import('./utility/PictureDiffBlock').then((m) => ({ default: m.default })),
  'frame-sampler': () => import('./utility/FrameSamplerBlock').then((m) => ({ default: m.default })),
  'link-parser': () => import('./utility/LinkParserBlock').then((m) => ({ default: m.default })),
  'sketch-pad': () => import('./utility/SketchPadBlock').then((m) => ({ default: m.default })),
  'clip-sink': () => import('./support/ClipSinkBlock').then((m) => ({ default: m.default })),
  'cinema-prompt': () => import('./craft/CinemaPromptBlock').then((m) => ({ default: m.default })),
  'camera-prompt': () => import('./craft/CameraPromptBlock').then((m) => ({ default: m.default })),
  'style-atelier': () => import('./craft/StyleAtelierBlock').then((m) => ({ default: m.default })),
  'tag-atelier': () => import('./craft/TagAtelierBlock').then((m) => ({ default: m.default })),
  'angle-visual': () => import('./craft/AngleVisualBlock').then((m) => ({ default: m.default })),
  'batch-runner': () => import('./utility/BatchRunnerBlock').then((m) => ({ default: m.default })),
  blueprint: () => import('./support/BlueprintBlock').then((m) => ({ default: m.default })),
  'grid-prompt-reverse': () => import('./craft/GridPromptReverseBlock').then((m) => ({ default: m.default })),
  'prompt-studio': () => import('./craft/PromptStudioBlock').then((m) => ({ default: m.default })),
  'style-lab': () => import('./craft/StyleLabBlock').then((m) => ({ default: m.default })),
  'local-enhance': () => import('./utility/LocalEnhanceBlock').then((m) => ({ default: m.default })),
  'model-market': () => import('./integrate/ModelMarketBlock').then((m) => ({ default: m.default })),
  'shot-script': () => import('./nx9/ShotScriptBlock').then((m) => ({ default: m.default })),
  'reference-board': () => import('./nx9/ReferenceBoardBlock').then((m) => ({ default: m.default })),
  'character-sheet': () => import('./nx9/CharacterSheetBlock').then((m) => ({ default: m.default })),
  'continuity-check': () => import('./nx9/ContinuityCheckBlock').then((m) => ({ default: m.default })),
  'scene-card': () => import('./nx9/SceneCardBlock').then((m) => ({ default: m.default })),
  'dialogue-sheet': () => import('./nx9/DialogueSheetBlock').then((m) => ({ default: m.default })),
  'voice-cast': () => import('./nx9/VoiceCastBlock').then((m) => ({ default: m.default })),
  'bridge-clip': () => import('./nx9/BridgeClipBlock').then((m) => ({ default: m.default })),
  'caption-asr': () => import('./nx9/CaptionAsrBlock').then((m) => ({ default: m.default })),
  'seedance-chain': () => import('./nx9/SeedanceChainBlock').then((m) => ({ default: m.default })),
  'thumbnail-maker': () => import('./nx9/ThumbnailMakerBlock').then((m) => ({ default: m.default })),
  'inpaint-edit': () => import('./nx9/InpaintEditBlock').then((m) => ({ default: m.default })),
  'control-preprocess': () => import('./nx9/ControlPreprocessBlock').then((m) => ({ default: m.default })),
  'reference-analyze': () => import('./nx9/ReferenceAnalyzeBlock').then((m) => ({ default: m.default })),
  'music-gen': () => import('./nx9/MusicGenBlock').then((m) => ({ default: m.default })),
  'lipsync-pass': () => import('./nx9/LipsyncPassBlock').then((m) => ({ default: m.default })),
  'export-pack': () => import('./nx9/ExportPackBlock').then((m) => ({ default: m.default })),
  'subtitle-burn': () => import('./nx9/SubtitleBurnBlock').then((m) => ({ default: m.default })),
  'audio-mix': () => import('./nx9/AudioMixBlock').then((m) => ({ default: m.default })),
  'color-grade': () => import('./nx9/ColorGradeBlock').then((m) => ({ default: m.default })),
  'beat-sync': () => import('./nx9/BeatSyncBlock').then((m) => ({ default: m.default })),
  'review-gate': () => import('./nx9/ReviewGateBlock').then((m) => ({ default: m.default })),
  'variant-fork': () => import('./nx9/VariantForkBlock').then((m) => ({ default: m.default })),
  'recipe-spawn': () => import('./nx9/RecipeSpawnBlock').then((m) => ({ default: m.default })),
  'prompt-diff': () => import('./nx9/PromptDiffBlock').then((m) => ({ default: m.default })),
  'asset-watch': () => import('./nx9/AssetWatchBlock').then((m) => ({ default: m.default })),
  'photo-speak': () => import('./core/PhotoSpeakBlock').then((m) => ({ default: m.default })),
  'topaz-picture': () => import('./utility/TopazPictureBlock').then((m) => ({ default: m.default })),
  'topaz-clip': () => import('./utility/TopazClipBlock').then((m) => ({ default: m.default })),
  'bg-remove': () => import('./utility/BgRemoveBlock').then((m) => ({ default: m.default })),
  'upscale-lite': () => import('./utility/UpscaleLiteBlock').then((m) => ({ default: m.default })),
  'watermark-clean': () => import('./support/WatermarkCleanBlock').then((m) => ({ default: m.default })),
  'fal-market': () => import('./integrate/FalMarketBlock').then((m) => ({ default: m.default })),
  'comfy-market': () => import('./integrate/ComfyMarketBlock').then((m) => ({ default: m.default })),
  'comfy-workflow': () => import('./integrate/ComfyWorkflowBlock').then((m) => ({ default: m.default })),
  'director-3d': () => import('./spatial/Director3dBlock').then((m) => ({ default: m.default })),
  'blocking-stage': () => import('./spatial/BlockingStageBlock').then((m) => ({ default: m.default })),
  'light-rig': () => import('./spatial/LightRigBlock').then((m) => ({ default: m.default })),
  'depth-pass': () => import('./spatial/DepthPassBlock').then((m) => ({ default: m.default })),
  'mesh-import': () => import('./spatial/MeshImportBlock').then((m) => ({ default: m.default })),
  'mesh-viewer': () => import('./spatial/MeshViewerBlock').then((m) => ({ default: m.default })),
  'panorama-sphere': () => import('./spatial/PanoramaSphereBlock').then((m) => ({ default: m.default })),
};

const GenericBlock = lazyBlock(() => import('./shared/GenericBlock'));

function BlockSuspenseFallback({ type }: { type?: string }) {
  const meta = lookupBlock(type ?? '');
  return (
    <div className="min-w-[220px] max-w-[360px] rounded-2xl border border-line bg-white shadow-panel animate-pulse">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-surface/80 rounded-t-2xl">
        <span className="w-2 h-2 rounded-full shrink-0 bg-ink/10" />
        <span className="text-sm font-semibold text-ink/30 flex-1">{meta?.label ?? type ?? '模块'}</span>
      </div>
      <div className="px-3 py-6 text-xs text-ink/30 text-center">加载模块…</div>
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
) as Record<string, ReturnType<typeof withBlockSuspense>>;

export const blockTypeKeys = Object.keys(blockTypes);
