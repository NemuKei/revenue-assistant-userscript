$userDataDir = Join-Path $Env:LocalAppData "Google\Chrome\User Data"

if (-not (Test-Path $userDataDir)) {
    throw "Chrome のユーザーデータディレクトリが見つかりません。"
}

$profiles = Get-ChildItem $userDataDir -Directory |
Where-Object { $_.Name -eq "Default" -or $_.Name -like "Profile *" } |
Sort-Object Name

if (-not $profiles) {
    Write-Host "利用可能な Chrome プロファイルが見つかりませんでした。"
    exit 0
}

$profiles |
Select-Object @{ Name = "ProfileDirectory"; Expression = { $_.Name } },
@{ Name = "Path"; Expression = { $_.FullName } } |
Format-Table -AutoSize
