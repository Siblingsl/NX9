import { resolveAttachedWorkspace } from '@nx9/shared';
import { GenerationWorkspace } from './generation/GenerationWorkspace';
import { VideoWorkspace } from './generation/video/VideoWorkspace';
import { PictureWorkspace } from './generation/picture/PictureWorkspace';
import { PromptWorkspace } from './prompt/PromptWorkspace';
import { ToolWorkspace } from './tool/ToolWorkspace';
import { ReportWorkspace } from './report/ReportWorkspace';
import { ControlWorkspace } from './control/ControlWorkspace';
import { StoryboardPreviewWorkspace } from './storyboard-preview/StoryboardPreviewWorkspace';
import { Director3dWorkspace } from './director3d/Director3dWorkspace';

export interface AttachedWorkspaceRouterProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

/**
 * AttachedWorkspaceRouter — 按 workspaceType 路由到对应内容面板。
 * 渲染在 NodeAttachedPromptBar 内部（壳层不变）。
 */
export function AttachedWorkspaceRouter({ blockId, kind, onCollapse }: AttachedWorkspaceRouterProps) {
  const spec = resolveAttachedWorkspace(kind);

  if (!spec || spec.workspaceType === 'none') return null;

  switch (spec.workspaceType) {
    case 'generation':
      if (kind === 'prompt') {
        return <PromptWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'clip-gen') {
        return <VideoWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'picture-gen') {
        return <PictureWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return <GenerationWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'tool':
      return <ToolWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'report':
      return <ReportWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'control':
    case 'task':
      return <ControlWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'preview':
      if (kind === 'storyboard-preview') {
        return <StoryboardPreviewWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'director-3d') {
        return <Director3dWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return null;
    default:
      return null;
  }
}
