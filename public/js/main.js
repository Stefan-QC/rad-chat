// RAD Chat client: join flow, live connection (SSE), composer and UI wiring.
import { avatar, colorFor, initial } from './utils.js';
import { initVoice } from './voice.js';
import { atBottom, render, resetFeed, toBottom } from './feed.js';

const $ = id => document.getElementById(id);
let name = localStorage.getItem('radchat-name') || '';
$('nameInput').value = name;

function notify(msg) {
  if (msg.type !== 'chat' || msg.name === name || !document.hidden) return;
  document.title = '• RAD Chat';
  if (window.Notification?.permission === 'granted') new Notification(msg.name, { body: msg.text });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'RAD Chat'; });

// Live events are re-dispatched here so the game (public/game.js) can listen too.
const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

function renderUsers(users) {
  $('count').textContent = users.length;
  $('users').replaceChildren(...users.map(u => {
    const li = document.createElement('li');
    const av = avatar(u, true);
    av.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
    const s = document.createElement('span'); s.textContent = u;
    li.append(av, s);
    if (u === name) { const y = document.createElement('small'); y.textContent = 'you'; li.append(y); }
    return li;
  }));
}

const voice = initVoice({ getName: () => name, $ });

let es = null;
function connect() {
  if (es) es.close();
  es = new EventSource('/events?name=' + encodeURIComponent(name));
  es.onopen = () => { $('status').className = 'on'; $('status').textContent = 'connected'; };
  es.onerror = () => { $('status').className = 'off'; $('status').textContent = 'reconnecting…'; };
  es.addEventListener('history', e => {
    resetFeed();
    JSON.parse(e.data).forEach(m => render(m, name));
    toBottom();
  });
  es.addEventListener('message', e => {
    const stick = atBottom();
    const msg = JSON.parse(e.data);
    render(msg, name);
    notify(msg);
    emit('message', msg);
    if (stick || msg.name === name) toBottom();
  });
  es.addEventListener('users', e => renderUsers(JSON.parse(e.data)));
  es.addEventListener('voice', e => voice.onState(JSON.parse(e.data)));
  es.addEventListener('signal', e => voice.onSignal(JSON.parse(e.data)));
  es.addEventListener('block', e => emit('block', JSON.parse(e.data)));
  es.addEventListener('players', e => emit('players', JSON.parse(e.data)));
}

const sendChat = text => fetch('/send', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, text }),
});

async function openGame() {
  $('app').classList.remove('drawer');
  const { startGame } = await import('../game.js');
  startGame({ name, bus, sendChat });
}

function setMe() {
  $('meName').textContent = name;
  const av = $('meAv');
  av.style.backgroundColor = colorFor(name);
  const dot = document.createElement('span'); dot.className = 'dot';
  av.replaceChildren(initial(name), dot);
}

$('joinCard').addEventListener('submit', e => {
  e.preventDefault();
  name = $('nameInput').value.trim();
  if (!name) return;
  localStorage.setItem('radchat-name', name);
  $('join').hidden = true;
  $('app').hidden = false;
  setMe();
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
  connect();
  $('text').focus();
});

$('changeName').addEventListener('click', () => {
  voice.leave();
  if (es) es.close();
  $('app').hidden = true;
  $('join').hidden = false;
  $('nameInput').focus(); $('nameInput').select();
});

const text = $('text');
const autosize = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, window.innerHeight * .4) + 'px'; };
text.addEventListener('input', () => { autosize(); $('send').disabled = !text.value.trim(); });

$('composer').addEventListener('submit', async e => {
  e.preventDefault();
  const t = text.value.trim();
  if (!t) return;
  text.value = ''; autosize(); $('send').disabled = true;
  if (t === '/game') return openGame();
  await sendChat(t);
});
text.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
});

$('railGame').addEventListener('click', openGame);
$('sideGame').addEventListener('click', openGame);
$('toggleMembers').addEventListener('click', () => {
  const off = $('app').classList.toggle('no-members');
  $('toggleMembers').classList.toggle('on', !off);
});
$('menuBtn').addEventListener('click', () => $('app').classList.toggle('drawer'));
$('main').addEventListener('click', () => $('app').classList.remove('drawer'));
