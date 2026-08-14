# -*- coding: utf-8 -*-
import io

path = r'F:\code\project\NX9\apps\web\src\engine\stage-deck\chrome\attached-workspace\generation\picture\picture-gen-modes.ts'
with io.open(path, 'r', encoding='utf-8') as f:
    text = f.read()

crlf = '\r\n' in text
text = text.replace('\r\n', '\n')

anchor = "  if (data.useImageReference) return 'image-to-image';\n  return 'text-to-image';\n}"
insert = """  if (data.useImageReference) return 'image-to-image';
  return 'text-to-image';
}

/**
 * PG-37: 工作区运行只写 runPrompt，不污染用户 content。
 * flow-runner 对 picture-gen 优先取 runPrompt，缺失时才回退 content。
 */
export function resolvePictureGenRunPrompt(
  data: Record<string, unknown>,
): string | undefined {
  const run = data.runPrompt;
  if (typeof run === 'string' && run.trim()) return run;
  const content = data.content;
  return typeof content === 'string' ? content : undefined;
}
"""
idx = text.find(anchor)
if idx < 0:
    raise SystemExit('NOT FOUND: picture-gen-modes readPictureGenMode anchor')
if text.find(anchor, idx + len(anchor)) >= 0:
    raise SystemExit('MULTIPLE: picture-gen-modes anchor')
text = text[:idx] + insert + text[idx + len(anchor):]

if crlf:
    text = text.replace('\n', '\r\n')
with io.open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('picture-gen-modes resolvePictureGenRunPrompt applied')
