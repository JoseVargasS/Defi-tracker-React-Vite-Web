import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LightweightChart from '@/components/market/LightweightChart';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/market', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/api/market')>();
  return {
    ...orig,
    fetchCandles: vi.fn().mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => [
        (i + 1) * 60_000, 100 + i, 102 + i, 99 + i, 101 + i, 1000, (i + 1) * 60_000, 100000, 1, 500, 50000, 0,
      ]),
    ),
    fetchLatestCandles: vi.fn().mockResolvedValue([]),
    fetchExtendedFlag: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('@/api/binanceFutures', () => ({
  fetchTakerVolumes: vi.fn().mockResolvedValue([]),
}));

const seriesStub = () => ({
  setData: vi.fn(),
  update: vi.fn(),
  applyOptions: vi.fn(),
  coordinateToPrice: vi.fn(() => 150),
  priceToCoordinate: vi.fn(() => 250),
  createPriceLine: vi.fn(() => ({})),
  removePriceLine: vi.fn(),
  priceScale: () => ({ applyOptions: vi.fn() }),
});

export const chartMocks = {
  setVisibleRange: vi.fn(),
  setVisibleLogicalRange: vi.fn(),
  createdSeries: [] as { setData: ReturnType<typeof vi.fn> }[],
};

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'candlestick',
  HistogramSeries: 'histogram',
  LineSeries: 'line',
  CrosshairMode: { Normal: 0 },
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => {
      const stub = seriesStub();
      chartMocks.createdSeries.push(stub);
      return stub;
    }),
    priceScale: () => ({
      applyOptions: vi.fn(),
      width: () => 60,
      getVisibleRange: () => ({ from: 90, to: 110 }),
      setVisibleRange: chartMocks.setVisibleRange,
      setAutoScale: vi.fn(),
    }),
    timeScale: () => ({
      fitContent: vi.fn(),
      resetTimeScale: vi.fn(),
      setVisibleLogicalRange: chartMocks.setVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: vi.fn(),
      timeToCoordinate: vi.fn(() => 100),
      coordinateToTime: vi.fn(() => 120),
    }),
    subscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    removeSeries: vi.fn(),
    resize: vi.fn(),
  })),
}));

function indicators() {
  return useMarketStore.getState().chartIndicators;
}

