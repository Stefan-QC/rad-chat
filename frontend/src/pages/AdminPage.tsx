import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { AuditTab } from '../components/admin/AuditTab';
import { DataTab } from '../components/admin/DataTab';
import { SessionsTab } from '../components/admin/SessionsTab';
import { UsersTab } from '../components/admin/UsersTab';
import { PageHeader } from '../components/PageHeader';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'audit', label: 'Audit log' },
  { id: 'data', label: 'Data and tasks' },
  { id: 'sessions', label: 'Sessions' },
] as const;

type Tab = (typeof TABS)[number]['id'];

/** Beheerpagina: gebruikers, audit log, bewaartermijn en export, en recente sessies. */
export function AdminPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  if (me?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title="Admin" />
      <div className="page wide">
        <div className="tabs" role="tablist">
          {TABS.map(item => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'on' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </div>
        {tab === 'users' && <UsersTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'sessions' && <SessionsTab />}
      </div>
    </>
  );
}
