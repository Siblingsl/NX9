$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\picture-gen-commit.ts'
$nl = "`r`n"
$text = [IO.File]::ReadAllText($path)

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$old = '  injectedRefs?: PictureInjectedRef[];' + $nl + '  modelFallbackNote?: string;' + $nl + '}): Record<string, unknown> {'
$new = '  injectedRefs?: PictureInjectedRef[];' + $nl + '  modelFallbackNote?: string;' + $nl + '  /** PG-38: 实际发送模式写回，UI 不再显示与真实发送不一致的文生图 */' + $nl + '  pictureGenMode?: string;' + $nl + '}): Record<string, unknown> {'
$text = ReplaceOnce $text $old $new 'success-opts'

$old = '    message: warningParts.length ? warningParts.join('' · '') : undefined,' + $nl + '    error: undefined,'
$new = '    message: warningParts.length ? warningParts.join('' · '') : undefined,' + $nl + '    error: undefined,' + $nl + '    ...(opts.pictureGenMode' + $nl + '      ? {' + $nl + '          pictureGenMode: opts.pictureGenMode,' + $nl + '          useImageReference:' + $nl + '            opts.pictureGenMode === ''image-to-image'' ||' + $nl + '            opts.pictureGenMode === ''multi-ref'' ||' + $nl + '            opts.pictureGenMode === ''style-ref'' ||' + $nl + '            opts.pictureGenMode === ''upscale-hd'',' + $nl + '        }' + $nl + '      : {}),'
$text = ReplaceOnce $text $old $new 'success-mode'

$old = '  const generationHistory = opts.archiveCurrent' + $nl + '    ? archivePictureGeneration(' + $nl + '        previousUrls,' + $nl + '        userPrompt,' + $nl + '        readPictureGenerationHistory(opts.data),' + $nl + '      )' + $nl + '    : readPictureGenerationHistory(opts.data);'
$new = '  const compiledPrompt =' + $nl + '    typeof opts.data.lastCompiledPrompt === ''string'' && opts.data.lastCompiledPrompt.trim()' + $nl + '      ? opts.data.lastCompiledPrompt' + $nl + '      : userPrompt;' + $nl + '  const generationHistory = opts.archiveCurrent' + $nl + '    ? archivePictureGeneration(' + $nl + '        previousUrls,' + $nl + '        userPrompt,' + $nl + '        readPictureGenerationHistory(opts.data),' + $nl + '        undefined,' + $nl + '        { userPrompt, compiledPrompt },' + $nl + '      )' + $nl + '    : readPictureGenerationHistory(opts.data);'
$text = ReplaceOnce $text $old $new 'commit-history'

$old = '      patch: {' + $nl + '        firstFrameAssetId: urls[0],' + $nl + '        keyframeStatus: ''review'',' + $nl + '        status: ''review'',' + $nl + '      },'
$new = '      patch: {' + $nl + '        firstFrameAssetId: urls[0],' + $nl + '        keyframeStatus: ''review'',' + $nl + '        status: ''review'',' + $nl + '        ...(Array.isArray(opts.data.usedAssetIds)' + $nl + '          ? { usedAssetIds: opts.data.usedAssetIds }' + $nl + '          : {}),' + $nl + '        ...(opts.data.characterRevisionPins &&' + $nl + '          typeof opts.data.characterRevisionPins === ''object''' + $nl + '          ? { characterRevisionPins: opts.data.characterRevisionPins as Record<string, number> }' + $nl + '          : {}),' + $nl + '      },'
$text = ReplaceOnce $text $old $new 'commit-assets'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'picture-gen-commit PG-38/40/42/45 applied'
