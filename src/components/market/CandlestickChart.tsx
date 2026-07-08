/* eslint-disable @typescript-eslint/no-explicit-any */
// ponytail: Chart.js types are stricter than our local ChartDatasetLike; casts are intentional
import { useRef, useEffect, useCallback } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  CategoryScale,
  Tooltip,
  Filler,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import 'chartjs-chart-financial';
import { fetchKlines, fetchLatestKlines } from '@/api/binance';
import type { Candle, XY, KlineRaw } from '@/lib/chart/normalize';
import { normalizeKline } from '@/lib/chart/normalize';
import {
  CHART_PAGINATION_STEP,
  CHART_EDGE_THRESHOLD_RATIO,
  MAX_CHART_BAR_COUNT,
  intervalBarCount,
  intervalAggregate,
} from '@/lib/config';
import {
  CHART_THEME,
  calculateBollingerBands,
  calculateStochRSI,
  calculateVolume,
  calculateSMA,
  calculateEMA,
} from '@/lib/chart/indicators';
import {
  crosshairPlugin,
  currentPricePlugin,
  indicatorLegendPlugin,
  fixedRangeVolumeProfilePlugin,
  measureRangePlugin,
  createAdvancedTooltipPlugin,
  rightScaleBackgroundPlugin,
} from '@/lib/chart/plugins';
import type { EnhancedChart, ChartDatasetLike, MeasurePoint } from '@/lib/chart/types';
import type { ChartIndicatorsState } from '@/lib/chart/types';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  CategoryScale,
  Tooltip,
  Filler,
  zoomPlugin,
);

export interface CandlestickChartProps {
  symbol: string | null;
  interval: string;
  indicators: ChartIndicatorsState;
  measureActive: boolean;
  resetSignal: number;
}

interface TechnicalSeries {
  bands: { upper: XY[]; middle: XY[]; lower: XY[] };
  volume: { x: number; y: number; q: number; color: string }[];
  stochRsi: { k: XY[]; d: XY[] };
  sma: { 100: XY[]; 200: XY[] };
  ema: { 100: XY[]; 200: XY[] };
}

const CANDLE_COLORS = {
  up: CHART_THEME.up,
  down: CHART_THEME.down,
  unchanged: CHART_THEME.neutral,
};

const PANEL_STACK = 'market-panels';

const timeUnitByInterval = (interval: string) => {
  if (['3M', '1M'].includes(interval)) return 'month';
  if (interval === '1w') return 'week';
  if (['5d', '3d', '1d'].includes(interval)) return 'day';
  if (['12h', '4h', '1h'].includes(interval)) return 'hour';
  return 'minute';
};

const buildTechnicalSeries = (data: Candle[]): TechnicalSeries => ({
  bands: calculateBollingerBands(data),
  volume: calculateVolume(data),
  stochRsi: calculateStochRSI(data),
  sma: {
    100: calculateSMA(data, 100),
    200: calculateSMA(data, 200),
  },
  ema: {
    100: calculateEMA(data, 100),
    200: calculateEMA(data, 200),
  },
});

const horizontalLevel = (candles: Candle[], value: number): XY[] =>
  candles.map((item) => ({ x: item.x, y: value }));

