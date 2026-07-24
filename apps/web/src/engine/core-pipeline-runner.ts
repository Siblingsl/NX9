/**
 * 核心 6 步生产路径（Shot-first）：
 * 剧本 → 分镜列表 → 分镜图全出 → 批审 → 视频全出 → 简单拼接导出
 *
 * 以 storyboard.shots 为 SSOT，不依赖阶段节点链。
 */
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useFlowCommands } from '../stores/flow-commands';
import { useActivityLog } from '../stores/activity-log';
import { useContextRailUi } from './stage-deck/stores/context-rail-ui';
import { api } from '../api/client';
import { runPictureGenJob } from './picture-gen-runner';
import { runExportPack } from './export-pack-runner';
import { pollClipTask } from './picture-gen-runner';
import { resolvePictureGenSettings } from './storyboard-preview-runner';
import {
  activeEpisodeShots,
  appendStoryboardVideoVersion,
  appendEpisodeExportRecord,
  appendStoryboardReviewEvent,
  buildDirectorCharacterPlacementPrompt,
  buildVideoGuidePromptSuffix,
  resolveActiveEpisodeId,
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
  buildCharacterContext,
  resolveVideoGenParams,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { useExecutionQueue } from '../stores/execution-queue';
import {
  enabledGuideKinds,
  readStoryboardGuidePrefs,
} from '../stores/storyboard-guide-prefs';
import { composeStoryboardGuideFrameDataUrl } from './storyboard-guide-compose';

function log(msg: string) {
  useActivityLog.getState().append(msg);
}

/** 核心模板缺节点时提示并补第一个缺失项；正常入口会一次加载完整模板。 */
export function ensureCorePipelineNodes(): void {
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) return;
  const nodes = runtime.getNodes();
  const kinds = new Set(nodes.map((n) => n.type));
  const spawn = useFlowCommands.getState().requestSpawn;
  for (const kind of [
    'script-desk',
    'asset-gate',
    'storyboard-desk',
    'picture-gen',
    'director-desk',
    'clip-gen',
    'export-pack',
  ] as const) {
    if (!kinds.has(kind) && !(kind === 'storyboard-desk' && (kinds.has('story-grid') || kinds.has('storyboard-preview')))) {
      spawn(kind);
      log(`核心流程缺少“${kind}”，已补充节点；建议重新加载核心流程模板以恢复完整连线`);
      break;
    }
  }
}

/** 把故事板镜头同步进分镜台 / 预览节点（若存在） */
export function syncPreviewFromStoryboard(): void {
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) {
    useContextRailUi.getState().requestTab('storyboard');
    log('已打开故事板；请在分镜台中同步后出图');
    return;
  }
  const nodes = runtime.getNodes();
  const preview = nodes.find(
    (n) => n.type === 'storyboard-desk' || n.type === 'storyboard-preview' || n.type === 'story-grid',
  );
  if (preview) {
    runtime.focusBlock(preview.id);
    log('已聚焦分镜台 · 请在「关键帧」Tab 同步并批量出图');
  } else {
    useFlowCommands.getState().requestSpawn('storyboard-desk');
    useContextRailUi.getState().requestTab('storyboard');
    log('已创建分镜台节点并打开故事板');
  }
}

/**
 * 为缺失关键帧的镜头逐镜出图，写回 firstFrameAssetId。
 * 优先使用 shot.promptEn / descriptionZh。
 */
