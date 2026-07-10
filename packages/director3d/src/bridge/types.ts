import type { DirectorProject } from '../schema/directorProject';

export type Director3dPerformanceMode = 'normal' | 'low';

export interface Director3dCapturePayload {
  dataUrl: string;
  imageUrl?: string;
  cameraPrompt?: string;
  cameraPosition?: [number, number, number];
  cameraRotation?: [number, number, number];
  cameraFov?: number;
  captureId: string;
}

export interface Director3dHostOptions {
  project: DirectorProject;
  linkedShotId?: string;
  performanceMode?: Director3dPerformanceMode;
  nodeCount?: number;
  crowdMax?: number;
  onProjectChange?: (project: DirectorProject) => void;
  onCapture?: (payload: Director3dCapturePayload) => void | Promise<void>;
  onUploadFile?: (file: File) => Promise<{ url: string; filename?: string }>;
  onSaveSceneTemplate?: (project: DirectorProject, label: string) => void;
  onClose?: () => void;
  onRendererReady?: (renderer: { dispose: () => void }) => void;
}

export interface Director3dMountHandle {
  dispose: () => void;
}
