import { describe, expect, it } from 'vitest';
import { MarkdownParser, type Block, type Inline } from './markdown';

const parser = new MarkdownParser();
const inlineText = (nodes: Inline[]): string => nodes.map(n => ('value' in n ? n.value : inlineText(n.children))).join('');

describe('MarkdownParser.parse', () => {
  it('reads headings of three levels', () => {
    const blocks = parser.parse('# Een\n## Twee\n### Drie\n#### Vier');
    expect(blocks.slice(0, 3).map(b => (b as Extract<Block, { type: 'heading' }>).level)).toEqual([1, 2, 3]);
    expect(blocks[3].type).toBe('paragraph');
  });

  it('groups lines into bullet and numbered lists', () => {
    const [bullets, numbers] = parser.parse('- a\n- b\n\n1. een\n2. twee') as Extract<Block, { type: 'list' }>[];
    expect(bullets.ordered).toBe(false);
    expect(bullets.items).toHaveLength(2);
    expect(numbers.ordered).toBe(true);
    expect(inlineText(numbers.items[1])).toBe('twee');
  });

  it('keeps code blocks verbatim, including markdown characters', () => {
    const [block] = parser.parse('```\n# geen kop\n**niet vet**\n```');
    expect(block).toEqual({ type: 'code', value: '# geen kop\n**niet vet**' });
  });

  it('turns quotes and rules into their own blocks', () => {
    const blocks = parser.parse('> citaat\n\n---');
    expect(blocks.map(b => b.type)).toEqual(['quote', 'rule']);
  });

  it('joins the lines of a paragraph and ignores blank input', () => {
    expect(parser.parse('regel een\nregel twee')).toHaveLength(1);
    expect(parser.parse('\n\n  \n')).toEqual([]);
  });

  it('never produces raw HTML: tags stay plain text', () => {
    const [paragraph] = parser.parse('<script>alert(1)</script><img src=x onerror=alert(1)>') as Extract<Block, { type: 'paragraph' }>[];
    expect(paragraph.children.every(n => n.type === 'text')).toBe(true);
    expect(inlineText(paragraph.children)).toContain('<script>');
  });
});

describe('MarkdownParser.inline', () => {
  it('parses bold, italic and code', () => {
    const nodes = parser.inline('een **vet** en *schuin* en `code`');
    expect(nodes.map(n => n.type)).toEqual(['text', 'strong', 'text', 'em', 'text', 'code']);
  });

  it('allows http, https and mailto links', () => {
    for (const href of ['https://example.com', 'http://example.com', 'mailto:iemand@example.com']) {
      const [link] = parser.inline(`[tekst](${href})`);
      expect(link).toMatchObject({ type: 'link', href });
    }
  });

  it('refuses javascript:, data: and other dangerous link targets', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', 'file:///etc/passwd']) {
      const nodes = parser.inline(`[klik](${href})`);
      expect(nodes.some(n => n.type === 'link')).toBe(false);
    }
  });

  it('links bare urls', () => {
    const nodes = parser.inline('zie https://qualogy.com voor meer');
    expect(nodes.find(n => n.type === 'link')).toMatchObject({ href: 'https://qualogy.com' });
  });

  it('handles empty and unmatched markers without throwing', () => {
    expect(() => parser.inline('**niet afgesloten en `ook niet')).not.toThrow();
    expect(parser.inline('')).toEqual([]);
  });
});
