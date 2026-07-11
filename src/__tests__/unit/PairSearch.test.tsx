import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PairSearch } from '@/components/market/PairSearch';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/binance', () => ({
  fetchCoinsList: vi.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', status: 'TRADING' },
    { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', status: 'TRADING' },
    { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', status: 'TRADING' },
  ]),
}));

describe('PairSearch', () => {
  beforeEach(() => {
    useMarketStore.setState({
      coinsList: [
        { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', status: 'TRADING' },
        { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', status: 'TRADING' },
        { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', status: 'TRADING' },
      ],
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
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
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
    fireEvent.click(screen.getByText('BTC/USDT'));
    expect(input.value).toBe('');
  });

  it('searches by quote currency', () => {
    render(<PairSearch />);
    const input = screen.getByPlaceholderText('Buscar par...');
    fireEvent.change(input, { target: { value: 'ETHUSDT' } });
    expect(screen.getByText('ETH/USDT')).toBeTruthy();
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
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByText('BTC/USDT')).toBeNull();
  });
});
