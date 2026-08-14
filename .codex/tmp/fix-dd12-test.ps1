$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\__tests__\director-desk-runner.test.ts'
$text = [System.IO.File]::ReadAllText($path)
$nl = "`n"
$o1 = "  it('unknown color check does not block auto-approve', async () => {"
$n1 = "  it('unknown color check enters review instead of auto-approve (DD-D-12)', async () => {"
$o2 = "    expect(generated.keyframeStatus).toBe('approved');" + $nl + "    expect(generated.keyframeProvenance?.colorCheck?.verdict).toBe('unknown');"
$n2 = "    expect(generated.keyframeStatus).toBe('review');" + $nl + "    expect(generated.keyframeProvenance?.colorCheck?.verdict).toBe('unknown');"
if ($text.Contains("`r`n")) {
  $o1 = $o1.Replace("`n", "`r`n"); $n1 = $n1.Replace("`n", "`r`n")
  $o2 = $o2.Replace("`n", "`r`n"); $n2 = $n2.Replace("`n", "`r`n")
}
if (-not $text.Contains($o1)) { throw 'test title not found' }
if (-not $text.Contains($o2)) { throw 'test assertion not found' }
$text = $text.Replace($o1, $n1).Replace($o2, $n2)
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'DD-D-12 test patch OK'
