/**
 * 宫格 / 联系表 / 照片说话：空产物禁止 ok:true。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('grid / contact-sheet / photo-speak 空成功门禁', () => {
  it('宫格生成与单镜线稿校验 url', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/grid/grid.service.ts'),
      'utf8',
    );
    expect(src).toContain('宫格生成未返回图片，禁止空成功');
    expect(src).toContain('单镜线稿未返回图片，禁止空成功');
    expect(src).toContain('图片尺寸不足以切分，禁止空成功');
  });

  it('联系表镜头为空禁止空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/montage/montage.service.ts'),
      'utf8',
    );
    expect(src).toContain('联系表镜头为空，禁止空成功');
    expect(src).toContain('音频解码失败');
    expect(src).toContain('未检测到节拍，禁止空成功');
    expect(src).toMatch(/音频解码失败[\s\S]*禁止空成功/);
  });

  it('照片说话校验 TTS 与成片文件', () => {
    const montage = readFileSync(
      resolve(__dirname, '../src/modules/montage/montage.service.ts'),
      'utf8',
    );
    expect(montage).toContain('TTS 未返回音频，禁止空成功');
    expect(montage).toContain('TTS 音频文件未写出，禁止空成功');
    expect(montage).toContain('口播文本为空，禁止空成功');
    expect(montage).toContain('无可用视频片段，禁止空成功');
    expect(montage).toContain('LLM 未返回可解析的 JSON，禁止空成功');
    expect(montage).toContain('照片说话成片未写出，禁止空成功');
    expect(montage).toContain('混音产物未写出，禁止空成功');
    expect(montage).toContain('调色产物未写出，禁止空成功');
    expect(montage).toContain('变速产物未写出，禁止空成功');
    expect(montage).toContain('单镜渲染产物未写出，禁止空成功');
    expect(montage).toContain('整集合成产物未写出，禁止空成功');
    expect(montage).toContain('剪辑合成产物未写出，禁止空成功');
    expect(montage).toContain('联系表产物未写出，禁止空成功');
  });

  it('HyperFrames 成片落盘校验', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/montage/hyperframes.renderer.ts'), 'utf8');
    expect(src).toContain('HyperFrames 成片未写出，禁止空成功');
    const svc = readFileSync(resolve(__dirname, '../src/modules/montage/hyperframes.service.ts'), 'utf8');
    expect(svc).toContain('HyperFrames producer 无 render，禁止空成功');
  });

  it('image-ops 写盘后校验产物存在', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/image-ops/image-ops.service.ts'), 'utf8');
    expect(src).toContain('缩放产物未写出，禁止空成功');
    expect(src).toContain('拼贴产物未写出，禁止空成功');
    expect(src).toContain('放大产物未写出，禁止空成功');
    expect(src).toContain('元数据清理产物未写出，禁止空成功');
    expect(src).toContain('封面合成产物未写出，禁止空成功');
  });

  it('tools capture/proxy 空内容与落盘校验', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/tools/tools.controller.ts'), 'utf8');
    expect(src).toContain('采集内容为空，禁止空成功');
    expect(src).toContain('采集产物未写出，禁止空成功');
    expect(src).toContain('下载内容为空，禁止空成功');
    expect(src).toContain('下载产物未写出，禁止空成功');
  });

  it('资产上传拒空文件', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/assets/assets.controller.ts'), 'utf8');
    expect(src).toContain('上传文件为空，禁止空成功');
    expect(src).toContain('No file，禁止空成功');
  });

  it('宫格拆合 / 深度通道 / Topaz 落盘校验', () => {
    const grid = readFileSync(resolve(__dirname, '../src/modules/grid/grid.service.ts'), 'utf8');
    expect(grid).toContain('宫格拆分产物未写出');
    expect(grid).toContain('宫格合成产物未写出，禁止空成功');
    const montage = readFileSync(resolve(__dirname, '../src/modules/montage/montage.service.ts'), 'utf8');
    expect(montage).toContain('深度通道产物未写出，禁止空成功');
    expect(montage).toContain('深度视频产物未写出，禁止空成功');
    expect(montage).toContain('未检测到 FFmpeg，无法整集合成，禁止空成功');
    expect(montage).toContain('至少需要 2 条音频轨');
    expect(montage).toContain('禁止空成功');
    const topaz = readFileSync(resolve(__dirname, '../src/modules/topaz/topaz.service.ts'), 'utf8');
    expect(topaz).toContain('Topaz 放大产物未写出，禁止空成功');
    expect(topaz).toContain('Topaz Video 产物未写出，禁止空成功');
    expect(topaz).toContain('Gigapixel 未产生输出文件，禁止空成功');
    expect(topaz).toContain('未检测到 Gigapixel AI');
    expect(topaz).toMatch(/未检测到 Gigapixel AI[\s\S]*禁止空成功/);
    expect(topaz).toMatch(/未检测到 Topaz Video AI[\s\S]*禁止空成功/);
  });

  it('图层分离 / 视频编辑 / 网关图生落盘校验', () => {
    const imageOps = readFileSync(resolve(__dirname, '../src/modules/image-ops/image-ops.service.ts'), 'utf8');
    expect(imageOps).toContain('图层分离产物未写出，禁止空成功');
    expect(imageOps).toContain('未找到可分离的主体边界，禁止空成功');
    expect(imageOps).toContain('无有效图片，禁止空成功');
    const videoEdit = readFileSync(resolve(__dirname, '../src/modules/montage/video-edit.service.ts'), 'utf8');
    expect(videoEdit).toContain('远程视频内容为空，禁止空成功');
    expect(videoEdit).toContain('视频编辑产物未写出，禁止空成功');
    expect(videoEdit).toContain('Fal storage 未返回 upload_url/storage_url，禁止空成功');
    expect(videoEdit).toContain('Fal 未返回 request_id，禁止空成功');
    expect(videoEdit).toContain('Fal 追踪未返回 request_id，禁止空成功');
    expect(videoEdit).toContain('videoUrl 与 prompt 必填，禁止空成功');
    expect(videoEdit).toContain('Fal 结果无视频地址');
    expect(videoEdit).toContain('Fal 追踪结果无 mask 视频地址');
    expect(videoEdit).toMatch(/Fal 结果无视频地址[\s\S]*禁止空成功/);
    expect(videoEdit).toMatch(/Fal 追踪结果无 mask 视频地址[\s\S]*禁止空成功/);
    expect(videoEdit).toMatch(/Fal storage 上传初始化失败[\s\S]*禁止空成功/);
    expect(videoEdit).toMatch(/Fal 结果获取失败[\s\S]*禁止空成功/);
    expect(videoEdit).toMatch(/Fal 追踪结果获取失败[\s\S]*禁止空成功/);
    expect(videoEdit).toMatch(/视频下载失败: HTTP[\s\S]*禁止空成功/);
    expect(videoEdit).toContain('视频级替换超时（20 分钟），禁止空成功');
    expect(videoEdit).toContain('跨帧追踪超时（20 分钟），禁止空成功');
    expect(videoEdit).toMatch(/Fal 任务状态:[\s\S]*禁止空成功/);
    expect(videoEdit).toMatch(/Fal 追踪任务状态:[\s\S]*禁止空成功/);
    const grid = readFileSync(resolve(__dirname, '../src/modules/grid/grid.service.ts'), 'utf8');
    expect(grid).toContain('无有效图片，禁止空成功');
    const gateway = readFileSync(resolve(__dirname, '../src/modules/gateway/gateway.service.ts'), 'utf8');
    expect(gateway).toContain('视频产物未写出，禁止空成功');
    expect(gateway).toContain('请在设置中配置 Fal.ai API Key（primaryApiKey），禁止空成功');
    expect(gateway).toMatch(/Fal 任务失败：[\s\S]*禁止空成功/);
    expect(gateway).toContain('Fal 任务轮询超时（90s），请稍后在客户端重试查询，禁止空成功');
  });

  it('导出清单 CSV/HTML/PDF 落盘校验', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/export/export-manifest.service.ts'),
      'utf8',
    );
    expect(src).toContain('CSV 产物未写出，禁止空成功');
    expect(src).toContain('HTML 产物未写出，禁止空成功');
    expect(src).toContain('PDF 产物未写出，禁止空成功');
  });
});
