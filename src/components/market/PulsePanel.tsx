import { useEffect, useState } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { fetchCandles } from '@/api/market';
import { toCandleList } from '@/lib/chart/rsi';
import { analyzePulse, PULSE_MA_TFS, type PulseAnalysis } from '@/lib/chart/analysis';

export function PulsePanel({ onClose }: { onClose: () => void }) {
  const currentPair = useMarketStore((s) => s.currentPair);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const [pulse, setPulse] = useState<PulseAnalysis | null | 'loading'>('loading');

  useEffect(() => {
    if (!currentPair) {
      setPulse(null);
      return;
    }
    let cancelled = false;
    setPulse('loading');
    (async () => {
      const [chartRows, ...tfRows] = await Promise.all([
        fetchCandles(currentPair, currentInterval, 300),
        ...PULSE_MA_TFS.filter((tf) => tf !== currentInterval).map((tf) => fetchCandles(currentPair!, tf, 260)),
      ]);
      if (cancelled) return;
      const candles = toCandleList(chartRows);
      const closesByTf = new Map<string, number[]>();
      PULSE_MA_TFS.filter((tf) => tf !== currentInterval).forEach((tf, i) => {
        closesByTf.set(tf, toCandleList(tfRows[i] ?? []).map((c) => c.close));
      });
      closesByTf.set(currentInterval, candles.map((c) => c.close));
      setPulse(analyzePulse(candles, currentInterval, closesByTf));
    })().catch(() => {
      if (!cancelled) setPulse(null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPair, currentInterval]);

  const biasClass = pulse != null && pulse !== 'loading'
    ? pulse.bias === 'BULLISH' ? 'positive' : pulse.bias === 'BEARISH' ? 'negative' : ''
    : '';

  return (
    <div className="ma-modal-overlay">
      <div className="ma-modal pulse-modal" role="dialog" aria-label="Pulso del momento">
        <div className="ma-modal-header">
          <span>Pulso</span>
          <button type="button" className="ma-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ma-modal-body">
          {pulse === 'loading' && <p>Calculando pulso…</p>}
          {pulse === null && <p>Sin datos suficientes para el pulso.</p>}
          {pulse != null && pulse !== 'loading' && (
            <>
              <p className={`pulse-headline ${biasClass}`}>{pulse.headline}</p>
              <p className="pulse-score">Score {pulse.score}/5{pulse.contraTrend ? ' · contratendencia' : ''}</p>
              <ul className="pulse-items">
                {pulse.items.map((item) => (
                  <li key={item.id} className={item.hit ? (item.bullish == null ? '' : item.bullish ? 'positive' : 'negative') : 'pulse-miss'}>
                    {item.hit ? '●' : '○'} {item.label}
                    {item.detail && <span className="pulse-detail"> · {item.detail}</span>}
                  </li>
                ))}
              </ul>
              <p className="pulse-note">No es recomendación de inversión.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
