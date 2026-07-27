import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import TradingViewWidget from '@/components/market/TradingViewWidget';

describe('TradingViewWidget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders container divs', () => {
    const { container } = render(<TradingViewWidget />);
    const outerDiv = container.querySelector('.tradingview-widget-container');
    expect(outerDiv).toBeTruthy();
    const widgetDiv = container.querySelector('.tradingview-widget-container__widget');
    expect(widgetDiv).toBeTruthy();
  });

  it('renders copyright footer', () => {
    const { container } = render(<TradingViewWidget />);
    const copyright = container.querySelector('.tradingview-widget-copyright');
    expect(copyright).toBeTruthy();
  });

  it('creates a script element with correct src', () => {
    render(<TradingViewWidget />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com/external-embedding'),
    );
    expect(tvScript).toBeTruthy();
    expect(tvScript!.async).toBe(true);
    expect(tvScript!.type).toBe('text/javascript');
  });

  it('config has ETHUSDT symbol', () => {
    render(<TradingViewWidget />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.symbol).toBe('BINANCE:ETHUSDT');
  });

  it('config has interval 240', () => {
    render(<TradingViewWidget />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.interval).toBe('240');
  });

  it('config removes compareSymbols', () => {
    render(<TradingViewWidget />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.compareSymbols).toEqual([]);
  });

  it('config has SMA, Divergence, and Stochastic RSI studies', () => {
    render(<TradingViewWidget />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.studies).toEqual([
      'STD;SMA',
      'STD;Divergence%1Indicator',
      'STD;Stochastic_RSI',
    ]);
  });

  it('config has details enabled', () => {
    render(<TradingViewWidget />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.details).toBe(true);
  });

  it('cleans up script on unmount', () => {
    const { unmount } = render(<TradingViewWidget />);
    expect(document.querySelectorAll('script').length).toBeGreaterThan(0);
    unmount();
    expect(document.querySelectorAll('script').length).toBe(0);
  });
});
