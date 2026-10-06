import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PairSearch } from '@/components/market/PairSearch';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/market', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/api/market')>();
  return {
    ...orig,
    fetchAvailableSymbols: vi.fn().mockResolvedValue([
      { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', source: 'Binance', keywords: '', displayName: 'BTC/USDT' },
      { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', source: 'Binance', keywords: '', displayName: 'ETH/USDT' },
      { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', source: 'Binance', keywords: '', displayName: 'BNB/USDT' },
    ]),
  };
});

const coins = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', source: 'Binance', keywords: '', displayName: 'BTC/USDT' },
  { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', source: 'Binance', keywords: '', displayName: 'ETH/USDT' },
  { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', source: 'Binance', keywords: '', displayName: 'BNB/USDT' },
];

describe('PairSearch', () => {
  beforeEach(() => {
    useMarketStore.setState({
      coinsList: coins,
      tracked: [],
      currentPair: null,
    });
  });

  it('renders search input', () => {
    render(<PairSearch />);
    expect(screen.getByPlaceholderText('Buscar par...')).toBeTruthy();
  });

  it('filters suggestions when typing', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'BTC' } });
    expect(screen.getByText('BTC/USDT', { exact: false })).toBeTruthy();
  });

  it('shows no results message for unmatched query', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'ZZZZZ' } });
    expect(screen.getByText('No se encontraron pares.')).toBeTruthy();
  });

  it('selects a pair and clears input', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'BTC' } });
    fireEvent.click(screen.getByText('BTC/USDT', { exact: false }));
    expect(input.value).toBe('');
  });

  it('searches by quote currency', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'ETHUSDT' } });
    expect(screen.getByText('ETH/USDT', { exact: false })).toBeTruthy();
  });

  it('loads coins list on mount if empty', async () => {
    useMarketStore.setState({ coinsList: [] });
    render(<PairSearch />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Buscar par...')).toBeTruthy();
    });
  });

  it('clears suggestions when query is emptied', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'BTC' } });
    expect(screen.getByText('BTC/USDT', { exact: false })).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByText('BTC/USDT', { exact: false })).toBeNull();
  });

  it('shows source label on suggestions', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'BTC' } });
    expect(screen.getByText(/Binance · Spot/)).toBeTruthy();
  });

  it('groups results with headers', () => {
    useMarketStore.setState({
      coinsList: [
        ...coins,
        { symbol: 'BTC_USDT', base: 'BTC', quote: 'USDT', source: 'MEXC', keywords: '', displayName: 'BTC/USDT' },
      ],
    });
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'BTC' } });
    expect(screen.getByText('Futuros perpetuos')).toBeTruthy();
    expect(screen.getByText('Spot')).toBeTruthy();
  });
});
