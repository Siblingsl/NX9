import { useCallback } from 'react';
import { Replace, Scissors, Trash2 } from 'lucide-react';
import {
  findTimelineClip,
  type TimelineOp,
  type TimelinePayload,
  type TimelineTransition,
} from '@nx9/shared';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
const TRANSITION_KINDS: Array<{ id: TimelineTransition['kind'] | 'none'; label: string }> = [
  { id: 'none', label: '无' },
  { id: 'cut', label: '硬切' },
  { id: 'fade', label: '淡入淡出' },
  { id: 'wipe', label: '划像' },
];

export interface InspectorPanelProps {
  timeline: TimelinePayload;
  selectedClipId: string | null;
  playheadSec: number;
  apply: (ops: TimelineOp | TimelineOp[]) => unknown;
  onSelect: (clipId: string | null) => void;
  /** 打开智能替换工作台（仅视频片段） */
  onSmartReplace: (clipId: string) => void;
}

export function InspectorPanel({
  timeline,
  selectedClipId,
  playheadSec,
  apply,
  onSelect,
  onSmartReplace,
}: InspectorPanelProps) {
  const loc = selectedClipId ? findTimelineClip(timeline, selectedClipId) : null;

  const setClip = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedClipId) return;
      apply({ op: 'set-clip', clipId: selectedClipId, patch });
    },
    [apply, selectedClipId],
  );

  if (!loc) {
    return (
      <div className="ed-inspector">
        <div className="ed-empty">
          选中时间轴上的片段
          <br />
          编辑裁剪 / 转场 / 音量 / 变速 / 字幕
        </div>
      </div>
    );
  }

  const { clip, track } = loc;
  const isMedia = clip.type === 'video' || clip.type === 'audio';
  const canSplit =
    playheadSec > clip.startSec + 0.1 && playheadSec < clip.startSec + clip.durationSec - 0.1;
  const transitionKind = clip.transitionOut?.kind ?? 'none';

  return (
    <div className="ed-inspector">
      <div className="ed-inspector__title" title={clip.label}>
        <b>{clip.label}</b>
        <span className="ed-inspector__type">{clip.type}</span>
      </div>

      <div className="ed-inspector__grid">
        <span>起点</span>
        <span>{clip.startSec.toFixed(2)}s</span>
        <span>时长</span>
        <span>{clip.durationSec.toFixed(2)}s</span>
        {clip.trimInSec ? (
          <>
            <span>素材入点</span>
            <span>{clip.trimInSec.toFixed(2)}s</span>
          </>
        ) : null}
        {clip.sourceDurationSec ? (
          <>
            <span>素材全长</span>
            <span>{clip.sourceDurationSec.toFixed(2)}s</span>
          </>
        ) : null}
      </div>

      <div className="ed-inspector__actions">
        <button
          type="button"
          className="ed-btn"
          disabled={!canSplit || track.locked}
          title="在播放头处分割 (S)"
          onClick={() => apply({ op: 'split-clip', clipId: clip.id, atSec: playheadSec })}
        >
          <Scissors size={12} /> 分割
        </button>
        <button
          type="button"
          className="ed-btn"
          disabled={track.locked}
          title="删除 (Delete)"
          onClick={() => {
            apply({ op: 'remove-clip', clipId: clip.id });
            onSelect(null);
          }}
        >
          <Trash2 size={12} /> 删除
        </button>
        <button
          type="button"
          className="ed-btn"
          disabled={track.locked}
          title="删除并让后续片段前移 (Shift+Delete)"
          onClick={() => {
            apply({ op: 'remove-clip', clipId: clip.id, ripple: true });
            onSelect(null);
          }}
        >
          波纹删除
        </button>
      </div>

      {clip.type === 'video' && (
        <button
          type="button"
          className="ed-btn ed-btn--primary ed-btn--block"
          onClick={() => onSmartReplace(clip.id)}
        >
          <Replace size={12} /> 智能替换（背景 / 人物 / 物体）
        </button>
      )}

      {isMedia && (
        <section className="ed-inspector__section">
          <h4>音量与淡化</h4>
          <label className="ed-field">
            <span>音量 {Math.round((clip.volume ?? 1) * 100)}%</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.volume ?? 1}
              onChange={(e) => setClip({ volume: Number(e.target.value) })}
            />
          </label>
          <div className="ed-field-row">
            <button
              type="button"
              className="ed-btn"
              disabled={track.locked}
              title="在播放头相对片段起点写入音量点"
              onClick={() => {
                const atSec = Math.max(0, playheadSec - clip.startSec);
                apply({
                  op: 'set-volume-keyframe',
                  clipId: clip.id,
                  atSec,
                  volume: clip.volume ?? 1,
                });
              }}
            >
              播放头打音量点
            </button>
          </div>
          {(clip.volumeKeyframes?.length ?? 0) > 0 ? (
            <ul className="ed-keyframe-list">
              {clip.volumeKeyframes!.map((kf) => (
                <li key={`${kf.atSec}-${kf.volume}`}>
                  <span>{kf.atSec.toFixed(2)}s · {Math.round(kf.volume * 100)}%</span>
                  <button
                    type="button"
                    className="ed-btn"
                    disabled={track.locked}
                    onClick={() => apply({ op: 'remove-volume-keyframe', clipId: clip.id, atSec: kf.atSec })}
                  >
                    删
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <small className="ed-field-hint">无包络点时只用主推子；点可做对白闪避/渐强。</small>
          )}
          <div className="ed-field-row">
            <label className="ed-field">
              <span>淡入 (s)</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={clip.fadeInSec ?? 0}
                onChange={(e) => setClip({ fadeInSec: Math.max(0, Number(e.target.value)) || undefined })}
              />
            </label>
            <label className="ed-field">
              <span>淡出 (s)</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={clip.fadeOutSec ?? 0}
                onChange={(e) => setClip({ fadeOutSec: Math.max(0, Number(e.target.value)) || undefined })}
              />
            </label>
          </div>
        </section>
      )}

      {isMedia && (
        <section className="ed-inspector__section">
          <h4>变速</h4>
          <div className="ed-chip-row">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`ed-chip ${(clip.speed ?? 1) === s ? 'is-on' : ''}`}
                onClick={() => setClip({ speed: s === 1 ? undefined : s })}
              >
                {s}×
              </button>
            ))}
          </div>
        </section>
      )}

      {(clip.type === 'video' || clip.type === 'image') && (
        <section className="ed-inspector__section">
          <h4>转场（出）</h4>
          <div className="ed-chip-row">
            {TRANSITION_KINDS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ed-chip ${transitionKind === t.id ? 'is-on' : ''}`}
                onClick={() =>
                  apply({
                    op: 'set-transition',
                    clipId: clip.id,
                    transition:
                      t.id === 'none'
                        ? null
                        : {
                            kind: t.id as TimelineTransition['kind'],
                            durationSec: clip.transitionOut?.durationSec ?? 0.4,
                          },
                  })
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          {clip.transitionOut && clip.transitionOut.kind !== 'cut' && (
            <label className="ed-field">
              <span>转场时长 {clip.transitionOut.durationSec.toFixed(2)}s</span>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.05}
                value={clip.transitionOut.durationSec}
                onChange={(e) =>
                  apply({
                    op: 'set-transition',
                    clipId: clip.id,
                    transition: { ...clip.transitionOut!, durationSec: Number(e.target.value) },
                  })
                }
              />
            </label>
          )}
        </section>
      )}

      {clip.type === 'subtitle' && (
        <section className="ed-inspector__section">
          <h4>字幕</h4>
          <textarea
            className="ed-textarea"
            rows={3}
            value={clip.text ?? ''}
            onChange={(e) => setClip({ text: e.target.value })}
            placeholder="字幕文本…"
          />
          <div className="ed-field-row">
            <label className="ed-field">
              <span>字号</span>
              <input
                type="number"
                min={12}
                max={96}
                value={Number(clip.style?.fontSize ?? 28)}
                onChange={(e) =>
                  setClip({ style: { ...clip.style, fontSize: Number(e.target.value) } })
                }
              />
            </label>
            <label className="ed-field">
              <span>颜色</span>
              <input
                type="color"
                value={String(clip.style?.color ?? '#ffffff')}
                onChange={(e) => setClip({ style: { ...clip.style, color: e.target.value } })}
              />
            </label>
          </div>
        </section>
      )}

      {clip.replacedFrom && (
        <section className="ed-inspector__section">
          <h4>智能替换溯源</h4>
          <p className="ed-hint">本片段已被替换，可一键回滚到原素材。</p>
          <button
            type="button"
            className="ed-btn ed-btn--block"
            onClick={() =>
              apply({
                op: 'replace-clip-asset',
                clipId: clip.id,
                assetUrl: clip.replacedFrom!,
                replacedFrom: undefined,
              })
            }
          >
            回滚到原素材
          </button>
        </section>
      )}
    </div>
  );
}
