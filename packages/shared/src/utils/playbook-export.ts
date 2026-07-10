import type { PlaybookSession } from '../types/workspace';
import type { ScriptPlanPayload } from '../types/script-plan';

export function exportPlaybookSessionJson(session: PlaybookSession, scriptPlan?: ScriptPlanPayload): Blob {
  const data = {
    schema: 'nx9-playbook-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    playbookSession: session,
    scriptPlan,
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
