param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$TrackTitle,
    [int]$Runs = 3,
    [int]$DurationMs = 600000,
    [int]$WarmupMs = 750,
    [int]$CdpPort = 9222,
    [int]$DevServerPort = 5173,
    [string]$OutputDirectory = 'logs/diagnostics/baseline',
    [switch]$LowOverhead
)

$ErrorActionPreference = 'Stop'
if ($Runs -lt 1 -or $Runs -gt 10) { throw 'Runs must be between 1 and 10.' }
if ($TrackTitle.Count -eq 0) { throw 'At least one TrackTitle is required.' }

$outputDirectoryPath = [IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $outputDirectoryPath)) {
    New-Item -ItemType Directory -Path $outputDirectoryPath | Out-Null
}

$profileScript = Join-Path $PSScriptRoot 'profile-lyrics.ps1'
$analyzerScript = Join-Path $PSScriptRoot 'analyze-lyrics-profile.mjs'
$profiles = [Collections.Generic.List[string]]::new()

foreach ($title in $TrackTitle) {
    for ($run = 1; $run -le $Runs; $run++) {
        $safeTitle = ($title -replace '[^\p{L}\p{N}_-]+', '_').Trim('_')
        if (-not $safeTitle) { $safeTitle = 'track' }
        $outputPath = Join-Path $outputDirectoryPath "$safeTitle-$run.json"
        & $profileScript `
            -DurationMs $DurationMs `
            -WarmupMs $WarmupMs `
            -CdpPort $CdpPort `
            -DevServerPort $DevServerPort `
            -TrackTitle $title `
            -StopOnTrackChange `
            -LowOverhead:$LowOverhead `
            -OutputPath $outputPath | Out-Null
        if (-not $?) { throw "Profile failed for '$title' run $run." }
        $profiles.Add($outputPath)
    }
}

& node $analyzerScript @profiles
if ($LASTEXITCODE -ne 0) { throw 'Failed to analyze the baseline profiles.' }
