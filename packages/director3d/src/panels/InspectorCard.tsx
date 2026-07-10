import { useDirectorStore } from '../store/directorStore';
import type { CharacterBodyType } from '../schema/directorProject';
import { BODY_TYPES, POSE_PRESETS } from '../presets/characterPresets';

export function InspectorCard() {
  const project = useDirectorStore((s) => s.project);
  const selectedId = useDirectorStore((s) => s.selectedObjectId);
  const updateName = useDirectorStore((s) => s.updateObjectName);
  const updateCamera = useDirectorStore((s) => s.updateCamera);
  const updateCharacter = useDirectorStore((s) => s.updateCharacter);

  const obj = project.objects.find((o) => o.id === selectedId);
  const cam = project.cameras.find((c) => c.id === selectedId);

  return (
    <aside className="nx9-stage-inspector">
      <div className="nx9-stage-inspector-card">
        <div className="nx9-stage-inspector-head">检查器</div>
        <div className="nx9-stage-inspector-body">
          {!obj && !cam && (
            <p className="nx9-stage-hint">在视口中选择演员、道具或镜头以编辑属性。</p>
          )}

          {obj && (
            <>
              <label className="nx9-stage-field">
                名称
                <input value={obj.name} onChange={(e) => updateName(obj.id, e.target.value)} />
              </label>
              {obj.kind === 'character' && (
                <>
                  <label className="nx9-stage-field">
                    体型
                    <select
                      value={obj.bodyType ?? 'neutral'}
                      onChange={(e) =>
                        updateCharacter(obj.id, {
                          bodyType: e.target.value as CharacterBodyType,
                        })
                      }
                    >
                      {BODY_TYPES.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="nx9-stage-field">
                    姿势
                    <select
                      value={obj.posePresetId ?? 'stand'}
                      onChange={(e) => updateCharacter(obj.id, { posePresetId: e.target.value })}
                    >
                      {POSE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="nx9-stage-field">
                    颜色
                    <input
                      type="color"
                      value={obj.color ?? '#5E4D8A'}
                      onChange={(e) => updateCharacter(obj.id, { color: e.target.value })}
                    />
                  </label>
                </>
              )}
            </>
          )}

          {cam && (
            <>
              <label className="nx9-stage-field">
                镜头名称
                <input value={cam.name} onChange={(e) => updateName(cam.id, e.target.value)} />
              </label>
              <label className="nx9-stage-field">
                视场角 FOV
                <input
                  type="number"
                  min={20}
                  max={120}
                  value={cam.fov}
                  onChange={(e) => updateCamera(cam.id, { fov: Number(e.target.value) || 50 })}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
