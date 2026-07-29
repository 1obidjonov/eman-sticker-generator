[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
  [string]$ExpectedVersion,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ReportPath,

  [switch]$RequireSignature
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Checks = [System.Collections.Generic.List[object]]::new()
$script:SignatureStatus = 'Unknown'
$script:SignatureSubject = $null
$script:SignatureThumbprint = $null
$script:Failure = $null
$script:Status = 'failed'

$temporaryBase = if ($env:RUNNER_TEMP) {
  $env:RUNNER_TEMP
} else {
  [System.IO.Path]::GetTempPath()
}
$runRoot = Join-Path $temporaryBase "eman-sticker-rc-$PID"
$installRoot = Join-Path $runRoot 'application'
$userDataRoot = Join-Path $runRoot 'user-data'
$firstSmokePath = Join-Path $runRoot 'installed-smoke-first.json'
$secondSmokePath = Join-Path $runRoot 'installed-smoke-second.json'
$sentinelPath = Join-Path $userDataRoot 'stage8-persistence-sentinel.json'

function Add-Check {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [ValidateSet('passed', 'failed')]
    [string]$Status,

    [Parameter(Mandatory = $true)]
    [string]$Detail
  )

  $script:Checks.Add(
    [ordered]@{
      name = $Name
      status = $Status
      detail = Protect-Path $Detail
    }
  )
}

function Protect-Path {
  param([string]$Value)

  $result = $Value
  foreach ($replacement in @(
      @($env:RUNNER_TEMP, '<runner-temp>'),
      @($env:USERPROFILE, '<user-profile>')
    )) {
    if ($replacement[0]) {
      $result = $result.Replace(
        [string]$replacement[0],
        [string]$replacement[1]
      )
    }
  }
  return $result
}

function Assert-Gate {
  param(
    [Parameter(Mandatory = $true)]
    [bool]$Condition,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$PassedDetail,

    [Parameter(Mandatory = $true)]
    [string]$FailedDetail
  )

  if ($Condition) {
    Add-Check -Name $Name -Status passed -Detail $PassedDetail
    return
  }

  Add-Check -Name $Name -Status failed -Detail $FailedDetail
  throw $FailedDetail
}

function Invoke-CheckedProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [int]$TimeoutSeconds = 120
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  foreach ($argument in $Arguments) {
    [void]$startInfo.ArgumentList.Add($argument)
  }

  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $process) {
    throw "$Label did not start."
  }

  try {
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $process.Kill($true)
      throw "$Label timed out after $TimeoutSeconds seconds."
    }
    if ($process.ExitCode -ne 0) {
      throw "$Label failed with exit code $($process.ExitCode)."
    }
  } finally {
    $process.Dispose()
  }
}

function Wait-Until {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Condition,

    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return [bool](& $Condition)
}

function Read-PeHeader {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $header = [byte[]]::new(2)
    if ($stream.Read($header, 0, 2) -ne 2) {
      return ''
    }
    return [System.Text.Encoding]::ASCII.GetString($header)
  } finally {
    $stream.Dispose()
  }
}

function Invoke-InstalledSmoke {
  param(
    [string]$ApplicationPath,
    [string]$OutputPath
  )

  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  Invoke-CheckedProcess `
    -FilePath $ApplicationPath `
    -Arguments @(
      "--smoke-user-data-dir=$userDataRoot",
      '--smoke-test',
      "--smoke-output=$OutputPath",
      '--smoke-timeout-ms=30000'
    ) `
    -Label 'Installed application smoke-test' `
    -TimeoutSeconds 60

  Assert-Gate `
    -Condition (Test-Path -LiteralPath $OutputPath -PathType Leaf) `
    -Name 'Installed smoke report' `
    -PassedDetail 'Packaged application created a smoke report.' `
    -FailedDetail 'Packaged application did not create a smoke report.'

  $smoke = Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json
  Assert-Gate `
    -Condition (
      $smoke.status -eq 'passed' -and
      $smoke.packaged -eq $true -and
      $smoke.version -eq $ExpectedVersion
    ) `
    -Name 'Installed application runtime' `
    -PassedDetail "Packaged version $ExpectedVersion initialized main, renderer and preload." `
    -FailedDetail 'Installed smoke report has an invalid status, version or packaged flag.'
}

