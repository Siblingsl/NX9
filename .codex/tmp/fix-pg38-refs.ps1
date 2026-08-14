$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\picture-gen-refs.ts'
$nl = "`r`n"
$text = [IO.File]::ReadAllText($path)

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$old = '  const characterRef = opts.characterRef?.trim() || undefined;' + $nl + '  const envRef = opts.envRef?.trim() || undefined;'
$new = '  const rawCharacterRef = opts.characterRef?.trim() || undefined;' + $nl + '  const rawEnvRef = opts.envRef?.trim() || undefined;' + $nl + '  const excludedRefs = new Set(' + $nl + '    Array.isArray(opts.data.excludedRefUrls)' + $nl + '      ? (opts.data.excludedRefUrls as string[]).filter(Boolean)' + $nl + '      : [],' + $nl + '  );' + $nl + '  // PG-38: 用户显式排除的注入参考不再进发送集合' + $nl + '  const characterRef = rawCharacterRef && !excludedRefs.has(rawCharacterRef) ? rawCharacterRef : undefined;' + $nl + '  const envRef = rawEnvRef && !excludedRefs.has(rawEnvRef) ? rawEnvRef : undefined;'
$text = ReplaceOnce $text $old $new 'excluded-refs'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'picture-gen-refs PG-38 exclusion applied'
