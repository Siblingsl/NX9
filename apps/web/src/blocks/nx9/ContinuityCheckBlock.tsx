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
  parseContinuityLlmJson,
  resolveContinuityModel,
  sliceContinuityImages,
} from '../../engine/continuity-check-runner';
import { resolveRunLabel } from '@nx9/shared';
import { useActivityLog } from '../../stores/activity-log';
import { toastError } from '../../stores/toast';
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
    appendLog('[连贯性] 未找到连线上游分镜台，禁止空成功');
    toastError('[连贯性] 未找到连线上游分镜台，禁止空成功');
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
  const parseFailed = Boolean(props.data?.continuityParseFailed);
  const status = (props.data?.status as string | undefined) ?? 'idle';

  const runCheck = useCallback(async () => {
    const shotImages = storyboardShots
      .filter((s) => s.firstFrameAssetId)
      .map((s) => s.firstFrameAssetId!);
    const images = upstream?.pictures?.length ? upstream.pictures : shotImages;
    if (images.length < 2) {
      const msg = '连贯性检查：至少需要 2 张图像（上游图片或故事板线稿），禁止空成功';
      updateNodeData(props.id, { status: 'error', error: msg });
      appendLog(msg);
      toastError(msg);
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
      // DR-04：与画布 Run 共用 parseContinuityLlmJson，禁止裸 JSON.parse 丢围栏 / 假零问题
      const parsed = parseContinuityLlmJson(raw);
      const summary =
        parsed.summary?.trim() ||
        (parsed.parseFailed ? 'LLM 返回无法解析为结构化报告，已保留原文' : raw);
      const parsedIssues = parsed.issues.map((issue) => issue.message);
      updateNodeData(props.id, {
        // 解析失败禁止假绿：保留原文，status=error
        status: parsed.parseFailed ? 'error' : 'success',
        continuityReport: parsed.parseFailed ? raw : summary,
        continuityIssues: parsedIssues,
        continuityIssueRefs: parsed.issues,
        continuityParseFailed: parsed.parseFailed || undefined,
        content: parsed.parseFailed ? raw : summary,
        error: parsed.parseFailed ? '连贯性检查解析失败，禁止空成功' : undefined,
        imagesChecked: images.length,
        imagesOmitted: sliced.omitted,
        continuityCapNote: sliced.note,
        meta: {
          issueCount: parsedIssues.length,
          checkedImages: images.length,
          omitted: sliced.omitted,
          parseFailed: parsed.parseFailed,
        },
      });
      appendLog(
        parsed.parseFailed
          ? '连贯性检查：LLM 返回无法解析为 JSON，已保留原文报告（禁止空成功）'
          : `连贯性检查完成 · ${parsedIssues.length} 项${sliced.note ? ` · ${sliced.note}` : ''}`,
      );
      if (parsed.parseFailed) {
        toastError('连贯性检查解析失败，禁止空成功');
      }
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
      toastError(`连贯性检查失败: ${String(e)}`);
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
            tone: parseFailed ? 'warn' : issues.length ? 'warn' : report ? 'ok' : 'default',
          },
        ]}
        summary={
          report
            ? parseFailed
              ? 'LLM 返回未能结构化解析 · 已保留原文（未假装零问题）'
              : issues.length
                ? `发现 ${issues.length} 项不一致，点击查看报告`
                : '检查完成，暂无明显问题'
            : `上游 ${picN} 图 · ${clipN} 视频 · 至少 2 张图可检${
                picN > CONTINUITY_IMAGE_CAP ? `（超出 ${CONTINUITY_IMAGE_CAP} 张将提示并截取）` : ''
              }`
        }
        summaryClickable={Boolean(report)}
        onSummaryClick={() => setReportOpen(true)}
        statusLabel={
          status === 'running'
            ? '检查中'
            : parseFailed
              ? '解析失败'
              : status === 'success'
                ? '已完成'
                : status === 'error'
                  ? '失败'
                  : '待运行'
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
          label: resolveRunLabel('continuity-check', status).primary,
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
        subtitle={
          parseFailed
            ? '解析失败 · 原文报告'
            : issues.length
              ? `${issues.length} 项问题`
              : '检查结果'
        }
        width={520}
        variant="stage"
      >
        <div className="sb">
          {parseFailed && (
            <p className="sb-hint" style={{ marginBottom: 10, color: 'var(--nx9-warn, #b45309)' }}>
              未能解析为结构化 issues；下方为 LLM 原文。请勿当作「零问题」通过。
            </p>
          )}
          {report && (
            <p className="sb-hint" style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>
              {report}
            </p>
          )}
          {issues.length === 0 ? (
            <div className="sb-empty">{parseFailed ? '无条目化问题（解析失败）' : '暂无条目化问题'}</div>
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
                        else {
                          appendLog(`修复失败: ${res.message}`);
                          toastError(`连贯性修复失败: ${res.message}`);
                        }
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
