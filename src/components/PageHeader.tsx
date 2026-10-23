import type { ReactNode } from 'react';
import { useWorkspace } from '../app/WorkspaceContext';
import { Icon } from './Icon';

interface PageHeaderProps {
  title: string;
  prefix?: ReactNode;
  topic?: string | null;
  actions?: ReactNode;
}

/** Kopbalk bovenaan elke pagina, met de menuknop voor kleine schermen. */
export function PageHeader({ title, prefix, topic, actions }: PageHeaderProps) {
  const { toggleDrawer } = useWorkspace();
  return (
    <header id="top">
      <button className="iconbtn" id="menuBtn" aria-label="Menu" onClick={event => { event.stopPropagation(); toggleDrawer(); }}>
        <Icon name="menu" />
      </button>
      {prefix}
      <h1>{title}</h1>
      {topic && <span className="topic">{topic}</span>}
      <span className="grow" />
      {actions}
    </header>
  );
}
