import { useEffect, useRef } from 'react';

interface TradingViewWidgetProps {
  symbol: string | null;
  interval: string;
}

const TV_INTERVAL_MAP: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '8h': '480', '12h': '720',
  '1d': 'D', '3d': '3D', '1w': 'W', '1M': 'M', '3M': '3M',
};

export default function TradingViewWidget({ symbol, interval }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `BINANCE:${symbol}`,
      interval: TV_INTERVAL_MAP[interval] || 'D',
      timezone: 'America/Lima',
      theme: 'dark',
      backgroundColor: '#100e0c',
      gridColor: 'rgba(242, 242, 242, 0.06)',
      style: '1',
      locale: 'es',
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      allow_symbol_change: true,
      save_image: false,
      withdateranges: false,
      calendar: false,
      hotlist: false,
      details: false,
      watchlist: [],
      studies: [
        'STD;SMA',
        'STD;EMA',
        'STD;Stochastic_RSI',
        'STD;Bollinger_Bands',
        'Volume@tv-basicstudies',
      ],
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
    // ponytail: remount via key prop, not deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!symbol) return null;

  return (
    <div className="tradingview-widget-container" ref={containerRef} style={{ height: '100%', width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
    </div>
  );
}
