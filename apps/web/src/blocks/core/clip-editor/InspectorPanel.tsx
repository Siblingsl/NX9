import { useCallback, useState } from 'react';
import { Captions, Loader2, Replace, Scissors, Trash2, Upload } from 'lucide-react';
import {
  findTimelineClip,
  removeAnimKeyframe,
  sortAnimKeyframes,
  upsertAnimKeyframe,
  type TimelineAnimKeyframe,
  type TimelineClip,
  type TimelineClipAnimations,
  type TimelineMaskKind,
  type TimelineOp,
  type TimelinePayload,
  type TimelineTransition,
} from '@nx9/shared';
import { api } from '../../../api/client';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
const TRANSITION_KINDS: Array<{ id: TimelineTransition['kind'] | 'none'; label: string }> = [
  { id: 'none', label: '无' },
  { id: 'cut', label: '硬切' },
  { id: 'fade', label: '淡入淡出' },
];

const MASK_KINDS: Array<{ id: TimelineMaskKind; label: string }> = [
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '椭圆' },
  { id: 'diamond', label: '菱形' },
  { id: 'heart', label: '心形' },
  { id: 'cinematic', label: '电影遮幅' },
];

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'soft-light',
];

const ANIM_PROPS: Array<{
  key: keyof TimelineClipAnimations;
  label: string;
  min: number;
  max: number;
  step: number;
  valueOf: (clip: TimelineClip) => number;
  onlyOverlay?: boolean;
}> = [
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.05, valueOf: () => 1 },
  { key: 'scale', label: '缩放', min: 0.2, max: 3, step: 0.05, valueOf: (c) => c.overlay?.scale ?? 1 },
  { key: 'x', label: '水平位置', min: 0, max: 100, step: 1, valueOf: (c) => c.overlay?.x ?? 50, onlyOverlay: true },
  { key: 'y', label: '垂直位置', min: 0, max: 100, step: 1, valueOf: (c) => c.overlay?.y ?? 50, onlyOverlay: true },
  { key: 'rotation', label: '旋转', min: -180, max: 180, step: 1, valueOf: (c) => c.overlay?.rotation ?? 0, onlyOverlay: true },
];

export interface InspectorPanelProps {
  timeline: TimelinePayload;
  /** 多选：>1 时显示批量操作面板 */
  selectedClipIds: string[];
  playheadSec: number;
  apply: (ops: TimelineOp | TimelineOp[]) => unknown;
  onSelect: (clipIds: string[]) => void;
  /** 打开智能替换工作台（仅视频片段） */
  onSmartReplace: (clipId: string) => void;
  /** AI 字幕：转写选中音视频片段生成字幕轨 */
  onGenerateSubtitles: (clipId: string) => void;
  /** 导入 SRT 转录文件生成字幕轨 */
  onImportSrt: (clipId: string, file: File) => void;
  subtitleBusyClipId: string | null;
}

