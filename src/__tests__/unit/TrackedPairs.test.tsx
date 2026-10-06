import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackedPairs } from '@/components/market/TrackedPairs';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/binance', () => ({
  fetchPriceBatch: vi.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', price: '42000' },
  ]),
  fetch24hStatsBatch: vi.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', priceChangePercent: '2.5', quoteVolume: '1000000' },
  ]),
  getSparklineCloses: vi.fn().mockResolvedValue([41000, 41500, 42000]),
}));

vi.mock('@/api/mexc', () => ({
  fetchMexcTicker: vi.fn().mockResolvedValue(null),
  fetchMexcKlines: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/live', () => ({
  connectLivePrices: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('@/hooks/useInterval', () => ({
  useInterval: vi.fn(),
}));

vi.mock('@/lib/config', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...orig,
    TRACKED_PAIRS_POLL_MS: 30000,
    splitPairSymbol: (s: string) => {
      const match = s.match(/^(.+?)(USDT|BUSD|USD|EUR|BTC|ETH|BNB)$/);
      if (match) return { base: match[1], quote: match[2] };
      return { base: s, quote: '' };
    },
  };
});

beforeEach(() => {
  useMarketStore.setState({
    tracked: ['BTCUSDT'],
    currentPair: null,
    lastPrices: {},
  });
});

describe('TrackedPairs', () => {
  it('renders tracked pairs', () => {
    render(<TrackedPairs />);
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
  });

  it('renders empty when no tracked pairs', () => {
    useMarketStore.setState({ tracked: [] });
    const { container } = render(<TrackedPairs />);
    expect(container.querySelectorAll('.tracked-pair').length).toBe(0);
  });

  it('calls setCurrentPair on click', () => {
    render(<TrackedPairs />);
    fireEvent.click(screen.getByText('BTC/USDT'));
    expect(useMarketStore.getState().currentPair).toBe('BTCUSDT');
  });

  it('renders delete button', () => {
    render(<TrackedPairs />);
    expect(screen.getByTitle('Eliminar par')).toBeTruthy();
  });

  it('removes pair on delete click', () => {
    render(<TrackedPairs />);
    fireEvent.click(screen.getByTitle('Eliminar par'));
    expect(useMarketStore.getState().tracked).toEqual([]);
  });

  it('shows coin name', () => {
    render(<TrackedPairs />);
    expect(screen.getByText('BTC')).toBeTruthy();
  });

  it('shows fallback icon for unknown coins', () => {
    useMarketStore.setState({ tracked: ['XYZUSDT'] });
    render(<TrackedPairs />);
    expect(screen.getByText('X')).toBeTruthy();
  });

  it('renders long tickers in full', () => {
    useMarketStore.setState({ tracked: ['VELODROMEUSDT'] });
    render(<TrackedPairs />);
    expect(screen.getByText('VELODROME/USDT')).toBeTruthy();
  });

  it('renders perp labels concatenated', () => {
    useMarketStore.setState({ tracked: ['SUI_USDT-MEXC'] });
    render(<TrackedPairs />);
    expect(screen.getByText('SUIUSDT')).toBeTruthy();
    expect(screen.queryByText(/SUI_USDT-MEXC/)).toBeNull();
  });

  it('renders TV symbols raw', () => {
    useMarketStore.setState({ tracked: ['BTC.D-TV'] });
    const { container } = render(<TrackedPairs />);
    expect(container.querySelector('.coin-symbol')?.textContent).toBe('BTC.D');
  });

  it('shows source label on every row', () => {
    render(<TrackedPairs />);
    expect(screen.getByText('Binance · Spot')).toBeTruthy();
  });

  it('shows TV dominance hint', () => {
    useMarketStore.setState({ tracked: ['BTC.D-TV'] });
    render(<TrackedPairs />);
    expect(screen.getByText('TV · Dominancia BTC')).toBeTruthy();
  });

  it('shows MEXC futures label', () => {
    useMarketStore.setState({ tracked: ['BTC_USDT-MEXC'] });
    render(<TrackedPairs />);
    expect(screen.getByText('MEXC · Futuros')).toBeTruthy();
  });

  it('shows formatted price after fetch', async () => {
    render(<TrackedPairs />);
    await waitFor(() => {
      const priceEls = screen.getAllByText(/42000/);
      expect(priceEls.length).toBeGreaterThan(0);
    });
  });

  it('shows positive change class', async () => {
    render(<TrackedPairs />);
    await waitFor(() => {
      const changes = document.querySelectorAll('.pair-change.positive');
      expect(changes.length).toBeGreaterThan(0);
    });
  });
});
