import JSZip from 'jszip';
import { hasEffectiveTimeline, planEcomPackFiles, type TimelinePayload } from '@nx9/shared';
import { api } from '../api/client';
import type { StoryboardShot } from '@nx9/shared';

export interface ExportPackInput {
  mode: 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle' | 'ecom-pack';
  prefix: string;
  audioUrl?: string;
  multiEpisode?: boolean;
  pictures: string[];
  clips: string[];
  sounds: string[];
  prompts: string[];
  shots: StoryboardShot[];
  /** 来自本节点或上游智能剪辑的时间线（节点实例级，不读全局） */
  timeline?: TimelinePayload | null;
  selectedSpecs?: string[];
}

export interface ExportPackResult {
  ok: boolean;
  url?: string;
  taskId?: string;
  message?: string;
  exportCount?: number;
  /** 仅当已有可取货产物时为 true；提交即走的任务必须为 false */
  exportReady?: boolean;
}

const NO_TIMELINE_MSG = '无有效时间线（请先在智能剪辑编排并同步，clips≥1）';

async function fetchBlob(url: string): Promise<Blob> {
  if (url.startsWith('/media/')) {
    const res = await fetch(url);
    if (res.ok) return res.blob();
  }
  const proxied = await api.proxyDownload(url);
  if (!proxied.ok || !proxied.url) throw new Error(`代理下载失败 ${url}`);
  const res = await fetch(proxied.url);
  if (!res.ok) throw new Error(`无法下载 ${proxied.url}`);
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function runExportPack(input: ExportPackInput): Promise<ExportPackResult> {
  if (input.mode === 'ffmpeg-episode') {
    if (input.shots.length === 0) {
      return { ok: false, message: '无连接链镜表，无法导出成片', exportReady: false };
    }
    const res = await api.concatEpisode({
      shots: input.shots,
      requireApproved: true,
      title: input.multiEpisode ? `${input.prefix}-multi-ep` : input.prefix,
      audioUrl: input.audioUrl?.trim() || undefined,
    });
    if (!res.ok) return { ok: false, message: res.message ?? res.status, url: undefined, exportReady: false };
    return { ok: true, url: res.url, exportCount: 1, exportReady: true };
  }

  if (input.mode === 'hyperframes-episode') {
    if (!hasEffectiveTimeline(input.timeline)) {
      return { ok: false, message: NO_TIMELINE_MSG, exportReady: false };
    }
    const res = await api.renderHyperframes({
      timeline: input.timeline,
      templateId: 'nx9-vertical-episode',
    });
    if (!res.ok || !res.taskId) {
      return { ok: false, message: res.status || 'HyperFrames 提交失败', exportReady: false };
    }
    return { ok: true, taskId: res.taskId, message: 'submitted', exportReady: false };
  }

  if (input.mode === 'remotion-bundle') {
    if (!hasEffectiveTimeline(input.timeline)) {
      return { ok: false, message: NO_TIMELINE_MSG, exportReady: false };
    }
    const { timelineToRemotionStudioBundle } = await import('@nx9/shared');
    const bundle = timelineToRemotionStudioBundle(input.timeline!);
    const zip = new JSZip();
    for (const file of bundle.files) {
      zip.file(file.name, file.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(blob, bundle.zipFilename || `${input.prefix}-remotion.zip`);
    return { ok: true, exportCount: bundle.files.length, exportReady: true };
  }

  if (input.mode === 'ecom-pack') {
    const selected = input.selectedSpecs ?? [];
    if (selected.length === 0) return { ok: false, message: '请选择至少一个电商规格', exportReady: false };
    const plan = planEcomPackFiles({
      selectedSpecs: selected,
      pictures: input.pictures,
      clips: input.clips,
      prefix: input.prefix,
    });
    if (plan.files.length === 0) {
      const detail = plan.skipped.map((s) => `${s.specId}: ${s.reason}`).join('；') || '无匹配媒资';
      return { ok: false, message: `电商包无有效文件（${detail}）`, exportCount: 0, exportReady: false };
    }
    const ecomZip = new JSZip();
    let packed = 0;
    const failed: string[] = [];
    for (const file of plan.files) {
      try {
        const blob = await fetchBlob(file.sourceUrl);
        ecomZip.file(file.name, blob);
        packed += 1;
      } catch {
        failed.push(file.name);
      }
    }
    if (packed === 0) {
      return {
        ok: false,
        message: `电商包下载全部失败（${failed.length} 项）`,
        exportCount: 0,
        exportReady: false,
      };
    }
    const blob = await ecomZip.generateAsync({ type: 'blob' });
    triggerDownload(blob, `${input.prefix}-ecom-pack.zip`);
    const skipNote = plan.skipped.length > 0
      ? `；跳过 ${plan.skipped.length} 个规格`
      : '';
    const failNote = failed.length > 0 ? `；${failed.length} 个文件下载失败` : '';
    return {
      ok: true,
      exportCount: packed,
      exportReady: true,
      message: `已打包 ${packed} 个文件${skipNote}${failNote}`.trim() || undefined,
    };
  }

  const mediaCount = input.pictures.length + input.clips.length + input.sounds.length;
  if (mediaCount === 0) {
    return { ok: false, message: '无可导出的媒资', exportCount: 0, exportReady: false };
  }

  const zip = new JSZip();
  const manifest: { kind: string; path: string; url: string }[] = [];
  let i = 0;
  for (const url of input.pictures) {
    const name = `${input.prefix}-${String(++i).padStart(2, '0')}.jpg`;
    zip.file(name, await fetchBlob(url));
    manifest.push({ kind: 'picture', path: name, url });
  }
  for (const url of input.clips) {
    const name = `${input.prefix}-clip-${String(++i).padStart(2, '0')}.mp4`;
    zip.file(name, await fetchBlob(url));
    manifest.push({ kind: 'clip', path: name, url });
  }
  for (const url of input.sounds) {
    const name = `${input.prefix}-audio-${String(++i).padStart(2, '0')}.mp3`;
    zip.file(name, await fetchBlob(url));
    manifest.push({ kind: 'sound', path: name, url });
  }
  const manifestObj = { exportedAt: new Date().toISOString(), items: manifest };
  zip.file('manifest.json', JSON.stringify(manifestObj, null, 2));
  const csvHeader = 'kind,filename,url';
  const csvRows = manifest.map((m) => `"${m.kind}","${m.path}","${m.url}"`);
  zip.file('manifest.csv', [csvHeader, ...csvRows].join('\n'));
  if (input.prompts.length) {
    zip.file('prompts.txt', input.prompts.join('\n\n---\n\n'));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${input.prefix}-pack.zip`);
  return { ok: true, exportCount: manifest.length, exportReady: true };
}
