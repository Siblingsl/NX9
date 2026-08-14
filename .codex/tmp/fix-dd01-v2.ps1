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

# 1) director-keyframe-batch-runner: 视频写回不再覆盖 status
$p1 = 'F:\code\project\NX9\apps\web\src\engine\director-keyframe-batch-runner.ts'
$o1 = "        videoStatus: 'review'," + $nl + "        status: 'review'," + $nl + "        ...(generated.shotPatch ?? {}),"
$n1 = "        videoStatus: 'review'," + $nl + "        // DD-D-01: 只写视频阶段字段，保留 keyframeStatus/status 不被覆盖。" + $nl + "        ...(generated.shotPatch ?? {}),"
Replace-One $p1 $o1 $n1 'batch video writeback'

# 2) smart-edit-orchestrator: approvedOnly 改按 videoStatus 判定
$p2 = 'F:\code\project\NX9\apps\web\src\engine\smart-edit-orchestrator.ts'
$o2 = "    videoAssetId?: string | null;" + $nl + "    firstFrameAssetId?: string | null;" + $nl + "    audioAssetId?: string | null;" + $nl + "    descriptionZh?: string;" + $nl + "    subtitleText?: string | null;"
$n2 = "    videoAssetId?: string | null;" + $nl + "    videoStatus?: string;" + $nl + "    firstFrameAssetId?: string | null;" + $nl + "    audioAssetId?: string | null;" + $nl + "    descriptionZh?: string;" + $nl + "    subtitleText?: string | null;"
Replace-One $p2 $o2 $n2 'orchestrator shot type'
$o3 = ".filter((s) => (opts.approvedOnly ? s.status === 'approved' : true))"
$n3 = ".filter((s) => (opts.approvedOnly ? s.videoStatus === 'approved' : true))"
Replace-One $p2 $o3 $n3 'approvedOnly filter'
$o4 = "      videoAssetId: s.videoAssetId," + $nl + "      firstFrameAssetId: s.firstFrameAssetId,"
$n4 = "      videoAssetId: s.videoAssetId," + $nl + "      videoStatus: s.videoStatus," + $nl + "      firstFrameAssetId: s.firstFrameAssetId,"
Replace-One $p2 $o4 $n4 'orchestrator map videoStatus'

# 3) ClipEditorBlock: 透传 videoStatus
$p3 = 'F:\code\project\NX9\apps\web\src\blocks\core\ClipEditorBlock.tsx'
$o5 = "            videoAssetId: s.videoAssetId," + $nl + "            firstFrameAssetId: s.firstFrameAssetId," + $nl + "            audioAssetId: s.audioAssetId,"
$n5 = "            videoAssetId: s.videoAssetId," + $nl + "            videoStatus: s.videoStatus," + $nl + "            firstFrameAssetId: s.firstFrameAssetId," + $nl + "            audioAssetId: s.audioAssetId,"
Replace-One $p3 $o5 $n5 'ClipEditor pass videoStatus'

# 4) ClipGenBlock 轮询写回：不再覆盖 status
$p4 = 'F:\code\project\NX9\apps\web\src\blocks\core\ClipGenBlock.tsx'
$o6 = "                    ? { ...s, videoAssetId: res.url, videoStatus: 'review' as const, status: 'review' as const }"
$n6 = "                    ? { ...s, videoAssetId: res.url, videoStatus: 'review' as const }"
Replace-One $p4 $o6 $n6 'ClipGen poll writeback'

Write-Output 'DD-D-01/02 patch OK'
