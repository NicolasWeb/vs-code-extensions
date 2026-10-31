[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string]$WslDistro
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $projectRoot 'package.json'
$manifest = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$extensionId = "$($manifest.publisher).$($manifest.name)"
$version = [string]$manifest.version
$vsixPath = Join-Path $projectRoot ("out\{0}-{1}.vsix" -f $manifest.name, $version)

if (-not (Test-Path -LiteralPath $vsixPath -PathType Leaf)) {
    throw "VSIX not found: $vsixPath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($vsixPath)
try {
    $packageEntry = $archive.GetEntry('extension/package.json')
    if ($null -eq $packageEntry) {
        throw 'VSIX does not contain extension/package.json.'
    }

    $reader = [System.IO.StreamReader]::new($packageEntry.Open())
    try {
        $embeddedManifest = $reader.ReadToEnd() | ConvertFrom-Json
    }
    finally {
        $reader.Dispose()
    }
}
finally {
    $archive.Dispose()
}

$embeddedId = "$($embeddedManifest.publisher).$($embeddedManifest.name)"
if ($embeddedId -ne $extensionId -or [string]$embeddedManifest.version -ne $version) {
    throw "VSIX identity/version mismatch: expected $extensionId@$version, found $embeddedId@$($embeddedManifest.version)."
}

$codeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue
$codeCli = if ($codeCommand) { $codeCommand.Source } else { $null }
if (-not $codeCli) {
    $codeCandidates = @()
    if ($env:LOCALAPPDATA) {
        $codeCandidates += Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'
    }
    if ($env:ProgramFiles) {
        $codeCandidates += Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd'
    }
    foreach ($candidate in $codeCandidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $codeCli = $candidate
            break
        }
    }
}
if (-not $codeCli) {
    throw 'VS Code CLI code.cmd was not found on PATH or in a standard installation directory.'
}

$wslCommand = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wslCommand) {
    throw 'wsl.exe was not found; install or enable Windows Subsystem for Linux first.'
}
$wslExe = $wslCommand.Source
$distroOutput = & $wslExe --list --quiet
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "wsl.exe --list --quiet failed with exit code $exitCode."
}
$nullCharacter = [string][char]0
$distroText = ($distroOutput -join "`n").Replace($nullCharacter, '')
$availableDistros = @($distroText -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($availableDistros.Count -eq 0) {
    throw 'No WSL distributions were found.'
}
if (-not $WslDistro) {
    if ($availableDistros.Count -ne 1) {
        throw "Multiple WSL distributions were found; pass -WslDistro with one of: $($availableDistros -join ', ')."
    }
    $WslDistro = $availableDistros[0]
}
if ($availableDistros -notcontains $WslDistro) {
    throw "WSL distribution '$WslDistro' was not found; available distributions: $($availableDistros -join ', ')."
}

$homeOutput = & $wslExe -d $WslDistro --exec printenv HOME
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "Could not read the home directory in WSL distribution '$WslDistro' (exit code $exitCode)."
}
$wslHome = ($homeOutput -join '').Replace($nullCharacter, '').Trim()
if (-not $wslHome.StartsWith('/')) {
    throw "WSL distribution '$WslDistro' returned an invalid home directory."
}

$serverOutput = & $wslExe -d $WslDistro --exec find "$wslHome/.vscode-server/bin" -type f -path '*/bin/code-server' -print
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "Could not discover Remote WSL code-server binaries in '$WslDistro' (exit code $exitCode)."
}
$codeServers = @($serverOutput | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
if ($codeServers.Count -eq 0) {
    throw "No Remote WSL code-server binary was found in distribution '$WslDistro'."
}

$tempVsixPath = Join-Path $env:TEMP ("ai4dev-tunnel-{0}.vsix" -f [guid]::NewGuid().ToString('N'))
$wslVsixOutput = & $wslExe -d $WslDistro --exec wslpath -u $tempVsixPath
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "Could not map the Windows temporary VSIX path into WSL (exit code $exitCode)."
}
$wslVsixPath = ($wslVsixOutput -join '').Replace($nullCharacter, '').Trim()
if (-not $wslVsixPath.StartsWith('/')) {
    throw 'wslpath returned an invalid Linux path for the temporary VSIX.'
}

$sourceHash = (Get-FileHash -LiteralPath $vsixPath -Algorithm SHA256).Hash
$windowsExtensionsDir = Join-Path $env:USERPROFILE '.vscode\extensions'
$windowsRegistryPath = Join-Path $windowsExtensionsDir 'extensions.json'
$wslExtensionsDir = "$wslHome/.vscode-server/extensions"
$wslRegistryPath = "$wslExtensionsDir/extensions.json"
$targetDescription = "Windows profile and Remote WSL distribution '$WslDistro'"
if (-not $PSCmdlet.ShouldProcess($targetDescription, "Install $extensionId@$version")) {
    if ($WhatIfPreference) {
        Write-Output "AI4DEV_TUNNEL_INSTALL_DRY_RUN id=$extensionId version=$version distro=$WslDistro servers=$($codeServers.Count)"
    }
    else {
        Write-Output 'AI4DEV_TUNNEL_INSTALL_SKIPPED'
    }
    return
}

