/**
 * FACE-P3：捏模台规范机位定妆截图 → faceLockUrl + 健康条。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyFaceRig, faceRigHash, setFaceRigValue, NX9_SCULPT_MESH_CONTRACT_VERSION } from '@nx9/shared';

const webSrc = resolve(__dirname, '..');
const modalSrc = readFileSync(
  resolve(webSrc, '../panels/asset-library/face-sculpt/FaceSculptModal.tsx'),
  'utf8',
);
const sceneSrc = readFileSync(
  resolve(__dirname, '../../../../../packages/director3d/src/sculpt/CharacterSculptScene.ts'),
  'utf8',
);
const camerasSrc = readFileSync(
  resolve(__dirname, '../../../../../packages/director3d/src/sculpt/sculpt-cameras.ts'),
  'utf8',
);
const viewportSrc = readFileSync(
  resolve(__dirname, '../../../../../packages/director3d/src/sculpt/CharacterSculptViewport.tsx'),
  'utf8',
);

describe('FACE-P3 定妆截图与健康条', () => {
  it('Scene 提供固定像素规范机位导出，不依赖预览 canvas', () => {
    expect(sceneSrc).toContain('exportCanonicalImage');
    expect(sceneSrc).toContain('CANONICAL_FACE_VIEW_WIDTH');
    expect(sceneSrc).toContain('toDataURL');
    expect(sceneSrc).toContain('applyFaceRigToObject(exportActor, exportRig)');
    expect(sceneSrc).toContain('exportScene.add(exportActor)');
    expect(sceneSrc).not.toContain('exportScene.add(this.actor)');
    expect(sceneSrc).toContain('try {');
    expect(sceneSrc).toContain('} finally {');
    expect(sceneSrc).toContain('exportRenderer?.dispose();');
    expect(sceneSrc.match(/exportRenderer\.render\(exportScene, exportCamera\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(camerasSrc).toContain('CANONICAL_FACE_VIEW_WIDTH = 512');
    expect(camerasSrc).toContain('CANONICAL_FACE_VIEW_HEIGHT = 768');
  });

  it('Viewport handle 暴露 exportCanonicalImage', () => {
    expect(viewportSrc).toContain('exportCanonicalImage: (rig?: CharacterFaceRig) => string | null');
  });

  it('Modal 提供定妆按钮、写 faceLockUrl/renderedAt/契约版本，并显示健康状态', () => {
    expect(modalSrc).toContain('定妆出图');
    expect(modalSrc).toContain('faceLockUrl: uploaded.url');
    expect(modalSrc).toContain('renderedAt: now');
    expect(modalSrc).toContain('exportCanonicalImage(liveRig)');
    expect(modalSrc).toContain('NX9_SCULPT_MESH_CONTRACT_VERSION');
    expect(modalSrc).toContain('faceLockHash');
    expect(modalSrc).toContain('定妆已锁');
    expect(modalSrc).toContain('定妆过期');
    expect(modalSrc).toContain('viewportReady = Boolean(compat)');
    expect(modalSrc).toContain('disabled={exporting || !webgl || !viewportReady}');
  });

  it('契约版本导出为共享常量；参数变化会使指纹改变', () => {
    expect(NX9_SCULPT_MESH_CONTRACT_VERSION).toBe(1);
    const base = emptyFaceRig();
    const changed = setFaceRigValue(base, 'jawWidth', 60);
    expect(faceRigHash(changed)).not.toBe(faceRigHash(base));
  });
});
