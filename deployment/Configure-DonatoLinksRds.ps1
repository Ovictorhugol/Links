#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$contents = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
$configuration = $contents | ConvertFrom-Json
if ($configuration.source -ne 'postgres' -or $configuration.postgres.user -ne 'donato_links_reader' -or -not $configuration.postgres.password) {
    throw 'Use o arquivo client-rds.json gerado pelo provisionamento do leitor.'
}
$directory = Join-Path $env:ProgramData 'DonatoLinks'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $directory 'client-config.json'), $contents, (New-Object Text.UTF8Encoding($false)))
Write-Output 'Consulta direta ao RDS configurada. Reabra o aplicativo para aplicar.'
