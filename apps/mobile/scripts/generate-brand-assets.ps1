Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileDir = Split-Path -Parent $scriptRoot
$appsDir = Split-Path -Parent $mobileDir
$repoRoot = Split-Path -Parent $appsDir
$assetDir = Join-Path $mobileDir 'assets'
$sourceIconPath = Join-Path $repoRoot 'icon.png'
$iconBackgroundHex = '#07110D'

if (!(Test-Path $sourceIconPath)) {
  throw "Source icon not found at $sourceIconPath"
}

if (!(Test-Path $assetDir)) {
  New-Item -ItemType Directory -Path $assetDir | Out-Null
}

function New-ColorBrush([string]$hex, [int]$alpha = 255) {
  $color = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
}

function New-Color([string]$hex, [int]$alpha = 255) {
  $color = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B)
}

function New-RoundedPen([string]$hex, [float]$width, [int]$alpha = 255) {
  $pen = New-Object System.Drawing.Pen((New-Color $hex $alpha), $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $pen
}

function New-GradientBrush([float]$x1, [float]$y1, [float]$x2, [float]$y2, [string]$start, [string]$end) {
  return New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
    (New-Object System.Drawing.PointF($x1, $y1)),
    (New-Object System.Drawing.PointF($x2, $y2)),
    ([System.Drawing.ColorTranslator]::FromHtml($start)),
    ([System.Drawing.ColorTranslator]::FromHtml($end))
  )
}

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $r * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $w - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $w - $diameter, $y + $h - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $h - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $stream.Dispose()
    $bitmap.Dispose()
  }
}

function Set-HighQualityGraphics([System.Drawing.Graphics]$graphics) {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
}

function Get-VisibleBounds([System.Drawing.Bitmap]$bitmap, [int]$alphaThreshold = 16) {
  $minX = $bitmap.Width
  $minY = $bitmap.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      if ($bitmap.GetPixel($x, $y).A -gt $alphaThreshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    return New-Object System.Drawing.Rectangle(0, 0, $bitmap.Width, $bitmap.Height)
  }

  return New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
}

function Resize-Png([string]$sourcePath, [int]$size, [string]$targetPath) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    Set-HighQualityGraphics $graphics
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $graphics.DrawImage($source, $destRect)
  }
  finally {
    $graphics.Dispose()
    $source.Dispose()
  }

  Save-Png $bitmap $targetPath
}

function Resize-PngContained(
  [string]$sourcePath,
  [int]$size,
  [string]$targetPath,
  [double]$maxScaleRatio,
  [string]$backgroundHex = ''
) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    Set-HighQualityGraphics $graphics

    if ([string]::IsNullOrWhiteSpace($backgroundHex)) {
      $graphics.Clear([System.Drawing.Color]::Transparent)
    }
    else {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($backgroundHex))
    }

    $maxSize = [double]($size * $maxScaleRatio)
    $scale = [Math]::Min($maxSize / $source.Width, $maxSize / $source.Height)
    $drawWidth = [int]([Math]::Round($source.Width * $scale))
    $drawHeight = [int]([Math]::Round($source.Height * $scale))
    $drawX = [int]([Math]::Round(($size - $drawWidth) / 2.0))
    $drawY = [int]([Math]::Round(($size - $drawHeight) / 2.0))
    $destRect = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawWidth, $drawHeight)

    $graphics.DrawImage($source, $destRect)
  }
  finally {
    $graphics.Dispose()
    $source.Dispose()
  }

  Save-Png $bitmap $targetPath
}

