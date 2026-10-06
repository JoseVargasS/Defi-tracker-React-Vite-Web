import type { ReactNode } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { loadDrawOverlays, loadFibOverlays, saveDrawOverlays, saveFibOverlays } from '@/lib/chart/overlays';
import type { DrawTool } from '@/lib/chart/types';

interface ToolDef {
  tool: DrawTool;
  title: string;
  glyph: ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    tool: null,
    title: 'Cursor',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 3l14 7-6 2-2 6z" />
      </svg>
    ),
  },
  {
    tool: 'FIBO',
    title: 'Fibonacci',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 20L14 4" />
        <line x1="7" y1="15" x2="17" y2="15" />
        <line x1="9" y1="11" x2="15" y2="11" />
      </svg>
    ),
  },
  {
    tool: 'SEGMENT',
    title: 'Segmento',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="4" y1="20" x2="20" y2="4" />
        <circle cx="4" cy="20" r="1.6" fill="currentColor" />
        <circle cx="20" cy="4" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    tool: 'LINE',
    title: 'Recta',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="2" y1="22" x2="22" y2="2" />
      </svg>
    ),
  },
  {
    tool: 'H_LINE',
    title: 'Horizontal',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12" />
        <path d="M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
      </svg>
    ),
  },
  {
    tool: 'RECT',
    title: 'Rectángulo',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" />
      </svg>
    ),
  },
];

export function FloatDrawBar() {
  const drawTool = useMarketStore((s) => s.chartIndicators.drawTool);
  const setDrawTool = useMarketStore((s) => s.setDrawTool);
  const bumpOverlays = useMarketStore((s) => s.bumpOverlays);
  const currentPair = useMarketStore((s) => s.currentPair);

  const clearAll = () => {
    if (!currentPair) return;
    if (loadFibOverlays(currentPair).length) saveFibOverlays(currentPair, []);
    if (loadDrawOverlays(currentPair).length) saveDrawOverlays(currentPair, []);
    bumpOverlays();
  };

  return (
    <div className="float-draw-bar" role="toolbar" aria-label="Herramientas de dibujo">
      {TOOLS.map((t) => (
        <button
          key={String(t.tool)}
          type="button"
          title={t.title}
          aria-label={t.title}
          aria-pressed={drawTool === t.tool}
          className={`float-draw-btn${drawTool === t.tool ? ' active' : ''}`}
          onClick={() => setDrawTool(drawTool === t.tool ? null : t.tool)}
        >
          {t.glyph}
        </button>
      ))}
      <button
        type="button"
        title="Borrar dibujos del par"
        aria-label="Borrar dibujos del par"
        className="float-draw-btn danger"
        onClick={clearAll}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </div>
  );
}
