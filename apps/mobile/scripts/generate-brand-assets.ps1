Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$assetDir = Join-Path (Split-Path -Parent $scriptRoot) 'assets'

if (!(Test-Path $assetDir)) {
  New-Item -ItemType Directory -Path $assetDir | Out-Null
}

function New-ColorBrush([string]$hex, [int]$alpha = 255) {
  $color = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
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

function Draw-BrandMark([System.Drawing.Graphics]$graphics, [float]$scale, [float]$offsetX, [float]$offsetY) {
  $panelPath = New-RoundedRectPath (40 * $scale + $offsetX) (34 * $scale + $offsetY) (176 * $scale) (176 * $scale) (42 * $scale)
  $panelBrush = New-GradientBrush 0 0 (216 * $scale) (216 * $scale) '#0E1713' '#1D2D26'
  $panelBorder = New-Object System.Drawing.Pen -ArgumentList @([System.Drawing.Color]::FromArgb(110, 0, 200, 81), [float](6 * $scale))
  $graphics.FillPath($panelBrush, $panelPath)
  $graphics.DrawPath($panelBorder, $panelPath)
  $panelBorder.Dispose()
  $panelBrush.Dispose()
  $panelPath.Dispose()

  $chartPen = New-Object System.Drawing.Pen -ArgumentList @([System.Drawing.ColorTranslator]::FromHtml('#FFD700'), [float](11 * $scale))
  $chartPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $chartPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($chartPen, (72 * $scale) + $offsetX, (162 * $scale) + $offsetY, (106 * $scale) + $offsetX, (128 * $scale) + $offsetY)
  $graphics.DrawLine($chartPen, (106 * $scale) + $offsetX, (128 * $scale) + $offsetY, (140 * $scale) + $offsetX, (140 * $scale) + $offsetY)
  $graphics.DrawLine($chartPen, (140 * $scale) + $offsetX, (140 * $scale) + $offsetY, (182 * $scale) + $offsetX, (88 * $scale) + $offsetY)
  $chartPen.Dispose()

  $dotBrush = New-ColorBrush '#FFD700'
  foreach ($point in @(@(72, 162, 10), @(106, 128, 9), @(140, 140, 9), @(182, 88, 12))) {
    $graphics.FillEllipse($dotBrush, ($point[0] - $point[2]) * $scale + $offsetX, ($point[1] - $point[2]) * $scale + $offsetY, ($point[2] * 2) * $scale, ($point[2] * 2) * $scale)
  }
  $dotBrush.Dispose()

  $greenBrush = New-ColorBrush '#00C851'
  $darkFillBrush = New-ColorBrush '#1E2B25'
  $cutBrush = New-ColorBrush '#0E1713'

  $bStem = New-RoundedRectPath (58 * $scale + $offsetX) (52 * $scale + $offsetY) (54 * $scale) (138 * $scale) (22 * $scale)
  $bTop = New-RoundedRectPath (92 * $scale + $offsetX) (58 * $scale + $offsetY) (74 * $scale) (52 * $scale) (24 * $scale)
  $bBottom = New-RoundedRectPath (92 * $scale + $offsetX) (124 * $scale + $offsetY) (64 * $scale) (52 * $scale) (24 * $scale)
  $graphics.FillPath($greenBrush, $bStem)
  $graphics.FillPath($greenBrush, $bTop)
  $graphics.FillPath($greenBrush, $bBottom)
  $bStem.Dispose()
  $bTop.Dispose()
  $bBottom.Dispose()

  $graphics.FillEllipse($cutBrush, 109 * $scale + $offsetX, 73 * $scale + $offsetY, 34 * $scale, 24 * $scale)
  $graphics.FillEllipse($cutBrush, 107 * $scale + $offsetX, 139 * $scale + $offsetY, 28 * $scale, 24 * $scale)

  $iBar = New-RoundedRectPath (168 * $scale + $offsetX) (52 * $scale + $offsetY) (22 * $scale) (114 * $scale) (11 * $scale)
  $graphics.FillPath($darkFillBrush, $iBar)
  $graphics.FillEllipse((New-ColorBrush '#FFD700'), 166 * $scale + $offsetX, 30 * $scale + $offsetY, 26 * $scale, 26 * $scale)
  $iBar.Dispose()

  $greenBrush.Dispose()
  $darkFillBrush.Dispose()
  $cutBrush.Dispose()
}

function New-IconArt([int]$size, [string]$path) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#08110D'))

    $background = New-GradientBrush 0 0 $size $size '#08110D' '#123022'
    $graphics.FillRectangle($background, 0, 0, $size, $size)
    $background.Dispose()

    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowRect = New-Object System.Drawing.RectangleF(($size * 0.14), ($size * 0.12), ($size * 0.72), ($size * 0.72))
    $glowPath.AddEllipse($glowRect)
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush -ArgumentList $glowPath
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(100, 0, 200, 81)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 200, 81))
    $graphics.FillEllipse($glow, $glowRect)
    $glow.Dispose()
    $glowPath.Dispose()

    Draw-BrandMark $graphics ($size / 256.0) 0 0
  }
  finally {
    $graphics.Dispose()
  }

  Save-Png $bitmap $path
}

function New-SplashArt([int]$width, [int]$height, [string]$path) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#08110D'))

    $background = New-GradientBrush 0 0 $width $height '#08110D' '#143427'
    $graphics.FillRectangle($background, 0, 0, $width, $height)
    $background.Dispose()

    $goldGlow = New-ColorBrush '#FFD700' 22
    $greenGlow = New-ColorBrush '#00C851' 28
    $graphics.FillEllipse($goldGlow, -180, -100, 760, 760)
    $graphics.FillEllipse($greenGlow, $width - 520, $height - 540, 620, 620)
    $goldGlow.Dispose()
    $greenGlow.Dispose()

    $markSize = 340.0
    $markX = ($width - $markSize) / 2
    $markY = 200.0
    Draw-BrandMark $graphics ($markSize / 256.0) $markX $markY

    $titleFont = New-Object System.Drawing.Font -ArgumentList @('Segoe UI', [float]56, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $taglineFont = New-Object System.Drawing.Font -ArgumentList @('Segoe UI', [float]24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $subFont = New-Object System.Drawing.Font -ArgumentList @('Segoe UI', [float]18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $titleBrush = New-ColorBrush '#FFFFFF'
    $taglineBrush = New-ColorBrush '#B5C5BD'
    $subBrush = New-ColorBrush '#FFD700'
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center

    $graphics.DrawString('BetIntel', $titleFont, $titleBrush, ($width / 2), 610, $format)
    $graphics.DrawString('Odds smarter. Boletins cleaner.', $taglineFont, $taglineBrush, ($width / 2), 690, $format)
    $graphics.DrawString('Portuguese betting companion', $subFont, $subBrush, ($width / 2), 742, $format)

    $titleFont.Dispose()
    $taglineFont.Dispose()
    $subFont.Dispose()
    $titleBrush.Dispose()
    $taglineBrush.Dispose()
    $subBrush.Dispose()
    $format.Dispose()
  }
  finally {
    $graphics.Dispose()
  }

  Save-Png $bitmap $path
}

New-IconArt 1024 (Join-Path $assetDir 'icon.png')
New-IconArt 1024 (Join-Path $assetDir 'adaptive-icon.png')
New-IconArt 256 (Join-Path $assetDir 'favicon.png')
New-SplashArt 1242 2436 (Join-Path $assetDir 'splash.png')

Get-ChildItem $assetDir | Select-Object Name, Length