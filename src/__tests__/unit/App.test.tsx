import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '@/App';
import { fetchPairDetail } from '@/api/market';
import { useMarketStore } from '@/store/useMarketStore';
import { useWalletStore } from '@/store/useWalletStore';

vi.mock('@/api/binance', () => ({
  fetch24hStats: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/api/market', () => ({
  fetchPairDetail: vi.fn().mockResolvedValue(null),
  displayBase: (entry: string) => {
    const upper = String(entry || '').toUpperCase();
    const dash = upper.lastIndexOf('-');
    const sym = dash > 0 ? upper.slice(0, dash) : upper;
    if (sym.includes('_')) return sym.split('_')[0] || sym;
    return sym.replace(/USDT$/, '');
  },
  displayQuote: (entry: string) => {
    const upper = String(entry || '').toUpperCase();
    const dash = upper.lastIndexOf('-');
    const sym = dash > 0 ? upper.slice(0, dash) : upper;
    if (sym.includes('_')) return sym.split('_')[1] || '';
    return /USDT$/.test(sym) ? 'USDT' : '';
  },
  displayPairLabel: (entry: string) => {
    const upper = String(entry || '').toUpperCase();
    const dash = upper.lastIndexOf('-');
    const sym = dash > 0 ? upper.slice(0, dash) : upper;
    if (sym.includes('_')) return sym.replace(/_/g, '');
    if (/USDT$/.test(sym)) return `${sym.replace(/USDT$/, '')}/USDT`;
    return sym;
  },
}));

