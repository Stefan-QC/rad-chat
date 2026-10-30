import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { DoomView } from '../features/doom/DoomView';

/** DOOM: een eigen retro first-person shooter met raycasting, drie levels en een score die de server vastlegt. */
export function DoomPage() {
  return (
    <>
      <PageHeader title="DOOM" prefix={<Icon name="target" size={20} />} topic="Three levels. Survive." />
      <DoomView />
    </>
  );
}
