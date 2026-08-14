$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\__tests__\director-desk-runner.test.ts'
$text = [System.IO.File]::ReadAllText($path)
$nl = "`n"
$old = "        styleLock: true," + $nl + "        globalArtDirection: 'injected-global-style',"
$new = "        styleLock: true," + $nl + "        // DD-D-07: 全局美术方向必须显式 opt-in，默认不注入。" + $nl + "        useGlobalArtDirection: true," + $nl + "        globalArtDirection: 'injected-global-style',"
if ($text.Contains("`r`n")) {
  $old = $old.Replace("`n", "`r`n"); $new = $new.Replace("`n", "`r`n")
}
if (-not $text.Contains($old)) { throw 'style test options not found' }
$text = $text.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'DD-D-07 test patch OK'
