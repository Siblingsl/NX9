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

# DD-D-03/04: director-desk-runner 统一 hasDirector3dGuide
$p1 = 'F:\code\project\NX9\apps\web\src\engine\director-desk-runner.ts'
$o1 = "  readChainStoryboard," + $nl + "  emptyKeyframeColorCheck,"
$n1 = "  readChainStoryboard," + $nl + "  hasDirector3dGuide," + $nl + "  emptyKeyframeColorCheck,"
Replace-One $p1 $o1 $n1 'import hasDirector3dGuide'
$o2 = "    if (s.director3dGuide?.captureUrl) with3d += 1;"
$n2 = "    if (hasDirector3dGuide(s)) with3d += 1;"
Replace-One $p1 $o2 $n2 'stats with3d'
$o3 = "    list = allActive.filter((s) => s.director3dGuide?.captureUrl);"
$n3 = "    list = allActive.filter(hasDirector3dGuide);"
Replace-One $p1 $o3 $n3 '3donly filter'
$o4 = "  if (opts.allowWithout3d === false && !shot.director3dGuide?.captureUrl) {"
$n4 = "  if (opts.allowWithout3d === false && !hasDirector3dGuide(shot)) {"
Replace-One $p1 $o4 $n4 'allowWithout3d guard'
$o5 = "      error: '需要 3D 机位截图',"
$n5 = "      error: shot.director3dGuide?.captureUrlPendingRepair ? '3D 机位截图待修复，请重新上传' : '需要 3D 机位截图',"
Replace-One $p1 $o5 $n5 'pending repair error'

# buildShotPrompt：pendingRepair 时明示不可引用（不静默当无 3D）
$o6 = "  const d3 = shot.director3dGuide?.captureUrl?.trim();"
$n6 = "  const guide3d = shot.director3dGuide;" + $nl + "  const d3 = guide3d?.captureUrl?.trim();" + $nl + "  if (guide3d?.captureUrlPendingRepair && !d3) {" + $nl + "    craft.push('note: 3D capture is pending repair, do not infer a camera screenshot');" + $nl + "  }"
Replace-One $p1 $o6 $n6 'prompt pending repair note'

# DD-D-03/04: status-badge 识别待修复
$p2 = 'F:\code\project\NX9\apps\web\src\blocks\core\director-desk\status-badge.tsx'
$o7 = "import {" + $nl + "  isShotKeyframeApproved," + $nl + "  isShotKeyframeFailed," + $nl + "} from '../../../engine/director-desk-runner';"
$n7 = "import {" + $nl + "  isShotKeyframeApproved," + $nl + "  isShotKeyframeFailed," + $nl + "} from '../../../engine/director-desk-runner';" + $nl + "import { hasDirector3dGuide } from '@nx9/shared';"
Replace-One $p2 $o7 $n7 'badge import'
$o8 = "  director3dGuide?: { captureUrl?: string } | null;"
$n8 = "  director3dGuide?: { captureUrl?: string; captureUrlPendingRepair?: boolean } | null;"
Replace-One $p2 $o8 $n8 'badge type'
$o9 = "  if (shot.director3dGuide?.captureUrl) return { label: '有3D', cls: 'is-miss' };"
$n9 = "  if (shot.director3dGuide?.captureUrlPendingRepair) return { label: '3D待修复', cls: 'is-warn' };" + $nl + "  if (hasDirector3dGuide(shot as never)) return { label: '有3D', cls: 'is-miss' };"
Replace-One $p2 $o9 $n9 'badge pending repair'

# DD-D-03/04: 胶片 3D 标记识别待修复
$p3 = 'F:\code\project\NX9\apps\web\src\blocks\core\director-desk\director-filmstrip.tsx'
$o10 = "  director3dGuide?: { captureUrl?: string } | null;"
$n10 = "  director3dGuide?: { captureUrl?: string; captureUrlPendingRepair?: boolean } | null;"
Replace-One $p3 $o10 $n10 'filmstrip type'
$o11 = "                  {shot.director3dGuide?.captureUrl ? <i className=\"dd2-frame__3d\" title=\"有 3D 参考\" /> : null}"
$n11 = "                  {shot.director3dGuide?.captureUrl ? <i className=\"dd2-frame__3d\" title=\"有 3D 参考\" /> : shot.director3dGuide?.captureUrlPendingRepair ? <i className=\"dd2-frame__3d is-repair\" title=\"3D 待修复\" /> : null}"
Replace-One $p3 $o11 $n11 'filmstrip pending repair marker'

# DD-D-05: DirectorDeskBlock 文案由开关驱动
$p4 = 'F:\code\project\NX9\apps\web\src\blocks\core\DirectorDeskBlock.tsx'
$o12 = "                  <b>2</b> 3D 构图（暂未开放）"
$n12 = "                  <b>2</b> 3D 构图"
Replace-One $p4 $o12 $n12 'desk tab label'

# DD-D-05: director-main-panel 文案由开关驱动
$p5 = 'F:\code\project\NX9\apps\web\src\blocks\core\director-desk\director-main-panel.tsx'
$o13 = ">3D 舞台暂未开放</button>"
$n13 = ">{director3dEnabled ? '打开 3D 舞台' : '3D 舞台暂未开放'}</button>"
Replace-One $p5 $o13 $n13 'panel stage label'
$o14 = "          <Box size={13} /> 3D 机位暂未开放"
$n14 = "          <Box size={13} /> {director3dEnabled ? '3D 机位' : '3D 机位暂未开放'}"
Replace-One $p5 $o14 $n14 'panel camera label'

# DD-D-08: FlowSurface spawn 去全局回退
$p6 = 'F:\code\project\NX9\apps\web\src\engine\FlowSurface.tsx'
$o15 = "    // F-003: 从链镜表查找，回退全局" + $nl + "    const currentNodes = nodesRef.current;" + $nl + "    const shot = pending.shotId" + $nl + "      ? (findChainShot(pending.shotId, currentNodes) ?? useWorkspaceDocument.getState().storyboard.shots.find((s: any) => s.id === pending.shotId))" + $nl + "      : undefined;"
$n15 = "    // DD-D-08: 只从链镜表查找，禁止回退全局 storyboard.shots。" + $nl + "    const currentNodes = nodesRef.current;" + $nl + "    const shot = pending.shotId ? findChainShot(pending.shotId, currentNodes) : undefined;"
Replace-One $p6 $o15 $n15 'FlowSurface spawn fallback'

Write-Output 'DD-D-03/04/05/08 patch OK'
