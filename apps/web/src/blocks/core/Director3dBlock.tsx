import { memo, useCallback, useEffect, useMemo } from 'react';
import { Box, Maximize2 } from 'lucide-react';
import {
  DIRECTOR3D_NODE_SCHEMA_VERSION,
} from '@nx9/shared';
import {
  emptyDirectorProject,
  normalizeDirectorProject,
  type Director3dShotState,
} from '@nx9/director3d';
import {
  type NodeProps,
  useEdges,
  useNodes,
  useReactFlow,
} from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { NodeSummaryBody } from '../shared/NodeSummaryBody';
import {
  readDirector3dStorageState,
  resolveDirector3dHostContext,
} from '../../engine/director3d-host-controller';
import { openDirector3dStage } from '../../engine/director3d-open';

function latestCandidatePreview(
  states: Record<string, Director3dShotState>,
  activeShotId: string | null,
): string | undefined {
  const active = activeShotId ? states[activeShotId] : states.__standalone__;
  const selected = active?.candidates.find((candidate) => candidate.id === active.selectedCandidateId);
  if (selected?.imageUrl || selected?.localDataUrl) {
    return selected.imageUrl ?? selected.localDataUrl;
  }
  const candidates = Object.values(states)
    .flatMap((state) => state.candidates)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return candidates[0]?.imageUrl ?? candidates[0]?.localDataUrl;
}

/**
 * 独立 3D 导演台节点只负责身份、摘要和打开入口。
 * 编辑状态保存在自身 data；全屏编辑器由统一 3D host 承载。
 */
function Director3dBlock(props: NodeProps) {
  const nodes = useNodes();
  const edges = useEdges();
  const { updateNodeData } = useReactFlow();
  const data = (props.data ?? {}) as Record<string, unknown>;
  const host = useMemo(
    () =>
      resolveDirector3dHostContext({
        contextBlockId: props.id,
        nodes,
        edges,
      }),
    [edges, nodes, props.id],
  );
  const storage = useMemo(
    () => readDirector3dStorageState(host, nodes),
    [host, nodes],
  );
  const sceneByShot = storage.sceneByShot;
  const activeShotId = host.activeShotId;
  const activeShot = host.shots.find((shot) => shot.id === activeShotId);
  const candidateCount = Object.values(sceneByShot).reduce(
    (total, state) => total + state.candidates.length,
    0,
  );
  const committedCount = Object.values(sceneByShot).filter(
    (state) => Boolean(state.committedCandidateId),
  ).length;
  const previewUrl =
    latestCandidatePreview(sceneByShot, activeShotId) ??
    ((data.last3dCommit as { candidate?: { imageUrl?: string } } | undefined)?.candidate
      ?.imageUrl);

  useEffect(() => {
    if (data.schemaVersion === DIRECTOR3D_NODE_SCHEMA_VERSION) return;
    updateNodeData(props.id, {
      schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
      standaloneProject: normalizeDirectorProject(
        data.standaloneProject ?? data.scene ?? emptyDirectorProject(),
      ),
      sceneByShot,
      activeShotId,
    });
  }, [
    activeShotId,
    data.scene,
    data.schemaVersion,
    data.standaloneProject,
    props.id,
    sceneByShot,
    updateNodeData,
  ]);

  const openStage = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      if (activeShotId !== (data.linkedShotId as string | null | undefined)) {
        updateNodeData(props.id, {
          activeShotId,
          linkedShotId: activeShotId,
        });
      }
      openDirector3dStage({
        blockId: props.id,
        nodes,
        edges,
        updateNodeData: (id, patch) => updateNodeData(id, patch),
      });
    },
    [activeShotId, data.linkedShotId, edges, nodes, props.id, updateNodeData],
  );

  const connected = Boolean(host.sourceChainDeskId && host.chain);
  const summary = connected
    ? activeShot
      ? `#${activeShot.index} ${activeShot.descriptionZh || activeShot.promptEn || '未命名镜头'}`
      : '已连接链镜表，当前集暂无镜头'
    : '独立场景模式：可搭景、记录候选并保存模板';

  return (
    <BlockShell {...props}>
      <NodeSummaryBody
        mediaUrl={previewUrl}
        emptyLabel="双击打开 3D 舞台"
        onMediaDoubleClick={openStage}
        stats={[
          { value: connected ? host.shots.length : '—', label: '镜头' },
          { value: candidateCount, label: '候选' },
          { value: committedCount, label: '已提交', tone: committedCount > 0 ? 'ok' : 'default' },
        ]}
        tags={[connected ? '已连接' : '独立', activeShotId ? `镜 ${activeShotId}` : '场景']}
        summary={summary}
        summaryClickable
        onSummaryClick={openStage}
        statusLabel={connected ? '逐镜状态独立保存' : '未连接时禁止提交 chain'}
        primary={{
          label: '打开 3D',
          icon: <Box size={12} />,
          onClick: openStage,
        }}
        secondary={[
          {
            label: '全屏',
            icon: <Maximize2 size={12} />,
            iconOnly: true,
            onClick: openStage,
          },
        ]}
      />
    </BlockShell>
  );
}

export default memo(Director3dBlock);
