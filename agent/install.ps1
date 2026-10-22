# Installs opsmira-agent on Windows as a scheduled task that starts at boot and restarts if it stops, so this
# machine stays connected to your Opsmira console.
#
# Run it in an elevated PowerShell (Run as administrator), with the command from the console:
#
#   & ([scriptblock]::Create((irm https://CONSOLE/agent/install.ps1))) -Server wss://CONSOLE/api/agent/connect -Token ops_connect_...
#
# Parameters:
#   -Server URL     the console's agent address (required)
#   -Token TOKEN    the one-time token from the console (required the first time)
#   -Name NAME      how the machine is named in the console (default: the computer name)
#   -Access MODE    read-only (default) or operate (lets the console run PowerShell commands here)
#   -Uninstall      stop and remove the task and the files
param(
  [string]$Server = "",
  [string]$Token = "",
  [string]$Name = "",
  [ValidateSet("read-only", "operate")][string]$Access = "read-only",
  [switch]$Uninstall
)
$ErrorActionPreference = "Stop"
$TaskName = "opsmira-agent"
$Dir = Join-Path $env:ProgramData "opsmira-agent"
$NodeVersion = "v22.12.0"

function Die($msg) { Write-Host "opsmira-agent install: $msg" -ForegroundColor Red; exit 1 }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Die "run this in a PowerShell opened with Run as administrator." }

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*opsmira-agent.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Remove-Item -Recurse -Force $Dir -ErrorAction SilentlyContinue
  Write-Host "Removed. Take the machine out of the console in its Surfaces menu."
  exit 0
}

if (-not $Server) { Die "-Server is required (the console's agent address)." }
$origin = ($Server -replace "^ws", "http") -replace "/api/agent/connect$", ""
if ($Server -match "^ws://" -and $Server -notmatch "^ws://(localhost|127\.)") {
  Write-Host "warning: this connection is not encrypted (ws://). Put the console behind HTTPS and use wss://." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$agentFile = Join-Path $Dir "opsmira-agent.mjs"
$stateFile = Join-Path $Dir "agent.json"
if (-not $Token -and -not (Test-Path $stateFile)) { Die "-Token is required the first time: copy the command from the console." }

# Node 22 or newer: the one already here, else a private copy for the agent only (checksum verified).
$node = $null
$found = Get-Command node -ErrorAction SilentlyContinue
if ($found -and [int]((& $found.Source -p "process.versions.node.split('.')[0]")) -ge 22) { $node = $found.Source }
if (-not $node) {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $zipName = "node-$NodeVersion-win-$arch.zip"
  $zip = Join-Path $env:TEMP $zipName
  Write-Host "Downloading Node $NodeVersion for the agent only..."
  Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/$zipName" -OutFile $zip
  $sums = (Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/SHASUMS256.txt").Content -split "`n"
  $want = (($sums | Where-Object { $_ -match [regex]::Escape($zipName) + "$" }) -split "\s+")[0]
  $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if (-not $want -or $got -ne $want) { Remove-Item $zip -Force; Die "the downloaded Node did not match its published checksum." }
  $nodeDir = Join-Path $Dir "node"
  Remove-Item -Recurse -Force $nodeDir -ErrorAction SilentlyContinue
  Expand-Archive $zip -DestinationPath $Dir -Force
  Rename-Item (Join-Path $Dir "node-$NodeVersion-win-$arch") $nodeDir
  Remove-Item $zip -Force
  $node = Join-Path $nodeDir "node.exe"
}

Write-Host "Fetching the agent from $origin..."
Invoke-WebRequest "$origin/agent/opsmira-agent.mjs" -OutFile $agentFile

# Re-running keeps the saved credential, and stops the old copy first.
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$argList = "`"$agentFile`" --server $Server --access $Access --state `"$stateFile`""
if ($Name) { $argList += " --name $Name" }
if (-not (Test-Path $stateFile)) { $argList += " --token $Token" }

# The first run pairs and saves its credential, so the one-time token is not kept in the task afterwards.
$action = New-ScheduledTaskAction -Execute $node -Argument $argList -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

if ($Token) {
  # Wait for the pairing to be saved, then drop the token from the task.
  for ($i = 0; $i -lt 20 -and -not (Test-Path $stateFile); $i++) { Start-Sleep -Seconds 1 }
  if (Test-Path $stateFile) {
    $argList = $argList -replace " --token \S+", ""
    $action = New-ScheduledTaskAction -Execute $node -Argument $argList -WorkingDirectory $Dir
    Set-ScheduledTask -TaskName $TaskName -Action $action | Out-Null
  } else {
    Write-Host "It has not paired yet. Check that this machine can reach $origin, and that the command was used within an hour." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "opsmira-agent is running as a scheduled task named '$TaskName' (access: $Access)."
if ($Access -eq "operate") { Write-Host "It runs as SYSTEM, so the console can run PowerShell commands with full rights here. It asks its owner before changes." }
else { Write-Host "Read-only: the console can only run a few status programs (hostname, tasklist, ipconfig...). Re-run with -Access operate to allow commands." }
Write-Host "Remove it:  & ([scriptblock]::Create((irm $origin/agent/install.ps1))) -Server $Server -Uninstall"
