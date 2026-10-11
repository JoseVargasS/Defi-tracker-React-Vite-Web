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
  createdSeries: [] as { setData: ReturnType<typeof vi.fn>; createPriceLine: ReturnType<typeof vi.fn> }[],
};

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'candlestick',
  HistogramSeries: 'histogram',
  LineSeries: 'line',
  AreaSeries: 'area',
  CrosshairMode: { Normal: 0 },
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
  createChart: vi.fn(() => {
    // timeScale estable por chart para poder personalizarlo por test.
    const timeScale = {
      fitContent: vi.fn(),
      resetTimeScale: vi.fn(),
      setVisibleLogicalRange: chartMocks.setVisibleLogicalRange,
      getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 100 })),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      timeToCoordinate: vi.fn(() => 100),
      // Fiel a la libreria real: 60 velas en x = 20 + i*9, fuera de ellas null.
      coordinateToTime: vi.fn((x: number) => {
        const i = Math.ceil((x - 20) / 9);
        return i >= 0 && i < 60 ? (i + 1) * 60 : null;
      }),
      coordinateToLogical: vi.fn((x: number) => (x - 20) / 9),
      logicalToCoordinate: vi.fn((l: number) => 20 + l * 9),
    };
    return {
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
      timeScale: () => timeScale,
      subscribeCrosshairMove: vi.fn(),
      subscribeClick: vi.fn(),
      unsubscribeClick: vi.fn(),
      applyOptions: vi.fn(),
      remove: vi.fn(),
      removeSeries: vi.fn(),
      resize: vi.fn(),
    };
  }),
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

  it('follows crosshair with RSI pane values, not the last candle', async () => {
    const { fetchCandles } = await import('@/api/market');
    const { calculateRsi, rsiMaOf, toCandleList } = await import('@/lib/chart/rsi');
    const rows = Array.from({ length: 60 }, (_, i) => {
      const close = 100 + Math.sin(i / 2.5) * 8 + i * 0.15;
      return [
        (i + 1) * 60_000, close - 1, close + 1, close - 2, close, 1000,
        (i + 1) * 60_000, 100000, 1, 500, 50000, 0,
      ];
    });
    vi.mocked(fetchCandles).mockResolvedValueOnce(rows);
    const { container } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), rsiEnabled: true }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    const candles = toCandleList(rows);
    const rsiAll = calculateRsi(candles, 14);
    const maAll = rsiMaOf(rsiAll, 14);
    const expectedRsi = rsiAll[30]!;
    const expectedMa = maAll[30]!;
    // Espera al pintado (leyenda con los valores de la ultima vela).
    await waitFor(() => {
      expect(screen.getByText(`MA: ${maAll[59]!.toFixed(2)}`)).toBeTruthy();
    });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      subscribeCrosshairMove: ReturnType<typeof vi.fn>;
    };
    const cross = chartApi.subscribeCrosshairMove.mock.calls[0]?.[0] as
      ((p: { time?: unknown }) => void) | undefined;
    // Cruceta sobre la vela 30 (todas las anteriores a la ultima).
    cross?.({ time: 31 * 60 });
    await waitFor(() => {
      expect(screen.getByText(`RSI: ${expectedRsi.toFixed(2)}`)).toBeTruthy();
    });
    expect(screen.getByText(`MA: ${expectedMa.toFixed(2)}`)).toBeTruthy();
    // La media del RSI va en amarillo notorio, no gris.
    expect((screen.getByText(`MA: ${expectedMa.toFixed(2)}`) as HTMLElement).style.color)
      .toBe('rgb(255, 214, 10)');
    void container;
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

  it('renders fib levels as SVG overlay without touching chart series', async () => {
    chartMocks.createdSeries.length = 0;
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/\.5 \(/)).toBeTruthy();
    });
    const lines = container.querySelectorAll('.fib-level-line');
    expect(lines.length).toBe(2);
    for (const l of lines) {
      expect(l.getAttribute('stroke')).toBe('#FFFFFF');
      expect(l.getAttribute('x1')).toBe('100');
      expect(l.getAttribute('x2')).toBe('100');
    }
    const diagonals = chartMocks.createdSeries.flatMap((s) => s.setData.mock.calls.map((c) => c[0]));
    const baseline = diagonals.filter(
      (pts) => Array.isArray(pts) && pts.length === 2 && pts[0]?.value === 100 && pts[1]?.value === 110,
    );
    expect(baseline).toEqual([]);
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('bounds fib overlay lines to anchors with real geometry', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      timeScale: () => { timeToCoordinate: ReturnType<typeof vi.fn> };
    };
    chartApi.timeScale().timeToCoordinate.mockImplementation((t: unknown) => (
      t === 60 ? 20 : t === 3600 ? 551 : 100
    ));
    const el = container.querySelector('.lw-container') as HTMLElement;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    // Hover sobre el nivel para re-derivar el overlay con el mapeo propio.
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 250, bubbles: true }));
    await waitFor(() => {
      const lines = container.querySelectorAll('.fib-level-line');
      expect(lines.length).toBe(2);
      for (const l of lines) {
        expect(l.getAttribute('x1')).toBe('20');
        expect(l.getAttribute('x2')).toBe('551');
        expect(l.getAttribute('stroke')).toBe('#FFFFFF');
      }
    });
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

  it('paints solid black bands behind oscillator slots', async () => {
    chartMocks.createdSeries.length = 0;
    render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), volume: true, stochRsi: true, rsiEnabled: true, macd: true }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      addSeries: ReturnType<typeof vi.fn>;
    };
    const calls = chartApi.addSeries.mock.calls;
    const areaIdx: number[] = [];
    calls.forEach((c, i) => {
      if (c[0] === 'area') {
        areaIdx.push(i);
        expect(c[1].topColor).toBe('#000000');
        expect(c[1].bottomColor).toBe('#000000');
      }
    });
    // osc + macd (volumen va con el precio, sin banda).
    expect(areaIdx.length).toBe(2);
    for (const i of areaIdx) {
      const data = chartMocks.createdSeries[i]!.setData.mock.calls[0]?.[0] as
        { time: number; value: number }[] | undefined;
      expect(data?.length).toBe(60);
      const values = data!.map((p) => p.value);
      expect(new Set(values).size).toBe(1);
    }
    // La banda del osc cubre con el techo 100 (Stoch/RSI van de 0 a 100).
    const oscData = chartMocks.createdSeries[areaIdx[0]!]!.setData.mock.calls[0]?.[0] as
      { value: number }[];
    expect(oscData[0]!.value).toBe(100);
  });

  it('paints no bands without oscillators', async () => {
    render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), volume: true, stochRsi: false, rsiEnabled: false, macd: false }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      addSeries: ReturnType<typeof vi.fn>;
    };
    expect(chartApi.addSeries.mock.calls.map((c) => c[0])).not.toContain('area');
  });

  it('pads whitespace candles into the future for free drawing', async () => {
    chartMocks.createdSeries.length = 0;
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    // La primera serie es la de velas: 60 reales + 500 vacias (paso 60s).
    const candle = chartMocks.createdSeries[0]!;
    const display = candle.setData.mock.calls[0]?.[0] as { time: number }[] | undefined;
    expect(display?.length).toBe(560);
    expect(display?.[59]?.time).toBe(3600);
    expect(display?.[559]?.time).toBe(3600 + 500 * 60);
    expect(Object.keys(display?.[559] ?? {})).toEqual(['time']);
  });

  it('migrates off-grid saved fibos to the bar grid on paint', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;61000;100;3650000;110;#FFFFFF;1;0.5+1;0;0',
    );
    render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    // 61000 -> 60000 y 3650000 -> 3660000 (paso 60s), una sola re-grabada.
    await waitFor(() => {
      expect(localStorage.getItem('fib_overlays_BTCUSDT')).toBe(
        'f1;60000;100;3660000;110;#FFFFFF;1;0.5+1;0;0',
      );
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('floats the fib toolbar next to the selected fibo', async () => {
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
      const bar = container.querySelector('.fib-selected-bar') as HTMLElement | null;
      expect(bar).toBeTruthy();
      // timeToCoordinate mocked 100, priceToCoordinate 250, ancho 400.
      expect(bar?.style.left).toBe('8px');
      expect(bar?.style.top).toBe('194px');
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('deletes a fibo without moving the chart view', async () => {
    const { createChart } = await import('lightweight-charts');
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
    // Hover sobre el nivel para seleccionar el fibo y mostrar su barra.
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(container.querySelector('.fib-selected-bar')).toBeTruthy();
    });
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      timeScale: () => { setVisibleLogicalRange: ReturnType<typeof vi.fn> };
    };
    const setRange = chartApi.timeScale().setVisibleLogicalRange;
    setRange.mockClear();
    const { getByLabelText } = within(container);
    // Hay 2 numeros (niveles 0.5 y 1) antes de borrar.
    await waitFor(() => {
      expect(container.querySelectorAll('.fib-label').length).toBe(2);
    });
    fireEvent.click(getByLabelText('Borrar fibo'));
    await waitFor(() => {
      expect(localStorage.getItem('fib_overlays_BTCUSDT') ?? '').not.toContain('f1;');
    });
    // Borrar no toca el rango visible: la vista se queda donde estaba.
    expect(setRange).not.toHaveBeenCalled();
    // ...y no quedan numeros huerfanos del fibo.
    expect(container.querySelectorAll('.fib-label').length).toBe(0);
    expect(container.querySelectorAll('.fib-level-line').length).toBe(0);
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('updates fib labels when toggling levels off', async () => {
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
      expect(container.querySelectorAll('.fib-label').length).toBe(2);
    });
    fireEvent.click(within(container).getByLabelText('Niveles del fibo'));
    fireEvent.click(screen.getByLabelText('Nivel 0.5'));
    fireEvent.click(screen.getByText('Listo'));
    await waitFor(() => {
      expect(container.querySelectorAll('.fib-label').length).toBe(1);
    });
    expect(container.querySelectorAll('.fib-level-line').length).toBe(1);
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('remembers the floating bar position per fibo', async () => {
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
      expect(container.querySelector('.fib-selected-bar')).toBeTruthy();
    });
    // Arrastra la barra a (40, 10): jsdom da rects en cero.
    const handle = container.querySelector('.fib-bar-handle') as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 20, clientY: 200, button: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 210, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await waitFor(() => {
      expect((container.querySelector('.fib-selected-bar') as HTMLElement)?.style.left).toBe('40px');
    });
    // Deselecciona (click donde no hay fibo) y reselecciona: vuelve al mismo sitio.
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 350, clientY: 400, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 350, clientY: 400, button: 0, bubbles: true }));
    await waitFor(() => {
      expect(container.querySelector('.fib-selected-bar')).toBeNull();
    });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    await waitFor(() => {
      const bar = container.querySelector('.fib-selected-bar') as HTMLElement | null;
      expect(bar?.style.left).toBe('40px');
      expect(bar?.style.top).toBe('10px');
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
      expect(raw).toContain(';960000;150;');
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('drags fibo overlay without touching chart series', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      removeSeries: ReturnType<typeof vi.fn>;
    };
    chartApi.removeSeries.mockClear();
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 250, button: 0, bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 260, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 260, bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await waitFor(() => {
      const raw = localStorage.getItem('fib_overlays_BTCUSDT') ?? '';
      expect(raw).toContain(';1020000;150;');
    });
    // Via rapida: solo setData, sin recrear series por frame.
    expect(chartApi.removeSeries).not.toHaveBeenCalled();
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('moves the whole fibo body without panning the chart', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;0',
    );
    const { container } = render(<LightweightChart symbol="BTCUSDT" interval="1h" indicators={indicators()} overlaysTick={0} resetSignal={0} />);
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      timeScale: () => { timeToCoordinate: ReturnType<typeof vi.fn> };
      applyOptions: ReturnType<typeof vi.fn>;
    };
    // Geometria propia: anclas en x=40 y x=400, linea entre ellas.
    const timeToCoordinate = chartApi.timeScale().timeToCoordinate;
    timeToCoordinate.mockImplementation((t: unknown) => (
      t === 60 ? 40 : t === 3600 ? 400 : 100
    ));
    const el = container.querySelector('.lw-container') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    // Click en el cuerpo (x=220, lejos de ambas anclas) y arrastre +40px = +4 velas.
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 220, clientY: 250, bubbles: true }));
    await waitFor(() => {
      expect(container.querySelector('.fib-selected-bar')).toBeTruthy();
    });
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 220, clientY: 250, button: 0, bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 250, bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await waitFor(() => {
      const raw = localStorage.getItem('fib_overlays_BTCUSDT') ?? '';
      // Ambas anclas se trasladan +240000ms (4 velas de 60s), misma forma.
      expect(raw).toContain('f1;300000;100;3840000;110;');
    });
    // El paneo se bloqueo durante el arrastre (el chart no se mueve).
    const applyCalls = chartApi.applyOptions.mock.calls.map((c) => c[0]);
    expect(applyCalls).toContainEqual({ handleScroll: false, handleScale: false });
    expect(applyCalls).toContainEqual({ handleScroll: true, handleScale: true });
    localStorage.removeItem('fib_overlays_BTCUSDT');
  });

  it('anchors point B in whitespace beyond the last candle', async () => {
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: 'FIBO' },
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
    const { container, rerender } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), drawTool: 'FIBO' }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      subscribeClick: ReturnType<typeof vi.fn>;
      timeScale: () => {
        timeToCoordinate: ReturnType<typeof vi.fn>;
        logicalToCoordinate: ReturnType<typeof vi.fn>;
      };
    };
    // Solo las 60 velas existen en la escala; el futuro sale por extrapolado.
    const known = new Set(Array.from({ length: 60 }, (_, i) => (i + 1) * 60));
    chartApi.timeScale().timeToCoordinate.mockImplementation((t: unknown) => (
      typeof t === 'number' && known.has(t) ? 20 + (t / 60 - 1) * 9 : null
    ));
    const click = chartApi.subscribeClick.mock.calls[0]?.[0] as ((p: object) => void) | undefined;
    // Punto A sobre una vela (x=100) y punto B en el vacio (x=700,
    // mas alla de la ultima vela en x=551).
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    click?.({});
    await waitFor(() => {
      expect(screen.getByText(/segundo punto/)).toBeTruthy();
    });
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 250, bubbles: true }));
    // El fantasma se pinta en pixeles sin tocar el chart.
    await waitFor(() => {
      expect(container.querySelectorAll('.fib-ghost-line').length).toBe(7);
    });
    click?.({});
    await waitFor(() => {
      const raw = localStorage.getItem('fib_overlays_BTCUSDT') ?? '';
      expect(raw).not.toBe('');
      const parts = raw.split('|')[0]!.split(';');
      const endTime = Number(parts[3]);
      // La ultima vela esta en 3600000ms: B debe quedar mas alla, sin clamp.
      expect(endTime).toBeGreaterThan(3600000);
      // Magnet: el ancla cae sobre la grilla (multiplo del paso 60s).
      expect((endTime - 60000) % 60000).toBe(0);
    });
    // El overlay llega mas alla sin series: x2 extrapolado (704), x1 en vela.
    // (la app real re-renderiza con overlaysTick nuevo tras guardar).
    rerender(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), drawTool: null }}
        overlaysTick={1}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      const lines = container.querySelectorAll('.fib-level-line');
      expect(lines.length).toBeGreaterThan(0);
      const last = lines[0]!;
      expect(last.getAttribute('x1')).toBe('101');
      expect(last.getAttribute('x2')).toBe('704');
    });
    localStorage.removeItem('fib_overlays_BTCUSDT');
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: null },
    });
  });

  it('previews segment and rectangle strokes while drawing', async () => {
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: 'RECT' },
    });
    const { container } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), drawTool: 'RECT' }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      subscribeClick: ReturnType<typeof vi.fn>;
    };
    const click = chartApi.subscribeClick.mock.calls[0]?.[0] as ((p: object) => void) | undefined;
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    click?.({});
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 300, bubbles: true }));
    await waitFor(() => {
      const rects = container.querySelectorAll('rect.fib-ghost-line');
      expect(rects.length).toBe(1);
      expect(rects[0]!.getAttribute('x')).toBe('100');
      expect(rects[0]!.getAttribute('width')).toBe('100');
    });
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: null },
    });
  });

  it('does not drag locked fibs', async () => {
    localStorage.setItem(
      'fib_overlays_BTCUSDT',
      'f1;60000;100;3600000;110;#FFFFFF;1;0.5+1;0;1',
    );
  it('previews measure range with live label while drawing', async () => {
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: 'MEASURE' },
    });
    const { container } = render(
      <LightweightChart
        symbol="BTCUSDT"
        interval="1h"
        indicators={{ ...indicators(), drawTool: 'MEASURE' }}
        overlaysTick={0}
        resetSignal={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/C 160\.00/)).toBeTruthy();
    });
    const el = container.querySelector('.lw-container') as HTMLElement;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    const { createChart } = await import('lightweight-charts');
    const chartApi = vi.mocked(createChart).mock.results.at(-1)?.value as unknown as {
      subscribeClick: ReturnType<typeof vi.fn>;
    };
    const click = chartApi.subscribeClick.mock.calls[0]?.[0] as ((p: object) => void) | undefined;
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 250, bubbles: true }));
    click?.({});
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 300, bubbles: true }));
    await waitFor(() => {
      const label = container.querySelector('.measure-ghost-label');
      expect(label?.textContent).toContain('12 velas');
      expect(label?.textContent).toContain('%');
    });
    click?.({});
    await waitFor(() => {
      const label = container.querySelector('.measure-label');
      expect(label?.textContent).toContain('12 velas');
    });
    expect(container.querySelector('.measure-ghost-label')).toBeNull();
    useMarketStore.setState({
      chartIndicators: { ...indicators(), drawTool: null },
    });
  });

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
    expect((screen.getByText('BTC/USDT') as HTMLElement).style.right).toBe('64px');
    expect(container.querySelector('.lw-price-tag-main')?.textContent).toBe('160.00');
    // Encuadrado al eje, pegado a la derecha.
    const closeTag = screen.getByLabelText(/cierra en/i) as HTMLElement;
    expect(closeTag).toBeTruthy();
    expect(closeTag.style.width).toBe('60px');
    expect(closeTag.style.right).toBe('0px');
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
    expect((screen.getByText('SMA5') as HTMLElement).style.color).toBe('rgb(0, 188, 212)');
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
    expect((screen.getByText('SMA5 5m') as HTMLElement).style.color).toBe('rgb(240, 238, 235)');
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
