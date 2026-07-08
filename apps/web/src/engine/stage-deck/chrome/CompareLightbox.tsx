import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, GitCompare, Star, X } from 'lucide-react';
import type { TakeRecord } from '@nx9/shared';
import { useTakeStore } from '../stores/take-store';
import { useRemotionUi } from '../../../stores/flow-runtime';

interface CompareLightboxProps {
  takeA: TakeRecord;
  takeB: TakeRecord;
  onClose: () => void;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export function CompareLightbox({ takeA, takeB, onClose }: CompareLightboxProps) {
  const [slider, setSlider] = useState(50);
  const requestRemotion = useRemotionUi((s) => s.requestOpen);

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-ink/90 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 text-white">
        <div className="flex items-center gap-2 text-sm">
          <GitCompare size={18} />
          Take 对比
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              requestRemotion();
              onClose();
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10"
          >
            Remotion 时间线
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 relative mx-6 mb-6 rounded-2xl overflow-hidden border border-white/20">
        <div className="absolute inset-0">
          <MediaPreview url={takeB.assetUrl} label="B" />
        </div>
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
          <MediaPreview url={takeA.assetUrl} label="A" />
        </div>
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
          style={{ left: `${slider}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={slider}
          onChange={(e) => setSlider(Number(e.target.value))}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-64 accent-brand"
        />
      </div>
    </div>,
    document.body,
  );
}

function MediaPreview({ url, label }: { url: string; label: string }) {
  return (
    <div className="w-full h-full bg-black flex items-center justify-center relative">
      <span className="absolute top-3 left-3 text-xs font-mono bg-white/20 text-white px-2 py-0.5 rounded">
        {label}
      </span>
      {isVideoUrl(url) ? (
        <video src={url} controls className="max-w-full max-h-full" />
      ) : (
        <img src={url} alt="" className="max-w-full max-h-full object-contain" />
      )}
    </div>
  );
}

interface TakeLightboxProps {
  take: TakeRecord;
  siblings: TakeRecord[];
  onClose: () => void;
  onPick: (takeId: string) => void;
  onCompare: (takeIdA: string, takeIdB: string) => void;
}

export function TakeLightbox({
  take,
  siblings,
  onClose,
  onPick,
  onCompare,
}: TakeLightboxProps) {
  const index = siblings.findIndex((t) => t.id === take.id);
  const [cursor, setCursor] = useState(Math.max(0, index));

  const current = siblings[cursor] ?? take;

  const nav = useMemo(
    () => ({
      prev: () => setCursor((c) => Math.max(0, c - 1)),
      next: () => setCursor((c) => Math.min(siblings.length - 1, c + 1)),
    }),
    [siblings.length],
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-ink/92 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 text-white">
        <span className="text-sm font-medium">
          Take {cursor + 1} / {siblings.length}
          {current.picked && (
            <Star size={14} className="inline ml-2 text-warn fill-warn" />
          )}
        </span>
        <div className="flex items-center gap-2">
          {siblings.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const other = siblings.find((t) => t.id !== current.id);
                if (other) onCompare(current.id, other.id);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10"
            >
              对比另一版
            </button>
          )}
          <button
            type="button"
            onClick={() => onPick(current.id)}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand hover:bg-brand/90"
          >
            设为主 Take
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-6 gap-4 min-h-0">
        <button
          type="button"
          disabled={cursor <= 0}
          onClick={nav.prev}
          className="p-2 rounded-full bg-white/10 disabled:opacity-30 text-white"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 h-full max-h-[70vh] rounded-2xl overflow-hidden border border-white/20 bg-black flex items-center justify-center">
          <MediaPreview url={current.assetUrl} label="" />
        </div>
        <button
          type="button"
          disabled={cursor >= siblings.length - 1}
          onClick={nav.next}
          className="p-2 rounded-full bg-white/10 disabled:opacity-30 text-white"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function TakeLightboxHost({
  onPick,
}: {
  onPick: (takeId: string, beforePick?: () => void) => void;
}) {
  const lightboxTakeId = useTakeStore((s) => s.lightboxTakeId);
  const comparePair = useTakeStore((s) => s.comparePair);
  const takes = useTakeStore((s) => s.takes);
  const closeLightbox = useTakeStore((s) => s.closeLightbox);
  const closeCompare = useTakeStore((s) => s.closeCompare);
  const openCompare = useTakeStore((s) => s.openCompare);

  const lightboxTake = lightboxTakeId ? takes.find((t) => t.id === lightboxTakeId) : undefined;
  const siblings = lightboxTake ? takes.filter((t) => t.blockId === lightboxTake.blockId) : [];

  const compareA = comparePair ? takes.find((t) => t.id === comparePair[0]) : undefined;
  const compareB = comparePair ? takes.find((t) => t.id === comparePair[1]) : undefined;

  if (compareA && compareB) {
    return <CompareLightbox takeA={compareA} takeB={compareB} onClose={closeCompare} />;
  }

  if (!lightboxTake) return null;

  return (
    <TakeLightbox
      take={lightboxTake}
      siblings={siblings}
      onClose={closeLightbox}
      onPick={(id) => onPick(id, closeLightbox)}
      onCompare={(takeIdA, takeIdB) => openCompare(takeIdA, takeIdB)}
    />
  );
}
