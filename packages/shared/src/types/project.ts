export type ProjectStatus = 'draft' | 'generating' | 'paused' | 'completed' | 'exported' | 'archived';

export interface ProjectMeta {
  projectStatus: ProjectStatus;
  createdAt?: string;
  updatedAt?: string;
  exportedAt?: string;
}
