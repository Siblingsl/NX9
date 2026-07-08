import { useDirectorStore } from '../store/directorStore';

export function LayersDrawer() {
  const project = useDirectorStore((s) => s.project);
  const selectedId = useDirectorStore((s) => s.selectedObjectId);
  const selectObject = useDirectorStore((s) => s.selectObject);
  const setActiveCamera = useDirectorStore((s) => s.setActiveCamera);
  const toggleVisible = useDirectorStore((s) => s.toggleObjectVisible);
  const deleteSelected = useDirectorStore((s) => s.deleteSelected);

  return (
    <aside className="nx9-stage-drawer">
      <div className="nx9-stage-drawer-head">场景层</div>
      <div className="nx9-stage-drawer-body">
        <p className="nx9-stage-hint">演员与道具</p>
        {project.objects.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`nx9-stage-layer${selectedId === o.id ? ' is-on' : ''}`}
            onClick={() => selectObject(o.id)}
          >
            <span>{o.name}</span>
            <span className="nx9-stage-chip">{o.kind === 'character' ? '演员' : o.kind === 'mesh' ? '模型' : '道具'}</span>
          </button>
        ))}
        <p className="nx9-stage-hint" style={{ marginTop: 12 }}>
          镜头序列
        </p>
        {project.cameras.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`nx9-stage-layer${selectedId === c.id ? ' is-on' : ''}`}
            onClick={() => setActiveCamera(c.id)}
          >
            <span>{c.name}</span>
            <span className="nx9-stage-chip">{c.captures.length} 帧</span>
          </button>
        ))}
        {selectedId && (
          <div className="nx9-stage-btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="nx9-stage-mini-btn" onClick={() => toggleVisible(selectedId)}>
              显隐
            </button>
            <button type="button" className="nx9-stage-mini-btn nx9-stage-danger" onClick={deleteSelected}>
              删除
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
