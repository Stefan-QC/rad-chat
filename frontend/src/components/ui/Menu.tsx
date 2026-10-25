import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
}

interface MenuProps {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  className?: string;
  align?: 'left' | 'right';
}

/** Kleine uitklapmenu-knop: sluit bij Esc of een klik ernaast en werkt met pijltjestoetsen. */
export function Menu({ label, trigger, items, className = '', align = 'left' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const choose = (item: MenuItem) => {
    setOpen(false);
    item.onSelect();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => (i + 1) % items.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => (i - 1 + items.length) % items.length); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(items[index]); }
  };

  return (
    <span className={`menu ${className}`} ref={root} onKeyDown={onKeyDown}>
      <button type="button" className="menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { setIndex(0); setOpen(o => !o); }}>
        {trigger}
      </button>
      {open && (
        <ul className={`menu-list ${align}`} role="menu" aria-label={label}>
          {items.map((item, position) => (
            <li key={item.label} role="none">
              <button role="menuitem" type="button" className={`${item.danger ? 'danger' : ''}${position === index ? ' on' : ''}`} onMouseEnter={() => setIndex(position)} onClick={() => choose(item)}>
                <span className="menu-check">{item.checked ? '✓' : ''}</span>{item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
