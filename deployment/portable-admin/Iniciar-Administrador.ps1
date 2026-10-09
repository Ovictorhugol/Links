$ErrorActionPreference = 'Stop'
try {
    $taskData = Join-Path $env:LOCALAPPDATA 'DonatoAdminPortable'
    $taskInstall = Join-Path $taskData 'application'
    if ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ne [IO.Path]::GetFullPath($taskInstall).TrimEnd('\')) {
        New-Item -ItemType Directory -Path $taskInstall -Force | Out-Null
        foreach ($taskFile in Get-ChildItem -LiteralPath $PSScriptRoot -Force) {
            Copy-Item -LiteralPath $taskFile.FullName -Destination $taskInstall -Recurse -Force
        }
        $taskEntry = Join-Path $taskInstall 'Iniciar-Administrador.ps1'
        Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $taskEntry + '"') -WindowStyle Hidden
        exit
    }
    $taskConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $taskConfig.password) { throw 'O pacote nao possui a credencial do banco.' }
    $taskShortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Administrador Donato.lnk'
    $taskShortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($taskShortcutPath)
    $taskShortcut.TargetPath = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $taskShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'Iniciar-Administrador.ps1') + '"'
    $taskShortcut.WorkingDirectory = $PSScriptRoot
    $taskShortcut.IconLocation = (Join-Path $PSScriptRoot 'donato-eye.ico') + ',0'
    $taskShortcut.Description = 'Abrir a administracao de links Donato'
    $taskShortcut.Save()
    $env:DONATO_DB_ENGINE = 'postgres'
    $env:DONATO_PG_INITIALIZE_SCHEMA = '0'
    $env:PGHOST = [string]$taskConfig.host
    $env:PGPORT = [string]$taskConfig.port
    $env:PGDATABASE = [string]$taskConfig.database
    $env:PGUSER = [string]$taskConfig.user
    $env:PGPASSWORD = [string]$taskConfig.password
    $env:PGPASSWORD_FILE = $null
    $env:PGSSLROOTCERT = Join-Path $PSScriptRoot 'deployment/certificates/global-bundle.pem'
    $env:DONATO_PG_SCHEMA = [string]$taskConfig.schema
    $env:DONATO_ADMIN_DATA_DIR = Join-Path $taskData 'session'
    $env:DONATO_ADMIN_BROWSER_PROFILE = Join-Path $taskData 'edge-profile'
    $taskNode = Join-Path $PSScriptRoot 'runtime/node.exe'
    $taskScript = Join-Path $PSScriptRoot 'scripts/open-admin.mjs'
    Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskScript + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Administrador Donato') | Out-Null
} finally {
    $env:PGPASSWORD = $null
}
