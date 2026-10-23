// RAD Wordle — Dutch five-letter Wordle, opened from the chat with /wordle.
// Everyone gets the same word each day (picked from the date), so results are comparable.
import { WORDS } from './words.js';

const ROWS = 6, COLS = 5;
const KEYS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
const VALID = new Set(WORDS);
const dayId = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function answerFor(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return WORDS[(h >>> 0) % WORDS.length];
}

// Two passes so repeated letters are only marked as often as they occur in the answer.
function score(guess, answer) {
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

const EMOJI = { correct: '🟥', present: '⬛', absent: '⬜' };
let overlay = null;

export function startWordle({ name, sendChat, onOpen }) {
  if (overlay) return;
  const id = dayId();
  const answer = answerFor(id);
  const storeKey = 'radchat-wordle-' + id;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { /* fresh game */ }
  const guesses = saved.guesses || [];
  let current = '';
  const won = () => guesses.at(-1) === answer;
  const over = () => won() || guesses.length >= ROWS;

  document.activeElement?.blur();
  overlay = document.createElement('div');
  overlay.id = 'wordle';
  overlay.innerHTML = `
    <div class="wd-wrap">
      <header><svg class="wd-logo"><use href="#logo"/></svg><h2>RAD Wordle</h2><button class="wd-close">Back to chat</button></header>
      <div class="wd-body">
        <div class="wd-card" role="dialog" aria-label="RAD Wordle">
          <p class="wd-sub">Raad het Nederlandse woord van vandaag in 6 pogingen.</p>
          <div class="wd-board"></div>
          <div class="wd-msg" aria-live="polite"></div>
          <div class="wd-kb"></div>
          <div class="wd-end" hidden><button class="btn wd-share">Deel in chat</button></div>
        </div>
        <aside class="wd-side">
          <h3>Leaderboard</h3>
          <ol id="board"></ol>
          <p class="lb-hint">Punten: Wordle winnen en bouwen in RAD Craft.</p>
        </aside>
      </div>
    </div>`;
  const app = document.getElementById('app');
  app.classList.add('in-wordle');
  app.append(overlay);
  onOpen?.();
  const $ = sel => overlay.querySelector(sel);

  const board = $('.wd-board');
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'wd-row';
    for (let c = 0; c < COLS; c++) row.append(document.createElement('div'));
    board.append(row);
  }

  const kb = $('.wd-kb');
  for (const line of KEYS) {
    const row = document.createElement('div');
    row.className = 'wd-krow';
    for (const k of line) {
      const b = document.createElement('button');
      b.dataset.key = k === '+' ? 'Enter' : k === '-' ? 'Backspace' : k;
      b.textContent = k === '+' ? 'Enter' : k === '-' ? '⌫' : k;
      if (k === '+' || k === '-') b.className = 'wide';
      row.append(b);
    }
    kb.append(row);
  }

  const say = t => { $('.wd-msg').textContent = t; };
  const rows = [...board.children];

  function paint() {
    rows.forEach((row, r) => {
      const word = r < guesses.length ? guesses[r] : r === guesses.length ? current : '';
      const marks = r < guesses.length ? score(guesses[r], answer) : null;
      [...row.children].forEach((cell, c) => {
        cell.textContent = word[c] || '';
        cell.className = marks ? marks[c] : word[c] ? 'filled' : '';
      });
    });
    const best = {};
    const rank = { absent: 1, present: 2, correct: 3 };
    guesses.forEach(g => score(g, answer).forEach((m, i) => { if (!best[g[i]] || rank[m] > rank[best[g[i]]]) best[g[i]] = m; }));
    kb.querySelectorAll('button').forEach(b => { b.className = (b.classList.contains('wide') ? 'wide ' : '') + (best[b.dataset.key] || ''); });
    $('.wd-end').hidden = !over();
    if (over()) say(won() ? `Goed gedaan! ${guesses.length}/${ROWS}` : `Helaas, het woord was ${answer.toUpperCase()}`);
  }

  // The server awards points once per day and shows them on the leaderboard.
  async function submitScore() {
    if (!won()) return;
    try {
      const res = await fetch('/score/wordle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, day: id, guesses: guesses.length, won: true }),
      });
      const { points } = await res.json();
      if (points) say(`Goed gedaan! ${guesses.length}/${ROWS} · +${points} punten`);
    } catch { /* offline: no points */ }
  }

  function shake(msg) {
    say(msg);
    const row = rows[guesses.length];
    row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
  }

  function press(key) {
    if (over()) return;
    if (key === 'Enter') {
      if (current.length < COLS) return shake('Te weinig letters');
      if (!VALID.has(current)) return shake('Niet in de woordenlijst');
      guesses.push(current);
      current = '';
      say('');
      try { localStorage.setItem(storeKey, JSON.stringify({ guesses })); } catch { /* private mode */ }
      if (over()) submitScore();
    } else if (key === 'Backspace') {
      current = current.slice(0, -1);
    } else if (/^[a-z]$/.test(key) && current.length < COLS) {
      current += key;
    }
    paint();
  }

  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return close();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Enter' || k === 'Backspace' || /^[a-z]$/.test(k)) { e.preventDefault(); e.stopPropagation(); press(k); }
  };
  function close() {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    app.classList.remove('in-wordle');
    overlay = null;
  }
  document.addEventListener('keydown', onKey, true);
  kb.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { b.blur(); press(b.dataset.key); } });
  $('.wd-close').addEventListener('click', close);
  $('.wd-share').addEventListener('click', async e => {
    const grid = guesses.map(g => score(g, answer).map(m => EMOJI[m]).join('')).join('\n');
    e.target.disabled = true;
    await sendChat(`RAD Wordle ${id} ${won() ? guesses.length : 'X'}/${ROWS}\n${grid}`);
    close();
  });

  paint();
}
