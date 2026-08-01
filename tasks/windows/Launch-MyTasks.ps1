$ErrorActionPreference = 'Stop'
$taskUrl = 'https://bharmsasl.com/tasks/'
$edgeCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$edge = $edgeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($edge) {
    Start-Process $edge -ArgumentList @('--app=' + $taskUrl, '--start-maximized')
} else {
    Start-Process $taskUrl
}
