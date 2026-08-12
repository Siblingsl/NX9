import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { Wand2 } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { NodeSummaryBody } from '../shared/NodeSummaryBody';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { api } from '../../api/client';
import { autoFixContinuityIssue } from '../../engine/inpaint-repair';
import { resolveShotsForBlock, resolveUpstreamChainDesk } from '../../engine/chain-storyboard-utils';
import {
  CONTINUITY_IMAGE_CAP,
  CONTINUITY_SYSTEM_PROMPT,
  buildContinuityUserText,
  resolveContinuityModel,
  sliceContinuityImages,
} from '../../engine/continuity-check-runner';
import { useActivityLog } from '../../stores/activity-log';
import { useFlowRuntime, useStoryboardUi } from '../../stores/flow-runtime';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import '../../styles/stage-bible.css';

function ContinuityCheckBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const runtime = useFlowRuntime((s) => s.runtime);
  const runCascade = runtime?.runCascade;
  const nodes = useNodes();
  const edges = useEdges();
  // 多链：只认连线上游分镜台，禁止全画布 find 第一个 desk
  const upstreamDeskId = useMemo(
    () => resolveUpstreamChainDesk(props.id, nodes, edges),
    [props.id, nodes, edges],
  );
  const storyboardShots = useMemo(
    () => resolveShotsForBlock(props.id, nodes, edges, false),
    [props.id, nodes, edges],
  );
  const focusUpstreamDesk = useCallback(() => {
    if (upstreamDeskId) {
      runtime?.focusBlock?.(upstreamDeskId);
      return true;
    }
    appendLog('[连贯性] 未找到连线上游分镜台');
    return false;
  }, [appendLog, runtime, upstreamDeskId]);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const selectShot = useStoryboardUi((s) => s.selectShot);
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
      const sliced = sliceContinuityImages(images);
      if (sliced.note) appendLog(`连贯性检查：${sliced.note}`);
      const llmBody: Record<string, unknown> = {
        messages: [
          { role: 'system', content: CONTINUITY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildContinuityUserText({
                  imageCount: images.length,
                  omitted: sliced.omitted,
                  context: upstream?.prompts?.join(' ') ?? '',
                }),
              },
              ...sliced.sent.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      };
      const continuityModel = resolveContinuityModel(
        (props.data ?? {}) as Record<string, unknown>,
      );
      if (continuityModel) llmBody.model = continuityModel;
      const res = await api.proxyLlm(llmBody);
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
        imagesChecked: images.length,
        imagesOmitted: sliced.omitted,
        continuityCapNote: sliced.note,
        meta: { issueCount: parsedIssues.length, checkedImages: images.length, omitted: sliced.omitted },
      });
      appendLog(`连贯性检查完成 · ${parsedIssues.length} 项${sliced.note ? ` · ${sliced.note}` : ''}`);
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
  }, [upstream, storyboardShots, props.data, props.id, updateNodeData, appendLog]);

  const handleJumpToShot = useCallback(
    (issue: string) => {
      const matched =
        storyboardShots.find(
          (s) =>
            issue.includes(s.id) ||
            issue.includes(s.sceneCode ?? '') ||
            issue.includes(s.descriptionZh.slice(0, 10)),
        ) ?? storyboardShots[0];
      if (matched) {
        selectShot(matched.id);
        updateShot(matched.id, {});
        if (focusUpstreamDesk()) {
          appendLog(`[连贯性] 跳转镜头 ${matched.sceneCode ?? matched.id} · 请打开分镜台`);
        }
      }
    },
    [storyboardShots, selectShot, updateShot, appendLog, focusUpstreamDesk],
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
        if (focusUpstreamDesk()) {
          appendLog(`[连贯性] 无关联节点，请用画布「分镜台」处理`);
        }
      }
    },
    [storyboardShots, runCascade, appendLog, focusUpstreamDesk],
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
            : `上游 ${picN} 图 · ${clipN} 视频 · 至少 2 张图可检${
                picN > CONTINUITY_IMAGE_CAP ? `（超出 ${CONTINUITY_IMAGE_CAP} 张将提示并截取）` : ''
              }`
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
