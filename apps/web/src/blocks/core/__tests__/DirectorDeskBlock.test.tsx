/**
 * DirectorDeskBlock smoke test (F-022).
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

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

vi.mock('../../../stores/workspace-document', () => {
  const state = {
      storyboard: { shots: [], activeEpisodeId: null, episodes: [], title: '' },
      characters: { characters: [] },
      environments: { environments: [] },
    };
  const useWorkspaceDocument: any = (selector?: any) => selector ? selector(state) : state;
  useWorkspaceDocument.getState = () => state;
  return { useWorkspaceDocument };
});

vi.mock('../../shared/BlockShell', () => ({
  BlockShell: ({ children }: any) => <div data-testid="block-shell">{children}</div>,
}));

describe('DirectorDeskBlock', () => {
  it('renders without crashing', async () => {
    const DirectorDeskBlock = (await import('../DirectorDeskBlock')).default;
    const props = {
      id: 'test-desk-1',
      type: 'director-desk',
      data: {},
      position: { x: 0, y: 0 },
      selected: false,
      dragging: false,
      zIndex: 0,
    } as any;
    
    expect(() => {
      render(
        <ReactFlowProvider>
          <DirectorDeskBlock {...props} />
        </ReactFlowProvider>
      );
    }).not.toThrow();
  });
});
