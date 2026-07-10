import type { PlaybookStepDef } from '../data/playbook-definitions';
import { PLAYBOOK_DEFINITIONS } from '../data/playbook-definitions';
import type { PlaybookSession } from '../types/workspace';
import type { StepStatus } from '../types/step-status';
import { readinessRegistry, type PlaybookReadinessContext } from './playbook-readiness';

export type StepVisualState = 'done' | 'current' | 'blocked' | 'future' | 'error' | 'waiting' | 'skipped';

export function mapStepStatus(
  step: PlaybookStepDef,
  index: number,
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): StepStatus {
  const state = evaluateStepVisualState(step, index, session, ctx);
  switch (state) {
    case 'done': return 'done';
    case 'current': return 'active';
    case 'blocked': return 'error';
    case 'error': return 'error';
    case 'waiting': return 'waiting';
    case 'skipped': return 'skipped';
    default: return 'pending';
  }
}

export function evaluateStepVisualState(
  step: PlaybookStepDef,
  index: number,
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): StepVisualState {
  const ready = readinessRegistry[step.readinessKey]?.(ctx) ?? false;
  const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
  if (!playbook) return 'future';
  const currentIdx = playbook.steps.findIndex((s) => s.id === session.currentStepId);
  const skippedSet = new Set(session.skippedStepIds ?? []);
  const errorSet = new Set(session.failedStepIds ?? []);
  const waitingSet = new Set(session.waitingStepIds ?? []);

  if (step.optional && skippedSet.has(step.id)) return 'skipped';
  if (ready) return 'done';
  if (index === currentIdx) return 'current';
  if (errorSet.has(step.id)) return 'error';
  if (index < currentIdx) return 'blocked';
  if (waitingSet.has(step.id)) return 'waiting';
  return 'future';
}

export function mapStepToStatus(
  step: PlaybookStepDef,
  index: number,
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): StepVisualState {
  return evaluateStepVisualState(step, index, session, ctx);
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
