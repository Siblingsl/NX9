import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clapperboard,
  Film,
  Grid3x3,
  Import,
  List,
  Mic,
  Plus,
  Trash2,
  X,
  XCircle,
  Download,
  Clock,
  Link2,
  Layers,
  Pencil,
  Sparkles,
  Upload,
} from 'lucide-react';
import { buildTimelineFromShots, buildTimelineFromShotsV2, type TranscribeCue, parseStoryboardMarkdown, parseChineseScript, scenesToStoryboardShots, suggestShotGroups, type StoryboardShot } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useStoryboardUi, useFlowRuntime, useRemotionUi } from '../stores/flow-runtime';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { useActivityLog } from '../stores/activity-log';
import { useTakeStore } from '../engine/stage-deck/stores/take-store';
import { api } from '../api/client';
import { StoryboardShotMenu } from './StoryboardShotMenu';
import ImageUploadSlot from '../blocks/shared/ImageUploadSlot';

function artStyleFromPrefs(): string | undefined {
  try { return localStorage.getItem('nx9-art-style') || undefined; } catch { return undefined; }
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  review: '待审阅',
  approved: '已通过',
  failed: '失败',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-ink/10 text-ink/60',
  generating: 'bg-warn/15 text-warn',
  review: 'bg-brand/10 text-brand',
  approved: 'bg-ok/15 text-ok',
  failed: 'bg-red-100 text-red-700',
};

function newShot(): StoryboardShot {
  return {
    id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    index: 0,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: '',
    promptEn: '',
    status: 'draft',
    characterIds: [],
    linkedBlockId: null,
  };
}

