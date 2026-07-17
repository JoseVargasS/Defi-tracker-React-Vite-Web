import { describe, it, expect, beforeEach } from 'vitest';
import { useMarketStore } from '@/store/useMarketStore';
import { useWalletStore } from '@/store/useWalletStore';

beforeEach(() => {
  useMarketStore.setState({
    activeView: 'market',
    chartMode: 'tradingview',
    tracked: ['ETHUSDT', 'BTCUSDT', 'USUALUSDT', 'VELODROMEUSDT', 'BATUSDT', 'BIOUSDT'],
    currentPair: null,
    currentInterval: '1d',
    chartIndicators: {
      bollinger: true,
      volume: true,
      stochRsi: true,
      volumeProfile: true,
      smaEnabled: false,
      smaPeriod: 200,
      emaEnabled: false,
      emaPeriod: 200,
      rsiEnabled: false,
      rsiPeriod: 14,
      colors: expect.any(Object),
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

describe('useMarketStore', () => {
  it('has correct initial state', () => {
    const state = useMarketStore.getState();
    expect(state.activeView).toBe('market');
    expect(state.chartMode).toBe('tradingview');
    expect(state.currentPair).toBeNull();
    expect(state.currentInterval).toBe('1d');
    expect(state.tracked.length).toBe(6);
  });

  it('setActiveView toggles view', () => {
    useMarketStore.getState().setActiveView('wallet');
    expect(useMarketStore.getState().activeView).toBe('wallet');
  });

  it('setChartMode switches chart mode', () => {
    useMarketStore.getState().setChartMode('chartjs');
    expect(useMarketStore.getState().chartMode).toBe('chartjs');
    useMarketStore.getState().setChartMode('tradingview');
    expect(useMarketStore.getState().chartMode).toBe('tradingview');
  });

  it('setTracked replaces pair list', () => {
    useMarketStore.getState().setTracked(['SOLUSDT']);
    expect(useMarketStore.getState().tracked).toEqual(['SOLUSDT']);
  });

  it('addTracked adds unique pair', () => {
    useMarketStore.getState().addTracked('SOLUSDT');
    expect(useMarketStore.getState().tracked).toContain('SOLUSDT');
  });

  it('addTracked does not duplicate', () => {
    const before = useMarketStore.getState().tracked.length;
    useMarketStore.getState().addTracked('ETHUSDT');
    expect(useMarketStore.getState().tracked.length).toBe(before);
  });

  it('removeTracked removes pair', () => {
    useMarketStore.getState().removeTracked('ETHUSDT');
    expect(useMarketStore.getState().tracked).not.toContain('ETHUSDT');
  });

  it('setCurrentPair sets pair', () => {
    useMarketStore.getState().setCurrentPair('BTCUSDT');
    expect(useMarketStore.getState().currentPair).toBe('BTCUSDT');
  });

  it('setCurrentInterval sets interval', () => {
    useMarketStore.getState().setCurrentInterval('5m');
    expect(useMarketStore.getState().currentInterval).toBe('5m');
  });

  it('setChartIndicator toggles indicator', () => {
    useMarketStore.getState().setChartIndicator('bollinger', false);
    expect(useMarketStore.getState().chartIndicators.bollinger).toBe(false);
  });

  it('setSmaPeriod updates period', () => {
    useMarketStore.getState().setSmaPeriod(50);
    expect(useMarketStore.getState().chartIndicators.smaPeriod).toBe(50);
  });

  it('setEmaPeriod updates period', () => {
    useMarketStore.getState().setEmaPeriod(100);
    expect(useMarketStore.getState().chartIndicators.emaPeriod).toBe(100);
  });

  it('setRsiEnabled toggles RSI', () => {
    useMarketStore.getState().setRsiEnabled(true);
    expect(useMarketStore.getState().chartIndicators.rsiEnabled).toBe(true);
  });

  it('setRsiPeriod updates period', () => {
    useMarketStore.getState().setRsiPeriod(21);
    expect(useMarketStore.getState().chartIndicators.rsiPeriod).toBe(21);
  });

  it('setIndicatorColor updates color', () => {
    useMarketStore.getState().setIndicatorColor('sma', '#ff0000');
    expect(useMarketStore.getState().chartIndicators.colors.sma).toBe('#ff0000');
  });

  it('setCoinsList sets list', () => {
    const list = [{ symbol: 'BTCUSDT' }];
    useMarketStore.getState().setCoinsList(list);
    expect(useMarketStore.getState().coinsList).toEqual(list);
  });

  it('setLastPrice sets price for symbol', () => {
    useMarketStore.getState().setLastPrice('BTCUSDT', 65000);
    expect(useMarketStore.getState().lastPrices.BTCUSDT).toBe(65000);
  });
});

describe('useWalletStore', () => {
  it('has correct initial state', () => {
    const state = useWalletStore.getState();
    expect(state.address).toBe('');
    expect(state.savedWallets).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.assets).toEqual([]);
    expect(state.totalWorth).toBe(0);
  });

  it('setAddress sets address', () => {
    useWalletStore.getState().setAddress('0xabc');
    expect(useWalletStore.getState().address).toBe('0xabc');
  });

  it('setSavedWallets replaces list', () => {
    useWalletStore.getState().setSavedWallets(['0x111', '0x222']);
    expect(useWalletStore.getState().savedWallets).toEqual(['0x111', '0x222']);
  });

  it('addSavedWallet adds unique wallet', () => {
    useWalletStore.getState().addSavedWallet('0x111');
    expect(useWalletStore.getState().savedWallets).toContain('0x111');
  });

  it('addSavedWallet does not duplicate', () => {
    useWalletStore.getState().addSavedWallet('0x111');
    useWalletStore.getState().addSavedWallet('0x111');
    expect(useWalletStore.getState().savedWallets.filter(w => w === '0x111').length).toBe(1);
  });

  it('removeSavedWallet removes wallet', () => {
    useWalletStore.getState().setSavedWallets(['0x111', '0x222']);
    useWalletStore.getState().removeSavedWallet('0x111');
    expect(useWalletStore.getState().savedWallets).not.toContain('0x111');
    expect(useWalletStore.getState().savedWallets).toContain('0x222');
  });

  it('setLoading sets loading state', () => {
    useWalletStore.getState().setLoading(true);
    expect(useWalletStore.getState().loading).toBe(true);
  });

  it('setError sets error', () => {
    useWalletStore.getState().setError('some error');
    expect(useWalletStore.getState().error).toBe('some error');
  });

  it('setAssets sets assets and totalWorth', () => {
    const assets = [{ symbol: 'ETH', amount: 1, price: 3000, total: 3000, imgUrl: '', chain: 'ethereum', chainId: '1', chainIcon: '' }];
    useWalletStore.getState().setAssets(assets, 3000);
    expect(useWalletStore.getState().assets).toEqual(assets);
    expect(useWalletStore.getState().totalWorth).toBe(3000);
  });
});
