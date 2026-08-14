$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\picture-gen-history.ts'
$nl = "`r`n"
$text = [IO.File]::ReadAllText($path)

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$old = 'export interface PictureGenerationHistoryEntry {' + $nl + '  id: string;' + $nl + '  createdAt: string;' + $nl + '  prompt: string;' + $nl + '  urls: string[];' + $nl + '}'
$new = 'export interface PictureGenerationHistoryEntry {' + $nl + '  id: string;' + $nl + '  createdAt: string;' + $nl + '  prompt: string;' + $nl + '  /** PG-45: 未 enrich 的用户原稿，避免历史只信可能被污染的 prompt */' + $nl + '  userPrompt?: string;' + $nl + '  /** PG-45: 实际发送/归档时的 compiled prompt，供审计 */' + $nl + '  compiledPrompt?: string;' + $nl + '  urls: string[];' + $nl + '}'
$text = ReplaceOnce $text $old $new 'history-entry'

$old = '  now = Date.now(),' + $nl + '): PictureGenerationHistoryEntry[] {'
$new = '  now = Date.now(),' + $nl + '  meta?: { userPrompt?: string; compiledPrompt?: string },' + $nl + '): PictureGenerationHistoryEntry[] {'
$text = ReplaceOnce $text $old $new 'archive-signature'

$old = '    prompt: (previousPrompt ?? '''').trim().slice(0, 200),' + $nl + '    urls,'
$new = '    prompt: (previousPrompt ?? '''').trim().slice(0, 200),' + $nl + '    userPrompt: (meta?.userPrompt ?? previousPrompt ?? '''').trim().slice(0, 200) || undefined,' + $nl + '    compiledPrompt: (meta?.compiledPrompt ?? previousPrompt ?? '''').trim().slice(0, 200) || undefined,' + $nl + '    urls,'
$text = ReplaceOnce $text $old $new 'archive-entry'

$old = '): { urls: string[]; history: PictureGenerationHistoryEntry[] } | null {'
$new = '): {' + $nl + '  urls: string[];' + $nl + '  history: PictureGenerationHistoryEntry[];' + $nl + '  userPrompt?: string;' + $nl + '  compiledPrompt?: string;' + $nl + '} | null {'
$text = ReplaceOnce $text $old $new 'restore-return'

$old = '  return {' + $nl + '    urls: entry.urls,'
$new = '  return {' + $nl + '    urls: entry.urls,' + $nl + '    userPrompt: entry.userPrompt ?? entry.prompt,' + $nl + '    compiledPrompt: entry.compiledPrompt ?? entry.prompt,'
$text = ReplaceOnce $text $old $new 'restore-body'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'picture-gen-history PG-45 applied'
