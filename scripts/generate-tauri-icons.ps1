param(
    [Parameter(Mandatory = $false)]
    [string]$Source = "backend\tauri\icons\logo.png",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "backend\tauri\icons",

    [Parameter(Mandatory = $false)]
    [double]$PaddingRatio = 0.14
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path $Source).Path
$outputPath = (Resolve-Path $OutputDir).Path

function Get-ContentBounds([System.Drawing.Bitmap]$image) {
    $minX = $image.Width
    $minY = $image.Height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $image.Height; $y++) {
        for ($x = 0; $x -lt $image.Width; $x++) {
            $pixel = $image.GetPixel($x, $y)
            if ($pixel.A -gt 0) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -lt 0 -or $maxY -lt 0) {
        return $null
    }

    return [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
}

function New-IconBitmap([System.Drawing.Bitmap]$source, [System.Drawing.Rectangle]$bounds, [int]$size, [double]$paddingRatio) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        $usableSize = [Math]::Max(1, [int][Math]::Round($size * (1 - ($paddingRatio * 2))))
        $ratio = [Math]::Min($usableSize / $bounds.Width, $usableSize / $bounds.Height)
        $drawWidth = [int][Math]::Round($bounds.Width * $ratio)
        $drawHeight = [int][Math]::Round($bounds.Height * $ratio)
        $offsetX = [int][Math]::Floor(($size - $drawWidth) / 2)
        $offsetY = [int][Math]::Floor(($size - $drawHeight) / 2)

        $destination = New-Object System.Drawing.Rectangle $offsetX, $offsetY, $drawWidth, $drawHeight
        $graphics.DrawImage($source, $destination, $bounds, [System.Drawing.GraphicsUnit]::Pixel)
        return $bitmap
    }
    finally {
        $graphics.Dispose()
    }
}

function Save-Png([System.Drawing.Bitmap]$source, [System.Drawing.Rectangle]$bounds, [int]$size, [string]$path, [double]$paddingRatio) {
    $bitmap = New-IconBitmap $source $bounds $size $paddingRatio
    try {
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $bitmap.Dispose()
    }
}

function Write-BigEndianUInt32([System.IO.BinaryWriter]$writer, [UInt32]$value) {
    $bytes = [BitConverter]::GetBytes($value)
    if ([BitConverter]::IsLittleEndian) {
        [Array]::Reverse($bytes)
    }
    $writer.Write($bytes)
}

$image = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
    $bounds = Get-ContentBounds $image
    if ($null -eq $bounds) {
        throw "Source image has no visible pixels: $sourcePath"
    }

    Save-Png $image $bounds 32 (Join-Path $outputPath '32x32.png') $PaddingRatio
    Save-Png $image $bounds 128 (Join-Path $outputPath '128x128.png') $PaddingRatio

    $icoSizes = @(16, 24, 32, 48, 64, 128, 256)
    $icoPath = Join-Path $outputPath 'icon.ico'
    $icoStream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
    $icoWriter = New-Object System.IO.BinaryWriter $icoStream
    try {
        $icoImages = @()
        foreach ($size in $icoSizes) {
            $bitmap = New-IconBitmap $image $bounds $size $PaddingRatio
            try {
                $memory = New-Object System.IO.MemoryStream
                $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
                $icoImages += [PSCustomObject]@{
                    Size = $size
                    Bytes = $memory.ToArray()
                }
                $memory.Dispose()
            }
            finally {
                $bitmap.Dispose()
            }
        }

        $icoWriter.Write([UInt16]0)
        $icoWriter.Write([UInt16]1)
        $icoWriter.Write([UInt16]$icoImages.Count)

        $offset = 6 + (16 * $icoImages.Count)
        foreach ($entry in $icoImages) {
            $dimension = if ($entry.Size -ge 256) { 0 } else { [byte]$entry.Size }
            $icoWriter.Write([byte]$dimension)
            $icoWriter.Write([byte]$dimension)
            $icoWriter.Write([byte]0)
            $icoWriter.Write([byte]0)
            $icoWriter.Write([UInt16]1)
            $icoWriter.Write([UInt16]32)
            $icoWriter.Write([UInt32]$entry.Bytes.Length)
            $icoWriter.Write([UInt32]$offset)
            $offset += $entry.Bytes.Length
        }

        foreach ($entry in $icoImages) {
            $icoWriter.Write($entry.Bytes)
        }
    }
    finally {
        $icoWriter.Dispose()
        $icoStream.Dispose()
    }

    $icnsEntries = @(
        @{ Type = 'icp4'; Size = 16 },
        @{ Type = 'icp5'; Size = 32 },
        @{ Type = 'icp6'; Size = 64 },
        @{ Type = 'ic07'; Size = 128 },
        @{ Type = 'ic08'; Size = 256 },
        @{ Type = 'ic09'; Size = 512 }
    )
    $icnsPayloads = @()
    foreach ($entry in $icnsEntries) {
        $bitmap = New-IconBitmap $image $bounds $entry.Size $PaddingRatio
        try {
            $memory = New-Object System.IO.MemoryStream
            $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
            $icnsPayloads += [PSCustomObject]@{
                Type = $entry.Type
                Bytes = $memory.ToArray()
            }
            $memory.Dispose()
        }
        finally {
            $bitmap.Dispose()
        }
    }

    $icnsPath = Join-Path $outputPath 'icon.icns'
    $icnsStream = [System.IO.File]::Open($icnsPath, [System.IO.FileMode]::Create)
    $icnsWriter = New-Object System.IO.BinaryWriter $icnsStream
    try {
        $totalLength = 8
        foreach ($entry in $icnsPayloads) {
            $totalLength += 8 + $entry.Bytes.Length
        }

        $icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
        Write-BigEndianUInt32 $icnsWriter ([UInt32]$totalLength)

        foreach ($entry in $icnsPayloads) {
            $icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes($entry.Type))
            Write-BigEndianUInt32 $icnsWriter ([UInt32](8 + $entry.Bytes.Length))
            $icnsWriter.Write($entry.Bytes)
        }
    }
    finally {
        $icnsWriter.Dispose()
        $icnsStream.Dispose()
    }
}
finally {
    $image.Dispose()
}

Get-ChildItem -Path $outputPath | Select-Object Name, Length, LastWriteTime
