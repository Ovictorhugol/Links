param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$configuration = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$appDirectory = Split-Path -Parent $PSScriptRoot
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$env:DONATO_ORIGIN = [string]$configuration.origin
$env:DONATO_HOST = [string]$configuration.host
$env:DONATO_PORT = [string]$configuration.port
if ($configuration.databaseEngine -eq 'postgres') {
    $env:DONATO_DB_ENGINE = 'postgres'
    $env:PGHOST = [string]$configuration.postgresHost
    $env:PGPORT = [string]$configuration.postgresPort
    $env:PGDATABASE = [string]$configuration.postgresDatabase
    $env:PGUSER = [string]$configuration.postgresUser
    $env:PGSSLROOTCERT = [string]$configuration.postgresCaPath
    $env:DONATO_PG_SCHEMA = [string]$configuration.postgresSchema
    if ($configuration.postgresPasswordFile) { $env:PGPASSWORD_FILE = [string]$configuration.postgresPasswordFile }
} else {
    $env:DONATO_DB_ENGINE = 'sqlite'
    $env:DONATO_DB_PATH = [string]$configuration.dbPath
}
Set-Location -LiteralPath $appDirectory
& $nodeCommand (Join-Path $appDirectory 'server/index.mjs')
exit $LASTEXITCODE
