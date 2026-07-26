import { PLAYBOOK_DEFINITIONS, type PlaybookId } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';
import { executeStepAction } from './playbook-runner';

export async function runOneClickAgent(playbookId: PlaybookId): Promise<void> {
  const doc = useWorkspaceDocument.getState();
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) return;

  const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === playbookId);
  if (!def) return;

  doc.startPlaybook(playbookId);

  const preSteps = def.steps.slice(0, 7);
  for (const step of preSteps) {
    executeStepAction(step.primaryAction, {
      storyboard: {
        title: doc.storyboard.title,
        activeEpisodeId: doc.storyboard.activeEpisodeId,
        shots: [],
      },
      voice: doc.voice,
      nodes: runtime.getNodes().map((n) => ({
        id: n.id,
        type: n.type ?? 'unknown',
        data: (n.data ?? {}) as Record<string, unknown>,
      })),
      playbookSession: doc.playbookSession ?? undefined,
    });
    await new Promise((r) => setTimeout(r, 100));
  }

  doc.advancePlaybookStep();
}
