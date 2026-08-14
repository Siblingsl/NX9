from pathlib import Path

p = Path(r'F:\code\project\NX9\apps\web\src\engine\__tests__\se-deep-honesty.test.ts')
s = p.read_bytes().decode('utf-8-sig')
norm = s.replace('\r\n', '\n')

old = """describe('SE-SPEC-02/05 诚实边界', () => {
  it('未接入跨帧追踪与多供应商时面板明示', () => {
    const src = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(src).toContain('未接入跨帧自动追踪');
    expect(src).toContain('当前仅 WAN VACE 单供应商');
  });
});"""

new = """describe('SE-SPEC-02/05 诚实终态', () => {
  it('无跨帧追踪供应商时直接替换路径禁用且明示', () => {
    const registry = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/data/provider-registry.ts'),
      'utf8',
    );
    expect(registry).toContain('supportsFrameTracking: boolean');
    expect(registry).toContain('supportsFrameTracking: false');
    const src = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(src).toContain('hasVideoEditFrameTracking');
    expect(src).toContain(
      "disabled={busy || (replaceMode === 'direct' && !hasVideoEditFrameTracking)}",
    );
    expect(src).toContain('未接入跨帧自动追踪');
    expect(src).toContain('视频级直接替换当前不可用');
  });

  it('单供应商注册表、UI 与服务端拒绝一致', () => {
    const registry = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/data/provider-registry.ts'),
      'utf8',
    );
    expect(registry).toContain('VIDEO_EDIT_PROVIDERS');
    expect(registry).toContain("id: 'wan-vace'");
    const panel = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(panel).toContain('videoEditProviders.length < 2');
    expect(panel).toContain('不会自动切换供应商');
    const service = readFileSync(
      resolve(webSrc, '../../../../apps/server/src/modules/montage/video-edit.service.ts'),
      'utf8',
    );
    expect(service).toContain('未知视频编辑供应商');
    expect(service).toContain('VIDEO_EDIT_PROVIDERS.some');
  });
});

describe('SE-DEEP-12 beat-cut 能力诚实元数据', () => {
  it('beat-cut 建议带算法元数据且 notes 明示未做音频听感', () => {
    const src = readFileSync(resolve(webSrc, 'smart-edit-orchestrator.ts'), 'utf8');
    expect(src).toContain("algorithm: 'reference-shot-durations'");
    expect(src).toContain('audioAnalyzed: false');
    expect(src).toContain('未做音频听感');
    const shared = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/types/smart-edit.ts'),
      'utf8',
    );
    expect(shared).toContain('audioAnalyzed?: boolean');
  });
});"""

if old not in norm:
    raise SystemExit('MISSING old block')
norm = norm.replace(old, new, 1)
out = norm.replace('\n', '\r\n')
p.write_bytes(out.encode('utf-8-sig' if s.startswith('\ufeff') else 'utf-8'))
print('patched se-deep-honesty.test.ts')
