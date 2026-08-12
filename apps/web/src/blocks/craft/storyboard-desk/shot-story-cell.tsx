import { useCallback, useRef, useState } from 'react';
import { Ellipsis, ImagePlus, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import type { ScriptBreakdownShot } from '@nx9/shared';
import { api } from '../../../api/client';
import { confirmDelete } from '../../../stores/confirm-dialog';
import { shotDialogueLine } from './helpers';

export function ShotStoryCell({
  shot,
  selected,
  checked,
  storyboardUrl,
  generating,
  deskBusy,
  onSelect,
  onToggleCheck,
  onUpload,
  onGenerateLineArt,
  onEdit,
  onDelete,
  onClearLineArt,
  onDragStart,
  onCopy,
}: {
  shot: ScriptBreakdownShot;
  selected?: boolean;
  checked?: boolean;
  storyboardUrl?: string | null;
  generating?: boolean;
  deskBusy?: boolean;
  onSelect: () => void;
  onToggleCheck?: () => void;
  onUpload: (url: string) => void;
  onGenerateLineArt: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onClearLineArt?: () => void;
  onCopy?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const url = shot.previewImageUrl || shot.referenceImageUrl || storyboardUrl || null;
  const busy = uploading || generating;
  const line = shotDialogueLine(shot);
  const tech = [shot.shotSize, shot.cameraMove, shot.cameraAngle, shot.cameraLens]
    .filter(Boolean)
    .join(' · ');
  const sub = [
    shot.scene?.trim(),
    shot.characters?.length ? shot.characters.join('、') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const badge = busy
    ? { cls: 'is-run', text: uploading ? '上传中' : '生成中' }
    : url
      ? { cls: 'is-ok', text: '已出图' }
      : { cls: 'is-miss', text: '缺图' };

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const res = await api.uploadAsset(file);
        onUpload(res.url);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onUpload],
  );

  return (
    <article
      className={`sg-story-cell${selected ? ' is-on' : ''}${busy ? ' is-run' : ''}`}
      data-shot-id={shot.id}
      draggable
      onDragStart={onDragStart}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {onToggleCheck ? (
        <label className="sg-story-cell__check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={checked ?? false} onChange={onToggleCheck} />
        </label>
      ) : null}
      <button type="button" className="sg-story-cell__hit" onClick={onSelect}>
        <div
          className="sg-story-cell__media"
          onClick={async (e) => {
            e.stopPropagation();
            if (busy) return;
            if (url) {
              const ok = await confirmDelete({
                title: '覆盖已有图片？',
                description: '当前镜已有已上传或生成的图。继续将覆盖。',
                confirmLabel: '继续覆盖',
              });
              if (!ok) return;
            }
            inputRef.current?.click();
          }}
        >
          {busy ? (
            <span className="sg-story-cell__empty">
              <Loader2 size={16} className="animate-spin" />
              <span>{uploading ? '上传中' : '生成中'}</span>
            </span>
          ) : url ? (
            <img src={url} alt="" />
          ) : (
            <span className="sg-story-cell__empty">
              <ImagePlus size={16} />
              <span>点击上传</span>
            </span>
          )}
          <span className={`sg-story-badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <div className="sg-story-cell__meta">
          <strong>
            <span>{shot.title?.trim() || shot.sceneCode || `镜 ${shot.index}`}</span>
            <em>{shot.sceneCode || `S${shot.index}`}</em>
          </strong>
          {tech ? <span className="sg-story-cell__tech">{tech}</span> : null}
          <p title={line}>{line}</p>
          {sub ? <span className="sg-story-cell__sub" title={sub}>{sub}</span> : null}
        </div>
      </button>
      <div className="sg-story-cell__acts">
        <button
          type="button"
          className="sg-story-cell__act"
          title="快捷出线稿（单镜）· 批量主路径在「构图」Tab"
          aria-label="出线稿"
          disabled={busy || deskBusy}
          onClick={onGenerateLineArt}
        >
          <Sparkles size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="sg-story-cell__act"
          title="编辑镜头字段"
          aria-label="编辑"
          onClick={onEdit}
        >
          <Pencil size={14} strokeWidth={2} />
        </button>
        {onDelete ? (
          <span className="sg-story-cell__menu-wrap">
            <button
              type="button"
              className="sg-story-cell__act"
              title="更多"
              aria-label="更多"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            >
              <Ellipsis size={14} strokeWidth={2} />
            </button>
            {menuOpen ? (
              <>
                <div className="sg-story-cell__menu-drop" onClick={() => setMenuOpen(false)}>
                  {onClearLineArt ? (
                    <button
                      type="button"
                      className="sg-story-cell__menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onClearLineArt();
                      }}
                    >
                      清除线稿
                    </button>
                    ) : null}
                  {onCopy ? (
                    <button
                      type="button"
                      className="sg-story-cell__menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onCopy();
                      }}
                    >
                      复制镜
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="sg-story-cell__menu-item sg-story-cell__menu-item--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 size={12} /> 删镜
                  </button>
                </div>
                <div className="sg-story-cell__menu-backdrop" onClick={() => setMenuOpen(false)} />
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </article>
  );
}
