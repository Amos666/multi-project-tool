param(
    [int]$ProcId = 27544,
    [string]$OutPath = 'z:/workspace/multi-project-tool/.trae-screenshots/shot.png'
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$code = @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class Win32Api {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing -ErrorAction SilentlyContinue

$proc = Get-Process -Id $ProcId -ErrorAction Stop
$hWnd = $proc.MainWindowHandle
if ($hWnd -eq [IntPtr]::Zero) { Write-Error 'Zero HWND'; exit 1 }

[Win32Api]::ShowWindow($hWnd, 9) | Out-Null
Start-Sleep -Milliseconds 200
[Win32Api]::SetForegroundWindow($hWnd) | Out-Null
Start-Sleep -Milliseconds 500

$rect = New-Object RECT
if (-not [Win32Api]::GetWindowRect($hWnd, [ref]$rect)) { Write-Error 'GetWindowRect failed'; exit 1 }
$width  = $rect.Right  - $rect.Left
$height = $rect.Bottom - $rect.Top
Write-Host "Window: $width x $height at ($($rect.Left),$($rect.Top))"

$bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
    $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "SAVED: $OutPath"
} finally {
    $g.Dispose()
    $bmp.Dispose()
}