export function StoryboardPanel() {
  const open = useStoryboardUi((s) => s.open);
  const view = useStoryboardUi((s) => s.view);
  const tab = useStoryboardUi((s) => s.tab);
  const selectedShotId = useStoryboardUi((s) => s.selectedShotId);
  const setView = useStoryboardUi((s) => s.setView);
  const setTab = useStoryboardUi((s) => s.setTab);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const setOpen = useStoryboardUi((s) => s.setOpen);
  const scrollToShotId = useStoryboardUi((s) => s.scrollToShotId);
  const requestScrollToShot = useStoryboardUi((s) => s.requestScrollToShot);
  const openAssetLib = useAssetLibraryModalUi((s) => s.setOpen);
  const assetLibOpen = useAssetLibraryModalUi((s) => s.open);

  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const characters = useWorkspaceDocument((s) => s.characters);
  const voice = useWorkspaceDocument((s) => s.voice);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const removeShot = useWorkspaceDocument((s) => s.removeShot);
  const setReviewMode = useWorkspaceDocument((s) => s.setReviewMode);
  const addVoiceProfile = useWorkspaceDocument((s) => s.addVoiceProfile);
  const updateVoiceLine = useWorkspaceDocument((s) => s.updateVoiceLine);
  const workspaceId = useWorkspaceDocument((s) => s.workspaceId);
  const appendLog = useActivityLog((s) => s.append);
  const focusBlock = useFlowRuntime((s) => s.runtime?.focusBlock);
  const spawnBlockForShot = useFlowRuntime((s) => s.runtime?.spawnBlockForShot);

  const openAssetLibForSelectedShot = useCallback(() => {
    if (!selectedShotId) {
      appendLog('请先在故事板选中一个镜头');
      return;
    }
    openAssetLib(true);
  }, [selectedShotId, openAssetLib, appendLog]);

  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'markdown' | 'script'>('markdown');
  const [showImport, setShowImport] = useState(false);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [shotMenu, setShotMenu] = useState<{ x: number; y: number; shotId: string } | null>(null);
  const [sketchFilter, setSketchFilter] = useState<'all' | 'with-sketch'>('all');

  const openShotContext = useCallback(
    (e: React.MouseEvent, shotId: string) => {
      e.preventDefault();
      selectShot(shotId);
      setShotMenu({ x: e.clientX, y: e.clientY, shotId });
    },
    [selectShot],
  );
  const [exporting, setExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showReference, setShowReference] = useState(false);
  const [refVideoUrl, setRefVideoUrl] = useState('');
  const [refNotes, setRefNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [checkedShotIds, setCheckedShotIds] = useState<Set<string>>(new Set());
  const [takePickerShotId, setTakePickerShotId] = useState<string | null>(null);

  useEffect(() => {
    if (!scrollToShotId || !open) return;
    const el = document.getElementById(`storyboard-shot-${scrollToShotId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    requestScrollToShot(null);
  }, [scrollToShotId, open, requestScrollToShot]);

  const handleImport = useCallback(() => {
    if (importMode === 'script') {
      const { background, scenes } = parseChineseScript(importText);
      const shots = scenesToStoryboardShots(scenes);
      if (shots.length === 0) {
        appendLog('剧本导入失败：未识别场景头（如 1-1 日 内 地点）');
        return;
      }
      addShots(shots, 'append');
      if (background.title) {
        useWorkspaceDocument.getState().setStoryboard({
          ...useWorkspaceDocument.getState().storyboard,
          title: background.title,
        });
      }
      appendLog(`已从剧本导入 ${shots.length} 个场景镜头`);
      setShowImport(false);
      setImportText('');
      return;
    }
    const shots = parseStoryboardMarkdown(importText);
    if (shots.length === 0) {
      appendLog('分镜导入失败：未识别 Markdown 表格');
      return;
    }
    addShots(shots, 'append');
    appendLog(`已导入 ${shots.length} 个镜头`);
    setShowImport(false);
    setImportText('');
  }, [importText, importMode, addShots, appendLog]);

  const handleAutoGroup = useCallback(() => {
    if (storyboard.shots.length === 0) {
      appendLog('暂无镜头可分组');
      return;
    }
    const groups = suggestShotGroups(storyboard.shots);
    groups.forEach((group) => {
      group.shotIds.forEach((shotId, i) => {
        updateShot(shotId, {
          notes: `${group.name} · ${i + 1}/${group.shotIds.length} · ${group.totalDurationSec}s`,
        });
      });
    });
    appendLog(`S-Class 分组完成：${groups.length} 组（单组 ≤15s）`);
  }, [storyboard.shots, updateShot, appendLog]);

  const handleAddShot = useCallback(() => {
    const maxIdx = storyboard.shots.reduce((m, s) => Math.max(m, s.index), 0);
    const shot = { ...newShot(), index: maxIdx + 1 };
    addShots([shot], 'append');
    selectShot(shot.id);
  }, [storyboard.shots, addShots, selectShot]);

  const handleApprove = useCallback(
    (id: string) => {
      const shot = storyboard.shots.find((s) => s.id === id);
      // 有视频时按成片审阅写 videoStatus；否则关键帧审阅写 keyframeStatus
      if (shot?.videoAssetId) {
        updateShot(id, {
          status: 'approved',
          videoStatus: 'approved',
          keyframeStatus: shot.keyframeStatus === 'approved' ? 'approved' : (shot.keyframeStatus ?? 'approved'),
        });
      } else {
        updateShot(id, {
          status: 'approved',
          keyframeStatus: 'approved',
          keyframeReviewNote: null,
        });
      }
    },
    [updateShot, storyboard.shots],
  );

  const handleReject = useCallback(
    (id: string) => {
      const shot = storyboard.shots.find((s) => s.id === id);
      if (shot?.videoAssetId) {
        updateShot(id, {
          status: 'draft',
          videoStatus: 'draft',
        });
      } else {
        updateShot(id, {
          status: 'draft',
          keyframeStatus: 'draft',
        });
      }
    },
    [updateShot, storyboard.shots],
  );

  const toggleShotChecked = useCallback((id: string) => {
    setCheckedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllReviewShots = useCallback(() => {
    const ids = storyboard.shots.filter((s) => s.status === 'review').map((s) => s.id);
    setCheckedShotIds(new Set(ids));
  }, [storyboard.shots]);

  const batchApprove = useCallback(() => {
    if (checkedShotIds.size === 0) return;
    for (const id of checkedShotIds) {
      const shot = storyboard.shots.find((s) => s.id === id);
      if (shot?.videoAssetId) {
        updateShot(id, {
          status: 'approved',
          videoStatus: 'approved',
          keyframeStatus: shot.keyframeStatus === 'approved' ? 'approved' : (shot.keyframeStatus ?? 'approved'),
        });
      } else {
        updateShot(id, {
          status: 'approved',
          keyframeStatus: 'approved',
          keyframeReviewNote: null,
        });
      }
    }
    appendLog(`已批量通过 ${checkedShotIds.size} 个镜头`);
    setCheckedShotIds(new Set());
  }, [checkedShotIds, updateShot, appendLog, storyboard.shots]);

  const batchReject = useCallback(() => {
    if (checkedShotIds.size === 0) return;
    for (const id of checkedShotIds) {
      const shot = storyboard.shots.find((s) => s.id === id);
      if (shot?.videoAssetId) {
        updateShot(id, { status: 'draft', videoStatus: 'draft' });
      } else {
        updateShot(id, { status: 'draft', keyframeStatus: 'draft' });
      }
    }
    appendLog(`已批量打回 ${checkedShotIds.size} 个镜头`);
    setCheckedShotIds(new Set());
  }, [checkedShotIds, updateShot, appendLog, storyboard.shots]);

  const handleExportContactSheet = useCallback(async () => {
    if (storyboard.shots.length === 0) return;
    setExporting(true);
    try {
      const res = await api.exportContactSheet(storyboard.shots);
      appendLog(`Contact Sheet 已导出 · ${res.shotCount} 镜`);
      window.open(res.url, '_blank');
    } catch (e) {
      appendLog(`Contact Sheet 导出失败: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [storyboard.shots, appendLog]);

  const handleRenderShot = useCallback(async () => {
    const shot = storyboard.shots.find((s) => s.id === selectedShotId);
    if (!shot?.videoAssetId && !shot?.firstFrameAssetId) {
      appendLog('请先为镜头生成视频或首帧');
      return;
    }
    setExporting(true);
    try {
      const voiceLine = voice.lines.find((l) => l.shotId === shot.id);
      const res = await api.renderShotMp4({
        videoUrl: shot.videoAssetId || shot.firstFrameAssetId!,
        audioUrl: voiceLine?.audioAssetId ?? shot.audioAssetId ?? undefined,
        subtitle: shot.descriptionZh,
        durationSec: shot.durationSec,
        shots: storyboard.shots,
      });
      if (res.ok && res.url) {
        appendLog(`单镜成片已导出: ${res.url}`);
        window.open(res.url, '_blank');
      } else {
        appendLog(res.message ?? '导出被阻止');
      }
    } catch (e) {
      appendLog(`单镜合成失败: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [storyboard.shots, selectedShotId, voice.lines, appendLog]);

  const filteredShots = storyboard.shots
    .filter((s) => statusFilter === 'all' || s.status === statusFilter)
    .filter((s) => sketchFilter === 'all' || s.firstFrameAssetId != null);

  const handleAnalyzeReference = useCallback(async () => {
    if (!refVideoUrl.trim()) {
      appendLog('请填写参考视频 URL（/media/videos/...）');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api.analyzeReferenceVideo({
        videoUrl: refVideoUrl.trim(),
        notes: refNotes.trim() || undefined,
        targetShotCount: 6,
      });
      if (res.shots?.length) {
        addShots(res.shots, 'replace');
        appendLog(res.message ?? `已反推 ${res.shots.length} 镜`);
        setShowReference(false);
      } else {
        appendLog(res.message ?? '反推失败，请检查视频 URL 与 LLM Key');
      }
    } catch (e) {
      appendLog(`参考视频反推失败: ${String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  }, [refVideoUrl, refNotes, addShots, appendLog]);

  const handleConcatEpisode = useCallback(async () => {
    if (storyboard.shots.length === 0) return;
    setExporting(true);
    try {
      const res = await api.concatEpisode({
        shots: storyboard.shots,
        title: storyboard.title || '整集',
        requireApproved: storyboard.reviewMode === 'manual',
      });
      if (res.ok && res.url) {
        appendLog(`整集导出完成 · ${res.segmentCount} 段`);
        window.open(res.url, '_blank');
      } else {
        appendLog(res.message ?? '整集导出失败');
      }
    } catch (e) {
      appendLog(`整集合成失败: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [storyboard, appendLog]);

  const handleExportTimeline = useCallback(async () => {
    if (storyboard.shots.length === 0) return;
    setExporting(true);
    try {
      // 导出 Timeline v2（含 aspect、字幕轨）
      const timeline = buildTimelineFromShots(storyboard.shots, storyboard.title);
      const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline-v2-${storyboard.title || 'episode'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      appendLog(`Timeline v2 已导出 · ${timeline.tracks.length} 轨 · version=${timeline.version}`);
    } catch (e) {
      appendLog(`时间线导出失败: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [storyboard, appendLog]);

  const handleTranscribeToTimeline = useCallback(async () => {
    const shotsWithAudio = storyboard.shots.filter((s) => s.audioAssetId);
    if (shotsWithAudio.length === 0) {
      appendLog('生成字幕轨：无配音素材的镜头');
      return;
    }
    setExporting(true);
    try {
      const cues: TranscribeCue[] = [];
      for (const shot of shotsWithAudio) {
        const res = await api.transcribeAudio(shot.audioAssetId!, 'zh');
        if (res.ok && res.cues) {
          for (const c of res.cues) {
            const shotStart = storyboard.shots
              .sort((a, b) => a.index - b.index)
              .filter((s) => s.index < shot.index)
              .reduce((sum, s) => sum + (s.durationSec || 4), 0);
            cues.push({
              startSec: shotStart + c.start,
              endSec: shotStart + c.end,
              text: c.text,
            });
          }
        }
      }
      if (cues.length === 0) {
        appendLog('字幕轨生成：未识别到语音内容');
        return;
      }
      // 写入 workspace timelineDraft 供后续使用
      const result = buildTimelineFromShotsV2(storyboard.shots, storyboard.title, {
        transcribeCues: cues,
      });
      useWorkspaceDocument.getState().setTimelineDraft(result);
      appendLog(`字幕轨生成完成 · ${cues.length} 条 SRT cues，已写入 timelineDraft`);
    } catch (e) {
      appendLog(`字幕轨生成失败: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [storyboard, appendLog]);

  const handleGenerateVoiceBatch = useCallback(async () => {
    if (!workspaceId) return;
    setGeneratingVoice(true);
    try {
      const voiceSnap = useWorkspaceDocument.getState().voice;
      const res = await api.generateVoiceLines(workspaceId, undefined, voiceSnap);
      appendLog(`配音完成：成功 ${res.ok}，失败 ${res.failed}`);
      for (const item of res.results ?? []) {
        updateVoiceLine(item.id, {
          audioAssetId: item.audioAssetId ?? null,
          status: item.status === 'ready' ? 'ready' : 'failed',
        });
      }
    } catch (e) {
      appendLog(`批量配音失败: ${String(e)}`);
    } finally {
      setGeneratingVoice(false);
    }
  }, [workspaceId, appendLog, updateVoiceLine]);

  const handleAddProfile = useCallback(() => {
    const id = `vp-${Date.now()}`;
    addVoiceProfile({
      id,
      name: `角色 ${voice.profiles.length + 1}`,
      provider: 'openai-compatible',
      voiceId: 'alloy',
    });
  }, [addVoiceProfile, voice.profiles.length]);

  if (!open) return null;

  return (
    <aside className="w-[360px] shrink-0 border-l border-line bg-white flex flex-col h-full">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <Clapperboard size={18} className="text-brand" />
        <span className="font-semibold text-sm flex-1">故事板</span>
        <span className="text-xs text-ink/50">{storyboard.shots.length} 镜</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg hover:bg-surface text-ink/50"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-line text-xs">
        <button
          type="button"
          onClick={() => setTab('shots')}
          className={`flex-1 py-2 ${tab === 'shots' ? 'text-brand border-b-2 border-brand font-medium' : 'text-ink/50'}`}
        >
          镜头
        </button>
        <button
          type="button"
          onClick={() => setTab('voice')}
          className={`flex-1 py-2 flex items-center justify-center gap-1 ${tab === 'voice' ? 'text-brand border-b-2 border-brand font-medium' : 'text-ink/50'}`}
        >
          <Mic size={14} />
          配音
        </button>
      </div>

      {tab === 'shots' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-1 px-3 py-2 border-b border-line flex-wrap">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`p-1.5 rounded-lg ${view === 'list' ? 'bg-brand/10 text-brand' : 'text-ink/50'}`}
              title="列表"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-lg ${view === 'grid' ? 'bg-brand/10 text-brand' : 'text-ink/50'}`}
              title="网格"
            >
              <Grid3x3 size={16} />
            </button>
              <button
                type="button"
                onClick={() => useRemotionUi.getState().setOpen(true)}
                className={`p-1.5 rounded-lg text-ink/50 hover:text-brand`}
                title="成片工作室"
              >
                <Film size={16} />
              </button>
              <button
                type="button"
                onClick={() => void handleTranscribeToTimeline()}
                disabled={exporting || storyboard.shots.filter((s) => s.audioAssetId).length === 0}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-line hover:border-brand/40 disabled:opacity-40"
                title="从配音生成字幕轨"
              >
                SR
              </button>
            <select
              value={storyboard.reviewMode}
              onChange={(e) => setReviewMode(e.target.value as 'manual' | 'auto')}
              className="text-[10px] rounded border border-line px-1 py-0.5"
              title="审阅模式"
            >
              <option value="manual">审阅门控</option>
              <option value="auto">自动通过</option>
            </select>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void handleExportContactSheet()}
              disabled={exporting || storyboard.shots.length === 0}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-line hover:border-brand/40 disabled:opacity-40"
            >
              <Download size={14} />
              Sheet
            </button>
            <button
              type="button"
              onClick={() => void handleConcatEpisode()}
              disabled={exporting || storyboard.shots.length === 0}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-line hover:border-brand/40 disabled:opacity-40"
              title="整集 concat"
            >
              <Layers size={14} />
              整集
            </button>
            <button
              type="button"
              onClick={() => void handleExportTimeline()}
              disabled={exporting || storyboard.shots.length === 0}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-line hover:border-brand/40 disabled:opacity-40"
            title="时间线 JSON"
          >
            JSON
          </button>
            <button
              type="button"
              onClick={() => setShowReference((v) => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${
                showReference ? 'border-brand bg-brand/5 text-brand' : 'border-line hover:border-brand/40'
              }`}
            >
              <Link2 size={14} />
              反推
            </button>
            {spawnBlockForShot && storyboard.shots.length > 0 && (
              <button
                type="button"
                onClick={() => spawnBlockForShot(storyboard.shots[0].id, 'motion-story')}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-accent text-accent hover:bg-accent/5"
                title="Seedance 连续 Clip 链"
              >
                Clip链
              </button>
            )}
            <button
              type="button"
              onClick={openAssetLibForSelectedShot}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${
                assetLibOpen && selectedShotId
                  ? 'border-brand bg-brand/10 text-brand'
                  : selectedShotId
                    ? 'border-brand/40 text-brand hover:bg-brand/5'
                    : 'border-line text-ink/40'
              }`}
              title={selectedShotId ? '打开素材库' : '请先选中镜头'}
            >
              <Layers size={14} />
              模板库
            </button>
            <button
              type="button"
              onClick={handleAutoGroup}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-line hover:border-brand/40"
              title="按 ≤15s 贪心分组，场景变化处断开"
            >
              <Layers size={14} />
              自动分组
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-line hover:border-brand/40"
            >
              <Import size={14} />
              导入
            </button>
            <button
              type="button"
              onClick={handleAddShot}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-brand text-white"
            >
              <Plus size={14} />
              镜头
            </button>
          </div>

          <div className="flex gap-1 px-3 py-1.5 border-b border-line text-[10px] overflow-x-auto">
            {(['all', 'draft', 'review', 'approved', 'failed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-2 py-0.5 rounded-full shrink-0 ${
                  statusFilter === f ? 'bg-brand/10 text-brand' : 'text-ink/50'
                }`}
              >
                {f === 'all' ? '全部' : STATUS_LABEL[f]}
              </button>
            ))}
            <div className="w-px h-4 bg-line mx-1" />
            <button
              type="button"
              onClick={() => setSketchFilter((v) => (v === 'all' ? 'with-sketch' : 'all'))}
              className={`px-2 py-0.5 rounded-full shrink-0 text-[10px] ${
                sketchFilter === 'with-sketch' ? 'bg-brand/10 text-brand' : 'text-ink/50'
              }`}
            >
              {sketchFilter === 'with-sketch' ? '线稿' : '全部'}
            </button>
          </div>

          {showReference && (
            <div className="p-3 border-b border-line bg-surface space-y-2">
              <p className="text-xs text-ink/60">参考视频反推分镜（OpenMontage 思路 · 需 LLM Key）</p>
              <input
                value={refVideoUrl}
                onChange={(e) => setRefVideoUrl(e.target.value)}
                placeholder="/media/videos/xxx.mp4"
                className="w-full text-xs rounded-lg border border-line px-2 py-1.5 font-mono"
              />
              <textarea
                value={refNotes}
                onChange={(e) => setRefNotes(e.target.value)}
                placeholder="可选：参考说明、风格、节奏…"
                className="w-full text-xs rounded-lg border border-line px-2 py-1 min-h-[48px]"
              />
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void handleAnalyzeReference()}
                className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white disabled:opacity-50"
              >
                {analyzing ? '分析中…' : '反推并导入故事板'}
              </button>
            </div>
          )}

          {showImport && (
            <div className="p-3 border-b border-line bg-surface space-y-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setImportMode('markdown')}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${importMode === 'markdown' ? 'bg-brand/10 text-brand' : 'text-ink/50'}`}
                >
                  Markdown 分镜
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('script')}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${importMode === 'script' ? 'bg-brand/10 text-brand' : 'text-ink/50'}`}
                >
                  中文剧本
                </button>
              </div>
              <p className="text-xs text-ink/60">
                {importMode === 'markdown'
                  ? '粘贴分镜 Markdown 表格（storyboard-breaker 输出）'
                  : '粘贴完整中文剧本（第X集、场景头、对白）'}
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full h-24 text-xs rounded-lg border border-line p-2 font-mono"
                placeholder={
                  importMode === 'markdown'
                    ? '| 镜号 | 景别 | 画面描述 | 英文提示词 | 时长 |'
                    : '《剧名》\n第1集\n1-1 日 内 咖啡馆\n人物：小明\n...'
                }
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleImport}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white"
                >
                  确认导入
                </button>
                <button
                  type="button"
                  onClick={() => setShowImport(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-line"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            {storyboard.shots.length === 0 ? (
              <div className="text-center py-12 text-sm text-ink/50 space-y-2">
                <p>暂无镜头</p>
                <p className="text-xs">用 ChatModel + 分镜拆解 Skill 生成后导入</p>
              </div>
            ) : view === 'list' ? (
              <ul className="space-y-2">
                {filteredShots.map((shot) => (
                  <li
                    key={shot.id}
                    id={`storyboard-shot-${shot.id}`}
                    className={`rounded-xl border p-2 cursor-pointer transition-colors ${
                      selectedShotId === shot.id
                        ? 'border-brand bg-brand/5'
                        : 'border-line hover:border-brand/30'
                    }`}
                    onClick={() => selectShot(shot.id)}
                    onContextMenu={(e) => openShotContext(e, shot.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-12 h-[27px] shrink-0 rounded border border-line overflow-hidden bg-surface flex items-center justify-center">
                        {shot.firstFrameAssetId ? (
                          <img
                            src={shot.firstFrameAssetId}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Pencil size={12} className="text-ink/20" />
                        )}
                      </div>
                      <span className="text-xs font-mono text-brand shrink-0">#{shot.index}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{shot.descriptionZh || shot.promptEn || '未命名'}</p>
                        <p className="text-[10px] text-ink/50 mt-0.5">
                          {shot.durationSec}s · {shot.shotType}
                        </p>
                        {shot.videoDesc && (
                          <p className="text-[9px] text-ink/40 truncate mt-0.5">{shot.videoDesc}</p>
                        )}
                        {shot.associateAssetIds && shot.associateAssetIds.length > 0 && (
                          <p className="text-[9px] text-accent/60 truncate mt-0.5">资产: {shot.associateAssetIds.join(', ')}</p>
                        )}
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[shot.status]}`}
                      >
                        {STATUS_LABEL[shot.status]}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {shot.status === 'review' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(shot.id);
                          }}
                          className="text-[10px] flex items-center gap-0.5 px-2 py-0.5 rounded bg-ok/15 text-ok"
                        >
                          <Check size={12} />
                          通过
                        </button>
                      )}
                      {shot.status === 'review' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(shot.id);
                          }}
                          className="text-[10px] flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-50 text-red-600"
                        >
                          <XCircle size={12} />
                          打回
                        </button>
                      )}
                      {spawnBlockForShot && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            spawnBlockForShot(shot.id, 'director-3d');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-line"
                        >
                          3D 预演
                        </button>
                      )}
                      {spawnBlockForShot && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            spawnBlockForShot(shot.id, 'director-desk');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-line"
                        >
                          导演台
                        </button>
                      )}
                      {spawnBlockForShot && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            spawnBlockForShot(shot.id, 'clip-gen');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-line"
                        >
                          视频
                        </button>
                      )}
                      {shot.linkedBlockId && focusBlock && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            focusBlock(shot.linkedBlockId!);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-line"
                        >
                          定位模块
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeShot(shot.id);
                        }}
                        className="text-[10px] p-0.5 rounded text-ink/40 hover:text-red-600 ml-auto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : view === 'grid' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1 px-1">
                  <button
                    type="button"
                    onClick={selectAllReviewShots}
                    className="text-[10px] px-2 py-1 rounded-lg border border-line hover:border-brand/40"
                  >
                    全选待审阅
                  </button>
                  <button
                    type="button"
                    disabled={checkedShotIds.size === 0}
                    onClick={batchApprove}
                    className="text-[10px] px-2 py-1 rounded-lg bg-ok/15 text-ok disabled:opacity-40"
                  >
                    通过 ({checkedShotIds.size})
                  </button>
                  <button
                    type="button"
                    disabled={checkedShotIds.size === 0}
                    onClick={batchReject}
                    className="text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-600 disabled:opacity-40"
                  >
                    打回
                  </button>
                  <button
                    type="button"
                    disabled={checkedShotIds.size === 0}
                    onClick={async () => {
                      const ids = [...checkedShotIds].filter((id) => {
                        const s = storyboard.shots.find((sh) => sh.id === id);
                        return s && !s.firstFrameAssetId && (s.descriptionZh || s.promptEn);
                      });
                      if (ids.length === 0) {
                        appendLog('选中镜头中无可用文本描述生成线稿');
                        return;
                      }
                      appendLog(`开始批量生成 ${ids.length} 镜线稿…`);
                      for (const id of ids) {
                        const s = storyboard.shots.find((sh) => sh.id === id);
                        if (!s) continue;
                        updateShot(id, { status: 'generating' });
                        try {
                          const res = await api.gridShotSketch({
                            descriptionZh: s.descriptionZh || '',
                            promptEn: s.promptEn || undefined,
                            shotType: s.shotType,
                            artStylePrompt: artStyleFromPrefs(),
                          });
                          updateShot(id, { firstFrameAssetId: res.url, sketchSource: 'ai-single', sketchPrompt: res.prompt, status: 'review' });
                        } catch {
                          updateShot(id, { status: 'failed' });
                        }
                      }
                      appendLog('批量线稿生成完毕');
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg border border-accent text-accent disabled:opacity-40"
                  >
                    批量 AI 线稿
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                {filteredShots.map((shot) => (
                  <div
                    key={shot.id}
                    id={`storyboard-shot-${shot.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectShot(shot.id)}
                    onContextMenu={(e) => openShotContext(e, shot.id)}
                    onKeyDown={(e) => e.key === 'Enter' && selectShot(shot.id)}
                    className={`relative rounded-xl border aspect-video flex flex-col items-center justify-center p-2 text-center cursor-pointer overflow-hidden ${
                      selectedShotId === shot.id ? 'border-brand bg-brand/5' : 'border-line'
                    } ${checkedShotIds.has(shot.id) ? 'ring-2 ring-brand/30' : ''}`}
                  >
                    <label
                      className="absolute top-1.5 left-1.5 z-10 flex items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={checkedShotIds.has(shot.id)}
                        onChange={() => toggleShotChecked(shot.id)}
                        className="rounded border-line"
                      />
                    </label>
                    {shot.firstFrameAssetId ? (
                      <img
                        src={shot.firstFrameAssetId}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="flex flex-col items-center justify-center gap-1 text-ink/20">
                        <span className="flex flex-col items-center justify-center">
                          <Pencil size={24} />
                          <span className="text-[9px] mt-1">无线稿</span>
                        </span>
                        {(shot.descriptionZh || shot.promptEn) && shot.status !== 'generating' && shot.status !== 'failed' && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              updateShot(shot.id, { status: 'generating' });
                              try {
                                const res = await api.gridShotSketch({
                                  descriptionZh: shot.descriptionZh || '',
                                  promptEn: shot.promptEn || undefined,
                                  shotType: shot.shotType,
                                  artStylePrompt: artStyleFromPrefs(),
                                });
                                updateShot(shot.id, { firstFrameAssetId: res.url, sketchSource: 'ai-single', sketchPrompt: res.prompt, status: 'review' });
                              } catch {
                                updateShot(shot.id, { status: 'failed' });
                              }
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-accent text-white hover:bg-accent/90 z-10"
                          >
                            生成线稿
                          </button>
                        )}
                      </span>
                    )}
                    <span className={`absolute bottom-1.5 left-1.5 text-lg font-mono text-white drop-shadow-md ${shot.firstFrameAssetId ? '' : 'text-brand drop-shadow-none'}`}>
                      #{shot.index}
                    </span>
                    <span className={`absolute bottom-1.5 right-1.5 text-[10px] px-1 rounded ${STATUS_COLOR[shot.status]}`}>
                      {STATUS_LABEL[shot.status]}
                    </span>
                    {shot.linkedBlockId && useTakeStore.getState().getForBlock(shot.linkedBlockId).length > 0 && (
                      <div className="absolute top-1.5 right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setTakePickerShotId(takePickerShotId === shot.id ? null : shot.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-white"
                        >
                          Take
                        </button>
                        {takePickerShotId === shot.id && (() => {
                          const takes = useTakeStore.getState().getForBlock(shot.linkedBlockId!);
                          return (
                            <div className="absolute top-full right-0 mt-1 bg-white border border-line rounded-lg shadow-lg z-20 min-w-[120px]">
                              {takes.map((take) => (
                                <button
                                  key={take.id}
                                  type="button"
                                  onClick={() => {
                                    updateShot(shot.id, { videoAssetId: take.assetUrl, status: 'review' });
                                    setTakePickerShotId(null);
                                  }}
                                  className="block w-full text-left text-[10px] px-2 py-1 hover:bg-surface"
                                >
                                  采用 Take · {take.thumbUrl ? <img src={take.thumbUrl} alt="" className="inline w-4 h-4 rounded" /> : null}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="text-center py-6 text-sm text-ink/50 space-y-2">
                  <Film size={32} className="mx-auto text-ink/20" />
                  <p>时间线视图已迁移至 Episode Studio</p>
                  <button
                    type="button"
                    onClick={() => useRemotionUi.getState().setOpen(true)}
                    className="inline-flex items-center gap-1 text-xs px-4 py-2 rounded-xl bg-brand text-white"
                  >
                    <Film size={14} />
                    打开 Episode Studio
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedShotId && (
            <div className="shrink-0 border-t border-line p-3 space-y-2 max-h-48 overflow-y-auto">
              {(() => {
                const shot = storyboard.shots.find((s) => s.id === selectedShotId);
                if (!shot) return null;
                return (
                  <>
                    {shot.firstFrameAssetId && (
                      <img
                        src={shot.firstFrameAssetId}
                        alt="线稿"
                        className="w-full rounded-lg border border-line max-h-24 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <input
                      className="w-full text-sm rounded-lg border border-line px-2 py-1"
                      value={shot.descriptionZh}
                      placeholder="画面描述"
                      onChange={(e) => updateShot(shot.id, { descriptionZh: e.target.value })}
                    />
                    <textarea
                      className="w-full text-xs rounded-lg border border-line px-2 py-1 font-mono min-h-[60px]"
                      value={shot.promptEn}
                      placeholder="英文提示词"
                      onChange={(e) => updateShot(shot.id, { promptEn: e.target.value })}
                    />
                    {characters.characters.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-ink/50">关联角色</p>
                        <div className="flex flex-wrap gap-1">
                          {characters.characters.map((c) => {
                            const checked = shot.characterIds?.includes(c.id) ?? false;
                            return (
                              <label
                                key={c.id}
                                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer border ${
                                  checked ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink/50'
                                }`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const current = shot.characterIds ?? [];
                                    const next = checked
                                      ? current.filter((id) => id !== c.id)
                                      : [...current, c.id];
                                    updateShot(shot.id, { characterIds: next });
                                  }}
                                  className="hidden"
                                />
                                {c.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <ImageUploadSlot
                          url={shot.firstFrameAssetId ?? ''}
                          label="上传线稿"
                          aspectClass="aspect-auto h-9"
                          compact
                          onUploaded={(url) => {
                            updateShot(shot.id, { firstFrameAssetId: url, sketchSource: 'upload', status: 'review' });
                          }}
                          onClear={() => updateShot(shot.id, { firstFrameAssetId: null, sketchSource: undefined })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!shot.descriptionZh && !shot.promptEn) {
                            appendLog('请先填写画面描述或英文提示词');
                            return;
                          }
                          updateShot(shot.id, { status: 'generating' });
                          try {
                            const res = await api.gridShotSketch({
                              descriptionZh: shot.descriptionZh || '',
                              promptEn: shot.promptEn || undefined,
                              shotType: shot.shotType,
                              artStylePrompt: artStyleFromPrefs(),
                            });
                            updateShot(shot.id, {
                              firstFrameAssetId: res.url,
                              sketchSource: 'ai-single',
                              sketchPrompt: res.prompt,
                              status: 'review',
                            });
                            appendLog('单镜线稿生成完成');
                          } catch (e) {
                            updateShot(shot.id, { status: 'failed' });
                            appendLog(`AI 线稿失败: ${String(e)}`);
                          }
                        }}
                        className="flex items-center justify-center gap-1 text-xs rounded-lg border border-accent text-accent py-1.5 hover:bg-accent/5"
                      >
                        <Sparkles size={14} />
                        AI 线稿
                      </button>
                      {spawnBlockForShot && (
                        <button
                          type="button"
                          onClick={() => spawnBlockForShot(shot.id, 'sketch-pad', { linkedShotId: shot.id })}
                          className="flex items-center justify-center gap-1 text-xs rounded-lg border border-line py-1.5 hover:border-brand/40"
                          title="手绘分镜"
                        >
                          <Pencil size={14} />
                          手绘
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => void handleRenderShot()}
                      className="w-full flex items-center justify-center gap-1 text-xs rounded-lg border border-brand text-brand py-1.5 hover:bg-brand/5 disabled:opacity-40"
                    >
                      <Film size={14} />
                      导出单镜 MP4
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {tab === 'voice' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">角色音色</span>
              <button
                type="button"
                onClick={handleAddProfile}
                className="text-xs text-brand"
              >
                + 添加
              </button>
            </div>
            {voice.profiles.map((p) => (
              <div key={p.id} className="rounded-lg border border-line p-2 space-y-1.5">
                <div className="flex gap-2 items-center">
                  <input
                    className="flex-1 rounded border border-line px-2 py-1"
                    value={p.name}
                    onChange={(e) => addVoiceProfile({ ...p, name: e.target.value })}
                  />
                  <select
                    value={p.provider}
                    onChange={(e) =>
                      addVoiceProfile({
                        ...p,
                        provider: e.target.value as typeof p.provider,
                      })
                    }
                    className="rounded border border-line px-1 py-1 text-[10px]"
                  >
                    <option value="openai-compatible">云端</option>
                    <option value="luxtts">LuxTTS</option>
                    <option value="voicebox">Voicebox</option>
                  </select>
                </div>
                {p.provider === 'luxtts' ? (
                  <div className="space-y-1">
                    {p.referenceAudioAssetId ? (
                      <audio src={p.referenceAudioAssetId} controls className="w-full h-7" />
                    ) : (
                      <p className="text-[10px] text-ink/40">上传 ≥3s 参考音</p>
                    )}
                    <label className="text-[10px] text-brand cursor-pointer">
                      上传参考音
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          void api.uploadAsset(f).then((res) => {
                            addVoiceProfile({ ...p, referenceAudioAssetId: res.url, provider: 'luxtts' });
                          });
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <select
                    value={p.voiceId}
                    onChange={(e) => addVoiceProfile({ ...p, voiceId: e.target.value })}
                    className="w-full rounded border border-line px-1 py-1"
                  >
                    {['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {voice.lines.length === 0 ? (
              <p className="text-xs text-ink/50 text-center py-8">暂无台词，可手动添加或从剧本解析</p>
            ) : (
              voice.lines.map((line) => (
                <div key={line.id} className="rounded-lg border border-line p-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-brand">{line.speaker}</span>
                    <span className={STATUS_COLOR[line.status] ?? ''}>{line.status}</span>
                  </div>
                  <p>{line.text}</p>
                  {line.audioAssetId && (
                    <audio src={line.audioAssetId} controls className="w-full h-8" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-line">
            <button
              type="button"
              disabled={generatingVoice || voice.lines.length === 0}
              onClick={() => void handleGenerateVoiceBatch()}
              className="w-full rounded-xl bg-accent text-white text-sm py-2 disabled:opacity-50"
            >
              {generatingVoice ? '生成中…' : '批量生成配音'}
            </button>
            <button
              type="button"
              onClick={() => {
                const id = `vl-${Date.now()}`;
                useWorkspaceDocument.getState().addVoiceLines([
                  {
                    id,
                    speaker: voice.profiles[0]?.name ?? '旁白',
                    text: '示例台词',
                    voiceProfileId: voice.profiles[0]?.id ?? null,
                    status: 'pending',
                  },
                ]);
              }}
              className="w-full mt-2 text-xs text-ink/50 hover:text-brand"
            >
              + 添加示例台词
            </button>
          </div>
        </div>
      )}
      {shotMenu && (() => {
        const shot = storyboard.shots.find((s) => s.id === shotMenu.shotId);
        if (!shot) return null;
        return (
          <StoryboardShotMenu
            x={shotMenu.x}
            y={shotMenu.y}
            shot={shot}
            onClose={() => setShotMenu(null)}
            onApprove={() => handleApprove(shot.id)}
            onReject={() => handleReject(shot.id)}
            onLocate={() => {
              if (shot.linkedBlockId) focusBlock?.(shot.linkedBlockId);
              else appendLog('该镜头尚未关联画布模块');
            }}
            onRegenerate={(kind) => spawnBlockForShot?.(shot.id, kind)}
            onDelete={() => removeShot(shot.id)}
            onAiSketch={async (shotId) => {
              const s = storyboard.shots.find((sh) => sh.id === shotId);
              if (!s) return;
              if (!s.descriptionZh && !s.promptEn) {
                appendLog('请先填写画面描述或英文提示词');
                return;
              }
              updateShot(shotId, { status: 'generating' });
              try {
                const res = await api.gridShotSketch({
                  descriptionZh: s.descriptionZh || '',
                  promptEn: s.promptEn || undefined,
                  shotType: s.shotType,
                  artStylePrompt: artStyleFromPrefs(),
                });
                updateShot(shotId, { firstFrameAssetId: res.url, sketchSource: 'ai-single', sketchPrompt: res.prompt, status: 'review' });
                appendLog('AI 线稿生成完成');
              } catch (e) {
                updateShot(shotId, { status: 'failed' });
                appendLog(`AI 线稿失败: ${String(e)}`);
              }
            }}
            onUploadSketch={(shotId) => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/png,image/jpeg,image/jpg';
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) void api.uploadAsset(f).then((res) => {
                  updateShot(shotId, { firstFrameAssetId: res.url, sketchSource: 'upload', status: 'review' });
                });
              };
              input.click();
            }}
            onSpawnSketchPad={(shotId) => spawnBlockForShot?.(shotId, 'sketch-pad', { linkedShotId: shotId })}
            onSpawnDirector3d={(shotId) => spawnBlockForShot?.(shotId, 'director-3d', { linkedShotId: shotId })}
          />
        );
      })()}
    </aside>
  );
}
