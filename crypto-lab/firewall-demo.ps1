param(
  [string]$HostIPv4 = '10.13.132.126',
  [string]$AllowedSubnet = '10.13.128.0/19'
)
$ErrorActionPreference = 'Stop'
$rule = 'MekoDataCTF Crypto Range (LAN only)'
$ports = '3000,8088,19111-19113,19211-19213,19311-19313'
& netsh.exe advfirewall firewall add rule name=$rule dir=in action=allow protocol=TCP localip=$HostIPv4 remoteip=$AllowedSubnet localport=$ports profile=any
if ($LASTEXITCODE -ne 0) { throw 'Unable to add the restricted Windows Firewall rule. Run this script as Administrator.' }
Write-Host "Allowed TCP $ports to $HostIPv4 from $AllowedSubnet. No other local address or subnet is included."
