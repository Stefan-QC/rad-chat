import { useEffect, useRef } from 'react';
import type { PieceType } from './pieces';
import { drawPiecePreview } from './TetrisRenderer';

const WIDTH = 120;
const HEIGHT = 84;

/** Klein canvas met één blok, voor "Hold" en "Next". */
export function PiecePreview({ type, label }: { type: PieceType | null; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawPiecePreview(ctx, type, WIDTH, HEIGHT);
  }, [type]);
  return <canvas ref={canvas} className="tt-preview" width={WIDTH} height={HEIGHT} role="img" aria-label={`${label}: ${type ?? 'empty'}`} />;
}
