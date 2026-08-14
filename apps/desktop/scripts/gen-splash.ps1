# NX9 便携版启动画面生成（NSIS portable 解压期间显示）
# 输出: build/splash.bmp （720x420, BMP 24bit —— BgImage 插件只认 BMP）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot   # apps/desktop
$out  = Join-Path $root 'build\splash.bmp'
$iconPath = Join-Path $root 'build\icon.png'

$w = 720
$h = 420

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

try {
  # ---- 背景：古铜金纵向渐变（上浅下深）----
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $cTop = [System.Drawing.Color]::FromArgb(255, 186, 150, 100)
  $cBot = [System.Drawing.Color]::FromArgb(255, 120, 84, 46)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $cTop, $cBot, 90.0)
  $g.FillRectangle($grad, $rect)
  $grad.Dispose()

  # ---- 顶部柔光 ----
  $glow = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(70, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255), 90.0)
  $g.FillRectangle($glow, $rect)
  $glow.Dispose()

  # ---- 品牌图标（带投影）----
  $icon = [System.Drawing.Image]::FromFile($iconPath)
  try {
    $iconSize = 170
    $ix = [int](($w - $iconSize) / 2)
    $iy = 55
    $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $g.FillEllipse($shadow, $ix + 6, $iy + 9, $iconSize, $iconSize)
    $shadow.Dispose()
    $g.DrawImage($icon, $ix, $iy, $iconSize, $iconSize)
  } finally {
    $icon.Dispose()
  }

  # ---- 文字：NX9 Studio / 正在启动… ----
  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $center.LineAlignment = [System.Drawing.StringAlignment]::Center

  $fontTitle = New-Object System.Drawing.Font('Microsoft YaHei UI', 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontSub   = New-Object System.Drawing.Font('Microsoft YaHei UI', 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  $titleRect = New-Object System.Drawing.RectangleF(0, 260, $w, 60)
  $subRect   = New-Object System.Drawing.RectangleF(0, 320, $w, 40)

  $white = [System.Drawing.Brushes]::White
  $semi  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 255, 255, 255))

  $g.DrawString('NX9 Studio', $fontTitle, $white, $titleRect, $center)
  $g.DrawString('正在启动…', $fontSub, $semi, $subRect, $center)

  $fontTitle.Dispose(); $fontSub.Dispose(); $semi.Dispose(); $center.Dispose()

  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
  "splash 已生成: $out  ($((Get-Item $out).Length) 字节, ${w}x${h})"
} finally {
  $g.Dispose()
  $bmp.Dispose()
}
