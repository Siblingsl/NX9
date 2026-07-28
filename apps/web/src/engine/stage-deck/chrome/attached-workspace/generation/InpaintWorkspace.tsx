import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { lookupBlock } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from './use-attached-node-data';
import { useActivityLog } from '../../../../../stores/activity-log';
import { api } from '../../../../../api/client';

interface Point { x: number; y: number }

export interface InpaintWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function InpaintWorkspace({ blockId, kind, onCollapse }: InpaintWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const data = useAttachedNodeData(blockId);

  const upstream = data.upstream as { pictures?: string[] } | undefined;
  const imageUrl = upstream?.pictures?.[0] || (data.imageUrl as string);
  const prompt = (data.content as string) ?? '';
  const resultUrl = data.previewUrl as string | undefined;
  const status = data.status as string | undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 280, h: 200 });
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!imageUrl) { setReady(false); return; }
    setReady(false);
    strokesRef.current = [];
    imgRef.current = null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const maxW = 280, maxH = 200;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setCanvasSize({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) });
      setReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const sx = canvas.width / img.naturalWidth;
    const sy = canvas.height / img.naturalHeight;
    if (strokesRef.current.length === 0) return;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * sx, stroke[0].y * sy);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * sx, stroke[i].y * sy);
      }
      ctx.stroke();
    }
  }, [brushSize]);

  useEffect(() => { if (ready) paint(); }, [ready, paint]);

  const getImgPt = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * imgNatural.w,
      y: ((clientY - rect.top) / rect.height) * imgNatural.h,
    };
  };

  const strokeNow = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    const pts = currentStrokeRef.current;
    const sx = canvas.width / img.naturalWidth;
    const sy = canvas.height / img.naturalHeight;
    if (pts.length === 1) {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(pts[0].x * sx, pts[0].y * sy, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const last = pts[pts.length - 2];
    const cur = pts[pts.length - 1];
    ctx.strokeStyle = 'white';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x * sx, last.y * sy);
    ctx.lineTo(cur.x * sx, cur.y * sy);
    ctx.stroke();
  };

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    currentStrokeRef.current = [getImgPt(cx, cy)];
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    currentStrokeRef.current.push(getImgPt(cx, cy));
    strokeNow();
  };

  const onPointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push([...currentStrokeRef.current]);
    }
    currentStrokeRef.current = [];
  };

  const clearMask = () => {
    strokesRef.current = [];
    paint();
    updateNodeData(blockId, { maskUrl: '' });
  };

  const run = async () => {
    if (!imageUrl || !imgRef.current) { appendLog('局部重绘：无上游图片'); return; }
    if (!prompt.trim()) { appendLog('局部重绘：请输入 prompt'); return; }
    if (strokesRef.current.length === 0) { appendLog('局部重绘：请绘制蒙版'); return; }
    setUploading(true);
    updateNodeData(blockId, { status: 'running' });
    try {
      const mc = document.createElement('canvas');
      mc.width = imgRef.current.naturalWidth;
      mc.height = imgRef.current.naturalHeight;
      const mctx = mc.getContext('2d')!;
      mctx.fillStyle = 'black';
      mctx.fillRect(0, 0, mc.width, mc.height);
      mctx.strokeStyle = 'white';
      mctx.lineWidth = brushSize;
      mctx.lineCap = 'round';
      mctx.lineJoin = 'round';
      for (const stroke of strokesRef.current) {
        if (stroke.length < 2) continue;
        mctx.beginPath();
        mctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          mctx.lineTo(stroke[i].x, stroke[i].y);
        }
        mctx.stroke();
      }
      const blob = await new Promise<Blob>((resolve) => mc.toBlob((b) => resolve(b!), 'image/png'));
      const file = new File([blob], 'mask.png', { type: 'image/png' });
      const uploaded = await api.uploadAsset(file);
      updateNodeData(blockId, { maskUrl: uploaded.url });
      const res = await api.proxyFal({
        model: 'fal-ai/fast-sdxl/inpainting',
        input: { image_url: imageUrl, mask_url: uploaded.url, prompt: prompt.trim() },
      });
      if (!res.url) throw new Error('重绘失败');
      updateNodeData(blockId, { status: 'success', previewUrl: res.url, output: res.url });
      appendLog('局部重绘完成');
    } catch (e) {
      updateNodeData(blockId, { status: 'error', error: String(e) });
      appendLog(`重绘失败: ${String(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const isRunning = uploading || status === 'running';

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={onCollapse}
      onRun={() => void run()}
      running={isRunning}
      runLabel="重绘"
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-auto max-h-[440px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      <div className="space-y-2">
        {resultUrl && (
          <img src={resultUrl} alt="" className="w-full rounded-lg max-h-36 object-cover border border-line" />
        )}
        {imageUrl && ready ? (
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              className="w-full rounded-lg border border-line cursor-crosshair touch-none"
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            />
            <button
              type="button"
              onClick={clearMask}
              className="absolute top-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-black/70"
            >
              清除
            </button>
          </div>
        ) : (
          <p className="text-ink/50 text-center py-4">
            {imageUrl ? '加载图片…' : '连接 picture 输入'}
          </p>
        )}
        <div className="flex items-center gap-2">
          <label className="text-ink/60 text-[10px]">笔刷:</label>
          <input
            type="range"
            min={5}
            max={50}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-[10px] text-ink/50 w-6 text-right">{brushSize}px</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => updateNodeData(blockId, { content: e.target.value })}
          placeholder="描述要重绘的区域…"
          rows={3}
          className="w-full rounded-lg border border-line px-2 py-1 resize-y bg-surface"
        />
      </div>
    </ComposerWorkspaceShell>
  );
}
