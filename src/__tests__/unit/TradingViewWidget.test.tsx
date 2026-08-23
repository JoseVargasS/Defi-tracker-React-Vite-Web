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
    const { container } = render(<TradingViewWidget symbol="ETHUSDT" />);
    const outerDiv = container.querySelector('.tradingview-widget-container');
    expect(outerDiv).toBeTruthy();
    const widgetDiv = container.querySelector('.tradingview-widget-container__widget');
    expect(widgetDiv).toBeTruthy();
  });

  it('renders copyright footer', () => {
    const { container } = render(<TradingViewWidget symbol="ETHUSDT" />);
    const copyright = container.querySelector('.tradingview-widget-copyright');
    expect(copyright).toBeTruthy();
  });

  it('creates a script element with correct src', () => {
    render(<TradingViewWidget symbol="ETHUSDT" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com/external-embedding'),
    );
    expect(tvScript).toBeTruthy();
    expect(tvScript!.async).toBe(true);
    expect(tvScript!.type).toBe('text/javascript');
  });

  it('config uses the symbol prop', () => {
    const { rerender } = render(<TradingViewWidget symbol="ETHUSDT" />);
    const getTvConfig = () => {
      const scripts = document.querySelectorAll('script');
      const tvScript = Array.from(scripts).find((s) =>
        s.src.includes('s3.tradingview.com'),
      );
      return JSON.parse(tvScript!.innerHTML);
    };
    expect(getTvConfig().symbol).toBe('BINANCE:ETHUSDT');

    rerender(<TradingViewWidget symbol="BTCUSDT" />);
    expect(getTvConfig().symbol).toBe('BINANCE:BTCUSDT');
  });

  it('config has interval 30', () => {
    render(<TradingViewWidget symbol="ETHUSDT" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.interval).toBe('30');
  });

  it('config removes compareSymbols', () => {
    render(<TradingViewWidget symbol="ETHUSDT" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.compareSymbols).toEqual([]);
  });

  it('config has SMA, Divergence, and Net Volume studies', () => {
    render(<TradingViewWidget symbol="ETHUSDT" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.studies).toEqual([
      'STD;SMA',
      'STD;Divergence%1Indicator',
      'STD;Net%1Volume',
    ]);
  });

  it('config has details disabled and side toolbar hidden', () => {
    render(<TradingViewWidget symbol="ETHUSDT" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.details).toBe(false);
    expect(config.hide_side_toolbar).toBe(true);
    expect(config.support_host).toBe('https://www.tradingview.com');
  });

  it('cleans up script on unmount', () => {
    const { unmount } = render(<TradingViewWidget symbol="ETHUSDT" />);
    expect(document.querySelectorAll('script').length).toBeGreaterThan(0);
    unmount();
    expect(document.querySelectorAll('script').length).toBe(0);
  });
});
