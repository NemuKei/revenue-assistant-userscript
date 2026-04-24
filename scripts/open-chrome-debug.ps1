param(
    [switch]$UseChromeUserData,
    [switch]$RestoreLastSession,
    [string]$UserDataDir,
    [string]$ProfileDirectory,
    [string]$StartUrl,
    [int]$Port = 9222
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")

if (-not $UserDataDir) {
    if ($UseChromeUserData) {
        $UserDataDir = Join-Path $Env:LocalAppData "Google\Chrome\User Data"
    }
    else {
        $UserDataDir = Join-Path $projectRoot ".chrome-debug-profile"
    }
}

if (-not $ProfileDirectory -and $UseChromeUserData) {
    $ProfileDirectory = "Default"
}

if (-not (Test-Path $UserDataDir)) {
    New-Item -ItemType Directory -Path $UserDataDir | Out-Null
}

$chromeCandidates = @(
    (Join-Path $Env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    $(if ($programFilesX86) { Join-Path $programFilesX86 "Google\Chrome\Application\chrome.exe" }),
    (Join-Path $Env:LocalAppData "Google\Chrome\Application\chrome.exe")
)

$chromePath = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $chromePath) {
    throw "Google Chrome が見つかりません。Chrome をインストールしてから再実行してください。"
}

if ($UseChromeUserData) {
    $chromeProcesses = Get-Process chrome -ErrorAction SilentlyContinue

    if ($chromeProcesses) {
        throw "既存の Chrome プロファイルを使う場合は、Chrome を完全に閉じてから再実行してください。Chrome を閉じずに起動したい場合は、Run and Debug の 'Chrome: Dedicated Debug Profile' か npm run chrome:debug を使ってください。"
    }
}

$arguments = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$UserDataDir",
    "--no-first-run",
    "--no-default-browser-check"
)

if ($RestoreLastSession) {
    $arguments += "--restore-last-session"
}
elseif ($StartUrl) {
    $arguments += $StartUrl
}
else {
    $arguments += "about:blank"
}

if ($ProfileDirectory) {
    $arguments = @(
        "--profile-directory=$ProfileDirectory"
    ) + $arguments
}

Start-Process -FilePath $chromePath -ArgumentList $arguments

if ($UseChromeUserData) {
    if ($RestoreLastSession) {
        Write-Host "Chrome を既存プロファイルでデバッグポート $Port 付き起動しました。profile=$ProfileDirectory restore-last-session=true"
    }
    else {
        Write-Host "Chrome を既存プロファイルでデバッグポート $Port 付き起動しました。profile=$ProfileDirectory"
    }
}
else {
    Write-Host "Chrome をデバッグポート $Port 付きで起動しました。Tampermonkey はこの専用プロファイルに入れてください。"
}
