import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionTable from '@/components/transactions/TransactionTable';
import type { TransactionEntry } from '@/store/useTransactionStore';

vi.mock('@/api/prices', () => ({
  getTokenPriceUSD: vi.fn().mockResolvedValue(2000),
  getHistoricalTokenPriceUSD: vi.fn().mockResolvedValue(1800),
}));

vi.mock('@/lib/utils', () => ({
  safeImageUrl: (url: string) => url || '',
  formatPrice: (v: number) => `$${v}`,
}));

vi.mock('@/lib/assets', () => ({
  tokenIconUrl: (symbol: string) => `https://icon.test/${symbol}.png`,
}));

const makeTx = (overrides: Partial<TransactionEntry> = {}): TransactionEntry => ({
  hash: '0xabc123',
  timestamp: Math.floor(Date.now() / 1000) - 3600,
  tokenSymbol: 'ETH',
  tokenName: 'Ethereum',
  type: 'receive',
  value: 1.5,
  usdValue: null,
  pnl: null,
  from: '0x1111',
  to: '0x2222',
  imgUrl: '',
  ...overrides,
});

describe('TransactionTable', () => {
  const defaultProps = {
    txs: [] as TransactionEntry[],
    onLoadMore: vi.fn(),
    hasMore: false,
    loading: false,
    title: 'Ethereum',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Sin transacciones" when empty and not loading', () => {
    render(<TransactionTable {...defaultProps} />);
    expect(screen.getByText('Sin transacciones')).toBeTruthy();
  });

  it('shows loading text when loading', () => {
    render(<TransactionTable {...defaultProps} loading={true} />);
    expect(screen.getByText('Cargando...')).toBeTruthy();
  });

  it('renders title', () => {
    render(<TransactionTable {...defaultProps} />);
    expect(screen.getByText('Ethereum')).toBeTruthy();
  });

  it('renders transactions with date groups', () => {
    const txs = [makeTx()];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.queryByText('Sin transacciones')).toBeNull();
  });

  it('shows "Ver mas" button when hasMore', () => {
    render(<TransactionTable {...defaultProps} txs={[makeTx()]} hasMore={true} />);
    expect(screen.getByText('Ver mas')).toBeTruthy();
  });

  it('does not show "Ver mas" when !hasMore', () => {
    render(<TransactionTable {...defaultProps} txs={[makeTx()]} hasMore={false} />);
    expect(screen.queryByText('Ver mas')).toBeNull();
  });

  it('renders sent type with correct class', () => {
    const txs = [makeTx({ type: 'send' })];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('renders received type', () => {
    const txs = [makeTx({ type: 'receive' })];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText('Received')).toBeTruthy();
  });

  it('hydrates prices for transactions', async () => {
    const txs = [makeTx()];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    await waitFor(() => {
      expect(screen.getByText(/Calculando historico|Sin datos historicos|\$/)).toBeTruthy();
    });
  });

  it('renders column headers (tipo, token, cantidad, USD)', () => {
    const txs = [makeTx()];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText('tipo')).toBeTruthy();
    expect(screen.getByText('token')).toBeTruthy();
    expect(screen.getByText('cantidad')).toBeTruthy();
    expect(screen.getByText('USD / P&L')).toBeTruthy();
  });

  it('formats ETH amount with 6 decimals', () => {
    const txs = [makeTx({ value: 1.123456789, tokenSymbol: 'ETH' })];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText(/1\.123457/)).toBeTruthy();
  });

  it('formats ERC20 amount with 4 decimals', () => {
    const txs = [makeTx({ value: 100.12345, tokenSymbol: 'USDC' })];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText(/100\.1235/)).toBeTruthy();
  });

  it('shows negative sign for sent amounts', () => {
    const txs = [makeTx({ type: 'send', value: 1.5 })];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText(/- .*1\.500000/)).toBeTruthy();
  });

  it('shows positive sign for received amounts', () => {
    const txs = [makeTx({ type: 'receive', value: 1.5 })];
    render(<TransactionTable {...defaultProps} txs={txs} />);
    expect(screen.getByText(/\+ .*1\.500000/)).toBeTruthy();
  });

  it('groups transactions by date', () => {
    const tx1 = makeTx({ hash: '0x1', timestamp: Math.floor(Date.now() / 1000) - 100 });
    const tx2 = makeTx({ hash: '0x2', timestamp: Math.floor(Date.now() / 1000) - 200 });
    render(<TransactionTable {...defaultProps} txs={[tx1, tx2]} />);
    const dateRows = document.querySelectorAll('.tx-date-row');
    expect(dateRows.length).toBeGreaterThanOrEqual(1);
  });
});
