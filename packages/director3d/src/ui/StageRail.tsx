import { useDirectorStore } from '../store/directorStore';
import { LayersDrawer } from './LayersDrawer';
import { AddDrawer } from './AddDrawer';
import { EnvDrawer } from './EnvDrawer';
import type { DirectorProject } from '../schema/directorProject';

export function StageRail({
  onUploadFile,
  onSaveSceneTemplate,
}: {
  onUploadFile?: (file: File) => Promise<{ url: string; filename?: string }>;
  onSaveSceneTemplate?: (project: DirectorProject, label: string) => void;
}) {
  const drawer = useDirectorStore((s) => s.activeDrawer);
  const setDrawer = useDirectorStore((s) => s.setActiveDrawer);

  const toggle = (key: 'layers' | 'add' | 'env') => {
    setDrawer(drawer === key ? null : key);
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
          title="环境与资源"
          className={`nx9-stage-rail-btn${drawer === 'env' ? ' is-on' : ''}`}
          onClick={() => toggle('env')}
        >
          环
        </button>
      </nav>
      {drawer === 'layers' && <LayersDrawer />}
      {drawer === 'add' && <AddDrawer />}
      {drawer === 'env' && (
        <EnvDrawer onUploadFile={onUploadFile} onSaveSceneTemplate={onSaveSceneTemplate} />
      )}
    </>
  );
}
