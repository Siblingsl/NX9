import type { StoryboardPayload, VoicePayload, WorkspacePreferences } from './storyboard';
import type { CharacterLibraryPayload } from './character';
import type { SoundLibraryPayload } from './sound-library';
import type { WorkspaceVisibility } from '../utils/workspace-utils';
import type { BacklotCustomPayload, BacklotWorkspacePayload } from '../data/backlot-templates';
import type { CanvasAppearance } from '../utils/canvas-theme';
import type { ScriptPlanPayload } from './script-plan';
import type { EnvironmentLibraryPayload } from './environment';
import type { PlaybookId } from '../data/playbook-definitions';
import type { ProjectMeta, ProjectStatus } from './project';
import { emptyStoryboard, emptyVoice, migrateStoryboardPayload } from './storyboard';
import { emptyCharacterLibrary } from './character';
import { emptySoundLibrary } from './sound-library';
import { emptyBacklotCustom, emptyBacklotWorkspace } from '../data/backlot-templates';
import { DEFAULT_CANVAS_APPEARANCE } from '../utils/canvas-theme';

export type PlaybookWorkflowStatus = 'idle' | 'running' | 'blocked' | 'done' | 'error';

/** 一集自己的流程进度；PlaybookSession 顶层字段始终投影当前集。 */
export interface EpisodePlaybookProgress {
  currentStepId: string;
  completedStepIds: string[];
  skippedStepIds: string[];
  failedStepIds: string[];
  waitingStepIds: string[];
  workflowStatus: PlaybookWorkflowStatus;
}

export interface PlaybookSession {
  playbookId: PlaybookId;
  startedAt: string;
  currentStepId: string;
  completedStepIds: string[];
  skippedStepIds?: string[];
  failedStepIds?: string[];
  waitingStepIds?: string[];
  workflowStatus?: PlaybookWorkflowStatus;
  /** 按 episodeId 保存；顶层进度字段保留为当前集投影，兼容旧界面和旧项目。 */
  episodeProgress?: Record<string, EpisodePlaybookProgress>;
  dismissed?: boolean;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface FlowBlock {
  id: string;
  type: string;
  position: { x: number; y: number };
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
  /** React Flow edge path type — default bezier when omitted */
  edgeType?: 'default' | 'straight' | 'step' | 'smoothstep' | 'simplebezier';
}

export type ViewMode = 'explore' | 'produce' | 'review';

export interface TakeRecord {
  id: string;
  blockId: string;
  assetUrl: string;
  thumbUrl?: string;
  picked: boolean;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface SceneGroupRecord {
  id: string;
  label: string;
  memberIds: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface LaneConfig {
  id: 'character' | 'scene' | 'generate' | 'output';
  label: string;
  y: number;
  height: number;
}

export interface WorkspacePayloadV2 {
  version?: 1 | 2;
  blocks: FlowBlock[];
  links: FlowLink[];
  viewport: ViewportState;
  nextBlockIndex?: number;
  storyboard?: StoryboardPayload;
  voice?: VoicePayload;
  characters?: CharacterLibraryPayload;
  soundLibrary?: SoundLibraryPayload;
  backlotCustom?: BacklotCustomPayload;
  backlotWorkspace?: BacklotWorkspacePayload;
  preferences?: WorkspacePreferences;
  canvasAppearance?: CanvasAppearance;
}

export interface WorkspacePayloadV3 extends Omit<WorkspacePayloadV2, 'version'> {
  version: 3;
  aliases?: Record<string, string>;
  lanes?: LaneConfig[];
  groups?: SceneGroupRecord[];
  takes?: TakeRecord[];
  viewMode?: ViewMode;
  scriptPlan?: ScriptPlanPayload;
  environments?: import('./environment').EnvironmentLibraryPayload;
  playbookSession?: PlaybookSession | null;
  projectStatus?: ProjectStatus;
  projectMeta?: ProjectMeta;
}

/** Workspace on disk — v1/v2 legacy or v3 Stage Deck */
export type WorkspacePayload = WorkspacePayloadV2 | WorkspacePayloadV3;

export function isWorkspaceV3(payload: WorkspacePayload): payload is WorkspacePayloadV3 {
  return payload.version === 3;
}

export function migrateV2ToV3(v2: WorkspacePayloadV2): WorkspacePayloadV3 {
  return {
    ...v2,
    version: 3,
    aliases: {},
    groups: [],
    takes: [],
    viewMode: 'explore',
  };
}

export interface WorkspaceSummary {
  id: string;
  title: string;
  blockCount: number;
  shotCount?: number;
  assetCount?: number;
  visibility?: WorkspaceVisibility;
  ownerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserSummary {
  id: string;
  name: string;
  email?: string | null;
  createdAt: number;
}

export interface UsageSummary {
  totalEvents: number;
  byKind: Record<string, number>;
  estimatedCostUnits: number;
  periodDays: number;
}

export interface WorkspaceExportEnvelope {
  schema: 'nx9-workspace-export';
  version: 2;
  exportedAt: number;
  workspace: WorkspacePayload;
}

export function normalizeWorkspacePayload(raw: Partial<WorkspacePayload>): WorkspacePayload {
  const storyboard = raw.storyboard ? migrateStoryboardPayload(raw.storyboard) : emptyStoryboard();
  const base: WorkspacePayloadV2 = {
    version: 2,
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    links: Array.isArray(raw.links) ? raw.links : [],
    viewport: raw.viewport ?? { x: 0, y: 0, zoom: 1 },
    nextBlockIndex: raw.nextBlockIndex ?? 1,
    storyboard,
    voice: raw.voice ?? emptyVoice(),
    characters: raw.characters ?? emptyCharacterLibrary(),
    soundLibrary: raw.soundLibrary ?? emptySoundLibrary(),
    backlotCustom: raw.backlotCustom ?? emptyBacklotCustom(),
    backlotWorkspace: raw.backlotWorkspace ?? emptyBacklotWorkspace(),
    preferences: raw.preferences ?? {},
    canvasAppearance: raw.canvasAppearance ?? DEFAULT_CANVAS_APPEARANCE,
  };
  const rawScriptPlan = (raw as any).scriptPlan as ScriptPlanPayload | undefined;
  if (raw.version === 3) {
    return {
      ...base,
      version: 3,
      aliases: raw.aliases ?? {},
      lanes: raw.lanes,
      groups: raw.groups ?? [],
      takes: raw.takes ?? [],
      viewMode: raw.viewMode ?? 'explore',
      scriptPlan: rawScriptPlan,
      environments: (raw as any).environments ?? undefined,
      playbookSession: (raw as any).playbookSession ?? null,
    };
  }
  return base;
}