function Test-ExtensionRegistry {
    param(
        [Parameter(Mandatory)][string]$RegistryJson,
        [Parameter(Mandatory)][string]$HostLabel,
        [Parameter(Mandatory)][string]$ExpectedId,
        [Parameter(Mandatory)][string]$ExpectedVersion
    )

    $entries = ConvertFrom-Json -InputObject $RegistryJson
    if ($null -eq $entries) {
        $entries = @()
    }
    elseif ($entries -isnot [System.Array]) {
        $entries = @($entries)
    }
    $matchingEntry = @($entries | Where-Object {
        $_.identifier.id -ieq $ExpectedId -and [string]$_.version -eq $ExpectedVersion
    })
    if ($matchingEntry.Count -eq 0) {
        throw "Extension registry on $HostLabel does not contain $ExpectedId@$ExpectedVersion."
    }
}

Push-Location -LiteralPath $env:TEMP
try {
    Copy-Item -LiteralPath $vsixPath -Destination $tempVsixPath
    $copiedHash = (Get-FileHash -LiteralPath $tempVsixPath -Algorithm SHA256).Hash
    if ($copiedHash -ne $sourceHash) {
        throw 'The Windows temporary VSIX copy does not match the source package hash.'
    }

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $windowsInstallOutput = & $codeCli --install-extension $tempVsixPath --force 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $windowsInstallOutput | ForEach-Object { Write-Output ([string]$_) }
    if ($exitCode -ne 0) {
        throw "Windows VS Code extension installation failed with exit code $exitCode."
    }
    Write-Output "AI4DEV_TUNNEL_INSTALL_WINDOWS_OK id=$extensionId version=$version"

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $windowsList = & $codeCli --list-extensions --show-versions 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $windowsList | ForEach-Object { Write-Output ([string]$_) }
    if ($exitCode -ne 0) {
        throw "Windows VS Code extension listing failed with exit code $exitCode."
    }
    $windowsEntries = @($windowsList | ForEach-Object { ([string]$_).Trim() })
    if ($windowsEntries -notcontains "$extensionId@$version") {
        throw "Windows VS Code CLI does not list $extensionId@$version."
    }
    if (-not (Test-Path -LiteralPath $windowsRegistryPath -PathType Leaf)) {
        throw "Windows extension registry was not found: $windowsRegistryPath"
    }
    $windowsRegistryJson = Get-Content -LiteralPath $windowsRegistryPath -Raw
    Test-ExtensionRegistry -RegistryJson $windowsRegistryJson -HostLabel 'Windows' -ExpectedId $extensionId -ExpectedVersion $version
    Write-Output "AI4DEV_TUNNEL_INSTALL_WINDOWS_VERIFIED id=$extensionId version=$version"

    foreach ($codeServer in $codeServers) {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $wslInstallOutput = & $wslExe -d $WslDistro --exec $codeServer --extensions-dir $wslExtensionsDir --install-extension $wslVsixPath --force 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        $wslInstallOutput | ForEach-Object { Write-Output ([string]$_) }
        if ($exitCode -ne 0) {
            throw "Remote WSL installation through '$codeServer' failed with exit code $exitCode."
        }

        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $wslList = & $wslExe -d $WslDistro --exec $codeServer --extensions-dir $wslExtensionsDir --list-extensions --show-versions 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        $wslList | ForEach-Object { Write-Output ([string]$_) }
        if ($exitCode -ne 0) {
            throw "Remote WSL extension listing through '$codeServer' failed with exit code $exitCode."
        }
        $wslEntries = @($wslList | ForEach-Object { ([string]$_).Trim() })
        if ($wslEntries -notcontains "$extensionId@$version") {
            throw "Remote WSL CLI '$codeServer' does not list $extensionId@$version."
        }

        $registryOutput = & $wslExe -d $WslDistro --exec cat $wslRegistryPath
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "Could not read the Remote WSL extension registry at '$wslRegistryPath' (exit code $exitCode)."
        }
        $registryJson = ($registryOutput -join "`n").Replace($nullCharacter, '')
        Test-ExtensionRegistry -RegistryJson $registryJson -HostLabel "Remote WSL ($WslDistro)" -ExpectedId $extensionId -ExpectedVersion $version
        Write-Output "AI4DEV_TUNNEL_INSTALL_WSL_VERIFIED id=$extensionId version=$version server=$codeServer"
    }
    Write-Output "AI4DEV_TUNNEL_INSTALL_DONE id=$extensionId version=$version windows=1 wslServers=$($codeServers.Count)"
}
finally {
    try {
        if (Test-Path -LiteralPath $tempVsixPath) {
            Remove-Item -LiteralPath $tempVsixPath -Force
        }
    }
    finally {
        Pop-Location
    }
}