function buildDatasets(
  symbol: string,
  candles: Candle[],
  series: TechnicalSeries,
  indicators: ChartIndicatorsState,
): ChartDatasetLike[] {
  const datasets: ChartDatasetLike[] = [
    {
      label: symbol,
      type: 'candlestick',
      data: candles,
      yAxisID: 'price',
      color: CANDLE_COLORS,
      borderColor: CANDLE_COLORS,
      wickColor: CANDLE_COLORS,
      backgroundColor: CANDLE_COLORS,
      backgroundColors: CANDLE_COLORS,
      borderColors: CANDLE_COLORS,
      wickColors: CANDLE_COLORS,
      borderWidth: 0,
      order: 1,
    },
  ];

  if (indicators.bollinger) {
    datasets.push(
      {
        label: 'BB Upper',
        type: 'line',
        data: series.bands.upper,
        yAxisID: 'price',
        borderColor: CHART_THEME.bbLine,
        borderWidth: 1.1,
        pointRadius: 0,
        fill: false,
        order: 2,
      },
      {
        label: 'BB Lower',
        type: 'line',
        data: series.bands.lower,
        yAxisID: 'price',
        borderColor: CHART_THEME.bbLine,
        backgroundColor: CHART_THEME.bbFill,
        borderWidth: 1.1,
        pointRadius: 0,
        fill: '-1',
        order: 2,
      },
      {
        label: 'BB Basis',
        type: 'line',
        data: series.bands.middle,
        yAxisID: 'price',
        borderColor: CHART_THEME.bbBasis,
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        order: 2,
      },
    );
  }

  if (indicators.volume) {
    datasets.push({
      label: 'Volume',
      type: 'bar',
      data: series.volume,
      yAxisID: 'volume',
      backgroundColor: series.volume.map((item) => `${item.color}66`),
      borderColor: series.volume.map((item) => `${item.color}bb`),
      borderWidth: 0,
      barPercentage: 1,
      categoryPercentage: 0.82,
      order: 20,
    });
  }

  if (indicators.stochRsi) {
    datasets.push(
      {
        label: 'Stoch RSI %K',
        type: 'line',
        data: series.stochRsi.k,
        yAxisID: 'stochRsi',
        borderColor: CHART_THEME.stochK,
        borderWidth: 1.4,
        pointRadius: 0,
        tension: 0.18,
        order: 30,
      },
      {
        label: 'Stoch RSI %D',
        type: 'line',
        data: series.stochRsi.d,
        yAxisID: 'stochRsi',
        borderColor: CHART_THEME.stochD,
        borderWidth: 1.2,
        pointRadius: 0,
        tension: 0.18,
        order: 31,
      },
      {
        label: 'Stoch RSI 80',
        type: 'line',
        data: horizontalLevel(candles, 80),
        yAxisID: 'stochRsi',
        borderColor: CHART_THEME.stochLevelOver,
        borderDash: [2, 2] as [number, number],
        borderWidth: 1,
        pointRadius: 0,
        order: 32,
      },
      {
        label: 'Stoch RSI 20',
        type: 'line',
        data: horizontalLevel(candles, 20),
        yAxisID: 'stochRsi',
        borderColor: CHART_THEME.stochLevelUnder,
        borderDash: [2, 2] as [number, number],
        borderWidth: 1,
        pointRadius: 0,
        order: 33,
      },
    );
  }

  if (indicators.smaEnabled) {
    datasets.push({
      label: `SMA ${indicators.smaPeriod}`,
      type: 'line',
      data: series.sma[indicators.smaPeriod as 100 | 200],
      yAxisID: 'price',
      borderColor: CHART_THEME.sma,
      borderWidth: 1.6,
      pointRadius: 0,
      fill: false,
      order: 5,
    });
  }

  if (indicators.emaEnabled) {
    datasets.push({
      label: `EMA ${indicators.emaPeriod}`,
      type: 'line',
      data: series.ema[indicators.emaPeriod as 100 | 200],
      yAxisID: 'price',
      borderColor: CHART_THEME.ema,
      borderWidth: 1.6,
      pointRadius: 0,
      fill: false,
      order: 6,
    });
  }

  return datasets;
}

