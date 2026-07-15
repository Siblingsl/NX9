import type { StepStatus } from '../types/step-status';

export interface WorkflowSchemaV1 {
  workflowId: string;
  mode: 'core-6' | 'free';
  steps: Array<{
    id: string;
    title: string;
    icon: string;
    status: StepStatus;
    dependencies: string[];
    next?: string | null;
    allowSkip?: boolean;
    required?: boolean;
    component: string;
    readinessKey: string;
  }>;
  nodes: Array<{ id: string; kind: string; stepId: string; col: number }>;
  edges: Array<{ from: string; to: string }>;
  validations: Record<string, string>;
}
