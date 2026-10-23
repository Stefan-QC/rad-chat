# RAD Chat

A small LAN chat. It has no dependencies and needs Node 18 or newer.

## Start

```sh
node server.js          # or: PORT=4000 node server.js
```

Colleagues on the same network open `http://<your-laptop-ip>:3000` in a browser.
Message history (the last 500 messages) is saved to `history.json`.

## Project structure

```
server.js            HTTP + SSE server
public/
  index.html         markup only
  css/               linked from index.html in this order
    tokens.css       colours, fonts, dark mode (Qualogy brand book)
    base.css         reset and element defaults
    components.css   icon button, avatar, primary button
    join.css  layout.css  rail.css  sidebar.css  header.css
    messages.css  composer.css  members.css  responsive.css
  js/voice.js        voice channels (WebRTC)
  js/main.js         join flow, SSE connection, composer, UI wiring
    feed.js          message feed rendering
    utils.js         colours, formatting, safe rich text
  game.js            RAD Craft
```

## Voice channels

Click **Lounge** or **Stand-up** under "Voice channels" to talk. Audio goes directly between
browsers (WebRTC); the server only relays the connection setup. Use the bar above your name to
mute or disconnect. A green ring around an avatar means that person is speaking.

Browsers only allow microphone access on `https://` or `localhost`, so colleagues on the LAN need
HTTPS. Create a self-signed certificate once (the server switches to HTTPS when `certs/` exists):

```sh
mkdir certs
openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout certs/key.pem -out certs/cert.pem -subj "/CN=RAD Chat"
```

Everyone then opens `https://<your-laptop-ip>:3000` and accepts the one-time certificate warning.

## RAD Craft (`/game`)

Type `/game` in the chat to open a shared, Minecraft-style block world. Everyone who
joins is in the same world: you can see each other, and blocks you build or break show
up for everyone. Chat keeps working inside the game (press `T`).

- **Controls:** `WASD` to move, `Space` to jump, `Shift` to sprint, `F` to fly. Left click
  breaks a block, right click places one, and `1`–`0` or the scroll wheel picks the block.
  `Esc` pauses.
- **Saved world:** the terrain is generated from a seed. The seed and all player edits are
  saved in `world.json`. Delete that file (with the server stopped) to start a fresh world.
- **Offline:** three.js is bundled in `public/vendor/`, so the game works without internet.

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
