import { CelebrationsCard } from '../components/people/CelebrationsCard';
import { WeekPlanner } from '../components/people/WeekPlanner';
import { PageHeader } from '../components/PageHeader';

/** Overzicht van collega's: wie waar werkt en wat er te vieren valt. */
export function PeoplePage() {
  return (
    <>
      <PageHeader title="People" />
      <div className="page wide people-page">
        <WeekPlanner />
        <CelebrationsCard />
      </div>
    </>
  );
}