function Write-RcReport {
  $destination = [System.IO.Path]::GetFullPath($ReportPath)
  $directory = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $directory -Force | Out-Null

  $report = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    status = $script:Status
    productName = 'Eman Sticker Generator'
    version = $ExpectedVersion
    platform = [System.Environment]::OSVersion.VersionString
    architecture = $env:PROCESSOR_ARCHITECTURE
    signature = [ordered]@{
      required = [bool]$RequireSignature
      status = $script:SignatureStatus
      subject = $script:SignatureSubject
      thumbprint = $script:SignatureThumbprint
    }
    lifecycle = [ordered]@{
      silentInstall = [bool](
        $script:Checks |
          Where-Object {
            $_.name -eq 'Silent installation' -and $_.status -eq 'passed'
          }
      )
      packagedSmokeRuns = @(
        $script:Checks |
          Where-Object {
            $_.name -eq 'Installed application runtime' -and
            $_.status -eq 'passed'
          }
      ).Count
      silentUninstall = [bool](
        $script:Checks |
          Where-Object {
            $_.name -eq 'Silent uninstall' -and $_.status -eq 'passed'
          }
      )
      userDataPreserved = [bool](
        $script:Checks |
          Where-Object {
            $_.name -eq 'User data preservation' -and
            $_.status -eq 'passed'
          }
      )
    }
    checks = $script:Checks
    failure = if ($script:Failure) {
      Protect-Path $script:Failure
    } else {
      $null
    }
  }

  $temporary = "$destination.$PID.tmp"
  $report | ConvertTo-Json -Depth 8 | Set-Content `
    -LiteralPath $temporary `
    -Encoding utf8NoBOM
  Move-Item -LiteralPath $temporary -Destination $destination -Force
}

