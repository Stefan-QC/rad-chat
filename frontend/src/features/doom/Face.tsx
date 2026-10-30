import { useEffect, useRef } from 'react';

const SIZE = 28;

/** Het gezicht in de statusbalk, getekend met een paar vlakken: het ziet er steeds beroerder uit naarmate de gezondheid daalt. */
export function Face({ health, hurt }: { health: number; hurt: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const damaged = health < 70;
    const bad = health < 35;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = bad ? '#b98660' : '#d9a27a'; ctx.fillRect(4, 2, 20, 24);
    ctx.fillStyle = '#4a2f1b'; ctx.fillRect(4, 2, 20, 6);
    ctx.fillStyle = hurt ? '#ff3b3b' : '#1b1b1b';
    ctx.fillRect(8, 11, 4, 3); ctx.fillRect(16, 11, 4, 3);
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(7, 9, 6, 1); ctx.fillRect(15, 9, 6, hurt ? 2 : 1);
    ctx.fillStyle = health <= 0 ? '#1b1b1b' : '#7a2a1c';
    if (bad || hurt) ctx.fillRect(10, 20, 8, 2); else if (damaged) ctx.fillRect(10, 20, 8, 1); else { ctx.fillRect(10, 19, 8, 1); ctx.fillRect(9, 18, 1, 1); ctx.fillRect(18, 18, 1, 1); }
    if (damaged) { ctx.fillStyle = '#a31515'; ctx.fillRect(18, 4, 2, 7); }
    if (bad) { ctx.fillRect(6, 14, 2, 6); ctx.fillRect(14, 22, 3, 3); }
  }, [health, hurt]);
  return <canvas ref={canvas} className="dm-face" width={SIZE} height={SIZE} role="img" aria-label={`Face, health ${health} percent`} />;
}
