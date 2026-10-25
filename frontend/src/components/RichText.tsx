import type { ReactNode } from 'react';

const TOKEN = /(https?:\/\/[^\s<]+)|(@[^\s@,;:!?()]{1,32})|(`[^`\n]+`)/g;

/** Maakt van platte tekst links, @vermeldingen en `code`, zonder ooit HTML te injecteren. */
export function RichText({ text, me }: { text: string; me: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [full, link, mention] = match;
    if (link) {
      nodes.push(<a key={key++} href={link} target="_blank" rel="noopener noreferrer">{link}</a>);
    } else if (mention) {
      const mine = mention.slice(1).toLowerCase() === me.toLowerCase();
      nodes.push(<span key={key++} className={`mention${mine ? ' me' : ''}`}>{mention}</span>);
    } else {
      nodes.push(<code key={key++}>{full.slice(1, -1)}</code>);
    }
    last = index + full.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
