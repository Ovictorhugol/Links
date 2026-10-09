[CmdletBinding()]
param([string]$ExpectedVersion = '0.3.7')
$ErrorActionPreference = 'Stop'
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like '*DONATO*' -or $_.ProcessName -eq 'centraldesk'
} | ForEach-Object {
    $executable = $null
    $version = $null
    try { $executable = $_.Path; if ($executable) { $version = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion } } catch {}
    [PSCustomObject]@{ ProcessId = $_.Id; Executable = $executable; Version = $version }
})
$installed = @(Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object {
        $_.DisplayName -like '*DONATO*' -or $_.DisplayName -eq 'centraldesk'
    } | Select-Object DisplayName,DisplayVersion,InstallLocation,PSChildName)
$applicationEvents = @(Get-WinEvent -FilterHashtable @{
    LogName = 'Application'; ProviderName = 'MsiInstaller'; StartTime = (Get-Date).AddDays(-2)
} -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'DONATO|centraldesk' } |
    Select-Object -First 15 TimeCreated,Id,Message)
$policyEvents = @(Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-GroupPolicy/Operational'; StartTime = (Get-Date).AddDays(-2)
} -ErrorAction SilentlyContinue | Where-Object {
    $_.Message -match 'Software|aplicativos|DONATO'
} | Select-Object -First 15 TimeCreated,Id,Message)
$assignmentEvents = @(Get-WinEvent -FilterHashtable @{
    LogName = 'System'; ProviderName = 'Application Management Group Policy'; StartTime = (Get-Date).AddDays(-2)
} -ErrorAction SilentlyContinue | Select-Object -First 15 TimeCreated,Id,Message)
$bootEvent = Get-WinEvent -FilterHashtable @{
    LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-General'; Id = 12
} -MaxEvents 1 -ErrorAction SilentlyContinue
$startupEvents = @()
if ($bootEvent) {
    $startupEvents = @(Get-WinEvent -FilterHashtable @{
        LogName = 'Microsoft-Windows-GroupPolicy/Operational'; StartTime = $bootEvent.TimeCreated
        Id = 4000,4001,4002,5310,5312,5313,5322,5340,7017,7320,8000,8001
    } -ErrorAction SilentlyContinue | Select-Object -First 40 TimeCreated,Id,Message)
}
$tcp = New-Object Net.Sockets.TcpClient
$network = $false
try {
    $pending = $tcp.ConnectAsync('systems.cho1rljqtj4r.sa-east-1.rds.amazonaws.com',5432)
    $network = $pending.Wait(5000) -and $tcp.Connected
} catch {} finally { $tcp.Dispose() }
[PSCustomObject]@{
    Computer = $env:COMPUTERNAME
    ExpectedVersion = $ExpectedVersion
    LastBootTime = $(if ($bootEvent) { $bootEvent.TimeCreated } else { $null })
    Running = $running
    Installed = $installed
    RdsPort5432Reachable = $network
    InstallerEvents = $applicationEvents
    SoftwareInstallationPolicyEvents = $policyEvents
    SoftwareAssignmentEvents = $assignmentEvents
    PolicyEventsSinceBoot = $startupEvents
} | ConvertTo-Json -Depth 5