try {
  Assert-Gate `
    -Condition ($IsWindows -and [System.Environment]::Is64BitOperatingSystem) `
    -Name 'Windows runner' `
    -PassedDetail 'Windows x64 environment detected.' `
    -FailedDetail 'RC lifecycle validation requires Windows x64.'

  $resolvedInstaller = (Resolve-Path -LiteralPath $InstallerPath).Path
  $expectedName = "Eman-Sticker-Generator-$ExpectedVersion-x64.exe"
  $installer = Get-Item -LiteralPath $resolvedInstaller

  Assert-Gate `
    -Condition ($installer.Name -ceq $expectedName) `
    -Name 'Installer identity' `
    -PassedDetail "$expectedName matches the package version." `
    -FailedDetail "Expected installer $expectedName, received $($installer.Name)."
  Assert-Gate `
    -Condition ($installer.Length -ge 10MB) `
    -Name 'Installer size' `
    -PassedDetail "Installer size is $([math]::Round($installer.Length / 1MB, 1)) MB." `
    -FailedDetail 'Installer is unexpectedly smaller than 10 MB.'
  Assert-Gate `
    -Condition ((Read-PeHeader $resolvedInstaller) -ceq 'MZ') `
    -Name 'Installer PE header' `
    -PassedDetail 'Installer has a valid MZ header.' `
    -FailedDetail 'Installer does not have a valid Windows PE header.'

  $signature = Get-AuthenticodeSignature -LiteralPath $resolvedInstaller
  $script:SignatureStatus = [string]$signature.Status
  if ($signature.SignerCertificate) {
    $script:SignatureSubject = [string]$signature.SignerCertificate.Subject
    $script:SignatureThumbprint = [string]$signature.SignerCertificate.Thumbprint
  }
  Assert-Gate `
    -Condition (-not $RequireSignature -or $signature.Status -eq 'Valid') `
    -Name 'Authenticode policy' `
    -PassedDetail (
      if ($signature.Status -eq 'Valid') {
        'Installer signature is valid.'
      } else {
        "Signature status $($signature.Status) is allowed for an internal RC."
      }
    ) `
    -FailedDetail "A valid signature is required; current status is $($signature.Status)."

  New-Item -ItemType Directory -Path $userDataRoot -Force | Out-Null
  Invoke-CheckedProcess `
    -FilePath $resolvedInstaller `
    -Arguments @('/S', "/D=$installRoot") `
    -Label 'Silent NSIS installation' `
    -TimeoutSeconds 180

  $applicationPath = Join-Path $installRoot 'EmanStickerGenerator.exe'
  $desktopShortcut = Join-Path `
    ([System.Environment]::GetFolderPath(
      [System.Environment+SpecialFolder]::Desktop
    )) `
    'Eman Sticker Generator.lnk'
  $startMenuShortcut = Join-Path `
    ([System.Environment]::GetFolderPath(
      [System.Environment+SpecialFolder]::Programs
    )) `
    'Eman Sticker Generator.lnk'

  Assert-Gate `
    -Condition (Test-Path -LiteralPath $applicationPath -PathType Leaf) `
    -Name 'Silent installation' `
    -PassedDetail 'NSIS installed the packaged executable in the selected directory.' `
    -FailedDetail 'Installed application executable was not found.'
  Assert-Gate `
    -Condition (
      (Test-Path -LiteralPath $desktopShortcut -PathType Leaf) -and
      (Test-Path -LiteralPath $startMenuShortcut -PathType Leaf)
    ) `
    -Name 'Windows shortcuts' `
    -PassedDetail 'Desktop and Start menu shortcuts were created.' `
    -FailedDetail 'Desktop or Start menu shortcut is missing.'

  Invoke-InstalledSmoke `
    -ApplicationPath $applicationPath `
    -OutputPath $firstSmokePath

  $settingsPath = Join-Path $userDataRoot 'settings.json'
  Assert-Gate `
    -Condition (Test-Path -LiteralPath $settingsPath -PathType Leaf) `
    -Name 'User settings initialization' `
    -PassedDetail 'The installed application created persistent settings.' `
    -FailedDetail 'The installed application did not create settings.json.'

  $settingsBefore = (Get-FileHash -LiteralPath $settingsPath -Algorithm SHA256).Hash
  [ordered]@{
    version = $ExpectedVersion
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $sentinelPath -Encoding utf8NoBOM

  Invoke-InstalledSmoke `
    -ApplicationPath $applicationPath `
    -OutputPath $secondSmokePath

  $settingsAfter = (Get-FileHash -LiteralPath $settingsPath -Algorithm SHA256).Hash
  Assert-Gate `
    -Condition (
      $settingsBefore -eq $settingsAfter -and
      (Test-Path -LiteralPath $sentinelPath -PathType Leaf)
    ) `
    -Name 'Restart persistence' `
    -PassedDetail 'Settings and the persistence sentinel survived a second packaged launch.' `
    -FailedDetail 'User data changed unexpectedly or disappeared after restart.'

  $uninstaller = Get-ChildItem `
    -LiteralPath $installRoot `
    -Filter 'Uninstall*.exe' `
    -File | Select-Object -First 1
  Assert-Gate `
    -Condition ($null -ne $uninstaller) `
    -Name 'Uninstaller availability' `
    -PassedDetail 'NSIS uninstaller was installed.' `
    -FailedDetail 'NSIS uninstaller was not found.'

  Invoke-CheckedProcess `
    -FilePath $uninstaller.FullName `
    -Arguments @('/S') `
    -Label 'Silent NSIS uninstall' `
    -TimeoutSeconds 180

  $applicationRemoved = Wait-Until `
    -Condition {
      -not (Test-Path -LiteralPath $applicationPath) -and
      -not (Test-Path -LiteralPath $desktopShortcut) -and
      -not (Test-Path -LiteralPath $startMenuShortcut)
    } `
    -TimeoutSeconds 60
  Assert-Gate `
    -Condition (
      $applicationRemoved -and
      -not (Test-Path -LiteralPath $desktopShortcut) -and
      -not (Test-Path -LiteralPath $startMenuShortcut)
    ) `
    -Name 'Silent uninstall' `
    -PassedDetail 'Application files and shortcuts were removed.' `
    -FailedDetail 'Application files or shortcuts remain after uninstall.'

  Assert-Gate `
    -Condition (
      (Test-Path -LiteralPath $settingsPath -PathType Leaf) -and
      (Test-Path -LiteralPath $sentinelPath -PathType Leaf)
    ) `
    -Name 'User data preservation' `
    -PassedDetail 'Settings and user data survived uninstall.' `
    -FailedDetail 'Uninstall removed user data that must be preserved.'

  $script:Status = 'passed'
} catch {
  $script:Failure = $_.Exception.Message
  if (-not ($script:Checks | Where-Object { $_.status -eq 'failed' })) {
    Add-Check `
      -Name 'RC lifecycle execution' `
      -Status failed `
      -Detail $script:Failure
  }
} finally {
  Write-RcReport
  if ($script:Status -eq 'passed' -and (Test-Path -LiteralPath $runRoot)) {
    Remove-Item -LiteralPath $runRoot -Recurse -Force
  }
}

if ($script:Status -ne 'passed') {
  throw "Windows RC validation failed: $script:Failure"
}

Write-Host "Windows RC validation passed: $ReportPath"
