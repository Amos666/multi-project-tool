Add-Type -AssemblyName System.Drawing
$path = 'z:\workspace\multi-project-tool\resources\icon.png'
if (Test-Path $path) {
    $img = [System.Drawing.Image]::FromFile($path)
    Write-Host "icon.png - Width: $($img.Width) Height: $($img.Height)"
    $img.Dispose()
} else {
    Write-Host "icon.png not found"
}
$svgPath = 'z:\workspace\multi-project-tool\resources\icon.svg'
if (Test-Path $svgPath) {
    $size = (Get-Item $svgPath).Length
    Write-Host "icon.svg exists, size: $size bytes"
}