export function InspectorPanel({
  timeline,
  selectedClipIds,
  playheadSec,
  apply,
  onSelect,
  onSmartReplace,
  onGenerateSubtitles,
  onImportSrt,
  subtitleBusyClipId,
}: InspectorPanelProps) {
  const loc = selectedClipIds.length === 1 ? findTimelineClip(timeline, selectedClipIds[0]) : null;

  const [speedPitchBusy, setSpeedPitchBusy] = useState(false);
  const [speedPitchError, setSpeedPitchError] = useState('');

  const setClip = useCallback(
    (patch: Record<string, unknown>) => {
      if (selectedClipIds.length !== 1) return;
      apply({ op: 'set-clip', clipId: selectedClipIds[0], patch });
    },
    [apply, selectedClipIds],
  );

  /** 变速保音调：服务端 setpts+atempo 渲染新素材，替换片段素材并把 speed 还原为 1 */
  const handleSpeedPitch = useCallback(
    async (clip: TimelineClip) => {
      const speed = clip.speed ?? 1;
      if (Math.abs(speed - 1) < 1e-6) {
        setSpeedPitchError('当前片段未变速（speed=1），无需渲染');
        return;
      }
      setSpeedPitchBusy(true);
      setSpeedPitchError('');
      try {
        const res = await api.speedPitch({ sourceUrl: clip.assetUrl, speed });
        if (!res.ok || !res.url) {
          setSpeedPitchError(res.message || '保音调渲染失败');
          return;
        }
        const patch: Record<string, unknown> = {
          speed: undefined,
          trimInSec: clip.trimInSec ? clip.trimInSec / speed : undefined,
        };
        apply([
          { op: 'replace-clip-asset', clipId: clip.id, assetUrl: res.url },
          { op: 'set-clip', clipId: clip.id, patch },
        ]);
      } catch (e) {
        setSpeedPitchError(e instanceof Error ? e.message : String(e));
      } finally {
        setSpeedPitchBusy(false);
      }
    },
    [apply],
  );

  const clipEffects = (clip: TimelineClip): { blur: number } => ({
    blur: clip.effects?.blur ?? 0,
  });

  // ── 多选批量操作 ──
  if (selectedClipIds.length > 1) {
    const canSplitAny = selectedClipIds.some((id) => {
      const l = findTimelineClip(timeline, id);
      return (
        l &&
        playheadSec > l.clip.startSec + 0.1 &&
        playheadSec < l.clip.startSec + l.clip.durationSec - 0.1
      );
    });
    return (
      <div className="ed-inspector">
        <div className="ed-inspector__title">
          <b>{selectedClipIds.length} 个片段</b>
          <span className="ed-inspector__type">多选</span>
        </div>
        <p className="ed-hint">
          批量操作整组片段；拖动任意一个可整组移动（同一轨）。Ctrl/Shift 点选可增删成员。
        </p>
        <div className="ed-inspector__actions">
          <button
            type="button"
            className="ed-btn"
            disabled={!canSplitAny}
            title="在播放头处分割所有可切片段"
            onClick={() =>
              apply(
                selectedClipIds.map((id) => ({
                  op: 'split-clip' as const,
                  clipId: id,
                  atSec: playheadSec,
                })),
              )
            }
          >
            <Scissors size={12} /> 批量分割
          </button>
          <button
            type="button"
            className="ed-btn"
            title="删除全部选中片段"
            onClick={() => {
              apply(selectedClipIds.map((id) => ({ op: 'remove-clip' as const, clipId: id })));
              onSelect([]);
            }}
          >
            <Trash2 size={12} /> 删除
          </button>
          <button
            type="button"
            className="ed-btn"
            title="删除全部选中并让同轨后续片段前移补洞"
            onClick={() => {
              apply(
                selectedClipIds.map((id) => ({ op: 'remove-clip' as const, clipId: id, ripple: true })),
              );
              onSelect([]);
            }}
          >
            波纹删除
          </button>
        </div>
      </div>
    );
  }

  if (!loc) {
    return (
      <div className="ed-inspector">
        <div className="ed-empty">
          选中时间轴上的片段
          <br />
          编辑裁剪 / 转场 / 音量 / 变速 / 字幕
          <br />
          Ctrl/Shift 点选或框选可多选
        </div>
      </div>
    );
  }

  const { clip, track } = loc;
  const isMedia = clip.type === 'video' || clip.type === 'audio';
  const canSplit =
    playheadSec > clip.startSec + 0.1 && playheadSec < clip.startSec + clip.durationSec - 0.1;
  const transitionKind = clip.transitionOut?.kind ?? 'none';
  const overlay = clip.overlay ?? { x: 50, y: 50, scale: 1, rotation: 0 };

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
            onSelect([]);
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
            onSelect([]);
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
        <button
          type="button"
          className="ed-btn ed-btn--block"
          disabled={!clip.assetUrl || subtitleBusyClipId === clip.id}
          title="语音识别生成字幕轨（可撤销；识别结果可在字幕轨上直接编辑）"
          onClick={() => onGenerateSubtitles(clip.id)}
        >
          {subtitleBusyClipId === clip.id ? (
            <Loader2 size={12} className="ed-spin" />
          ) : (
            <Captions size={12} />
          )}
          {subtitleBusyClipId === clip.id ? '转写中…' : 'AI 生成字幕'}
        </button>
      )}

      {isMedia && (
        <label className="ed-btn ed-btn--block ed-btn--file" title="导入 .srt 转录文件生成字幕轨（按素材时间换算）">
          <Upload size={12} /> 导入 SRT 生成字幕
          <input
            type="file"
            accept=".srt,.txt,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportSrt(clip.id, f);
              e.target.value = '';
            }}
          />
        </label>
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
          <button
            type="button"
            className="ed-btn ed-btn--block"
            disabled={speedPitchBusy || (clip.speed ?? 1) === 1}
            title="用 FFmpeg 按当前倍速渲染新素材（视频 setpts + 音频 atempo），音调不变；素材替换后可一键回滚"
            onClick={() => void handleSpeedPitch(clip)}
          >
            {speedPitchBusy ? <Loader2 size={12} className="ed-spin" /> : null}
            {speedPitchBusy ? '渲染保音调版本中…' : '保音调渲染（替换素材）'}
          </button>
          {speedPitchError && <p className="ed-hint ed-hint--err">{speedPitchError}</p>}
          <p className="ed-field-hint">
            未渲染时预览/成片为变速变调（浏览器直放）；渲染后素材已变速，音调不变且更稳。
          </p>
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
          <p className="ed-field-hint">
            淡入淡出=压黑渐隐；wipe=横向擦除；shader=滤镜预置（默认 flash 闪白，可选 blur 模糊 / slide 滑出）。
          </p>
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

      {clip.type === 'overlay' && (
        <section className="ed-inspector__section">
          <h4>贴片位姿（预览与 Remotion 成片同源）</h4>
          <label className="ed-field">
            <span>水平位置 {Math.round(overlay.x)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={overlay.x}
              onChange={(e) => setClip({ overlay: { ...overlay, x: Number(e.target.value) } })}
            />
          </label>
          <label className="ed-field">
            <span>垂直位置 {Math.round(overlay.y)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={overlay.y}
              onChange={(e) => setClip({ overlay: { ...overlay, y: Number(e.target.value) } })}
            />
          </label>
          <label className="ed-field">
            <span>缩放 {overlay.scale.toFixed(2)}×</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={overlay.scale}
              onChange={(e) => setClip({ overlay: { ...overlay, scale: Number(e.target.value) } })}
            />
          </label>
          <label className="ed-field">
            <span>旋转 {overlay.rotation ?? 0}°</span>
            <input
              type="number"
              min={-180}
              max={180}
              step={1}
              value={overlay.rotation ?? 0}
              onChange={(e) => setClip({ overlay: { ...overlay, rotation: Number(e.target.value) } })}
            />
          </label>
          <p className="ed-field-hint">贴片默认 50/50 居中，预览与 Remotion 导出共用同一坐标。</p>
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

      {(clip.type === 'video' || clip.type === 'image' || clip.type === 'overlay') && (
        <section className="ed-inspector__section">
          <h4>效果</h4>
          <label className="ed-field">
            <span>模糊 {clipEffects(clip).blur > 0 ? `${clipEffects(clip).blur}px` : '关'}</span>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={clipEffects(clip).blur}
              onChange={(e) => {
                const blur = Number(e.target.value);
                setClip({
                  effects: blur > 0 ? { ...clip.effects, blur } : undefined,
                });
              }}
            />
          </label>
          <p className="ed-field-hint">预览与 Remotion 成片共用同一效果字段。</p>
        </section>
      )}

      {(clip.type === 'video' || clip.type === 'image' || clip.type === 'overlay') && (
        <section className="ed-inspector__section">
          <h4>混合模式</h4>
          <select
            className="ed-select"
            value={clip.blendMode ?? 'normal'}
            onChange={(e) =>
              setClip({ blendMode: e.target.value === 'normal' ? undefined : e.target.value })
            }
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="ed-field-hint">片段与下层画面的叠加方式，预览与成片同源。</p>
        </section>
      )}

      {(clip.type === 'video' || clip.type === 'image' || clip.type === 'overlay') && (
        <section className="ed-inspector__section">
          <h4>动画（关键帧）</h4>
          <p className="ed-field-hint">
            播放头移到片段内任意位置打点，多个点形成随时间变化的动画；分割片段会按相对时间自动切开。
          </p>
          {ANIM_PROPS.filter((p) => !p.onlyOverlay || clip.type === 'overlay').map((p) => {
            const kfs = sortAnimKeyframes(clip.animations?.[p.key]);
            const atSec = Math.max(0, playheadSec - clip.startSec);
            return (
              <div key={p.key} className="ed-anim-row">
                <div className="ed-field">
                  <span>
                    {p.label} {kfs.length > 0 ? `（${kfs.length} 点）` : '（未打点）'}
                  </span>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={p.valueOf(clip)}
                    disabled={track.locked}
                    onChange={(e) =>
                      setClip({
                        animations: {
                          ...clip.animations,
                          [p.key]: upsertAnimKeyframe(kfs, atSec, Number(e.target.value)),
                        },
                      })
                    }
                  />
                </div>
                <div className="ed-field-row">
                  <button
                    type="button"
                    className="ed-btn"
                    disabled={track.locked}
                    title={`在播放头 ${atSec.toFixed(2)}s（片段内）给「${p.label}」打点`}
                    onClick={() =>
                      setClip({
                        animations: {
                          ...clip.animations,
                          [p.key]: upsertAnimKeyframe(kfs, atSec, p.valueOf(clip)),
                        },
                      })
                    }
                  >
                    播放头打点
                  </button>
                </div>
                {kfs.length > 0 && (
                  <ul className="ed-keyframe-list">
                    {kfs.map((kf) => (
                      <li key={`${kf.atSec}-${kf.value}`}>
                        <span>
                          {kf.atSec.toFixed(2)}s · {kf.value.toFixed(2)}
                        </span>
                        <select
                          className="ed-mini-select"
                          value={kf.ease ?? 'linear'}
                          onChange={(e) =>
                            setClip({
                              animations: {
                                ...clip.animations,
                                [p.key]: upsertAnimKeyframe(
                                  clip.animations?.[p.key],
                                  kf.atSec,
                                  kf.value,
                                  e.target.value as TimelineAnimKeyframe['ease'],
                                ),
                              },
                            })
                          }
                        >
                          <option value="linear">线性</option>
                          <option value="ease-in">缓入</option>
                          <option value="ease-out">缓出</option>
                          <option value="ease-in-out">缓入缓出</option>
                        </select>
                        <button
                          type="button"
                          className="ed-btn"
                          disabled={track.locked}
                          onClick={() =>
                            setClip({
                              animations: {
                                ...clip.animations,
                                [p.key]: removeAnimKeyframe(clip.animations?.[p.key], kf.atSec),
                              },
                            })
                          }
                        >
                          删
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {(clip.type === 'video' || clip.type === 'image' || clip.type === 'overlay') && (
        <section className="ed-inspector__section">
          <h4>蒙版</h4>
          <div className="ed-chip-row">
            <button
              type="button"
              className={`ed-chip ${!clip.mask ? 'is-on' : ''}`}
              onClick={() => setClip({ mask: undefined })}
            >
              无
            </button>
            {MASK_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`ed-chip ${clip.mask?.kind === k.id ? 'is-on' : ''}`}
                onClick={() =>
                  setClip({
                    mask:
                      clip.mask?.kind === k.id
                        ? clip.mask
                        : { kind: k.id, x: 50, y: 50, w: 80, h: 80 },
                  })
                }
              >
                {k.label}
              </button>
            ))}
          </div>
          {clip.mask && (
            <>
              <label className="ed-field">
                <span>水平 {Math.round(clip.mask.x)}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={clip.mask.x}
                  disabled={track.locked}
                  onChange={(e) => setClip({ mask: { ...clip.mask, x: Number(e.target.value) } })}
                />
              </label>
              <label className="ed-field">
                <span>垂直 {Math.round(clip.mask.y)}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={clip.mask.y}
                  disabled={track.locked}
                  onChange={(e) => setClip({ mask: { ...clip.mask, y: Number(e.target.value) } })}
                />
              </label>
              {clip.mask.kind !== 'cinematic' && (
                <>
                  <div className="ed-field-row">
                    <label className="ed-field">
                      <span>宽 {Math.round(clip.mask.w)}%</span>
                      <input
                        type="range"
                        min={5}
                        max={200}
                        step={1}
                        value={clip.mask.w}
                        disabled={track.locked}
                        onChange={(e) => setClip({ mask: { ...clip.mask, w: Number(e.target.value) } })}
                      />
                    </label>
                    <label className="ed-field">
                      <span>高 {Math.round(clip.mask.h)}%</span>
                      <input
                        type="range"
                        min={5}
                        max={200}
                        step={1}
                        value={clip.mask.h}
                        disabled={track.locked}
                        onChange={(e) => setClip({ mask: { ...clip.mask, h: Number(e.target.value) } })}
                      />
                    </label>
                  </div>
                  <div className="ed-field-row">
                    <label className="ed-field">
                      <span>旋转 {Math.round(clip.mask.rotation ?? 0)}°</span>
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step={1}
                        value={clip.mask.rotation ?? 0}
                        disabled={track.locked}
                        onChange={(e) =>
                          setClip({ mask: { ...clip.mask, rotation: Number(e.target.value) } })
                        }
                      />
                    </label>
                  </div>
                </>
              )}
              {clip.mask.kind === 'cinematic' && (
                <div className="ed-field-row">
                  <label className="ed-field">
                    <span>上遮幅 {Math.round(clip.mask.y)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      step={1}
                      value={clip.mask.y}
                      disabled={track.locked}
                      onChange={(e) => setClip({ mask: { ...clip.mask, y: Number(e.target.value) } })}
                    />
                  </label>
                  <label className="ed-field">
                    <span>下遮幅 {Math.round(clip.mask.h)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      step={1}
                      value={clip.mask.h}
                      disabled={track.locked}
                      onChange={(e) => setClip({ mask: { ...clip.mask, h: Number(e.target.value) } })}
                    />
                  </label>
                </div>
              )}
              <div className="ed-field-row">
                <label className="ed-field">
                  <span>羽化 {clip.mask.feather ?? 0}%</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={clip.mask.feather ?? 0}
                    disabled={track.locked}
                    onChange={(e) =>
                      setClip({ mask: { ...clip.mask, feather: Number(e.target.value) } })
                    }
                  />
                </label>
                <label className="ed-field">
                  <span>描边 {clip.mask.stroke ?? 0}%</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.1}
                    value={clip.mask.stroke ?? 0}
                    disabled={track.locked}
                    onChange={(e) =>
                      setClip({ mask: { ...clip.mask, stroke: Number(e.target.value) } })
                    }
                  />
                </label>
              </div>
            </>
          )}
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
