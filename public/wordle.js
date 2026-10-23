// RAD Wordle — Dutch five-letter Wordle, opened from the chat with /wordle.
// Daily mode: everyone gets the same word each day (picked from the date). Practice mode: random words.
import { WORDS } from './words.js';

const ROWS = 6, COLS = 5;
const KEYS = ['qwertyuiop', ' asdfghjkl ', '+zxcvbnm-'];
const VALID = new Set(WORDS);
const SETTINGS_KEY = 'radchat-wordle-settings';
const STATS_KEY = 'radchat-wordle-stats';
const CHEERS = ['Geniaal!', 'Prachtig!', 'Indrukwekkend!', 'Mooi!', 'Goed!', 'Pfff, net op tijd!'];

const idOf = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const dayId = () => idOf(new Date());
const yesterdayOf = id => { const [y, m, d] = id.split('-').map(Number); return idOf(new Date(y, m - 1, d - 1)); };

function load(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key)) }; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function answerFor(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return WORDS[(h >>> 0) % WORDS.length];
}

// Two passes so repeated letters are only marked as often as they occur in the answer.
export function score(guess, answer) {
  const res = Array(COLS).fill('absent');
  const left = {};
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < COLS; i++) {
    if (res[i] === 'correct') continue;
    if (left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
  }
  return res;
}

export function recordResult(stats, id, won, n) {
  const s = { ...stats, dist: [...stats.dist], played: stats.played + 1 };
  if (won) {
    s.wins++;
    s.dist[n - 1]++;
    s.streak = s.lastWin === yesterdayOf(id) ? s.streak + 1 : 1;
    s.lastWin = id;
    s.max = Math.max(s.max, s.streak);
  } else {
    s.streak = 0;
  }
  return s;
}

const DEFAULT_STATS = { played: 0, wins: 0, streak: 0, max: 0, lastWin: '', dist: [0, 0, 0, 0, 0, 0] };
const media = q => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
const DEFAULT_SETTINGS = () => ({
  dark: media('(prefers-color-scheme: dark)'), contrast: false, sound: false, reduce: media('(prefers-reduced-motion: reduce)'),
});

const ICON_STATS = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M16 11V3H8v6H2v12h20V11zm-6-6h4v14h-4zm-6 6h4v8H4zm16 8h-4v-6h4z"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19.400 13a7.500 7.500 0 0 0 0-2l2.100-1.600-2-3.500-2.500 1a7.300 7.300 0 0 0-1.700-1L15 3h-4l-.400 2.900a7.300 7.300 0 0 0-1.700 1l-2.500-1-2 3.500L6.600 11a7.500 7.500 0 0 0 0 2l-2.100 1.600 2 3.500 2.500-1c.500.400 1.100.700 1.700 1L11 21h4l.400-2.900c.600-.300 1.200-.600 1.700-1l2.500 1 2-3.500zM13 15.500a3.500 3.500 0 1 1 0-7 3.500 3.500 0 0 1 0 7z"/></svg>';

let overlay = null;

