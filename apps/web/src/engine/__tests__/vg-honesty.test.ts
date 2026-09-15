import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '..');

describe('VG-02/04/10 端到端接线锁定', () => {
  it('VG-02 组装器把首尾帧写入 lastFrameUrl', () => {
    const src = readFileSync(resolve(webSrc, 'clip-gen-request.ts'), 'utf8');
    expect(src).toContain("mode === 'keyframe'");
    expect(src).toContain('lastFrameUrl');
    expect(src).toContain('endFrameUrl');
  });

  it('VG-04 工作台有声开关进入请求体，网关映射 generate_audio', () => {
    const chips = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoParamChips.tsx'),
      'utf8',
    );
    expect(chips).toContain('generateAudio');
    const assembler = readFileSync(resolve(webSrc, 'clip-gen-request.ts'), 'utf8');
    expect(assembler).toContain('generateAudio:');
    const gateway = readFileSync(
      resolve(__dirname, '../../../../server/src/modules/gateway/video-payload.util.ts'),
      'utf8',
    );
    expect(gateway).toContain('payload.generate_audio');
  });

  it('VG-10 A 路径 pendingVideoTasks 落盘且工作台有继续查询', () => {
    const core = readFileSync(resolve(webSrc, 'core-pipeline-runner.ts'), 'utf8');
    expect(core).toContain('pendingVideoTasks');
    expect(core).toContain('resumePendingVideoTasks');
    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('resumePendingVideoTasks');
    expect(ws).toContain('继续查询');
  });

  it('VG-10+ 打开工作台自动恢复 + 卡面显示待恢复徽章', () => {
    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('autoResumedRef');
    expect(ws).toContain('检测到');
    expect(ws).toContain('自动查询中');
    const card = readFileSync(resolve(webSrc, '../blocks/core/ClipGenBlock.tsx'), 'utf8');
    expect(card).toContain('pendingCount');
    expect(card).toContain('待恢复视频任务');
    expect(card).toContain("res.status === 'success' && res.url");
  });

  it('级联/导演批出无视频禁止空成功；Bridge 抽帧校验 ok', () => {
    const ops = readFileSync(resolve(webSrc, 'flow-runner-ops/clip-gen-ops.ts'), 'utf8');
    expect(ops).toContain('级联出片无可用视频，禁止空成功');
    expect(ops).toContain('导演批出无可用视频，禁止空成功');
    expect(ops).toContain('!framesRes.ok || !framesRes.frames?.length');
    expect(ops).toContain('导演关键帧批次缺少画布上下文，禁止空成功');
    expect(ops).toContain('关键帧门禁未找到上游链镜表，禁止空成功');
    expect(ops).toContain('导演关键帧批次的 source chain 已断开，禁止空成功');
    expect(ops).toContain('镜视频生成失败，已保留批次回执供重试，禁止空成功');
  });

  it('Bridge 续拍缺源视频 / 导演锁参考禁止空成功', () => {
    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('Bridge 续拍需要源视频：请连接上游视频节点或上传源片，禁止空成功');
    expect(ws).toContain('Bridge 续拍已阻断：缺少源视频，禁止空成功');
    const desk = readFileSync(resolve(webSrc, '../blocks/core/DirectorDeskBlock.tsx'), 'utf8');
    expect(desk).toContain('设定未就绪，锁参考禁止批出，禁止空成功');
    expect(desk).toContain('请先在编剧台「设定就绪」标记放行，禁止空成功');
    expect(desk).toContain('无法批准（缺关键帧），禁止空成功');
    expect(desk).toContain('未连接 clip-gen，无法推送关键帧批次，禁止空成功');
    expect(desk).toContain('没有可交付的视频关键帧，禁止空成功');
    expect(desk).toContain('请先勾选镜头，禁止空成功');
    expect(desk).toContain('没有失败镜头，禁止空成功');
    expect(desk).toContain('无法写回上游链镜表（未连接分镜台？），禁止空成功');
    expect(desk).toContain('无法撤回批准，禁止空成功');
    expect(desk).toContain('打回需填写原因，禁止空成功');
    expect(desk).toContain('没有可导出的关键帧 URL，禁止空成功');
    expect(desk).toContain('镜不可拍（参考/定妆缺失），已阻止批出，禁止空成功');
    expect(desk).toContain('failHonest');
    expect(desk).toContain('toastError');
  });
});
