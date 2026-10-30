import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { TetrisGame } from '../features/tetris/TetrisGame';

/** Tetris: een klassiek puzzelspel met levels, hold, ghost piece en een score die de server vastlegt. */
export function TetrisPage() {
  return (
    <>
      <PageHeader title="Tetris" prefix={<Icon name="blocks" size={20} />} topic="Clear lines, level up" />
      <TetrisGame />
    </>
  );
}
