/**
 * 上传路径：无 URL 禁止写入素材 / 假成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../..');
const engine = resolve(__dirname, '..');

function read(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('uploadAsset 无 URL 诚实门禁', () => {
  it('VideoPlaybookTools / EditDesk / AssetImport / 五类原图拒空 URL', () => {
    const playbook = readFileSync(
      resolve(engine, 'stage-deck/chrome/attached-workspace/generation/video/VideoPlaybookTools.tsx'),
      'utf8',
    );
    expect(playbook).toContain('参考素材上传失败或未返回 URL，禁止空成功');
    expect(playbook).toContain('toastError');

    const desk = read('blocks/core/clip-editor/EditDesk.tsx');
    expect(desk).toContain('粘贴素材上传失败或未返回 URL，禁止空成功');
    expect(desk).toContain('toastError');

    const assetImport = read('blocks/input/AssetImportBlock.tsx');
    expect(assetImport).toContain('上传失败或未返回 URL，禁止空成功');
    expect(assetImport).toContain('toastError');

    const lib = read('panels/asset-library/modal/use-asset-library-generation.ts');
    expect(lib).toContain('上传失败或未返回 URL，禁止空成功');
    expect(lib).toMatch(/五类原图失败[\s\S]*toastError/);
  });

  it('宫格 / 链接 / 字幕失败路径 toastError', () => {
    const grid = readFileSync(
      resolve(engine, 'stage-deck/chrome/attached-workspace/tool/GridComposeWorkspace.tsx'),
      'utf8',
    );
    expect(grid).toContain('toastError');
    expect(grid).toContain('上传失败，禁止空成功');

    const link = readFileSync(
      resolve(engine, 'stage-deck/chrome/attached-workspace/tool/LinkParserWorkspace.tsx'),
      'utf8',
    );
    expect(link).toContain('toastError');

    const caption = readFileSync(
      resolve(engine, 'stage-deck/chrome/attached-workspace/generation/CaptionWorkspace.tsx'),
      'utf8',
    );
    expect(caption).toContain('toastError');
  });

  it('VideoWorkspace / ClipEditor 关键失败 toastError', () => {
    const video = readFileSync(
      resolve(engine, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(video).toMatch(/Bridge 续拍需要源视频[\s\S]*toastError/);
    expect(video).toMatch(/视频任务标成功但未返回 URL[\s\S]*toastError/);

    const clip = read('blocks/core/ClipEditorBlock.tsx');
    expect(clip).toMatch(/渲染恢复失败[\s\S]*toastError/);
    expect(clip).toMatch(/智能编排失败[\s\S]*toastError/);
    expect(clip).toMatch(/渲染失败[\s\S]*toastError/);

    const flow = readFileSync(resolve(engine, 'FlowSurface.tsx'), 'utf8');
    expect(flow).toMatch(/Cascade 中断[\s\S]*toastError/);
    expect(flow).toContain('本地投放部分失败');
  });
});
