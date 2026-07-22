$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$tauriVersion = (Get-Content -LiteralPath (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
$cargoVersion = (Select-String -LiteralPath (Join-Path $root "src-tauri\Cargo.toml") -Pattern '^version\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$appName = "FloatingClock"

if ($version -ne $tauriVersion -or $version -ne $cargoVersion) {
    throw "Version mismatch: package.json=$version, tauri.conf.json=$tauriVersion, Cargo.toml=$cargoVersion"
}

Write-Host "Building with Tauri..." -ForegroundColor Cyan
Push-Location $root
try {
    & (Join-Path $root "node_modules\.bin\tauri.cmd") build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

$distPath = Join-Path $root "dist"
if (-not (Test-Path -LiteralPath $distPath)) {
    New-Item -ItemType Directory -Path $distPath | Out-Null
}

$nsisSource = Join-Path $root "src-tauri\target\release\bundle\nsis\${appName}_${version}_x64-setup.exe"
$nsisDest = Join-Path $distPath "${appName}-${version}-tauri-win-x64-setup.exe"

if (-not (Test-Path -LiteralPath $nsisSource)) {
    throw "NSIS installer not found at $nsisSource"
}
Copy-Item -LiteralPath $nsisSource -Destination $nsisDest -Force

$portableSource = Join-Path $root "src-tauri\target\release\floating-clock.exe"
$portableDest = Join-Path $distPath "${appName}-${version}-tauri-win-x64.exe"

if (-not (Test-Path -LiteralPath $portableSource)) {
    throw "Portable executable not found at $portableSource"
}
Copy-Item -LiteralPath $portableSource -Destination $portableDest -Force

Write-Host "Build complete!" -ForegroundColor Cyan
