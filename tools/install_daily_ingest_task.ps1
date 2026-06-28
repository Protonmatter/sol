#requires -Version 5.1
<#
.SYNOPSIS
Installs or removes a per-user daily Solar Maximum Engine ingest task.

.DESCRIPTION
Creates a Windows Scheduled Task that runs tools\run_daily_ingest.py once per
day from the repository root. The task writes its health to
apps\web\data\feed-status.json and cache files under .cache\solar-data.

.PARAMETER TaskName
Name of the scheduled task.

.PARAMETER Time
Daily local start time in HH:mm format.

.PARAMETER PythonPath
Path to python.exe. If omitted, the script resolves python.exe from PATH.

.PARAMETER RepoRoot
Repository root. Defaults to the parent directory of this script folder.

.PARAMETER IncludeJpl
Includes the optional JPL Horizons geometry request.

.PARAMETER Uninstall
Removes the scheduled task instead of installing it.

.EXAMPLE
.\tools\install_daily_ingest_task.ps1 -Time 06:15 -IncludeJpl

.EXAMPLE
.\tools\install_daily_ingest_task.ps1 -Uninstall

.NOTES
Rollback: run this script with -Uninstall or run
Unregister-ScheduledTask -TaskName SolarMaximumEngineDailyIngest -Confirm:$false.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateNotNullOrEmpty()]
    [string]$TaskName = 'SolarMaximumEngineDailyIngest',

    [ValidatePattern('^\d{2}:\d{2}$')]
    [string]$Time = '06:15',

    [string]$PythonPath,

    [string]$RepoRoot,

    [switch]$IncludeJpl,

    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    if (-not $RepoRoot) {
        $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
    } else {
        $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    }

    $runner = Join-Path $RepoRoot 'tools\run_daily_ingest.py'
    if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
        throw "Daily ingest runner not found: $runner"
    }

    if ($Uninstall) {
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($null -ne $existing) {
            if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister scheduled task')) {
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            }
        }
        Write-Output ([pscustomobject]@{
            TaskName = $TaskName
            Action   = 'Uninstall'
            State    = if ($null -ne $existing) { 'Removed' } else { 'NotPresent' }
        })
        exit 0
    }

    if (-not $PythonPath) {
        $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        if ($null -eq $pythonCommand) {
            throw 'python.exe was not found on PATH. Pass -PythonPath explicitly.'
        }
        $PythonPath = $pythonCommand.Source
    }

    $PythonPath = (Resolve-Path -LiteralPath $PythonPath).Path
    if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
        throw "python.exe not found: $PythonPath"
    }

    $arguments = @('-u', 'tools\run_daily_ingest.py')
    if ($IncludeJpl) {
        $arguments += '--include-jpl'
    }

    $triggerTime = [datetime]::ParseExact($Time, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
    $action = New-ScheduledTaskAction -Execute $PythonPath -Argument ($arguments -join ' ') -WorkingDirectory $RepoRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    if ($PSCmdlet.ShouldProcess($TaskName, 'Register daily ingest scheduled task')) {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Daily Solar Maximum Engine public-data ingest for research snapshots.' -Force | Out-Null
    }

    Write-Output ([pscustomobject]@{
        TaskName   = $TaskName
        Action     = 'Install'
        Time       = $Time
        PythonPath = $PythonPath
        RepoRoot   = $RepoRoot
        IncludeJpl = [bool]$IncludeJpl
    })
    exit 0
} catch {
    Write-Error $_
    exit 1
}
