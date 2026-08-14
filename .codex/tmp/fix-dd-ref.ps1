$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
$text = [System.IO.File]::ReadAllText($path)
$old = "      const sourceChainNodeRef = sourceChainNode;"
$new = "      const sourceChainNodeRef = sourceChainNode!;"
if ($text.Contains("`r`n")) { $old = $old.Replace("`n", "`r`n"); $new = $new.Replace("`n", "`r`n") }
if (-not $text.Contains($old)) { throw 'sourceChainNodeRef not found' }
$text = $text.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'flow source ref assert OK'
