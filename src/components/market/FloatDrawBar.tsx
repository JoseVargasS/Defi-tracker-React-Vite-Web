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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 3l14 7-6 2-2 6z" />
      </svg>
    ),
  },
  {
    tool: 'FIBO',
    title: 'Fibonacci',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 20L20 4" />
        <line x1="4" y1="16" x2="12" y2="16" />
        <line x1="4" y1="12" x2="14" y2="12" />
        <line x1="4" y1="8" x2="12" y2="8" />
      </svg>
    ),
  },
  {
    tool: 'SEGMENT',
    title: 'Segmento',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="4" y1="20" x2="20" y2="4" />
        <circle cx="4" cy="20" r="1.6" fill="currentColor" />
        <circle cx="20" cy="4" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    tool: 'LINE',
    title: 'Línea',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="2" y1="22" x2="22" y2="2" />
      </svg>
    ),
  },
  {
    tool: 'RAY',
    title: 'Rayo',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="4" y1="20" x2="18" y2="6" />
        <polyline points="13,6 18,6 18,11" />
      </svg>
    ),
  },
  {
    tool: 'ARROW',
    title: 'Flecha',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="4" y1="20" x2="17" y2="7" />
        <path d="M17 7l-5 1M17 7l-1 5" />
      </svg>
    ),
  },
  {
    tool: 'H_SEGMENT',
    title: 'Segmento H',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12" />
        <circle cx="5" cy="12" r="1.6" fill="currentColor" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    tool: 'H_LINE',
    title: 'Línea H',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12" />
        <path d="M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
      </svg>
    ),
  },
  {
    tool: 'H_RAY',
    title: 'Recta H',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <line x1="4" y1="12" x2="20" y2="12" />
        <polyline points="16,8 20,12 16,16" />
      </svg>
    ),
  },
  {
    tool: 'RECT',
    title: 'Rectángulo',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" />
      </svg>
    ),
  },
  {
    tool: 'CIRCLE',
    title: 'Círculo',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="8" ry="6" />
      </svg>
    ),
  },
  {
    tool: 'TRIANGLE',
    title: 'Triángulo',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 5l8 14H4z" />
      </svg>
    ),
  },
  {
    tool: 'PRICE_LINE',
    title: 'Línea de precio',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12" />
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </div>
  );
}
