import { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
}

function TradingViewWidget({ symbol }: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(
    () => {
      const current = container.current;
      if (!current) return;

      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "allow_symbol_change": true,
          "calendar": false,
          "details": false,
          "hide_side_toolbar": false,
          "hide_top_toolbar": false,
          "hide_legend": false,
          "hide_volume": false,
          "hotlist": false,
          "interval": "30",
          "locale": "en",
          "save_image": true,
          "style": "1",
          "symbol": "BINANCE:${symbol}",
          "theme": "dark",
          "timezone": "America/Lima",
          "backgroundColor": "#0F0F0F",
          "gridColor": "rgba(242, 242, 242, 0.2)",
          "watchlist": [],
          "withdateranges": false,
          "compareSymbols": [],
          "support_host": "https://www.tradingview.com",
          "studies": [
            "STD;SMA",
            "STD;Divergence%1Indicator",
            "STD;Net%1Volume"
          ],
          "autosize": true
        }`;
      current.appendChild(script);
      return () => {
        current.querySelectorAll('iframe').forEach((f) => f.remove());
        const widgetDiv = current.querySelector('.tradingview-widget-container__widget');
        if (widgetDiv) widgetDiv.innerHTML = '';
        current.querySelectorAll('script').forEach((s) => s.remove());
      };
    },
    [symbol]
  );

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
      <div className="tradingview-widget-container__widget"></div>
      <div className="tradingview-widget-copyright"><a href={`https://www.tradingview.com/symbols/${symbol}/?exchange=BINANCE`} rel="noopener nofollow" target="_blank"><span className="blue-text">{symbol} price</span></a><span className="trademark"> by TradingView</span></div>
    </div>
  );
}

export default memo(TradingViewWidget);
