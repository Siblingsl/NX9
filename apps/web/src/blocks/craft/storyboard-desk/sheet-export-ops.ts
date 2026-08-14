import { useCallback } from 'react';
import { type NodeProps, type Node as FlowNode } from '@xyflow/react';
import {
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewPayload,
  type StoryboardPreviewPictureSettings,
  buildPictureGenDelegatePatch,
  emptyStoryboardPreview,
  getEpisodeContactSheet,
  resolveConnectedPictureGenId,
  resolveStoryboardPreviewPictureSettings,
} from '@nx9/shared';
import {
  buildDeskContactSheetSignature,
  composeStoryboardSheetPng,
  deskSheetCellsFromBreakdownShots,
} from '../../../engine/storyboard-sheet-compose';
import type { CompositionStats } from '../../../engine/storyboard-desk-runner';
import { api } from '../../../api/client';
import { toastSuccess } from '../../../stores/toast';

type StoryboardSheetExportDeps = {
  props: NodeProps;
  updateNodeData: (id: string, dataUpdate: Partial<Record<string, unknown>> | ((node: FlowNode) => Partial<Record<string, unknown>>), options?: { replace: boolean }) => void;
  getNodes: () => Array<{ id: string; data?: unknown }>;
  getEdges: () => Array<{ source: string; target: string }>;
  appendLog: (line: string) => void;
  payload: ScriptBreakdownPayload | undefined;
  visibleShots: ScriptBreakdownShot[];
  visibleEpisodes: Array<{ id: string; title?: string }>;
  currentEpisodeId: string | null;
  compositionStats: CompositionStats;
  storyboardShots: any[];
  storyboardUrlByShotId: Map<string, string>;
  previewPayload: StoryboardPreviewPayload | undefined;
  contactSheetUrl: string | null;
  sheetComposing: boolean;
  setSheetComposing: (value: boolean) => void;
  setComposeViewTab: (tab: 'preview' | 'sheet') => void;
  batchRunning: boolean;
  sheetEpochRef: React.MutableRefObject<number>;
};

