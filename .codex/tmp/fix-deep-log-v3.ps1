$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\docs\8.12\NX9-DEEP-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md'
$lines = [System.IO.File]::ReadAllLines($path)
$nl = "`n"

$startIdx = -1
$endIdx = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].Trim() -eq '## 3. 台账漂移处理（DEEP-14）') { $startIdx = $i }
  if ($startIdx -ge 0 -and $i -gt $startIdx -and $lines[$i].Trim() -eq '## 4. 浏览器回归清单（DEEP-15，待人工复验）') {
    $endIdx = $i
    break
  }
}
if ($startIdx -lt 0 -or $endIdx -lt 0) { throw 'section markers not found' }

$section = @(
  '## 3. 台账漂移处理（DEEP-14）',
  '',
  '- 本日志与 `NX9-DEEP-OPEN-LOOPS-2026-08-12.md` 同日建立，后续销票须同步滚动。',
  '- `NX9-REAL-COMPLETION-LEDGER.md` F-046～050 重评（按代码证据，未人工重跑处如实保留）：',
  '  - F-046（HyperFrames 取消不得成功）：代码已含取消路径与取消后不落 success 的守卫（`ExportPackBlock` HF 取消、`MediaPinBlock` cancelled 分支），单测覆盖取消契约；浏览器级取消联调未跑，LEDGER 数字应由人工在下一轮按验收门禁更新。',
  '  - F-047（export_ready 真成功态）：`ExportWorkspace` 已按 DR-03 改为仅消费连接链产物，无链即 blocked，不再以 status 捷径冒充成功；空成功回归由 `dr03-chain-export.test.ts` 覆盖。',
  '  - F-048（clip-gen 并发/重试单轨）：`ClipGenBlock.run` 委托 `runFlowBatch`，与 VideoWorkspace 同读组装器与并发配置；`vg-r2-p3.test.ts` 守卫。',
  '  - F-049（Bridge/队列/Seedance 闭环）：代码与单测覆盖三模式组装请求；episode-queue 常量已删；浏览器演示脚本未跑，按 DEEP-15 待人工复验。',
  '  - F-050（智能剪辑建议确认）：建议确认与时间线门禁已有单测；确认后 readiness 变绿的浏览器链路未跑，按 DEEP-15 待人工复验。',
  '  - LEDGER 原数字保持 2026-07-28 快照，不叠加新结论；下一轮人工按本日志证据统一重算。',
  '- `NX9-VIDEO-GEN-NODE-OPEN-LOOPS*.md` 正文矩阵：顶部收口状态为准；R3 矩阵行以 `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` 为准。',
  ''
)

$before = $lines[0..($startIdx - 1)]
$after = $lines[$endIdx..($lines.Length - 1)]
$rebuilt = @()
$rebuilt += $before
$rebuilt += $section
$rebuilt += $after
$text = [string]::Join($nl, $rebuilt) + $nl
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'deep log section rebuild OK'
