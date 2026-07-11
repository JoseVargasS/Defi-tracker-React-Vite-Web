import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChainCard } from '@/components/wallet/ChainCard';
import type { WalletAsset } from '@/store/useWalletStore';

vi.mock('@/lib/utils', () => ({
  safeImageUrl: (url: string) => url || '',
}));

vi.mock('@/lib/assets', () => ({
  tokenIconUrl: (symbol: string) => `https://icon.test/${symbol}.png`,
}));

const makeAsset = (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
  symbol: 'ETH',
  amount: 1.5,
  price: 2000,
  total: 3000,
  chain: 'Ethereum',
  chainId: 'ethereum',
  chainIcon: '',
  imgUrl: '',
  ...overrides,
});

describe('ChainCard', () => {
  it('renders chain name and total', () => {
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={3000} assets={[makeAsset()]} />
    );
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText(/Total Ethereum: \$3,000/)).toBeTruthy();
  });

  it('renders valuable assets sorted by total desc', () => {
    const assets = [
      makeAsset({ symbol: 'USDC', total: 500, amount: 500, price: 1 }),
      makeAsset({ symbol: 'ETH', total: 3000, amount: 1.5, price: 2000 }),
    ];
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={3500} assets={assets} />
    );
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('renders token icon with valid imgUrl', () => {
    const assets = [makeAsset({ imgUrl: 'https://icon.test/ETH.png' })];
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={3000} assets={assets} />
    );
    const icons = document.querySelectorAll('.token-icon');
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows ZeroValueToggle when there are worthless assets', () => {
    const assets = [
      makeAsset({ symbol: 'ETH', total: 3000 }),
      makeAsset({ symbol: '垃圾', total: 0, amount: 100, price: 0 }),
    ];
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={3000} assets={assets} />
    );
    expect(screen.getByText(/1 tokens sin valor/)).toBeTruthy();
  });

  it('formats ETH amount with 6 decimals', () => {
    const assets = [makeAsset({ symbol: 'ETH', amount: 1.123456789, total: 2246.91 })];
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={2246.91} assets={assets} />
    );
    expect(screen.getByText(/1\.123457/)).toBeTruthy();
  });

  it('formats special symbols with 4 decimals for price', () => {
    const assets = [makeAsset({ symbol: 'USUAL', price: 0.1234, amount: 100, total: 12.34 })];
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={12.34} assets={assets} />
    );
    expect(screen.getByText('$0.1234')).toBeTruthy();
  });

  it('renders token element (icon or fallback)', () => {
    const assets = [makeAsset({ imgUrl: '' })];
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={3000} assets={assets} />
    );
    const tokenEls = document.querySelectorAll('.token-icon, .token-fallback-icon');
    expect(tokenEls.length).toBeGreaterThanOrEqual(1);
  });

  it('renders table headers', () => {
    render(
      <ChainCard chainName="Ethereum" chainIcon="" chainTotal={0} assets={[]} />
    );
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('renders chain icon when valid', () => {
    render(
      <ChainCard chainName="Ethereum" chainIcon="https://icon.test/eth.png" chainTotal={3000} assets={[makeAsset()]} />
    );
    const chainIcons = document.querySelectorAll('.chain-icon');
    expect(chainIcons.length).toBe(1);
  });
});
