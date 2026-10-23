# Run in an ADMIN PowerShell on Windows each time WSL restarts (the WSL IP changes).
# Forwards Windows:3000 -> WSL:3000 and opens the firewall so LAN colleagues can connect.
param([int]$Port = 3000)

$wslIp = (wsl hostname -I).Trim().Split(' ')[0]
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp

if (-not (Get-NetFirewallRule -DisplayName "RAD Chat $Port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "RAD Chat $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private,Domain | Out-Null
}

Write-Host "Forwarding 0.0.0.0:$Port -> ${wslIp}:$Port"
Write-Host "Colleagues can open:"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'WSL|Loopback|vEthernet' -and $_.PrefixOrigin -ne 'WellKnown' } |
    ForEach-Object { Write-Host "  http://$($_.IPAddress):$Port" }
