import { useMemo, useState } from 'react';
import type { Profile } from '../../core/types';
import { Avatar } from '../Avatar';

interface PeoplePickerProps {
  people: Profile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
  placeholder?: string;
}

/** Doorzoekbare lijst met mensen waaruit je er één of meer kiest. */
export function PeoplePicker({ people, selected, onChange, single = false, placeholder = 'Search people…' }: PeoplePickerProps) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return people.filter(p => !text || p.display_name.toLowerCase().includes(text) || p.username.includes(text));
  }, [people, query]);

  const toggle = (id: string) => {
    if (single) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
  };

  return (
    <div className="people-picker">
      <input className="text-input" type="search" value={query} placeholder={placeholder} aria-label="Search people" onChange={event => setQuery(event.target.value)} />
      {selected.length > 0 && !single && (
        <div className="chips">
          {selected.map(id => {
            const person = people.find(p => p.id === id);
            return person && (
              <button key={id} className="chip removable" onClick={() => toggle(id)} aria-label={`Remove ${person.display_name}`}>
                {person.display_name} ✕
              </button>
            );
          })}
        </div>
      )}
      <ul className="picker-list" role="listbox" aria-multiselectable={!single}>
        {visible.map(person => (
          <li key={person.id}>
            <button role="option" aria-selected={selected.includes(person.id)} className={selected.includes(person.id) ? 'on' : ''} onClick={() => toggle(person.id)}>
              <Avatar name={person.display_name} color={person.avatar_color} size="sm" />
              <span><b>{person.display_name}</b><small>@{person.username}{person.job_title ? ` · ${person.job_title}` : ''}</small></span>
              <i className="check" aria-hidden="true">{selected.includes(person.id) ? '✓' : ''}</i>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="empty">No one found.</li>}
      </ul>
    </div>
  );
}
