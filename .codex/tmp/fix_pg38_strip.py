# -*- coding: utf-8 -*-
import io
import sys

path = r'F:\code\project\NX9\apps\web\src\engine\stage-deck\chrome\attached-workspace\generation\picture\PictureUpstreamStrip.tsx'
with io.open(path, 'r', encoding='utf-8') as f:
    text = f.read()

crlf = '\r\n' in text
text = text.replace('\r\n', '\n')

def replace_once(old, new, label):
    global text
    idx = text.find(old)
    if idx < 0:
        raise SystemExit('NOT FOUND: ' + label)
    if text.find(old, idx + len(old)) >= 0:
        raise SystemExit('MULTIPLE: ' + label)
    text = text[:idx] + new + text[idx + len(old):]

replace_once(
    "export type PictureRefSource = 'upload' | 'upstream';",
    "export type PictureRefSource = 'upload' | 'upstream' | 'injected';",
    'source-type',
)

replace_once(
    "  /** PG-03: 风格参考图（styleImageUrl）标记 */\n  role?: 'style';",
    "  /** PG-03: 风格参考图（styleImageUrl）标记；PG-38: 注入参考角色 */\n  role?: 'style' | 'character' | 'environment';",
    'role-type',
)

replace_once(
    "  const uploadCount = visible.filter((i) => i.source === 'upload').length;\n  const upstreamCount = visible.filter((i) => i.source === 'upstream').length;",
    "  const uploadCount = visible.filter((i) => i.source === 'upload').length;\n  const upstreamCount = visible.filter((i) => i.source === 'upstream').length;\n  const injectedCount = visible.filter((i) => i.source === 'injected').length;",
    'injected-count',
)

replace_once(
    "          {uploadCount > 0 && upstreamCount > 0\n            ? `上传 ${uploadCount} · 上游 ${upstreamCount} · 点击 @ · 拖出钉板`\n            : uploadCount > 0\n              ? '本节点上传 · 拖出钉板'\n              : '点击 @ · 拖出钉板'}",
    "          {injectedCount > 0\n            ? `注入 ${injectedCount} · 定妆/场景 · 可排除`\n            : uploadCount > 0 && upstreamCount > 0\n              ? `上传 ${uploadCount} · 上游 ${upstreamCount} · 点击 @ · 拖出钉板`\n              : uploadCount > 0\n                ? '本节点上传 · 拖出钉板'\n                : '点击 @ · 拖出钉板'}",
    'injected-summary',
)

replace_once(
    "            const label =\n              item.role === 'style'\n                ? '风格'\n                : source === 'upload'\n                  ? `参考${index + 1}`\n                  : `上游${index + 1}`;",
    "            const label =\n              item.role === 'style'\n                ? '风格'\n                : item.role === 'character'\n                  ? '定妆'\n                  : item.role === 'environment'\n                    ? '场景'\n                    : source === 'upload'\n                      ? `参考${index + 1}`\n                      : source === 'injected'\n                        ? '注入'\n                        : `上游${index + 1}`;",
    'injected-label',
)

replace_once(
    "                title={\n                  item.role === 'style'\n                    ? '风格参考图 · 控制画风，不作主体'\n                    : source === 'upload'\n                      ? `${label} · 本节点上传 · 拖出钉到画布`\n                      : `点击插入 @上游:图${index + 1} · 拖出钉到画布`\n                }",
    "                title={\n                  item.role === 'style'\n                    ? '风格参考图 · 控制画风，不作主体'\n                    : item.role === 'character'\n                      ? '注入 · 角色定妆 · 可排除'\n                      : item.role === 'environment'\n                        ? '注入 · 场景参考 · 可排除'\n                        : source === 'upload'\n                          ? `${label} · 本节点上传 · 拖出钉到画布`\n                          : source === 'injected'\n                            ? '注入参考 · 角色/场景 · 可排除'\n                            : `点击插入 @上游:图${index + 1} · 拖出钉到画布`\n                }",
    'injected-title',
)

replace_once(
    "                {source === 'upstream' && onExcludeUpstream ? (",
    "                {(source === 'upstream' || source === 'injected') && onExcludeUpstream ? (",
    'injected-exclude',
)

if crlf:
    text = text.replace('\n', '\r\n')
with io.open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('PictureUpstreamStrip PG-38 applied')
