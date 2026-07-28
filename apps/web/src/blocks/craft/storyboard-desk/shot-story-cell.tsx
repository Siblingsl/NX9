import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Sparkles } from 'lucide-react';
import type { ScriptBreakdownShot } from '@nx9/shared';
import { api } from '../../../api/client';
import { shotDialogueLine } from './helpers';

export function ShotStoryCell({
  shot,
  selected,
  storyboardUrl,
  generating,
  onSelect,
  onUpload,
  onGenerate,
  onGenerateLineArt,
  onEdit,
}: {
  shot: ScriptBreakdownShot;
  selected?: boolean;
  storyboardUrl?: string | null;
  generating?: boolean;
  onSelect: () => void;
  onUpload: (url: string) => void;
  onGenerate: () => void;
  onGenerateLineArt: () => void;
  onEdit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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
      <button type="button" className="sg-story-cell__hit" onClick={onSelect}>
        <div
          className="sg-story-cell__media"
          onClick={(e) => {
            e.stopPropagation();
            if (!busy) inputRef.current?.click();
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
        <button type="button" className="sg-story-cell__act" title="生成线稿构图" disabled={busy} onClick={onGenerateLineArt}>
          <Pencil size={11} />线稿
        </button>
        <button type="button" className="sg-story-cell__act" title="生成试出画面" disabled={busy} onClick={onGenerate}>
          <Sparkles size={11} />试出
        </button>
        <button type="button" className="sg-story-cell__act" title="编辑镜头字段" onClick={onEdit}>
          <Pencil size={11} />编辑
        </button>
      </div>
    </article>
  );
}
