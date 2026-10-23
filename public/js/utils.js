// Pure helpers: avatar colours, time/date formatting, safe rich text.
const PALETTE = ['#D71920', '#822727', '#1b1b1b', '#E53E3E', '#63171B', '#4a4a4a', '#9B2C2C', '#F56565'];

export const colorFor = n => { let h = 0; for (const c of n) h = (h * 31 + c.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
export const initial = n => [...n][0] || '?';
export const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dayKey = ts => new Date(ts).toDateString();

export function fmtDay(ts) {
  const d = new Date(ts), t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Today';
  t.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

export function avatar(n, small) {
  const a = document.createElement('div');
  a.className = 'av' + (small ? ' sm' : '');
  a.style.backgroundColor = colorFor(n);
  a.textContent = initial(n);
  return a;
}

// Links, @mentions and `code`; everything is inserted as text nodes (no innerHTML).
const TOKEN = /(https?:\/\/[^\s<]+)|(@[^\s@,;:!?()]{1,32})|(`[^`\n]+`)/g;
export function richText(text, me) {
  const frag = document.createDocumentFragment();
  let last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    if (m[1]) {
      const a = document.createElement('a');
      a.href = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = m[1];
      frag.append(a);
    } else if (m[2]) {
      const s = document.createElement('span');
      s.className = 'mention' + (m[2].slice(1).toLowerCase() === me.toLowerCase() ? ' me' : '');
      s.textContent = m[2];
      frag.append(s);
    } else {
      const c = document.createElement('code');
      c.textContent = m[3].slice(1, -1);
      frag.append(c);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
