import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CharacterProfile } from '@nx9/shared';
import {
  FACE_RIG_GROUPS,
  FACE_RIG_PARAMS,
  FACE_RIG_PARAMS_BY_ID,
  emptyFaceRig,
  faceRigParamsOfGroup,
  faceRigValue,
  getCharacterCreative,
  getFaceRig,
  setFaceRigValue,
} from '@nx9/shared';
import {
  CharacterSculptViewport,
  P1_VIEWPORT_PARAM_IDS,
  isP1ViewportParam,
  isWebGLAvailable,
  type SculptCompatibilityReport,
} from '@nx9/director3d';
import { ParamSlider } from '../detail-primitives';

const SLICE_PARAMS = P1_VIEWPORT_PARAM_IDS.map((id) => FACE_RIG_PARAMS_BY_ID.get(id)).filter(
  (p): p is NonNullable<typeof p> => Boolean(p),
);

export function FaceSculptModal({
  open,
  character: c,
  onChange,
  onClose,
}: {
  open: boolean;
  character: CharacterProfile;
  onChange: (next: CharacterProfile) => void;
  onClose: () => void;
}) {
  const ext = getCharacterCreative(c);
  const committed = getFaceRig(c);
  const [liveRig, setLiveRig] = useState(committed);
  const [neutral, setNeutral] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [compat, setCompat] = useState<SculptCompatibilityReport | null>(null);

  useEffect(() => {
    if (!open) return;
    setLiveRig(getFaceRig(c));
    setNeutral(false);
    setWebgl(isWebGLAvailable());
    // 只在打开时同步；拖动中的 liveRig 由 onInput/commit 维护
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const patchLive = (id: string, v: number) => setLiveRig((prev) => setFaceRigValue(prev, id, v));

  const commit = (id: string, v: number) => {
    const next = setFaceRigValue(getFaceRig(c), id, v);
    setLiveRig(next);
    onChange({ ...c, creative: { ...c.creative, ...ext, faceRig: next } });
  };

  const resetSlice = () => {
    let next = getFaceRig(c);
    for (const id of P1_VIEWPORT_PARAM_IDS) next = setFaceRigValue(next, id, 0);
    setLiveRig(next);
    onChange({ ...c, creative: { ...c.creative, ...ext, faceRig: next } });
  };

  const mapped = compat?.mappedParamIds.length ?? 0;
  const sliceOk = compat?.viewportSliceMapped ?? false;
  const previewRig = useMemo(() => (neutral ? emptyFaceRig() : liveRig), [neutral, liveRig]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="捏模台"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">捏模台 · {c.name || '未命名角色'}</h2>
          <p className="text-[10px] text-ink/45">
            P1 切片 6 项驱动网格；其余参数仍进 Prompt。拖滑块网格当场变形，松手才写入档案。
          </p>
        </div>
        {compat ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              sliceOk ? 'bg-brand/10 text-brand' : 'bg-warn/10 text-warn'
            }`}
            title={compat.warnings.join('\n')}
          >
            视口切片 {P1_VIEWPORT_PARAM_IDS.filter((id) => compat.mappedParamIds.includes(id)).length}/6
            {mapped > 6 ? ` · 已映射 ${mapped}` : ''}
          </span>
        ) : null}
        <button
          type="button"
          className="rounded-lg p-1.5 text-ink/50 hover:bg-surface hover:text-ink"
          onClick={onClose}
          title="关闭 (Esc)"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[#dfe6ee]">
          {webgl ? (
            <CharacterSculptViewport
              className="absolute inset-0"
              faceRig={previewRig}
              previewNeutral={neutral}
              onCompatibility={setCompat}
              onError={() => setWebgl(false)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink/55">
              当前环境没有 WebGL，已降级为滑块。参数仍会写入档案并编译进 Prompt。
            </div>
          )}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-black/10 bg-white/90 px-3 py-1 text-[11px] text-ink/70 shadow-sm hover:border-brand/40 hover:text-brand"
              onPointerDown={() => setNeutral(true)}
              onPointerUp={() => setNeutral(false)}
              onPointerCancel={() => setNeutral(false)}
              onPointerLeave={() => setNeutral(false)}
            >
              按住 · 中性对照
            </button>
          </div>
        </div>

        <aside className="flex w-[min(320px,38vw)] shrink-0 flex-col border-l border-line bg-surface">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink/40">视口切片</p>
            {SLICE_PARAMS.map((p) => (
              <ParamSlider
                key={p.id}
                label={p.labelZh}
                value={faceRigValue(liveRig, p.id)}
                low={p.low}
                high={p.high}
                onInput={(v) => patchLive(p.id, v)}
                onCommit={(v) => commit(p.id, v)}
              />
            ))}

            <button
              type="button"
              className="text-[10px] text-ink/50 hover:text-brand"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '收起全部参数' : `展开全部 ${FACE_RIG_PARAMS.length} 项`}
            </button>

            {expanded
              ? FACE_RIG_GROUPS.map((group) => {
                  const params = faceRigParamsOfGroup(group.id);
                  return (
                    <div key={group.id} className="space-y-2 rounded-xl border border-line/70 bg-surface/35 p-2.5">
                      <span className="text-[10px] font-medium text-ink/55">{group.labelZh}</span>
                      {params.map((p) => {
                        const slice = isP1ViewportParam(p.id);
                        return (
                          <ParamSlider
                            key={p.id}
                            label={p.labelZh}
                            hint={slice ? undefined : '仅 Prompt'}
                            value={faceRigValue(liveRig, p.id)}
                            low={p.low}
                            high={p.high}
                            onInput={(v) => patchLive(p.id, v)}
                            onCommit={(v) => commit(p.id, v)}
                          />
                        );
                      })}
                    </div>
                  );
                })
              : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-ink/70 hover:border-brand/40 hover:text-brand"
              onClick={resetSlice}
            >
              重置切片
            </button>
            <button
              type="button"
              className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] text-ink hover:border-brand/40"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
