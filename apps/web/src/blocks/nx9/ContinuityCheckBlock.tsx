import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Wand2 } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { NodeSummaryBody } from '../shared/NodeSummaryBody';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { api } from '../../api/client';
import { autoFixContinuityIssue } from '../../engine/inpaint-repair';
import { useActivityLog } from '../../stores/activity-log';
import { useFlowRuntime, useStoryboardUi } from '../../stores/flow-runtime';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useContextRailUi } from '../../engine/stage-deck/stores/context-rail-ui';
import '../../styles/stage-bible.css';

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
  const [reportOpen, setReportOpen] = useState(false);

  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    prompts?: string[];
  } | undefined;
  const report = (props.data?.continuityReport as string) ?? '';
  const issues = (props.data?.continuityIssues as string[] | undefined) ?? [];
  const status = (props.data?.status as string | undefined) ?? 'idle';

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
              {
                type: 'text',
                text: `检查 ${images.length} 个镜头的连贯性。上下文：${upstream?.prompts?.join(' ') ?? ''}`,
              },
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
      setReportOpen(true);
    } catch (e) {
      const partialText = `## 连贯性检查失败 (partial)\n\nLLM 调用中断：${String(e)}`;
      updateNodeData(props.id, {
        status: 'error',
        error: String(e),
        continuityReport: partialText,
        partialReport: partialText,
        continuityIssues: [],
      });
    }
  }, [upstream, storyboardShots, props.id, updateNodeData, appendLog]);

  const handleJumpToShot = useCallback(
    (issue: string) => {
      requestTab('storyboard');
      const matched =
        storyboardShots.find(
          (s) =>
            issue.includes(s.id) ||
            issue.includes(s.sceneCode ?? '') ||
            issue.includes(s.descriptionZh.slice(0, 10)),
        ) ?? storyboardShots[0];
      if (matched) {
        selectShot(matched.id);
        requestScrollToShot(matched.id);
        updateShot(matched.id, {});
        appendLog(`[连贯性] 跳转镜头 ${matched.sceneCode ?? matched.id}`);
      }
    },
    [storyboardShots, requestTab, selectShot, requestScrollToShot, updateShot, appendLog],
  );

  const handleRegenerate = useCallback(
    async (issue: string) => {
      const matched =
        storyboardShots.find(
          (s) =>
            issue.includes(s.id) ||
            issue.includes(s.sceneCode ?? '') ||
            issue.includes(s.descriptionZh.slice(0, 10)),
        ) ?? storyboardShots[0];
      if (matched?.linkedBlockId && runCascade) {
        await runCascade(matched.linkedBlockId);
        appendLog(`[连贯性] 重生成镜头 ${matched.sceneCode ?? matched.id}`);
      } else {
        requestTab('storyboard');
        appendLog(`[连贯性] 无关联节点，已打开分镜面板`);
      }
    },
    [storyboardShots, runCascade, requestTab, appendLog],
  );

  const picN = upstream?.pictures?.length ?? 0;
  const clipN = upstream?.clips?.length ?? 0;

  return (
    <BlockShell {...props}>
      <NodeSummaryBody
        emptyLabel="连贯性检查"
        stats={[
          { value: picN, label: '上游图' },
          {
            value: issues.length,
            label: '问题',
            tone: issues.length ? 'warn' : report ? 'ok' : 'default',
          },
        ]}
        summary={
          report
            ? issues.length
              ? `发现 ${issues.length} 项不一致，点击查看报告`
              : '检查完成，暂无明显问题'
            : `上游 ${picN} 图 · ${clipN} 视频 · 至少 2 张图可检`
        }
        summaryClickable={Boolean(report)}
        onSummaryClick={() => setReportOpen(true)}
        statusLabel={
          status === 'running' ? '检查中' : status === 'success' ? '已完成' : status === 'error' ? '失败' : '待运行'
        }
        secondary={
          report
            ? [
                {
                  label: '报告',
                  onClick: (e) => {
                    e.stopPropagation();
                    setReportOpen(true);
                  },
                },
              ]
            : []
        }
        primary={{
          label: status === 'running' ? '检查中' : '运行检查',
          loading: status === 'running',
          disabled: status === 'running',
          onClick: (e) => {
            e.stopPropagation();
            void runCheck();
          },
        }}
      />

      <ScreenModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="连贯性报告"
        subtitle={issues.length ? `${issues.length} 项问题` : '检查结果'}
        width={520}
        variant="stage"
      >
        <div className="sb">
          {report && (
            <p className="sb-hint" style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>
              {report}
            </p>
          )}
          {issues.length === 0 ? (
            <div className="sb-empty">暂无条目化问题</div>
          ) : (
            issues.map((issue, i) => (
              <div key={i} className="sb-panel">
                <p className="sb-section-title" style={{ fontSize: 12, fontWeight: 600 }}>
                  {issue}
                </p>
                <div className="sb-actions">
                  <button type="button" className="sb-btn is-sm" onClick={() => handleJumpToShot(issue)}>
                    跳转镜头
                  </button>
                  <button
                    type="button"
                    className="sb-btn is-sm"
                    onClick={() => void handleRegenerate(issue)}
                  >
                    重生成
                  </button>
                  <button
                    type="button"
                    className="sb-btn is-sm is-primary"
                    onClick={() => {
                      const matched =
                        storyboardShots.find(
                          (s) =>
                            issue.includes(s.id) ||
                            issue.includes(s.sceneCode ?? '') ||
                            issue.includes(s.descriptionZh.slice(0, 10)),
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
                  >
                    <Wand2 size={12} /> 自动修复
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScreenModal>
    </BlockShell>
  );
}

export default memo(ContinuityCheckBlock);
