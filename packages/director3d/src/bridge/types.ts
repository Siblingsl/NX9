import type {
  Director3dCommitPayload,
  Director3dSceneTemplate,
  Director3dShotState,
  DirectorProject,
} from '../schema/directorProject';

export type Director3dPerformanceMode = 'normal' | 'low';

export interface Director3dCapturePayload {
  dataUrl: string;
  imageUrl?: string;
  cameraPrompt?: string;
  cameraPosition?: [number, number, number];
  cameraRotation?: [number, number, number];
  cameraFov?: number;
  captureId: string;
  shotId: string;
  stateVersion: number;
}

export interface Director3dShotListItem {
  id: string;
  index: number;
  label?: string;
  episodeId?: string | null;
  status?: string;
  has3dGuide?: boolean;
  lineArtUrl?: string;
}

export interface Director3dShotContext {
  shotId?: string;
  episodeId?: string | null;
  sourceChainDeskId?: string;
  sourceShotRevision?: number;
  sourceLabel?: string;
  episodeLabel?: string;
  lineArtUrl?: string;
  confirmed?: boolean;
  upstreamConnected: boolean;
  shots?: Director3dShotListItem[];
}

export interface Director3dHostOptions {
  project: DirectorProject;
  shotState?: Director3dShotState;
  shotContext?: Director3dShotContext;
  performanceMode?: Director3dPerformanceMode;
  nodeCount?: number;
  crowdMax?: number;
  onShotStateChange?: (state: Director3dShotState) => void;
  onSelectShot?: (shotId: string) => void;
  onCandidateCreated?: (payload: Director3dCapturePayload) => void | Promise<{ imageUrl?: string } | void>;
  onCommit?: (payload: Director3dCommitPayload) => void | Promise<void>;
  onProjectChange?: (project: DirectorProject) => void;
  onUploadFile?: (file: File) => Promise<{ url: string; filename?: string }>;
  onSaveSceneTemplate?: (template: Director3dSceneTemplate) => void;
  onClose?: () => void;
  onRendererReady?: (renderer: { dispose: () => void }) => void;
}

export interface Director3dMountHandle {
  dispose: () => void;
}
