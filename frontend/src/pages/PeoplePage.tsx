import { CelebrationsCard } from '../components/people/CelebrationsCard';
import { CoffeeCard } from '../components/people/CoffeeCard';
import { WeekPlanner } from '../components/people/WeekPlanner';
import { PageHeader } from '../components/PageHeader';

/** Overzicht van collega's: wie waar werkt en wat er te vieren valt. */
export function PeoplePage() {
  return (
    <>
      <PageHeader title="People" />
      <div className="page wide people-page">
        <WeekPlanner />
        <div className="people-side">
          <CelebrationsCard />
          <CoffeeCard />
        </div>
      </div>
    </>
  );
}
