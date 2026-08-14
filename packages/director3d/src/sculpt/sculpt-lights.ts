import { DirectionalLight, HemisphereLight, type Light } from 'three';

/**
 * DRIFT-02：捏模台四灯预设（主光 / 补光 / 轮廓光 / 环境光）。
 * 预览与定妆离屏导出共用同一组，保证出图可复现。
 */
export function createSculptLights(): Light[] {
  const hemisphere = new HemisphereLight(0xf2f5ff, 0x3d342c, 0.72);
  const key = new DirectionalLight(0xfff6ea, 1.15);
  key.position.set(1.4, 2.2, 1.8);
  const fill = new DirectionalLight(0xd7e4ff, 0.45);
  fill.position.set(-1.6, 1.2, 0.8);
  const rim = new DirectionalLight(0xffffff, 0.35);
  rim.position.set(-0.4, 1.8, -1.8);
  return [hemisphere, key, fill, rim];
}