export function useStoryboardSheetExportOps(deps: StoryboardSheetExportDeps) {
  const {
    props,
    updateNodeData,
    getNodes,
    getEdges,
    appendLog,
    payload,
    visibleShots,
    visibleEpisodes,
    currentEpisodeId,
    compositionStats,
    storyboardShots,
    storyboardUrlByShotId,
    previewPayload,
    contactSheetUrl,
    sheetComposing,
    setSheetComposing,
    setComposeViewTab,
    batchRunning,
    sheetEpochRef,
  } = deps;
  /** X-13: 导出审片包（CSV + Markdown + 故事板PNG） */
  const exportReviewPackage = useCallback(async () => {
    if (!payload || visibleShots.length === 0) {
      appendLog('暂无镜表可导出');
      return;
    }
    const epTitle = visibleEpisodes[0]?.title ?? currentEpisodeId ?? '分镜';
    const header = [
      '镜号', '标题', '景别', '运镜', '角度', '镜头', '对白', '时长(s)', '角色', '场景',
    ];
    const rows = visibleShots.map((s) => [
      s.sceneCode || `S${s.index}`,
      s.title || '',
      s.shotSize || '',
      s.cameraMove || '',
      s.cameraAngle || '',
      s.cameraLens || '',
      s.dialogue?.map((d) => `${d.speaker ?? ''}:${d.text}`).join('; ') || '',
      String(s.durationSec ?? 5),
      (s.characters ?? []).join('; '),
      s.scene || '',
    ]);
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const md = [
      `# ${epTitle} 分镜审片包`,
      '',
      `- 镜数: ${visibleShots.length}`,
      `- 总时长: ${(() => { const t = visibleShots.reduce((s, shot) => s + (shot.durationSec ?? 5), 0); const m = Math.floor(t / 60); const sec = t % 60; return m > 0 ? `${m}m${sec}s` : `${sec}s`; })()}`,
      `- 构图覆盖: ${Math.round(compositionStats.coverage * 100)}%`,
      contactSheetUrl ? `- 故事板大图: ${contactSheetUrl}` : '',
      '',
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');
    const csvBlob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const mdBlob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const safeTitle = epTitle.replace(/[/:*?"<>|]/g, '-').slice(0, 40);
    const url1 = URL.createObjectURL(csvBlob);
    const a1 = document.createElement('a'); a1.href = url1; a1.download = `${safeTitle}-镜表.csv`; a1.click();
    URL.revokeObjectURL(url1);
    const url2 = URL.createObjectURL(mdBlob);
    const a2 = document.createElement('a'); a2.href = url2; a2.download = `${safeTitle}-审片.md`; a2.click();
    URL.revokeObjectURL(url2);
    if (contactSheetUrl) {
      try {
        const pngResp = await fetch(contactSheetUrl);
        if (pngResp.ok) {
          const pngBlob = await pngResp.blob();
          const pngUrl = URL.createObjectURL(pngBlob);
          const a3 = document.createElement('a'); a3.href = pngUrl; a3.download = `${safeTitle}-故事板.png`; a3.click();
          URL.revokeObjectURL(pngUrl);
        }
      } catch { /* CORS/ext failure: skip PNG, CSV+MD still exported */ }
    }
    appendLog(`审片包已导出 · ${safeTitle}-镜表.csv + ${safeTitle}-审片.md${contactSheetUrl ? ' + 故事板.png' : ''}`);
    if (!contactSheetUrl) appendLog('尚无故事板大图 · 可先生成后再导出');
  }, [appendLog, compositionStats.coverage, contactSheetUrl, currentEpisodeId, payload, visibleEpisodes, visibleShots]);

  const generateStoryboardSheet = useCallback(
    async (force = false) => {
      if (!payload || visibleShots.length === 0) {
        appendLog('分镜台：没有可合成的镜头');
        return;
      }
      if (sheetComposing || batchRunning) return;

      const livePreview = ((getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>)
        .storyboardPreview as StoryboardPreviewPayload | undefined;
       // Q-04: workspaceShotById 只认当前节点 chain 数据。
       const wsById = new Map(storyboardShots.map((s) => [s.id, s]));
      const cells = deskSheetCellsFromBreakdownShots(visibleShots, {
        preview: livePreview ?? previewPayload,
        storyboardUrlByShotId,
        workspaceShotById: wsById,
      });
      const withImage = cells.filter((c) => c.imageUrl?.trim()).length;
      if (withImage === 0) {
        appendLog('分镜台：请先生成线稿或上传分镜图，再合成故事板大图');
        return;
      }

      const signature = buildDeskContactSheetSignature(cells);
      const { url: existingUrl, signature: existingSig } = getEpisodeContactSheet(livePreview ?? previewPayload, currentEpisodeId);
      if (
        !force
        && existingUrl
        && existingSig === signature
      ) {
        toastSuccess('故事板大图已是最新');
        return;
      }

      setSheetComposing(true);
      // SB-OL-12: 记录代际，关台取消后在途拼版不再写回节点
      const sheetEpoch = sheetEpochRef.current;
      try {
        const epTitle = visibleEpisodes[0]?.title || payload.title || '本集';
        const blob = await composeStoryboardSheetPng(cells, {
          title: `${epTitle} · 分镜故事板`,
          subtitle: `${cells.length} 镜 · 线稿构图 ${withImage}/${cells.length} · NX9 分镜台`,
        });
        const file = new File(
          [blob],
          `storyboard-sheet-${Date.now()}.png`,
          { type: 'image/png' },
        );
        const uploaded = await api.uploadAsset(file);
        if (sheetEpochRef.current !== sheetEpoch) {
          appendLog('分镜故事板合成已取消 · 结果未写回');
          return;
        }
        updateNodeData(props.id, (node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
          const current = raw?.version === 1 && Array.isArray(raw.frames)
            ? {
                ...emptyStoryboardPreview(),
                ...raw,
                pictureSettings: resolveStoryboardPreviewPictureSettings(raw),
              }
            : emptyStoryboardPreview();
          return {
            ...data,
            storyboardPreview: {
              ...current,
              contactSheetUrl: uploaded.url,
              contactSheetSignature: signature,
              contactSheetsByEpisode: {
                ...(current.contactSheetsByEpisode ?? {}),
                [currentEpisodeId ?? '']: {
                  url: uploaded.url,
                  signature,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
          };
        });
        appendLog(`分镜故事板大图已生成 · ${withImage}/${cells.length} 格有图`);
        toastSuccess(`故事板大图已生成 · ${withImage} 格`);
        setComposeViewTab('sheet');
      } catch (e) {
        appendLog(`[SB_SHEET_FAIL] 分镜故事板大图失败: ${String(e)}`);
      } finally {
        setSheetComposing(false);
      }
    },
    [
      appendLog,
      batchRunning,
      getNodes,
      payload,
      previewPayload,
      props.id,
      sheetComposing,
      storyboardShots,
      storyboardUrlByShotId,
      updateNodeData,
      visibleEpisodes,
      visibleShots,
    ],
  );

  const downloadContactSheet = useCallback(() => {
    if (!contactSheetUrl) return;
    const a = document.createElement('a');
    a.href = contactSheetUrl;
    a.download = `storyboard-sheet-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }, [contactSheetUrl]);

  const updatePictureSettings = useCallback(
    (patch: Partial<StoryboardPreviewPictureSettings>) => {
      let nextSettings: StoryboardPreviewPictureSettings | undefined;
      updateNodeData(props.id, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
        const current = raw?.version === 1 && Array.isArray(raw.frames)
          ? {
              ...emptyStoryboardPreview(),
              ...raw,
              pictureSettings: resolveStoryboardPreviewPictureSettings(raw),
            }
          : emptyStoryboardPreview();
        const pictureSettings = { ...current.pictureSettings, ...patch };
        nextSettings = pictureSettings;
        return {
          ...data,
          storyboardPreview: { ...current, pictureSettings },
        };
      });
      if (!nextSettings) return;
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (pictureId) {
        updateNodeData(pictureId, buildPictureGenDelegatePatch(nextSettings));
      }
    },
    [getEdges, getNodes, props.id, updateNodeData],
  );

  return {
    exportReviewPackage,
    generateStoryboardSheet,
    downloadContactSheet,
    updatePictureSettings,
  };
}