function Draw-LogoImage([System.Drawing.Graphics]$graphics, [int]$canvasWidth, [int]$canvasHeight, [double]$maxScaleRatio, [double]$offsetYRatio = 0.0) {
  $logoPath = Join-Path $assetDir 'logo-no-bg.png'
  $logoBitmap = [System.Drawing.Bitmap]::FromFile($logoPath)

  try {
    $sourceRect = Get-VisibleBounds $logoBitmap
    $maxSize = [double]([Math]::Min($canvasWidth, $canvasHeight) * $maxScaleRatio)
    $scale = [Math]::Min($maxSize / $sourceRect.Width, $maxSize / $sourceRect.Height)

    $drawWidth = [int]([Math]::Round($sourceRect.Width * $scale))
    $drawHeight = [int]([Math]::Round($sourceRect.Height * $scale))
    $drawX = [int]([Math]::Round(($canvasWidth - $drawWidth) / 2.0))
    $drawY = [int]([Math]::Round(($canvasHeight - $drawHeight) / 2.0 + ($canvasHeight * $offsetYRatio)))
    $destRect = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawWidth, $drawHeight)

    $graphics.DrawImage($logoBitmap, $destRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  }
  finally {
    $logoBitmap.Dispose()
  }
}

function Draw-LauncherMark(
  [System.Drawing.Graphics]$graphics,
  [int]$canvasWidth,
  [int]$canvasHeight,
  [double]$scaleRatio,
  [double]$offsetYRatio = 0.0,
  [bool]$withGlow = $true,
  [bool]$withShadow = $true
) {
  $canvasSize = [double][Math]::Min($canvasWidth, $canvasHeight)
  $markSize = $canvasSize * $scaleRatio
  $cardWidth = $markSize * 0.74
  $cardHeight = $markSize * 0.74
  $cardX = ($canvasWidth - $cardWidth) / 2.0
  $cardY = (($canvasHeight - $cardHeight) / 2.0) + ($canvasHeight * $offsetYRatio)
  $cardRadius = $cardWidth * 0.16

  if ($withGlow) {
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowRect = New-Object System.Drawing.RectangleF(($cardX - ($cardWidth * 0.12)), ($cardY - ($cardHeight * 0.12)), ($cardWidth * 1.24), ($cardHeight * 1.24))
    $glowPath.AddEllipse($glowRect)
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush -ArgumentList $glowPath
    $glow.CenterColor = New-Color '#8FFF3A' 54
    $glow.SurroundColors = @((New-Color '#00C851' 0))
    $graphics.FillEllipse($glow, $glowRect)
    $glow.Dispose()
    $glowPath.Dispose()
  }

  if ($withShadow) {
    $shadowPath = New-RoundedRectPath ($cardX + ($cardWidth * 0.025)) ($cardY + ($cardHeight * 0.04)) $cardWidth $cardHeight $cardRadius
    $shadowBrush = New-ColorBrush '#031109' 90
    $graphics.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()
  }

  $cardPath = New-RoundedRectPath $cardX $cardY $cardWidth $cardHeight $cardRadius
  $cardFill = New-GradientBrush $cardX $cardY ($cardX + $cardWidth) ($cardY + $cardHeight) '#B7FF5C' '#35E96E'
  $cardBorder = New-RoundedPen '#DBFF9A' ($cardWidth * 0.028) 220
  $graphics.FillPath($cardFill, $cardPath)
  $graphics.DrawPath($cardBorder, $cardPath)
  $cardFill.Dispose()
  $cardBorder.Dispose()

  $highlightPath = New-RoundedRectPath ($cardX + ($cardWidth * 0.035)) ($cardY + ($cardHeight * 0.035)) ($cardWidth * 0.93) ($cardHeight * 0.34) ($cardRadius * 0.7)
  $highlightBrush = New-ColorBrush '#FFFFFF' 26
  $graphics.FillPath($highlightBrush, $highlightPath)
  $highlightBrush.Dispose()
  $highlightPath.Dispose()

  $detailColor = '#0B2316'
  $linePen = New-RoundedPen $detailColor ($cardWidth * 0.07)
  $checkPen = New-RoundedPen $detailColor ($cardWidth * 0.055)
  $accentPen = New-RoundedPen $detailColor ($cardWidth * 0.04) 120

  $lineStartX = [single]($cardX + ($cardWidth * 0.34))
  $lineEndX = [single]($cardX + ($cardWidth * 0.78))
  $lineYs = @(
    [single]($cardY + ($cardHeight * 0.34)),
    [single]($cardY + ($cardHeight * 0.50)),
    [single]($cardY + ($cardHeight * 0.66))
  )

  foreach ($lineY in $lineYs) {
    $graphics.DrawLine($linePen, $lineStartX, $lineY, $lineEndX, $lineY)
  }

  $checkXs = @(
    [single]($cardX + ($cardWidth * 0.15)),
    [single]($cardX + ($cardWidth * 0.19)),
    [single]($cardX + ($cardWidth * 0.27))
  )

  foreach ($lineY in $lineYs) {
    $graphics.DrawLine($checkPen, $checkXs[0], ($lineY - ($cardHeight * 0.015)), $checkXs[1], ($lineY + ($cardHeight * 0.04)))
    $graphics.DrawLine($checkPen, $checkXs[1], ($lineY + ($cardHeight * 0.04)), $checkXs[2], ($lineY - ($cardHeight * 0.06)))
  }

  $sparkPoints = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF([single]($cardX + ($cardWidth * 0.17)), [single]($cardY + ($cardHeight * 0.80)))),
    (New-Object System.Drawing.PointF([single]($cardX + ($cardWidth * 0.32)), [single]($cardY + ($cardHeight * 0.74)))),
    (New-Object System.Drawing.PointF([single]($cardX + ($cardWidth * 0.47)), [single]($cardY + ($cardHeight * 0.79)))),
    (New-Object System.Drawing.PointF([single]($cardX + ($cardWidth * 0.62)), [single]($cardY + ($cardHeight * 0.64)))),
    (New-Object System.Drawing.PointF([single]($cardX + ($cardWidth * 0.78)), [single]($cardY + ($cardHeight * 0.57))))
  )
  $graphics.DrawLines($accentPen, $sparkPoints)

  foreach ($point in $sparkPoints) {
    $dotBrush = New-ColorBrush $detailColor 170
    $dotSize = $cardWidth * 0.045
    $graphics.FillEllipse($dotBrush, ($point.X - ($dotSize / 2.0)), ($point.Y - ($dotSize / 2.0)), $dotSize, $dotSize)
    $dotBrush.Dispose()
  }

  $linePen.Dispose()
  $checkPen.Dispose()
  $accentPen.Dispose()
  $cardPath.Dispose()
}

