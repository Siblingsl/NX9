import type { PlaybookReadinessContext } from '../utils/playbook-readiness';

export interface NodeContract {
  kind: string;
  inputs: string[];
  outputs: string[];
  requiresSteps?: string[];
}

export const NODE_CONTRACTS: Record<string, NodeContract> = {
  'picture-gen': {
    kind: 'picture-gen',
    inputs: ['prompt'],
    outputs: ['picture'],
    requiresSteps: ['character-bible', 'environment-bible'],
  },
  'clip-gen': {
    kind: 'clip-gen',
    inputs: ['picture', 'prompt'],
    outputs: ['video'],
    requiresSteps: ['keyframe-gen', 'keyframe-review'],
  },
  'motion-story': {
    kind: 'motion-story',
    inputs: ['picture', 'camera'],
    outputs: ['video'],
    requiresSteps: ['keyframe-review'],
  },
  'director-3d': {
    kind: 'director-3d',
    inputs: ['shot-script'],
    outputs: ['camera'],
    requiresSteps: ['storyboard'],
  },
  'director-desk': {
    kind: 'director-desk',
    inputs: ['shot-script'],
    outputs: ['camera'],
    requiresSteps: ['storyboard'],
  },
  'continuity-check': {
    kind: 'continuity-check',
    inputs: ['video', 'picture'],
    outputs: ['report'],
    requiresSteps: ['video-gen'],
  },
  'export-pack': {
    kind: 'export-pack',
    inputs: ['video', 'audio'],
    outputs: ['package'],
    requiresSteps: ['keyframe-review'],
  },
};

export interface CanExecuteResult {
  ok: boolean;
  reason?: string;
}

export function canExecuteNode(
  kind: string,
  ctx: PlaybookReadinessContext,
): CanExecuteResult {
  const contract = NODE_CONTRACTS[kind];
  if (!contract) return { ok: true };

  if (contract.requiresSteps) {
    for (const stepId of contract.requiresSteps) {
      const ready = ctx.playbookSession
        ? ctx.playbookSession.completedStepIds.includes(stepId)
        : false;
      if (!ready) {
        return {
          ok: false,
          reason: `请先完成前置步骤（${stepId}）`,
        };
      }
    }
  }

  return { ok: true };
}
