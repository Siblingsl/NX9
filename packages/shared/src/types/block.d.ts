export type BlockCategory = 'source' | 'generate' | 'hub' | 'integrate' | 'craft' | 'utility' | 'support' | 'spatial';
export interface BlockDefinition {
    kind: string;
    label: string;
    category: BlockCategory;
    hint: string;
    glyph: string;
    accent: string;
    concealed?: boolean;
}
export type SocketKind = 'prompt' | 'picture' | 'clip' | 'sound' | 'mesh' | 'meta' | 'param' | 'wildcard';
export interface SocketProfile {
    accepts: SocketKind[];
    emits: SocketKind[];
}
