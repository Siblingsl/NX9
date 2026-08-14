import { useCallback, useEffect, useMemo } from 'react';
import { type NodeProps, type Node as FlowNode } from '@xyflow/react';
import {
  type CharacterProfile,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewFrame,
  type StoryboardPreviewPayload,
  buildLineArtPanelGridPrompt,
  costumeSourcesFromWorkspace,
  buildLineArtShotPrompt,
  buildLineArtShotPatch,
  emptyStoryboardPreview,
  enrichPromptWithShotAssets,
  flattenScriptBreakdownShots,
  LINE_ART_GRID_PAGE_SIZE,
  patchChainShot,
  pickLineArtGridLayout,
  propSourcesFromWorkspace,
  readChainStoryboard,
  resolveConnectedPictureGenId,
  shotLexiconSourcesFromWorkspace,
  resolveStoryboardPreviewPictureSettings,
  writeBackBreakdownPreviewImage,
} from '@nx9/shared';
import { isShotComposed, stripEpisodeConfirmation } from '../../../engine/storyboard-desk-runner';
import { generateStoryboardFrameImage, resolvePictureGenSettings } from '../../../engine/storyboard-preview-runner';
import { runPictureGenJob } from '../../../engine/picture-gen-runner';
import { applyScriptBreakdownPayload } from '../../../engine/script-breakdown-runner';
import { api } from '../../../api/client';
import { toastSuccess, useToast } from '../../../stores/toast';
import { patchShotInPayload, type StudioTab } from './helpers';

