#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory = $true)]
    [string]$CatalogUrl
)
$ErrorActionPreference = 'Stop'
$catalogUri = [Uri]$CatalogUrl
if (-not $catalogUri.IsAbsoluteUri -or $catalogUri.Scheme -ne 'https' -or $catalogUri.UserInfo) {
    throw 'Informe uma URL HTTPS absoluta, sem credenciais.'
}
$configDirectory = Join-Path $env:ProgramData 'DonatoLinks'
$configPath = Join-Path $configDirectory 'client-config.json'
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$settings = @{ catalogUrl = $CatalogUrl; pollIntervalMinutes = 60 } | ConvertTo-Json
# UTF-8 without BOM is required by serde_json, including on Windows PowerShell 5.1.
[IO.File]::WriteAllText($configPath, $settings, (New-Object Text.UTF8Encoding($false)))
Write-Output "Configuracao salva em $configPath. Reabra o aplicativo para aplicar."
