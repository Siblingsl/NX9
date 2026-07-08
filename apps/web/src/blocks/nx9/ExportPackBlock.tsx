import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import JSZip from 'jszip';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';

function ExportPackBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    sounds?: string[];
    prompts?: string[];
  } | undefined;
  const prefix = (props.data?.exportPrefix as string) ?? 'nx9-shot';
  const lastExport = props.data?.lastExportAt as string | undefined;

  const runExport = useCallback(async () => {
    const pictures = upstream?.pictures ?? [];
    const clips = upstream?.clips ?? [];
    const sounds = upstream?.sounds ?? [];
    if (pictures.length + clips.length + sounds.length === 0) {
      appendLog('交付打包：无上游媒体');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const zip = new JSZip();
      const manifest: { kind: string; path: string; url: string }[] = [];
      let i = 0;
      const fetchBlob = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`无法下载 ${url}`);
        return res.blob();
      };
      for (const url of pictures) {
        const name = `${prefix}-${String(++i).padStart(2, '0')}.jpg`;
        zip.file(name, await fetchBlob(url));
        manifest.push({ kind: 'picture', path: name, url });
      }
      for (const url of clips) {
        const name = `${prefix}-clip-${String(++i).padStart(2, '0')}.mp4`;
        zip.file(name, await fetchBlob(url));
        manifest.push({ kind: 'clip', path: name, url });
      }
      for (const url of sounds) {
        const name = `${prefix}-audio-${String(++i).padStart(2, '0')}.mp3`;
        zip.file(name, await fetchBlob(url));
        manifest.push({ kind: 'sound', path: name, url });
      }
      zip.file('manifest.json', JSON.stringify({ exportedAt: new Date().toISOString(), items: manifest }, null, 2));
      if (upstream?.prompts?.length) {
        zip.file('prompts.txt', upstream.prompts.join('\n\n---\n\n'));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${prefix}-pack.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      updateNodeData(props.id, {
        status: 'success',
        lastExportAt: new Date().toISOString(),
        exportCount: manifest.length,
      });
      appendLog(`交付打包完成 · ${manifest.length} 个文件`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`交付打包失败: ${String(e)}`);
    }
  }, [upstream, prefix, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <input
          value={prefix}
          onChange={(e) => updateNodeData(props.id, { exportPrefix: e.target.value })}
          placeholder="文件前缀"
          className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
        />
        <p className="text-[10px] text-ink/50">
          {upstream?.pictures?.length ?? 0} 图 · {upstream?.clips?.length ?? 0} 视频 ·{' '}
          {upstream?.sounds?.length ?? 0} 音频
        </p>
        {lastExport && (
          <p className="text-[10px] text-brand/70">上次导出 {new Date(lastExport).toLocaleString()}</p>
        )}
        <button type="button" onClick={() => void runExport()} className="w-full rounded-xl bg-brand text-white py-2">
          打包下载 ZIP
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(ExportPackBlock);
