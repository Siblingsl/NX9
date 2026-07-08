import type { DirectorProject } from '../schema/directorProject';

export type Director3dPerformanceMode = 'normal' | 'low';

export interface Director3dCapturePayload {
  dataUrl: string;
  imageUrl?: string;
  cameraPrompt?: string;
  captureId: string;
}

export interface Director3dHostOptions {
  project: DirectorProject;
  linkedShotId?: string;
  performanceMode?: Director3dPerformanceMode;
  onProjectChange?: (project: DirectorProject) => void;
  onCapture?: (payload: Director3dCapturePayload) => void | Promise<void>;
  onUploadFile?: (file: File) => Promise<{ url: string; filename?: string }>;
  onSaveSceneTemplate?: (project: DirectorProject, label: string) => void;
  onClose?: () => void;
}

export interface Director3dMountHandle {
  dispose: () => void;
}
