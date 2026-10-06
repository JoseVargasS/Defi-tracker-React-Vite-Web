import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionSection from '@/components/transactions/TransactionSection';
import { useWalletStore } from '@/store/useWalletStore';

vi.mock('@/api/etherscan', () => ({
  fetchEtherscanTransactions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/coinstats', () => ({
  coinStatsTxError: vi.fn().mockReturnValue(null),
  fetchChainTransactions: vi.fn(async (_address: string, connectionId: string) => {
    if (connectionId === 'ethereum') {
      return [
        { hash: '0x111', timeStamp: 1700000000, tokenSymbol: 'ETH', value: 1, from: '0xaaa', to: '0xbbb', tokenDecimal: '0', tokenName: 'Ethereum', imgUrl: null, _chainId: 'Ethereum' },
        { hash: '0x222', timeStamp: 1700001000, tokenSymbol: 'USDC', value: 5, from: '0xbbb', to: '0xaaa', tokenDecimal: '0', tokenName: 'USD Coin', imgUrl: null, _chainId: 'Ethereum' },
      ];
    }
    if (connectionId === 'base-wallet') {
      return [
        { hash: '0x333', timeStamp: 1700002000, symbol: undefined, tokenSymbol: 'ETH', value: 2, from: '0xccc', to: '0xddd', tokenDecimal: '0', tokenName: 'Ethereum', imgUrl: null, _chainId: 'Base' },
      ];
    }
    return [];
  }),
}));

vi.mock('@/lib/config', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...orig,
    HAS_COINSTATS_CONFIG: true,
    TRANSACTION_CHAIN_DELAY_MS: 0,
  };
});

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
    useWalletStore.setState({ address: '0x' + 'a'.repeat(40) });
  });

  it('renders one table per chain with data', async () => {
    render(<TransactionSection />);
    await waitFor(() => {
      expect(screen.getByTestId('table-Ethereum')).toBeTruthy();
    });
    expect(screen.getByTestId('table-Base')).toBeTruthy();
  });

  it('shows header counts', async () => {
    render(<TransactionSection />);
    await waitFor(() => {
      expect(screen.getByText(/3 txs · 2 networks/)).toBeTruthy();
    });
  });

  it('skips empty chains once loaded', async () => {
    render(<TransactionSection />);
    await waitFor(() => {
      expect(screen.getByText(/3 txs · 2 networks/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText('loading')).toBeNull();
    });
    expect(screen.queryByTestId('table-Solana')).toBeNull();
  });
});
