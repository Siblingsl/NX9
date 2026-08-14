# -*- coding: utf-8 -*-
"""修正 flow-runner：删除误插行，并把 model 传给导演批次消费。"""
import io

p = r'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
s = io.open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'

def norm(x):
    return x.replace('\n', nl)

old_bad = norm("""        model: modelId,
  if (kind === 'variant-fork') {""")
new_bad = norm("""  if (kind === 'variant-fork') {""")
assert s.count(old_bad) == 1, ('bad insert', s.count(old_bad))
s = s.replace(old_bad, new_bad, 1)

old_call = norm("""      const result = await consumeDirectorKeyframeBatch({
        batch: directorBatch,
        chain: sourceChain,
        // DD-D-09: 每镜成功立即写回链镜表，中断后不丢已成功镜头。""")
new_call = norm("""      const result = await consumeDirectorKeyframeBatch({
        batch: directorBatch,
        chain: sourceChain,
        model: modelId,
        // DD-D-09: 每镜成功立即写回链镜表，中断后不丢已成功镜头。""")
assert s.count(old_call) == 1, ('call site', s.count(old_call))
s = s.replace(old_call, new_call, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('fixed flow-runner model pass-through')
