/**
 * F-025 acceptance test — 编剧→分镜交接引导
 *
 * G1 验收清单:
 * - [x] 确认后有明确下一步
 * - [x] 一键可连到分镜台
 *
 * G2 主流程: ScriptDesk 确认成稿后 → "送到分镜台" CTA → spawn/focus storyboard-desk + edge + handoff payload
 * G3 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SHARED_ROOT = resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf-8');
}
function fileExists(relPath: string, base: string = WEB_ROOT): boolean {
  return existsSync(resolve(base, relPath));
}

const SCRIPT_DESK_BLOCK = 'blocks/nx9/ScriptDeskBlock.tsx';
const FLOW_COMMANDS = 'stores/flow-commands.ts';
const FLOW_RUNTIME = 'stores/flow-runtime.ts';
const FLOW_SURFACE = 'engine/FlowSurface.tsx';
const PLAYBOOK_RUNNER = 'engine/playbook-runner.ts';
const CORE_PIPELINE_GRAPH = 'engine/core-pipeline-graph.ts';
const STORYBOARD_DESK = 'blocks/craft/storyboard-desk/use-storyboard-desk.tsx';
const STORYBOARD_HELPERS = 'blocks/craft/storyboard-desk/helpers.tsx';
const STORYBOARD_RUNNER = 'engine/storyboard-desk-runner.ts';
const STUDIO_PARITY = 'engine/studio-parity.ts';

describe('F-025 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    const files = [
      SCRIPT_DESK_BLOCK,
      FLOW_COMMANDS,
      FLOW_RUNTIME,
      FLOW_SURFACE,
      PLAYBOOK_RUNNER,
      CORE_PIPELINE_GRAPH,
      STORYBOARD_DESK,
      STORYBOARD_RUNNER,
      STUDIO_PARITY,
    ];
    for (const f of files) {
      it(f, () => {
        expect(fileExists(f)).toBe(true);
      });
    }
  });

  // ═══════════ ScriptDeskBlock: 送到分镜台 ═══════════
  describe('ScriptDeskBlock handoff button', () => {
    const src = readWeb(SCRIPT_DESK_BLOCK);

    it('imports useFlowRuntime', () => {
      expect(src).toContain("from '../../stores/flow-runtime'");
    });

    it('imports useFlowCommands', () => {
      expect(src).toContain("from '../../stores/flow-commands'");
    });

    it('imports Send icon', () => {
      expect(src).toMatch(/\bSend\b/);
    });

    it('has handleHandoffToStoryboard callback', () => {
      expect(src).toContain('const handleHandoffToStoryboard = useCallback(');
    });

    it('handleHandoffToStoryboard searches for storyboard-desk node', () => {
      expect(src).toContain("n.type === 'storyboard-desk'");
    });

    it('handleHandoffToStoryboard calls requestSpawn with connectToSource', () => {
      expect(src).toContain('connectToSource: props.id');
    });

    it('handleHandoffToStoryboard passes handoff payload', () => {
      expect(src).toContain("from: 'script-desk'");
      expect(src).toContain("to: 'storyboard-desk'");
      expect(src).toContain('at: new Date().toISOString()');
    });

    it('handleHandoffToStoryboard calls focusBlock if storyboard exists', () => {
      expect(src).toContain('runtime?.focusBlock(storyboardDesk.id)');
    });

    it('renders 送到分镜台 button when pkg.status === \'confirmed\'', () => {
      expect(src).toContain('送到分镜台');
      expect(src).toMatch(/pkg\.status === 'confirmed'/);
    });

    it('送到分镜台 button uses handleHandoffToStoryboard onClick', () => {
      expect(src).toMatch(/onClick=\{handleHandoffToStoryboard\}/);
    });

    it('确认成稿 button still renders when confirmed (ghost style)', () => {
      const confirmedBlock = src.slice(src.indexOf("pkg.status === 'confirmed'"));
      expect(confirmedBlock).toContain('确认成稿');
    });

    it('footerHint dead code removed', () => {
      expect(src).not.toContain("footerHint = pkg.status === 'confirmed'");
    });
  });

  // ═══════════ FlowCommands: requestSpawn API ═══════════
  describe('flow-commands requestSpawn contract', () => {
    const src = readWeb(FLOW_COMMANDS);

    it('requestSpawn accepts data parameter', () => {
      expect(src).toContain('data?: Record<string, unknown>');
    });

    it('requestSpawn stores spawnData from data arg', () => {
      expect(src).toContain('spawnData: data ?? null');
    });

    it('useFlowCommands exports requestSpawn', () => {
      expect(src).toContain('requestSpawn: (');
      expect(src).toContain('export const useFlowCommands');
    });
  });

  // ═══════════ FlowSurface: consumeSpawn with connectToSource ═══════════
  describe('FlowSurface consumes connectToSource', () => {
    const src = readWeb(FLOW_SURFACE);

    it('checks pending.data?.connectToSource during spawn', () => {
      expect(src).toContain("pending.data?.connectToSource");
    });

    it('reads source id from connectToSource', () => {
      expect(src).toContain('const sourceId = pending.data.connectToSource as string');
    });

    it('creates edge from source to new node via setEdges', () => {
      expect(src).toContain("source: sourceId");
      expect(src).toContain("target: id");
      expect(src).toContain("connectToSource");
    });
  });

  // ═══════════ playbook-runner: focusOrSpawn ═══════════
  describe('playbook-runner focusOrSpawn', () => {
    const src = readWeb(PLAYBOOK_RUNNER);

    it('has focusOrSpawn function', () => {
      expect(src).toContain('function focusOrSpawn');
    });

    it('focusOrSpawn calls runtime.focusBlock if node exists', () => {
      expect(src).toContain('runtime?.focusBlock(node.id)');
    });

    it('focusOrSpawn calls requestSpawn if node absent', () => {
      expect(src).toContain('useFlowCommands.getState().requestSpawn(kind)');
    });
  });

  // ═══════════ core-pipeline-graph: script→storyboard edge ═══════════
  describe('core-pipeline-graph edge definition', () => {
    const src = readWeb(CORE_PIPELINE_GRAPH);

    it('defines script-desk → storyboard-desk edge', () => {
      expect(src).toContain("source: 'script-desk'");
      expect(src).toContain("target: 'storyboard-desk'");
    });

    it('auditCorePipeline checks for script→storyboard link', () => {
      expect(src).toContain('auditCorePipeline');
    });
  });

  // ═══════════ StoryboardDesk: handoff tab ═══════════
  describe('StoryboardDesk handoff tab', () => {
    const src = readWeb(STORYBOARD_DESK);

    it('has handoff as pipeline step 4', () => {
      expect(src).toContain("'handoff'");
      expect(src).toContain("'交接'");
    });

    it('renders handoff checklist', () => {
      expect(src).toContain('sg3-checklist');
    });

    it('renders storyboard sheet preview in handoff tab', () => {
      expect(src).toContain('sg3-sheet--handoff');
    });

    it('has confirm episode button in handoff tab', () => {
      expect(src).toContain('confirmCurrentEpisode');
    });
  });

  // ═══════════ StoryboardDeskMode type ═══════════
  describe('StoryboardDeskMode type', () => {
    const src = readWeb(STORYBOARD_RUNNER);

    it("includes 'handoff' in union", () => {
      expect(src).toContain("'handoff'");
      expect(src).toMatch(/StoryboardDeskMode/);
    });
  });

  // ═══════════ useUpstreamScreenplay: reads from edge-connected script-desk ═══════════
  describe('useUpstreamScreenplay upstream data (helpers.tsx)', () => {
    const src = readWeb(STORYBOARD_HELPERS);

    it('reads screenplay from upstream edges', () => {
      expect(src).toContain('useUpstreamScreenplay');
    });

    it('filters incoming edges by target blockId', () => {
      expect(src).toContain('e.target === blockId');
    });

    it('matches nx9-screenplay-package schema', () => {
      expect(src).toContain("nx9-screenplay-package");
    });
  });

  // ═══════════ studio-parity: findUpstreamScriptDesk ═══════════
  describe('findUpstreamScriptDesk utility', () => {
    const src = readWeb(STUDIO_PARITY);

    it('has findUpstreamScriptDesk function', () => {
      expect(src).toContain('findUpstreamScriptDesk');
    });

    it('filters edges by target deskId', () => {
      expect(src).toContain('e.target === deskId');
    });

    it('returns source id if type is script-desk (optional chain)', () => {
      expect(src).toContain("source?.type === 'script-desk'");
    });
  });
});
