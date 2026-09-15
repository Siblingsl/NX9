import { useDirectorStore } from '../store/directorStore';
import type { CharacterBodyType } from '../schema/directorProject';
import {
  BODY_TYPES,
  POSE_JOINT_SLIDERS,
  POSE_PRESETS,
  setJointAxis,
  type PoseJointOverride,
} from '../presets/characterPresets';

export function InspectorCard() {
  const project = useDirectorStore((s) => s.project);
  const selectedId = useDirectorStore((s) => s.selectedObjectId);
  const updateName = useDirectorStore((s) => s.updateObjectName);
  const updateCamera = useDirectorStore((s) => s.updateCamera);
  const updateCharacter = useDirectorStore((s) => s.updateCharacter);

  const obj = project.objects.find((o) => o.id === selectedId);
  const cam = project.cameras.find((c) => c.id === selectedId);
  const joints = (obj?.kind === 'character' ? obj.poseJoints : undefined) as PoseJointOverride | undefined;
  const hasJointTweaks = Boolean(joints && Object.keys(joints).length > 0);

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
                      onChange={(e) =>
                        updateCharacter(obj.id, {
                          posePresetId: e.target.value,
                          poseJoints: undefined,
                        })
                      }
                    >
                      {POSE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="nx9-stage-field">
                    朝向 {Math.round(obj.transform.rotation[1])}°
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={obj.transform.rotation[1]}
                      onChange={(e) =>
                        useDirectorStore.getState().updateObjectTransform(obj.id, {
                          rotation: [
                            obj.transform.rotation[0],
                            Number(e.target.value),
                            obj.transform.rotation[2],
                          ],
                        })
                      }
                    />
                  </label>
                  <div className="nx9-stage-field nx9-stage-joint-block">
                    <div className="nx9-stage-joint-head">
                      <span>关节微调</span>
                      {hasJointTweaks && (
                        <button
                          type="button"
                          className="nx9-stage-mini-btn"
                          onClick={() => updateCharacter(obj.id, { poseJoints: undefined })}
                        >
                          重置
                        </button>
                      )}
                    </div>
                    {POSE_JOINT_SLIDERS.map((s) => {
                      const cur = joints?.[s.key]?.[s.axis] ?? 0;
                      return (
                        <label key={`${s.key}-${s.axis}`} className="nx9-stage-joint-row">
                          {s.label} {Math.round(cur)}°
                          <input
                            type="range"
                            min={s.min}
                            max={s.max}
                            value={cur}
                            onChange={(e) =>
                              updateCharacter(obj.id, {
                                poseJoints: setJointAxis(joints, s.key, s.axis, Number(e.target.value)),
                              })
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
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
              <label className="nx9-stage-field">
                目标点 X / Y / Z
                <input
                  type="text"
                  value={cam.target.join(', ')}
                  onChange={(e) => {
                    const values = e.target.value.split(',').map((item) => Number(item.trim()));
                    if (values.length === 3 && values.every(Number.isFinite)) {
                      updateCamera(cam.id, { target: values as [number, number, number] });
                    }
                  }}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
