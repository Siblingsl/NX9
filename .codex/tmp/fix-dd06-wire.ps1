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

# DD-D-09: flow-runner 批次逐镜写回 source chain
$p1 = 'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
$o1 = "          const usage = collectClipUsedAssets(finalPrompt, shotCharacterContext, currentShot);" + $nl + "            return { videoUrl: awaited.url, shotPatch: usage };"
$n1 = "          const usage = collectClipUsedAssets(finalPrompt, shotCharacterContext, currentShot);" + $nl + "            return { videoUrl: awaited.url, shotPatch: usage };"
Replace-One $p1 $o1 $n1 'flow generate return (no-op anchor)'

# 在 consumeDirectorKeyframeBatch 调用处接线 onShotProgress
$o2 = "      const result = await consumeDirectorKeyframeBatch({" + $nl + "        batch: directorBatch," + $nl + "        chain: sourceChain,"
$n2 = "      const result = await consumeDirectorKeyframeBatch({" + $nl + "        batch: directorBatch," + $nl + "        chain: sourceChain," + $nl + "        // DD-D-09: 每镜成功立即写回链镜表，中断后不丢已成功镜头。" + $nl + "        onShotProgress: (shotId, shotPatch) => {" + $nl + "          const latest = readChainStoryboard(sourceChainNode.data as Record<string, unknown>);" + $nl + "          if (!latest) return;" + $nl + "          updateNodeData(directorBatch.sourceChainDeskId, {" + $nl + "            chainStoryboard: {" + $nl + "              ...latest," + $nl + "              shots: latest.shots.map((s) => s.id === shotId ? { ...s, ...shotPatch } : s)," + $nl + "            }," + $nl + "          });" + $nl + "        },"
Replace-One $p1 $o2 $n2 'flow onShotProgress'

# DD-D-07: DirectorDeskBlock 两个调用点显式关闭全局美术方向
$p2 = 'F:\code\project\NX9\apps\web\src\blocks\core\DirectorDeskBlock.tsx'
$o3 = "       globalArtDirection: storyboard.globalArtDirection,"
$n3 = "       useGlobalArtDirection: false," + $nl + "       globalArtDirection: storyboard.globalArtDirection,"
Replace-One $p2 $o3 $n3 'desk preview refs global opt-out'
$o4 = "             globalArtDirection: storyboard.globalArtDirection,"
$n4 = "             useGlobalArtDirection: false," + $nl + "             globalArtDirection: storyboard.globalArtDirection,"
Replace-One $p2 $o4 $n4 'desk batch global opt-out'

# DD-D-06: pushKeyframesToClipGen 不再写 previewUrl
$p3 = 'F:\code\project\NX9\apps\web\src\engine\director-desk-runner.ts'
$o5 = "    previewUrl: first.firstFrameAssetId,"
$n5 = "    // DD-D-06: 交接代表帧走链镜表 firstFrameAssetId；节点 previewUrl 不承担业务语义。"
Replace-One $p3 $o5 $n5 'push clip previewUrl'

# DD-D-12: 更新既有测试语义
$p4 = 'F:\code\project\NX9\apps\web\src\engine\__tests__\director-desk-runner.test.ts'
$o6 = "  it('unknown color check does not block auto-approve', async () => {"
$n6 = "  it('unknown color check enters review instead of auto-approve (DD-D-12)', async () => {"
Replace-One $p4 $o6 $n6 'unknown test rename'
$o7 = "    expect(generated.keyframeStatus).toBe('approved');" + $nl + "    expect(generated.keyframeProvenance?.colorCheck?.verdict).toBe('unknown');"
$n7 = "    expect(generated.keyframeStatus).toBe('review');" + $nl + "    expect(generated.keyframeProvenance?.colorCheck?.verdict).toBe('unknown');"
Replace-One $p4 $o7 $n7 'unknown test expectation'

Write-Output 'DD-D-06/07/09/12 wiring OK'
