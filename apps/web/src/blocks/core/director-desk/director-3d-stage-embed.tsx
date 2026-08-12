import type { Node } from '@xyflow/react';
import type { CharacterProfile } from '@nx9/shared';
import type { DirectorProject } from '@nx9/director3d';
import {
  Director3dHostController,
  type Director3dHostEdge,
} from '../../../engine/director3d-host-controller';

export interface Director3dStageEmbedProps {
  blockId: string;
  project: DirectorProject;
  linkedShotId?: string | null;
  characters: CharacterProfile[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  getNodes?: () => Node[];
  appendLog: (message: string) => void;
  focusShot: (shotId: string) => void;
  nodes: Node[];
  edges: Director3dHostEdge[];
}

/** 导演台 Tab 容器；不再自行解析 chain、线稿、scene 或 commit。 */
export function Director3dStageEmbed({
  blockId,
  project,
  linkedShotId,
  characters,
  updateNodeData,
  getNodes,
  appendLog,
  focusShot,
  nodes,
  edges,
}: Director3dStageEmbedProps) {
  return (
    <Director3dHostController
      contextBlockId={blockId}
      requestedShotId={linkedShotId}
      initialProject={project}
      nodes={nodes}
      edges={edges}
      getNodes={getNodes}
      updateNodeData={updateNodeData}
      characters={characters}
      appendLog={appendLog}
      onSelectShot={focusShot}
      performanceMode="normal"
      nodeCount={nodes.length}
      showAgentPose
    />
  );
}
