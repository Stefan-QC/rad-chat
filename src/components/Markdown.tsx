import { useMemo, type ReactNode } from 'react';
import { MarkdownParser, type Block, type Inline } from '../core/markdown';

const parser = new MarkdownParser();

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text': return node.value;
      case 'strong': return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em': return <em key={index}>{renderInline(node.children)}</em>;
      case 'code': return <code key={index}>{node.value}</code>;
      case 'link': return <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">{renderInline(node.children)}</a>;
    }
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = (`h${block.level + 1}`) as 'h2' | 'h3' | 'h4';
      return <Tag key={index}>{renderInline(block.children)}</Tag>;
    }
    case 'paragraph': return <p key={index}>{renderInline(block.children)}</p>;
    case 'code': return <pre key={index}><code>{block.value}</code></pre>;
    case 'quote': return <blockquote key={index}>{renderInline(block.children)}</blockquote>;
    case 'rule': return <hr key={index} />;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return <Tag key={index}>{block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</Tag>;
    }
  }
}

/** Toont markdown als gewone React-elementen; er wordt geen ruwe HTML uitgevoerd. */
export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parser.parse(source), [source]);
  return <div className="markdown">{blocks.map(renderBlock)}</div>;
}
