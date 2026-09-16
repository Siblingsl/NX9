import { useDirectorStore } from '../store/directorStore';
import { LayersDrawer } from '../panels/LayersDrawer';
import { AddDrawer } from '../panels/AddDrawer';
import { EnvDrawer } from '../panels/EnvDrawer';
import { LightingPanel } from '../panels/LightingPanel';
import { CameraMoveLibraryPanel } from './CameraMoveLibraryPanel';
import type { Director3dSceneTemplate } from '../schema/directorProject';

export function StageRail({
  onUploadFile,
  onSaveSceneTemplate,
  sceneTemplates,
  onApplySceneTemplate,
}: {
  onUploadFile?: (file: File) => Promise<{ url: string; filename?: string }>;
    onSaveSceneTemplate?: (template: Director3dSceneTemplate) => void;
    sceneTemplates?: Director3dSceneTemplate[];
    onApplySceneTemplate?: (templateId: string) => void;
}) {
  const drawer = useDirectorStore((s) => s.activeDrawer);
  const setDrawer = useDirectorStore((s) => s.setActiveDrawer);

  const toggle = (key: 'layers' | 'add' | 'env' | 'light') => {
    const next = drawer === key ? null : key;
    setDrawer(next);
    useDirectorStore.getState().setMobileSheet(next);
  };

  return (
    <>
      <nav className="nx9-stage-rail" aria-label="Stage tools">
        <button
          type="button"
          title="场景层"
          className={`nx9-stage-rail-btn${drawer === 'layers' ? ' is-on' : ''}`}
          onClick={() => toggle('layers')}
        >
          层
        </button>
        <button
          type="button"
          title="添加"
          className={`nx9-stage-rail-btn${drawer === 'add' ? ' is-on' : ''}`}
          onClick={() => toggle('add')}
        >
          +
        </button>
        <button
          type="button"
          title="灯光"
          className={`nx9-stage-rail-btn${drawer === 'light' ? ' is-on' : ''}`}
          onClick={() => toggle('light')}
        >
          光
        </button>
        <button
          type="button"
          title="环境与资源"
          className={`nx9-stage-rail-btn${drawer === 'env' ? ' is-on' : ''}`}
          onClick={() => toggle('env')}
        >
          环
        </button>
        {/* 大师运镜库：与既有抽屉同一开关机制（drawer + 移动端 sheet 同名） */}
        <button
          type="button"
          title="大师运镜库"
          className={`nx9-stage-rail-btn${drawer === 'move' ? ' is-on' : ''}`}
          onClick={() => {
            const next = drawer === 'move' ? null : 'move';
            setDrawer(next);
            useDirectorStore.getState().setMobileSheet(next);
          }}
        >
          运
        </button>
      </nav>
      {drawer === 'layers' && <LayersDrawer />}
      {drawer === 'add' && <AddDrawer />}
      {drawer === 'light' && <LightingPanel />}
      {drawer === 'move' && <CameraMoveLibraryPanel />}
      {drawer === 'env' && (
        <EnvDrawer
          onUploadFile={onUploadFile}
          onSaveSceneTemplate={onSaveSceneTemplate}
          sceneTemplates={sceneTemplates}
          onApplySceneTemplate={onApplySceneTemplate}
        />
      )}
    </>
  );
}
