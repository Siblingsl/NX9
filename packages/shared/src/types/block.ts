export type BlockCategory =
  | 'source'
  | 'generate'
  | 'hub'
  | 'integrate'
  | 'craft'
  | 'utility'
  | 'support'
  | 'spatial';

export interface BlockDefinition {
  kind: string;
  label: string;
  category: BlockCategory;
  hint: string;
  glyph: string;
  accent: string;
  /** Hidden from Dock / LensMenu but kept for old workspace load */
  concealed?: boolean;
  /** Removed from spawn UI; kept in catalog for render + migration (§9.6) */
  deprecated?: boolean;
  /** NX9-differentiated module — prioritize in Dock / Recipes (§9.1) */
  nx9Native?: boolean;
}

export type SocketKind =
  | 'prompt'
  | 'picture'
  | 'clip'
  | 'sound'
  | 'mesh'
  | 'meta'
  | 'param'
  | 'wildcard';

export interface SocketProfile {
  accepts: SocketKind[];
  emits: SocketKind[];
}
