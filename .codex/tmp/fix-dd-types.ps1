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

# buildBatchOpts 透传 useGlobalArtDirection
$p1 = 'F:\code\project\NX9\apps\web\src\blocks\core\director-desk\director-batch-opts.ts'
$o1 = "  styleLock: boolean;" + $nl + "  globalArtDirection?: string;"
$n1 = "  styleLock: boolean;" + $nl + "  useGlobalArtDirection?: boolean;" + $nl + "  globalArtDirection?: string;"
Replace-One $p1 $o1 $n1 'batch opts param'
$o2 = "    styleLock: params.styleLock," + $nl + "    globalArtDirection: params.globalArtDirection,"
$n2 = "    styleLock: params.styleLock," + $nl + "    useGlobalArtDirection: params.useGlobalArtDirection === true," + $nl + "    globalArtDirection: params.globalArtDirection,"
Replace-One $p1 $o2 $n2 'batch opts return'

# flow-runner：closure 内使用非空引用
$p2 = 'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
$o3 = "        throw new DirectorRunBlockedError('导演关键帧批次的 source chain 已断开');" + $nl + "      }"
$n3 = "        throw new DirectorRunBlockedError('导演关键帧批次的 source chain 已断开');" + $nl + "      }" + $nl + "      const sourceChainNodeRef = sourceChainNode;"
Replace-One $p2 $o3 $n3 'source chain ref'
$o4 = "          const latest = readChainStoryboard(sourceChainNode.data as Record<string, unknown>);"
$n4 = "          const latest = readChainStoryboard(sourceChainNodeRef.data as Record<string, unknown>);"
Replace-One $p2 $o4 $n4 'source chain ref use'

Write-Output 'type fixes OK'
