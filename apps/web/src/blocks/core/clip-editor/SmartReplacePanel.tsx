import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Wand2, X } from 'lucide-react';
import {
  CLIP_GEN_MODELS,
  DEFAULT_VIDEO_EDIT_PROVIDER,
  VIDEO_EDIT_PROVIDERS,
  enrichPromptWithAssetMentions,
  collectAssetMentionUrls,
  type AssetLibraryKind,
  type TimelineClip,
} from '@nx9/shared';
import { api } from '../../../api/client';
import { pollVideoUntilDone } from '../../../engine/poll-task';
import { assertMaskFrameAligned } from '../../../engine/smart-edit-mask';
import { AssetMentionInput } from '../../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';
import { useAllAssetLibraryItems } from '../../../hooks/use-asset-library-items';

const REPLACE_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene', 'prop', 'costume', 'style'];

type ReplaceTarget = 'background' | 'subject' | 'object' | 'remove';
type EditEngine = 'gemini-edit' | 'fal-inpaint';
type ReplaceMode = 'regen' | 'direct';
type Step = 'frame' | 'edit' | 'video' | 'compare';

const videoEditProviders = VIDEO_EDIT_PROVIDERS;
const hasVideoEditFrameTracking = videoEditProviders.some((p) => p.supportsFrameTracking);

interface Point {
  x: number;
  y: number;
}

const TARGETS: Array<{ id: ReplaceTarget; label: string; needsMask: boolean }> = [
  { id: 'background', label: '换背景', needsMask: false },
  { id: 'subject', label: '换人物', needsMask: true },
  { id: 'object', label: '换物体', needsMask: true },
  { id: 'remove', label: '移除物体', needsMask: true },
];

function buildEditPrompt(target: ReplaceTarget, instruction: string): string {
  const t = instruction.trim();
  switch (target) {
    case 'background':
      return `将画面背景替换为：${t}。严格保持前景人物、姿态与构图不变，匹配新背景的光线氛围。`;
    case 'subject':
      return `将选区内的人物替换为：${t}。保持原有姿态、构图、镜头角度与光线方向。`;
    case 'object':
      return `将选区内的物体替换为：${t}。保持透视、比例与光线一致，边缘自然融合。`;
    case 'remove':
      return `移除选区内的内容，按周围环境自然补全，不留痕迹。${t ? `补充要求：${t}` : ''}`;
  }
}

export interface SmartReplacePanelProps {
  clip: TimelineClip;
  onClose: () => void;
  /** 采纳：新视频 URL + probe 到的真实时长（可能为空） */
  onReplaced: (
    newUrl: string,
    sourceDurationSec?: number,
    opts?: { adopt?: boolean },
  ) => void;
}

/**
 * 智能替换工作台（路线 A：帧编辑 + 重生成；路线 B：视频级直接替换）。
 * 抽关键帧 → mask 圈选 + 指令 → 图像编辑 → 图生视频（或视频级替换）→ 对比 → 回写。
 */
