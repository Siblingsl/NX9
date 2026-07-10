import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Eraser, Download } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';

function SketchPadBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState('#222222');
  const [brush, setBrush] = useState(4);
  const previewUrl = props.data?.previewUrl as string | undefined;
  const linkedShotId = props.data?.linkedShotId as string | undefined;

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext('2d');
  };

  const startDraw = (e: React.PointerEvent) => {
    const ctx = getCtx();
    if (!ctx) return;
    drawing.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.strokeStyle = color;
    ctx.lineWidth = brush;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
  };

  const clear = useCallback(() => {
    const c = canvasRef.current;
    const ctx = getCtx();
    if (!c || !ctx) return;
    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, c.width, c.height);
    updateNodeData(props.id, { previewUrl: undefined });
  }, [props.id, updateNodeData]);

  const exportPng = useCallback(async () => {
    const c = canvasRef.current;
    if (!c) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('导出失败');
      const file = new File([blob], `sketch-${Date.now()}.png`, { type: 'image/png' });
      const res = await api.uploadAsset(file);
      updateNodeData(props.id, {
        previewUrl: res.url,
        assetUrl: res.url,
        mediaKind: 'picture',
        status: 'success',
      });
      if (linkedShotId) {
        updateShot(linkedShotId, { firstFrameAssetId: res.url, sketchSource: 'hand-draw', status: 'review' });
        appendLog('画板已导出并回写故事板');
      } else {
        appendLog('画板已导出为素材');
      }
    } catch (e) {
      appendLog(`画板导出失败: ${String(e)}`);
    }
  }, [props.id, updateNodeData, appendLog, linkedShotId, updateShot]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border border-line cursor-pointer"
            title="画笔颜色"
          />
          <input
            type="range"
            min={1}
            max={24}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
          <button type="button" onClick={clear} className="p-1.5 rounded-lg border border-line" title="清空">
            <Eraser size={14} />
          </button>
          <button
            type="button"
            onClick={() => void exportPng()}
            className="p-1.5 rounded-lg border border-line text-brand"
            title="导出 PNG"
          >
            <Download size={14} />
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={280}
          height={180}
          className="w-full rounded-xl border border-line bg-[#FAFAF8] touch-none cursor-crosshair"
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
        {previewUrl && (
          <img src={previewUrl} alt="" className="w-full rounded-lg border border-brand/30 max-h-20 object-cover" />
        )}
      </div>
    </BlockShell>
  );
}

export default memo(SketchPadBlock);
