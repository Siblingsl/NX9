import { Layers } from 'lucide-react';
import { useAssetLibraryModalUi } from '../../../../../stores/asset-library-modal-ui';

export function LibraryTemplatesSubPanel() {
  const openModal = useAssetLibraryModalUi((s) => s.setOpen);

  return (
    <div className="space-y-3 text-xs">
      <p className="text-[11px] text-ink/50 leading-relaxed">
        角色、场景、镜头、情绪、钩子与声音素材已统一到素材库管理。
      </p>
      <button
        type="button"
        onClick={() => openModal(true)}
        className="w-full flex items-center justify-center gap-1 rounded-xl bg-brand/10 text-brand border border-brand/20 py-2 hover:bg-brand/15"
      >
        <Layers size={14} />
        打开素材库
      </button>
    </div>
  );
}
