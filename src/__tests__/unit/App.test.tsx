import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '@/App';
import { useMarketStore } from '@/store/useMarketStore';
import { useWalletStore } from '@/store/useWalletStore';

vi.mock('@/api/binance', () => ({
  fetch24hStats: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/storage', () => ({
  migrateAppStorage: vi.fn(),
  readTrackedPairs: vi.fn().mockReturnValue([]),
  writeTrackedPairs: vi.fn(),
  readIndicatorColors: vi.fn().mockReturnValue({
    sma: '#ff0000', ema: '#00ff00', rsi: '#0000ff',
    stochK: '#ff00ff', stochD: '#ffff00', bbLine: '#00ffff',
    bbBasis: '#ffffff', bbFill: '#888888',
    stochLevelOver: '#aaa', stochLevelUnder: '#bbb',
  }),
  writeIndicatorColors: vi.fn(),
}));

vi.mock('@/components/market/PairSearch', () => ({
  PairSearch: () => <div data-testid="pair-search">PairSearch</div>,
}));

vi.mock('@/components/market/TrackedPairs', () => ({
  TrackedPairs: () => <div data-testid="tracked-pairs">TrackedPairs</div>,
}));

vi.mock('@/components/market/CandlestickChart', () => ({
  default: ({ symbol }: { symbol: string }) => (
    <div data-testid="candlestick-chart">{symbol || 'no pair'}</div>
  ),
}));

vi.mock('@/components/wallet/WalletSection', () => ({
  WalletSection: () => <div data-testid="wallet-section">WalletSection</div>,
}));

vi.mock('@/components/transactions/TransactionSection', () => ({
  default: () => <div data-testid="transaction-section">TransactionSection</div>,
}));

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  BarController: {},
  BarElement: {},
  LineController: {},
  LineElement: {},
  PointElement: {},
  LinearScale: {},
  TimeScale: {},
  CategoryScale: {},
  Tooltip: {},
  Filler: {},
}));

vi.mock('chartjs-chart-financial', () => ({
  CandlestickController: {},
  CandlestickElement: {},
}));

vi.mock('chartjs-adapter-date-fns', () => ({}));

describe('App', () => {
  beforeEach(() => {
    useMarketStore.setState({
      activeView: 'market',
      tracked: [],
      currentPair: null,
      currentInterval: '1d',
      chartIndicators: {
        bollinger: false,
        volume: false,
        stochRsi: false,
        volumeProfile: false,
        smaEnabled: false,
        smaPeriod: 50,
        emaEnabled: false,
        emaPeriod: 50,
        rsiEnabled: false,
        rsiPeriod: 14,
        colors: {
          sma: '#ff0000', ema: '#00ff00', rsi: '#0000ff',
          stochK: '#ff00ff', stochD: '#ffff00', bbLine: '#00ffff',
          bbBasis: '#ffffff', bbFill: '#888888',
          stochLevelOver: '#aaa', stochLevelUnder: '#bbb',
        },
      },
      lastPrices: {},
      coinsList: [],
    });
    useWalletStore.setState({
      address: '',
      savedWallets: [],
      loading: false,
      error: null,
      assets: [],
      totalWorth: 0,
    });
  });

  it('renders header', () => {
    render(<App />);
    expect(screen.getByText('Portfolio terminal')).toBeTruthy();
  });

  it('renders footer', () => {
    render(<App />);
    expect(screen.getByText('Usual Money')).toBeTruthy();
  });

  it('renders Mercado and Wallet tabs', () => {
    render(<App />);
    expect(screen.getByText('Mercado')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  it('Mercado tab is active by default', () => {
    render(<App />);
    const mercado = screen.getByText('Mercado');
    expect(mercado.className).toContain('active');
  });

  it('switches to Wallet tab on click', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Wallet'));
    const wallet = screen.getByText('Wallet');
    expect(wallet.className).toContain('active');
  });

  it('switches back to Mercado tab', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Wallet'));
    fireEvent.click(screen.getByText('Mercado'));
    const mercado = screen.getByText('Mercado');
    expect(mercado.className).toContain('active');
  });

  it('shows empty chart state when no pair selected', () => {
    render(<App />);
    expect(screen.getByText('Selecciona un par para ver la grafica')).toBeTruthy();
  });

  it('renders PairSearch component', () => {
    render(<App />);
    expect(screen.getByTestId('pair-search')).toBeTruthy();
  });

  it('renders TrackedPairs component', () => {
    render(<App />);
    expect(screen.getByTestId('tracked-pairs')).toBeTruthy();
  });

  it('renders WalletSection in wallet view', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Wallet'));
    expect(screen.getByTestId('wallet-section')).toBeTruthy();
  });

  it('renders TransactionSection in wallet view', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Wallet'));
    expect(screen.getByTestId('transaction-section')).toBeTruthy();
  });

  it('does not render chart controls when no pair', () => {
    render(<App />);
    expect(screen.queryByRole('toolbar', { name: /Controles del chart/ })).toBeNull();
  });

  it('renders interval selector buttons', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByText('1D')).toBeTruthy();
    expect(screen.getByText('4H')).toBeTruthy();
    expect(screen.getByText('1H')).toBeTruthy();
  });

  it('changes interval on button click', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    fireEvent.click(screen.getByText('4H'));
    expect(useMarketStore.getState().currentInterval).toBe('4h');
  });

  it('shows indicator toggle buttons when pair selected', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByText('BB')).toBeTruthy();
    expect(screen.getByText('VOL')).toBeTruthy();
  });

  it('toggles Bollinger Bands indicator', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    fireEvent.click(screen.getByText('BB'));
    expect(useMarketStore.getState().chartIndicators.bollinger).toBe(true);
  });

  it('toggles Volume indicator', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    fireEvent.click(screen.getByText('VOL'));
    expect(useMarketStore.getState().chartIndicators.volume).toBe(true);
  });

  it('shows SMA and EMA selects', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByLabelText('SMA periodo')).toBeTruthy();
    expect(screen.getByLabelText('EMA periodo')).toBeTruthy();
  });

  it('shows measure tool button', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByText('%')).toBeTruthy();
  });

  it('shows color picker button', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByLabelText('Colores de indicadores')).toBeTruthy();
  });

  it('toggles color picker on click', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    const colorBtn = screen.getByLabelText('Colores de indicadores');
    fireEvent.click(colorBtn);
    expect(colorBtn.className).toContain('active');
  });

  it('shows chart reset button', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByLabelText('Restablecer zoom del chart')).toBeTruthy();
  });
});
