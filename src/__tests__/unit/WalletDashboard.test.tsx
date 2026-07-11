import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WalletDashboard } from '@/components/wallet/WalletDashboard';
import type { WalletAsset } from '@/store/useWalletStore';

vi.mock('@/lib/config', () => ({
  SUPPORTED_CHAINS: [
    { id: 'ethereum', name: 'Ethereum', icon: '' },
    { id: 'base', name: 'Base', icon: '' },
  ],
}));

vi.mock('@/components/wallet/ChainCard', () => ({
  ChainCard: ({ chainName, chainTotal, assets }: { chainName: string; chainTotal: number; assets: WalletAsset[] }) => (
    <div data-testid={`chain-${chainName}`}>
      {chainName}: ${chainTotal} ({assets.length} assets)
    </div>
  ),
}));

const makeAsset = (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
  symbol: 'ETH',
  amount: 1,
  price: 2000,
  total: 2000,
  chain: 'Ethereum',
  chainId: 'ethereum',
  chainIcon: '',
  imgUrl: '',
  ...overrides,
});

describe('WalletDashboard', () => {
  it('renders total worth', () => {
    render(<WalletDashboard assets={[]} totalWorth={0} />);
    expect(screen.getByText('Total Worth')).toBeTruthy();
  });

  it('displays formatted total worth', () => {
    render(<WalletDashboard assets={[]} totalWorth={12345.67} />);
    expect(screen.getByText('$12,345.67')).toBeTruthy();
  });

  it('renders ChainCard for each chain', () => {
    const assets = [
      makeAsset({ chain: 'Ethereum', total: 1000 }),
      makeAsset({ chain: 'Base', total: 500, symbol: 'USDC' }),
    ];
    render(<WalletDashboard assets={assets} totalWorth={1500} />);
    expect(screen.getByTestId('chain-Ethereum')).toBeTruthy();
    expect(screen.getByTestId('chain-Base')).toBeTruthy();
  });

  it('sorts chains by SUPPORTED_CHAINS order', () => {
    const assets = [
      makeAsset({ chain: 'Base', total: 100 }),
      makeAsset({ chain: 'Ethereum', total: 200 }),
    ];
    const { container } = render(<WalletDashboard assets={assets} totalWorth={300} />);
    const chainCards = container.querySelectorAll('[data-testid]');
    expect(chainCards[0]?.getAttribute('data-testid')).toBe('chain-Ethereum');
    expect(chainCards[1]?.getAttribute('data-testid')).toBe('chain-Base');
  });

  it('shows Assets and DeFi sub-totals', () => {
    render(<WalletDashboard assets={[]} totalWorth={500} />);
    expect(screen.getByText(/Assets: \$500/)).toBeTruthy();
    expect(screen.getByText(/DeFi: \$0/)).toBeTruthy();
  });
});