export function SmartReplacePanel({ clip, onClose, onReplaced }: SmartReplacePanelProps) {
  const [step, setStep] = useState<Step>('frame');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');

  const [frames, setFrames] = useState<string[]>([]);
  const [frameUrl, setFrameUrl] = useState<string>('');

  const [target, setTarget] = useState<ReplaceTarget>('background');
  const [instruction, setInstruction] = useState('');
  const [editEngine, setEditEngine] = useState<EditEngine>('gemini-edit');
  const [replaceMode, setReplaceMode] = useState<ReplaceMode>('regen');

  const [editedFrame, setEditedFrame] = useState<string>('');
  const [videoModel, setVideoModel] = useState<string>(CLIP_GEN_MODELS[0]?.id ?? 'magic-hour');
  const [videoEditProviderId, setVideoEditProviderId] = useState<string>(DEFAULT_VIDEO_EDIT_PROVIDER);
  const [motionPrompt, setMotionPrompt] = useState(clip.label);
  const [newVideoUrl, setNewVideoUrl] = useState<string>('');

  const { privateItems, publicItems } = useAllAssetLibraryItems();
  const abortRef = useRef<AbortController | null>(null);
  const directTaskIdRef = useRef<string | null>(null);
  const origVideoRef = useRef<HTMLVideoElement | null>(null);
  const newVideoRef = useRef<HTMLVideoElement | null>(null);
  const syncingRef = useRef(false);
  const [syncCompare, setSyncCompare] = useState(true);
  const enrichInstruction = useCallback(
    (raw: string) => enrichPromptWithAssetMentions(raw, privateItems, publicItems),
    [privateItems, publicItems],
  );
  const mentionRefUrls = collectAssetMentionUrls(instruction, privateItems, publicItems);

  // ── 抽帧 ──
  const extractFrames = useCallback(async () => {
    setBusy(true);
    setTip('抽取关键帧…');
    try {
      const res = await api.extractFrames(clip.assetUrl, 3);
      if (!res.ok || res.frames.length === 0) {
        throw new Error(res.message || '抽帧失败，请确认 FFmpeg 可用');
      }
      setFrames(res.frames);
      setFrameUrl(res.frames[0]);
      setTip('');
    } catch (e) {
      setTip(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [clip.assetUrl]);

  useEffect(() => {
    void extractFrames();
  }, [extractFrames]);

  const stopTask = useCallback(() => {
    abortRef.current?.abort();
    const taskId = directTaskIdRef.current;
    if (taskId) {
      directTaskIdRef.current = null;
      void api.videoEditCancel(taskId).catch(() => undefined);
    }
  }, []);

  // SE-DEEP-06: 关闭面板中止轮询；直接替换任务同时通知服务端取消
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const taskId = directTaskIdRef.current;
      if (taskId) void api.videoEditCancel(taskId).catch(() => undefined);
    };
  }, []);

  // SE-DEEP-13: 对比双视频共享播放头（timeupdate 互锁 + play/pause 镜像）
  useEffect(() => {
    if (!syncCompare || step !== 'compare') return;
    const a = origVideoRef.current;
    const b = newVideoRef.current;
    if (!a || !b) return;
    const mirror = (from: HTMLVideoElement, to: HTMLVideoElement) => () => {
      if (syncingRef.current) return;
      if (Math.abs(from.currentTime - to.currentTime) > 0.06) {
        syncingRef.current = true;
        to.currentTime = from.currentTime;
        syncingRef.current = false;
      }
    };
    const mirrorPlay = (from: HTMLVideoElement, to: HTMLVideoElement) => () => {
      if (syncingRef.current) return;
      if (from.paused && !to.paused) to.pause();
      else if (!from.paused && to.paused) void to.play().catch(() => undefined);
    };
    const aTime = () => mirror(a, b);
    const bTime = () => mirror(b, a);
    const aPlay = () => mirrorPlay(a, b);
    const bPlay = () => mirrorPlay(b, a);
    a.addEventListener('timeupdate', aTime);
    b.addEventListener('timeupdate', bTime);
    a.addEventListener('play', aPlay);
    b.addEventListener('play', bPlay);
    a.addEventListener('pause', aPlay);
    b.addEventListener('pause', bPlay);
    return () => {
      a.removeEventListener('timeupdate', aTime);
      b.removeEventListener('timeupdate', bTime);
      a.removeEventListener('play', aPlay);
      b.removeEventListener('play', bPlay);
      a.removeEventListener('pause', aPlay);
      b.removeEventListener('pause', bPlay);
    };
  }, [syncCompare, step, newVideoUrl, clip.assetUrl]);

  // ── mask 画布 ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 360, h: 240 });
  const [brushSize, setBrushSize] = useState(28);
  const [drawing, setDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);

  useEffect(() => {
    if (!frameUrl || step !== 'edit') return;
    strokesRef.current = [];
    setHasMask(false);
    imgRef.current = null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const maxW = 420;
      const maxH = 300;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setCanvasSize({
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale),
      });
      requestAnimationFrame(() => repaint(img));
    };
    img.src = frameUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameUrl, step]);

  const repaint = useCallback(
    (img?: HTMLImageElement | null) => {
      const canvas = canvasRef.current;
      const image = img ?? imgRef.current;
      if (!canvas || !image) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const sx = canvas.width / image.naturalWidth;
      const sy = canvas.height / image.naturalHeight;
      ctx.strokeStyle = 'rgba(255,80,140,0.75)';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const stroke of strokesRef.current) {
        if (stroke.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x * sx, stroke[0].y * sy);
        for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x * sx, stroke[i].y * sy);
        ctx.stroke();
      }
    },
    [brushSize],
  );

  const toImagePoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * imgNatural.w,
        y: ((clientY - rect.top) / rect.height) * imgNatural.h,
      };
    },
    [imgNatural],
  );

  const buildMaskBlob = useCallback(async (): Promise<Blob | null> => {
    const img = imgRef.current;
    if (!img || strokesRef.current.length === 0) return null;
    const mc = document.createElement('canvas');
    mc.width = img.naturalWidth;
    mc.height = img.naturalHeight;
    // SE-DEEP-14: 落盘蒙版必须与抽帧同像素尺寸，禁止缩略画布尺寸直接上传
    assertMaskFrameAligned({
      maskWidth: mc.width,
      maskHeight: mc.height,
      frameWidth: img.naturalWidth,
      frameHeight: img.naturalHeight,
    });
    const ctx = mc.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, mc.width, mc.height);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = brushSize * (img.naturalWidth / Math.max(1, canvasSize.w));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
    return new Promise<Blob | null>((resolve) => mc.toBlob(resolve, 'image/png'));
  }, [brushSize, canvasSize.w]);

  // ── 图像编辑（路线 A 第一步） ──
  const runImageEdit = useCallback(async () => {
    const prompt = buildEditPrompt(target, enrichInstruction(instruction));
    if (target !== 'remove' && !instruction.trim()) {
      setTip('请先描述替换目标（可用 @角色/@场景 引用素材库）');
      return;
    }
    const needsMask = TARGETS.find((t) => t.id === target)?.needsMask ?? false;
    if (editEngine === 'fal-inpaint' && !hasMask) {
      setTip('fal 局部重绘需要先圈选蒙版');
      return;
    }
    if (needsMask && !hasMask && editEngine === 'fal-inpaint') {
      setTip('请先用笔刷圈选目标区域');
      return;
    }
    setBusy(true);
    setTip(editEngine === 'fal-inpaint' ? '局部重绘中…' : '图像编辑中…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let resultUrl: string | undefined;
      if (editEngine === 'fal-inpaint') {
        const maskBlob = await buildMaskBlob();
        if (!maskBlob) throw new Error('蒙版为空');
        const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });
        const uploaded = await api.uploadAsset(maskFile);
        const res = (await api.pictureEditMasked({
          imageUrl: frameUrl,
          maskUrl: uploaded.url,
          prompt,
          engine: 'fal-inpaint',
        }, { signal: controller.signal })) as { ok?: boolean; url?: string; message?: string };
        resultUrl = res.url;
      } else {
        const res = (await api.proxyImage({
          prompt,
          model: 'gemini-2.5-flash-image',
          referenceImageUrls: [frameUrl, ...mentionRefUrls],
          n: 1,
        }, { signal: controller.signal })) as { ok?: boolean; url?: string; urls?: string[]; message?: string };
        resultUrl = res.url ?? res.urls?.[0];
        if (!resultUrl && res.message) throw new Error(res.message);
      }
      if (!resultUrl) throw new Error('图像编辑无结果');
      setEditedFrame(resultUrl);
      setStep('video');
      setTip('');
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setTip(aborted ? '已停止' : `编辑失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }, [target, instruction, enrichInstruction, editEngine, hasMask, buildMaskBlob, frameUrl, mentionRefUrls]);

  // ── 图生视频重生成（路线 A 第二步） ──
  const runVideoRegen = useCallback(async () => {
    setBusy(true);
    setTip('提交图生视频任务…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const speed = clip.speed ?? 1;
      const wantSec = Math.min(12, Math.max(2, Math.round(clip.durationSec * speed)));
      const res = (await api.proxyVideo({
        prompt: enrichInstruction(motionPrompt || clip.label),
        model: videoModel,
        imageUrl: editedFrame,
        duration: wantSec,
      }, { signal: controller.signal })) as { ok?: boolean; url?: string; status?: string; taskId?: string; message?: string };
      let url = res.url;
      if (!url && res.taskId && (res.status === 'processing' || res.status === 'queued')) {
        setTip('视频生成中，轮询任务…');
        url = await pollVideoUntilDone(res.taskId, { signal: controller.signal });
      }
      if (!url) throw new Error(res.message ?? '视频生成失败');
      setNewVideoUrl(url);
      setStep('compare');
      setTip('');
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setTip(aborted ? '已停止' : `生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }, [clip, motionPrompt, enrichInstruction, videoModel, editedFrame]);

  // ── 视频级直接替换（路线 B / P3） ──
  const runDirectVideoEdit = useCallback(async () => {
    const prompt = buildEditPrompt(target, enrichInstruction(instruction));
    if (!hasVideoEditFrameTracking) {
      setTip('直接替换已禁用：当前没有已注册的跨帧自动追踪供应商（SAM/跟踪），首帧蒙版无法保证整段边缘稳定。');
      return;
    }
    if (!hasMask) {
      setTip('直接替换需要先在首帧圈选目标区域');
      return;
    }
    setBusy(true);
    setTip('上传蒙版…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const maskBlob = await buildMaskBlob();
      if (!maskBlob) throw new Error('蒙版为空');
      const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });
      const uploaded = await api.uploadAsset(maskFile);
      setTip('提交视频级替换任务…');
      const submitted = await api.videoEditSubmit({
        videoUrl: clip.assetUrl,
        maskUrl: uploaded.url,
        prompt,
        providerId: videoEditProviderId,
      });
      if (!submitted.ok || !submitted.taskId) {
        throw new Error(submitted.message ?? '任务提交失败');
      }
      directTaskIdRef.current = submitted.taskId;
      const deadline = Date.now() + 15 * 60 * 1000;
      let url: string | undefined;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        if (controller.signal.aborted) {
          directTaskIdRef.current = null;
          void api.videoEditCancel(submitted.taskId).catch(() => undefined);
          throw new DOMException('已停止', 'AbortError');
        }
        const st = await api.videoEditStatus(submitted.taskId);
        if (st.status === 'done' && st.url) {
          url = st.url;
          break;
        }
        if (st.status === 'error') throw new Error(st.message ?? '视频替换失败');
        if (st.status === 'cancelled') {
          directTaskIdRef.current = null;
          throw new Error('任务已取消');
        }
        setTip(`视频替换中… ${st.progress ?? 0}%`);
      }
      if (!url) throw new Error('视频替换超时');
      directTaskIdRef.current = null;
      setNewVideoUrl(url);
      setStep('compare');
      setTip('');
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setTip(aborted ? '已停止' : `替换失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }, [target, instruction, enrichInstruction, hasMask, buildMaskBlob, clip.assetUrl, videoEditProviderId]);

  const accept = useCallback(async (adopt?: boolean) => {
    setBusy(true);
    try {
      let sourceDurationSec: number | undefined;
      try {
        const probe = await api.probeMediaDuration(newVideoUrl);
        if (probe.ok && probe.durationSec > 0) sourceDurationSec = probe.durationSec;
      } catch {
        /* probe 失败不阻塞采纳 */
      }
      onReplaced(newVideoUrl, sourceDurationSec, { adopt });
    } finally {
      setBusy(false);
    }
  }, [newVideoUrl, onReplaced]);

  return (
    <div className="ed-replace">
      <div className="ed-replace__panel">
        <header className="ed-replace__header">
          {step !== 'frame' && (
            <button
              type="button"
              className="ed-icon-btn"
              title="上一步"
              onClick={() =>
                setStep(step === 'compare' ? (replaceMode === 'direct' ? 'edit' : 'video') : step === 'video' ? 'edit' : 'frame')
              }
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <b>智能替换</b>
          <span className="ed-replace__clip" title={clip.label}>
            {clip.label}
          </span>
          <button type="button" className="ed-icon-btn" title="关闭" onClick={() => { stopTask(); onClose(); }}>
            <X size={14} />
          </button>
        </header>

        {step === 'frame' && (
          <div className="ed-replace__body">
            <p className="ed-hint">选择用于标注的关键帧：</p>
            {busy && (
              <p className="ed-hint">
                <Loader2 size={12} className="ed-spin" /> 抽帧中…
              </p>
            )}
            <div className="ed-replace__frames">
              {frames.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`ed-replace__frame ${frameUrl === f ? 'is-on' : ''}`}
                  onClick={() => setFrameUrl(f)}
                >
                  <img src={f} alt="" />
                </button>
              ))}
            </div>
            {!busy && frames.length === 0 && (
              <button type="button" className="ed-btn" onClick={() => void extractFrames()}>
                <RefreshCw size={12} /> 重试抽帧
              </button>
            )}
            {tip && <p className="ed-warn">{tip}</p>}
            <div className="ed-replace__actions">
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={!frameUrl}
                onClick={() => setStep('edit')}
              >
                下一步：标注与指令
              </button>
            </div>
          </div>
        )}

        {step === 'edit' && (
          <div className="ed-replace__body">
            <div className="ed-chip-row">
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ed-chip ${target === t.id ? 'is-on' : ''}`}
                  onClick={() => setTarget(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ed-replace__canvas-wrap">
              <canvas
                ref={canvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                className="ed-replace__canvas"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDrawing(true);
                  currentStrokeRef.current = [toImagePoint(e.clientX, e.clientY)];
                }}
                onPointerMove={(e) => {
                  if (!drawing) return;
                  currentStrokeRef.current.push(toImagePoint(e.clientX, e.clientY));
                  strokesRef.current = [...strokesRef.current];
                  repaint();
                  // 当前笔画实时绘制
                  const canvas = canvasRef.current;
                  const img = imgRef.current;
                  if (canvas && img) {
                    const ctx = canvas.getContext('2d')!;
                    const sx = canvas.width / img.naturalWidth;
                    const sy = canvas.height / img.naturalHeight;
                    const pts = currentStrokeRef.current;
                    ctx.strokeStyle = 'rgba(255,80,140,0.75)';
                    ctx.lineWidth = brushSize;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
                    ctx.stroke();
                  }
                }}
                onPointerUp={() => {
                  if (!drawing) return;
                  setDrawing(false);
                  if (currentStrokeRef.current.length > 1) {
                    strokesRef.current.push([...currentStrokeRef.current]);
                    setHasMask(true);
                  }
                  currentStrokeRef.current = [];
                  repaint();
                }}
              />
              <button
                type="button"
                className="ed-mini-btn ed-replace__clear"
                onClick={() => {
                  strokesRef.current = [];
                  setHasMask(false);
                  repaint();
                }}
              >
                清除蒙版
              </button>
            </div>

            <label className="ed-field">
              <span>笔刷 {brushSize}px</span>
              <input
                type="range"
                min={8}
                max={80}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </label>

            <AssetMentionInput
              as="textarea"
              className="ed-textarea"
              rows={2}
              value={instruction}
              onChange={setInstruction}
              kinds={REPLACE_MENTION_KINDS}
              highlightMentions
              tone="desk"
              placeholder={
                target === 'background'
                  ? '例：@场景:天台 黄昏晚霞，或自由描述'
                  : target === 'remove'
                    ? '（可选）补充移除要求'
                    : '例：@角色:银发风衣 / @道具:怀表，或自由描述'
              }
            />

            <div className="ed-field-row">
              <label className="ed-field">
                <span>替换方式</span>
                <select value={replaceMode} onChange={(e) => setReplaceMode(e.target.value as ReplaceMode)}>
                  <option value="regen">重生成（改帧 → 图生视频）</option>
                  <option value="direct">直接替换（视频级，需服务端支持）</option>
                </select>
              </label>
              {replaceMode === 'regen' && (
                <label className="ed-field">
                  <span>图像编辑引擎</span>
                  <select value={editEngine} onChange={(e) => setEditEngine(e.target.value as EditEngine)}>
                    <option value="gemini-edit">Gemini 指令编辑（免 mask）</option>
                    <option value="fal-inpaint">Fal 局部重绘（按 mask）</option>
                  </select>
                </label>
              )}
            </div>

            {replaceMode === 'regen' && editEngine === 'fal-inpaint' && mentionRefUrls.length > 0 && (
              <p className="ed-warn">
                fal 局部重绘不支持多参考图：@引用仅以文字锁定；如需附图请改用 Gemini 指令编辑。
              </p>
            )}
            {replaceMode === 'direct' && !hasVideoEditFrameTracking && (
              <p className="ed-warn">
                视频级直接替换当前不可用：未接入跨帧自动追踪（SAM/跟踪），首帧蒙版无法保证整段边缘稳定。请改用「重生成」路线。
              </p>
            )}
            {replaceMode === 'direct' && videoEditProviders.length > 0 && (
              <label className="ed-field">
                <span>视频级供应商（已注册 {videoEditProviders.length} 家）</span>
                <select
                  value={videoEditProviderId}
                  disabled={videoEditProviders.length < 2}
                  title={videoEditProviders.length < 2 ? '当前仅一家供应商，无可切换候选' : undefined}
                  onChange={(e) => setVideoEditProviderId(e.target.value)}
                >
                  {videoEditProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {replaceMode === 'direct' && videoEditProviders.length < 2 && (
              <p className="ed-hint">
                路线 B 当前仅 WAN VACE 单供应商，失败时会明确报错，不会自动切换供应商。
              </p>
            )}
            {tip && <p className="ed-warn">{tip}</p>}
            <div className="ed-replace__actions">
              {busy && (
                <button type="button" className="ed-btn" onClick={stopTask} title="停止当前任务（直接替换会同时取消服务端任务）">
                  停止
                </button>
              )}
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={busy || (replaceMode === 'direct' && !hasVideoEditFrameTracking)}
                title={
                  replaceMode === 'direct' && !hasVideoEditFrameTracking
                    ? '未接入跨帧自动追踪，直接替换路径已禁用'
                    : undefined
                }
                onClick={() => void (replaceMode === 'direct' ? runDirectVideoEdit() : runImageEdit())}
              >
                {busy ? <Loader2 size={12} className="ed-spin" /> : <Wand2 size={12} />}
                {replaceMode === 'direct' ? '执行视频级替换' : '生成替换帧'}
              </button>
            </div>
          </div>
        )}

        {step === 'video' && (
          <div className="ed-replace__body">
            <div className="ed-replace__compare">
              <figure>
                <img src={frameUrl} alt="" />
                <figcaption>原帧</figcaption>
              </figure>
              <figure>
                <img src={editedFrame} alt="" />
                <figcaption>替换后</figcaption>
              </figure>
            </div>
            <div className="ed-field-row">
              <label className="ed-field">
                <span>视频模型</span>
                <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)}>
                  {CLIP_GEN_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ed-field">
              <span>运动描述</span>
              <AssetMentionInput
                as="textarea"
                className="ed-textarea"
                rows={2}
                value={motionPrompt}
                onChange={setMotionPrompt}
                kinds={REPLACE_MENTION_KINDS}
                highlightMentions
                tone="desk"
                placeholder="沿用原镜运动，如：缓慢推近，人物转头"
              />
            </label>
            {tip && <p className="ed-warn">{tip}</p>}
            <div className="ed-replace__actions">
              {busy && (
                <button type="button" className="ed-btn" onClick={stopTask} title="停止轮询；后台图生视频任务可能继续，可稍后恢复">
                  停止
                </button>
              )}
              <button type="button" className="ed-btn" disabled={busy} onClick={() => void runImageEdit()}>
                <RefreshCw size={12} /> 重新生成帧
              </button>
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={busy}
                onClick={() => void runVideoRegen()}
              >
                {busy ? <Loader2 size={12} className="ed-spin" /> : null}
                以此帧生成视频
              </button>
            </div>
          </div>
        )}

        {step === 'compare' && (
          <div className="ed-replace__body">
            <label className="ed-replace__sync">
              <input
                type="checkbox"
                checked={syncCompare}
                onChange={(e) => setSyncCompare(e.target.checked)}
              />
              同步播放头
            </label>
            <div className="ed-replace__compare">
              <figure>
                <video ref={origVideoRef} src={clip.assetUrl} controls muted />
                <figcaption>原片段</figcaption>
              </figure>
              <figure>
                <video ref={newVideoRef} src={newVideoUrl} controls muted />
                <figcaption>替换后</figcaption>
              </figure>
            </div>
            {tip && <p className="ed-warn">{tip}</p>}
            <div className="ed-replace__actions">
              <button type="button" className="ed-btn" disabled={busy} onClick={onClose}>
                放弃
              </button>
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={busy}
                onClick={() => void accept(false)}
              >
                {busy ? <Loader2 size={12} className="ed-spin" /> : null}
                仅时间线
              </button>
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={busy}
                title="同时写回上游镜 videoVersions 并采用为正式版（导演台无需再审）"
                onClick={() => void accept(true)}
              >
                {busy ? <Loader2 size={12} className="ed-spin" /> : null}
                时间线+采用正式版
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
