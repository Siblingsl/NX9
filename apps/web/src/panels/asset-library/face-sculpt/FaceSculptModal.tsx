import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Lock, RotateCcw, Unlock, X } from 'lucide-react';
import type { CharacterFaceRig, CharacterProfile } from '@nx9/shared';
import {
  FACE_RIG_GROUPS,
  FACE_RIG_PARAMS,
  FACE_RIG_PARAMS_BY_ID,
  NX9_SCULPT_MESH_CONTRACT_VERSION,
  emptyFaceRig,
  faceRigHash,
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
  type CharacterSculptViewportHandle,
  type SculptCameraPresetId,
  type SculptCompatibilityReport,
} from '@nx9/director3d';
import { api } from '../../../api/client';
import { assessCharacterFaceRigHealth } from '../../../engine/asset-library-health';
import { ParamSlider } from '../detail-primitives';

const SLICE_PARAMS = P1_VIEWPORT_PARAM_IDS.map((id) => FACE_RIG_PARAMS_BY_ID.get(id)).filter(
  (p): p is NonNullable<typeof p> => Boolean(p),
);

const CAMERA_HOTKEYS: Array<{ key: string; preset: SculptCameraPresetId; label: string }> = [
  { key: 'F', preset: 'face', label: '正面' },
  { key: 'S', preset: 'side', label: '侧面' },
  { key: 'Q', preset: 'quarter', label: '四分之三' },
  { key: 'B', preset: 'back', label: '背面' },
  { key: '·', preset: 'body', label: '全览' },
];

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
  const [symmetric, setSymmetric] = useState(true);
  const [webgl, setWebgl] = useState(true);
 const [compat, setCompat] = useState<SculptCompatibilityReport | null>(null);
  const viewportReady = Boolean(compat);
  const [compatOpen, setCompatOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const viewportRef = useRef<CharacterSculptViewportHandle>(null);
  const undoStackRef = useRef<CharacterFaceRig[]>([]);

  const faceRigHealth = useMemo(() => assessCharacterFaceRigHealth(c), [c]);

  useEffect(() => {
    if (!open) return;
    setLiveRig(getFaceRig(c));
    setNeutral(false);
    setSymmetric(true);
    setWebgl(isWebGLAvailable());
    setCompatOpen(false);
    setExportError('');
    undoStackRef.current = [];
    // 只在打开时同步；拖动中的 liveRig 由 onInput/commit 维护
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(getFaceRig(c));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }, [c]);

  const commitRig = useCallback((rig: CharacterFaceRig) => {
    setLiveRig(rig);
    onChange({ ...c, creative: { ...c.creative, ...ext, faceRig: rig } });
  }, [c, ext, onChange]);

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    commitRig(prev);
  }, [commitRig]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const hit = CAMERA_HOTKEYS.find((h) => h.key.toLowerCase() === e.key.toLowerCase());
      if (hit) {
        e.preventDefault();
        viewportRef.current?.setCameraPreset(hit.preset);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, undo]);

  const patchLive = (id: string, v: number) => setLiveRig((prev) => setFaceRigValue(prev, id, v));

  const commit = (id: string, v: number) => {
    pushUndo();
    commitRig(setFaceRigValue(getFaceRig(c), id, v));
  };

  const resetSlice = () => {
    pushUndo();
    let next = getFaceRig(c);
    for (const id of P1_VIEWPORT_PARAM_IDS) next = setFaceRigValue(next, id, 0);
    commitRig(next);
  };

  // FACE-P3：规范机位定妆截图 → 上传 → faceLockUrl + renderedAt + 契约版本。
  const captureCanonical = useCallback(async () => {
    if (!viewportRef.current) {
      setExportError('捏模视口未就绪，暂不能定妆出图');
      return;
    }
    setExporting(true);
    setExportError('');
    try {
      const dataUrl = viewportRef.current.exportCanonicalImage(liveRig);
      if (!dataUrl) throw new Error('定妆截图生成失败');
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `face-lock-${Date.now()}.png`, { type: 'image/png' });
      const uploaded = await api.uploadAsset(file);
      const now = Date.now();
      const nextRig = {
        ...liveRig,
        faceLockHash: faceRigHash(liveRig),
        renderedAt: now,
        meshContractVersion: NX9_SCULPT_MESH_CONTRACT_VERSION,
      };
      setLiveRig(nextRig);
      onChange({
        ...c,
        creative: { ...c.creative, ...ext, faceRig: nextRig, faceLockUrl: uploaded.url },
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [c, ext, liveRig, onChange]);

  const mapped = compat?.mappedParamIds.length ?? 0;
  const sliceOk = compat?.viewportSliceMapped ?? false;
  const previewRig = useMemo(() => (neutral ? emptyFaceRig() : liveRig), [neutral, liveRig]);
  const lockHash = committed.faceLockHash ?? null;
  const currentHash = faceRigHash(committed);
  const faceLockUrl = ext.faceLockUrl?.trim();
  const faceLockFresh = Boolean(faceLockUrl && lockHash === currentHash);
  const faceLockStale = Boolean(faceLockUrl && !faceLockFresh);
  const locked = Boolean(ext.consistency?.locked);

  if (!open) return null;

  return createPortal(
    <div
      className="nx9-face-sculpt-modal fixed inset-0 z-[280] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="捏模台"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">捏模台 · {c.name || '未命名角色'}</h2>
          <p className="text-[10px] text-ink/45">
            P1 切片 6 项驱动网格；其余参数仍进 Prompt。拖滑块或橙色控制点，松手才写入档案。
          </p>
        </div>
        <span
          className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] text-warn"
          title="当前视口为工程代理网格，非成品基模；正式 GLB 就绪后自动替换，参数不换"
        >
          工程代理 · 非成品基模
        </span>
        {compat ? (
          <button
            type="button"
            className={`rounded-full px-2 py-0.5 text-[10px] ${sliceOk ? 'bg-brand/10 text-brand' : 'bg-warn/10 text-warn'}`}
            title={compat.warnings.join('\n')}
            onClick={() => setCompatOpen((v) => !v)}
          >
            视口切片 {P1_VIEWPORT_PARAM_IDS.filter((id) => compat.mappedParamIds.includes(id)).length}/6
            {mapped > 6 ? ` · 已映射 ${mapped}` : ''}
          </button>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            faceLockFresh ? 'bg-brand/10 text-brand' : faceLockStale ? 'bg-warn/10 text-warn' : 'bg-surface text-ink/45'
          }`}
          title={faceLockFresh ? '定妆图与当前参数一致' : faceLockStale ? '参数已改，需重新定妆' : '尚未生成定妆图'}
        >
          {faceLockFresh ? '定妆已锁' : faceLockStale ? '定妆过期' : '未定妆'}
        </span>
        <button
          type="button"
          className="rounded-lg p-1.5 text-ink/50 hover:bg-surface hover:text-ink"
          onClick={onClose}
          title="关闭 (Esc)"
        >
          <X size={16} />
        </button>
      </header>

      {compatOpen && compat ? (
        <div className="shrink-0 border-b border-line bg-surface px-4 py-2.5">
          <p className="text-[10px] font-medium text-ink/60">网格契约检查（{compat.source}）</p>
          {compat.warnings.length > 0 ? (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] text-warn">
              {compat.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[10px] text-ok">无警告</p>
          )}
          <p className="mt-1.5 text-[10px] text-ink/50">
            未接入网格（仅 Prompt）{compat.missingParamIds.length} 项：
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {compat.missingParamIds.slice(0, 24).map((id) => (
              <span key={id} className="rounded bg-surface px-1.5 py-0.5 text-[9px] text-ink/45">
                {id}
              </span>
            ))}
            {compat.missingParamIds.length > 24 ? (
              <span className="text-[9px] text-ink/40">+{compat.missingParamIds.length - 24}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[#dfe6ee]">
          {webgl ? (
            <CharacterSculptViewport
              ref={viewportRef}
              className="absolute inset-0"
              faceRig={previewRig}
              previewNeutral={neutral}
              symmetric={symmetric}
              onCompatibility={setCompat}
              onError={() => setWebgl(false)}
              onFaceRigCommit={(rig) => {
                pushUndo();
                commitRig(rig);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink/55">
              当前环境没有 WebGL，已降级为滑块。参数仍会写入档案并编译进 Prompt。
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-col gap-1">
            {CAMERA_HOTKEYS.map((h) => (
              <button
                key={h.preset}
                type="button"
                className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-ink/65 shadow-sm hover:border-brand/40 hover:text-brand"
                title={`${h.label}机位 (${h.key})`}
                onClick={() => viewportRef.current?.setCameraPreset(h.preset)}
              >
                {h.key} {h.label}
              </button>
            ))}
          </div>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-ink/70 shadow-sm hover:border-brand/40 hover:text-brand"
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
            {locked ? (
              <p className="rounded-lg border border-warn/40 bg-warn/10 px-2 py-1.5 text-[10px] leading-relaxed text-warn">
                角色已锁定：本次修改不会写入旧锁定快照，请先在上方「新建版本」后再编辑。
              </p>
            ) : null}
            <div className="flex items-start gap-2.5 rounded-xl border border-line/70 bg-surface/35 p-2.5">
              {faceLockUrl ? (
                <img
                  src={faceLockUrl}
                  alt="角色定妆"
                  className="h-14 w-10 shrink-0 rounded-md border border-line object-cover"
                />
              ) : (
                <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-line text-[9px] text-ink/35">
                  未定妆
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-ink/70">定妆头像（身份锁）</p>
                <p className="mt-0.5 text-[9px] leading-relaxed text-ink/45">
                  规范机位固定像素截图；参数改动后需重新导出，否则健康条提示过期。
                </p>
                {faceRigHealth.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {faceRigHealth.map((h) => (
                      <li key={h.key} className="rounded border border-warn/30 bg-warn/10 px-1.5 py-1 text-[9px] text-warn">
                        {h.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[9px] text-ok">定妆健康：指纹与契约一致</p>
                )}
              </div>
            </div>

            <label className="flex items-center gap-1.5 text-[10px] text-ink/60">
              <input
                type="checkbox"
                checked={symmetric}
                onChange={(e) => setSymmetric(e.target.checked)}
              />
              {symmetric ? <Lock size={12} /> : <Unlock size={12} />}
              对称联动（解锁后可单侧拖控制点）
            </label>

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
              disabled={undoStackRef.current.length === 0}
              onClick={undo}
              title="撤销上一次提交 (Ctrl+Z)"
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink/70 hover:border-brand/40 hover:text-brand disabled:opacity-40"
            >
              <RotateCcw size={12} />
              撤销
            </button>
            <button
              type="button"
              className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink/70 hover:border-brand/40 hover:text-brand"
              onClick={resetSlice}
            >
              重置切片
            </button>
            <button
              type="button"
              disabled={exporting || !webgl || !viewportReady}
              title={viewportReady ? '规范机位固定像素定妆截图' : '3D 视口初始化中，请稍候'}
              onClick={() => void captureCanonical()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-[11px] text-brand hover:border-brand/50 disabled:opacity-40"
            >
              <Camera size={12} />
              {exporting ? '导出中…' : '定妆出图'}
            </button>
            <button
              type="button"
              className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] text-ink hover:border-brand/40"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
          {exportError ? (
            <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-warn">{exportError}</p>
          ) : null}
        </aside>
      </div>
    </div>,
    document.body,
  );
}
