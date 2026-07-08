import { memo, useMemo, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { DoubleClickText } from '../shared/DoubleClickText';
import { EditableImage } from '../shared/EditableImage';
import { ImageEditModal } from '../shared/ImageEditModal';
import { useImageEditProduce } from '../shared/use-image-edit-produce';

function PreviewSinkBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const produce = useImageEditProduce(props.id);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  const livePrompt =
    (props.data?.previewPrompt as string) ||
    (props.data?.upstreamPrompt as string) ||
    '';
  const overrideText = (props.data?.outputText as string) ?? '';
  const displayText = overrideText || livePrompt;
  const isEdited = overrideText !== '' && overrideText !== livePrompt;

  const pictures = useMemo(() => {
    const fromPreview = (props.data?.previewPictures as string[]) ?? [];
    const single = props.data?.previewUrl as string | undefined;
    const asset = props.data?.assetUrl as string | undefined;
    const urls = [...fromPreview];
    if (single && !urls.includes(single)) urls.unshift(single);
    if (asset && !urls.includes(asset)) urls.push(asset);
    return urls.filter(Boolean);
  }, [props.data]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs nodrag nopan">
        {(displayText || isEdited) && (
          <DoubleClickText
            value={displayText}
            edited={isEdited}
            onSave={(text) => updateNodeData(props.id, { outputText: text })}
            onRestore={() => updateNodeData(props.id, { outputText: '' })}
          />
        )}
        {pictures.length > 0 && (
          <div className="space-y-2">
            {pictures.map((url) => (
              <EditableImage
                key={url}
                src={url}
                className="w-full rounded-lg max-h-40 object-cover border border-line"
                onEdit={() => setEditingUrl(url)}
              />
            ))}
          </div>
        )}
        {!displayText && pictures.length === 0 && (
          <p className="text-ink/50 text-center py-4">连接上游模块后预览</p>
        )}
      </div>

      {editingUrl && (
        <ImageEditModal
          srcUrl={editingUrl}
          onClose={() => setEditingUrl(null)}
          onProduce={produce}
        />
      )}
    </BlockShell>
  );
}

export default memo(PreviewSinkBlock);
