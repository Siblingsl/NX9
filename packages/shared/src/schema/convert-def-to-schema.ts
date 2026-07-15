import type { PlaybookDefinition } from '../data/playbook-definitions';
import type { WorkflowSchemaV1 } from './workflow-schema';

export function playbookDefToSchema(def: PlaybookDefinition): WorkflowSchemaV1 {
  return {
    workflowId: def.id,
    mode: def.id === 'pb-ai-comic-3d' || def.id === 'pb-ai-comic-live' || def.id === 'pb-anime'
      ? 'core-6'
      : 'free',
    steps: def.steps.map((s) => ({
      id: s.id,
      title: s.shortLabel || s.label,
      icon: '',
      status: 'pending',
      dependencies: [],
      next: null,
      allowSkip: !!s.optional,
      required: !s.optional,
      component: s.canvasNodeKinds?.[0] ?? '',
      readinessKey: s.readinessKey,
    })),
    nodes: def.steps
      .filter((s) => s.stepIndex && s.canvasNodeKinds?.length)
      .map((s) => ({
        id: s.id,
        kind: s.canvasNodeKinds![0],
        stepId: s.id,
        col: (s.stepIndex ?? 1) - 1,
      })),
    edges: [],
    validations: {},
  };
}

export function schemaToJson(schema: WorkflowSchemaV1): string {
  return JSON.stringify(schema, null, 2);
}

export function jsonToSchema(json: string): WorkflowSchemaV1 {
  return JSON.parse(json) as WorkflowSchemaV1;
}