export async function batchGenerateKeyframesFromShots(
  shotIds?: string[],
  force = false,
): Promise<{ ok: number; fail: number }> {
  const doc = useWorkspaceDocument.getState();
  const shots = activeEpisodeShots(doc.storyboard);
  if (shots.length === 0) {
    log('分镜列表为空，请先生成分镜表并写入故事板');
    return { ok: 0, fail: 0 };
  }

  ensureCorePipelineNodes();
  useContextRailUi.getState().requestTab('storyboard');

  let ok = 0;
  let fail = 0;
  const requested = shotIds?.length ? new Set(shotIds) : null;
  const targets = shots.filter(
    (shot) => (!requested || requested.has(shot.id)) && (force || !shot.firstFrameAssetId),
  );
  if (targets.length === 0) {
    log(`全部 ${shots.length} 镜已有分镜图`);
    return { ok: shots.length, fail: 0 };
  }

  log(`开始批量出图 · ${targets.length}/${shots.length} 镜待生成`);

  const runtime = useFlowRuntime.getState().runtime;
  const pictureData = (runtime?.getNodes().find((node) => node.type === 'picture-gen')?.data ?? {}) as Record<string, unknown>;
  const pictureSettings = resolvePictureGenSettings(pictureData);
  const queue = useExecutionQueue.getState();
  queue.startBatch(targets.map((shot) => shot.id), 'core-keyframes');

  for (let index = 0; index < targets.length; index++) {
    if (useExecutionQueue.getState().phase === 'cancelled') {
      log('批量出图已停止');
      break;
    }
    const shot = targets[index];
    queue.reportProgress({
      done: index,
      total: targets.length,
      currentBlockId: shot.id,
      currentLabel: `分镜图 #${shot.index + 1}`,
    });
    const basePrompt =
      (shot.promptEn || '').trim() ||
      (shot.descriptionZh || '').trim() ||
      `cinematic storyboard frame, shot ${shot.index + 1}`;
    const characterContext = buildCharacterContext(
      {},
      shot,
      doc.characters.characters,
    );
    const environment = doc.environments?.environments.find(
      (item) => item.id === shot.sceneAssetId,
    );
    const scenePrompt = environment
      ? `Scene consistency: ${environment.consistencyPrompt || environment.descriptionZh}`
      : '';
    const reviewPrompt = shot.keyframeReviewNote?.trim()
      ? `Revision request from storyboard review: ${shot.keyframeReviewNote.trim()}`
      : '';
    const cameraPrompt = shot.director3dGuide?.cameraPrompt
      ? `3D camera direction: ${shot.director3dGuide.cameraPrompt}`
      : '';
    const placementPrompt = buildDirectorCharacterPlacementPrompt(shot.director3dGuide);
    const prompt = [basePrompt, characterContext.promptSuffix, scenePrompt, cameraPrompt, placementPrompt, reviewPrompt]
      .filter(Boolean)
      .join('\n\n');
    const referenceImageUrl =
      characterContext.referenceImageUrl ??
      environment?.referenceUrls?.[0] ??
      environment?.referenceImageUrl ??
      undefined;
    try {
      doc.updateShot(shot.id, { status: 'generating', keyframeStatus: 'draft' });
      const urls = await runPictureGenJob({
        prompt,
        modelId: pictureSettings.modelId,
        size: pictureSettings.size,
        referenceImageUrl,
        n: 1,
      });
      const url = urls[0];
      if (!url) throw new Error('无图片 URL');
      doc.updateShot(shot.id, {
        firstFrameAssetId: url,
        status: 'review',
        keyframeStatus: 'review',
      });
      const previewNode = runtime?.getNodes().find((node) => node.type === 'storyboard-preview');
      const rawPreview = previewNode?.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
      if (previewNode && rawPreview?.version === 1 && Array.isArray(rawPreview.frames)) {
        runtime?.updateNodeData(previewNode.id, {
          storyboardPreview: {
            ...rawPreview,
            confirmed: false,
            confirmedAt: null,
            frames: rawPreview.frames.map((frame) => frame.sourceShotId === shot.id
              ? {
                  ...frame,
                  imageUrl: url,
                  reviewNote: shot.keyframeReviewNote ?? null,
                  status: 'success' as const,
                  locked: false,
                  errorMessage: null,
                }
              : frame),
          },
        });
      }
      ok++;
      log(`分镜图完成 · #${shot.index + 1}`);
    } catch (e) {
      fail++;
      doc.updateShot(shot.id, { status: 'failed', keyframeStatus: 'failed' });
      log(`分镜图失败 · #${shot.index + 1}: ${String(e)}`);
    }
  }

  const keyframeCancelled = useExecutionQueue.getState().phase === 'cancelled';
  queue.reportProgress({ done: ok + fail, total: targets.length, currentBlockId: null });
  queue.finish();
  const pictureNode = runtime?.getNodes().find((node) => node.type === 'picture-gen');
  if (pictureNode) {
    const completed = activeEpisodeShots(useWorkspaceDocument.getState().storyboard)
      .map((shot) => shot.firstFrameAssetId)
      .filter((url): url is string => Boolean(url));
    runtime?.updateNodeData(pictureNode.id, {
      status: keyframeCancelled ? 'idle' : fail > 0 ? 'error' : 'success',
      previewUrls: completed,
      previewUrl: completed[0],
      batchCount: completed.length,
    });
  }
  doc.setProjectStatus('draft');
  log(`批量出图结束 · 成功 ${ok} · 失败 ${fail}`);
  return { ok, fail };
}

