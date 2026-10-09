param([string]$SourceIcon)
$ErrorActionPreference = 'Stop'
if (-not $SourceIcon) {
    $SourceIcon = Join-Path $PSScriptRoot 'donato-eye.ico'
    if (-not (Test-Path -LiteralPath $SourceIcon)) {
        $SourceIcon = Join-Path $PSScriptRoot '../src-tauri/icons/icon.ico'
    }
}
$taskSource = (Resolve-Path -LiteralPath $SourceIcon).Path
$taskHash = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.Substring(0,16).ToLowerInvariant()
$taskDirectory = Join-Path $env:ProgramData 'DonatoLinks/icons'
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$taskIcon = Join-Path $taskDirectory ('donato-eye-' + $taskHash + '.ico')
Copy-Item -LiteralPath $taskSource -Destination $taskIcon -Force
if ((Get-FileHash -LiteralPath $taskIcon).Hash -ne (Get-FileHash -LiteralPath $taskSource).Hash) {
    throw 'Icon copy verification failed.'
}
$taskBackup = Join-Path $env:ProgramData ('DonatoLinks/shortcut-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$taskPlaces = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('CommonPrograms'),
    (Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar')
) | Select-Object -Unique
$taskShell = New-Object -ComObject WScript.Shell
$taskUpdated = @()
foreach ($taskPlace in $taskPlaces) {
    if (-not (Test-Path -LiteralPath $taskPlace)) { continue }
    foreach ($taskFile in Get-ChildItem -LiteralPath $taskPlace -Recurse -Filter '*.lnk') {
        $taskLink = $taskShell.CreateShortcut($taskFile.FullName)
        if ([IO.Path]::GetFileName($taskLink.TargetPath) -notmatch '^LINKS .+ DONATO\.exe$') { continue }
        New-Item -ItemType Directory -Path $taskBackup -Force | Out-Null
        Copy-Item -LiteralPath $taskFile.FullName -Destination (Join-Path $taskBackup (($taskUpdated.Count).ToString() + '.lnk'))
        $taskLink.IconLocation = $taskIcon + ',0'
        $taskLink.Save()
        $taskUpdated += $taskFile.FullName
    }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DonatoShortcutIconRefresh {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(uint eventId, uint flags, string item1, string item2);
}
'@
foreach ($taskPath in $taskUpdated) {
    [DonatoShortcutIconRefresh]::SHChangeNotify(0x2000,0x1005,$taskPath,$null)
}
[DonatoShortcutIconRefresh]::SHChangeNotify(0x08000000,0,$null,$null)
$taskRefresh = Join-Path $env:WINDIR 'System32/ie4uinit.exe'
if (Test-Path -LiteralPath $taskRefresh) {
    Start-Process -FilePath $taskRefresh -ArgumentList '-show' -WindowStyle Hidden -Wait
}
Write-Output ('Updated shortcuts: ' + $taskUpdated.Count)
Write-Output ('Icon: ' + $taskIcon)
