# -*- coding: utf-8 -*-
"""VG-40: 普通出片用例显式切到 image-to-video，保留高级参数覆盖。"""
import io

p = r'F:\code\project\NX9\apps\web\src\engine\__tests__\clip-gen-request.test.ts'
s = io.open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
old = """      data: {
        model: 'veo',
        seed: 42,""".replace('\n', nl)
new = """      data: {
        model: 'veo',
        videoGenMode: 'image-to-video',
        seed: 42,""".replace('\n', nl)
assert s.count(old) == 1, s.count(old)
io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new, 1))
print('patched image-to-video mode in test')
