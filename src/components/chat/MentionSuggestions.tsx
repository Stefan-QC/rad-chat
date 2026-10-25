import type { Profile } from '../../core/types';
import { Avatar } from '../Avatar';

const TRIGGER = /(^|\s)@([A-Za-z0-9_.-]*)$/;

/** Zoekt de tekst vlak voor de cursor af en geeft de gedeeltelijke @naam en zijn beginpositie terug. */
export function findMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const match = TRIGGER.exec(text.slice(0, caret));
  if (!match) return null;
  return { query: match[2].toLowerCase(), start: caret - match[2].length - 1 };
}

export function matchPeople(people: Profile[], query: string, limit = 6): Profile[] {
  return people
    .filter(p => p.username.startsWith(query) || p.display_name.toLowerCase().includes(query))
    .slice(0, limit);
}

interface MentionSuggestionsProps {
  people: Profile[];
  activeIndex: number;
  onPick: (person: Profile) => void;
}

/** Lijstje boven het invoerveld met collega's die bij de getypte @naam passen. */
export function MentionSuggestions({ people, activeIndex, onPick }: MentionSuggestionsProps) {
  return (
    <ul className="mention-list" role="listbox" aria-label="Mention suggestions">
      {people.map((person, index) => (
        <li key={person.id} role="option" aria-selected={index === activeIndex}>
          <button type="button" className={index === activeIndex ? 'on' : ''} onMouseDown={event => { event.preventDefault(); onPick(person); }}>
            <Avatar name={person.display_name} color={person.avatar_color} size="xs" />
            <b>{person.display_name}</b>
            <small>@{person.username}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
