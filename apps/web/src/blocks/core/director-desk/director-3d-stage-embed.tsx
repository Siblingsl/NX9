import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveBlockCharacters,
} from '@nx9/shared';
import { Director3dShell, type DirectorProject, type Director3dCapturePayload } from '@nx9/director3d';
import { Box } from 'lucide-react';
import {
  prepareDirectorProjectForShot,
} from '../../../engine/director3d-character-sync';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { api } from '../../../api/client';
import { disposeDirectorWebGLLifecycle } from '../../../engine/director-webgl-lifecycle';

interface CameraPreset {
  id: string;
  name: string;
  captureUrl?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  fov?: number;
  savedAt: string;
}

export { type CameraPreset };

export function Director3dStageEmbed({
  blockId,
  project: rawProject,
  linkedShotId,
  shots,
  characters,
  data,
  updateNodeData,
  appendLog,
  focusShot,
}: {
  blockId: string;
  project: DirectorProject;
  linkedShotId: string | null | undefined;
  shots: Array<Record<string, unknown>>;
  characters: import('@nx9/shared').CharacterProfile[];
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  appendLog: (msg: string) => void;
  focusShot: (shotId: string) => void;
}) {
  const [currentShotId, setCurrentShotId] = useState<string | null>(linkedShotId ?? (shots[0] as Record<string, unknown>)?.id as string ?? null);
  const [sceneProject, setSceneProject] = useState<DirectorProject>(() => rawProject);
  const disposeRef = useRef<() => void>(undefined);
  const allPresets = (data.cameraPresets as Record<string, CameraPreset[]> | undefined) ?? {};
  const shotPresets = currentShotId ? allPresets[currentShotId] ?? [] : [];
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const lastPayloadRef = useRef<Director3dCapturePayload | null>(null);

  const resolvedScene = useMemo(() => {
    if (!currentShotId) return sceneProject;
    const shot = shots.find((s) => s.id === currentShotId) as Record<string, unknown> | undefined;
    const shotCharacters = shot
      ? resolveBlockCharacters(data, shot as never, characters)
      : [];
    return prepareDirectorProjectForShot(
      sceneProject,
      shotCharacters.map((c: { id: string }) => c.id),
      characters,
      undefined,
      shotCharacters.map((c: { name: string }) => c.name),
    );
  }, [sceneProject, currentShotId, shots, characters, data]);

  useEffect(() => {
    if (linkedShotId) setCurrentShotId(linkedShotId);
  }, [linkedShotId]);

  const handleCapture = useCallback(async (payload: Director3dCapturePayload) => {
    if (!currentShotId) return;
    lastPayloadRef.current = payload;
    let imageUrl = payload.imageUrl;
    if (payload.dataUrl && !imageUrl) {
      try {
        const blob = await (await fetch(payload.dataUrl)).blob();
        const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
        const uploaded = await api.uploadAsset(file);
        imageUrl = uploaded.url;
      } catch { /* use dataUrl fallback */ }
    }
    const shot = shots.find((s) => s.id === currentShotId) as { index?: number } | undefined;
    if (shot) {
      useWorkspaceDocument.getState().updateShot(currentShotId, {
        director3dGuide: {
          sourceBlockId: blockId,
          captureId: payload.captureId,
          captureUrl: imageUrl || payload.dataUrl || '',
          cameraPrompt: payload.cameraPrompt || '',
          cameraPosition: payload.cameraPosition as [number, number, number] | undefined,
          cameraRotation: payload.cameraRotation as [number, number, number] | undefined,
          cameraFov: payload.cameraFov,
          appliedAt: new Date().toISOString(),
        },
      });
      updateNodeData(blockId, { previewUrl: imageUrl || payload.dataUrl });
      appendLog(`导演台 · 3D 截图已写回镜 #${shot.index}`);
    }
  }, [currentShotId, shots, blockId, updateNodeData, appendLog]);

  const savePreset = useCallback((name: string) => {
    if (!currentShotId || !lastPayloadRef.current) return;
    const payload = lastPayloadRef.current;
    const preset: CameraPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name: name || `机位 ${shotPresets.length + 1}`,
      captureUrl: (() => { const s = shots.find((s2) => s2.id === currentShotId); if (s) { const g = (s as Record<string, unknown>).director3dGuide; return g ? (g as Record<string, unknown>).captureUrl as string : undefined; } return undefined; })(),
      position: payload.cameraPosition as [number, number, number] | undefined,
      rotation: payload.cameraRotation as [number, number, number] | undefined,
      fov: payload.cameraFov,
      savedAt: new Date().toISOString(),
    };
    const updated = { ...allPresets, [currentShotId]: [...shotPresets, preset] };
    updateNodeData(blockId, { cameraPresets: updated });
    setShowSavePreset(false);
    setPresetNameInput('');
    appendLog(`导演台 · 已保存机位预设 ${preset.name}`);
  }, [currentShotId, allPresets, shotPresets, shots, blockId, updateNodeData, appendLog]);

  const deletePreset = useCallback((presetId: string) => {
    if (!currentShotId) return;
    const filtered = shotPresets.filter((p) => p.id !== presetId);
    const updated = { ...allPresets, [currentShotId]: filtered };
    updateNodeData(blockId, { cameraPresets: updated });
    appendLog(`导演台 · 已删除机位预设`);
  }, [currentShotId, allPresets, shotPresets, blockId, updateNodeData, appendLog]);

  const persistProject = useCallback((proj: DirectorProject) => {
    setSceneProject(proj);
    updateNodeData(blockId, { scene: proj as unknown as Record<string, unknown> });
  }, [blockId, updateNodeData]);

  const handleRendererReady = useCallback((renderer: { dispose: () => void }) => {
    disposeRef.current = renderer.dispose;
  }, []);

  useEffect(() => {
    return () => {
      disposeRef.current?.();
      disposeDirectorWebGLLifecycle();
    };
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ height: '100%' }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line shrink-0">
        <span className="text-[10px] text-ink/60 font-medium">当前镜</span>
        <select
          className="text-[10px] px-2 py-1 rounded border border-line bg-surface"
          value={currentShotId ?? ''}
          onChange={(e) => {
            const sid = e.target.value;
            setCurrentShotId(sid);
            focusShot(sid);
          }}
        >
           {(shots as Array<{ id: string; index: number; descriptionZh?: string; promptEn?: string }>).map((s) => (
            <option key={s.id} value={s.id}>#{s.index} {s.descriptionZh || s.promptEn || '未命名'}</option>
          ))}
        </select>
        <button
          type="button"
          className="dd-btn is-ghost"
          style={{ fontSize: 10, height: 24, padding: '0 8px', marginLeft: 'auto' }}
          onClick={() => {
            if (!currentShotId) return;
            const shot = shots.find((s) => s.id === currentShotId) as Record<string, unknown> | undefined;
            if (!shot) return;
            const shotCharacters = resolveBlockCharacters(data, shot as never, characters);
            const updated = prepareDirectorProjectForShot(
              sceneProject,
              shotCharacters.map((c: { id: string }) => c.id),
              characters,
              undefined,
              shotCharacters.map((c: { name: string }) => c.name),
            );
            persistProject(updated);
            appendLog(`导演台 · 已应用 3D 摆位建议至镜 #${(shot as { index?: number }).index ?? '?'}`);
          }}
        >
          <Box size={10} />
           生成3D摆位建议
        </button>
        {showSavePreset ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              className="text-[9px] px-1.5 py-0.5 rounded border border-line bg-surface w-20"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder="机位名"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') savePreset(presetNameInput); if (e.key === 'Escape') setShowSavePreset(false); }}
            />
            <button type="button" className="dd-btn is-ghost" style={{ fontSize: 9, height: 22, padding: '0 6px' }} onClick={() => { savePreset(presetNameInput); }}>保存</button>
            <button type="button" className="dd-btn is-ghost" style={{ fontSize: 9, height: 22, padding: '0 6px' }} onClick={() => setShowSavePreset(false)}>取消</button>
          </div>
        ) : (
          <button
            type="button"
            className="dd-btn is-ghost"
            style={{ fontSize: 9, height: 22, padding: '0 6px', marginLeft: 4 }}
            onClick={() => setShowSavePreset(true)}
          >
            存机位
          </button>
        )}
      </div>
      {shotPresets.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 overflow-x-auto shrink-0 border-b border-line" style={{ maxWidth: '100%' }}>
          {shotPresets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] border border-line bg-surface/50 hover:bg-surface whitespace-nowrap shrink-0"
              title={`位置 ${p.position?.join(',') ?? '—'} · FOV ${p.fov ?? '—'}`}
              onClick={() => {
                if (!currentShotId) return;
                const shot = shots.find((s) => s.id === currentShotId) as Record<string, unknown> | undefined;
                if (!shot) return;
                const existingGuide = (shot.director3dGuide as Record<string, unknown> | undefined) ?? {};
                useWorkspaceDocument.getState().updateShot(currentShotId, {
                  director3dGuide: {
                    sourceBlockId: (existingGuide.sourceBlockId as string) || blockId,
                    captureId: (existingGuide.captureId as string) || '',
                    captureUrl: (existingGuide.captureUrl as string) || '',
                    cameraPosition: p.position,
                    cameraRotation: p.rotation,
                    cameraFov: p.fov,
                    cameraPrompt: (p as CameraPreset & { cameraPrompt?: string }).cameraPrompt ?? existingGuide.cameraPrompt as string ?? '',
                    appliedAt: new Date().toISOString(),
                  } as never,
                });
                appendLog(`导演台 · 已恢复机位 ${p.name}`);
              }}
            >
              {p.captureUrl ? <img src={p.captureUrl} alt="" className="w-5 h-4 rounded object-cover" /> : null}
              <span>{p.name}</span>
              <span
                className="ml-1 opacity-40 hover:opacity-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}
                title="删除"
              >×</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Director3dShell
          options={{
            project: resolvedScene,
            linkedShotId: currentShotId ?? undefined,
            performanceMode: 'normal',
            crowdMax: 20,
            onProjectChange: persistProject,
            onCapture: handleCapture,
            onUploadFile: async (file) => {
              const uploaded = await api.uploadAsset(file);
              return { url: uploaded.url, filename: uploaded.filename };
            },
            onRendererReady: handleRendererReady,
          }}
        />
      </div>
    </div>
  );
}
