$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts'
$text0 = [IO.File]::ReadAllText($path)
$nl = if ($text0.Contains("`r`n")) { "`r`n" } else { "`n" }
$text = $text0

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$old = '  const prompt = mergeUpstreamPrompt(upstream, d.content as string | undefined);'
$new = '  // PG-37: 工作区运行只写 runPrompt，不污染用户 content' + $nl + '  const runPromptSource =' + $nl + '    kind === ''picture-gen'' &&' + $nl + '    typeof (d.runPrompt as string | undefined) === ''string'' &&' + $nl + '    String(d.runPrompt).trim()' + $nl + '      ? String(d.runPrompt)' + $nl + '      : d.content;' + $nl + '  const prompt = mergeUpstreamPrompt(upstream, runPromptSource as string | undefined);'
$text = ReplaceOnce $text $old $new 'run-prompt'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'flow-runner PG-37 applied'
