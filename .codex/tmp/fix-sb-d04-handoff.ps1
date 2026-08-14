$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\blocks\craft\storyboard-desk\use-storyboard-desk.tsx'
$nl = "`n"
$text = [IO.File]::ReadAllText($path)

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$text = ReplaceOnce $text '  type StoryboardPreviewPictureSettings,' ('  type ChainStoryboardPayload,' + $nl + '  type StoryboardPreviewPictureSettings,') 'import-chain-type'

$anchor = '  const buildDirectorHandoffForNode = useCallback('
$text = ReplaceOnce $text $anchor ('  type DirectorHandoffOverrides = {' + $nl + '    confirmed?: boolean;' + $nl + '    confirmedEpisodeIds?: string[];' + $nl + '    confirmedAt?: string | null;' + $nl + '    chain?: ChainStoryboardPayload | null;' + $nl + '    focus?: boolean;' + $nl + '  };' + $nl + $nl + $anchor) 'insert-overrides-type'

$old = '    (handoffVersion: number, overrides?: { confirmed?: boolean; confirmedEpisodeIds?: string[]; confirmedAt?: string | null }) =>'
$new = '    (handoffVersion: number, overrides?: DirectorHandoffOverrides) => {'
$text = ReplaceOnce $text $old $new 'signature'

$old = '      buildDirectorHandoff({'
$new = '      const liveData = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined) ?? props.data;' + $nl + '      return buildDirectorHandoff({'
$text = ReplaceOnce $text $old $new 'build-call'

$old = '        preview: props.data?.storyboardPreview as StoryboardPreviewPayload | undefined,'
$new = '        preview: (liveData?.storyboardPreview as StoryboardPreviewPayload | undefined) ?? (props.data?.storyboardPreview as StoryboardPreviewPayload | undefined),'
$text = ReplaceOnce $text $old $new 'preview-line'

$old = '        chain: readChainStoryboard(props.data as Record<string, unknown>),'
$new = '        chain: overrides?.chain ?? readChainStoryboard(liveData),'
$text = ReplaceOnce $text $old $new 'chain-line'

$old = '        confirmedAt: overrides?.confirmedAt ?? (props.data?.confirmedAt as string | undefined),' + $nl + '      }),' + $nl + '    ['
$new = '        confirmedAt: overrides?.confirmedAt ?? (props.data?.confirmedAt as string | undefined),' + $nl + '      });' + $nl + '    },' + $nl + '    ['
$text = ReplaceOnce $text $old $new 'callback-close'

$old = '      currentEpisodeShotIds,' + $nl + '      props.data,'
$new = '      currentEpisodeShotIds,' + $nl + '      getNodes,' + $nl + '      props.data,'
$text = ReplaceOnce $text $old $new 'deps-getnodes'

$old = '    (deskId: string, handoffVersion: number, overrides?: { confirmed?: boolean; confirmedEpisodeIds?: string[]; confirmedAt?: string | null; focus?: boolean }) => {'
$new = '    (deskId: string, handoffVersion: number, overrides?: DirectorHandoffOverrides) => {'
$text = ReplaceOnce $text $old $new 'push-signature'

$old = '    const currentChain = readChainStoryboard(props.data as Record<string, unknown>);'
$new = '    const currentChain = readChainStoryboard(props.data as Record<string, unknown>);' + $nl + '    const nextChain = currentChain' + $nl + '      ? { ...currentChain, gridConfirmed: true, confirmedEpisodeIds: nextConfirmedEpisodeIds }' + $nl + '      : undefined;'
$text = ReplaceOnce $text $old $new 'next-chain'

$old = '      ...(currentChain' + $nl + '        ? {' + $nl + '            chainStoryboard: {' + $nl + '              ...currentChain,' + $nl + '              gridConfirmed: true,' + $nl + '              confirmedEpisodeIds: nextConfirmedEpisodeIds,' + $nl + '            },' + $nl + '          }' + $nl + '        : {}),'
$new = '      ...(nextChain ? { chainStoryboard: nextChain } : {}),'
$text = ReplaceOnce $text $old $new 'chain-block'

$old = '        confirmedAt,' + $nl + '      });'
$new = '        confirmedAt,' + $nl + '        chain: nextChain,' + $nl + '      });'
$text = ReplaceOnce $text $old $new 'push-chain'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'SB-D-04 handoff hash patch applied'
