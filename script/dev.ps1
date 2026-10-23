#Requires -Version 7.2
$ErrorActionPreference = 'Stop'
$Command = if ($args.Count) { [string]$args[0] } else { 'up' }
$CommandArguments = if ($args.Count -gt 1) { @($args[1..($args.Count - 1)]) } else { @() }
if ($Command -notin @('up', 'down', 'status', 'logs', 'rails', 'generate', 'destroy', 'test', 'ci', 'npm', 'bundle', 'shell')) {
    throw "Unsupported development command: $Command"
}
$projectRoot = Split-Path $PSScriptRoot -Parent
$composeFile = Join-Path $projectRoot 'compose.dev.yml'
$dockerPath = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
$composeArguments = @('compose', '-f', $composeFile, '--profile', 'tools')
$runtimeRoot = Join-Path $projectRoot 'tmp/docker-dev'
$watchStatePath = Join-Path $runtimeRoot 'watch.json'
$watchOutputPath = Join-Path $runtimeRoot 'watch.stdout.log'
$watchErrorPath = Join-Path $runtimeRoot 'watch.stderr.log'

function Invoke-Compose([string[]]$ComposeCommand) {
    & $dockerPath @composeArguments @ComposeCommand
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE." }
}

function Ensure-Image([switch]$Build) {
    & $dockerPath image inspect sillage-dev:local --format '{{.Id}}' *> $null
    if ($Build -or $LASTEXITCODE -ne 0) { Invoke-Compose @('build', 'app') }
}

function Start-Database {
    Invoke-Compose @('up', '-d', '--wait', 'postgres')
}

function Get-WatchProcess {
    if (!(Test-Path -LiteralPath $watchStatePath)) { return $null }
    $state = Get-Content -LiteralPath $watchStatePath -Raw | ConvertFrom-Json
    $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if (!$process) {
        Remove-Item -LiteralPath $watchStatePath
        return $null
    }
    if ($state.composeFile -cne $composeFile -or $state.executable -cne $dockerPath -or
        $process.Path -ine $dockerPath -or
        $process.StartTime.ToUniversalTime().Ticks.ToString() -cne $state.startTimeUtcTicks) {
        throw 'Watch process identity differs from the saved launcher state; refusing to stop it.'
    }
    return $process
}

function Stop-Watch {
    $process = Get-WatchProcess
    if (!$process) { return }
    if ($IsWindows) {
        & taskkill.exe /PID $process.Id /T /F *> $null
    }
    else {
        Stop-Process -Id $process.Id
    }
    if (!$process.WaitForExit(10000)) { throw 'Compose Watch did not stop.' }
    Remove-Item -LiteralPath $watchStatePath
}

function ConvertTo-NativeArgument([string]$Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}

function Start-Watch {
    if (Get-WatchProcess) { return }
    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    $arguments = @($composeArguments) + @('watch', '--no-up', '--prune=false', 'app')
    $startOptions = @{
        FilePath = $dockerPath
        ArgumentList = (($arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
        WorkingDirectory = $projectRoot
        RedirectStandardOutput = $watchOutputPath
        RedirectStandardError = $watchErrorPath
        PassThru = $true
    }
    if ($IsWindows) { $startOptions.WindowStyle = 'Hidden' }
    $process = Start-Process @startOptions
    @{
        pid = $process.Id
        startTimeUtcTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
        executable = $dockerPath
        composeFile = $composeFile
    } | ConvertTo-Json | Set-Content -LiteralPath $watchStatePath -Encoding utf8
    try {
        $deadline = (Get-Date).AddSeconds(45)
        do {
            $process.Refresh()
            if ($process.HasExited) { throw 'Compose Watch exited before becoming ready.' }
            $output = Get-Content -LiteralPath $watchOutputPath -Raw -ErrorAction SilentlyContinue
            $errors = Get-Content -LiteralPath $watchErrorPath -Raw -ErrorAction SilentlyContinue
            if (($output + $errors) -match 'Watch enabled') { return }
            Start-Sleep -Milliseconds 200
        } while ((Get-Date) -lt $deadline)
        throw 'Compose Watch did not become ready within 45 seconds.'
    }
    catch {
        Get-Content -LiteralPath $watchErrorPath -Tail 20 -ErrorAction SilentlyContinue | Write-Host
        Stop-Watch
        throw
    }
}

function Invoke-Workspace([string[]]$WorkspaceCommand) {
    Ensure-Image
    Start-Database
    Invoke-Compose (@('run', '--rm', '--no-deps', '-T', 'workspace') + $WorkspaceCommand)
}

Push-Location $projectRoot
try {
    switch ($Command) {
        'up' {
            Stop-Watch
            Ensure-Image -Build
            Start-Database
            Invoke-Compose @('run', '--rm', '--no-deps', '-T', 'workspace', 'ruby', 'bin/rails', 'db:prepare')
            Invoke-Compose @('run', '--rm', '--no-deps', '-T', '-e', 'RAILS_ENV=test', 'workspace', 'ruby', 'bin/rails', 'db:prepare')
            Invoke-Compose @('up', '-d', '--no-build', '--wait', 'app')
            Start-Watch
            $port = if ($env:SILLAGE_DEV_PORT) { $env:SILLAGE_DEV_PORT } else { '3000' }
            Write-Output "Sillage is ready at http://localhost:$port with Compose Watch."
        }
        'down' {
            Stop-Watch
            Invoke-Compose @('down', '--remove-orphans')
        }
        'status' {
            Invoke-Compose @('ps')
            $watch = Get-WatchProcess
            if ($watch) { Write-Output "Compose Watch is running (PID $($watch.Id))." }
            else { Write-Output 'Compose Watch is stopped.' }
        }
        'logs' {
            Invoke-Compose (@('logs', '--tail', '80', 'app') + $CommandArguments)
            Get-Content -LiteralPath $watchErrorPath -Tail 10 -ErrorAction SilentlyContinue
        }
        'rails' { Invoke-Workspace (@('ruby', 'bin/rails') + $CommandArguments) }
        'generate' { Invoke-Workspace (@('ruby', 'bin/rails', 'generate') + $CommandArguments) }
        'destroy' { Invoke-Workspace (@('ruby', 'bin/rails', 'destroy') + $CommandArguments) }
        'bundle' { Invoke-Workspace (@('bundle') + $CommandArguments) }
        'npm' {
            Invoke-Workspace @('npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund')
            Invoke-Workspace (@('npm') + $CommandArguments)
        }
        'test' {
            Ensure-Image -Build
            Start-Database
            Invoke-Compose @('run', '--rm', '--no-deps', '-T', '-e', 'RAILS_ENV=test', 'check', 'ruby', 'bin/rails', 'db:prepare')
            Invoke-Compose (@('run', '--rm', '--no-deps', '-T', '-e', 'RAILS_ENV=test', 'check', 'ruby', 'bin/rails', 'test') + $CommandArguments)
        }
        'ci' {
            Ensure-Image -Build
            Start-Database
            Invoke-Compose @('run', '--rm', '--no-deps', '-T', '-e', 'CI=true', 'check', 'ruby', 'bin/ci')
        }
        'shell' {
            Ensure-Image
            Start-Database
            Invoke-Compose @('run', '--rm', '--no-deps', 'workspace', 'bash')
        }
    }
}
finally {
    Pop-Location
}
