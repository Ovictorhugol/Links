$ErrorActionPreference = 'Stop'
$taskConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskData = Join-Path $env:LOCALAPPDATA 'DonatoAdminPortable'
New-Item -ItemType Directory -Path $taskData -Force | Out-Null
Write-Host 'Configure o acesso ao banco PostgreSQL do painel Donato.'
Write-Host ('Servidor: ' + $taskConfig.host + ' | Banco: ' + $taskConfig.database)
Write-Host 'Esta credencial e do banco, diferente do login do painel.'
$taskUser = Read-Host ('Usuario do banco [' + $taskConfig.user + ']')
if (-not $taskUser) { $taskUser = $taskConfig.user }
$taskPassword = Read-Host 'Senha do banco' -AsSecureString
if ($taskPassword.Length -eq 0) { throw 'Informe a senha do banco.' }
$taskCredential = New-Object Management.Automation.PSCredential($taskUser,$taskPassword)
$taskCredential | Export-Clixml -LiteralPath (Join-Path $taskData 'database-credential.xml')
Write-Host 'Credencial protegida pelo Windows para este usuario e computador.'
