import { Box, X } from 'lucide-react';
import type { StoryboardPreviewFrame } from '@nx9/shared';
import { canRegenerateFrame, resolveStylePresets } from '@nx9/shared';
import { AssetMentionInput } from '../../asset-mention/AssetMentionInput';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { usePublicAssetLibrary } from '../../../../../stores/public-asset-library';

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
  const projectStyles = useWorkspaceDocument((s) => s.styleLibrary.styles);
  const publicStyles = usePublicAssetLibrary((s) => s.payload.styles ?? []);
  // 风格 SSOT = 公共库；遗留项目 styleLibrary 仍合并，避免旧帧点选丢失
  const styleOptions = resolveStylePresets([...(publicStyles ?? []), ...projectStyles]);

  return (
    <div className="kp__panel nodrag nopan" onMouseDown={stop}>
      <div className="kp__panel-head">
        <p className="kp__panel-title">
          编辑 {frame.label}
          {frame.locked && <span className="kp__panel-badge" style={{ marginLeft: 8 }}>已锁定</span>}
        </p>
        <button type="button" onClick={onClose} className="kp__btn is-ghost" style={{ marginLeft: 'auto', padding: 4 }}>
          <X size={14} />
        </button>
      </div>

      <div className="kp__editor">
        <div className="kp__media is-shot">
          {frame.imageUrl ? (
            <img src={frame.imageUrl} alt="" />
          ) : (
            <div className="kp__media-empty">预览</div>
          )}
        </div>
        <div className="kp__editor-main">
          <AssetMentionInput
            as="textarea"
            value={frame.promptSummary}
            onChange={(next) => onUpdate({ promptSummary: next, userModified: true })}
            placeholder="修改 Prompt… 输入 @ 引用角色、场景、镜头、风格"
            kinds={['character', 'scene', 'shot', 'style']}
            className="kp__field-area"
            rows={3}
          />
          <div className="kp__row">
            <select
              value={frame.stylePreset ?? ''}
              onChange={(e) => onUpdate({ stylePreset: e.target.value || null })}
              onMouseDown={stop}
              className="kp__field-input"
              style={{ flex: 1, minWidth: 120 }}
              title="从风格预设点选（Sty-03）；线稿等内置值保留"
            >
              <option value="">风格 preset…</option>
              {styleOptions.map((s) => (
                <option key={s.id} value={s.builtinKey || s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={frame.referenceImageUrl ?? ''}
              onChange={(e) => onUpdate({ referenceImageUrl: e.target.value || null })}
              onMouseDown={stop}
              placeholder="参考图 URL"
              className="kp__field-input"
              style={{ flex: 1, minWidth: 120 }}
            />
          </div>
          {frame.director3dGuide && (
            <div className="kp__card is-violet">
              <div className="kp__card-body" style={{ padding: '8px 10px' }}>
                <p className="kp__panel-title" style={{ fontSize: 10 }}>已绑定 3D 机位参考</p>
                {frame.director3dGuide.cameraPrompt && (
                  <p className="kp__hint" style={{ marginTop: 4 }}>
                    {frame.director3dGuide.cameraPrompt}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="kp__editor-actions">
        <button
          type="button"
          disabled={!director3dConnected || frame.locked}
          onClick={onOpenDirector3d}
          title={
            !director3dConnected
              ? '请先连接 3D 导演台'
              : frame.locked
                ? '帧已锁定'
                : '打开 3D 机位'
          }
          className="kp__btn is-ghost"
        >
          <Box size={14} /> 3D
        </button>
        <button
          type="button"
          disabled={!canRegen}
          onClick={onRegenerate}
          className="kp__btn"
        >
          重新生成
        </button>
      </div>
    </div>
  );
}
