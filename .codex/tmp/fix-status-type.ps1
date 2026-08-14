$ErrorActionPreference = 'Stop'

function Replace-One([string]$path, [string]$old, [string]$new, [string]$label) {
  $text = [System.IO.File]::ReadAllText($path)
  if (-not $text.Contains($old)) { throw "$label pattern not found in $path" }
  $text = $text.Replace($old, $new)
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

$nl = "`n"

# NodeRunStatus: add 'skipped'
$p1 = 'F:\code\project\NX9\packages\shared\src\catalog\node-interaction.ts'
$o1 = "  | 'waiting'" + $nl + "  | 'disabled';"
$n1 = "  | 'waiting'" + $nl + "  | 'skipped'" + $nl + "  | 'disabled';"
Replace-One $p1 $o1 $n1 'NodeRunStatus'

# normalizeNodeStatus: map 'skipped'
$o2 = "    case 'disabled':" + $nl + "      return 'disabled';"
$n2 = "    case 'disabled':" + $nl + "      return 'disabled';" + $nl + "    case 'skipped':" + $nl + "      return 'skipped';"
Replace-One $p1 $o2 $n2 'normalizeNodeStatus'

# CanvasNodeBody label
$p2 = 'F:\code\project\NX9\apps\web\src\blocks\shared\CanvasNodeBody.tsx'
$o3 = "  waiting: '等待'," + $nl + "  disabled: '停用',"
$n3 = "  waiting: '等待'," + $nl + "  skipped: '跳过'," + $nl + "  disabled: '停用',"
Replace-One $p2 $o3 $n3 'STATUS_LABEL'

Write-Output 'shared + UI status patch OK'
