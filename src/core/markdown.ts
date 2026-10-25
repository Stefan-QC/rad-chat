export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'quote'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'rule' };

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

/** Zet een veilige subset van markdown om in een boom van blokken; er wordt nooit HTML doorgelaten. */
export class MarkdownParser {
  parse(source: string): Block[] {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (line.trim() === '') { index++; continue; }
      if (line.startsWith('```')) {
        const code: string[] = [];
        index++;
        while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
        index++;
        blocks.push({ type: 'code', value: code.join('\n') });
        continue;
      }
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) { blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, children: this.inline(heading[2]) }); index++; continue; }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) { blocks.push({ type: 'rule' }); index++; continue; }
      if (line.startsWith('>')) {
        const quote: string[] = [];
        while (index < lines.length && lines[index].startsWith('>')) quote.push(lines[index++].replace(/^>\s?/, ''));
        blocks.push({ type: 'quote', children: this.inline(quote.join(' ')) });
        continue;
      }
      const bullet = /^\s*[-*]\s+/;
      const numbered = /^\s*\d+[.)]\s+/;
      if (bullet.test(line) || numbered.test(line)) {
        const ordered = numbered.test(line);
        const items: Inline[][] = [];
        while (index < lines.length && (ordered ? numbered : bullet).test(lines[index])) items.push(this.inline(lines[index++].replace(ordered ? numbered : bullet, '')));
        blocks.push({ type: 'list', ordered, items });
        continue;
      }
      const paragraph: string[] = [];
      while (index < lines.length && lines[index].trim() !== '' && !/^(#{1,3}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[index])) paragraph.push(lines[index++]);
      blocks.push({ type: 'paragraph', children: this.inline(paragraph.join(' ')) });
    }
    return blocks;
  }

  inline(text: string): Inline[] {
    const out: Inline[] = [];
    const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<]+)/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      const at = match.index ?? 0;
      if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
      const [token] = match;
      if (match[1]) out.push({ type: 'code', value: token.slice(1, -1) });
      else if (match[2]) out.push({ type: 'strong', children: this.inline(token.slice(2, -2)) });
      else if (match[3]) out.push({ type: 'em', children: this.inline(token.slice(1, -1)) });
      else if (match[4]) {
        const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
        if (SAFE_LINK.test(parts[2])) out.push({ type: 'link', href: parts[2], children: this.inline(parts[1]) });
        else out.push({ type: 'text', value: token });
      } else out.push({ type: 'link', href: token, children: [{ type: 'text', value: token }] });
      last = at + token.length;
    }
    if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
    return out;
  }
}
