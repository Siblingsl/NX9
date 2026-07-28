/**
 * StoryboardDeskBlock smoke test (F-022).
 * 
 * 基本冒烟测试：确认组件可渲染不崩溃。
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

// Mock dependencies
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
    useReactFlow: () => ({
      updateNodeData: vi.fn(),
      getNodes: () => [],
      getEdges: () => [],
    }),
  };
});

vi.mock('../../../stores/workspace-document', () => ({
  useWorkspaceDocument: (selector?: any) => {
    const state = {
      storyboard: {
        title: '测试项目',
        activeEpisodeId: 'ep-1',
        episodes: [{ id: 'ep-1', index: 1, title: '第1集' }],
        shots: [],
        version: 3,
      },
      characters: { characters: [] },
      environments: { environments: [] },
      backlotWorkspace: { items: [] },
      scriptPlan: null,
      setStoryboard: vi.fn(),
      updateShot: vi.fn(),
      addShots: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../shared/BlockShell', () => ({
  BlockShell: ({ children }: any) => <div data-testid="block-shell">{children}</div>,
}));

describe('StoryboardDeskBlock', () => {
  it('renders without crashing', async () => {
    const StoryboardDeskBlock = (await import('../StoryboardDeskBlock')).default;
    const props = {
      id: 'test-desk-1',
      type: 'storyboard-desk',
      data: {},
      position: { x: 0, y: 0 },
      selected: false,
      dragging: false,
      zIndex: 0,
    } as any;
    
    expect(() => {
      render(
        <ReactFlowProvider>
          <StoryboardDeskBlock {...props} />
        </ReactFlowProvider>
      );
    }).not.toThrow();
  });
});
