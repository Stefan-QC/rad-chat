// Message feed rendering: day dividers, grouped messages, system lines.
import { avatar, dayKey, fmtDay, fmtTime, richText } from './utils.js';

const box = document.getElementById('messages');
let lastDay = null, lastGrp = null; // lastGrp: { name, ts, body }

export const atBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 80;
export const toBottom = () => { box.scrollTop = box.scrollHeight; };

export function resetFeed() {
  lastDay = lastGrp = null;
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = '<div class="big">#</div><h3>Welcome to #general</h3><p>This is the start of the channel. Say hi!</p>';
  box.replaceChildren(w);
}

export function render(msg, me) {
  if (dayKey(msg.ts) !== lastDay) {
    lastDay = dayKey(msg.ts); lastGrp = null;
    const d = document.createElement('div');
    d.className = 'day'; d.textContent = fmtDay(msg.ts);
    box.append(d);
  }
  if (msg.type === 'system') {
    lastGrp = null;
    const el = document.createElement('div');
    el.className = 'sys';
    el.innerHTML = '<svg><use href="#i-arrow"/></svg>';
    const t = document.createElement('span'); t.textContent = msg.text;
    const time = document.createElement('time'); time.textContent = fmtTime(msg.ts);
    el.append(t, time);
    box.append(el);
    return;
  }
  const line = document.createElement('div');
  line.className = 'line';
  const lt = document.createElement('time'); lt.textContent = fmtTime(msg.ts);
  line.append(lt, richText(msg.text, me));

  if (lastGrp && lastGrp.name === msg.name && msg.ts - lastGrp.ts < 5 * 60_000) {
    lastGrp.body.append(line);
    lastGrp.ts = msg.ts;
    return;
  }
  const grp = document.createElement('div');
  grp.className = 'grp';
  const body = document.createElement('div');
  body.className = 'body';
  const meta = document.createElement('div');
  meta.className = 'meta';
  const who = document.createElement('b');
  who.textContent = msg.name;
  if (msg.name === me) who.style.color = 'var(--red)';
  const time = document.createElement('time'); time.textContent = fmtTime(msg.ts);
  meta.append(who, time);
  body.append(meta, line);
  grp.append(avatar(msg.name), body);
  box.append(grp);
  lastGrp = { name: msg.name, ts: msg.ts, body };
}
