import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionSection from '@/components/transactions/TransactionSection';
import { useWalletStore } from '@/store/useWalletStore';

vi.mock('@/api/etherscan', () => ({
  fetchEtherscanTransactions: vi.fn().mockResolvedValue([
    { hash: '0x111', timeStamp: '1700000000', tokenSymbol: 'ETH', value: '1000000000000000000', from: '0xaaa', to: '0xbbb', tokenDecimal: '18', tokenName: 'Ethereum' },
    { hash: '0x222', timeStamp: '1700001000', tokenSymbol: 'USDC', value: '5000000', from: '0xbbb', to: '0xaaa', tokenDecimal: '6', tokenName: 'USD Coin' },
  ]),
}));

vi.mock('@/api/coinstats', () => ({
  fetchBaseTransactions: vi.fn().mockResolvedValue([
    { txHash: '0x333', timestamp: '1700002000', symbol: 'ETH', amount: '2000000000000000000', from: '0xccc', to: '0xddd', tokenDecimal: '18', tokenName: 'Ethereum' },
  ]),
}));

vi.mock('@/components/transactions/TransactionTable', () => ({
  default: ({ title, txs, loading, hasMore, onLoadMore }: { title: string; txs: unknown[]; loading: boolean; hasMore: boolean; onLoadMore: () => void }) => (
    <div data-testid={`table-${title}`}>
      <span>{title}</span>
      <span>{txs.length} txs</span>
      <span>{loading ? 'loading' : 'idle'}</span>
      {hasMore && <button onClick={onLoadMore}>more</button>}
    </div>
  ),
}));

describe('TransactionSection', () => {
  beforeEach(() => {
    useWalletStore.setState({ address: '' });
  });

  it('renders both chain tables', () => {
    render(<TransactionSection />);
    expect(screen.getByTestId('table-Ethereum')).toBeTruthy();
    expect(screen.getByTestId('table-Base')).toBeTruthy();
  });

  it('does not fetch when no address', () => {
    render(<TransactionSection />);
    const idles = screen.getAllByText('idle');
    expect(idles.length).toBe(2);
  });

  it('fetches transactions when address is set', async () => {
    useWalletStore.setState({ address: '0x' + 'a'.repeat(40) });
    render(<TransactionSection />);
    await waitFor(() => {
      expect(screen.getByText(/2 txs/)).toBeTruthy();
    });
  });

  it('displays chain names', () => {
    render(<TransactionSection />);
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText('Base')).toBeTruthy();
  });
});
