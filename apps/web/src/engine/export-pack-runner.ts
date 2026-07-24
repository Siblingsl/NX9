import JSZip from 'jszip';
import { api } from '../api/client';
import { useWorkspaceDocument } from '../stores/workspace-document';
import type { StoryboardShot } from '@nx9/shared';

export interface ExportPackInput {
  mode: 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle';
  prefix: string;
  audioUrl?: string;
  multiEpisode?: boolean;
  pictures: string[];
  clips: string[];
  sounds: string[];
  prompts: string[];
  shots: StoryboardShot[];
}

export interface ExportPackResult {
  ok: boolean;
  url?: string;
  taskId?: string;
  message?: string;
  exportCount?: number;
}

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

export async function runExportPack(input: ExportPackInput): Promise<ExportPackResult> {
  if (input.mode === 'ffmpeg-episode') {
    if (input.shots.length === 0) return { ok: false, message: '故事板无镜头' };
    const res = await api.concatEpisode({
      shots: input.shots,
      requireApproved: true,
      title: input.multiEpisode ? `${input.prefix}-multi-ep` : input.prefix,
      audioUrl: input.audioUrl?.trim() || undefined,
    });
    if (!res.ok) return { ok: false, message: res.message ?? res.status, url: undefined };
    return { ok: true, url: res.url, exportCount: 1 };
  }

  if (input.mode === 'hyperframes-episode') {
    const timeline = useWorkspaceDocument.getState().timelineDraft;
    if (!timeline) return { ok: false, message: '无时间线数据' };
    const res = await api.renderHyperframes({ timeline, templateId: 'nx9-vertical-episode' });
    return { ok: true, taskId: res.taskId, message: res.status };
  }

  if (input.mode === 'remotion-bundle') {
    const { timelineToRemotionStudioBundle } = await import('@nx9/shared');
    const timeline = useWorkspaceDocument.getState().timelineDraft;
    if (!timeline) return { ok: false, message: '无时间线数据' };
    const bundle = timelineToRemotionStudioBundle(timeline);
    const zip = new JSZip();
    for (const file of bundle.files) {
      zip.file(file.name, file.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = bundle.zipFilename || `${input.prefix}-remotion.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    return { ok: true, exportCount: bundle.files.length };
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
  // EP-P2-02: CSV 清单
  const csvHeader = 'kind,filename,url';
  const csvRows = manifest.map((m) => `"${m.kind}","${m.path}","${m.url}"`);
  zip.file('manifest.csv', [csvHeader, ...csvRows].join('\n'));
  if (input.prompts.length) {
    zip.file('prompts.txt', input.prompts.join('\n\n---\n\n'));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${input.prefix}-pack.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  return { ok: true, exportCount: manifest.length };
}
