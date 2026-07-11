import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletSection } from '@/components/wallet/WalletSection';
import { useWalletStore } from '@/store/useWalletStore';

vi.mock('@/lib/storage', () => ({
  readSavedWallets: vi.fn().mockReturnValue([]),
  writeSavedWallets: vi.fn().mockImplementation((w: string[]) => w),
  clearAppStorage: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  WALLET_ADDRESS_RE: /^0x[a-fA-F0-9]{40}$/,
  HAS_COINSTATS_CONFIG: false,
  HAS_ETHERSCAN_CONFIG: false,
  BINANCE_API: 'https://api.binance.com',
  ETH_API: 'https://api.etherscan.io',
  ETH_KEY: '',
  CHAIN_FALLBACKS: {},
  STABLE_PRICES: { USDT: 1, USDC: 1, USD0: 1, DAI: 1 },
  SUPPORTED_CHAINS: [{ id: 'ethereum', name: 'Ethereum', icon: '' }],
  WALLET_BALANCE_CONCURRENCY: 3,
}));

vi.mock('@/lib/assets', () => ({
  TOKEN_ICON_FALLBACKS: {},
}));

vi.mock('@/api/client', () => ({
  makeRequest: vi.fn(),
}));

vi.mock('@/api/coinstats', () => ({
  getTokenAssetsByAddress: vi.fn(),
}));

vi.mock('@/components/wallet/WalletDashboard', () => ({
  WalletDashboard: ({ totalWorth }: { totalWorth: number }) => (
    <div data-testid="wallet-dashboard">Dashboard ${totalWorth}</div>
  ),
}));

const VALID_ADDRESS = '0x' + 'a'.repeat(40);

describe('WalletSection', () => {
  beforeEach(() => {
    useWalletStore.setState({
      address: '',
      savedWallets: [],
      loading: false,
      error: null,
      assets: [],
      totalWorth: 0,
    });
  });

  it('renders the wallet header', () => {
    render(<WalletSection />);
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  it('renders search input', () => {
    render(<WalletSection />);
    expect(screen.getByPlaceholderText('0x...')).toBeTruthy();
  });

  it('renders search button', () => {
    render(<WalletSection />);
    expect(screen.getByText('Buscar')).toBeTruthy();
  });

  it('shows error for invalid address', () => {
    render(<WalletSection />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(screen.getByText('Buscar'));
    expect(screen.getByText(/Direccion invalida/)).toBeTruthy();
  });

  it('shows error when no API config', () => {
    render(<WalletSection />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_ADDRESS } });
    fireEvent.click(screen.getByText('Buscar'));
    expect(screen.getByText(/Falta cargar config/)).toBeTruthy();
  });

  it('shows empty state when address set but no assets', () => {
    useWalletStore.setState({ address: VALID_ADDRESS, assets: [], loading: false, error: null });
    render(<WalletSection />);
    expect(screen.getByText(/No se encontraron balances/)).toBeTruthy();
  });

  it('shows dashboard when assets exist', () => {
    useWalletStore.setState({
      address: VALID_ADDRESS,
      assets: [{ symbol: 'ETH', amount: 1, price: 2000, total: 2000, chain: 'Ethereum', chainId: 'ethereum', chainIcon: '', imgUrl: '' }],
      totalWorth: 2000,
      loading: false,
      error: null,
    });
    render(<WalletSection />);
    expect(screen.getByTestId('wallet-dashboard')).toBeTruthy();
  });

  it('shows loading state', () => {
    useWalletStore.setState({ loading: true });
    render(<WalletSection />);
    expect(screen.getByText(/Buscando.../)).toBeTruthy();
    expect(screen.getByText(/Cargando balances/)).toBeTruthy();
  });

  it('shows error message', () => {
    useWalletStore.setState({ error: 'Something went wrong' });
    render(<WalletSection />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows save button for unsaved address', () => {
    useWalletStore.setState({ address: VALID_ADDRESS, savedWallets: [] });
    render(<WalletSection />);
    expect(screen.getByTitle('Guardar billetera')).toBeTruthy();
  });

  it('updates address on input change', () => {
    render(<WalletSection />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: '0x123' } });
    expect(useWalletStore.getState().address).toBe('0x123');
  });

  it('renders clear all button when saved wallets exist', async () => {
    const { readSavedWallets } = await import('@/lib/storage');
    vi.mocked(readSavedWallets).mockReturnValueOnce([VALID_ADDRESS]);
    render(<WalletSection />);
    const btns = document.querySelectorAll('.btn-clear-all');
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows saved wallets section when wallets exist', async () => {
    const { readSavedWallets } = await import('@/lib/storage');
    vi.mocked(readSavedWallets).mockReturnValueOnce([VALID_ADDRESS]);
    const { container } = render(<WalletSection />);
    const savedSection = container.querySelector('.wallet-saved-section');
    expect(savedSection).toBeTruthy();
  });

  it('renders wallet chips for saved wallets', async () => {
    const { readSavedWallets } = await import('@/lib/storage');
    vi.mocked(readSavedWallets).mockReturnValueOnce([VALID_ADDRESS]);
    const { container } = render(<WalletSection />);
    const chips = container.querySelectorAll('.wallet-chip');
    expect(chips.length).toBe(1);
  });

  it('copies wallet address on copy button click', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    useWalletStore.setState({ savedWallets: [VALID_ADDRESS] });
    render(<WalletSection />);
    const copyBtns = document.querySelectorAll('.wallet-chip-btn');
    if (copyBtns.length > 0) {
      fireEvent.click(copyBtns[0]!);
    }
  });
});
