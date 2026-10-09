$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPrefix = $taskRoot.TrimEnd('\') + '\'
$taskConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'src-tauri/tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskRelease = Join-Path $taskRoot ('release/' + $taskConfig.version)

function Get-WorkspacePath([string]$RelativePath) {
    $taskPath = [IO.Path]::GetFullPath((Join-Path $taskRoot $RelativePath))
    if (-not $taskPath.StartsWith($taskPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup path must stay inside the project: $RelativePath"
    }
    return $taskPath
}

# Keep distributable files before removing compilation output.
$taskFiles = @(
    ('src-tauri/target/release/' + $taskConfig.mainBinaryName + '.exe'),
    ('src-tauri/target/release/bundle/msi/' + $taskConfig.productName + '_' + $taskConfig.version + '_x64_en-US.msi')
)
foreach ($taskRelative in $taskFiles) {
    $taskSource = Get-WorkspacePath $taskRelative
    if (Test-Path -LiteralPath $taskSource) {
        New-Item -ItemType Directory -Path $taskRelease -Force | Out-Null
        $taskDestination = Get-WorkspacePath ('release/' + $taskConfig.version + '/' + [IO.Path]::GetFileName($taskSource))
        Copy-Item -LiteralPath $taskSource -Destination $taskDestination -Force
        if ((Get-FileHash -LiteralPath $taskSource).Hash -ne (Get-FileHash -LiteralPath $taskDestination).Hash) {
            throw 'Release copy verification failed; compilation output was not removed.'
        }
    }
}

if (Test-Path -LiteralPath (Get-WorkspacePath 'src-tauri/target/release/bundle/msi')) {
    $taskMsi = Get-WorkspacePath ('release/' + $taskConfig.version + '/' + $taskConfig.productName + '_' + $taskConfig.version + '_x64_en-US.msi')
    if (-not (Test-Path -LiteralPath $taskMsi)) {
        throw 'Current MSI was not preserved; compilation output was not removed.'
    }
}

# Published releases may still be referenced by a GPO. Keep their MSI files.

foreach ($taskRelative in @('src-tauri/target', 'dist', 'test-results', 'playwright-report', 'node_modules/.vite', 'node_modules/.vite-temp')) {
    $taskPath = Get-WorkspacePath $taskRelative
    if (Test-Path -LiteralPath $taskPath) {
        Remove-Item -LiteralPath $taskPath -Recurse -Force
        Write-Output "Removed $taskRelative"
    }
}

$taskArtifacts = Get-WorkspacePath 'artifacts'
if (Test-Path -LiteralPath $taskArtifacts) {
    Get-ChildItem -LiteralPath $taskArtifacts -File | Where-Object { $_.Extension -in @('.png', '.jpg', '.jpeg') } | ForEach-Object {
        $taskPath = Get-WorkspacePath ('artifacts/' + $_.Name)
        Remove-Item -LiteralPath $taskPath -Force
    }
}
Write-Output ('Current installers are kept in release/' + $taskConfig.version)
