param(
    [Parameter(Mandatory = $true)][string]$MsiPath,
    [Parameter(Mandatory = $true)][string]$PreviousMsiPath
)
$ErrorActionPreference = 'Stop'
$taskInstaller = New-Object -ComObject WindowsInstaller.Installer
function Read-MsiProperty($taskDatabase, [string]$taskName) {
    $taskQuery = 'SELECT `Value` FROM `Property` WHERE `Property` = ''' + $taskName + ''''
    $taskView = $taskDatabase.OpenView($taskQuery)
    [void]$taskView.Execute()
    $taskRecord = $taskView.Fetch()
    try { if ($taskRecord) { return $taskRecord.StringData(1) } }
    finally { [void]$taskView.Close() }
}
$taskNew = $taskInstaller.OpenDatabase((Resolve-Path -LiteralPath $MsiPath).Path, 0)
$taskPrevious = $taskInstaller.OpenDatabase((Resolve-Path -LiteralPath $PreviousMsiPath).Path, 0)
$taskMetadata = [ordered]@{}
foreach ($taskName in @('ProductVersion','ProductCode','UpgradeCode','ALLUSERS')) {
    $taskMetadata[$taskName] = Read-MsiProperty $taskNew $taskName
}
if ($taskMetadata.ALLUSERS -ne '1') { throw 'O MSI precisa instalar por máquina.' }
if ($taskMetadata.UpgradeCode -ne (Read-MsiProperty $taskPrevious 'UpgradeCode')) { throw 'UpgradeCode mudou.' }
if ($taskMetadata.ProductCode -eq (Read-MsiProperty $taskPrevious 'ProductCode')) { throw 'ProductCode precisa mudar para major upgrade.' }
if ([version]$taskMetadata.ProductVersion -le [version](Read-MsiProperty $taskPrevious 'ProductVersion')) { throw 'A versão do MSI precisa aumentar.' }
$taskView = $taskNew.OpenView('SELECT `UpgradeCode`, `VersionMax`, `ActionProperty` FROM `Upgrade`')
[void]$taskView.Execute()
$taskUpgradeFound = $false
while ($taskRecord = $taskView.Fetch()) {
    if ($taskRecord.StringData(1) -eq $taskMetadata.UpgradeCode -and $taskRecord.StringData(2) -eq $taskMetadata.ProductVersion) { $taskUpgradeFound = $true }
}
[void]$taskView.Close()
if (-not $taskUpgradeFound) { throw 'Regra de atualização MSI não encontrada.' }
$taskView = $taskNew.OpenView('SELECT `Icon_` FROM `Shortcut` WHERE `Shortcut` = ''ApplicationDesktopShortcut''')
[void]$taskView.Execute()
$taskRecord = $taskView.Fetch()
if (-not $taskRecord -or $taskRecord.StringData(1) -ne 'ProductIcon') { throw 'O atalho da área de trabalho precisa usar o ícone do pacote.' }
[void]$taskView.Close()
$taskMetadata['UpgradeVerified'] = $true
$taskMetadata['DesktopIconVerified'] = $true
$taskMetadata | ConvertTo-Json