function New-IconArt([int]$size, [string]$path) {
  Resize-PngContained $sourceIconPath $size $path 0.90 $iconBackgroundHex
}

function New-AdaptiveForegroundArt([int]$size, [string]$path) {
  Resize-PngContained $sourceIconPath $size $path 0.82
}

function Sync-NativeIconResources([string]$iconPath, [string]$foregroundPath) {
  $nativeResDir = Join-Path (Split-Path -Parent $assetDir) 'android\app\src\main\res'
  $legacySizes = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
  }
  $foregroundSizes = @{
    'mipmap-mdpi' = 108
    'mipmap-hdpi' = 162
    'mipmap-xhdpi' = 216
    'mipmap-xxhdpi' = 324
    'mipmap-xxxhdpi' = 432
  }

  foreach ($density in $legacySizes.Keys) {
    $targetDir = Join-Path $nativeResDir $density
    Resize-Png $iconPath $legacySizes[$density] (Join-Path $targetDir 'ic_launcher.png')
    Resize-Png $iconPath $legacySizes[$density] (Join-Path $targetDir 'ic_launcher_round.png')
  }

  foreach ($density in $foregroundSizes.Keys) {
    $targetDir = Join-Path $nativeResDir $density
    Resize-Png $foregroundPath $foregroundSizes[$density] (Join-Path $targetDir 'ic_launcher_foreground.png')
  }
}

