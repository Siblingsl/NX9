import { memo } from 'react';

interface EditableImageProps {
  src: string;
  alt?: string;
  className?: string;
  title?: string;
  onEdit: () => void;
}

export const EditableImage = memo(function EditableImage({
  src,
  alt = '',
  className = '',
  title = '双击编辑（裁剪 / 宫格切分）',
  onEdit,
}: EditableImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`nodrag nopan cursor-pointer ${className}`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      title={title}
    />
  );
});
