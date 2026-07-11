import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackedPairs } from '@/components/market/TrackedPairs';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/binance', () => ({
  fetchPriceBatch: vi.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', price: '42000' },
  ]),
  fetch24hStatsBatch: vi.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', priceChangePercent: '2.5' },
  ]),
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
    expect(screen.getByText('BTCUSDT')).toBeTruthy();
  });

  it('renders empty when no tracked pairs', () => {
    useMarketStore.setState({ tracked: [] });
    const { container } = render(<TrackedPairs />);
    expect(container.querySelector('#tracked-pairs')?.children.length).toBe(0);
  });

  it('calls setCurrentPair on click', () => {
    render(<TrackedPairs />);
    fireEvent.click(screen.getByText('BTCUSDT'));
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
