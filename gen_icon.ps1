Add-Type -AssemblyName System.Drawing

$size = 128
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# background rounded rect
$rect = New-Object System.Drawing.Rectangle(4, 4, 120, 120)
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 20
$bgPath.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
$bgPath.AddArc(104, $rect.Y, $radius, $radius, 270, 90)
$bgPath.AddArc(104, 104, $radius, $radius, 0, 90)
$bgPath.AddArc($rect.X, 104, $radius, $radius, 90, 90)
$bgPath.CloseFigure()

$p1 = New-Object System.Drawing.Point(4, 4)
$p2 = New-Object System.Drawing.Point(124, 124)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2, [System.Drawing.Color]::FromArgb(255, 88, 86, 214), [System.Drawing.Color]::FromArgb(255, 43, 43, 191))
$g.FillPath($brush, $bgPath)

# terminal window (white rounded rect)
$winPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$wr = 8
$winPath.AddArc(24, 30, $wr, $wr, 180, 90)
$winPath.AddArc(96, 30, $wr, $wr, 270, 90)
$winPath.AddArc(96, 82, $wr, $wr, 0, 90)
$winPath.AddArc(24, 82, $wr, $wr, 90, 90)
$winPath.CloseFigure()
$g.FillPath([System.Drawing.Brushes]::White, $winPath)

# title bar dots (red, yellow, green)
$dotR = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 95, 86))
$dotY = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 189, 46))
$dotG = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 39, 201, 63))
$g.FillEllipse($dotR, 32, 37, 6, 6)
$g.FillEllipse($dotY, 42, 37, 6, 6)
$g.FillEllipse($dotG, 52, 37, 6, 6)

# code lines inside terminal
$lineColor = [System.Drawing.Color]::FromArgb(180, 88, 86, 214)
$linePen = New-Object System.Drawing.Pen($lineColor, 3)
$g.DrawLine($linePen, 32, 54, 70, 54)
$g.DrawLine($linePen, 32, 63, 85, 63)
$g.DrawLine($linePen, 32, 72, 60, 72)

# git branch icon (top-right, green)
$branchColor = [System.Drawing.Color]::FromArgb(255, 52, 209, 142)
$branchPen = New-Object System.Drawing.Pen($branchColor, 4)
$branchPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$branchPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($branchPen, 92, 18, 92, 30)
$g.DrawBezier($branchPen, 92, 22, 84, 24, 80, 26, 78, 30)
$g.FillEllipse([System.Drawing.Brushes]::LimeGreen, 88, 14, 8, 8)
$g.FillEllipse([System.Drawing.Brushes]::LimeGreen, 88, 28, 8, 8)
$g.FillEllipse([System.Drawing.Brushes]::LimeGreen, 74, 28, 8, 8)

# folder icons (bottom, white translucent)
$folderColor = [System.Drawing.Color]::FromArgb(220, 255, 255, 255)
$folderBrush = New-Object System.Drawing.SolidBrush($folderColor)
$folders = @(
    (New-Object System.Drawing.Rectangle(24, 98, 20, 16)),
    (New-Object System.Drawing.Rectangle(54, 98, 20, 16)),
    (New-Object System.Drawing.Rectangle(84, 98, 20, 16))
)
foreach ($f in $folders) {
    $fp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $fr = 3
    $fp.AddArc($f.X, $f.Y, $fr, $fr, 180, 90)
    $fp.AddArc($f.Right - $fr, $f.Y, $fr, $fr, 270, 90)
    $fp.AddArc($f.Right - $fr, $f.Bottom - $fr, $fr, $fr, 0, 90)
    $fp.AddArc($f.X, $f.Bottom - $fr, $fr, $fr, 90, 90)
    $fp.CloseFigure()
    $g.FillPath($folderBrush, $fp)
}

$g.Dispose()
$bmp.Save('z:\workspace\multi-project-tool\resources\icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# verify
$check = [System.Drawing.Image]::FromFile('z:\workspace\multi-project-tool\resources\icon.png')
Write-Host "Generated icon.png - Width: $($check.Width) Height: $($check.Height)"
$check.Dispose()