function New-SplashArt([int]$width, [int]$height, [string]$path) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    Set-HighQualityGraphics $graphics
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#07110D'))

    $background = New-GradientBrush 0 0 0 $height '#07110D' '#123324'
    $graphics.FillRectangle($background, 0, 0, $width, $height)
    $background.Dispose()

    $topGlow = New-ColorBrush '#7EAA2A' 46
    $bottomGlow = New-ColorBrush '#00C851' 42
    $graphics.FillEllipse($topGlow, -220, -170, 580, 580)
    $graphics.FillEllipse($bottomGlow, $width - 340, $height - 360, 500, 500)
    $topGlow.Dispose()
    $bottomGlow.Dispose()

    $haloPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $haloRect = New-Object System.Drawing.RectangleF -ArgumentList @((($width * 0.5) - 340), (($height * 0.34) - 340), 680, 680)
    $haloPath.AddEllipse($haloRect)
    $haloBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush -ArgumentList $haloPath
    $haloBrush.CenterColor = New-Color '#31D667' 54
    $haloBrush.SurroundColors = @((New-Color '#31D667' 0))
    $graphics.FillEllipse($haloBrush, $haloRect)
    $haloBrush.Dispose()
    $haloPath.Dispose()

    $badgeSize = [int]420
    $badgeX = [int](($width - $badgeSize) / 2)
    $badgeY = [int]600
    $badgeShadow = New-ColorBrush '#02110A' 110
    $graphics.FillEllipse($badgeShadow, ($badgeX + 12), ($badgeY + 18), $badgeSize, $badgeSize)
    $badgeShadow.Dispose()

    $badgeFill = New-ColorBrush '#0B6124' 255
    $graphics.FillEllipse($badgeFill, $badgeX, $badgeY, $badgeSize, $badgeSize)
    $badgeFill.Dispose()

    $badgeRing = New-Object System.Drawing.Pen -ArgumentList @((New-Color '#31D667' 72), [float]3)
    $graphics.DrawEllipse($badgeRing, $badgeX, $badgeY, $badgeSize, $badgeSize)
    $badgeRing.Dispose()

    $markSize = [int]250
    $markX = [int](($width - $markSize) / 2)
    $markY = [int]685
    $iconPath = Join-Path $assetDir 'logo-no-bg.png'
    $iconImg = [System.Drawing.Image]::FromFile($iconPath)
    $destRect = New-Object System.Drawing.Rectangle($markX, $markY, $markSize, $markSize)
    $graphics.DrawImage($iconImg, $destRect)
    $iconImg.Dispose()

    $titleFont = New-Object System.Drawing.Font -ArgumentList @('Segoe UI', [float]76, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $taglineFont = New-Object System.Drawing.Font -ArgumentList @('Segoe UI', [float]30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $titleBrush = New-ColorBrush '#FFFFFF'
    $taglineBrush = New-ColorBrush '#C6D5CD'
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center

    $graphics.DrawString('BetIntel', $titleFont, $titleBrush, ($width / 2), 1110, $format)
    $graphics.DrawString('Regista apostas. Analisa ROI.', $taglineFont, $taglineBrush, ($width / 2), 1202, $format)

    $titleFont.Dispose()
    $taglineFont.Dispose()
    $titleBrush.Dispose()
    $taglineBrush.Dispose()
    $format.Dispose()
  }
  finally {
    $graphics.Dispose()
  }

  Save-Png $bitmap $path
}

function Sync-NativeSplashResources([string]$sourcePath) {
  $nativeResDir = Join-Path (Split-Path -Parent $assetDir) 'android\app\src\main\res'
  foreach ($density in @('drawable-mdpi', 'drawable-hdpi', 'drawable-xhdpi', 'drawable-xxhdpi', 'drawable-xxxhdpi')) {
    $targetPath = Join-Path $nativeResDir "$density\splashscreen_image.png"
    Copy-Item $sourcePath $targetPath -Force
  }
}

$iconPath = Join-Path $assetDir 'icon.png'
$adaptiveIconPath = Join-Path $assetDir 'adaptive-icon.png'
$faviconPath = Join-Path $assetDir 'favicon.png'

New-IconArt 1024 $iconPath
New-AdaptiveForegroundArt 1024 $adaptiveIconPath
New-IconArt 256 $faviconPath
Sync-NativeIconResources $iconPath $adaptiveIconPath

$splashPath = Join-Path $assetDir 'splash.png'
New-SplashArt 1242 2436 $splashPath
Sync-NativeSplashResources $splashPath

Get-ChildItem $assetDir | Select-Object Name, Length