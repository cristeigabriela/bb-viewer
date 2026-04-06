# Generate bb-viewer JSON data for all datasets, architectures, and modes.
#
# Usage:
#   .\generate-data.ps1                          # all datasets, all archs, all modes
#   .\generate-data.ps1 -Dataset phnt            # only phnt
#   .\generate-data.ps1 -Arch amd64             # only amd64
#   .\generate-data.ps1 -Mode kernel            # only kernel mode
#   .\generate-data.ps1 -Dataset winsdk -Arch x86 -Mode user
#
# Requires: Windows SDK installed. Auto-detects SDK path from registry.
# Kernel mode additionally requires the WDK (install via winget:
#   winget install --exact --id Microsoft.WindowsWDK.10.0.26100)

param(
    [string]$Dataset = "",
    [string]$Arch = "",
    [string]$Mode = "",
    [string]$BbBinDir = (Join-Path $env:TEMP "bb-bin")
)

$ErrorActionPreference = "Continue"
$DataDir = Join-Path $PSScriptRoot "data"

$Datasets = @("winsdk", "phnt")
$Archs = @("amd64", "x86", "arm", "arm64")
$Modes = @(
    @{ Name = "user";   Flag = $null;         Suffix = "" },
    @{ Name = "kernel"; Flag = "--mode kernel"; Suffix = "-kernel" }
)
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

# Download latest bb tools from GitHub releases
New-Item -ItemType Directory -Path $BbBinDir -Force | Out-Null
Write-Host "downloading latest bb tools to $BbBinDir..."
foreach ($entry in $Tools) {
    $asset = "$($entry.Tool).exe"
    Write-Host -NoNewline "  $asset ... "
    gh release download --repo cristeigabriela/bb --pattern $asset --dir $BbBinDir --clobber 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "failed to download $asset"
        exit 1
    }
    Write-Host "ok"
}

$failed = 0
$total = 0

foreach ($m in $Modes) {
    if ($Mode -and $m.Name -ne $Mode) { continue }

    foreach ($ds in $Datasets) {
        if ($Dataset -and $ds -ne $Dataset) { continue }

        foreach ($a in $Archs) {
            if ($Arch -and $a -ne $Arch) { continue }

            $dir = Join-Path $DataDir "$ds$($m.Suffix)\$a"
            New-Item -ItemType Directory -Path $dir -Force | Out-Null

            foreach ($entry in $Tools) {
                $tool = $entry.Tool
                $fname = $entry.File
                $outfile = Join-Path $dir "$fname.json"
                $total++

                $modeLabel = if ($m.Suffix) { " [$($m.Name)]" } else { "" }
                Write-Host -NoNewline "  $ds/$a/$fname$modeLabel ... "

                $exe = Join-Path $BbBinDir "$tool.exe"
                $args = @("--$ds", "--arch", "$a", "--json")
                if ($m.Flag) {
                    $args += $m.Flag.Split(" ")
                }

                try {
                    $proc = Start-Process -FilePath $exe -ArgumentList $args -RedirectStandardOutput $outfile -RedirectStandardError "NUL" -NoNewWindow -Wait -PassThru
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
}

Write-Host ""
Write-Host "done. $($total - $failed)/$total succeeded."
if ($failed -gt 0) {
    Write-Warning "$failed tasks failed."
    exit 1
}
