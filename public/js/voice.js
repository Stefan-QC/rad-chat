// Voice channels: peer-to-peer audio over WebRTC (full mesh), signaling relayed by the server.
import { avatar } from './utils.js';

const post = (path, body) => fetch(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).catch(() => null);

export function initVoice({ getName, $ }) {
  let channel = null;
  let state = {};
  let stream = null;
  let muted = false;
  let ctx = null;
  const speaking = new Set();
  let stopSelf = null;
  const peers = new Map(); // name -> { pc, audio, queue, stop }

  const signal = (to, data) => post('/voice/signal', { name: getName(), to, data });

  function watchLevel(name, mediaStream) {
    ctx ||= new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(mediaStream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      const on = peak > 12 && !(name === getName() && muted);
      if (on !== speaking.has(name)) { on ? speaking.add(name) : speaking.delete(name); render(); }
    }, 100);
    return () => { clearInterval(timer); if (speaking.delete(name)) render(); };
  }

  function makePeer(name) {
    const pc = new RTCPeerConnection();
    const peer = { pc, queue: [], audio: new Audio(), stop: null };
    peer.audio.autoplay = true;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => e.candidate && signal(name, { candidate: e.candidate });
    pc.ontrack = e => {
      peer.audio.srcObject = e.streams[0];
      peer.audio.play().catch(() => {});
      peer.stop ||= watchLevel(name, e.streams[0]);
    };
    peers.set(name, peer);
    return peer;
  }

  function dropPeer(name) {
    const peer = peers.get(name);
    if (!peer) return;
    peer.stop?.();
    peer.pc.close();
    peer.audio.srcObject = null;
    peers.delete(name);
  }

  async function onSignal({ from, data }) {
    if (!channel) return;
    let peer = peers.get(from);
    if (data.sdp?.type === 'offer') {
      if (peer) dropPeer(from);
      peer = makePeer(from);
      await peer.pc.setRemoteDescription(data.sdp);
      for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      signal(from, { sdp: peer.pc.localDescription });
    } else if (data.sdp?.type === 'answer' && peer) {
      await peer.pc.setRemoteDescription(data.sdp);
      for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c);
    } else if (data.candidate && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.queue.push(data.candidate);
    }
  }

  // Of any two people, the one with the later name starts the call, so offers never collide.
  async function syncPeers() {
    const me = getName();
    const here = channel ? (state[channel] || []).filter(n => n !== me) : [];
    for (const name of [...peers.keys()]) if (!here.includes(name)) dropPeer(name);
    for (const name of here) {
      if (peers.has(name) || me < name) continue;
      const peer = makePeer(name);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      signal(name, { sdp: peer.pc.localDescription });
    }
  }

  function render() {
    const me = getName();
    document.querySelectorAll('.voice').forEach(v => {
      const ch = v.dataset.voice;
      v.querySelector('.chan').classList.toggle('connected', ch === channel);
      v.querySelector('.voice-users').replaceChildren(...(state[ch] || []).map(n => {
        const li = document.createElement('li');
        if (speaking.has(n)) li.className = 'speaking';
        const s = document.createElement('span'); s.textContent = n;
        li.append(avatar(n, true), s);
        if (n === me && muted) li.insertAdjacentHTML('beforeend', '<svg class="muted-ic"><use href="#i-mic-off"/></svg>');
        return li;
      }));
    });
    $('voiceBar').hidden = !channel;
    $('voiceName').textContent = channel || '';
    $('voiceMute').classList.toggle('on', muted);
    $('voiceMute').setAttribute('aria-pressed', muted);
  }

  async function join(ch) {
    if (channel === ch) return leave();
    if (!navigator.mediaDevices?.getUserMedia) {
      return alert('Voice needs a secure connection. Open the site over https:// (or on localhost) — see README.md.');
    }
    if (channel) await leave();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return alert('Could not access your microphone. Allow microphone access for this site and try again.');
    }
    muted = false;
    channel = ch;
    ctx ||= new AudioContext();
    ctx.resume();
    stopSelf = watchLevel(getName(), stream);
    const res = await post('/voice/join', { name: getName(), channel: ch });
    if (!res?.ok) {
      await leave();
      return alert('The server does not support voice yet. Restart it with: node server.js');
    }
    state = { ...state, [ch]: [...new Set([...(state[ch] || []), getName()])].sort() };
    render();
  }

  async function leave() {
    if (!channel) return;
    channel = null;
    for (const name of [...peers.keys()]) dropPeer(name);
    stopSelf?.(); stopSelf = null;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    speaking.clear();
    await post('/voice/leave', { name: getName() });
    render();
  }

  function toggleMute() {
    if (!stream) return;
    muted = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    render();
  }

  document.querySelectorAll('.voice > .chan').forEach(b => b.addEventListener('click', () => join(b.parentElement.dataset.voice)));
  $('voiceMute').addEventListener('click', toggleMute);
  $('voiceLeave').addEventListener('click', leave);
  addEventListener('pagehide', () => navigator.sendBeacon?.('/voice/leave', JSON.stringify({ name: getName() })));

  return {
    leave,
    onState(s) { state = s; render(); syncPeers(); },
    onSignal,
  };
}