type StoryboardLineArtDeps = {
  props: NodeProps;
  updateNodeData: (id: string, dataUpdate: Partial<Record<string, unknown>> | ((node: FlowNode) => Partial<Record<string, unknown>>), options?: { replace: boolean }) => void;
  getNodes: () => Array<{ id: string; type?: string; data?: unknown }>;
  getEdges: () => Array<{ source: string; target: string }>;
  appendLog: (line: string) => void;
  payload: ScriptBreakdownPayload | undefined;
  shots: ScriptBreakdownShot[];
  visibleShots: ScriptBreakdownShot[];
  currentEpisodeId: string | null;
  characters: CharacterProfile[];
  costumeOptions: ReturnType<typeof costumeSourcesFromWorkspace>;
  propOptions: ReturnType<typeof propSourcesFromWorkspace>;
  shotLexiconOptions: ReturnType<typeof shotLexiconSourcesFromWorkspace>;
  batchRunning: boolean;
  batchScopeMode: 'missing' | 'all';
  setBatchScopeMode: (mode: 'missing' | 'all') => void;
  setBatchMode: (mode: 'line-art' | 'grid-line-art' | null) => void;
  setBatchProgress: (progress: string | null) => void;
  generatingShotId: string | null;
  setGeneratingShotId: (id: string | null) => void;
  lineArtAbortRef: React.MutableRefObject<AbortController | null>;
  singleLineArtAbortRef: React.MutableRefObject<AbortController | null>;
  lastBatchFailures: string[];
  setLastBatchFailures: (failures: string[]) => void;
  setShotFrameUrl: (shotId: string, imageUrl: string) => void;
  studioOpen: boolean;
  studioTab: StudioTab;
  filteredShots: ScriptBreakdownShot[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  deskBusy: boolean;
  openEdit: (shotId: string) => void;
  handleDeleteShot: (shotId: string) => Promise<void>;
};

export function useStoryboardLineArtOps(deps: StoryboardLineArtDeps) {
  const {
    props,
    updateNodeData,
    getNodes,
    getEdges,
    appendLog,
    payload,
    shots,
    visibleShots,
    currentEpisodeId,
    characters,
    costumeOptions,
    propOptions,
    shotLexiconOptions,
    batchRunning,
    batchScopeMode,
    setBatchScopeMode,
    setBatchMode,
    setBatchProgress,
    generatingShotId,
    setGeneratingShotId,
    lineArtAbortRef,
    singleLineArtAbortRef,
    lastBatchFailures,
    setLastBatchFailures,
    setShotFrameUrl,
    studioOpen,
    studioTab,
    filteredShots,
    selectedId,
    setSelectedId,
    deskBusy,
    openEdit,
    handleDeleteShot,
  } = deps;
  const referenceBoardData = useMemo(() => {
    // Find connected reference-board nodes
    const boardNodes = getNodes().filter((n) => n.type === 'reference-board');
    const incoming = getEdges().filter((e) => e.target === props.id);
    const relevant: Array<{ styleNotes?: string; palette?: string[] }> = [];
    for (const edge of incoming) {
      const src = boardNodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const d = src.data as Record<string, unknown> | undefined;
      relevant.push({
        styleNotes: d?.styleNotes as string | undefined,
        palette: d?.palette as string[] | undefined,
      });
    }
    return relevant;
  }, [getNodes, getEdges, props.id]);

  const resolveSketchPrompt = useCallback((shot: ScriptBreakdownShot) => {
    const raw = shot.sketchPrompt?.trim();
    if (raw) return raw;
    const refParts: string[] = [];
    for (const rb of referenceBoardData) {
      if (rb.styleNotes?.trim()) refParts.push(`style: ${rb.styleNotes.trim()}`);
      if (rb.palette?.length) refParts.push(`palette: ${rb.palette.join(', ')}`);
    }
    return buildLineArtShotPrompt(
      [
        shot.scriptText || shot.visual || shot.title,
        shot.scene ? `location: ${shot.scene}` : '',
        shot.shotSize ? `${shot.shotSize} shot` : '',
        shot.cameraMove ? `camera: ${shot.cameraMove}` : '',
        shot.cameraAngle ? `angle: ${shot.cameraAngle}` : '',
        (shot.characters?.length ? `characters: ${shot.characters.join(', ')}` : ''),
        ...refParts,
      ].filter(Boolean).join('\n'),
      shot.shotSize,
    );
  }, [referenceBoardData]);

  const generateShotLineArt = useCallback(
    async (shot: ScriptBreakdownShot) => {
      if (batchRunning) {
        appendLog('分镜台：批量任务进行中，请稍候再单镜生成线稿');
        return;
      }
      if (generatingShotId !== null) {
        useToast.getState().push({ message: '已有单镜线稿生成中，请稍候', variant: 'info' });
        return;
      }
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：请先用顶部能力口连接「图像生成」节点后再生成线稿');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      setGeneratingShotId(shot.id);
      const baseSketch = resolveSketchPrompt(shot);
      const sketchPrompt = enrichPromptWithShotAssets(
        baseSketch,
        shot,
        characters,
        costumeOptions,
        propOptions,
        shotLexiconOptions,
      );
      const frame: StoryboardPreviewFrame = {
        id: `frame-line-${shot.id}`,
        order: 1,
        label: `${shot.sceneCode || `Shot${shot.index}`} · 线稿`,
        startSec: 0,
        endSec: Math.max(1, shot.durationSec || 5),
        sourceShotId: shot.id,
        promptSummary: sketchPrompt,
        characterNames: shot.characters,
        sceneAssetRef: shot.scene,
        referenceImageUrl: null,
        status: 'generating',
        locked: false,
        stylePreset: 'line-art',
      };
      // SB-OL-12: 单镜线稿也挂控制器，关台取消能中止在途请求并跳过写回
      const singleAbort = new AbortController();
      singleLineArtAbortRef.current = singleAbort;
      try {
        const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
        const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
        const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
        const imageUrl = await generateStoryboardFrameImage(
          frame,
          (pictureNode.data ?? {}) as Record<string, unknown>,
          pictureSettings,
          false,
          singleAbort.signal,
        );
        if (singleAbort.signal.aborted) {
          appendLog(`分镜线稿已取消 · ${shot.sceneCode || shot.id}`);
          return;
        }
        if (!payload) {
          setShotFrameUrl(shot.id, imageUrl);
        } else {
          const withSketch = patchShotInPayload(payload, shot.id, {
            sketchPrompt,
            previewImageUrl: imageUrl,
            referenceImageUrl: imageUrl,
            status: 'previewing',
          });
          const nextBreakdown = writeBackBreakdownPreviewImage(withSketch, shot.id, imageUrl) ?? withSketch;
          applyScriptBreakdownPayload(props.id, nextBreakdown);
          updateNodeData(props.id, (node) => {
            const data = (node.data ?? {}) as Record<string, unknown>;
            const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
            const current = raw?.version === 1 && Array.isArray(raw.frames)
              ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
              : emptyStoryboardPreview();
            let frames = [...current.frames];
            const idx = frames.findIndex((f) => f.sourceShotId === shot.id || f.id === `frame-line-${shot.id}` || f.id === shot.id);
            const framePatch = {
              imageUrl,
              status: 'success' as const,
              errorMessage: null,
              promptSummary: sketchPrompt,
              stylePreset: 'line-art',
            };
            if (idx >= 0) {
              frames = frames.map((f, i) => (i === idx ? { ...f, ...framePatch } : f));
            } else {
              frames = [
                ...frames,
                {
                  id: `frame-line-${shot.id}`,
                  order: frames.length + 1,
                  label: `${shot.sceneCode || `Shot${shot.index}`} · 线稿`,
                  startSec: 0,
                  endSec: Math.max(1, shot.durationSec || 5),
                  sourceShotId: shot.id,
                  promptSummary: sketchPrompt,
                  characterNames: shot.characters,
                  sceneAssetRef: shot.scene,
                  referenceImageUrl: null,
                  imageUrl,
                  status: 'success' as const,
                  locked: false,
                  stylePreset: 'line-art',
                },
              ];
            }
            return {
                ...data,
                scriptBreakdown: nextBreakdown,
                storyboardPreview: { ...current, frames, confirmed: false },
                ...stripEpisodeConfirmation(data, currentEpisodeId),
                previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
              };
          });
        }
        appendLog(`分镜线稿已生成 · ${shot.sceneCode || shot.id}`);
        toastSuccess(`已生成 ${shot.sceneCode || '分镜'} 线稿`);
      } catch (e) {
        if (singleAbort.signal.aborted) {
          appendLog(`分镜线稿已取消 · ${shot.sceneCode || shot.id}`);
        } else {
          appendLog(`[SB_LINEART_FAIL] 分镜线稿生成失败: ${String(e)}`);
        }
      } finally {
        if (singleLineArtAbortRef.current === singleAbort) singleLineArtAbortRef.current = null;
        setGeneratingShotId(null);
      }
    },
    // SB-OL-05: currentEpisodeId 必须入 deps，否则切集后旧闭包会摘掉上一集的确认
    [appendLog, batchRunning, characters, costumeOptions, currentEpisodeId, generatingShotId, getEdges, getNodes, payload, propOptions, props.id, resolveSketchPrompt, setShotFrameUrl, shotLexiconOptions, updateNodeData],
  );

  /** X-12: 键盘快捷键 · ↑↓ 选镜，E 编辑，L 线稿，Del 删镜 */
  useEffect(() => {
    if (!studioOpen || studioTab !== 'grid') return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!filteredShots.length) return;
      if (!e.key) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filteredShots.findIndex((s) => s.id === selectedId);
        const nextIdx = e.key === 'ArrowDown'
          ? (idx + 1) % filteredShots.length
          : idx <= 0 ? filteredShots.length - 1 : idx - 1;
        const nextShot = filteredShots[nextIdx];
        if (nextShot) {
          setSelectedId(nextShot.id);
          setTimeout(() => {
            document.querySelector(`[data-shot-id="${nextShot.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        }
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (selectedId) openEdit(selectedId);
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (selectedId) {
          const shot = filteredShots.find((s) => s.id === selectedId);
          if (shot) void generateShotLineArt(shot);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !deskBusy && selectedId) {
        e.preventDefault();
        void handleDeleteShot(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [studioOpen, studioTab, filteredShots, selectedId, deskBusy, openEdit, generateShotLineArt, handleDeleteShot]);

  const generateBatchLineArt = useCallback(
    async (scope: 'visible' | 'all' = 'visible') => {
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：批量线稿前请先连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      lineArtAbortRef.current?.abort();
      const controller = new AbortController();
      lineArtAbortRef.current = controller;
      const { signal } = controller;

      let targetShots = (scope === 'visible' ? visibleShots : shots).filter(Boolean);
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有可生成线稿的镜头');
        lineArtAbortRef.current = null;
        return;
      }

      const onlyMissing = batchScopeMode === 'missing';
      if (onlyMissing) {
        const preview = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.storyboardPreview as StoryboardPreviewPayload | undefined;
        targetShots = targetShots.filter((s) => !isShotComposed(s, preview));
      }
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有需要补线稿的镜头');
        lineArtAbortRef.current = null;
        setBatchMode(null);
        return;
      }

      const modeLabel = onlyMissing ? '缺图优先' : '全部覆盖';
      setBatchMode('line-art');
      setBatchProgress(`0/${targetShots.length}`);
      appendLog(`开始批量线稿 · ${targetShots.length} 镜（${scope === 'visible' ? '当前可见' : '全部'} · ${modeLabel}）`);

      let ok = 0;
      let fail = 0;
      const failures: string[] = [];
      for (let i = 0; i < targetShots.length; i++) {
        if (signal.aborted) break;
        const shot = targetShots[i];
        setBatchProgress(`${i + 1}/${targetShots.length}`);
        setGeneratingShotId(shot.id);
        try {
          const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
          const liveShot = flattenScriptBreakdownShots(livePayload).find((s) => s.id === shot.id) ?? shot;
          const sketchPrompt = enrichPromptWithShotAssets(
            resolveSketchPrompt(liveShot),
            liveShot,
            characters,
            costumeOptions,
            propOptions,
            shotLexiconOptions,
          );
          const frame: StoryboardPreviewFrame = {
            id: `frame-line-${liveShot.id}`,
            order: i + 1,
            label: `${liveShot.sceneCode || `Shot${liveShot.index}`} · 线稿`,
            startSec: 0,
            endSec: Math.max(1, liveShot.durationSec || 5),
            sourceShotId: liveShot.id,
            promptSummary: sketchPrompt,
            characterNames: liveShot.characters,
            sceneAssetRef: liveShot.scene,
            referenceImageUrl: null,
            status: 'generating',
            locked: false,
            stylePreset: 'line-art',
          };
          const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
          const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
          const imageUrl = await generateStoryboardFrameImage(
            frame,
            (pictureNode.data ?? {}) as Record<string, unknown>,
            pictureSettings,
            true,
            signal,
          );

          const base = livePayload ?? payload;
          if (!base) {
            setShotFrameUrl(liveShot.id, imageUrl);
          } else {
            const withSketch = patchShotInPayload(base, liveShot.id, {
              sketchPrompt,
              previewImageUrl: imageUrl,
              referenceImageUrl: imageUrl,
              status: 'previewing',
            });
            const nextBreakdown = writeBackBreakdownPreviewImage(withSketch, liveShot.id, imageUrl) ?? withSketch;
            applyScriptBreakdownPayload(props.id, nextBreakdown);
            updateNodeData(props.id, (node) => {
              const data = (node.data ?? {}) as Record<string, unknown>;
              const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
              const current = raw?.version === 1 && Array.isArray(raw.frames)
                ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
                : emptyStoryboardPreview();
              let frames = [...current.frames];
              const idx = frames.findIndex((f) => f.sourceShotId === liveShot.id || f.id === `frame-line-${liveShot.id}` || f.id === liveShot.id);
              const framePatch = {
                imageUrl,
                status: 'success' as const,
                errorMessage: null,
                promptSummary: sketchPrompt,
                stylePreset: 'line-art',
              };
              if (idx >= 0) {
                frames = frames.map((f, fi) => (fi === idx ? { ...f, ...framePatch } : f));
              } else {
                frames = [
                  ...frames,
                  {
                    id: `frame-line-${liveShot.id}`,
                    order: frames.length + 1,
                    label: `${liveShot.sceneCode || `Shot${liveShot.index}`} · 线稿`,
                    startSec: 0,
                    endSec: Math.max(1, liveShot.durationSec || 5),
                    sourceShotId: liveShot.id,
                    promptSummary: sketchPrompt,
                    characterNames: liveShot.characters,
                    sceneAssetRef: liveShot.scene,
                    referenceImageUrl: null,
                    imageUrl,
                    status: 'success' as const,
                    locked: false,
                    stylePreset: 'line-art',
                  },
                ];
              }
              return {
                  ...data,
                  scriptBreakdown: nextBreakdown,
                  storyboardPreview: { ...current, frames, confirmed: false },
                  ...stripEpisodeConfirmation(data, currentEpisodeId),
                  previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
                };
            });
          }
          ok += 1;
        } catch (e) {
          fail += 1;
          failures.push(shot.id);
          appendLog(`[SB_LINEART_FAIL] 批量线稿失败 · ${shot.sceneCode || shot.id}: ${String(e)}`);
        }
      }

      setGeneratingShotId(null);
      setBatchMode(null);
      setBatchProgress(null);
      lineArtAbortRef.current = null;
      setLastBatchFailures(failures);
      const aborted = signal.aborted;
      appendLog(`批量线稿${aborted ? '已停止' : '完成'} · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`批量线稿完成 ${ok}/${targetShots.length}`);
    },
    [
      appendLog,
      batchScopeMode,
      characters,
      costumeOptions,
      // SB-OL-05: currentEpisodeId 必须入 deps，否则切集后旧闭包会摘掉上一集的确认
      currentEpisodeId,
      getEdges,
      getNodes,
      payload,
      propOptions,
      props.id,
      resolveSketchPrompt,
      setShotFrameUrl,
      shotLexiconOptions,
      shots,
      updateNodeData,
      visibleShots,
    ],
  );

  const retryFailedLineArt = useCallback(async () => {
    if (lastBatchFailures.length === 0) return;
    const prevMode = batchScopeMode;
    setBatchScopeMode('all');
    await generateBatchLineArt('visible');
    setBatchScopeMode(prevMode);
    setLastBatchFailures([]);
  }, [lastBatchFailures, batchScopeMode, generateBatchLineArt]);

  /** 宫格线稿：多镜提示词合成一张图 → grid-split → 按顺序回填（省出图次数） */
  const generateBatchGridLineArt = useCallback(
    async (scope: 'visible' | 'all' = 'visible') => {
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：宫格线稿前请先连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      lineArtAbortRef.current?.abort();
      const controller = new AbortController();
      lineArtAbortRef.current = controller;
      const { signal } = controller;

      let targetShots = (scope === 'visible' ? visibleShots : shots).filter(Boolean);
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有可生成线稿的镜头');
        lineArtAbortRef.current = null;
        return;
      }

      // SB-OL-10: 与逐镜批量同口径，尊重「缺图优先 / 全部覆盖」范围开关
      const onlyMissing = batchScopeMode === 'missing';
      if (onlyMissing) {
        const preview = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.storyboardPreview as StoryboardPreviewPayload | undefined;
        targetShots = targetShots.filter((s) => !isShotComposed(s, preview));
      }
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有需要补线稿的镜头');
        lineArtAbortRef.current = null;
        return;
      }

      // 固定四宫格（2×2）：每页最多 4 镜；不足 4 镜时空格白板，布局不变形
      const pageSize = LINE_ART_GRID_PAGE_SIZE;
      const { rows, cols } = pickLineArtGridLayout(pageSize);
      const pageCount = Math.ceil(targetShots.length / pageSize);
      setBatchMode('grid-line-art');
      setBatchProgress(`0/${pageCount}`);
      appendLog(
        `开始宫格线稿 · ${targetShots.length} 镜 · ${pageCount} 张四宫格（${scope === 'visible' ? '当前可见' : '全部'} · ${onlyMissing ? '缺图优先' : '全部覆盖'}）`,
      );

      let ok = 0;
      let fail = 0;
      const pictureData = (pictureNode.data ?? {}) as Record<string, unknown>;

      for (let page = 0; page < pageCount; page++) {
        if (signal.aborted) break;
        const chunk = targetShots.slice(page * pageSize, page * pageSize + pageSize);
        setBatchProgress(`${page + 1}/${pageCount}`);
        setGeneratingShotId(chunk[0]?.id ?? null);

        try {
          const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)
            ?.scriptBreakdown as ScriptBreakdownPayload | undefined;
          const liveMap = new Map(flattenScriptBreakdownShots(livePayload).map((s) => [s.id, s]));

          const panels = chunk.map((shot) => {
            const liveShot = liveMap.get(shot.id) ?? shot;
            const sketchPrompt = enrichPromptWithShotAssets(
              resolveSketchPrompt(liveShot),
              liveShot,
              characters,
              costumeOptions,
              propOptions,
              shotLexiconOptions,
            );
            return {
              shot: liveShot,
              sketchPrompt,
              label: liveShot.sceneCode || `Shot${liveShot.index}`,
              prompt: sketchPrompt,
            };
          });

          // 始终按 2×2 构图；chunk < 4 时 prompt 空格白板，切分仍按四格
          const gridPrompt = buildLineArtPanelGridPrompt(
            panels.map((p) => ({ label: p.label, prompt: p.prompt })),
            rows,
            cols,
          );
          const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
          const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
          // 宫格出横屏：跟随工具条画幅；若为方图/竖图则回落 16:9，2×2 等分后每格仍为横屏
          const settingsResolved = resolvePictureGenSettings(pictureData, pictureSettings);
          const [bw, bh] = settingsResolved.size.split('x').map((n) => Number(n) || 0);
          const { modelId, size } = bw > bh
            ? settingsResolved
            : resolvePictureGenSettings(pictureData, { ...pictureSettings, aspectRatio: '16:9' });

          const blankSlots = pageSize - chunk.length;
          appendLog(
            `宫格出图中 · 第 ${page + 1}/${pageCount} 张 · 2×2 · ${size} · ${chunk.length} 镜`
              + (blankSlots > 0 ? ` · 白板补 ${blankSlots} 格` : ''),
          );
          // SB-OL-10: 透传 signal，「停止」能中止在途宫格出图而非只拦下一页
          const urls = await runPictureGenJob({
            prompt: gridPrompt,
            modelId,
            size,
            n: 1,
            signal,
          });
          const gridUrl = urls[0];
          if (!gridUrl) throw new Error('宫格线稿未返回图片');

           const split = await api.gridSplit({ sourceUrl: gridUrl, rows, cols }, { signal });
          if (!split.urls?.length) throw new Error('宫格切分未返回图片');

          // 每页开始前重读节点，并用已有预览帧图补齐缺 previewImageUrl 的镜
          // （避免上一页写回尚未进入闭包 / 被旧 payload 覆盖）
          const freshNode = (getNodes().find((n) => n.id === props.id)?.data
            ?? {}) as Record<string, unknown>;
          const freshBreakdown = (freshNode.scriptBreakdown as ScriptBreakdownPayload | undefined)
            ?? livePayload
            ?? payload;
          const existingFrames = (freshNode.storyboardPreview as StoryboardPreviewPayload | undefined)?.frames ?? [];
          let nextBreakdown = freshBreakdown;
          if (nextBreakdown) {
            for (const frame of existingFrames) {
              if (!frame.sourceShotId || !frame.imageUrl) continue;
              const existing = flattenScriptBreakdownShots(nextBreakdown).find((s) => s.id === frame.sourceShotId);
              if (existing?.previewImageUrl) continue;
              nextBreakdown = writeBackBreakdownPreviewImage(nextBreakdown, frame.sourceShotId, frame.imageUrl)
                ?? patchShotInPayload(nextBreakdown, frame.sourceShotId, {
                  previewImageUrl: frame.imageUrl,
                  referenceImageUrl: frame.imageUrl,
                  status: 'previewing',
                });
            }
          }
          const framePatches: Array<{
            shot: ScriptBreakdownShot;
            sketchPrompt: string;
            imageUrl: string;
          }> = [];

          for (let i = 0; i < panels.length; i++) {
            const imageUrl = split.urls[i];
            if (!imageUrl) {
              fail += 1;
              appendLog(`宫格线稿缺格 · ${panels[i].label}`);
              continue;
            }
            const { shot: liveShot, sketchPrompt } = panels[i];
            framePatches.push({ shot: liveShot, sketchPrompt, imageUrl });
            if (!nextBreakdown) {
              setShotFrameUrl(liveShot.id, imageUrl);
              ok += 1;
              continue;
            }
            const withSketch = patchShotInPayload(nextBreakdown, liveShot.id, {
              sketchPrompt,
              previewImageUrl: imageUrl,
              referenceImageUrl: imageUrl,
              status: 'previewing',
            });
            nextBreakdown = writeBackBreakdownPreviewImage(withSketch, liveShot.id, imageUrl) ?? withSketch;
            ok += 1;
          }

          if (nextBreakdown && framePatches.length > 0) {
            applyScriptBreakdownPayload(props.id, nextBreakdown);
            const applied = nextBreakdown;
            updateNodeData(props.id, (node) => {
              const data = (node.data ?? {}) as Record<string, unknown>;
              const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
              const current = raw?.version === 1 && Array.isArray(raw.frames)
                ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
                : emptyStoryboardPreview();
              let frames = [...current.frames];
              for (const patch of framePatches) {
                const idx = frames.findIndex(
                  (f) =>
                    f.sourceShotId === patch.shot.id
                    || f.id === `frame-line-${patch.shot.id}`
                    || f.id === `spf-${patch.shot.id}`
                    || f.id === patch.shot.id,
                );
                const framePatch = {
                  imageUrl: patch.imageUrl,
                  status: 'success' as const,
                  errorMessage: null,
                  promptSummary: patch.sketchPrompt,
                  stylePreset: 'line-art',
                };
                if (idx >= 0) {
                  frames = frames.map((f, fi) => (fi === idx ? { ...f, ...framePatch } : f));
                } else {
                  frames = [
                    ...frames,
                    {
                      id: `spf-${patch.shot.id}`,
                      order: frames.length + 1,
                      label: `${patch.shot.sceneCode || `Shot${patch.shot.index}`} · 线稿`,
                      startSec: 0,
                      endSec: Math.max(1, patch.shot.durationSec || 5),
                      sourceShotId: patch.shot.id,
                      promptSummary: patch.sketchPrompt,
                      characterNames: patch.shot.characters,
                      sceneAssetRef: patch.shot.scene,
                      referenceImageUrl: null,
                      imageUrl: patch.imageUrl,
                      status: 'success' as const,
                      locked: false,
                      stylePreset: 'line-art',
                    },
                  ];
                }
              }
              let chain = readChainStoryboard(data);
              if (chain) {
                let chainShots = chain.shots;
                for (const patch of framePatches) {
                  chainShots = patchChainShot(
                    { ...chain, shots: chainShots },
                    patch.shot.id,
                    buildLineArtShotPatch(patch.imageUrl, patch.sketchPrompt),
                  );
                }
                chain = { ...chain, shots: chainShots };
              }
              return {
                ...data,
                ...(chain ? { chainStoryboard: chain } : {}),
                scriptBreakdown: applied,
                storyboardPreview: { ...current, frames, confirmed: false },
                ...stripEpisodeConfirmation(data, currentEpisodeId),
                previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
              };
            });
          }

          appendLog(`宫格线稿已回填 · 第 ${page + 1}/${pageCount} 张 · ${framePatches.length} 镜`);
        } catch (e) {
          fail += chunk.length;
          appendLog(`[SB_LINEART_FAIL] 宫格线稿失败 · 第 ${page + 1}/${pageCount} 张: ${String(e)}`);
        }
      }

      setGeneratingShotId(null);
      setBatchMode(null);
      setBatchProgress(null);
      lineArtAbortRef.current = null;
      const aborted = signal.aborted;
      appendLog(`宫格线稿${aborted ? '已停止' : '完成'} · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`宫格线稿完成 ${ok}/${targetShots.length}`);
    },
    [
      appendLog,
      batchScopeMode,
      characters,
      costumeOptions,
      // SB-OL-05: currentEpisodeId 必须入 deps，否则切集后旧闭包会摘掉上一集的确认
      currentEpisodeId,
      getEdges,
      getNodes,
      payload,
      propOptions,
      props.id,
      resolveSketchPrompt,
      setShotFrameUrl,
      shotLexiconOptions,
      shots,
      updateNodeData,
      visibleShots,
    ],
  );

  return {
    generateShotLineArt,
    generateBatchLineArt,
    retryFailedLineArt,
    generateBatchGridLineArt,
  };
}
