export interface ViewportState {
    x: number;
    y: number;
    zoom: number;
}
export interface FlowBlock {
    id: string;
    type: string;
    position: {
        x: number;
        y: number;
    };
    data: Record<string, unknown>;
    width?: number;
    height?: number;
    selected?: boolean;
}
export interface FlowLink {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}
export interface WorkspacePayload {
    blocks: FlowBlock[];
    links: FlowLink[];
    viewport: ViewportState;
    nextBlockIndex?: number;
}
export interface WorkspaceSummary {
    id: string;
    title: string;
    blockCount: number;
    createdAt: number;
    updatedAt: number;
}
export interface WorkspaceExportEnvelope {
    schema: 'nx9-workspace-export';
    version: 1;
    exportedAt: number;
    workspace: WorkspacePayload;
}
