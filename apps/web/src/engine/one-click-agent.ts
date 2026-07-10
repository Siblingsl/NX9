import { PLAYBOOK_DEFINITIONS, type PlaybookId } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';

export async function runOneClickAgent(playbookId: PlaybookId): Promise<void> {
  const doc = useWorkspaceDocument.getState();
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) return;

  const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === playbookId);
  if (!def) return;

  doc.startPlaybook(playbookId);

  const preSteps = def.steps.slice(0, 7);
  for (const step of preSteps) {
    const action = step.primaryAction;
    if (action.type === 'open_rail') {
      const { useContextRailUi } = await import('./stage-deck/stores/context-rail-ui');
      useContextRailUi.getState().requestTab(action.tab, action.sub
        ? { librarySub: action.sub as any }
        : undefined);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  doc.advancePlaybookStep();
}
