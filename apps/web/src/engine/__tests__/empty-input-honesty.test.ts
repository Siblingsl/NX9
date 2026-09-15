/**
 * 空输入 / 参考视频反推空表诚实门禁。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = resolve(__dirname, '..');

describe('空输入与参考反推诚实门禁', () => {
  it('tool-ops / picture / preview 空输入拒成功', () => {
    const tool = readFileSync(resolve(engine, 'flow-runner-ops/tool-ops.ts'), 'utf8');
    expect(tool).toContain('Workflow JSON 为空，禁止空成功');
    expect(tool).toContain('字幕为空，禁止空成功');
    expect(tool).toContain('链接为空，禁止空成功');
    expect(tool).toContain('Workflow JSON 解析失败，禁止空成功');
    expect(readFileSync(resolve(engine, 'picture-gen-runner.ts'), 'utf8')).toContain(
      'Prompt 为空，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'storyboard-preview-runner.ts'), 'utf8')).toContain(
      'Prompt 为空，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'storyboard-preview-runner.ts'), 'utf8')).toContain(
      '请先描述全景场景，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'flow-runner-ops/base-ops.ts'), 'utf8')).toContain(
      '编剧台缺少成稿文本，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'clip-editor-render.ts'), 'utf8')).toContain(
      'Hyperframes 任务提交失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8')).toContain(
      'BGM 任务提交失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8')).toContain(
      '配音：无可解析的对白，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8')).toContain(
      '请输入 BGM 描述，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8')).toContain(
      'BGM 服务未配置。请先在设置→BGM 填写 Suno 兼容 Base URL 与 API Key，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8')).toContain(
      '查询任务状态失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-breakdown-runner.ts'), 'utf8')).toContain(
      '请先输入剧本原文，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-breakdown-runner.ts'), 'utf8')).toContain(
      '请至少选择一集再生成，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-breakdown-runner.ts'), 'utf8')).toContain(
      '所选分集没有正文，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'inpaint-edit-runner.ts'), 'utf8')).toContain(
      '局部重绘：需要上游图片，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'storyboard-preview-runner.ts'), 'utf8')).toContain(
      'LLM 返回无法解析为评分 JSON，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'storyboard-sheet-compose.ts'), 'utf8')).toContain(
      '无法创建画布，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'stage-deck/utils/workflow-zip.ts'), 'utf8')).toContain(
      'ZIP 缺少 workspace.json，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'stage-deck/utils/workflow-zip.ts'), 'utf8')).toContain(
      'ZIP 内嵌资源全部上传失败',
    );
    expect(readFileSync(resolve(engine, 'FlowSurface.tsx'), 'utf8')).toContain(
      '本地投放全部失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'character-sheet-crop.ts'), 'utf8')).toContain(
      'Canvas 不可用，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'entity-sheet-crop.ts'), 'utf8')).toContain(
      'Canvas 不可用，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'storyboard-sheet-compose.ts'), 'utf8')).toContain(
      '没有可拼接的分镜，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-desk-runner.ts'), 'utf8')).toContain(
      '生成剧本前必须先选择人物与全片视觉风格，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-desk-runner.ts'), 'utf8')).toContain(
      '集不存在，禁止空成功',
    );
  });

  it('uploadAsset 无 url / 解析失败禁止空成功', () => {
    const src = readFileSync(resolve(engine, '../api/client.ts'), 'utf8');
    expect(src).toContain('上传失败或未返回 URL，禁止空成功');
    expect(src).toContain('上传响应解析失败，禁止空成功');
    expect(src).toContain('LLM stream response body missing，禁止空成功');
    expect(
      readFileSync(resolve(engine, '../blocks/shared/ImageUploadSlot.tsx'), 'utf8'),
    ).toContain('上传失败或未返回 URL，禁止空成功');
    expect(
      readFileSync(
        resolve(engine, 'stage-deck/chrome/attached-workspace/generation/video/VideoFrameStrip.tsx'),
        'utf8',
      ),
    ).toContain('首尾帧上传失败或未返回 URL，禁止空成功');
    expect(
      readFileSync(
        resolve(engine, '../blocks/craft/storyboard-desk/shot-story-cell.tsx'),
        'utf8',
      ),
    ).toContain('分镜图上传失败或未返回 URL，禁止空成功');
    expect(
      readFileSync(
        resolve(engine, '../panels/asset-library/modal/use-asset-library-generation.ts'),
        'utf8',
      ),
    ).toContain('角色视图上传失败或未返回 URL，禁止空成功');
    expect(
      readFileSync(resolve(engine, '../blocks/core/SoundGenBlock.tsx'), 'utf8'),
    ).toContain('参考音频上传失败，禁止空成功');
  });

  it('video playbook / director3d 空前置禁止空成功', () => {
    expect(
      readFileSync(
        resolve(engine, 'stage-deck/chrome/attached-workspace/generation/video/video-playbooks.ts'),
        'utf8',
      ),
    ).toContain('missing playbook');
    expect(
      readFileSync(
        resolve(engine, 'stage-deck/chrome/attached-workspace/generation/video/video-playbooks.ts'),
        'utf8',
      ),
    ).toMatch(/missing playbook[\s\S]*禁止空成功/);
    expect(readFileSync(resolve(engine, 'agent-director3d-bridge.ts'), 'utf8')).toContain(
      '未绑定当前镜头角色',
    );
    expect(readFileSync(resolve(engine, 'agent-director3d-bridge.ts'), 'utf8')).toMatch(
      /未绑定当前镜头角色[\s\S]*禁止空成功/,
    );
    expect(readFileSync(resolve(engine, 'agent-director3d-bridge.ts'), 'utf8')).toContain(
      '未确认 Agent 摆位变更，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'agent-director3d-bridge.ts'), 'utf8')).toContain(
      'Agent 摆位镜头已切换，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'agent-director3d-bridge.ts'), 'utf8')).toContain(
      'Agent 摆位基准版本已过期，请重新生成，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director3d-host-controller.tsx'), 'utf8')).toContain(
      'Agent 摆位应用失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director3d-host-controller.tsx'), 'utf8')).toContain(
      '镜头已切换，请重新记录候选帧，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director3d-host-controller.tsx'), 'utf8')).toContain(
      '候选帧上传失败或未返回 URL，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director3d-host-controller.tsx'), 'utf8')).toContain(
      '3D 资源上传失败或未返回 URL，禁止空成功',
    );
  });
});
