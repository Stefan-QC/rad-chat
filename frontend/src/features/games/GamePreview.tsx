import type { GameId } from './types';

const TETRIS_ROWS = [
  '..........',
  '..........',
  '....T.....',
  '...TTT....',
  '..........',
  '..........',
  '.......O..',
  '.......OO.',
  'I.......O.',
  'I.........',
  'I....SS...',
  'I...SSZZ..',
  'LL..J..ZZL',
  'L..JJJ..LL',
  'LLZ.JOOSSL',
  'ZZZOOOOSSI',
];
const TETRIS_COLORS: Record<string, string> = { I: '#2dd4e0', O: '#f7d117', T: '#a855f7', S: '#34c759', Z: '#ef4444', J: '#3b82f6', L: '#f59e0b' };

function TetrisPreview() {
  return (
    <svg viewBox="0 0 100 160" role="img" aria-label="Tetris preview" shapeRendering="crispEdges">
      <rect width="100" height="160" fill="#0f1020" />
      {TETRIS_ROWS.flatMap((row, y) => [...row].map((cell, x) => (
        cell === '.' ? null : <rect key={`${x}-${y}`} x={x * 10 + 0.5} y={y * 10 + 0.5} width="9" height="9" rx="1" fill={TETRIS_COLORS[cell]} />
      )))}
      <g stroke="#ffffff10">{Array.from({ length: 9 }, (_, i) => <line key={i} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="160" />)}</g>
    </svg>
  );
}

function DoomPreview() {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="DOOM preview" shapeRendering="crispEdges">
      <rect width="160" height="50" fill="#1a0d0d" />
      <rect y="50" width="160" height="50" fill="#2b2118" />
      <polygon points="0,0 52,26 52,74 0,100" fill="#5a2a22" />
      <polygon points="160,0 108,26 108,74 160,100" fill="#4a2420" />
      <rect x="52" y="26" width="56" height="48" fill="#3a1d18" />
      <g fill="#00000040">{[0, 1, 2, 3, 4].map(i => <rect key={i} x="52" y={30 + i * 9} width="56" height="1" />)}</g>
      <rect x="58" y="62" width="44" height="10" fill="#1d130e" />
      <g>
        <rect x="72" y="36" width="16" height="30" fill="#8a3a22" />
        <rect x="70" y="40" width="4" height="14" fill="#6e2d1a" />
        <rect x="86" y="40" width="4" height="14" fill="#6e2d1a" />
        <rect x="74" y="30" width="12" height="10" fill="#a04a2c" />
        <rect x="74" y="28" width="3" height="4" fill="#e7d3a0" />
        <rect x="83" y="28" width="3" height="4" fill="#e7d3a0" />
        <rect x="76" y="34" width="3" height="2" fill="#ffdd33" />
        <rect x="81" y="34" width="3" height="2" fill="#ffdd33" />
      </g>
      <polygon points="64,100 80,76 96,100" fill="#444" />
      <rect x="76" y="80" width="8" height="20" fill="#777" />
      <rect x="78" y="76" width="4" height="6" fill="#ffd34d" />
      <rect y="92" width="160" height="8" fill="#3b3b3b" />
      <text x="6" y="98" fontFamily="monospace" fontSize="6" fill="#d33" fontWeight="700">HP 100  AMMO 50</text>
    </svg>
  );
}

function TypeRacePreview() {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="TypeRace preview" shapeRendering="crispEdges">
      <rect width="160" height="100" fill="#fff5f5" />
      {[['#D71920', 118], ['#9aa0a6', 84], ['#9aa0a6', 52]].map(([color, width], i) => (
        <g key={i}>
          <rect x="10" y={10 + i * 13} width="140" height="6" rx="3" fill="#f1dede" />
          <rect x="10" y={10 + i * 13} width={Number(width)} height="6" rx="3" fill={String(color)} />
          <circle cx={10 + Number(width)} cy={13 + i * 13} r="5" fill={String(color)} stroke="#fff" strokeWidth="1.5" />
        </g>
      ))}
      <text x="10" y="66" fontFamily="monospace" fontSize="11" fill="#1b1b1b">the quick brown</text>
      <text x="10" y="82" fontFamily="monospace" fontSize="11" fill="#b5a9aa">fox jumps over</text>
      <rect x="62" y="56" width="1.6" height="13" fill="#e0a100" />
    </svg>
  );
}

/** Een kleine, zelfgetekende voorvertoning per game voor de kaarten op de gamespagina. */
export function GamePreview({ game }: { game: GameId }) {
  return <div className={`gm-preview ${game}`}>{game === 'tetris' ? <TetrisPreview /> : game === 'doom' ? <DoomPreview /> : <TypeRacePreview />}</div>;
}
