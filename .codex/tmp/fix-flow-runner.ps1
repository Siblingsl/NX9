$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
$lines = [System.IO.File]::ReadAllLines($path)
$text = [System.IO.File]::ReadAllText($path)
$nl = "`n"

$forkBlock = @(
  "  if (kind === 'variant-fork') {",
  "    const label = (d.variantLabel as string) || 'A';",
  "    updateNodeData(block.id, {",
  "      // DEEP-03：变体分叉未接入真分叉计算，禁止假绿；仅保留标签与透传，显式 skipped。",
  "      status: 'skipped',",
  "      noop: true,",
  "      meta: { variant: label, forkNotes: d.forkNotes },",
  "      content: `变体 ${label}：仅标记，不产生变体（变体能力已收敛至导演台）`,",
  "      output: upstream.prompts?.[0],",
  "      pictures: upstream.pictures,",
  "      clips: upstream.clips,",
  "      sounds: upstream.sounds,",
  "    });",
  "    return;",
  "  }"
)

# Rebuild the corrupted variant-fork section.
$startMarker = "  if (kind === 'variant-fork') {"
$endMarker = "  if (kind === 'prompt-diff') {"
$startIdx = -1
$endIdx = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimEnd() -eq $startMarker -or ($lines[$i] -match "variant-fork" -and $lines[$i] -match "kind ===")) {
    $startIdx = $i
    break
  }
}
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimEnd() -eq $endMarker) {
    $endIdx = $i
    break
  }
}
if ($startIdx -lt 0) { throw 'variant-fork start not found' }
if ($endIdx -lt 0) { throw 'prompt-diff start not found' }
if ($startIdx -ge $endIdx) { throw 'section order invalid' }

$before = $lines[0..($startIdx - 1)]
$after = $lines[$endIdx..($lines.Length - 1)]
$rebuilt = @()
$rebuilt += $before
$rebuilt += ''
$rebuilt += $forkBlock
$rebuilt += ''
$rebuilt += $after

# Fix prompt-diff: replace hardcoded model with resolvable model.
$rebuiltText = [string]::Join($nl, $rebuilt) + $nl
$oldDiff = "  if (kind === 'prompt-diff') {" + $nl + "    const prompts = upstream.prompts ?? [];" + $nl + "    if (prompts.length < 2) throw new Error('至少需要 2 路 prompt');" + $nl + "    const res = await api.proxyLlm({" + $nl + "      model: 'gpt-4o-mini',"
$newDiff = "  if (kind === 'prompt-diff') {" + $nl + "    const prompts = upstream.prompts ?? [];" + $nl + "    if (prompts.length < 2) throw new Error('至少需要 2 路 prompt');" + $nl + "    // DEEP-17：模型随节点/设置可配，未指定时交给网关全局配置，禁止写死。" + $nl + "    const diffModel = ((d.llmModel as string) || (d.model as string) || '').trim() || undefined;" + $nl + "    const res = await api.proxyLlm({" + $nl + "      ...(diffModel ? { model: diffModel } : {}),"
if (-not $rebuiltText.Contains($oldDiff)) { throw 'prompt-diff pattern not found after rebuild' }
$rebuiltText = $rebuiltText.Replace($oldDiff, $newDiff)

# Add noop marker to director-desk empty queue.
$oldQueue = "        status: 'success'," + $nl + "        content: '队列为空（无待出关键帧）'," + $nl + "        batchSummary: summary,"
$newQueue = "        status: 'success'," + $nl + "        content: '队列为空（无待出关键帧）'," + $nl + "        meta: { noop: true }," + $nl + "        batchSummary: summary,"
if (-not $rebuiltText.Contains($oldQueue)) { throw 'director queue pattern not found' }
$rebuiltText = $rebuiltText.Replace($oldQueue, $newQueue)

[System.IO.File]::WriteAllText($path, $rebuiltText, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'flow-runner rebuild OK'
