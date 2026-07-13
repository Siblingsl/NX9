import { Box, X } from 'lucide-react';
import type { StoryboardPreviewFrame } from '@nx9/shared';
import { canRegenerateFrame } from '@nx9/shared';
import { AssetMentionInput } from '../../asset-mention/AssetMentionInput';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface StoryboardPreviewFrameEditorProps {
  frame: StoryboardPreviewFrame;
  onClose: () => void;
  onUpdate: (patch: Partial<StoryboardPreviewFrame>) => void;
  onRegenerate: () => void;
  onOpenDirector3d?: () => void;
  director3dConnected?: boolean;
}

/** 单张分镜编辑 — 点击卡片后切换为 Image Workspace 能力（Prompt / 参考图 / 风格） */
export function StoryboardPreviewFrameEditor({
  frame,
  onClose,
  onUpdate,
  onRegenerate,
  onOpenDirector3d,
  director3dConnected,
}: StoryboardPreviewFrameEditorProps) {
  const canRegen = canRegenerateFrame(frame);

  return (
    <div className="p-3 space-y-2 nodrag nopan" onMouseDown={stop}>
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-medium text-ink">
          编辑 {frame.label}
          {frame.locked && <span className="ml-2 text-[10px] text-violet-600">🔒 已锁定</span>}
        </p>
        <button type="button" onClick={onClose} className="ml-auto p-1 rounded text-ink/35 hover:text-ink">
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-3">
        <div className="w-28 shrink-0 aspect-video rounded-lg overflow-hidden border border-line/50 bg-surface/40">
          {frame.imageUrl ? (
            <img src={frame.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[9px] text-ink/30">预览</div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <AssetMentionInput
            as="textarea"
            value={frame.promptSummary}
            onChange={(next) => onUpdate({ promptSummary: next, userModified: true })}
            placeholder="修改 Prompt… 输入 @ 引用角色、场景、镜头"
            kinds={['character', 'scene', 'shot', 'emotion']}
            className="w-full h-20 border border-line/50 rounded-lg px-2.5 py-2 text-[12px] resize-none focus:outline-none focus:border-brand/40"
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={frame.stylePreset ?? ''}
              onChange={(e) => onUpdate({ stylePreset: e.target.value || null })}
              onMouseDown={stop}
              placeholder="风格 preset"
              className="flex-1 min-w-[120px] text-[10px] rounded-md border border-line/50 px-2 py-1"
            />
            <input
              type="text"
              value={frame.referenceImageUrl ?? ''}
              onChange={(e) => onUpdate({ referenceImageUrl: e.target.value || null })}
              onMouseDown={stop}
              placeholder="参考图 URL"
              className="flex-1 min-w-[120px] text-[10px] rounded-md border border-line/50 px-2 py-1"
            />
          </div>
          {frame.director3dGuide && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-2 py-1.5">
              <p className="text-[10px] font-medium text-violet-700">已绑定 3D 机位参考</p>
              {frame.director3dGuide.cameraPrompt && (
                <p className="mt-0.5 text-[9px] text-ink/45 line-clamp-2">
                  {frame.director3dGuide.cameraPrompt}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={!director3dConnected || frame.locked}
          onClick={onOpenDirector3d}
          title={
            director3dConnected
              ? frame.locked
                ? '请先解锁此分镜'
                : '在 3D 导演台中设计此帧机位'
              : '请先连接 3D 导演台节点'
          }
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-violet-500/25 text-violet-700 text-[11px] disabled:opacity-40"
        >
          <Box size={12} />
          3D 构图
        </button>
        <button
          type="button"
          disabled={!canRegen}
          onClick={onRegenerate}
          className="px-3 py-1 rounded-lg bg-brand text-white text-[11px] disabled:opacity-40"
        >
          仅重新生成此张
        </button>
      </div>
    </div>
  );
}
