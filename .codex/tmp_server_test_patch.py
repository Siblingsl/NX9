from pathlib import Path

p = Path(r'F:\code\project\NX9\apps\server\test\video-edit-service.test.ts')
s = p.read_bytes().decode('utf-8-sig')
norm = s.replace('\r\n', '\n')

old = """  it('本地媒体经 Fal storage 上传，禁止整段 base64', () => {
    expect(service).toContain('rest.alpha.fal.ai/storage/upload/init');
    expect(service).toContain('fs.createReadStream(local)');
    expect(service).not.toMatch(/data:[^;]+;base64/);
    expect(service).not.toContain('base64,');
  });
});"""

new = """  it('本地媒体经 Fal storage 上传，禁止整段 base64', () => {
    expect(service).toContain('rest.alpha.fal.ai/storage/upload/init');
    expect(service).toContain('fs.createReadStream(local)');
    expect(service).not.toMatch(/data:[^;]+;base64/);
    expect(service).not.toContain('base64,');
  });

  it('未知 providerId 明确失败，不静默回落到默认供应商', () => {
    expect(service).toContain('未知视频编辑供应商');
    expect(service).toContain('VIDEO_EDIT_PROVIDERS.some((p) => p.id === body.providerId)');
  });
});"""

if old not in norm:
    raise SystemExit('MISSING old block')
norm = norm.replace(old, new, 1)
p.write_bytes(norm.replace('\n', '\r\n').encode('utf-8-sig' if s.startswith('\ufeff') else 'utf-8'))
print('patched video-edit-service.test.ts')
