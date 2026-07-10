import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Wand2 } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { autoFixContinuityIssue } from '../../engine/inpaint-repair';
import { useActivityLog } from '../../stores/activity-log';
import { useFlowRuntime, useStoryboardUi } from '../../stores/flow-runtime';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useContextRailUi } from '../../engine/stage-deck/stores/context-rail-ui';

function ContinuityCheckBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const runtime = useFlowRuntime((s) => s.runtime);
  const runCascade = runtime?.runCascade;
  const storyboardShots = useWorkspaceDocument((s) => s.storyboard.shots);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const requestTab = useContextRailUi((s) => s.requestTab);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const requestScrollToShot = useStoryboardUi((s) => s.requestScrollToShot);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    prompts?: string[];
  } | undefined;
  const report = (props.data?.continuityReport as string) ?? '';
  const issues = (props.data?.continuityIssues as string[] | undefined) ?? [];

  const runCheck = useCallback(async () => {
    const shotImages = storyboardShots
      .filter((s) => s.firstFrameAssetId)
      .map((s) => s.firstFrameAssetId!);
    const images = upstream?.pictures?.length ? upstream.pictures : shotImages;
    if (images.length < 2) {
      appendLog('连贯性检查：至少需要 2 张图像（上游图片或故事板线稿）');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.proxyLlm({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              '你是分镜 continuity supervisor。对比多张镜头静帧，列出服装、光影、轴线、道具不一致之处。输出 JSON: {"summary":"...","issues":["..."]}',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `检查 ${images.length} 个镜头的连贯性。上下文：${upstream?.prompts?.join(' ') ?? ''}` },
              ...images.slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      });
      const raw = (res as { content?: string }).content ?? JSON.stringify(res);
      let summary = raw;
      let parsedIssues: string[] = [];
      try {
        const json = JSON.parse(raw) as { summary?: string; issues?: string[] };
        summary = json.summary ?? raw;
        parsedIssues = json.issues ?? [];
      } catch {
        parsedIssues = raw.split('\n').filter((l) => l.trim().startsWith('-'));
      }
      updateNodeData(props.id, {
        status: 'success',
        continuityReport: summary,
        continuityIssues: parsedIssues,
        content: summary,
        meta: { issueCount: parsedIssues.length, checkedImages: images.length },
      });
      appendLog(`连贯性检查完成 · ${parsedIssues.length} 项`);
    } catch (e) {
      const partialText = `## 连贯性检查失败 (partial)\n\nLLM 调用中断：${String(e)}\n\n建议：检查 API key 与网络连通性；分段对比可手动检查服装/光影/道具是否一致。`;
      updateNodeData(props.id, {
        status: 'error',
        error: String(e),
        continuityReport: partialText,
        partialReport: partialText,
        continuityIssues: [],
      });
    }
  }, [upstream, storyboardShots, props.id, updateNodeData, appendLog]);

  const handleJumpToShot = useCallback((issue: string) => {
    requestTab('storyboard');
    const matched = storyboardShots.find(
      (s) => issue.includes(s.id) || issue.includes(s.sceneCode ?? '') || issue.includes(s.descriptionZh.slice(0, 10)),
    ) ?? storyboardShots[0];
    if (matched) {
      selectShot(matched.id);
      requestScrollToShot(matched.id);
      updateShot(matched.id, {});
      appendLog(`[连贯性] 跳转镜头 ${matched.sceneCode ?? matched.id}`);
    }
  }, [storyboardShots, requestTab, selectShot, requestScrollToShot, updateShot, appendLog]);

  const handleRegenerate = useCallback(async (issue: string) => {
    const matched = storyboardShots.find(
      (s) => issue.includes(s.id) || issue.includes(s.sceneCode ?? '') || issue.includes(s.descriptionZh.slice(0, 10)),
    ) ?? storyboardShots[0];
    if (matched?.linkedBlockId && runCascade) {
      await runCascade(matched.linkedBlockId);
      appendLog(`[连贯性] 重生成镜头 ${matched.sceneCode ?? matched.id}`);
    } else {
      requestTab('storyboard');
      appendLog(`[连贯性] 无关联节点，已打开分镜面板`);
    }
  }, [storyboardShots, runCascade, requestTab, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-[10px] text-ink/50">
          上游 {upstream?.pictures?.length ?? 0} 图 · {upstream?.clips?.length ?? 0} 视频
        </p>
        <button type="button" onClick={() => void runCheck()} className="w-full rounded-xl bg-brand text-white py-2">
          运行连贯性检查
        </button>
        {report && (
          <details className="bg-surface rounded-lg border border-line">
            <summary className="px-2 py-1 text-[10px] text-ink/70 cursor-pointer hover:text-ink">
              {issues.length > 0 ? `发现 ${issues.length} 项问题` : '查看报告'}
            </summary>
            <div className="px-2 pb-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-32 overflow-y-auto nx9-scroll">
              {report}
              {issues.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {issues.slice(0, 8).map((issue, i) => (
                    <li key={i} className="flex items-start gap-1 text-warn">
                      <span className="flex-1 cursor-pointer hover:text-red-700 hover:underline">
                        {issue}
                      </span>
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleJumpToShot(issue)}
                          className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink/60 hover:text-ink hover:bg-surface"
                        >
                          跳转镜头
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRegenerate(issue)}
                          className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand hover:bg-brand/20"
                        >
                          重生成
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const matched = storyboardShots.find(
                              (s) => issue.includes(s.id) || issue.includes(s.sceneCode ?? '') || issue.includes(s.descriptionZh.slice(0, 10)),
                            ) ?? storyboardShots[0];
                            void autoFixContinuityIssue({
                              shotId: matched?.id ?? '',
                              imageUrl: matched?.firstFrameAssetId ?? '',
                              issueDescription: issue,
                            }).then((res) => {
                              if (res.ok) appendLog(`自动修复完成: ${res.repairedUrl}`);
                              else appendLog(`修复失败: ${res.message}`);
                            });
                          }}
                          className="text-[10px] flex items-center gap-0.5 text-green-600/70 hover:text-green-600 shrink-0"
                        >
                          <Wand2 size={8} /> 自动修复
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(ContinuityCheckBlock);