describe('LightweightChart', () => {
  beforeEach(() => {
    useMarketStore.setState({ currentInterval: '1d' });
  });

  it('shows loading then legend', async () => {
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    expect(screen.getByText('Cargando gráfica…')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
  });

  it('shows indicator tags with values', async () => {
    const { container } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), bollinger: true, macd: true, volumeProfile: true }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/^BB /)).toBeTruthy();
    });
    // Chips de arriba (las leyendas de subpanel usan otro formato).
    const chips = container.querySelector('.lw-chips') as HTMLElement;
    expect(within(chips).getByText(/^RSI /)).toBeTruthy();
    expect(within(chips).getByText(/^MACD /)).toBeTruthy();
    expect(within(chips).getByText(/^POC /)).toBeTruthy();
  });

  it('renders saved fibs as bounded segments without crashing', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;1000000;100;2000000;110;#FFFFFF;1;0+0.5+1;0;0',
    );
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('anchors drawing from any pixel, not just bars', async () => {
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: 'FIBO' },
    });
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={{ ...indicators(), drawTool: 'FIBO' }} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 350, clientY: 100, bubbles: true }));
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      subscribeClick: ReturnType<typeof vi.fn>;
    };
    const handler = chartApi.subscribeClick.mock.calls[0]?.[0] as ((p: object) => void) | undefined;
    handler?.({});
    await waitFor(() => {
      expect(screen.getByText(/segundo punto/)).toBeTruthy();
    });
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: null },
    });
  });

  it('paints saved fibs without diagonal baseline', async () => {
    chartMocks.createdSeries.length = 0;
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/\.5 \(/)).toBeTruthy();
    });
    const diagonals = chartMocks.createdSeries.flatMap((s) => s.setData.mock.calls.map((c) => c[0]));
    const baseline = diagonals.filter(
      (pts) => Array.isArray(pts) && pts.length === 2 && pts[0]?.value === 100 && pts[1]?.value === 110,
    );
    expect(baseline).toEqual([]);
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('shows anchor dots on fib hover', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(container.querySelectorAll('.fib-anchor-dot').length).toBe(2);
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('drags fib anchors and persists on mouseup', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(container.querySelectorAll('.fib-anchor-dot').length).toBe(2);
    });
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 250, button: 0, bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 260, bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await waitFor(() => {
      const raw = localStorage.getItem('fib_overlays_BTCUSDT') ?? '';
      expect(raw).toContain(';120000;150;');
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('does not drag locked fibs', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;1',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(container.querySelectorAll('.fib-anchor-dot.locked').length).toBe(2);
    });
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 250, button: 0, bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 260, bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(localStorage.getItem('fib_overlays_BTCUSDT')).toBe('f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;1');
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('labels fib levels with ratio and price, without dot markers', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/\.5 \(/)).toBeTruthy();
    });
    const { createSeriesMarkers } = await import('lightweight-charts');
    const primitives = vi.mocked(createSeriesMarkers).mock.results.map((r) => r.value);
    const lastMarkers = primitives.at(-1)?.setMarkers as ReturnType<typeof vi.fn> | undefined;
    const payload = lastMarkers?.mock.calls.at(-1)?.[0] as { text?: string }[] | undefined;
    const ratioTexts = (payload ?? []).map((m) => m.text ?? '').filter((t) => /^(\.\d+|\d+(\.\d+)?)$/.test(t));
    expect(ratioTexts).toEqual([]);
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('shows empty state without data', async () => {
    const { fetchCandles } = await import('@/api/market');
    vi.mocked(fetchCandles).mockResolvedValueOnce([]);
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/Sin datos/)).toBeTruthy();
    });
  });

  it('frames the last candles instead of fitting everything', async () => {
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    expect(chartMocks.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 0, to: 68 });
  });

  it('zooms price vertically on wheel over the price axis', async () => {
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    chartMocks.setVisibleRange.mockClear();
    el.dispatchEvent(new WheelEvent('wheel', { clientX: 380, clientY: 250, deltaY: -100, bubbles: true, cancelable: true }));
    expect(chartMocks.setVisibleRange).toHaveBeenCalledTimes(1);
    const range = chartMocks.setVisibleRange.mock.calls[0]?.[0] as { from: number; to: number };
    expect(range.to - range.from).toBeLessThan(20);
  });

  it('leaves native horizontal zoom alone on wheel over candles', async () => {
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    chartMocks.setVisibleRange.mockClear();
    el.dispatchEvent(new WheelEvent('wheel', { clientX: 100, clientY: 250, deltaY: -100, bubbles: true, cancelable: true }));
    expect(chartMocks.setVisibleRange).not.toHaveBeenCalled();
  });

  it('shows combined price+countdown tag, dimmed countdown, native tag off', async () => {
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/cierra en/i)).toBeTruthy();
    });
    // Un solo cuadro en el eje (solo precio + contador); el nombre flota
    // sobre el grafico al final de la linea, sin repetir el precio.
    expect(screen.getByText('BTC/USDT')).toBeTruthy();
    expect(screen.getByText('BTC/USDT')).toHaveStyle({ right: '64px' });
    expect(container.querySelector('.lw-price-tag-main')?.textContent).toBe('160.00');
    // Encuadrado al eje, pegado a la derecha.
    expect(screen.getByLabelText(/cierra en/i)).toHaveStyle({ width: '60px', right: '0px' });
    // Contador apenitas apagado (0.9) frente al precio solido.
    const dim = container.querySelector('.lw-price-tag-countdown')?.getAttribute('style') ?? '';
    expect(dim).toContain('rgba(0, 192, 135, 0.9)');
    expect(container.querySelector('.lw-price-tag-main')?.getAttribute('style')).not.toContain('rgba');
    // Tag nativo apagado: el cuadro es propio.
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      addSeries: ReturnType<typeof vi.fn>;
    };
    const candleCall = chartApi.addSeries.mock.calls.find((c) => c[0] === 'candlestick');
    expect(candleCall?.[1]).toMatchObject({ lastValueVisible: false });
  });

  it('hides the price tag while the crosshair label passes over it', async () => {
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    await waitFor(() => {
      expect(screen.getByLabelText(/cierra en/i)).toBeTruthy();
    });
    // El cuadro queda en y=250 (mock): el mouse a esa altura lo esconde.
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/cierra en/i)).toBeNull();
    });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true }));
    await waitFor(() => {
      expect(screen.getByLabelText(/cierra en/i)).toBeTruthy();
    });
  });

  it('shows app-style legends inside each subpanel', async () => {
    render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), stochRsi: true, macd: true }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    // Stoch K/D con 2 decimales como la app.
    await waitFor(() => {
      expect(screen.getByText(/K: \d+\.\d{2}/)).toBeTruthy();
    });
    expect(screen.getByText(/D: \d+\.\d{2}/)).toBeTruthy();
    // RSI + MA con 2 decimales.
    expect(screen.getByText(/RSI: \d+\.\d{2}/)).toBeTruthy();
    // MACD con titulo de parametros y decimales por magnitud.
    expect(screen.getByText(/MACD\(12,26,9\)/)).toBeTruthy();
    // Volumen total compacto en su panel.
    expect(screen.getByText('1K')).toBeTruthy();
    // Niveles punteados 80/20 y 70/30 creados como series.
    const diagonals = chartMocks.createdSeries.flatMap((s) => s.setData.mock.calls.map((c) => c[0]));
    const hasLevel = (v: number) => diagonals.some(
      (pts) => Array.isArray(pts) && pts.length === 2 && pts.every((p) => p?.value === v),
    );
    expect(hasLevel(80)).toBe(true);
    expect(hasLevel(20)).toBe(true);
    expect(hasLevel(70)).toBe(true);
    expect(hasLevel(30)).toBe(true);
  });

  it('shows MA end tags with dotted leaders and no overlaps', async () => {
    const { container } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{
          ...indicators(),
          smaLines: [
            { id: 'sma-5', period: 5, color: '#00BCD4', enabled: true },
            { id: 'sma-9', period: 9, color: '#FF9800', enabled: true },
          ],
        }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    // Solo etiqueta, sin valor.
    await waitFor(() => {
      expect(container.querySelectorAll('.ma-tag').length).toBe(2);
    });
    expect(screen.getByText('SMA5')).toBeTruthy();
    expect(screen.getByText('SMA9')).toBeTruthy();
    // Un líder quebrado por tag (45° + horizontal), del color de su línea.
    const leaders = container.querySelectorAll('.ma-leaders polyline');
    expect(leaders.length).toBe(2);
    expect(leaders[0]?.getAttribute('stroke-dasharray')).toBe('2 3');
    expect(leaders[0]?.getAttribute('stroke')).toBe('#00BCD4');
    expect(leaders[0]?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(3);
    // Texto y borde del color de la línea.
    expect(screen.getByText('SMA5')).toHaveStyle({ color: 'rgb(0, 188, 212)' });
    // Sin pisarse: gap vertical mínimo de tag + aire.
    const tops = [...container.querySelectorAll('.ma-tag')]
      .map((n) => parseFloat((n as HTMLElement).style.top))
      .sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]! - tops[i - 1]!).toBeGreaterThanOrEqual(24);
    }
  });

  it('paints other-TF MAs solid bone-white with tag and leader', async () => {
    const { container } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{
          ...indicators(),
          smaLines: [{ id: 'sma-5', period: 5, color: '#00BCD4', enabled: true, timeframe: '5m' }],
        }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelectorAll('.ma-tag').length).toBe(1);
    });
    // Línea sólida (sin lineStyle) en hueso: el punteado es solo del líder.
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      addSeries: ReturnType<typeof vi.fn>;
    };
    const htfCall = chartApi.addSeries.mock.calls.find((c) => c[1]?.color === '#f0eeeb');
    expect(htfCall).toBeTruthy();
    expect(htfCall?.[1]).not.toHaveProperty('lineStyle');
    // Tag y líder en hueso.
    expect(screen.getByText('SMA5 5m')).toHaveStyle({ color: 'rgb(240, 238, 235)' });
    const leaders = container.querySelectorAll('.ma-leaders polyline');
    expect(leaders.length).toBe(1);
    expect(leaders[0]?.getAttribute('stroke')).toBe('#f0eeeb');
    expect(leaders[0]?.getAttribute('stroke-dasharray')).toBe('2 3');
  });

  it('shows selected fib bar on hover', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: 'Opciones del fibo seleccionado' })).toBeTruthy();
    });
    expect(screen.getByLabelText('Mover barra')).toBeTruthy();
    expect(screen.getByLabelText('Color del fibo')).toBeTruthy();
    expect(screen.getByLabelText('Grosor de línea')).toBeTruthy();
    expect(screen.getByLabelText('Niveles del fibo')).toBeTruthy();
    expect(screen.getByLabelText('Bloquear fibo')).toBeTruthy();
    expect(screen.getByLabelText('Borrar fibo')).toBeTruthy();
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('deletes fib from floating bar', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(screen.getByLabelText('Borrar fibo')).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText('Borrar fibo'));
    await waitFor(() => {
      expect(localStorage.getItem('fib_overlays_BTCUSDT')).toBe('');
    });
    expect(screen.queryByRole('toolbar', { name: 'Opciones del fibo seleccionado' })).toBeNull();
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('locks fib from floating bar', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(screen.getByLabelText('Bloquear fibo')).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText('Bloquear fibo'));
    await waitFor(() => {
      expect(localStorage.getItem('fib_overlays_BTCUSDT')).toContain(';0;1');
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('changes fib color and width from floating bar', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(screen.getByLabelText('Color del fibo')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Color del fibo'), { target: { value: '#ff0000' } });
    await waitFor(() => {
      expect((localStorage.getItem('fib_overlays_BTCUSDT') ?? '').toLowerCase()).toContain('#ff0000');
    });
    fireEvent.change(screen.getByLabelText('Grosor de línea'), { target: { value: '3' } });
    await waitFor(() => {
      expect(localStorage.getItem('fib_overlays_BTCUSDT')).toContain(';3;');
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('toggles fib levels from settings modal', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(screen.getByLabelText('Niveles del fibo')).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText('Niveles del fibo'));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Ajustes de Fibonacci' })).toBeTruthy();
    });
    expect(screen.getByLabelText('Nivel 0.5')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Nivel 0.5'));
    await waitFor(() => {
      expect(localStorage.getItem('fib_overlays_BTCUSDT')).not.toContain('0.5');
    });
    fireEvent.click(screen.getByText('Listo'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ajustes de Fibonacci' })).toBeNull();
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });
});
