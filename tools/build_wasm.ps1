#requires -Version 5.1
<#
.SYNOPSIS
Runs the shared locked WASM builder with an explicit output directory.
.DESCRIPTION
Thin Windows entry point for build_wasm.py. Requires Python, Cargo and the
wasm32-unknown-unknown target already installed. Does not install dependencies.
Temporarily adds the current user's Cargo bin directory and restores PATH in
finally, including child failure and launch exceptions. The Python builder owns
output validation and rejects output under the web source tree.
.PARAMETER OutDir
Build output directory. Defaults to build\wasm below the repository root.
.PARAMETER PythonPath
Python interpreter path or command. Defaults to python from PATH.
.EXAMPLE
.\tools\build_wasm.ps1 -OutDir C:\Build\SolWasm -PythonPath C:\Python312\python.exe
.NOTES
Exit 0 means the shared build succeeded. Child nonzero status is propagated
unchanged; interpreter launch/wrapper errors exit 1. No administrator rights are
required. Output cleanup is an explicit operator action; this helper deletes none.
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'build\wasm'),

    [ValidateNotNullOrEmpty()]
    [string]$PythonPath = 'python'
)

$ErrorActionPreference = 'Stop'
$originalPath = $env:PATH
$childExitCode = 1
try {
    if ($env:USERPROFILE) {
        $env:PATH = (Join-Path $env:USERPROFILE '.cargo\bin') + ';' + $originalPath
    }
    & $PythonPath (Join-Path $PSScriptRoot 'build_wasm.py') '--out-dir' $OutDir '--locked'
    $childExitCode = $LASTEXITCODE
} catch {
    Write-Error -Message ('WASM builder failed: ' + $_.Exception.Message) -ErrorAction Continue
    $childExitCode = 1
} finally {
    $env:PATH = $originalPath
}
exit $childExitCode
