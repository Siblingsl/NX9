import { memo, useCallback, useRef } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Upload } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

const ACCEPT = '.glb,.gltf,.obj,.fbx';

function MeshImportBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const inputRef = useRef<HTMLInputElement>(null);
  const meshUrl = props.data?.meshUrl as string | undefined;
  const fileName = props.data?.fileName as string | undefined;
  const status = props.data?.status as string | undefined;

  const onFile = useCallback(
    async (file: File) => {
      updateNodeData(props.id, { status: 'running' });
      try {
        const res = await api.uploadAsset(file);
        updateNodeData(props.id, {
          status: 'success',
          meshUrl: res.url,
          fileName: file.name,
          assetUrl: res.url,
        });
        appendLog(`3D 模型已上传 · ${file.name}`);
      } catch (e) {
        updateNodeData(props.id, { status: 'error', error: String(e) });
        appendLog(`3D 上传失败: ${String(e)}`);
      }
    },
    [props.id, updateNodeData, appendLog],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-sm">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === 'running'}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-ink/50 hover:border-brand/40 hover:text-brand"
        >
          <Upload size={18} />
          {status === 'running' ? '上传中…' : '选择 glb / obj / fbx'}
        </button>
        {fileName && <p className="text-[10px] text-ink/50 truncate">{fileName}</p>}
        {meshUrl && (
          <p className="text-[10px] text-brand truncate" title={meshUrl}>
            已就绪，可连至 3D 导演台或预览模块
          </p>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(MeshImportBlock);
