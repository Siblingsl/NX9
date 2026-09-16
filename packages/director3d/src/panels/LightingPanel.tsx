import { useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import type { DirectorLight, DirectorLightRole, DirectorLightType } from '../schema/directorProject';
import { DIRECTOR_LIGHT_TYPES } from '../schema/directorProject';
import {
  AMBIENT_PRESETS,
  KEY_LIGHT_AZIMUTHS,
  KEY_LIGHT_ELEVATIONS,
  KEY_LIGHT_PRESETS,
  LIGHTING_RIG_PRESETS,
  RIM_LIGHT_PRESETS,
  azimuthLabel,
  buildSceneLightingPrompt,
  keyLightPresetAt,
} from '../presets/lightingPresets';

const TYPE_LABELS: Record<DirectorLightType, string> = {
  directional: '方向光',
  spot: '聚光灯',
  point: '点光源',
  ambient: '环境灯',
};

const ROLE_LABELS: Record<DirectorLightRole, string> = {
  key: '主光',
  fill: '补光',
  rim: '轮廓光',
  ambient: '环境',
  practical: '实用光',
};

function LightEditor({
  light,
  onChange,
  onRemove,
}: {
  light: DirectorLight;
  onChange: (patch: Partial<DirectorLight>) => void;
  onRemove: () => void;
}) {
  const azimuth = azimuthLabel(light.azimuth);
  return (
    <div className="nx9-stage-light-editor">
      <label className="nx9-stage-field">
        名称
        <input value={light.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label className="nx9-stage-field">
        类型
        <select value={light.type} onChange={(e) => onChange({ type: e.target.value as DirectorLightType })}>
          {DIRECTOR_LIGHT_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="nx9-stage-field">
        作用
        <select value={light.role} onChange={(e) => onChange({ role: e.target.value as DirectorLightRole })}>
          {(Object.keys(ROLE_LABELS) as DirectorLightRole[]).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
      {light.type !== 'ambient' && (
        <>
          <label className="nx9-stage-field">
            方位角 {Math.round(light.azimuth)}° · {azimuth.zh}
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(light.azimuth)}
              onChange={(e) => onChange({ azimuth: Number(e.target.value) })}
            />
          </label>
          <label className="nx9-stage-field">
            仰角 {Math.round(light.elevation)}°
            <input
              type="range"
              min={-85}
              max={88}
              value={Math.round(light.elevation)}
              onChange={(e) => onChange({ elevation: Number(e.target.value) })}
            />
          </label>
          <label className="nx9-stage-field">
            距离 {light.distance.toFixed(1)} m
            <input
              type="range"
              min={3}
              max={150}
              value={Math.round(light.distance * 10)}
              onChange={(e) => onChange({ distance: Number(e.target.value) / 10 })}
            />
          </label>
        </>
      )}
      <label className="nx9-stage-field">
        强度 {light.intensity.toFixed(2)}
        <input
          type="range"
          min={0}
          max={400}
          value={Math.round(light.intensity * 100)}
          onChange={(e) => onChange({ intensity: Number(e.target.value) / 100 })}
        />
      </label>
      {light.type === 'spot' && (
        <>
          <label className="nx9-stage-field">
            锥角 {Math.round(light.coneAngle ?? 45)}°
            <input
              type="range"
              min={5}
              max={90}
              value={Math.round(light.coneAngle ?? 45)}
              onChange={(e) => onChange({ coneAngle: Number(e.target.value) })}
            />
          </label>
          <label className="nx9-stage-field">
            羽化 {(light.penumbra ?? 0.4).toFixed(2)}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((light.penumbra ?? 0.4) * 100)}
              onChange={(e) => onChange({ penumbra: Number(e.target.value) / 100 })}
            />
          </label>
        </>
      )}
      <label className="nx9-stage-field">
        颜色
        <input type="color" value={light.color} onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      <div className="nx9-stage-prompt-toggles">
        <label className="nx9-stage-toggle">
          <input type="checkbox" checked={light.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
          启用
        </label>
        <label className="nx9-stage-toggle">
          <input type="checkbox" checked={light.castShadow} onChange={(e) => onChange({ castShadow: e.target.checked })} />
          投射阴影
        </label>
      </div>
      <button type="button" className="nx9-stage-mini-btn nx9-stage-danger" onClick={onRemove}>
        删除这盏灯
      </button>
    </div>
  );
}

export function LightingPanel() {
  const scene = useDirectorStore((s) => s.project.scene);
  const applyKeyLightPreset = useDirectorStore((s) => s.applyKeyLightPreset);
  const applyRimLightPreset = useDirectorStore((s) => s.applyRimLightPreset);
  const applyLightingRigPreset = useDirectorStore((s) => s.applyLightingRigPreset);
  const addLight = useDirectorStore((s) => s.addLight);
  const updateLight = useDirectorStore((s) => s.updateLight);
  const removeLight = useDirectorStore((s) => s.removeLight);
  const setSceneLighting = useDirectorStore((s) => s.setSceneLighting);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);

  const lights = scene.lights;
  const selectedLight = lights.find((light) => light.id === selectedLightId) ?? lights[0];
  const keyLight = lights.find((light) => light.role === 'key');
  const rimLight = lights.find((light) => light.role === 'rim');
  const activeRig = LIGHTING_RIG_PRESETS.find((rig) => rig.id === scene.lightingPresetId);
  const promptFragment = buildSceneLightingPrompt(scene);

  const keyMatches = (azimuth: number, elevation: number) =>
    keyLight !== undefined
    && Math.round(keyLight.azimuth) === azimuth
    && Math.round(keyLight.elevation) === elevation;

  return (
    <aside className="nx9-stage-drawer">
      <div className="nx9-stage-drawer-head">灯光</div>
      <div className="nx9-stage-drawer-body">
        <p className="nx9-stage-hint">
          主光位 24 宫格（8 方位 × 3 高度）
          {keyLight ? ` · 当前 ${Math.round(keyLight.azimuth)}° / ${Math.round(keyLight.elevation)}°` : ' · 尚未布主光'}
        </p>
        {KEY_LIGHT_ELEVATIONS.map((tier) => (
          <div key={tier.slug} className="nx9-stage-light-row">
            <span className="nx9-stage-light-row__label">{tier.label}</span>
            {KEY_LIGHT_AZIMUTHS.map((az) => {
              const preset = keyLightPresetAt(az.azimuth, tier.slug);
              if (!preset) return null;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={`${preset.label} · ${preset.prompt}`}
                  className={`nx9-stage-light-cell${keyMatches(az.azimuth, preset.elevation) ? ' is-on' : ''}`}
                  onClick={() => applyKeyLightPreset(preset.id)}
                >
                  {az.short}
                </button>
              );
            })}
          </div>
        ))}
        <p className="nx9-stage-hint" style={{ marginTop: 6 }}>
          每格代表一盏主光：横向是方位，纵向是高度
        </p>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          轮廓光 9 宫格
          {rimLight ? ` · 当前 ${Math.round(rimLight.azimuth)}°` : ' · 尚未布轮廓光'}
        </p>
        <div className="nx9-stage-light-grid">
          {RIM_LIGHT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.prompt}
              className={`nx9-stage-mini-btn${rimLight?.azimuth === preset.azimuth && Math.round(rimLight?.elevation ?? 0) === Math.round(preset.elevation) ? ' is-on' : ''}`}
              onClick={() => applyRimLightPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          整组布光方案
          {activeRig ? ` · 当前「${activeRig.label}」` : ' · 自定义'}
        </p>
        <div className="nx9-stage-btn-row">
          {LIGHTING_RIG_PRESETS.map((rig) => (
            <button
              key={rig.id}
              type="button"
              title={`${rig.description} · ${rig.prompt}`}
              className={`nx9-stage-mini-btn${scene.lightingPresetId === rig.id ? ' is-on' : ''}`}
              onClick={() => applyLightingRigPreset(rig.id)}
            >
              {rig.label}
            </button>
          ))}
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          环境与曝光
        </p>
        <label className="nx9-stage-field">
          环境光强度 {scene.ambientIntensity.toFixed(2)}
          <input
            type="range"
            min={0}
            max={200}
            value={Math.round(scene.ambientIntensity * 100)}
            onChange={(e) => setSceneLighting({ ambientIntensity: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="nx9-stage-field">
          曝光 {scene.exposure.toFixed(2)}
          <input
            type="range"
            min={20}
            max={250}
            value={Math.round(scene.exposure * 100)}
            onChange={(e) => setSceneLighting({ exposure: Number(e.target.value) / 100 })}
          />
        </label>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          灯组（{lights.length} 盏）
        </p>
        {lights.length === 0 && (
          <p className="nx9-stage-hint">当前没有灯，画面按默认主光 + 环境光渲染。点击下方按钮补灯。</p>
        )}
        {lights.map((light) => (
          <button
            key={light.id}
            type="button"
            className={`nx9-stage-layer${selectedLight?.id === light.id ? ' is-on' : ''}`}
            onClick={() => setSelectedLightId(light.id)}
          >
            <span>{light.name}</span>
            <span className="nx9-stage-chip">{light.visible ? ROLE_LABELS[light.role] : '已关'}</span>
          </button>
        ))}
        <div className="nx9-stage-btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => addLight('directional', 'key')}>
            + 主光
          </button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => addLight('directional', 'fill')}>
            + 补光
          </button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => addLight('spot', 'rim')}>
            + 轮廓光
          </button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => addLight('point', 'practical')}>
            + 实用光
          </button>
          <button type="button" className="nx9-stage-mini-btn" onClick={() => addLight('ambient', 'ambient')}>
            + 环境灯
          </button>
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          单灯微调
        </p>
        {selectedLight ? (
          <LightEditor
            light={selectedLight}
            onChange={(patch) => updateLight(selectedLight.id, patch)}
            onRemove={() => {
              removeLight(selectedLight.id);
              setSelectedLightId(null);
            }}
          />
        ) : (
          <p className="nx9-stage-hint">选择一盏灯后可精确调节方位、强度与颜色。</p>
        )}

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          环境光预设
        </p>
        <div className="nx9-stage-btn-row">
          {AMBIENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.prompt}
              className={`nx9-stage-mini-btn${Math.abs(scene.ambientIntensity - preset.intensity) < 0.005 ? ' is-on' : ''}`}
              onClick={() => setSceneLighting({ ambientIntensity: preset.intensity })}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          提示词灯光片段（写入批出）
        </p>
        <div className="nx9-stage-prompt-box" title="随候选帧一起写入镜头语言">
          {promptFragment || '尚未配置灯光'}
        </div>
        <p className="nx9-stage-hint" style={{ marginTop: 6 }}>
          共 {KEY_LIGHT_PRESETS.length} 个主光位 / {RIM_LIGHT_PRESETS.length} 个轮廓光预置
        </p>
      </div>
    </aside>
  );
}
