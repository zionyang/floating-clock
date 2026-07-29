$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$tauriVersion = (Get-Content -LiteralPath (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
$cargoVersion = (Select-String -LiteralPath (Join-Path $root "src-tauri\Cargo.toml") -Pattern '^version\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$appName = "FloatingClock"
$signingDirectory = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".tauri"
$defaultSigningKey = Join-Path $signingDirectory "floating-clock.key"
$encryptedPasswordFile = Join-Path $signingDirectory "floating-clock.password.dpapi"

if ($version -ne $tauriVersion -or $version -ne $cargoVersion) {
    throw "Version mismatch: package.json=$version, tauri.conf.json=$tauriVersion, Cargo.toml=$cargoVersion"
}
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY) -and (Test-Path -LiteralPath $defaultSigningKey)) {
    $env:TAURI_SIGNING_PRIVATE_KEY = $defaultSigningKey
}
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) -and (Test-Path -LiteralPath $encryptedPasswordFile)) {
    $securePassword = Get-Content -LiteralPath $encryptedPasswordFile -Raw | ConvertTo-SecureString
    $credential = [PSCredential]::new("updater", $securePassword)
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $credential.GetNetworkCredential().Password
}
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
    throw "TAURI_SIGNING_PRIVATE_KEY must point to the updater private key"
}
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) {
    throw "Updater signing password is required. Initialize $encryptedPasswordFile or set TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
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
$signatureSource = "$nsisSource.sig"
$nsisDest = Join-Path $distPath "${appName}-${version}-tauri-win-x64-setup.exe"
$signatureDest = "$nsisDest.sig"

if (-not (Test-Path -LiteralPath $nsisSource)) {
    throw "NSIS installer not found at $nsisSource"
}
if (-not (Test-Path -LiteralPath $signatureSource)) {
    throw "Updater signature not found at $signatureSource"
}
Copy-Item -LiteralPath $nsisSource -Destination $nsisDest -Force
Copy-Item -LiteralPath $signatureSource -Destination $signatureDest -Force

$portableSource = Join-Path $root "src-tauri\target\release\floating-clock.exe"
$portableDest = Join-Path $distPath "${appName}-${version}-tauri-win-x64.exe"

if (-not (Test-Path -LiteralPath $portableSource)) {
    throw "Portable executable not found at $portableSource"
}
Copy-Item -LiteralPath $portableSource -Destination $portableDest -Force

$releaseUrl = "https://github.com/zionyang/floating-clock/releases/download/v$version/$([Uri]::EscapeDataString((Split-Path -Leaf $nsisDest)))"
$latest = [ordered]@{
    version = $version
    notes = "See the GitHub release notes."
    pub_date = (Get-Date).ToUniversalTime().ToString("o")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            url = $releaseUrl
            signature = (Get-Content -LiteralPath $signatureSource -Raw).Trim()
        }
    }
}
$latest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $distPath "latest.json") -Encoding utf8

Write-Host "Build complete!" -ForegroundColor Cyan
