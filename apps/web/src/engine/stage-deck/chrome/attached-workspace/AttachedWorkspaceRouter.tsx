import { resolveAttachedWorkspace } from '@nx9/shared';
import { GenerationWorkspace } from './generation/GenerationWorkspace';
import { VideoWorkspace } from './generation/video/VideoWorkspace';
import { PictureWorkspace } from './generation/picture/PictureWorkspace';
import { PromptWorkspace } from './prompt/PromptWorkspace';
import { ToolWorkspace } from './tool/ToolWorkspace';
import { LinkParserWorkspace } from './tool/LinkParserWorkspace';
import { GridComposeWorkspace } from './tool/GridComposeWorkspace';
import { ReferenceBoardWorkspace } from './tool/ReferenceBoardWorkspace';
import { LocalEnhanceWorkspace } from './tool/LocalEnhanceWorkspace';
import { ReportWorkspace } from './report/ReportWorkspace';
import { ControlWorkspace } from './control/ControlWorkspace';
import { IteratorWorkspace } from './control/IteratorWorkspace';
import { StoryboardPreviewWorkspace } from './storyboard-preview/StoryboardPreviewWorkspace';
import { ExportWorkspace } from './config/ExportWorkspace';
import { CaptionWorkspace } from './generation/CaptionWorkspace';
import { InpaintWorkspace } from './generation/InpaintWorkspace';

export interface AttachedWorkspaceRouterProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

/**
 * AttachedWorkspaceRouter — 按 workspaceType + kind 路由到对应内容面板。
 * 由节点下方底部跟随工作区（NodeAttachedPromptBar）挂载；禁止改成屏幕弹窗。
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
      if (kind === 'caption-asr') {
        return <CaptionWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'inpaint-edit') {
        return <InpaintWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return <GenerationWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'tool':
    case 'board':
      if (kind === 'link-parser') {
        return <LinkParserWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'grid-compose') {
        return <GridComposeWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'reference-board') {
        return <ReferenceBoardWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      if (kind === 'local-enhance') {
        return <LocalEnhanceWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return <ToolWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'report':
      return <ReportWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'table':
      return null;
    case 'config':
      if (kind === 'export-pack') {
        return <ExportWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return null;
    case 'control':
    case 'task':
      if (kind === 'iterator') {
        return <IteratorWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return <ControlWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
    case 'preview':
      if (kind === 'storyboard-preview' || kind === 'storyboard-desk') {
        return <StoryboardPreviewWorkspace blockId={blockId} kind={kind} onCollapse={onCollapse} />;
      }
      return null;
    default:
      return null;
  }
}
