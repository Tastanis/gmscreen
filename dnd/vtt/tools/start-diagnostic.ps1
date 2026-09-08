param(
    [Parameter(Mandatory=$true)][string]$DiagnosticRoot,
    [ValidateRange(1024,65535)][int]$Port = 8127
)
$ErrorActionPreference = 'Stop'
$diagnosticRuntime = [IO.Path]::GetFullPath((Join-Path $DiagnosticRoot 'runtime'))
$pointer = Get-Content -LiteralPath (Join-Path $diagnosticRuntime 'current-vtt-app.json') -Raw | ConvertFrom-Json
$appPath = [IO.Path]::GetFullPath([string]$pointer.path)
if (!$appPath.StartsWith($diagnosticRuntime + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    !(Test-Path -LiteralPath (Join-Path $appPath '.gmscreen-test-app') -PathType Leaf)) {
    throw 'The current app must be a marked disposable directory within diagnostic runtime.'
}
$phpExecutable = (Get-Command php -ErrorAction Stop).Source
$extensionPath = Join-Path (Split-Path -Parent $phpExecutable) 'ext'
$env:VTT_SYNC_V2_DATABASE = Join-Path $appPath 'dnd/vtt/storage/sync-v2.sqlite'
Write-Host "Disposable VTT from live revision $($pointer.revision). Changes stay in this copy."
Write-Host "GM: http://127.0.0.1:$Port/test-login.php?user=GM"
Write-Host "Player: http://127.0.0.1:$Port/test-login.php?user=cal"
Write-Host 'Use separate browser profiles for simultaneous GM/player sessions. Ctrl+C stops this server.'
Set-Location -LiteralPath $appPath
& $phpExecutable -d "extension_dir=$extensionPath" -d extension=php_pdo_sqlite.dll -d "session.save_path=$appPath/sessions" -S "127.0.0.1:$Port" -t $appPath (Join-Path $appPath 'router.php')
exit $LASTEXITCODE
