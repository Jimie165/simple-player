param(
    [int]$DurationMs = 30000,
    [double]$StartSeconds = 35,
    [int]$WarmupMs = 2000,
    [double]$MaxBoundaryFrameMs = 16.67,
    [int]$CdpPort = 9222,
    [int]$DevServerPort = 5173,
    [string]$TrackTitle,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if (-not $OutputPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path $PWD "logs/diagnostics/lyrics-performance-test-$stamp.json"
}

& (Join-Path $PSScriptRoot 'profile-lyrics.ps1') `
    -DurationMs $DurationMs `
    -StartSeconds $StartSeconds `
    -WarmupMs $WarmupMs `
    -CdpPort $CdpPort `
    -DevServerPort $DevServerPort `
    -TrackTitle $TrackTitle `
    -OutputPath $OutputPath | Out-Null
if (-not $?) { throw 'Failed to collect the lyrics performance profile.' }

$summaryJson = node (Join-Path $PSScriptRoot 'analyze-lyrics-profile.mjs') $OutputPath
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to analyze the lyrics performance profile.'
}
$summary = ($summaryJson | ConvertFrom-Json)[0]

[PSCustomObject]@{
    Profile = [IO.Path]::GetFullPath($OutputPath)
    BoundaryCount = $summary.boundaryCount
    BoundaryAverageMs = [Math]::Round($summary.boundaryPeakAverageMs, 2)
    BoundaryWorstMs = [Math]::Round($summary.boundaryPeakWorstMs, 2)
} | Format-List

if ($summary.boundaryCount -eq 0) {
    throw 'No lyric line boundary was captured. Increase DurationMs or choose another StartSeconds value.'
}
if ($summary.boundaryPeakWorstMs -gt $MaxBoundaryFrameMs) {
    throw "Worst lyric boundary frame $([Math]::Round($summary.boundaryPeakWorstMs, 2))ms exceeded ${MaxBoundaryFrameMs}ms."
}
