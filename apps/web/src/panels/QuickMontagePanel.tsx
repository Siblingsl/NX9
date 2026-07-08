import { useCallback, useState } from 'react';
import { parseStoryboardMarkdown } from '@nx9/shared';
import { Clapperboard, Link2, Sparkles, X } from 'lucide-react';
import { api } from '../api/client';
import { useActivityLog } from '../stores/activity-log';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowCommands } from '../stores/flow-commands';
import { useStoryboardUi } from '../stores/flow-runtime';

export function QuickMontagePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(30);
  const [videoUrl, setVideoUrl] = useState('');
  const [replicateNotes, setReplicateNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const appendLog = useActivityLog((s) => s.append);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const setStoryboard = useWorkspaceDocument((s) => s.setStoryboard);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const requestLoad = useFlowCommands((s) => s.requestLoadTemplate);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);

  const importMarkdown = useCallback(
    (markdown: string, title?: string) => {
      const shots = parseStoryboardMarkdown(markdown);
      if (shots.length === 0) {
        appendLog('未能解析分镜表，请检查 Markdown 格式');
        return;
      }
      addShots(shots, 'append');
      if (title) setStoryboard({ ...storyboard, title });
      setStoryboardOpen(true);
      appendLog(`已导入 ${shots.length} 个镜头到故事板`);
    },
    [addShots, setStoryboard, storyboard, appendLog, setStoryboardOpen],
  );

  const runQuickMontage = useCallback(async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const res = await api.quickMontage(topic.trim(), duration);
      if (!res.ok) throw new Error('生成失败');
      importMarkdown(res.markdown, topic.trim());
      requestLoad('tpl-batch-pictures', 'merge');
      onClose();
    } catch (e) {
      appendLog(`智能成片失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [topic, duration, importMarkdown, requestLoad, onClose, appendLog]);

  const runReplicate = useCallback(async () => {
    if (!videoUrl.trim()) return;
    setLoading(true);
    try {
      const res = await api.replicateVideo(videoUrl.trim(), replicateNotes || undefined);
      if (res.storyboardMarkdown) importMarkdown(res.storyboardMarkdown, res.title);
      if (res.promptPack) appendLog(`风格包: ${res.promptPack.slice(0, 80)}…`);
      requestLoad('tpl-link-replicate', 'merge');
      onClose();
    } catch (e) {
      appendLog(`爆款复刻分析失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [videoUrl, replicateNotes, importMarkdown, requestLoad, onClose, appendLog]);

  if (!open) return null;

  return (
    <aside className="w-[340px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-20 shadow-panel">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <Sparkles size={18} className="text-warn" />
        <span className="font-semibold text-sm flex-1">智能创作台</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 nx9-scroll text-sm">
        <section className="rounded-2xl border border-line p-3 space-y-2">
          <div className="flex items-center gap-2 text-brand font-medium">
            <Clapperboard size={16} />
            智能成片（小云雀）
          </div>
          <p className="text-xs text-ink/50">一句话主题 → AI 分镜表 → 导入故事板 + 批量生图模板</p>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：咖啡馆新店开业探店短视频，温暖治愈风"
            className="w-full min-h-[72px] rounded-xl border border-line px-3 py-2 text-xs"
          />
          <label className="text-xs text-ink/60 flex items-center gap-2">
            时长
            <input
              type="number"
              min={15}
              max={120}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-20 rounded border border-line px-2 py-0.5"
            />
            秒
          </label>
          <button
            type="button"
            disabled={loading || !topic.trim()}
            onClick={() => void runQuickMontage()}
            className="w-full rounded-xl bg-brand text-white py-2 text-xs disabled:opacity-50"
          >
            {loading ? '生成中…' : '生成并导入'}
          </button>
        </section>

        <section className="rounded-2xl border border-line p-3 space-y-2">
          <div className="flex items-center gap-2 text-accent font-medium">
            <Link2 size={16} />
            爆款视频复刻
          </div>
          <p className="text-xs text-ink/50">粘贴抖音/小红书等链接，AI 拆解节奏与分镜结构（LibTV / 小云雀）</p>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl border border-line px-3 py-2 text-xs"
          />
          <input
            value={replicateNotes}
            onChange={(e) => setReplicateNotes(e.target.value)}
            placeholder="可选：你的素材/品牌说明"
            className="w-full rounded-xl border border-line px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={loading || !videoUrl.trim()}
            onClick={() => void runReplicate()}
            className="w-full rounded-xl bg-accent text-white py-2 text-xs disabled:opacity-50"
          >
            {loading ? '分析中…' : '分析并导入分镜'}
          </button>
        </section>
      </div>
    </aside>
  );
}
