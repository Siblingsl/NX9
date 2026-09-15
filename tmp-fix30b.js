const fs = require('fs');

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) {
      console.log('MISS', file, a.slice(0, 60));
      continue;
    }
    const n = s.split(a).length - 1;
    s = s.split(a).join(b);
    console.log('OK', n, file.split(/[\\/]/).pop(), a.slice(0, 40));
  }
  fs.writeFileSync(file, s);
}

patch('apps/web/src/engine/flow-runner-ops/tool-ops.ts', [
  ["throw new Error('缺少参考图')", "throw new Error('缺少参考图，禁止空成功')"],
  ["throw new Error('缺少视频')", "throw new Error('缺少视频，禁止空成功')"],
  ["throw new Error('缺少图片')", "throw new Error('缺少图片，禁止空成功')"],
]);

patch('apps/web/src/engine/flow-runner-ops/legacy-honesty-ops.ts', [
  ["throw new Error('export-pack 缺少画布上下文')", "throw new Error('export-pack 缺少画布上下文，禁止空成功')"],
]);

patch('apps/web/src/engine/flow-runner-ops/clip-gen-ops.ts', [
  ["error: '导演关键帧批次缺少画布上下文'", "error: '导演关键帧批次缺少画布上下文，禁止空成功'"],
  ["throw new DirectorRunBlockedError('导演关键帧批次缺少画布上下文')", "throw new DirectorRunBlockedError('导演关键帧批次缺少画布上下文，禁止空成功')"],
]);

patch('apps/server/src/modules/agent/agent.service.ts', [
  ["throw new Error('缺少必填字段')", "throw new Error('缺少必填字段，禁止空成功')"],
]);

{
  const f = 'apps/server/src/modules/gateway/gateway.service.ts';
  let s = fs.readFileSync(f, 'utf8');
  const a = 'Fal 任务已排队但缺少 request_id，无法轮询：${status}';
  const b = 'Fal 任务已排队但缺少 request_id，禁止空成功：${status}';
  if (!s.includes(a)) console.log('MISS fal', a);
  else {
    s = s.split(a).join(b);
    fs.writeFileSync(f, s);
    console.log('OK fal request_id');
  }
}
