# -*- coding: utf-8 -*-
"""VG-40 补充：imageUrl 为空时不进入请求体。"""
import io

p = r'F:\code\project\NX9\apps\web\src\engine\clip-gen-request.ts'
s = io.open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
old = """  const body: Record<string, unknown> = {
    prompt,
    model,
    imageUrl,
    duration: videoParams.durationSec,""".replace('\n', nl)
new = """  const body: Record<string, unknown> = {
    prompt,
    model,
    ...(imageUrl ? { imageUrl } : {}),
    duration: videoParams.durationSec,""".replace('\n', nl)
assert s.count(old) == 1, s.count(old)
io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new, 1))
print('patched body imageUrl conditional')
