[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('list', 'add', 'edit', 'complete', 'uncomplete', 'delete', 'credential')]
    [string] $Action = 'list',
    [Parameter(Position = 1)]
    [string] $Task = '',
    [string] $NewTitle = '',
    [string] $Notes = '',
    [switch] $Json,
    [string] $BaseUrl = 'https://bharmsasl.com/tasks/',
    [string] $CredentialPath = ''
)

$ErrorActionPreference = 'Stop'
if ($CredentialPath -eq '') {
    $CredentialPath = Join-Path $PSScriptRoot '.mytasks-password.dpapi'
}

function Save-TaskPassword {
    param([string] $Path)
    $securePassword = Read-Host 'Task app password' -AsSecureString
    $encrypted = ConvertFrom-SecureString -SecureString $securePassword
    Set-Content -LiteralPath $Path -Value $encrypted -Encoding ASCII
    Write-Output 'Saved an encrypted task password for this Windows account.'
}

function ConvertTo-PlainText {
    param([Security.SecureString] $SecureValue)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Connect-TaskApp {
    param([string] $Url, [string] $PasswordFile)
    if (-not (Test-Path -LiteralPath $PasswordFile -PathType Leaf)) {
        throw 'No encrypted task password was found. Run: .\Manage-MyTasks.ps1 credential'
    }
    $encrypted = (Get-Content -LiteralPath $PasswordFile -Raw).Trim()
    if ($encrypted -eq '') { throw 'The encrypted task password file is empty.' }
    $securePassword = ConvertTo-SecureString -String $encrypted
    $plainPassword = ConvertTo-PlainText -SecureValue $securePassword
    $normalizedUrl = $Url.TrimEnd('/') + '/'
    $loginUrl = $normalizedUrl + 'index.php'
    try {
        $loginPage = Invoke-WebRequest -Uri $loginUrl -SessionVariable taskSession -UseBasicParsing
        $csrfMatch = [regex]::Match($loginPage.Content, 'name=["'']csrf_token["''][^>]*value=["'']([^"'']+)["'']', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (-not $csrfMatch.Success) { throw 'The task login token was not found.' }
        $loginResponse = Invoke-WebRequest -Uri $loginUrl -Method Post -WebSession $taskSession -UseBasicParsing -Body @{
            action = 'login'; csrf_token = $csrfMatch.Groups[1].Value; password = $plainPassword
        }
        if ($loginResponse.Content -notmatch 'task-app-bootstrap') { throw 'The task password was not accepted.' }
        return [pscustomobject]@{ BaseUrl = $normalizedUrl; Session = $taskSession }
    }
    finally {
        $plainPassword = $null
        $securePassword = $null
    }
}

function Get-TaskDocument {
    param($Connection)
    Invoke-RestMethod -Uri ($Connection.BaseUrl + 'api/data.php') -Method Get -WebSession $Connection.Session
}

function Find-OneTask {
    param($Data, [string] $Identity)
    if ($Identity.Trim() -eq '') { throw 'Provide an exact task title or task ID.' }
    $matches = @($Data.tasks | Where-Object { $_.id -eq $Identity -or $_.title -ieq $Identity })
    if ($matches.Count -eq 0) { throw "No task matched '$Identity'." }
    if ($matches.Count -gt 1) { throw "More than one task is named '$Identity'. Use the task ID shown by the list command." }
    $matches[0]
}

function Save-TaskDocument {
    param($Connection, $Document)
    $payload = [ordered]@{ baseRevision = [int] $Document.revision; data = $Document.data } | ConvertTo-Json -Depth 12 -Compress
    try {
        Invoke-RestMethod -Uri ($Connection.BaseUrl + 'api/data.php') -Method Put -WebSession $Connection.Session -ContentType 'application/json' -Headers @{
            'X-CSRF-Token' = [string] $Document.csrfToken
        } -Body $payload
    }
    catch {
        if ($_.Exception.Response -and [int] $_.Exception.Response.StatusCode -eq 409) {
            throw 'Tasks changed on another device. Run the command again so the latest revision is used.'
        }
        throw
    }
}

function Write-TaskList {
    param($Data, [switch] $AsJson)
    if ($AsJson) { $Data | ConvertTo-Json -Depth 12; return }
    $tasks = @($Data.tasks)
    if ($tasks.Count -eq 0) { Write-Output 'No tasks.'; return }
    $listNames = @{}
    foreach ($list in @($Data.lists)) { $listNames[[string] $list.id] = [string] $list.name }
    foreach ($item in $tasks) {
        $mark = if ($item.completed) { 'x' } else { ' ' }
        Write-Output ("[{0}] {1} | list: {2} | id: {3}" -f $mark, $item.title, $listNames[[string] $item.listId], $item.id)
    }
}

if ($Action -eq 'credential') { Save-TaskPassword -Path $CredentialPath; exit 0 }

$connection = Connect-TaskApp -Url $BaseUrl -PasswordFile $CredentialPath
$document = Get-TaskDocument -Connection $connection
if ($Action -eq 'list') { Write-TaskList -Data $document.data -AsJson:$Json; exit 0 }

$now = [DateTimeOffset]::UtcNow.ToString('o')
switch ($Action) {
    'add' {
        $cleanTitle = $Task.Trim()
        if ($cleanTitle -eq '') { throw 'Provide the new task title.' }
        if ($cleanTitle.Length -gt 240) { throw 'Task titles must be 240 characters or fewer.' }
        if ($Notes.Length -gt 2000) { throw 'Task notes must be 2,000 characters or fewer.' }
        $newTask = [pscustomobject][ordered]@{
            id = 'task-' + [Guid]::NewGuid().ToString(); listId = [string] $document.data.activeListId
            title = $cleanTitle; notes = $Notes.Trim(); completed = $false
            createdAt = $now; updatedAt = $now; completedAt = $null
        }
        $document.data.tasks = @($newTask) + @($document.data.tasks)
    }
    'edit' {
        $item = Find-OneTask -Data $document.data -Identity $Task
        $cleanTitle = $NewTitle.Trim()
        if ($cleanTitle -eq '') { throw 'Provide -NewTitle for the edited task.' }
        if ($cleanTitle.Length -gt 240) { throw 'Task titles must be 240 characters or fewer.' }
        $item.title = $cleanTitle
        if ($PSBoundParameters.ContainsKey('Notes')) {
            if ($Notes.Length -gt 2000) { throw 'Task notes must be 2,000 characters or fewer.' }
            $item.notes = $Notes.Trim()
        }
        $item.updatedAt = $now
    }
    'complete' {
        $item = Find-OneTask -Data $document.data -Identity $Task
        $item.completed = $true; $item.updatedAt = $now; $item.completedAt = $now
    }
    'uncomplete' {
        $item = Find-OneTask -Data $document.data -Identity $Task
        $item.completed = $false; $item.updatedAt = $now; $item.completedAt = $null
    }
    'delete' {
        $item = Find-OneTask -Data $document.data -Identity $Task
        $document.data.tasks = @($document.data.tasks | Where-Object { $_.id -ne $item.id })
    }
}

$saved = Save-TaskDocument -Connection $connection -Document $document
Write-Output ("Saved revision {0}." -f $saved.revision)
Write-TaskList -Data $saved.data -AsJson:$Json
