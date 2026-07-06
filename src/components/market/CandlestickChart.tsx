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
import 'chartjs-adapter-date-fns';
import 'chartjs-chart-financial';
import { fetchKlines } from '@/api/binance';
import type { Candle, XY, KlineRaw } from '@/lib/chart/normalize';
import { normalizeKline } from '@/lib/chart/normalize';
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
} from '@/lib/chart/plugins';
import type { EnhancedChart, EventfulCanvas, ChartDatasetLike, MeasurePoint } from '@/lib/chart/types';

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
);

import type { ChartIndicatorsState } from '@/lib/chart/types';

export interface CandlestickChartProps {
  symbol: string | null;
  interval: string;
  zoom: number;
  indicators: ChartIndicatorsState;
  measureActive: boolean;
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

const getVisibleWindow = (dataLength: number, zoom: number) => {
  const minVisible = 24;
  const z = Math.max(minVisible, Math.min(zoom, dataLength));
  const end = dataLength;
  const start = Math.max(0, end - z);
  return { start, end, zoom: z };
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

const sliceTechnicalSeries = (
  series: TechnicalSeries,
  start: number,
  end: number,
): TechnicalSeries => ({
  bands: {
    upper: series.bands.upper.slice(start, end),
    middle: series.bands.middle.slice(start, end),
    lower: series.bands.lower.slice(start, end),
  },
  volume: series.volume.slice(start, end),
  stochRsi: {
    k: series.stochRsi.k.slice(start, end),
    d: series.stochRsi.d.slice(start, end),
  },
  sma: {
    100: series.sma[100].slice(start, end),
    200: series.sma[200].slice(start, end),
  },
  ema: {
    100: series.ema[100].slice(start, end),
    200: series.ema[200].slice(start, end),
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
      borderWidth: 1,
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
        borderWidth: 1.2,
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
        borderWidth: 1.2,
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
        borderDash: [4, 4] as [number, number],
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
        borderDash: [4, 4] as [number, number],
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
      borderWidth: 2,
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
      borderWidth: 2,
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
      },
      border: { color: CHART_THEME.border },
    },
    price: {
      type: 'linear' as const,
      axis: 'y' as const,
      position: 'right' as const,
      stack: PANEL_STACK,
      stackWeight: 5.6,
      grid: { color: CHART_THEME.grid },
      ticks: { color: CHART_THEME.text },
      border: { color: CHART_THEME.border },
    },
    volume: {
      type: 'linear' as const,
      axis: 'y' as const,
      display: indicators.volume,
      position: 'right' as const,
      stack: PANEL_STACK,
      stackWeight: indicators.volume ? 1.35 : 0,
      beginAtZero: true,
      grid: { color: CHART_THEME.volGrid },
      ticks: {
        color: CHART_THEME.muted,
        callback: (value: number) => {
          return Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1,
          }).format(value);
        },
        maxTicksLimit: 3,
      },
      border: { color: CHART_THEME.border },
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
      grid: { color: CHART_THEME.stochGrid },
      ticks: { color: CHART_THEME.muted, stepSize: 50 },
      border: { color: CHART_THEME.border },
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
  let xPixel = xScale.getPixelForValue((candles[0] as unknown as { x: number }).x);
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
  zoom,
  indicators,
  measureActive,
}: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<EnhancedChart | null>(null);
  const zoomRef = useRef(zoom);
  const startRef = useRef(0);
  const rawDataRef = useRef<Candle[]>([]);
  const fullSeriesRef = useRef<TechnicalSeries | null>(null);
  const indicatorsRef = useRef(indicators);
  const measureActiveRef = useRef(measureActive);

  zoomRef.current = zoom;
  indicatorsRef.current = indicators;
  measureActiveRef.current = measureActive;

  const applyChartSlice = useCallback((
    chart: EnhancedChart | null,
    data: Candle[],
    series: TechnicalSeries | null,
    sym: string,
    inds: ChartIndicatorsState,
  ) => {
    if (!chart || !data.length || !series) return;
    const currentEnd = Math.min(data.length, startRef.current + zoomRef.current);
    const visibleData = data.slice(startRef.current, currentEnd);
    const visibleSeries = sliceTechnicalSeries(series, startRef.current, currentEnd);
    chart.data.datasets = buildDatasets(sym, visibleData, visibleSeries, inds) as unknown as typeof chart.data.datasets;
    chart._fullLastTimestamp = data.at(-1)?.x ?? null;
    chart.update('none');
  }, []);

