# RAD Chat

A small LAN chat. It has no dependencies and needs Node 18 or newer.

## Start

```sh
node server.js          # or: PORT=4000 node server.js
```

Colleagues on the same network open `http://<your-laptop-ip>:3000` in a browser.
Message history (the last 500 messages) is saved to `history.json`.

## WSL2: let the LAN reach the server

WSL2 runs behind NAT by default, so the 172.x address the server prints only
works from your own laptop. Pick one option:

**Option A: mirrored networking (recommended, Windows 11 22H2+).**
Add this to `C:\Users\<you>\.wslconfig`, then run `wsl --shutdown` and start the server again:

```ini
[wsl2]
networkingMode=mirrored
```

You still need the firewall rule (run once in an admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "RAD Chat 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
```

**Option B: port forwarding.** In an admin PowerShell, run `expose-on-lan.ps1` from this folder.
Run it again after each WSL restart, because the WSL IP changes.

## Notes

- There is no authentication. Anyone on the LAN who has the URL can join, so use it only on trusted networks.
- If colleagues can't connect, check that Windows marks the network as **Private** or **Domain**, not Public.
  Corporate Wi-Fi can also block traffic between clients (client isolation).
