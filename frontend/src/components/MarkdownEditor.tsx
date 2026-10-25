import { useState } from 'react';
import { Markdown } from './Markdown';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
}

/** Tekstveld met een tabblad om de opmaak te bekijken voordat je opslaat. */
export function MarkdownEditor({ value, onChange, maxLength = 20000, rows = 12, placeholder }: MarkdownEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  return (
    <div className="md-editor">
      <div className="md-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'write'} className={mode === 'write' ? 'on' : ''} onClick={() => setMode('write')}>Write</button>
        <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Preview</button>
        <small>Markdown: # heading, **bold**, *italic*, - list, [link](https://…)</small>
      </div>
      {mode === 'write'
        ? <textarea className="text-input" value={value} rows={rows} maxLength={maxLength} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
        : <div className="md-preview">{value.trim() ? <Markdown source={value} /> : <p className="muted">Nothing to preview yet.</p>}</div>}
    </div>
  );
}
