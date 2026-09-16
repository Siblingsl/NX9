import { useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { BODY_TYPES } from '../presets/characterPresets';
import { BUILTIN_ASSET_CATEGORIES, builtinAssetsByCategory } from '../presets/builtinAssets';

export function AddDrawer() {
  const addCharacter = useDirectorStore((s) => s.addCharacter);
  const addGeometry = useDirectorStore((s) => s.addGeometry);
  const addCamera = useDirectorStore((s) => s.addCamera);
  const addCrowd = useDirectorStore((s) => s.addCrowd);
  const addBuiltinObject = useDirectorStore((s) => s.addBuiltinObject);
  const [crowdRows, setCrowdRows] = useState(3);
  const [crowdCols, setCrowdCols] = useState(4);

  return (
    <aside className="nx9-stage-drawer">
      <div className="nx9-stage-drawer-head">添加到场景</div>
      <div className="nx9-stage-drawer-body">
        <p className="nx9-stage-hint">演员体型</p>
        <div className="nx9-stage-btn-row">
          {BODY_TYPES.map((b) => (
            <button
              key={b.id}
              type="button"
              className="nx9-stage-mini-btn"
              onClick={() => addCharacter(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          道具几何
        </p>
        <div className="nx9-stage-btn-row">
          {(['box', 'sphere', 'cylinder', 'cone'] as const).map((g) => (
            <button key={g} type="button" className="nx9-stage-mini-btn" onClick={() => addGeometry(g)}>
              {g}
            </button>
          ))}
        </div>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          内置模型（点击即放置，无需外部文件）
        </p>
        {BUILTIN_ASSET_CATEGORIES.map((category) => {
          const assets = builtinAssetsByCategory(category.id);
          if (assets.length === 0) return null;
          return (
            <div key={category.id} style={{ marginBottom: 8 }}>
              <p className="nx9-stage-hint">{category.label}</p>
              <div className="nx9-stage-btn-row">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="nx9-stage-mini-btn"
                    title={`${asset.label} · 约 ${asset.size[0]}×${asset.size[1]}×${asset.size[2]} m`}
                    style={{ borderLeft: `4px solid ${asset.color}` }}
                    onClick={() => addBuiltinObject(asset.id, asset.label)}
                  >
                    {asset.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          群演阵列（上限 20）
        </p>
        <div className="nx9-stage-btn-row">
          <label className="nx9-stage-field" style={{ flex: 1 }}>
            行
            <input
              type="number"
              min={1}
              max={5}
              value={crowdRows}
              onChange={(e) => setCrowdRows(Number(e.target.value) || 1)}
            />
          </label>
          <label className="nx9-stage-field" style={{ flex: 1 }}>
            列
            <input
              type="number"
              min={1}
              max={5}
              value={crowdCols}
              onChange={(e) => setCrowdCols(Number(e.target.value) || 1)}
            />
          </label>
        </div>
        <button type="button" className="nx9-stage-mini-btn" onClick={() => addCrowd(crowdRows, crowdCols)}>
          放置群演
        </button>

        <p className="nx9-stage-hint" style={{ marginTop: 14 }}>
          镜头
        </p>
        <button type="button" className="nx9-stage-mini-btn" onClick={() => addCamera()}>
          新建镜头
        </button>
      </div>
    </aside>
  );
}
