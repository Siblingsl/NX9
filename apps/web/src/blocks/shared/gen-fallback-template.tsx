import type { BacklotTemplateKind } from '@nx9/shared';
import { applyBacklotText } from './apply-backlot-text';
import { BacklotTemplatePicker, type BacklotTemplateApplyResult } from './backlot-template-picker';

interface GenFallbackTemplateProps {
  kinds: BacklotTemplateKind[];
  hasUpstream: boolean;
  content: string;
  contentKey?: 'content' | 'text';
  templateId?: string;
  templateLabel?: string;
  hint: string;
  onUpdate: (patch: Record<string, unknown>) => void;
}

export function GenFallbackTemplate({
  kinds,
  hasUpstream,
  content,
  contentKey = 'content',
  templateId,
  templateLabel,
  hint,
  onUpdate,
}: GenFallbackTemplateProps) {
  if (hasUpstream) return null;

  const handleApply = (result: BacklotTemplateApplyResult) => {
    onUpdate({
      [contentKey]: applyBacklotText(content, result.prompt, result.mode),
      backlotTemplateId: result.templateId,
      backlotTemplateLabel: result.templateLabel,
    });
  };

  return (
    <BacklotTemplatePicker
      kinds={kinds}
      selectedTemplateId={templateId}
      selectedTemplateLabel={templateLabel}
      hint={hint}
      onApply={handleApply}
      onClear={() =>
        onUpdate({
          backlotTemplateId: undefined,
          backlotTemplateLabel: undefined,
        })
      }
    />
  );
}
