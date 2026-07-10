import type { PlaybookStepDef } from '../data/playbook-definitions';
import { PLAYBOOK_DEFINITIONS } from '../data/playbook-definitions';
import type { PlaybookSession } from '../types/workspace';
import { readinessRegistry, type PlaybookReadinessContext } from './playbook-readiness';

export type StepVisualState = 'done' | 'current' | 'blocked' | 'future';

export function evaluateStepVisualState(
  step: PlaybookStepDef,
  index: number,
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): StepVisualState {
  const ready = readinessRegistry[step.readinessKey]?.(ctx) ?? false;
  const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
  const currentIdx = session.currentStepId && playbook
    ? playbook.steps.findIndex((s) => s.id === session.currentStepId)
    : 0;

  if (ready) return 'done';
  if (index === currentIdx) return 'current';
  if (index < currentIdx) return 'blocked';
  return 'future';
}

export function evaluateAllStepVisualStates(
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): Array<{ step: PlaybookStepDef; index: number; state: StepVisualState }> {
  const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
  if (!playbook) return [];
  return playbook.steps.map((step, index) => ({
    step,
    index,
    state: evaluateStepVisualState(step, index, session, ctx),
  }));
}
