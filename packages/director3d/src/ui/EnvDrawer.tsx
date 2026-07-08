import { useRef, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { exportProjectJson, importProjectJson } from '../io/projectIo';
import { loadLocalLibrary } from '../io/localLibrary';
import type { DirectorProject } from '../schema/directorProject';

export function EnvDrawer({
  onUploadFile,
  onSaveSceneTemplate,
}: {
  onUploadFile?: (file: File) => Promise<{ url: string; filename?: string }>;
  onSaveSceneTemplate?: (project: DirectorProject, label: string) => void;
}) {
  const panorama = useDirectorStore((s) => s.project.panorama);
  const assets = useDirectorStore((s) => s.project.assets);
  const project = useDirectorStore((s) => s.project);
  const setPanorama = useDirectorStore((s) => s.setPanorama);
  const updatePanorama = useDirectorStore((s) => s.updatePanorama);
  const registerAsset = useDirectorStore((s) => s.registerAsset);
  const addMeshFromAsset = useDirectorStore((s) => s.addMeshFromAsset);
  const toggleSceneFlag = useDirectorStore((s) => s.toggleSceneFlag);
  const replaceProject = useDirectorStore((s) => s.replaceProject);
  const scene = useDirectorStore((s) => s.project.scene);
  const panoRef = useRef<HTMLInputElement>(null);
  const meshRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const [sceneLabel, setSceneLabel] = useState('我的场景');

  const localLibrary = loadLocalLibrary();
  const libraryAssets = [
    ...assets,
    ...localLibrary.filter((a) => !assets.some((x) => x.id === a.id)),
  ];

  const handlePano = async (file: File) => {
    if (!onUploadFile) return;
    const res = await onUploadFile(file);
    setPanorama({ url: res.url, yaw: 0, exposure: 1 });
    registerAsset({
      id: `asset-pano-${Date.now()}`,
      kind: 'panorama',
      name: file.name,
      url: res.url,
      fileName: file.name,
    });
  };

  const handleMesh = async (file: File) => {
    if (!onUploadFile) return;
    const res = await onUploadFile(file);
    const id = `asset-mesh-${Date.now()}`;
    registerAsset({
      id,
      kind: 'mesh',
      name: file.name,
      url: res.url,
      fileName: file.name,
    });
    addMeshFromAsset(id);
  };

  const handleImportProject = async (file: File) => {
    const next = await importProjectJson(file);
    replaceProject(next);
  };

  return (
    <aside className="nx9-stage-drawer">
      <div className="nx9-stage-drawer-head">环境与资源</div>
      <div className="nx9-stage-drawer-body">
        <p className="nx9-stage-hint">工程</p>
        <div className="nx9-stage-btn-row">
          <button
            type="button"
            className="nx9-stage-mini-btn"
            onClick={() => exportProjectJson(project)}
          >
            导出 JSON
          </button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => projectRef.current?.click()}>
            导入 JSON
          </button>
        </div>
        <input
          ref={projectRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportProject(f);
            e.target.value = '';
          }}
        />
        {onSaveSceneTemplate && (
          <div className="nx9-stage-btn-row" style={{ marginTop: 8 }}>
            <input
              value={sceneLabel}
              onChange={(e) => setSceneLabel(e.target.value)}
              className="nx9-stage-mini-btn"
              style={{ flex: 1, textAlign: 'left' }}
            />
            <button
              type="button"
              className="nx9-stage-mini-btn is-on"
              onClick={() => onSaveSceneTemplate(project, sceneLabel.trim() || 'Stage Deck 场景')}
            >
              载入工作区
            </button>
          </div>
        )}

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          视口辅助
        </p>
        <div className="nx9-stage-btn-row">
          {(
            [
              ['showGrid', '网格'],
              ['showGround', '地面'],
              ['ruleOfThirds', '三分线'],
              ['snapToGrid', '吸附'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`nx9-stage-mini-btn${scene[key] ? ' is-on' : ''}`}
              onClick={() => toggleSceneFlag(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          360° 全景背景
        </p>
        <input
          ref={panoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handlePano(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!onUploadFile}
          onClick={() => panoRef.current?.click()}
        >
          上传全景图
        </button>
        {panorama && (
          <>
            <label className="nx9-stage-field">
              水平旋转
              <input
                type="range"
                min={-180}
                max={180}
                value={panorama.yaw}
                onChange={(e) => updatePanorama({ yaw: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              className="nx9-stage-mini-btn nx9-stage-danger"
              onClick={() => setPanorama(null)}
            >
              移除全景
            </button>
          </>
        )}

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          3D 模型（glb / obj / fbx）
        </p>
        <input
          ref={meshRef}
          type="file"
          accept=".glb,.gltf,.obj,.fbx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleMesh(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="nx9-stage-mini-btn"
          disabled={!onUploadFile}
          onClick={() => meshRef.current?.click()}
        >
          导入模型
        </button>

        {libraryAssets.length > 0 && (
          <>
            <p className="nx9-stage-hint" style={{ marginTop: 12 }}>
              资源库（含本地缓存）
            </p>
            {libraryAssets.map((a) => (
              <button
                key={a.id}
                type="button"
                className="nx9-stage-layer"
                onClick={() => {
                  if (a.kind !== 'mesh') return;
                  if (!assets.some((x) => x.id === a.id)) registerAsset(a);
                  addMeshFromAsset(a.id);
                }}
              >
                <span>{a.name}</span>
                <span className="nx9-stage-chip">{a.kind}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
