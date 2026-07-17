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

  it('returns null when symbol is null', () => {
    const { container } = render(<TradingViewWidget symbol={null} interval="1d" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders container divs when symbol is provided', () => {
    const { container } = render(<TradingViewWidget symbol="BTCUSDT" interval="1d" />);
    const outerDiv = container.querySelector('.tradingview-widget-container');
    expect(outerDiv).toBeTruthy();
    const widgetDiv = container.querySelector('.tradingview-widget-container__widget');
    expect(widgetDiv).toBeTruthy();
  });

  it('creates a script element with correct src', () => {
    render(<TradingViewWidget symbol="BTCUSDT" interval="1d" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com/external-embedding'),
    );
    expect(tvScript).toBeTruthy();
    expect(tvScript!.async).toBe(true);
    expect(tvScript!.type).toBe('text/javascript');
  });

  it('passes symbol as BINANCE: prefixed in config JSON', () => {
    render(<TradingViewWidget symbol="ETHUSDT" interval="1d" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.symbol).toBe('BINANCE:ETHUSDT');
  });

  it('maps interval to correct TradingView format', () => {
    render(<TradingViewWidget symbol="BTCUSDT" interval="4h" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.interval).toBe('240');
  });

  it('defaults to D for unknown interval', () => {
    render(<TradingViewWidget symbol="BTCUSDT" interval="99m" />);
    const scripts = document.querySelectorAll('script');
    const tvScript = Array.from(scripts).find((s) =>
      s.src.includes('s3.tradingview.com'),
    );
    const config = JSON.parse(tvScript!.innerHTML);
    expect(config.interval).toBe('D');
  });

  it('cleans up script on unmount', () => {
    const { unmount } = render(<TradingViewWidget symbol="BTCUSDT" interval="1d" />);
    expect(document.querySelectorAll('script').length).toBeGreaterThan(0);
    unmount();
    expect(document.querySelectorAll('script').length).toBe(0);
  });
});
