$ErrorActionPreference = 'Stop'

function Replace-One([string]$path, [string]$old, [string]$new, [string]$label) {
  $text = [System.IO.File]::ReadAllText($path)
  if ($text.Contains("`r`n")) {
    $old = $old.Replace("`n", "`r`n")
    $new = $new.Replace("`n", "`r`n")
  }
  if (-not $text.Contains($old)) { throw "$label pattern not found in $path" }
  $text = $text.Replace($old, $new)
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

$nl = "`n"

# ── DD-D-09/10: 批次逐镜即时写回 ──
$p1 = 'F:\code\project\NX9\apps\web\src\engine\director-keyframe-batch-runner.ts'
$o1 = "  generateVideo: (" + $nl + "    item: DirectorKeyframeBatchShot," + $nl + "    currentShot: StoryboardShot," + $nl + "  ) => Promise<{ videoUrl: string; shotPatch?: Partial<StoryboardShot> }>;" + $nl + "  now?: () => string;"
$n1 = "  generateVideo: (" + $nl + "    item: DirectorKeyframeBatchShot," + $nl + "    currentShot: StoryboardShot," + $nl + "  ) => Promise<{ videoUrl: string; shotPatch?: Partial<StoryboardShot> }>;" + $nl + "  now?: () => string;" + $nl + "  /** DD-D-09: 每镜成功即时回执，中断后已成功镜头不丢。 */" + $nl + "  onShotProgress?: (shotId: string, patch: Partial<StoryboardShot>) => void;"
Replace-One $p1 $o1 $n1 'batch options onShotProgress'
$o2 = "      patches.set(item.shotId, {" + $nl + "        videoAssetId: generated.videoUrl," + $nl + "        videoStatus: 'review'," + $nl + "        // DD-D-01: 只写视频阶段字段，保留 keyframeStatus/status 不被覆盖。" + $nl + "        ...(generated.shotPatch ?? {})," + $nl + "      });"
$n2 = "      const shotPatch: Partial<StoryboardShot> = {" + $nl + "        videoAssetId: generated.videoUrl," + $nl + "        videoStatus: 'review'," + $nl + "        // DD-D-01: 只写视频阶段字段，保留 keyframeStatus/status 不被覆盖。" + $nl + "        ...(generated.shotPatch ?? {})," + $nl + "      };" + $nl + "      patches.set(item.shotId, shotPatch);" + $nl + "      options.onShotProgress?.(item.shotId, shotPatch);"
Replace-One $p1 $o2 $n2 'batch per-shot progress'

# ── DD-D-06: 节点 previewUrl 不再当业务 SSOT ──
$p2 = 'F:\code\project\NX9\apps\web\src\blocks\core\DirectorDeskBlock.tsx'
$o3 = "            if (result.url) {" + $nl + "              updateNodeData(props.id, { previewUrl: result.url });" + $nl + "            }"
$n3 = "            // DD-D-06: previewUrl 仅是画布缩略图缓存，不随逐镜批出漂移；代表帧走 currentShot。"
Replace-One $p2 $o3 $n3 'remove onShotDone previewUrl'
$o4 = "        updateNodeData(props.id, {" + $nl + "          status: summary.failed > 0 && summary.done === 0 ? 'error' : 'success'," + $nl + "          previewUrl: summary.lastUrl ?? previewUrl,"
$n4 = "        updateNodeData(props.id, {" + $nl + "          status: summary.failed > 0 && summary.done === 0 ? 'error' : 'success'," + $nl + "          lastBatchPreviewUrl: summary.lastUrl ?? undefined,"
Replace-One $p2 $o4 $n4 'batch previewUrl to lastBatchPreviewUrl'

# ── DD-D-07: 风格锁默认不含全局美术方向 ──
$p3 = 'F:\code\project\NX9\apps\web\src\engine\director-desk-runner.ts'
$o5 = "  styleLock?: boolean;" + $nl + "  globalArtDirection?: string;"
$n5 = "  styleLock?: boolean;" + $nl + "  /** DD-D-07: 默认 false；为 true 时才允许工作区全局美术方向进入风格锁。 */" + $nl + "  useGlobalArtDirection?: boolean;" + $nl + "  globalArtDirection?: string;"
Replace-One $p3 $o5 $n5 'options useGlobalArtDirection'
$o6 = "    const globalStyle = opts.globalArtDirection?.trim();"
$n6 = "    const globalStyle = opts.useGlobalArtDirection === true ? opts.globalArtDirection?.trim() : undefined;"
Replace-One $p3 $o6 $n6 'buildShotPrompt global style opt-in'

# ── DD-D-12: unknown 也进审阅，禁止 auto 放行未检帧 ──
$o7 = "    // 疑似黑白强制进审阅；未知/彩色才允许 auto 直接批准。禁止因质检标失败。"
$n7 = "    // DD-D-12: 疑似黑白与质检失败(unknown)都进审阅；只有明确彩色才允许 auto 批准。禁止因质检标失败。"
Replace-One $p3 $o7 $n7 'unknown comment'
$o8 = "      colorCheck.verdict === 'suspect-monochrome'"
$n8 = "      colorCheck.verdict === 'suspect-monochrome' || colorCheck.verdict === 'unknown'"
Replace-One $p3 $o8 $n8 'unknown forces review'

# ── DD-D-06: flow-runner 导演台空队列/批出 previewUrl 语义 ──
$p4 = 'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
$o9 = "    if (summary.total === 0) {" + $nl + "      updateNodeData(block.id, {" + $nl + "        status: 'success'," + $nl + "        content: '队列为空（无待出关键帧）'," + $nl + "        meta: { noop: true }," + $nl + "        batchSummary: summary," + $nl + "      });"
$n9 = "    if (summary.total === 0) {" + $nl + "      updateNodeData(block.id, {" + $nl + "        status: 'success'," + $nl + "        content: '队列为空（无待出关键帧）'," + $nl + "        meta: { noop: true }," + $nl + "        batchSummary: summary," + $nl + "      });"
Replace-One $p4 $o9 $n9 'flow empty queue noop (no-op)'

# ── DD-D-06: pushKeyframesToClipGen 不再写 previewUrl ──
$o10 = "    previewUrl: first.firstFrameAssetId,"
$n10 = "    // DD-D-06: 交接代表帧走链镜表 firstFrameAssetId；节点 previewUrl 不承担业务语义。"
Replace-One $p3 $o10 $n10 'push clip previewUrl'

Write-Output 'DD-D-06/07/09/10/12 patch OK'
