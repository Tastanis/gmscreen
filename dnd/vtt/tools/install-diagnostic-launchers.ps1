param([Parameter(Mandatory=$true)][string]$DiagnosticRoot)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $DiagnosticRoot).Path
if (!(Test-Path -LiteralPath (Join-Path $root 'tools/sync.php')) -or
    !(Test-Path -LiteralPath (Join-Path $root 'config/local-sync.json'))) {
    throw 'Select the existing GM Screen diagnostic repository.'
}
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$syncLauncher = @"
@echo off
setlocal
cd /d "%~dp0"
python "$sourceRoot\dnd\vtt\tools\sync-diagnostic.py" --diagnostic-root "%CD%"
if errorlevel 1 (
  echo Diagnostic sync did not complete. See the message above.
  pause
  exit /b 1
)
echo Start Local VTT.cmd opens the restored current-source app.
pause
"@
$startLauncher = @"
@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$sourceRoot\dnd\vtt\tools\start-diagnostic.ps1" -DiagnosticRoot "%CD%"
if errorlevel 1 pause
"@
$syncPath = Join-Path $root 'Run Diagnostic Sync.cmd'
if (Test-Path -LiteralPath $syncPath) {
    $backupPath = Join-Path $root ('Run Diagnostic Sync.before-v2-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.cmd.bak')
    Copy-Item -LiteralPath $syncPath -Destination $backupPath
}
Set-Content -LiteralPath $syncPath -Value $syncLauncher -Encoding ASCII
Set-Content -LiteralPath (Join-Path $root 'Start Local VTT.cmd') -Value $startLauncher -Encoding ASCII
Write-Host 'Updated pull launcher and added Start Local VTT.cmd. Existing diagnostic inspector is preserved.'
