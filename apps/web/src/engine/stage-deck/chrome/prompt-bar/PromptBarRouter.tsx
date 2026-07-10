import { isPromptBarKind } from '@nx9/shared';
import {
  GenBlockEditor,
  GenericPromptEditor,
  PromptBlockEditor,
  type PromptBarEditorProps,
} from './PromptBarEditors';

const GEN_KINDS = new Set([
  'picture-gen',
  'clip-gen',
  'sound-gen',
  'motion-story',
  'photo-speak',
  'music-gen',
  'inpaint-edit',
]);

export function PromptBarEditorRouter({ blockId, kind }: PromptBarEditorProps) {
  if (!isPromptBarKind(kind)) return null;
  if (kind === 'prompt') return <PromptBlockEditor blockId={blockId} kind={kind} />;
  if (GEN_KINDS.has(kind)) return <GenBlockEditor blockId={blockId} kind={kind} />;
  return <GenericPromptEditor blockId={blockId} kind={kind} />;
}