/** 批审：全部有图的镜头 → keyframeStatus=approved */
export function approveAllKeyframes(): number {
  const doc = useWorkspaceDocument.getState();
  const shots = activeEpisodeShots(doc.storyboard);
  let n = 0;
  for (const shot of shots) {
    if (!shot.firstFrameAssetId) continue;
    const event = {
      id: `review-${shot.id}-${Date.now()}-${n}`,
      stage: 'keyframe' as const,
      decision: 'approved' as const,
      createdAt: new Date().toISOString(),
    };
    doc.updateShot(shot.id, {
      keyframeStatus: 'approved',
      status: 'approved',
      keyframeReviewNote: null,
      reviewHistory: appendStoryboardReviewEvent(shot, event),
    });
    n++;
  }
  log(`批审完成 · ${n} 镜关键帧已批准`);
  return n;
}

async function pollVideoUntilDone(taskId: string): Promise<string | undefined> {
  try {
    return await pollClipTask(taskId);
  } catch {
    return undefined;
  }
}

/**
 * 为已批审且缺视频的镜头逐镜出视频，写回 videoAssetId。
 * 使用 firstFrame 作为参考图 + videoPrompt/prompt。
 * @param shotIds 限定镜头；视频生成工作区必须传入本节点上游镜，避免吃整集
 * @param clipGenBlockId 使用该节点的模型/画幅参数，保证多 clip-gen 彼此独立
 */
