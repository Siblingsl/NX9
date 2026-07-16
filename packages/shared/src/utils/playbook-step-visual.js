import { PLAYBOOK_DEFINITIONS } from '../data/playbook-definitions';
import { readinessRegistry } from './playbook-readiness';
export function mapStepStatus(step, index, session, ctx) {
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
export function evaluateStepVisualState(step, index, session, ctx) {
    const ready = readinessRegistry[step.readinessKey]?.(ctx) ?? false;
    const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
    if (!playbook)
        return 'future';
    const currentIdx = playbook.steps.findIndex((s) => s.id === session.currentStepId);
    const skippedSet = new Set(session.skippedStepIds ?? []);
    const errorSet = new Set(session.failedStepIds ?? []);
    const waitingSet = new Set(session.waitingStepIds ?? []);
    if (step.optional && skippedSet.has(step.id))
        return 'skipped';
    if (ready)
        return 'done';
    if (index === currentIdx)
        return 'current';
    if (errorSet.has(step.id))
        return 'error';
    if (index < currentIdx)
        return 'blocked';
    if (waitingSet.has(step.id))
        return 'waiting';
    return 'future';
}
export function mapStepToStatus(step, index, session, ctx) {
    return evaluateStepVisualState(step, index, session, ctx);
}
export function evaluateAllStepVisualStates(session, ctx) {
    const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
    if (!playbook)
        return [];
    return playbook.steps.map((step, index) => ({
        step,
        index,
        state: evaluateStepVisualState(step, index, session, ctx),
    }));
}
