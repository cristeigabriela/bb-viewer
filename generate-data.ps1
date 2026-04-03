# Generate bb-viewer JSON data for all datasets and architectures.
#
# Usage:
#   .\generate-data.ps1                          # all datasets, all archs
#   .\generate-data.ps1 -Dataset phnt            # only phnt
#   .\generate-data.ps1 -Arch amd64             # only amd64
#   .\generate-data.ps1 -Dataset winsdk -Arch x86
#
# Requires: Windows SDK installed. Auto-detects SDK path from registry.

param(
    [string]$Dataset = "",
    [string]$Arch = "",
    [string]$BbRoot = "C:\dev\rust\bb\bb"
)

$ErrorActionPreference = "Continue"
$DataDir = Join-Path $PSScriptRoot "data"

$Datasets = @("winsdk", "phnt")
$Archs = @("amd64", "x86", "arm", "arm64")
$Tools = @(
    @{ Tool = "bb-funcs"; File = "funcs" },
    @{ Tool = "bb-types"; File = "types" },
    @{ Tool = "bb-consts"; File = "consts" }
)

# Auto-detect Windows SDK if not in environment
if (-not $env:WindowsSdkDir) {
    $sdkRoot = "C:\Program Files (x86)\Windows Kits\10\"
    if (Test-Path $sdkRoot) {
        $env:WindowsSdkDir = $sdkRoot
        $versions = Get-ChildItem (Join-Path $sdkRoot "Include") -Directory | Sort-Object Name
        $latest = $versions[-1].Name
        $env:WindowsSDKLibVersion = "$latest\"
        Write-Host "auto-detected sdk: $latest"
    } else {
        Write-Error "WindowsSdkDir not set and SDK not found. Run from Developer Command Prompt."
        exit 1
    }
}

# Build bb tools
Write-Host "building bb tools..."
Push-Location $BbRoot
$buildOutput = cmd /c "cargo build --release --bin bb-funcs --bin bb-types --bin bb-consts 2>&1"
$buildOutput | Select-Object -Last 3 | Write-Host
Pop-Location

$failed = 0
$total = 0

foreach ($ds in $Datasets) {
    if ($Dataset -and $ds -ne $Dataset) { continue }

    foreach ($arch in $Archs) {
        if ($Arch -and $arch -ne $Arch) { continue }

        $dir = Join-Path $DataDir "$ds\$arch"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null

        foreach ($entry in $Tools) {
            $tool = $entry.Tool
            $fname = $entry.File
            $outfile = Join-Path $dir "$fname.json"
            $total++

            Write-Host -NoNewline "  $ds/$arch/$fname ... "

            $exe = Join-Path $BbRoot "target\release\$tool.exe"
            try {
                $proc = Start-Process -FilePath $exe -ArgumentList "--$ds","--arch","$arch","--json" -RedirectStandardOutput $outfile -RedirectStandardError "NUL" -NoNewWindow -Wait -PassThru
                if ($proc.ExitCode -ne 0) { throw "exit code $($proc.ExitCode)" }
                $size = (Get-Item $outfile).Length
                if ($size -eq 0) {
                    throw "empty output"
                }
                $sizeStr = if ($size -gt 1MB) { "{0:N1} MB" -f ($size / 1MB) }
                           elseif ($size -gt 1KB) { "{0:N0} KB" -f ($size / 1KB) }
                           else { "$size B" }
                Write-Host "ok ($sizeStr)"
            } catch {
                Write-Host "FAILED"
                Remove-Item $outfile -ErrorAction SilentlyContinue
                $failed++
            }
        }
    }
}

Write-Host ""
Write-Host "done. $($total - $failed)/$total succeeded."
if ($failed -gt 0) {
    Write-Warning "$failed tasks failed."
    exit 1
}