export async function batchGenerateVideosFromShots(
  shotIds?: string[],
  force = false,
  clipGenBlockId?: string,
): Promise<{ ok: number; fail: number }> {
  const doc = useWorkspaceDocument.getState();
  const episodeShots = activeEpisodeShots(doc.storyboard);
  const requested = shotIds?.length ? new Set(shotIds) : null;
  const shots = requested
    ? doc.storyboard.shots.filter((s) => requested.has(s.id)).sort((a, b) => a.index - b.index)
    : episodeShots;
  if (shots.length === 0) {
    log(requested ? '上游镜头列表为空' : '分镜列表为空');
    return { ok: 0, fail: 0 };
  }

  const unapproved = shots.filter((s) => s.keyframeStatus !== 'approved');
  if (unapproved.length > 0) {
    log(`还有 ${unapproved.length} 镜未批审关键帧，请先完成批审`);
  }

  const targets = shots.filter(
    (s) =>
      s.firstFrameAssetId &&
      s.keyframeStatus === 'approved' &&
      (force || !s.videoAssetId),
  );
  if (targets.length === 0) {
    const allHave = shots.every((s) => s.videoAssetId);
    if (allHave) {
      log(`全部 ${shots.length} 镜已有视频`);
      return { ok: shots.length, fail: 0 };
    }
    log('没有可生成视频的镜头（需要已批审 + 有分镜图）');
    return { ok: 0, fail: 0 };
  }

  log(`开始批量视频 · ${targets.length} 镜`);
  let ok = 0;
  let fail = 0;
  const runtime = useFlowRuntime.getState().runtime;
  const nodes = runtime?.getNodes() ?? [];
  const edges = runtime?.getEdges() ?? [];
  const clipNode = clipGenBlockId
    ? nodes.find((node) => node.id === clipGenBlockId)
    : nodes.find((node) => node.type === 'clip-gen');
  const clipData = (clipNode?.data ?? {}) as Record<string, unknown>;
  const previewNode =
    (clipGenBlockId
      ? edges
          .filter((edge) => edge.target === clipGenBlockId)
          .map((edge) => nodes.find((node) => node.id === edge.source))
          .find(
            (node) =>
              node &&
              (node.type === 'storyboard-desk' ||
                node.type === 'storyboard-preview' ||
                node.type === 'director-desk'),
          )
      : undefined) ??
    nodes.find((node) => node.type === 'storyboard-desk' || node.type === 'storyboard-preview');
  const previewPayload = (previewNode?.data?.storyboardPreview ?? null) as StoryboardPreviewPayload | null;
  const videoParams = resolveVideoGenParams({
    resolution: clipData.resolution as string | undefined,
    orientation: clipData.orientation as string | undefined,
    aspect: clipData.aspect as string | undefined,
    durationSec: clipData.durationSec as number | undefined,
  });
  const queue = useExecutionQueue.getState();
  queue.startBatch(targets.map((shot) => shot.id), 'core-videos');

  for (let index = 0; index < targets.length; index++) {
    if (useExecutionQueue.getState().phase === 'cancelled') {
      log('批量视频已停止');
      break;
    }
    const shot = targets[index];
    queue.reportProgress({
      done: index,
      total: targets.length,
      currentBlockId: shot.id,
      currentLabel: `视频 #${shot.index + 1}`,
    });
    const basePrompt =
      (shot.videoPromptEn || '').trim() ||
      (shot.promptEn || '').trim() ||
      (shot.descriptionZh || '').trim() ||
      'cinematic motion, subtle camera move';
    const cameraPrompt = previewPayload?.frames.find(
      (frame) => frame.sourceShotId === shot.id,
    )?.director3dGuide?.cameraPrompt?.trim() || shot.director3dGuide?.cameraPrompt?.trim();
    const frameGuide = previewPayload?.frames.find(
      (frame) => frame.sourceShotId === shot.id,
    )?.director3dGuide ?? shot.director3dGuide;
    const placementPrompt = buildDirectorCharacterPlacementPrompt(frameGuide);
    const characterContext = buildCharacterContext({}, shot, doc.characters.characters);
    const environment = doc.environments?.environments.find(
      (item) => item.id === shot.sceneAssetId,
    );
    const scenePrompt = environment?.consistencyPrompt || environment?.descriptionZh;
    const guidePrefs = readStoryboardGuidePrefs();
    const guideOverlay = filterStoryboardGuideOverlay(resolveStoryboardGuideOverlay(shot), {
      enabled: guidePrefs.useForVideo,
      kinds: enabledGuideKinds(guidePrefs),
    });
    const guideSuffix = guidePrefs.useForVideo
      ? buildVideoGuidePromptSuffix(guideOverlay)
      : '';
    const prompt = [
      basePrompt,
      cameraPrompt,
      placementPrompt,
      characterContext.promptSuffix,
      scenePrompt,
      guideSuffix,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const modelId = (clipData.model as string | undefined) || 'veo';
      if (modelId.startsWith('grok-imagine-video') && !shot.firstFrameAssetId) {
        throw new Error('Grok Imagine 当前需要首图，请先在分镜预览生成首图');
      }
      doc.updateShot(shot.id, { videoStatus: 'draft' });
      // 出片参考用「带箭头引导图」加强意图；提示词强制成片不画出箭头
      let guideImageUrl = shot.firstFrameAssetId ?? undefined;
      if (
        guidePrefs.useForVideo
        && shot.firstFrameAssetId
        && (guideOverlay.arrows.length || guideOverlay.marks.length)
      ) {
        try {
          const composed = await composeStoryboardGuideFrameDataUrl(
            shot.firstFrameAssetId,
            guideOverlay,
          );
          if (composed) guideImageUrl = composed;
        } catch {
          /* 合成失败则回退干净首帧 + 文案引导 */
        }
      }
      const res = (await api.proxyVideo({
        prompt,
        model: modelId,
        imageUrl: guideImageUrl,
        duration: Math.min(8, Math.max(4, shot.durationSec || videoParams.durationSec)),
        aspect_ratio: videoParams.aspect,
        size: videoParams.size,
        resolution: videoParams.resolution,
      })) as { ok?: boolean; url?: string; status?: string; taskId?: string; message?: string };

      let videoUrl = res.url;
      if (!videoUrl && res.taskId && (res.status === 'processing' || res.status === 'queued')) {
        videoUrl = await pollVideoUntilDone(res.taskId);
      }
      if (!videoUrl) throw new Error(res.message ?? '视频生成失败');

      const version = {
        id: `video-${shot.id}-${Date.now()}`,
        url: videoUrl,
        createdAt: new Date().toISOString(),
        prompt,
        model: (clipData.model as string | undefined) || 'veo',
        status: 'candidate' as const,
      };
      doc.updateShot(shot.id, {
        ...appendStoryboardVideoVersion(shot, version),
      });
      ok++;
      log(`视频完成 · #${shot.index + 1}`);
    } catch (e) {
      fail++;
      doc.updateShot(shot.id, { videoStatus: 'failed', status: 'failed' });
      log(`视频失败 · #${shot.index + 1}: ${String(e)}`);
    }
  }

  const videoCancelled = useExecutionQueue.getState().phase === 'cancelled';
  queue.reportProgress({ done: ok + fail, total: targets.length, currentBlockId: null });
  queue.finish();
  const resultClipNode = clipGenBlockId
    ? runtime?.getNodes().find((node) => node.id === clipGenBlockId)
    : runtime?.getNodes().find((node) => node.type === 'clip-gen');
  if (resultClipNode) {
    const completed = (requested
      ? useWorkspaceDocument.getState().storyboard.shots.filter((shot) => requested.has(shot.id))
      : activeEpisodeShots(useWorkspaceDocument.getState().storyboard)
    )
      .map((shot) => shot.videoAssetId)
      .filter((url): url is string => Boolean(url));
    runtime?.updateNodeData(resultClipNode.id, {
      status: videoCancelled ? 'idle' : fail > 0 ? 'error' : 'success',
      videoUrls: completed,
      videoUrl: completed[0],
      batchCount: completed.length,
    });
  }
  doc.setProjectStatus('draft');
  log(`批量视频结束 · 成功 ${ok} · 失败 ${fail}`);
  return { ok, fail };
}

