$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\__tests__\director-keyframe-batch-runner.test.ts'
$text = [System.IO.File]::ReadAllText($path)
$nl = "`n"
$anchor = "    expect(first.chain.shots.map((shot) => shot.videoAssetId)).toEqual(['video-s1', 'video-s2']);"
if ($text.Contains("`r`n")) { $anchor = $anchor.Replace("`n", "`r`n") }
if (-not $text.Contains($anchor)) { throw 'anchor not found' }
$add = $nl + "    // DD-D-01: 视频写回不得覆盖关键帧批准语义。" + $nl + "    expect(first.chain.shots.map((shot) => shot.keyframeStatus)).toEqual(['approved', 'approved']);" + $nl + "    expect(first.chain.shots.map((shot) => shot.status)).toEqual(['approved', 'approved']);" + $nl + "    expect(first.chain.shots.map((shot) => shot.videoStatus)).toEqual(['review', 'review']);"
if ($text.Contains("`r`n")) { $add = $add.Replace("`n", "`r`n") }
$text = $text.Replace($anchor, $anchor + $add)
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'batch test patch OK'
