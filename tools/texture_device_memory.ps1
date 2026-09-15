#requires -Version 5.1
<#
.SYNOPSIS
Read memory counters for the explicit Chromium PIDs supplied by its owning CDP session.
.DESCRIPTION
No elevation, settings, files, process arguments or user data are read or changed.
Returns JSON; missing GPU counters are unavailable, never zero. Exit 0 means the
observation completed (inspect status); exit 1 is invalid input or collector failure.
The caller enforces a 15-second timeout. No installation or rollback is required.
.EXAMPLE
powershell.exe -NoProfile -File tools/texture_device_memory.ps1 -ProcessIds 123,456
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[1-9][0-9]*(,[1-9][0-9]*)*$')]
    [string]$ProcessIds,
    [switch]$IncludeDeviceInventory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
    $startedAt = [DateTime]::UtcNow.ToString('o')
    $selectedIds = @($ProcessIds.Split(',') | ForEach-Object { [int]$_ } | Select-Object -Unique)
    if ($selectedIds.Count -gt 64) { throw 'At most 64 owned processes may be observed.' }
    $processRows = @()
    $missingIds = @()
    foreach ($selectedId in $selectedIds) {
        try {
            $observedProcess = Get-Process -Id $selectedId -ErrorAction Stop
            $processRows += [ordered]@{
                pid = $selectedId
                working_set_bytes = $observedProcess.WorkingSet64
                private_bytes = $observedProcess.PrivateMemorySize64
                observed_at = [DateTime]::UtcNow.ToString('o')
            }
        } catch { $missingIds += $selectedId }
    }
    $gpuRows = @()
    $gpuStatus = 'unavailable'
    $gpuError = $null
    try {
        $counterSet = Get-Counter -Counter '\GPU Process Memory(*)\Shared Usage', '\GPU Process Memory(*)\Dedicated Usage', '\GPU Process Memory(*)\Total Committed' -MaxSamples 1 -ErrorAction Stop
        foreach ($counter in $counterSet.CounterSamples) {
            if ($counter.InstanceName -match '^pid_([0-9]+)_(.+)$') {
                $counterPid = [int]$Matches[1]
                $adapter = $Matches[2]
                if ($selectedIds -contains $counterPid) {
                    $gpuRows += [ordered]@{
                        pid = $counterPid
                        adapter = $adapter
                        counter = $counter.Path.Split('\')[-1].ToLowerInvariant()
                        bytes = $counter.CookedValue
                        status = $counter.Status
                        observed_at = $counter.Timestamp.ToUniversalTime().ToString('o')
                    }
                }
            }
        }
        if ($gpuRows.Count -gt 0) { $gpuStatus = 'available' }
    } catch { $gpuError = $_.Exception.GetType().Name }
    $devices = @()
    if ($IncludeDeviceInventory) {
        try {
            $devices = @(Get-CimInstance Win32_VideoController | ForEach-Object {
                [ordered]@{ name = $_.Name; vendor = $_.AdapterCompatibility; driver_version = $_.DriverVersion; status = $_.Status }
            })
        } catch { $devices = @([ordered]@{ status = 'unavailable'; error = $_.Exception.GetType().Name }) }
    }
    [ordered]@{
        status = 'available'; started_at = $startedAt; completed_at = [DateTime]::UtcNow.ToString('o')
        processes = $processRows; missing_process_ids = $missingIds
        gpu_counters_status = $gpuStatus; gpu_counters_error = $gpuError; gpu_counters = $gpuRows
        devices = $devices
    } | ConvertTo-Json -Depth 6 -Compress
    exit 0
} catch {
    [ordered]@{ status = 'failed'; error = $_.Exception.GetType().Name } | ConvertTo-Json -Compress
    exit 1
}
