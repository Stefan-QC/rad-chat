import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { GamePreview } from '../features/games/GamePreview';
import { Leaderboards } from '../features/games/Leaderboards';
import { PersonalStats, useMyStats } from '../features/games/PersonalStats';
import { GAMES } from '../features/games/types';

/** Overzicht van alle games met je highscore per game, daaronder de klassementen en je statistieken. */
export function GamesPage() {
  const navigate = useNavigate();
  const { stats } = useMyStats();
  return (
    <>
      <PageHeader title="Games" prefix={<Icon name="grid" size={20} />} topic="Play, score and climb the leaderboards" />
      <div className="page wide gm-page">
        <div className="gm-cards">
          {GAMES.map(game => {
            const best = stats?.games[game.id]?.best;
            return (
              <article className="gm-card" key={game.id}>
                <GamePreview game={game.id} />
                <div className="gm-card-body">
                  <h2>{game.name}</h2>
                  <p>{game.description}</p>
                  <div className="gm-card-foot">
                    <span className="gm-best" title="Your highscore"><small>Your highscore</small><b>{best === null || best === undefined ? '–' : best.toLocaleString('en-US')}</b></span>
                    <button className="btn" onClick={() => navigate(game.route)}>Play</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="gm-lower">
          <div className="card"><h3>Leaderboards</h3><Leaderboards /></div>
          <div className="card"><h3>Your statistics</h3><PersonalStats /></div>
        </div>
      </div>
    </>
  );
}