vi.mock('@/lib/storage', () => ({
  migrateAppStorage: vi.fn(),
  readTrackedPairs: vi.fn().mockReturnValue([]),
  writeTrackedPairs: vi.fn(),
  readAiModel: vi.fn().mockReturnValue(null),
  writeAiModel: vi.fn(),
  readSmaLines: vi.fn().mockReturnValue([]),
  writeSmaLines: vi.fn(),
  readEmaLines: vi.fn().mockReturnValue([]),
  writeEmaLines: vi.fn(),
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

vi.mock('@/components/market/LightweightChart', () => ({
  default: ({ symbol }: { symbol: string }) => (
    <div data-testid="lightweight-chart">{symbol || 'no pair'}</div>
  ),
}));

vi.mock('@/components/market/TradingViewWidget', () => ({
  default: ({ symbol }: { symbol: string | null }) => (
    <div data-testid="tradingview-widget">{symbol || 'no pair'}</div>
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
      chartMode: 'tradingview',
      tracked: [],
      currentPair: null,
      currentInterval: '1d',
      chartIndicators: {
        bollinger: false,
        volume: false,
        stochRsi: false,
        volumeProfile: false,
        macd: false,
        taker: false,
        divs: false,
        signals: false,
        smc: {
          swings: false, structure: false, zones: false, premium: false,
          eq: false, liquidity: false, confluence: false,
        },
        smaLines: [{ id: 'sma-50', period: 50, color: '#00BCD4', enabled: false }],
        emaLines: [{ id: 'ema-50', period: 50, color: '#4CAF50', enabled: false }],
        rsiEnabled: false,
        rsiPeriod: 14,
        colors: {
          rsi: '#0000ff', stochK: '#ff00ff', stochD: '#ffff00', bbLine: '#00ffff',
          bbBasis: '#ffffff', bbFill: '#888888',
          stochLevelOver: '#aaa', stochLevelUnder: '#bbb',
        },
        drawTool: null,
      },
      lastPrices: {},
      liveQuotes: {},
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

  it('shows SMA and EMA buttons', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByText('SMA')).toBeTruthy();
    expect(screen.getByText('EMA')).toBeTruthy();
  });

  it('shows measure tool button', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByLabelText('Medir rango de precio')).toBeTruthy();
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

  it('renders Pro chart when lightweight mode selected', async () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT', chartMode: 'lightweight' });
    render(<App />);
    expect(await screen.findByTestId('lightweight-chart')).toBeTruthy();
  });

  it('renders TradingView widget when tradingview mode selected', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT', chartMode: 'tradingview' });
    render(<App />);
    expect(screen.getByTestId('tradingview-widget')).toBeTruthy();
  });

  it('renders CandlestickChart when chartjs mode selected', async () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT', chartMode: 'chartjs' });
    render(<App />);
    expect(await screen.findByTestId('candlestick-chart')).toBeTruthy();
  });

  it('switches between chart modes using toggle', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT', chartMode: 'tradingview' });
    render(<App />);
    expect(screen.getByTestId('tradingview-widget')).toBeTruthy();
    fireEvent.click(screen.getByText('Chart.js'));
    expect(useMarketStore.getState().chartMode).toBe('chartjs');
    fireEvent.click(screen.getByText('TradingView'));
    expect(useMarketStore.getState().chartMode).toBe('tradingview');
  });

  it('renders chart mode toggle buttons', () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT' });
    render(<App />);
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Chart.js')).toBeTruthy();
    expect(screen.getByText('TradingView')).toBeTruthy();
  });

  it('shows MEXC futures header with ticker, source badge and detail price fallback', async () => {
    vi.mocked(fetchPairDetail).mockResolvedValue({
      symbol: 'SUI_USDT', price: 1.2321, priceChange: 0.0006, priceChangePercent: 0.05,
      highPrice: 1.232, lowPrice: 1.177, volume: 80600000, quoteVolume: 99600000,
      isPositive: true, source: 'MEXC',
    });
    useMarketStore.setState({ currentPair: 'SUI_USDT-MEXC', lastPrices: {} });
    const { container } = render(<App />);
    expect(await screen.findByText('SUIUSDT')).toBeTruthy();
    expect(await screen.findByText('1.2321')).toBeTruthy();
    expect(screen.getByText('MEXC · Futuros')).toBeTruthy();
    expect(container.querySelector('#pair-price strong')?.textContent).toBe('1.2321');
    const stats = container.querySelector('.pair-stats')?.textContent ?? '';
    expect(stats).toContain('+0.0006');
    expect(stats).toContain('1.232');
    expect(stats).not.toContain('1,232');
    expect(document.title).toBe('SUIUSDT 1.2321 ▲ +0.05%');
  });

  it('shows spot header with ticker, source badge and grouped max', async () => {
    vi.mocked(fetchPairDetail).mockResolvedValue({
      symbol: 'BTCUSDT', price: 65000, priceChange: 1250.5, priceChangePercent: 1.96,
      highPrice: 66000, lowPrice: 63000, volume: 1000, quoteVolume: 65000000,
      isPositive: true, source: 'Binance',
    });
    useMarketStore.setState({ currentPair: 'BTCUSDT', lastPrices: {} });
    const { container } = render(<App />);
    expect(await screen.findByText('BTC/USDT')).toBeTruthy();
    expect(screen.getByText('Binance · Spot')).toBeTruthy();
    expect(container.querySelector('#pair-price strong')?.textContent).toBe('65000.00');
    expect(container.querySelector('.pair-stats')?.textContent).toContain('66,000.00');
  });

  it('prefers live lastPrices over detail price in header', async () => {
    vi.mocked(fetchPairDetail).mockResolvedValue({
      symbol: 'SUI_USDT', price: 1.2321, priceChange: 0.0006, priceChangePercent: 0.05,
      highPrice: 1.232, lowPrice: 1.177, volume: 80600000, quoteVolume: 99600000,
      isPositive: true, source: 'MEXC',
    });
    useMarketStore.setState({ currentPair: 'SUI_USDT-MEXC', lastPrices: { 'SUI_USDT-MEXC': 1.25 } });
    const { container } = render(<App />);
    expect(await screen.findByText('SUIUSDT')).toBeTruthy();
    expect(container.querySelector('#pair-price strong')?.textContent).toBe('1.2500');
  });

  it('updates header price and pct from live quotes', async () => {
    vi.mocked(fetchPairDetail).mockResolvedValue(null);
    useMarketStore.setState({
      currentPair: 'SUI_USDT-MEXC',
      lastPrices: {},
      liveQuotes: { 'SUI_USDT-MEXC': { price: 1.19, changePercent: -0.29, isPositive: false, quoteVolume: 90900000 } },
    });
    const { container } = render(<App />);
    expect(await screen.findByText('SUIUSDT')).toBeTruthy();
    expect(await screen.findByText('1.1900')).toBeTruthy();
    expect(container.querySelector('#pair-price strong')?.textContent).toBe('1.1900');
    expect(container.querySelector('#pair-price')?.textContent).toContain('-0.29%');
    expect(document.title).toBe('SUIUSDT 1.1900 ▼ -0.29%');
  });
});