export function startWordle({ name, sendChat, onOpen }) {
  if (overlay) return;
  document.activeElement?.blur();

  let settings = load(SETTINGS_KEY, DEFAULT_SETTINGS());
  let stats = load(STATS_KEY, DEFAULT_STATS);
  let mode = 'daily';
  let id = dayId();
  let answer = '';
  let guesses = [];
  let current = '';
  let busy = false;
  let modalOpen = false;

  overlay = document.createElement('div');
  overlay.id = 'wordle';
  overlay.innerHTML = `
    <div class="wd-wrap">
      <header>
        <button class="wd-close">Back to chat</button>
        <h2>WORDLE</h2>
        <div class="wd-icons">
          <button class="wd-icon" data-open="stats" aria-label="Statistieken">${ICON_STATS}</button>
          <button class="wd-icon" data-open="settings" aria-label="Instellingen">${ICON_GEAR}</button>
        </div>
      </header>
      <div class="wd-tabs" role="tablist">
        <button data-mode="daily" role="tab">Dagelijks</button>
        <button data-mode="practice" role="tab">Oefenen</button>
      </div>
      <div class="wd-body">
        <div class="wd-card">
          <div class="wd-toasts" aria-live="polite"></div>
          <div class="wd-board"></div>
          <div class="wd-kb"></div>
          <div class="wd-end" hidden>
            <div class="wd-countdown"></div>
            <button class="btn wd-share">Deel in chat</button>
            <button class="btn wd-again">Nieuw spel</button>
          </div>
        </div>
        <aside class="wd-side">
          <h3>Leaderboard</h3>
          <ol id="board"></ol>
          <p class="lb-hint">Punten: Wordle winnen en bouwen in RAD Craft.</p>
        </aside>
      </div>
      <div class="wd-modal" hidden><div class="wd-modal-card" role="dialog"></div></div>
    </div>`;
  const app = document.getElementById('app');
  app.classList.add('in-wordle');
  app.append(overlay);
  onOpen?.();
  const $ = sel => overlay.querySelector(sel);

  // ---------- board + keyboard ----------
  const board = $('.wd-board');
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'wd-row';
    cells.push([]);
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      row.append(cell);
      cells[r].push(cell);
    }
    board.append(row);
  }

  const kb = $('.wd-kb');
  const keyEls = {};
  for (const line of KEYS) {
    const row = document.createElement('div');
    row.className = 'wd-krow';
    for (const k of line) {
      if (k === ' ') { const sp = document.createElement('div'); sp.className = 'half'; row.append(sp); continue; }
      const b = document.createElement('button');
      const key = k === '+' ? 'Enter' : k === '-' ? 'Backspace' : k;
      b.dataset.key = key;
      b.textContent = k === '+' ? 'ENTER' : k === '-' ? '⌫' : k;
      b.setAttribute('aria-label', key);
      if (k === '+' || k === '-') b.className = 'wide';
      keyEls[key] = b;
      row.append(b);
    }
    kb.append(row);
  }

  // ---------- helpers ----------
  const sleep = ms => (settings.reduce ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));
  const won = () => guesses.at(-1) === answer;
  const over = () => won() || guesses.length >= ROWS;

  let audio = null;
  function tone(freq, dur = 0.08, delay = 0) {
    if (!settings.sound) return;
    try {
      audio ||= new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.05, audio.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + dur);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + delay); o.stop(audio.currentTime + delay + dur);
    } catch { /* no audio */ }
  }

  function toast(text, ms = 1600) {
    const t = document.createElement('div');
    t.className = 'wd-toast';
    t.textContent = text;
    $('.wd-toasts').prepend(t);
    if (ms) setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  function applySettings() {
    overlay.classList.toggle('dark', settings.dark);
    overlay.classList.toggle('hc', settings.contrast);
    overlay.classList.toggle('reduce', settings.reduce);
  }

  function paintRow(r) {
    const word = r < guesses.length ? guesses[r] : r === guesses.length ? current : '';
    const marks = r < guesses.length ? score(guesses[r], answer) : null;
    cells[r].forEach((cell, c) => {
      cell.textContent = word[c] || '';
      cell.className = 'cell' + (marks ? ' ' + marks[c] : word[c] ? ' filled' : '');
    });
  }

  function paintKeys() {
    const rank = { absent: 1, present: 2, correct: 3 };
    const best = {};
    guesses.forEach(g => score(g, answer).forEach((m, i) => { if (!best[g[i]] || rank[m] > rank[best[g[i]]]) best[g[i]] = m; }));
    for (const el of Object.values(keyEls)) el.classList.remove('correct', 'present', 'absent');
    for (const [k, m] of Object.entries(best)) keyEls[k]?.classList.add(m);
  }

  function updateEnd() {
    $('.wd-end').hidden = !over();
    $('.wd-share').hidden = mode !== 'daily';
    $('.wd-again').hidden = mode !== 'practice';
    $('.wd-countdown').hidden = mode !== 'daily';
    tick();
  }

  // Once a second: count down to the next puzzle and switch to it at midnight.
  function tick() {
    if (mode === 'daily' && dayId() !== id && !busy) { newGame('daily'); toast('Nieuwe puzzel beschikbaar!'); return; }
    if (mode !== 'daily' || !over()) return;
    const n = new Date();
    const ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
    const p = v => String(Math.floor(v)).padStart(2, '0');
    $('.wd-countdown').textContent = `Volgende Wordle over ${p(ms / 3600000)}:${p((ms / 60000) % 60)}:${p((ms / 1000) % 60)}`;
  }
  const timer = setInterval(tick, 1000);

  // ---------- game flow ----------
  const dailyKey = () => 'radchat-wordle-' + id;

  // Counts a finished daily puzzle in the stats exactly once, even after a refresh mid-animation.
  function finishGame() {
    if (mode !== 'daily' || load(dailyKey(), {}).counted) return;
    save(dailyKey(), { guesses, counted: true });
    stats = recordResult(stats, id, won(), guesses.length);
    save(STATS_KEY, stats);
    if (won()) submitScore();
  }

  function newGame(m) {
    mode = m;
    id = dayId();
    current = '';
    busy = false;
    $('.wd-toasts').replaceChildren();
    if (m === 'daily') {
      answer = answerFor(id);
      guesses = (load(dailyKey(), { guesses: [] }).guesses || []).filter(g => typeof g === 'string');
    } else {
      answer = WORDS[Math.floor(Math.random() * WORDS.length)];
      guesses = [];
    }
    overlay.querySelectorAll('.wd-tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    for (let r = 0; r < ROWS; r++) paintRow(r);
    paintKeys();
    if (over()) {
      finishGame();
      if (!won()) toast(answer.toUpperCase(), 0);
    }
    updateEnd();
  }

  // The server awards points once per day and shows them on the leaderboard.
  async function submitScore() {
    try {
      const res = await fetch('/score/wordle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, day: id, guesses: guesses.length, won: true }),
      });
      const { points } = await res.json();
      if (points) toast(`+${points} punten`, 2500);
    } catch { /* offline: no points */ }
  }

  async function flipTile(cell, mark, c) {
    await sleep(c * 300);
    if (!settings.reduce) { cell.classList.add('flip-in'); await sleep(250); }
    cell.className = 'cell ' + mark + (settings.reduce ? '' : ' flip-out');
    tone(mark === 'correct' ? 660 : mark === 'present' ? 520 : 380, 0.06);
    await sleep(250);
  }

  function reject(msg) {
    toast(msg);
    tone(200, 0.15);
    if (settings.reduce) return;
    const row = board.children[guesses.length];
    row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
  }

  async function submit() {
    if (current.length < COLS) return reject('Te weinig letters');
    if (!VALID.has(current)) return reject('Niet in de woordenlijst');
    busy = true; // input stays locked until every animation has finished
    const r = guesses.length;
    guesses.push(current);
    current = '';
    if (mode === 'daily') save(dailyKey(), { guesses, counted: false });
    const marks = score(guesses[r], answer);
    await Promise.all(cells[r].map((cell, c) => flipTile(cell, marks[c], c)));
    paintKeys();
    if (won()) {
      toast(CHEERS[r], 2000);
      tone(523, 0.12); tone(659, 0.12, 0.12); tone(784, 0.2, 0.24);
      if (!settings.reduce) {
        cells[r].forEach((cell, c) => setTimeout(() => cell.classList.add('bounce'), c * 100));
        await sleep(1200);
      }
    } else if (guesses.length >= ROWS) {
      toast(answer.toUpperCase(), 0);
    }
    if (over()) finishGame();
    busy = false;
    updateEnd();
    if (over() && mode === 'daily') openModal('stats');
  }

  function press(key) {
    if (busy || over() || modalOpen) return;
    if (mode === 'daily' && dayId() !== id) return tick();
    if (key === 'Enter') return submit();
    if (key === 'Backspace') {
      current = current.slice(0, -1);
    } else if (/^[a-z]$/.test(key) && current.length < COLS) {
      current += key;
      tone(440, 0.03);
      paintRow(guesses.length);
      const cell = cells[guesses.length][current.length - 1];
      if (!settings.reduce) { cell.classList.remove('pop'); void cell.offsetWidth; cell.classList.add('pop'); }
      return;
    } else return;
    paintRow(guesses.length);
  }

  // ---------- modals ----------
  const modal = $('.wd-modal'), modalCard = $('.wd-modal-card');
  function openModal(kind) {
    modalOpen = true;
    modalCard.replaceChildren();
    const x = document.createElement('button');
    x.className = 'wd-modal-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Sluiten');
    x.addEventListener('click', closeModal);
    modalCard.append(x);
    (kind === 'stats' ? statsView : settingsView)(modalCard);
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; modalOpen = false; }

  function statsView(el) {
    const pct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    const today = dayId();
    const streak = stats.lastWin === today || stats.lastWin === yesterdayOf(today) ? stats.streak : 0;
    const max = Math.max(1, ...stats.dist);
    const hi = mode === 'daily' && over() && won() ? guesses.length - 1 : -1;
    el.insertAdjacentHTML('beforeend', `
      <h3>Statistieken</h3>
      <div class="wd-nums">
        <div><b>${stats.played}</b><span>Gespeeld</span></div>
        <div><b>${pct}</b><span>Winst %</span></div>
        <div><b>${streak}</b><span>Huidige reeks</span></div>
        <div><b>${stats.max}</b><span>Langste reeks</span></div>
      </div>
      <h3>Verdeling pogingen</h3>
      <div class="wd-dist">${stats.dist.map((n, i) => `
        <div><i>${i + 1}</i><span class="${i === hi ? 'hi' : ''}" style="width:max(${Math.round((n / max) * 100)}%, 8%)">${n}</span></div>`).join('')}
      </div>
      <p class="wd-note">Oefenspellen tellen niet mee.</p>`);
  }

  function settingsView(el) {
    const rows = [
      ['dark', 'Dark mode', 'Donker kleurenschema'],
      ['contrast', 'Hoog contrast', 'Oranje en blauw in plaats van groen en geel'],
      ['sound', 'Geluidseffecten', 'Korte geluidjes tijdens het spelen'],
      ['reduce', 'Animaties verminderen', 'Geen flip-, spring- of schudanimaties'],
    ];
    el.insertAdjacentHTML('beforeend', '<h3>Instellingen</h3>' + rows.map(([k, t, d]) => `
      <label class="wd-set"><span><b>${t}</b><small>${d}</small></span>
        <input type="checkbox" data-set="${k}" ${settings[k] ? 'checked' : ''}><i class="sw"></i></label>`).join(''));
    el.querySelectorAll('[data-set]').forEach(i => i.addEventListener('change', () => {
      settings = { ...settings, [i.dataset.set]: i.checked };
      save(SETTINGS_KEY, settings);
      applySettings();
    }));
  }

  // ---------- wiring ----------
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.stopPropagation(); return modalOpen ? closeModal() : close(); }
    if (e.target.closest?.('.wd-modal input')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Enter' || k === 'Backspace' || /^[a-z]$/.test(k)) { e.preventDefault(); e.stopPropagation(); press(k); }
  };
  function close() {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    app.classList.remove('in-wordle');
    overlay = null;
  }
  document.addEventListener('keydown', onKey, true);
  kb.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { b.blur(); press(b.dataset.key); } });
  $('.wd-close').addEventListener('click', close);
  overlay.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { b.blur(); if (!modalOpen) openModal(b.dataset.open); }));
  overlay.querySelectorAll('.wd-tabs button').forEach(b => b.addEventListener('click', () => {
    b.blur();
    if (!busy && b.dataset.mode !== mode) newGame(b.dataset.mode);
  }));
  modal.addEventListener('mousedown', e => { if (e.target === modal) closeModal(); });
  $('.wd-again').addEventListener('click', e => { e.target.blur(); newGame('practice'); });
  $('.wd-share').addEventListener('click', async e => {
    const em = settings.contrast ? { correct: '🟧', present: '🟦', absent: '⬛' } : { correct: '🟩', present: '🟨', absent: '⬛' };
    const grid = guesses.map(g => score(g, answer).map(m => em[m]).join('')).join('\n');
    e.target.disabled = true;
    await sendChat(`RAD Wordle ${id} ${won() ? guesses.length : 'X'}/${ROWS}\n${grid}`);
    close();
  });

  applySettings();
  newGame('daily');
}
