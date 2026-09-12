#requires -Version 5.1
# Run with Pester 5.8. All process/scheduler entry points below are throwing stubs
# replaced by mocks; these tests never build WASM or contact Task Scheduler.
BeforeAll {
    $script:RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
    $script:BuildHelper = Join-Path $script:RepoRoot 'tools\build_wasm.ps1'
    $script:TaskHelper = Join-Path $script:RepoRoot 'tools\install_daily_ingest_task.ps1'
    function python { throw 'Unmocked child process is forbidden in this test.' }
    function Test-PythonRunner { param($Builder, $OutputFlag, $Destination, $LockFlag) throw 'Unmocked child process is forbidden in this test.' }
    function Get-ScheduledTask { [CmdletBinding()] param($TaskName) throw 'Unmocked scheduler access is forbidden.' }
    function Unregister-ScheduledTask { [CmdletBinding(SupportsShouldProcess)] param($TaskName) throw 'Unmocked scheduler mutation is forbidden.' }
    function Register-ScheduledTask { [CmdletBinding()] param($TaskName, $Action, $Trigger, $Settings, $Description, [switch]$Force) throw 'Unmocked scheduler mutation is forbidden.' }
    function New-ScheduledTaskAction { param($Execute, $Argument, $WorkingDirectory) throw 'Unmocked scheduler helper is forbidden.' }
    function New-ScheduledTaskTrigger { param([switch]$Daily, $At) throw 'Unmocked scheduler helper is forbidden.' }
    function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable, $MultipleInstances, $ExecutionTimeLimit) throw 'Unmocked scheduler helper is forbidden.' }
}

Describe 'PowerShell helper syntax' {
    It 'parses both helpers without syntax errors' {
        foreach ($path in @($script:BuildHelper, $script:TaskHelper)) {
            $tokens = $null
            $parseErrors = $null
            [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
            @($parseErrors).Count | Should -Be 0
        }
    }
}

Describe 'WASM thin wrapper contracts' {
    BeforeEach {
        $script:OriginalPath = $env:PATH
        Mock python { $global:LASTEXITCODE = 7 }
        Mock Test-PythonRunner { $global:LASTEXITCODE = 0 }
    }
    AfterEach { $env:PATH = $script:OriginalPath }

    It 'propagates a failed child status and restores PATH' {
        & $script:BuildHelper
        $succeeded = $?
        $succeeded | Should -BeFalse
        $LASTEXITCODE | Should -Be 7
        $env:PATH | Should -BeExactly $script:OriginalPath
        Should -Invoke python -Times 1 -Exactly
    }

    It 'forwards explicit output/interpreter selection without mutating PATH' {
        $outputPath = Join-Path $TestDrive 'directory with spaces\wasm'
        & $script:BuildHelper -OutDir $outputPath -PythonPath 'Test-PythonRunner'
        $LASTEXITCODE | Should -Be 0
        Should -Invoke Test-PythonRunner -Times 1 -Exactly -ParameterFilter {
            $Builder -eq (Join-Path $script:RepoRoot 'tools\build_wasm.py') -and
            $OutputFlag -eq '--out-dir' -and $Destination -eq $outputPath -and $LockFlag -eq '--locked'
        }
        $env:PATH | Should -BeExactly $script:OriginalPath
        Should -Invoke python -Times 0 -Exactly
    }

    It 'restores PATH and returns failure when launching the child throws' {
        Mock python { throw 'controlled launch failure' }
        & $script:BuildHelper 2>$null
        $LASTEXITCODE | Should -Be 1
        $env:PATH | Should -BeExactly $script:OriginalPath
    }
}

Describe 'Scheduled ingest truthful ShouldProcess results' {
    BeforeEach {
        Mock Get-ScheduledTask { [pscustomobject]@{ TaskName = 'FixtureIngest' } }
        Mock Unregister-ScheduledTask { }
        Mock Register-ScheduledTask { [pscustomobject]@{ TaskName = 'FixtureIngest' } }
        Mock New-ScheduledTaskAction { [pscustomobject]@{ Kind = 'Action' } }
        Mock New-ScheduledTaskTrigger { [pscustomobject]@{ Kind = 'Trigger' } }
        Mock New-ScheduledTaskSettingsSet { [pscustomobject]@{ Kind = 'Settings' } }
        $script:FixturePython = Join-Path $TestDrive 'python.exe'
        Set-Content -LiteralPath $script:FixturePython -Value 'not executable; never launched'
    }

    It 'reports Skipped rather than Removed when uninstall is declined by WhatIf' {
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -Uninstall -WhatIf
        $LASTEXITCODE | Should -Be 0
        $result.State | Should -Be 'Skipped'
        Should -Invoke Unregister-ScheduledTask -Times 0 -Exactly
    }

    It 'reports Removed only after successful unregister' {
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -Uninstall -Confirm:$false
        $LASTEXITCODE | Should -Be 0
        $result.State | Should -Be 'Removed'
        Should -Invoke Unregister-ScheduledTask -Times 1 -Exactly -ParameterFilter { $TaskName -eq 'FixtureIngest' }
    }

    It 'reports NotPresent without an unregister attempt' {
        Mock Get-ScheduledTask { $null }
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -Uninstall -Confirm:$false
        $LASTEXITCODE | Should -Be 0
        $result.State | Should -Be 'NotPresent'
        Should -Invoke Unregister-ScheduledTask -Times 0 -Exactly
    }

    It 'reports Skipped rather than Applied when install is declined by WhatIf' {
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -PythonPath $script:FixturePython -WhatIf
        $LASTEXITCODE | Should -Be 0
        $result.State | Should -Be 'Skipped'
        Should -Invoke Register-ScheduledTask -Times 0 -Exactly
    }

    It 'reports Applied only after successful registration' {
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -PythonPath $script:FixturePython -Confirm:$false
        $LASTEXITCODE | Should -Be 0
        $result.State | Should -Be 'Applied'
        Should -Invoke Register-ScheduledTask -Times 1 -Exactly -ParameterFilter { $TaskName -eq 'FixtureIngest' }
    }

    It 'does not report success when unregister fails' {
        Mock Unregister-ScheduledTask { throw 'controlled removal failure' }
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -Uninstall -Confirm:$false 2>$null
        $LASTEXITCODE | Should -Be 1
        @($result).Count | Should -Be 0
    }

    It 'does not report Applied when registration fails' {
        Mock Register-ScheduledTask { throw 'controlled registration failure' }
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -PythonPath $script:FixturePython -Confirm:$false 2>$null
        $LASTEXITCODE | Should -Be 1
        @($result).Count | Should -Be 0
    }

    It 'rejects an invalid wall clock time before attempting registration' {
        $result = & $script:TaskHelper -RepoRoot $script:RepoRoot -TaskName FixtureIngest -PythonPath $script:FixturePython -Time '25:99' -Confirm:$false 2>$null
        $LASTEXITCODE | Should -Be 1
        @($result).Count | Should -Be 0
        Should -Invoke Register-ScheduledTask -Times 0 -Exactly
    }
}
