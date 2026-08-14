$ErrorActionPreference = 'Stop'
$path = 'F:\code\project\NX9\apps\web\src\engine\stage-deck\chrome\attached-workspace\generation\picture\PictureUpstreamStrip.tsx'
$text0 = [IO.File]::ReadAllText($path)
$nl = if ($text0.Contains("`r`n")) { "`r`n" } else { "`n" }
$text = $text0

function ReplaceOnce([string]$text, [string]$old, [string]$new, [string]$label) {
  $idx = $text.IndexOf($old)
  if ($idx -lt 0) { throw "NOT FOUND: $label" }
  if ($text.IndexOf($old, $idx + $old.Length) -ge 0) { throw "MULTIPLE: $label" }
  return $text.Substring(0, $idx) + $new + $text.Substring($idx + $old.Length)
}

$old = "export type PictureRefSource = 'upload' | 'upstream';"
$new = "export type PictureRefSource = 'upload' | 'upstream' | 'injected';"
$text = ReplaceOnce $text $old $new 'source-type'

$old = '  /** PG-03: 风格参考图（styleImageUrl）标记 */' + $nl + "  role?: 'style';"
$new = '  /** PG-03: 风格参考图（styleImageUrl）标记；PG-38: 注入参考角色 */' + $nl + "  role?: 'style' | 'character' | 'environment';"
$text = ReplaceOnce $text $old $new 'role-type'

$old = '  const uploadCount = visible.filter((i) => i.source === ''upload'').length;' + $nl + "  const upstreamCount = visible.filter((i) => i.source === 'upstream').length;"
$new = '  const uploadCount = visible.filter((i) => i.source === ''upload'').length;' + $nl + "  const upstreamCount = visible.filter((i) => i.source === 'upstream').length;" + $nl + "  const injectedCount = visible.filter((i) => i.source === 'injected').length;"
$text = ReplaceOnce $text $old $new 'injected-count'

$old = "          {uploadCount > 0 && upstreamCount > 0" + $nl + "            ? `上传 ${uploadCount} · 上游 ${upstreamCount} · 点击 @ · 拖出钉板`" + $nl + "            : uploadCount > 0" + $nl + "              ? '本节点上传 · 拖出钉板'" + $nl + "              : '点击 @ · 拖出钉板'}"
$new = "          {injectedCount > 0" + $nl + "            ? `注入 ${injectedCount} · 定妆/场景 · 可排除`" + $nl + "            : uploadCount > 0 && upstreamCount > 0" + $nl + "              ? `上传 ${uploadCount} · 上游 ${upstreamCount} · 点击 @ · 拖出钉板`" + $nl + "              : uploadCount > 0" + $nl + "                ? '本节点上传 · 拖出钉板'" + $nl + "                : '点击 @ · 拖出钉板'}"
$text = ReplaceOnce $text $old $new 'injected-summary'

$old = "            const label =" + $nl + "              item.role === 'style'" + $nl + "                ? '风格'" + $nl + "                : source === 'upload'" + $nl + "                  ? `参考${index + 1}`" + $nl + "                  : `上游${index + 1}`;"
$new = "            const label =" + $nl + "              item.role === 'style'" + $nl + "                ? '风格'" + $nl + "                : item.role === 'character'" + $nl + "                  ? '定妆'" + $nl + "                  : item.role === 'environment'" + $nl + "                    ? '场景'" + $nl + "                    : source === 'upload'" + $nl + "                      ? `参考${index + 1}`" + $nl + "                      : source === 'injected'" + $nl + "                        ? '注入'" + $nl + "                        : `上游${index + 1}`;"
$text = ReplaceOnce $text $old $new 'injected-label'

$old = "                title={" + $nl + "                  item.role === 'style'" + $nl + "                    ? '风格参考图 · 控制画风，不作主体'" + $nl + "                    : source === 'upload'" + $nl + "                      ? `${label} · 本节点上传 · 拖出钉到画布`" + $nl + "                      : `点击插入 @上游:图${index + 1} · 拖出钉到画布`" + $nl + "                }"
$new = "                title={" + $nl + "                  item.role === 'style'" + $nl + "                    ? '风格参考图 · 控制画风，不作主体'" + $nl + "                    : item.role === 'character'" + $nl + "                      ? '注入 · 角色定妆 · 可排除'" + $nl + "                      : item.role === 'environment'" + $nl + "                        ? '注入 · 场景参考 · 可排除'" + $nl + "                        : source === 'upload'" + $nl + "                          ? `${label} · 本节点上传 · 拖出钉到画布`" + $nl + "                          : source === 'injected'" + $nl + "                            ? '注入参考 · 角色/场景 · 可排除'" + $nl + "                            : `点击插入 @上游:图${index + 1} · 拖出钉到画布`" + $nl + "                }"
$text = ReplaceOnce $text $old $new 'injected-title'

$old = "                {source === 'upstream' && onExcludeUpstream ? ("
$new = "                {(source === 'upstream' || source === 'injected') && onExcludeUpstream ? ("
$text = ReplaceOnce $text $old $new 'injected-exclude'

$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Output 'PictureUpstreamStrip PG-38 applied'