/**
 * 简单拼接导出：优先 FFmpeg concat 故事板视频；
 * 成功后标记 export-pack 节点 done + projectStatus。
 */
export async function simpleConcatExport(): Promise<{ ok: boolean; url?: string; message?: string }> {
  const doc = useWorkspaceDocument.getState();
  const shots = activeEpisodeShots(doc.storyboard);
  const runtime = useFlowRuntime.getState().runtime;
  const exportNode = runtime?.getNodes().find((node) => node.type === 'export-pack');
  const exportData = (exportNode?.data ?? {}) as Record<string, unknown>;
  const reject = (message: string) => {
    if (exportNode) runtime?.updateNodeData(exportNode.id, { status: 'error', message });
    log(message);
    return { ok: false as const, message };
  };
  const missingVideoCount = shots.filter((shot) => !shot.videoAssetId).length;
  if (missingVideoCount > 0) {
    const message = `还有 ${missingVideoCount} 镜未生成视频，请补齐后再导出`;
    return reject(message);
  }
  const unapprovedVideoCount = shots.filter((shot) => shot.videoStatus !== 'approved').length;
  if (unapprovedVideoCount > 0) {
    const message = `还有 ${unapprovedVideoCount} 镜视频未采用，请在视频生成工作区确认`;
    return reject(message);
  }
  const withVideo = shots.filter((s) => s.videoAssetId);
  if (withVideo.length === 0) {
    return reject('没有可导出的视频镜头');
  }

  // 视频采用在视频生成工作区内完成，导出只处理当前集的已采用镜头。
  const exportShots = withVideo.map((s) => ({
    ...s,
    status: 'approved' as const,
    videoStatus: 'approved' as const,
  }));
  if (exportNode) runtime?.updateNodeData(exportNode.id, { status: 'running', message: undefined });

  log(`开始简单拼接导出 · ${exportShots.length} 段`);
  try {
    const res = await runExportPack({
      mode: 'ffmpeg-episode',
      prefix: (exportData.exportPrefix as string | undefined) || doc.storyboard.title || 'nx9-episode',
      audioUrl: (exportData.episodeAudioUrl as string | undefined)?.trim() || undefined,
      pictures: [],
      clips: exportShots.map((s) => s.videoAssetId!).filter(Boolean),
      sounds: [],
      prompts: [],
      shots: exportShots,
    });

    if (!res.ok) {
      return reject(`导出失败：${res.message ?? '未知错误'}`);
    }

    // 标记 export-pack 节点完成
    if (runtime) {
      const pack = exportNode ?? runtime.getNodes().find((n) => n.type === 'export-pack');
      if (pack) {
        const now = new Date().toISOString();
        const episodeId = resolveActiveEpisodeId(doc.storyboard);
        const episodeTitle = shots.find((shot) => shot.episodeId === episodeId)?.episodeTitle ?? null;
        const exportName = (exportData.exportPrefix as string | undefined) || doc.storyboard.title || 'nx9-episode';
        const fileName = exportName.toLowerCase().endsWith('.mp4') ? exportName : `${exportName}.mp4`;
        const exportRecord = res.url ? {
          id: `export-${Date.now()}`,
          episodeId,
          episodeTitle,
          url: res.url,
          fileName,
          mode: 'ffmpeg-episode' as const,
          shotCount: exportShots.length,
          durationSec: exportShots.reduce((sum, shot) => sum + Math.max(0, shot.durationSec), 0),
          createdAt: now,
        } : undefined;
        runtime.updateNodeData?.(pack.id, {
          status: 'success',
          episodeUrl: res.url,
          lastExportAt: now,
          exportMode: 'ffmpeg-episode',
          exportHistory: exportRecord
            ? appendEpisodeExportRecord(
                exportData.exportHistory as import('@nx9/shared').EpisodeExportRecord[] | undefined,
                exportRecord,
              )
            : exportData.exportHistory,
        });
      }
    }

    doc.setProjectStatus('exported');
    log(`导出完成 · ${res.url ?? 'ok'}`);
    return { ok: true, url: res.url };
  } catch (e) {
    return reject(`导出异常：${String(e)}`);
  }
}