function createScales(interval: string, indicators: ChartIndicatorsState) {
  return {
    x: {
      type: 'time' as const,
      time: { unit: timeUnitByInterval(interval) as 'month' | 'week' | 'day' | 'hour' | 'minute' },
      grid: { color: CHART_THEME.grid, tickLength: 0 },
      ticks: {
        color: CHART_THEME.muted,
        maxRotation: 0,
        autoSkipPadding: 24,
        font: { size: 10, family: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif' },
      },
      border: { color: CHART_THEME.border, display: false },
    },
    price: {
      type: 'linear' as const,
      axis: 'y' as const,
      position: 'right' as const,
      stack: PANEL_STACK,
      stackWeight: 5.6,
      grid: { color: CHART_THEME.grid, drawTicks: false },
      ticks: {
        color: CHART_THEME.text,
        font: { size: 10, family: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif' },
        padding: 4,
        maxTicksLimit: 8,
        crossAlign: 'far',
      },
      border: { color: CHART_THEME.border, display: false },
    },
    volume: {
      type: 'linear' as const,
      axis: 'y' as const,
      display: indicators.volume,
      position: 'right' as const,
      stack: PANEL_STACK,
      stackWeight: indicators.volume ? 1.35 : 0,
      beginAtZero: true,
      grid: { color: CHART_THEME.volGrid, drawTicks: false },
      ticks: {
        color: CHART_THEME.muted,
        font: { size: 9, family: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif' },
        padding: 4,
        callback: (value: number) => {
          return Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1,
          }).format(value);
        },
        maxTicksLimit: 3,
      },
      border: { color: CHART_THEME.border, display: false },
    },
    stochRsi: {
      type: 'linear' as const,
      axis: 'y' as const,
      display: indicators.stochRsi,
      position: 'right' as const,
      stack: PANEL_STACK,
      stackWeight: indicators.stochRsi ? 1.55 : 0,
      min: 0,
      max: 100,
      grid: { color: CHART_THEME.stochGrid, drawTicks: false },
      ticks: {
        color: CHART_THEME.muted,
        font: { size: 9, family: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif' },
        padding: 4,
        stepSize: 50,
      },
      border: { color: CHART_THEME.border, display: false },
    },
  };
}

const getNearestCandlePoint = (chart: EnhancedChart, x: number, y: number): MeasurePoint | null => {
  const priceScale = chart?.scales?.price;
  const xScale = chart?.scales?.x;
  const candles = chart?.data?.datasets?.[0]?.data || [];
  if (!priceScale || !xScale || !candles.length) return null;
  if (y < priceScale.top || y > priceScale.bottom) return null;

  let index = 0;
  const firstX = (candles[0] as unknown as { x: number }).x;
  let xPixel = xScale.getPixelForValue(firstX);
  let minDistance = Math.abs(x - xPixel);

  candles.forEach((candle, candleIndex: number) => {
    const pt = candle as unknown as { x: number };
    const candleX = xScale.getPixelForValue(pt.x);
    const distance = Math.abs(x - candleX);
    if (distance < minDistance) {
      index = candleIndex;
      xPixel = candleX;
      minDistance = distance;
    }
  });

  const lastPt = candles[index] as unknown as { x: number };
  return {
    index,
    x: lastPt.x,
    y: priceScale.getValueForPixel(y)!,
  };
};

export default function CandlestickChart({
  symbol,
  interval,
  indicators,
  measureActive,
  resetSignal,
}: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<EnhancedChart | null>(null);
  const rawDataRef = useRef<Candle[]>([]);
  const fullSeriesRef = useRef<TechnicalSeries | null>(null);
  const indicatorsRef = useRef(indicators);
  const measureActiveRef = useRef(measureActive);
  const loadingMoreRef = useRef(false);

  indicatorsRef.current = indicators;
  measureActiveRef.current = measureActive;

  // ponytail: when the user pans or zooms close to the leftmost edge, paginate more history from Binance
  const maybeLoadMore = useCallback(async (chart: EnhancedChart) => {
    if (loadingMoreRef.current) return;
    if (!chart) return;
    const xScale = chart.scales?.x;
    const data = chart.data.datasets[0]?.data as unknown as { x: number }[] | undefined;
    if (!xScale || !data || data.length === 0) return;
    if (data.length >= MAX_CHART_BAR_COUNT) return;

    const oldestX = data[0].x;
    const visibleMin = xScale.min;
    const visibleMax = xScale.max;
    const visibleRange = visibleMax - visibleMin;
    if (visibleRange <= 0) return;

    const distance = visibleMin - oldestX;
    if (distance > visibleRange * CHART_EDGE_THRESHOLD_RATIO) return;

    loadingMoreRef.current = true;
    try {
      const symbolKey = chart._symbol;
      const intervalKey = chart._interval;
      const newTotal = Math.min(data.length + CHART_PAGINATION_STEP, MAX_CHART_BAR_COUNT);
      const newRaw = await fetchKlines(symbolKey, intervalKey, newTotal);
      const newCandles = newRaw.map((k) => normalizeKline(k as unknown as KlineRaw));
      if (newCandles.length <= data.length) return;

      const newSeries = buildTechnicalSeries(newCandles);
      rawDataRef.current = newCandles;
      fullSeriesRef.current = newSeries;

      const oldMin = xScale.min;
      const oldMax = xScale.max;

      chart.data.datasets = buildDatasets(symbolKey, newCandles, newSeries, chart._indicators) as any;
      chart.update('none');

      try {
        chart.zoomScale('x', { min: oldMin, max: oldMax }, 'none');
      } catch { /* ignore */ }
    } catch (err) {
      console.warn('auto-load more klines failed:', err);
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (chart && resetSignal > 0) {
      try { chart.resetZoom('default'); } catch { /* ignore */ }
    }
  // ponytail: signal triggers only on bump; do not re-run on other deps
  }, [resetSignal]);

  useEffect(() => {
    if (!symbol) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartInstanceRef.current?.destroy?.();
    chartInstanceRef.current = null;

    let destroyed = false;

    (async () => {
      try {
        const fetchCount = intervalBarCount(interval);
        const raw = (await fetchKlines(symbol, interval, fetchCount))
          .map((k) => normalizeKline(k as unknown as KlineRaw))
          .slice(-fetchCount);
        if (destroyed) return;
        if (!raw.length) return;

        const fullSeries = buildTechnicalSeries(raw);
        const inds = indicatorsRef.current;
        const mActive = measureActiveRef.current;

        rawDataRef.current = raw;
        fullSeriesRef.current = fullSeries;

        const ctx = canvas.getContext('2d');
        if (!ctx || destroyed) return;

        const chart = new Chart(ctx, {
          type: 'candlestick',
          data: { datasets: buildDatasets(symbol, raw, fullSeries, inds) as any },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            interaction: { mode: 'nearest', intersect: false },
            layout: { padding: { top: 4, bottom: 0, left: 4, right: 14 } },
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
              zoom: {
                pan: {
                  enabled: !mActive,
                  mode: 'x',
                  scaleMode: 'y',
                  onPanStart: () => !measureActiveRef.current,
                  onPan: () => !measureActiveRef.current,
                  onPanComplete: ({ chart: c }) => { void maybeLoadMore(c as EnhancedChart); },
                },
                zoom: {
                  mode: 'x',
                  scaleMode: 'y',
                  wheel: {
                    enabled: !mActive,
                    speed: 0.12,
                  },
                  pinch: { enabled: true },
                  drag: { enabled: false },
                  onZoomStart: () => !measureActiveRef.current,
                  onZoomComplete: ({ chart: c }) => { void maybeLoadMore(c as EnhancedChart); },
                },
                limits: {
                  y: { min: 'original', max: 'original' },
                  x: { minRange: 6 },
                },
              },
            },
            scales: createScales(interval, inds) as any,
          },
          plugins: [
            rightScaleBackgroundPlugin,
            fixedRangeVolumeProfilePlugin,
            measureRangePlugin,
            crosshairPlugin,
            createAdvancedTooltipPlugin(),
            currentPricePlugin,
            indicatorLegendPlugin,
          ],
        });

        const enhanced = chart as unknown as EnhancedChart;
        Object.assign(enhanced, {
          _symbol: symbol,
          _interval: interval,
          _fullLastTimestamp: raw.at(-1)?.x ?? null,
          _indicators: { ...inds },
          _measure: { active: mActive, start: null, end: null, preview: null },
          _volumeProfileSettings: {},
        });

        if (destroyed) {
          enhanced.destroy();
          return;
        }

        chartInstanceRef.current = enhanced;

        // ponytail: measure tool replaces the plugin while active; only one system handles input at a time
        const downHandler = (event: PointerEvent) => {
          if (!measureActiveRef.current) return;
          const c = chartInstanceRef.current;
          const m = c?._measure;
          if (!m?.active || !c) return;

          const rect = canvas.getBoundingClientRect();
          const point = getNearestCandlePoint(
            c,
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
          if (!point) return;

          if (!m.start || m.end) {
            m.start = point;
            m.end = null;
            m.preview = null;
          } else {
            m.end = point;
            m.preview = null;
          }
          c.update('none');
        };

        const moveHandler = (event: PointerEvent) => {
          if (!measureActiveRef.current) return;
          const c = chartInstanceRef.current;
          const m = c?._measure;
          if (!c || !m?.active) return;
          if (m.start && !m.end) {
            const rect = canvas.getBoundingClientRect();
            m.preview = getNearestCandlePoint(
              c,
              event.clientX - rect.left,
              event.clientY - rect.top,
            );
            c.update('none');
          }
        };

        const dblClickHandler = () => {
          try { chart.resetZoom('default'); } catch { /* ignore */ }
        };

        (canvas as any)._downHandler = downHandler;
        (canvas as any)._moveHandler = moveHandler;
        (canvas as any)._dblClickHandler = dblClickHandler;

        canvas.addEventListener('pointerdown', downHandler);
        canvas.addEventListener('pointermove', moveHandler);
        canvas.addEventListener('dblclick', dblClickHandler);
      } catch (err) {
        if (!destroyed) console.error('CandlestickChart fetch error:', err);
      }
    })();

    return () => {
      destroyed = true;
      if (canvas) {
        const ec = canvas as any;
        if (ec._downHandler) canvas.removeEventListener('pointerdown', ec._downHandler);
        if (ec._moveHandler) canvas.removeEventListener('pointermove', ec._moveHandler);
        if (ec._dblClickHandler) canvas.removeEventListener('dblclick', ec._dblClickHandler);
        delete ec._downHandler;
        delete ec._moveHandler;
        delete ec._dblClickHandler;
      }
      try { chartInstanceRef.current?.destroy(); } catch { /* ignore */ }
      chartInstanceRef.current = null;
      rawDataRef.current = [];
      fullSeriesRef.current = null;
    };
  // ponytail: only symbol triggers full chart rebuild, interval uses fast path below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !symbol) return;

    let cancelled = false;
    (async () => {
      try {
        const fetchCount = intervalBarCount(interval);
        const raw = (await fetchKlines(symbol, interval, fetchCount))
          .map((k) => normalizeKline(k as unknown as KlineRaw))
          .slice(-fetchCount);
        if (cancelled || !raw.length) return;

        const fullSeries = buildTechnicalSeries(raw);

        rawDataRef.current = raw;
        fullSeriesRef.current = fullSeries;

        chart._interval = interval;
        chart._fullLastTimestamp = raw.at(-1)?.x ?? null;
        chart._indicators = { ...indicatorsRef.current };

        chart.data.datasets = buildDatasets(symbol, raw, fullSeries, indicatorsRef.current) as any;
        chart.options.scales = createScales(interval, indicatorsRef.current) as any;
        try { chart.resetZoom('default'); } catch { /* ignore */ }
        chart.update('none');
      } catch (err) {
        if (!cancelled) console.error('CandlestickChart interval update error:', err);
      }
    })();
    return () => { cancelled = true; };
  // ponytail: interval change reuses existing chart instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    const rawData = rawDataRef.current;
    const fullSeries = fullSeriesRef.current;
    if (!chart || !symbol || !rawData.length || !fullSeries) return;
    chart._indicators = { ...indicators };

    // ponytail: preserve the user's current zoom/pan so toggling an indicator doesn't reset the view
    const xScale = chart.scales?.x;
    const oldMin = xScale?.min;
    const oldMax = xScale?.max;
    const preserveView =
      oldMin != null && oldMax != null && Number.isFinite(oldMin) && Number.isFinite(oldMax);

    chart.options.scales = createScales(interval, indicators) as any;
    chart.data.datasets = buildDatasets(symbol, rawData, fullSeries, indicators) as any;
    chart.update('none');

    if (preserveView) {
      try {
        chart.zoomScale('x', { min: oldMin as number, max: oldMax as number }, 'none');
      } catch { /* ignore */ }
    }
  // ponytail: symbol/interval stable via refs, only indicators trigger rebuild
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !symbol) return;
    if (!chart._measure) {
      chart._measure = { active: false, start: null, end: null, preview: null };
    }
    chart._measure.active = measureActive;
    chart._measure.start = null;
    chart._measure.end = null;
    chart._measure.preview = null;
    const zoomOpts: any = chart.options.plugins?.zoom;
    if (zoomOpts) {
      if (zoomOpts.pan) zoomOpts.pan.enabled = !measureActive;
      if (zoomOpts.zoom?.wheel) zoomOpts.zoom.wheel.enabled = !measureActive;
      if (zoomOpts.zoom?.pinch) zoomOpts.zoom.pinch.enabled = !measureActive;
    }
    chart.update('none');
  // ponytail: symbol stable via ref, only measureActive triggers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureActive]);

  // ponytail: real-time poll every 5s — only fetches 1-2 klines, patches last candle in-place
  // skip aggregated intervals (5d, 3M) since Binance raw klines don't match the aggregation
  useEffect(() => {
    if (!symbol) return;
    if (intervalAggregate(interval)) return;

    const id = setInterval(async () => {
      const chart = chartInstanceRef.current;
      const rawData = rawDataRef.current;
      if (!chart || !rawData.length) return;

      try {
        const raw = await fetchLatestKlines(symbol, interval, 2);
        if (!raw.length) return;

        const binCandle = normalizeKline(raw[raw.length - 1] as unknown as KlineRaw);
        const lastLocal = rawData[rawData.length - 1];
        if (!lastLocal) return;

        if (binCandle.x === lastLocal.x) {
          Object.assign(lastLocal, binCandle);
        } else if (binCandle.x > lastLocal.x) {
          const prev = raw.length > 1 ? normalizeKline(raw[0] as unknown as KlineRaw) : null;
          if (prev && prev.x === lastLocal.x) Object.assign(lastLocal, prev);
          rawData.push(binCandle);
          const maxBars = intervalBarCount(interval);
          if (rawData.length > maxBars + 1) rawData.shift();
        } else {
          return;
        }

        const series = buildTechnicalSeries(rawData);
        fullSeriesRef.current = series;
        chart.data.datasets = buildDatasets(symbol, rawData, series, indicatorsRef.current) as any;
        chart.update('none');
      } catch { /* silent */ }
    }, 5000);

    return () => clearInterval(id);
  }, [symbol, interval]);

  return (
    <canvas
      ref={canvasRef}
      className="chart-canvas"
    />
  );
}