  // ponytail: chart creation on symbol change only — interval changes use fast path below
  useEffect(() => {
    if (!symbol) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartInstanceRef.current?.destroy?.();
    chartInstanceRef.current = null;

    let destroyed = false;

    (async () => {
      try {
        const raw = (await fetchKlines(symbol, interval)).map((k) =>
          normalizeKline(k as unknown as KlineRaw),
        );
        if (destroyed) return;

        if (!raw.length) return;

        const fullLastTimestamp = raw.at(-1)?.x ?? null;
        const fullSeries = buildTechnicalSeries(raw);
        const inds = indicatorsRef.current;
        const mActive = measureActiveRef.current;
        const { start, end, zoom: clampedZoom } = getVisibleWindow(
          raw.length,
          zoomRef.current,
        );
        const visibleData = raw.slice(start, end);
        const visibleSeries = sliceTechnicalSeries(fullSeries, start, end);

        startRef.current = start;
        zoomRef.current = clampedZoom;
        rawDataRef.current = raw;
        fullSeriesRef.current = fullSeries;

        const ctx = canvas.getContext('2d');
        if (!ctx || destroyed) return;

        const chart = new Chart(ctx, {
          type: 'candlestick',
          data: { datasets: buildDatasets(symbol, visibleData, visibleSeries, inds) as any },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            interaction: { mode: 'nearest', intersect: false },
            layout: { padding: 0 },
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
            },
            scales: createScales(interval, inds) as any,
          },
          plugins: [
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
          _fullLastTimestamp: fullLastTimestamp,
          _indicators: { ...inds },
          _measure: { active: mActive, start: null, end: null, preview: null },
          _volumeProfileSettings: {},
        });

        if (destroyed) {
          enhanced.destroy();
          return;
        }

        chartInstanceRef.current = enhanced;

        let zoomRafPending = false;
        const zoomHandler = (event: WheelEvent) => {
          event.preventDefault();
          const previousZoom = zoomRef.current;
          const step = 16;
          const minVisible = 24;
          const dataLen = rawDataRef.current.length;
          zoomRef.current =
            event.deltaY < 0
              ? Math.max(minVisible, zoomRef.current - step)
              : Math.min(dataLen, zoomRef.current + step);

          const currentEnd = Math.min(dataLen, startRef.current + previousZoom);
          startRef.current = Math.max(
            0,
            Math.min(
              currentEnd - zoomRef.current,
              dataLen - zoomRef.current,
            ),
          );

          if (!zoomRafPending) {
            zoomRafPending = true;
            requestAnimationFrame(() => {
              applyChartSlice(chartInstanceRef.current, rawDataRef.current, fullSeriesRef.current, chartInstanceRef.current?._symbol as string, chartInstanceRef.current?._indicators as ChartIndicatorsState);
              zoomRafPending = false;
            });
          }
        };

        let isPanning = false;
        let panStartX = 0;
        let panStartIndex = startRef.current;

        const handleMeasureClick = (event: PointerEvent) => {
          const c = chartInstanceRef.current;
          const m = c?._measure;
          if (!m?.active || !c) return false;

          const rect = canvas.getBoundingClientRect();
          const point = getNearestCandlePoint(
            c,
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
          if (!point) return true;

          if (!m.start || m.end) {
            m.start = point;
            m.end = null;
            m.preview = null;
          } else {
            m.end = point;
            m.preview = null;
          }

          c.update('none');
          return true;
        };

        const downHandler = (event: PointerEvent) => {
          if (handleMeasureClick(event)) return;
          isPanning = true;
          panStartX = event.clientX;
          panStartIndex = startRef.current;
          canvas.setPointerCapture?.(event.pointerId);
        };

        const moveHandler = (event: PointerEvent) => {
          const c = chartInstanceRef.current;
          const m = c?._measure;

          if (m?.active) {
            if (c && m.start && !m.end) {
              const rect = canvas.getBoundingClientRect();
              m.preview = getNearestCandlePoint(
                c,
                event.clientX - rect.left,
                event.clientY - rect.top,
              );
              c.update('none');
            }
            return;
          }

          if (!isPanning) return;
          const moveBars = Math.round(
            (event.clientX - panStartX) / 6,
          );
          startRef.current = Math.max(
            0,
            Math.min(
              rawDataRef.current.length - zoomRef.current,
              panStartIndex - moveBars,
            ),
          );
          applyChartSlice(chartInstanceRef.current, rawDataRef.current, fullSeriesRef.current, chartInstanceRef.current?._symbol as string, chartInstanceRef.current?._indicators as ChartIndicatorsState);
        };

        const upHandler = (event: PointerEvent) => {
          isPanning = false;
          canvas.releasePointerCapture?.(event.pointerId);
        };

        (canvas as EventfulCanvas)._zoomHandler = zoomHandler;
        (canvas as EventfulCanvas)._downHandler = downHandler;
        (canvas as EventfulCanvas)._moveHandler = moveHandler;
        (canvas as EventfulCanvas)._upHandler = upHandler;

        canvas.addEventListener('wheel', zoomHandler, { passive: false });
        canvas.addEventListener('pointerdown', downHandler);
        canvas.addEventListener('pointermove', moveHandler);
        canvas.addEventListener('pointerup', upHandler);
        canvas.addEventListener('pointercancel', upHandler);
      } catch (err) {
        if (!destroyed) console.error('CandlestickChart fetch error:', err);
      }
    })();

    return () => {
      destroyed = true;
      if (canvas) {
        const ec = canvas as EventfulCanvas;
        if (ec._zoomHandler)
          ec.removeEventListener('wheel', ec._zoomHandler);
        if (ec._downHandler)
          ec.removeEventListener('pointerdown', ec._downHandler);
        if (ec._moveHandler)
          ec.removeEventListener('pointermove', ec._moveHandler);
        if (ec._upHandler) {
          ec.removeEventListener('pointerup', ec._upHandler);
          ec.removeEventListener('pointercancel', ec._upHandler);
        }
        delete ec._zoomHandler;
        delete ec._downHandler;
        delete ec._moveHandler;
        delete ec._upHandler;
      }
      try { chartInstanceRef.current?.destroy(); } catch { /* ignore */ }
      chartInstanceRef.current = null;
      rawDataRef.current = [];
      fullSeriesRef.current = null;
    };
  // ponytail: only symbol triggers full chart rebuild, interval uses fast path
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ponytail: fast path — interval change updates data in-place without destroying canvas
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !symbol) return;

    let cancelled = false;
    (async () => {
      try {
        const raw = (await fetchKlines(symbol, interval)).map((k) =>
          normalizeKline(k as unknown as KlineRaw),
        );
        if (cancelled || !raw.length) return;

        const fullSeries = buildTechnicalSeries(raw);
        const { start, end, zoom: clampedZoom } = getVisibleWindow(raw.length, zoomRef.current);

        rawDataRef.current = raw;
        fullSeriesRef.current = fullSeries;
        startRef.current = start;
        zoomRef.current = clampedZoom;

        chart._interval = interval;
        chart._fullLastTimestamp = raw.at(-1)?.x ?? null;
        chart._indicators = { ...indicatorsRef.current };

        const visibleData = raw.slice(start, end);
        const visibleSeries = sliceTechnicalSeries(fullSeries, start, end);
        chart.data.datasets = buildDatasets(symbol, visibleData, visibleSeries, indicatorsRef.current) as any;
        chart.options.scales = createScales(interval, indicatorsRef.current) as any;
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
    chart.options.scales = createScales(interval, indicators) as any;
    applyChartSlice(chart, rawData, fullSeries, symbol, indicators);
  // ponytail: symbol and interval are stable via refs, only indicators trigger rebuild
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
    chart.update('none');
  // ponytail: symbol is stable via ref, only measureActive triggers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureActive]);

  return (
    <canvas
      ref={canvasRef}
      className="chart-canvas"
    />
  );
}
