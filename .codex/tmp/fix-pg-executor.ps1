$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\executors\picture-gen-executor.ts'
$text0 = [IO.File]::ReadAllText($path)
$nl = if ($text0.Contains("`r`n")) { "`r`n" } else { "`n" }
$text = [IO.File]::ReadAllText($path)

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$old = '  const generationHistory = archivePictureGeneration(' + $nl + '    previousUrls,' + $nl + '    previousPrompt,' + $nl + '    readPictureGenerationHistory(d),' + $nl + '  );'
$new = '  const generationHistory = archivePictureGeneration(' + $nl + '    previousUrls,' + $nl + '    previousPrompt,' + $nl + '    readPictureGenerationHistory(d),' + $nl + '    undefined,' + $nl + '    { userPrompt: previousPrompt, compiledPrompt: lastPrompt },' + $nl + '  );'
$text = ReplaceOnce $text $old $new 'executor-history'

$old = '      injectedRefs: lastInjectedRefs,' + $nl + '      modelFallbackNote,' + $nl + '    }),'
$new = '      injectedRefs: lastInjectedRefs,' + $nl + '      modelFallbackNote,' + $nl + '      pictureGenMode,' + $nl + '    }),'
$text = ReplaceOnce $text $old $new 'executor-mode'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'picture-gen-executor PG-38/45 applied'
