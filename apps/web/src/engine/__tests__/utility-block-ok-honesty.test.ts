/**
 * 工具块卡面 Run：API 返回 ok:false / 无 url 时禁止写入 success。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const blocks = resolve(__dirname, '../../blocks');
const workspace = resolve(__dirname, '../stage-deck/chrome/attached-workspace');

function read(rel: string): string {
  return readFileSync(resolve(blocks, rel), 'utf8');
}

function readWs(rel: string): string {
  return readFileSync(resolve(workspace, rel), 'utf8');
}

describe('utility 块 UI 路径诚实门禁', () => {
  it('BgRemove / Upscale / Watermark / Topaz 校验 ok，禁止空成功', () => {
    expect(read('utility/BgRemoveBlock.tsx')).toContain('禁止空成功');
    expect(read('utility/BgRemoveBlock.tsx')).toContain('抠图：请连接上游图片，禁止空成功');
    expect(read('utility/UpscaleLiteBlock.tsx')).toContain('禁止空成功');
    expect(read('utility/UpscaleLiteBlock.tsx')).toContain('放大：请连接上游图片，禁止空成功');
    expect(read('utility/panels/UpscaleLitePanel.tsx')).toContain('禁止空成功');
    expect(read('support/WatermarkCleanBlock.tsx')).toContain('禁止空成功');
    expect(read('support/WatermarkCleanBlock.tsx')).toContain('去水印：请连接上游图片，禁止空成功');
    expect(read('utility/panels/WatermarkCleanPanel.tsx')).toContain('禁止空成功');
    expect(read('utility/TopazPictureBlock.tsx')).toContain('禁止空成功');
    expect(read('utility/TopazPictureBlock.tsx')).toContain('Topaz 图像：缺少上游图片，禁止空成功');
    expect(read('utility/TopazClipBlock.tsx')).toContain('禁止空成功');
    expect(read('utility/TopazClipBlock.tsx')).toContain('Topaz 视频：缺少上游视频，禁止空成功');
    expect(read('utility/panels/TopazPicturePanel.tsx')).toContain('禁止空成功');
    expect(read('utility/panels/TopazClipPanel.tsx')).toContain('禁止空成功');
    expect(read('shared/image-local-clarity.ts')).toContain('Canvas 不可用，禁止空成功');
    expect(read('shared/image-crop.ts')).toContain('Canvas 不可用，禁止空成功');
  });

  it('SmartReplace / utility / ClipGen 失败 toastError', () => {
    expect(read('core/clip-editor/SmartReplacePanel.tsx')).toContain('toastError');
    expect(read('core/clip-editor/SmartReplacePanel.tsx')).toContain(
      '上次替换任务完成但无输出地址，禁止空成功',
    );
    expect(read('utility/BgRemoveBlock.tsx')).toContain('toastError');
    expect(read('utility/UpscaleLiteBlock.tsx')).toContain('toastError');
    expect(read('utility/TopazPictureBlock.tsx')).toContain('toastError');
    expect(read('utility/TopazClipBlock.tsx')).toContain('toastError');
    expect(read('support/WatermarkCleanBlock.tsx')).toContain('toastError');
    expect(read('core/ClipGenBlock.tsx')).toContain('toastError');
    expect(read('core/SoundGenBlock.tsx')).toMatch(/AI 配音失败[\s\S]*toastError/);
    expect(read('core/DirectorDeskBlock.tsx')).toContain('导演台批出 · 失败');
  });
});

describe('工作区 UI 路径诚实门禁', () => {
  it('链接解析 / 采集 / 导入 / 字幕 ASR / 宫格拼接禁止空成功', () => {
    expect(readWs('tool/LinkParserWorkspace.tsx')).toContain('链接解析失败或结果为空，禁止空成功');
    expect(readWs('tool/LinkParserWorkspace.tsx')).toContain('素材采集失败，禁止空成功');
    expect(readWs('tool/LinkParserWorkspace.tsx')).toContain('素材库导入为空，禁止空成功');
    expect(readWs('tool/LinkParserWorkspace.tsx')).toContain('链接解析：请输入 URL，禁止空成功');
    expect(readWs('generation/CaptionWorkspace.tsx')).toContain('语音转字幕失败或结果为空，禁止空成功');
    expect(readWs('tool/GridComposeWorkspace.tsx')).toContain('宫格合成失败，禁止空成功');
    expect(readWs('tool/GridComposeWorkspace.tsx')).toContain(
      '宫格拼接：请上传图片或连接上游，禁止空成功',
    );
    expect(readWs('tool/GridComposeWorkspace.tsx')).toContain('上传失败，禁止空成功');
    expect(readWs('tool/GridComposeWorkspace.tsx')).toContain('toastError');
    expect(readWs('tool/LinkParserWorkspace.tsx')).toContain('toastError');
    expect(readWs('generation/CaptionWorkspace.tsx')).toContain('toastError');
    expect(readWs('generation/InpaintWorkspace.tsx')).toContain(
      '局部重绘：请输入 prompt，禁止空成功',
    );
    expect(readWs('generation/InpaintWorkspace.tsx')).toContain('蒙版上传失败，禁止空成功');
  });

  it('连贯性自动修复失败 toastError', () => {
    const src = read('nx9/ContinuityCheckBlock.tsx');
    expect(src).toContain('toastError(`连贯性修复失败:');
  });

  it('ExportPack 单集合成无 URL 禁止空成功', () => {
    expect(read('nx9/ExportPackBlock.tsx')).toContain('禁止空成功');
    expect(read('nx9/ExportPackBlock.tsx')).toContain('导出未返回成片 URL，禁止空成功');
    expect(read('nx9/ExportPackBlock.tsx')).toContain('无有效时间线，无法导出成片，禁止空成功');
    expect(read('nx9/ExportPackBlock.tsx')).toContain('无连接链镜表，禁止空成功');
    expect(read('nx9/ExportPackBlock.tsx')).toContain('单集合成：无连接链镜表，禁止空成功');
    expect(read('nx9/VoiceCastBlock.tsx')).toContain('配音：无可解析的对白，禁止空成功');
    expect(read('core/SoundGenBlock.tsx')).toContain('参考音频上传失败，禁止空成功');
  });

  it('SmartReplace 局部重绘 / 图像编辑校验 ok，禁止空成功', () => {
    const src = read('core/clip-editor/SmartReplacePanel.tsx');
    expect(src).toContain('局部重绘失败，禁止空成功');
    expect(src).toContain('图像编辑无结果，禁止空成功');
    expect(src).toContain('蒙版上传失败，禁止空成功');
    expect(src).toContain('抽帧失败，请确认 FFmpeg 可用，禁止空成功');
    expect(src).toContain('视频替换失败，禁止空成功');
    expect(src).toContain('跨帧追踪失败');
    expect(src).toMatch(/跨帧追踪失败：[\s\S]*禁止空成功/);
  });

  it('分镜故事板大图上传无 url 禁止空成功', () => {
    expect(read('craft/storyboard-desk/sheet-export-ops.ts')).toContain(
      '故事板大图上传失败，禁止空成功',
    );
    expect(read('craft/storyboard-desk/sheet-export-ops.ts')).toContain(
      '暂无镜表可导出，禁止空成功',
    );
    expect(read('craft/storyboard-desk/sheet-export-ops.ts')).toContain(
      '分镜台：没有可合成的镜头，禁止空成功',
    );
  });

  it('分镜拖入服装 / 资产健康写回 / Bible 推送空前置禁止空成功', () => {
    expect(read('craft/storyboard-desk/grid-panel.tsx')).toContain(
      '请先为本镜绑定角色，再拖入服装，禁止空成功',
    );
    expect(read('craft/storyboard-desk/shot-writeback-ops.ts')).toContain(
      '不能删除本集全部镜头，请保留至少 1 镜，禁止空成功',
    );
    const panels = resolve(__dirname, '../../panels');
    expect(readFileSync(resolve(panels, 'asset-library/AssetHealthBar.tsx'), 'utf8')).toContain(
      '画布未就绪，无法写回分镜，禁止空成功',
    );
    expect(readFileSync(resolve(panels, 'asset-library/AssetHealthBar.tsx'), 'utf8')).toContain(
      '未找到可修复的镜表引用，禁止空成功',
    );
    expect(readFileSync(resolve(panels, 'asset-library/AssetHealthBar.tsx'), 'utf8')).toContain(
      '未找到可修复的声音引用，禁止空成功',
    );
    expect(readFileSync(resolve(panels, 'asset-library/AssetHealthBar.tsx'), 'utf8')).toContain(
      '未找到可修复的服装引用，禁止空成功',
    );
    expect(readFileSync(resolve(panels, 'asset-library/ScreenplaySupportPanel.tsx'), 'utf8')).toContain(
      '画布上未找到编剧台，无法回写 Bible，禁止空成功',
    );
    expect(readFileSync(resolve(panels, 'asset-library/ScreenplaySupportPanel.tsx'), 'utf8')).toContain(
      '缺少可推送的库条目，禁止空成功',
    );
    expect(
      readFileSync(resolve(panels, 'asset-library/modal/AssetDetailSoundView.tsx'), 'utf8'),
    ).toContain('未找到目标角色，禁止空成功');
    expect(
      readFileSync(resolve(panels, 'asset-library/modal/use-asset-library-generation.ts'), 'utf8'),
    ).toContain('服装设定板：请先导入到私有项目库再生成，禁止空成功');
  });
});
