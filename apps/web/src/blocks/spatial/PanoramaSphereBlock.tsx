import { memo, useCallback, useRef } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Globe2, Upload } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { useDirector3dUi } from '../../stores/director3d-ui';
import { emptyDirectorProject, normalizeDirectorProject } from '@nx9/director3d';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function PanoramaSphereBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const openForBlock = useDirector3dUi((s) => s.openForBlock);
  const appendLog = useActivityLog((s) => s.append);
  const inputRef = useRef<HTMLInputElement>(null);
  const panoramaUrl =
    (props.data?.panoramaUrl as string) ||
    (props.data?.upstream as { pictures?: string[] })?.pictures?.[0];
  const status = props.data?.status as string | undefined;

  const upload = useCallback(
    async (file: File) => {
      updateNodeData(props.id, { status: 'running' });
      try {
        const res = await api.uploadAsset(file);
        updateNodeData(props.id, {
          status: 'success',
          panoramaUrl: res.url,
          previewUrl: res.url,
        });
        appendLog(`全景图已上传 · ${file.name}`);
      } catch (e) {
        updateNodeData(props.id, { status: 'error', error: String(e) });
      }
    },
    [props.id, updateNodeData, appendLog],
  );

  const openStage = useCallback(() => {
    if (!panoramaUrl) return;
    const base = normalizeDirectorProject(props.data?.scene) ?? emptyDirectorProject();
    openForBlock(props.id, {
      ...base,
      panorama: { url: panoramaUrl, yaw: 0, exposure: 1 },
    });
  }, [openForBlock, props.id, props.data, panoramaUrl]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-sm">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        {panoramaUrl ? (
          <img
            src={panoramaUrl}
            alt=""
            className="w-full rounded-xl border border-line aspect-[2/1] object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={status === 'running'}
            className="w-full flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-6 text-ink/50"
          >
            <Upload size={18} />
            上传 360° 全景
          </button>
        )}
        <button
          type="button"
          onClick={openStage}
          disabled={!panoramaUrl}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand text-white py-2 disabled:opacity-40"
        >
          <Globe2 size={16} />
          在 Stage Deck 中预演
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(PanoramaSphereBlock);
