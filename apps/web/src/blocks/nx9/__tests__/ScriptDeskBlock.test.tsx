/**
 * ScriptDeskBlock smoke test (F-022).
 *
 * 基本冒烟测试：确认 ScriptDeskBlock 组件可渲染不崩溃。
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

// Mock @xyflow/react
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      updateNodeData: vi.fn(),
      fitView: vi.fn(),
      getNodes: () => [],
      getEdges: () => [],
    }),
    useNodes: () => [],
    useEdges: () => [],
    useNodesData: () => ({}),
  };
});

// Mock workspace document store
vi.mock('../../../stores/workspace-document', () => {
    const state = {
      storyboard: {
        title: '测试剧本',
        activeEpisodeId: 'ep-1',
        episodes: [{ id: 'ep-1', index: 1, title: '第1集' }],
        shots: [],
        version: 3,
      },
      characters: { characters: [] },
      environments: { environments: [] },
      backlotWorkspace: { items: [] },
      scriptPlan: null,
      scriptDeskDrafts: [],
      saveScriptDeskDraft: vi.fn(),
      trashScriptDeskSnapshot: vi.fn(),
      moveScriptDeskDraftToTrash: vi.fn(),
      getScriptDeskDraft: vi.fn(),
      upsertScriptDeskWorkingDraft: vi.fn(),
      renameScriptDeskDraft: vi.fn(),
      setStoryboard: vi.fn(),
      updateShot: vi.fn(),
      addShots: vi.fn(),
    };
    const useWorkspaceDocument: any = (selector?: any) => selector ? selector(state) : state;
    useWorkspaceDocument.getState = () => state;
    return { useWorkspaceDocument };
});

// Mock BlockShell
vi.mock('../../shared/BlockShell', () => ({
  BlockShell: ({ children }: any) => <div data-testid="block-shell">{children}</div>,
}));

// Mock asset readiness (used in ScriptDeskBlock)
vi.mock('../../../engine/asset-readiness', () => ({
  markScriptAssetReady: vi.fn(() => ({
    ready: true,
    source: 'bible',
    requiredCharacters: [],
    requiredScenes: [],
    missingCharacters: [],
    missingScenes: [],
  })),
  inspectBibleAssets: vi.fn(() => ({
    ready: true,
    source: 'bible',
    requiredCharacters: [],
    requiredScenes: [],
    missingCharacters: [],
    missingScenes: [],
  })),
}));

vi.mock('../../../components/asset/AssetReadinessPanel', () => ({
  AssetReadinessPanel: () => <div data-testid="asset-readiness-panel" />,
}));

vi.mock('../../../stores/asset-library-modal-ui', () => ({
  useAssetLibraryModalUi: (selector?: any) => {
    const state = { openAt: vi.fn(), setOpen: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

// Mock dev prompt overrides
vi.mock('../../../stores/dev-prompt-overrides', () => ({
  isDevPromptEnabled: () => false,
  useDevPromptOverrides: () => ({}),
}));

// Mock asset library items hook
vi.mock('../../../hooks/use-asset-library-items', () => ({
  useAllAssetLibraryItems: () => ({ privateItems: [], publicItems: [], allItems: [] }),
}));
// Mock connected LLM models so the smoke test does not call the settings API
vi.mock('../../../hooks/use-connected-llm-models', () => ({
  useConnectedLlmModels: () => ({
    options: [],
    connected: [],
    hasConnections: false,
    activeOption: undefined,
    llmModelLabel: '',
    selectModel: vi.fn(),
    openConnectionsSettings: vi.fn(),
  }),
}));

// Mock activity log store
vi.mock('../../../stores/activity-log', () => ({
  useActivityLog: () => ({ append: vi.fn() }),
}));

describe('ScriptDeskBlock', () => {
  it('renders without crashing', async () => {
    const ScriptDeskBlock = (await import('../ScriptDeskBlock')).default;
    const props = {
      id: 'test-script-1',
      type: 'script-desk',
      data: {},
      position: { x: 0, y: 0 },
      selected: false,
      dragging: false,
      zIndex: 0,
    } as any;

    expect(() => {
      render(
        <ReactFlowProvider>
          <ScriptDeskBlock {...props} />
        </ReactFlowProvider>
      );
    }).not.toThrow();
  });
});
