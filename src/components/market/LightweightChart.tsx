import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Logical,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { displayBase, displayPairLabel, fetchCandles, fetchCandlesBefore, fetchExtendedFlag, fetchLatestCandles } from '@/api/market';
import { fetchTakerVolumes } from '@/api/binanceFutures';
import { calculateBollingerBands, calculateStochRSI, calculateVolumeProfile, vpRowRects, type VpBarRect, type VpRowInput } from '@/lib/chart/indicators';
import { calculateMacd, type MacdData } from '@/lib/chart/macd';
import { computeMaLines, resolveHtfColor, shouldRefreshHtf, stackTagCenters, type MaConfig } from '@/lib/chart/ma';
import { calculateRsi, rsiMaOf, toCandleList, type CandleData } from '@/lib/chart/rsi';
import {
  detectRsiDivergences,
  isBullishDiv,
  mergeConfirmedAndEarly,
  RSI_DIV_EARLY_LOOKBACK,
} from '@/lib/chart/rsiDiv';
import { computeSmc } from '@/lib/chart/smc';
import { detectSignals } from '@/lib/chart/signals';
import { compactVol3, formatAxisPrice, formatCountdown, formatPriceForChart, precisionForValue } from '@/lib/chart/priceFormat';
import { compactNumber, type Candle } from '@/lib/chart/normalize';
import {
  COLORS,
  HISTORY_HARD_CAP,
  intervalAggregate,
  intervalBarCount,
  parseTrackedPair,
} from '@/lib/config';
import { CHART_TIMEZONES, readChartTimezone, writeChartTimezone } from '@/lib/storage';
import { formatClockInZone, formatCrosshairInZone, formatTickInZone, zoneOffsetLabel, zoneShortName } from '@/lib/chart/timezone';
import type { ChartIndicatorsState, MaLineConfig } from '@/lib/chart/types';
import type { ChartHandle } from '@/components/market/CandlestickChart';
import { useMarketStore } from '@/store/useMarketStore';
import { ALL_FIB_LEVELS, DEFAULT_FIB_LEVELS, fibLevelPrice, hexWithAlpha, hitFibOverlay, levelsSorted, moveFibOverlay, snapFibOverlaysToGrid, trimRatio, type FibAnchor, type FibOverlay } from '@/lib/chart/fib';
import { drawKindLabel } from '@/lib/chart/draw';
import { FloatDrawBar } from '@/components/market/FloatDrawBar';
import { toLineData } from '@/lib/chart/lines';
import { loadDrawOverlays, loadFibOverlays, saveDrawOverlays, saveFibOverlays } from '@/lib/chart/overlays';
import type { IPriceLine } from 'lightweight-charts';

interface LightweightChartProps {
  symbol: string;
  interval: string;
  indicators: ChartIndicatorsState;
  overlaysTick: number;
  resetSignal: number;
}

const CHART_POLL_MS = 5000;
const EXTRA_TF_LIMIT = 300;
// Historial infinito: al quedar pocas velas a la izquierda se traen mas.
const HISTORY_PREFETCH_BARS = 60;
const HISTORY_PAGE = 1000;
// Tags de MAs: alto exacto para el anti-encimado, lider quebrado (tramo
// corto a 45 grados + recta horizontal hasta el tag).
const MA_TAG_H = 20;
const MA_TAG_GAP = 4;
const MA_ELBOW = 14;
const MA_RUN = 30;
// Alto aprox del cuadro de precio actual (para cederle paso a la cruceta).
const PRICE_TAG_H = 36;
const CROSSHAIR_LABEL_HALF = 11;
// Radio para agarrar anclas del fibo (generoso, estilo TV).
const FIB_ANCHOR_GRAB_PX = 20;
// Velas visibles al abrir, estilo TradingView (el resto queda a la izquierda con pan).
const INITIAL_VISIBLE_BARS = 150;
const INITIAL_RIGHT_OFFSET_BARS = 8;

type AnySeries = ISeriesApi<'Candlestick' | 'Histogram' | 'Line' | 'Area'>;

const MACD_DIF_COLOR = '#2962FF';
const MACD_DEA_COLOR = '#FF6D00';
// Media del RSI: amarilla bien notoria sobre el fondo oscuro.
const RSI_MA_COLOR = '#FFD60A';

interface PaneLegends {
  stoch?: { k: number; d: number };
  rsi?: { v: number; ma: number | null };
  macd?: { hist: number; dif: number; dea: number; p: number };
  vol?: { total: string };
  taker?: { base: string; cv: number; buy: number; sell: number };
}

const sec = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

// Velas vacias hacia el futuro: la libreria solo deja panear/clickear donde
// hay puntos, asi el punto B del fibo (y dibujos) llega bien lejos de la
// ultima vela real. Solo la serie de velas las lleva; los indicadores usan
// los datos reales.
const FUTURE_PAD_BARS = 500;

function futurePadEnd(data: CandleData[]): number | null {
  if (data.length < 2) return null;
  const step = data[data.length - 1]!.time - data[data.length - 2]!.time;
  if (!Number.isFinite(step) || step <= 0) return null;
  return data[data.length - 1]!.time + step * FUTURE_PAD_BARS;
}

function candleDisplayData(data: CandleData[]): { time: UTCTimestamp; open?: number; high?: number; low?: number; close?: number }[] {
  const out: { time: UTCTimestamp; open?: number; high?: number; low?: number; close?: number }[] =
    data.map((c) => ({ time: sec(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
  const end = futurePadEnd(data);
  if (end == null) return out;
  const step = data[data.length - 1]!.time - data[data.length - 2]!.time;
  for (let t = data[data.length - 1]!.time + step; t <= end; t += step) {
    out.push({ time: sec(t) });
  }
  return out;
}

function toLegacy(candles: CandleData[]): Candle[] {
  return candles.map((c) => ({ x: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, q: 0 }));
}



function precisionFor(refClose: number, extended: boolean): number {
  const frac = formatPriceForChart(refClose, extended).split('.')[1]?.length ?? 2;
  return Math.min(Math.max(frac, 2), 8);
}

function maConfigs(sma: MaLineConfig[], ema: MaLineConfig[]): MaConfig[] {
  const map = (l: MaLineConfig, fallback: 'SMA' | 'EMA'): MaConfig => ({
    id: l.id,
    type: l.kind ?? fallback,
    period: l.period,
    color: l.color,
    width: l.width ?? 1,
    visible: l.enabled,
    timeframe: l.timeframe ?? 'chart',
  });
  return [...sma.map((l) => map(l, 'SMA')), ...ema.map((l) => map(l, 'EMA'))];
}

export default forwardRef<ChartHandle, LightweightChartProps>(function LightweightChart(
  { symbol, interval, indicators, overlaysTick, resetSignal },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<{ series: AnySeries; line: IPriceLine }[]>([]);
  const drawToolRef = useRef(indicators.drawTool);
  drawToolRef.current = indicators.drawTool;
  const pendingRef = useRef<{ tool: string; time: number; price: number } | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const fibDefsRef = useRef<{ fibId: string; time: UTCTimestamp; price: number; text: string; color: string }[]>([]);
  const fibListRef = useRef<FibOverlay[]>([]);
  // Lienzo infinito: los niveles del fibo son overlay SVG (solo leen
  // coordenadas, nunca tocan las series ni la escala: dibujar no mueve nada).
  const [fibLines, setFibLines] = useState<
    { fibId: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dimmed: boolean }[]
  >([]);
  const [ghostFib, setGhostFib] = useState<{ tool: string; ax: number; ay: number; bx: number; by: number; label?: string; up?: boolean } | null>(null);
  const ghostPxRef = useRef<{ tool: string; ax: number; ay: number; bx: number; by: number; label?: string; up?: boolean } | null>(null);
  // Medida estilo TV: efimera (no persiste), una sola visible hasta cambiar de herramienta.
  const [measured, setMeasured] = useState<{ a: { time: number; price: number }; b: { time: number; price: number }; label: string; up: boolean } | null>(null);
  const [hoverFibId, setHoverFibId] = useState<string | null>(null);
  const prevToolRef = useRef<string | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const [selectedFibId, setSelectedFibId] = useState<string | null>(null);
  const [fibBarPos, setFibBarPos] = useState<Record<string, { x: number; y: number }>>({});
  const [fibSettingsOpen, setFibSettingsOpen] = useState(false);
  const barDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const hoverAnchorRef = useRef<{ id: string; isStart: boolean } | null>(null);
  const draggingRef = useRef<{
    id: string;
    isStart: boolean;
    moveBase: { time: number; price: number; start: FibAnchor; end: FibAnchor } | null;
  } | null>(null);
  const [dragView, setDragView] = useState<{ id: string; start: { time: number; price: number }; end: { time: number; price: number } } | null>(null);
  const [tick, setTick] = useState(0);
  const [drawStep, setDrawStep] = useState(0);
  const [fibLabels, setFibLabels] = useState<{ top: number; left: number; text: string; color: string; after: boolean }[]>([]);
  const [paneLegends, setPaneLegends] = useState<PaneLegends | null>(null);
  // Series alineadas por indice para que las leyendas sigan a la cruceta.
  const rsiArrRef = useRef<number[]>([]);
  const rsiMaArrRef = useRef<number[]>([]);
  const stochArrRef = useRef<{ k: { x: number; y: number | null }[]; d: { x: number; y: number | null }[] } | null>(null);
  const macdArrRef = useRef<MacdData | null>(null);
  const paneLastRef = useRef<PaneLegends | null>(null);
  const hoverPaneIdxRef = useRef<number | null>(null);
  const maTagsRef = useRef<{ time: number; price: number; text: string; color: string; htfId?: string }[]>([]);
  // HTF sin parpadeo: caché por símbolo|TF (pinta al toque) + series vivas
  // que se actualizan con setData en vez de borrarse y recrearse.
  const htfCacheRef = useRef(new Map<string, { data: CandleData[]; at: number }>());
  const htfSeriesRef = useRef(new Map<string, AnySeries>());
  const [maTags, setMaTags] = useState<{
    tags: { left: number; top: number; text: string; color: string }[];
    leaders: { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; color: string }[];
  } | null>(null);
  // Volume Profile estilo TV: filas en espacio de precio sobre el rango
  // visible; a pixeles se resuelve en el render (como el punto pendiente).
  const [vp, setVp] = useState<{
    rows: VpRowInput[];
    maxVolume: number;
    poc: { price: number; total: number } | null;
  } | null>(null);
  const priceTagTopRef = useRef<number | null>(null);
  const [priceTagHidden, setPriceTagHidden] = useState(false);
  const priceTagHiddenRef = useRef(false);
  const [countdown, setCountdown] = useState<{ top: number; label: string; price: string; text: string; color: string; dim: string; lineTop: number; lineRight: number; lineBg: string; width?: number } | null>(null);
  const [tz, setTz] = useState(() => readChartTimezone());
  const tzRef = useRef(tz);
  tzRef.current = tz;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [historyLoading, setHistoryLoading] = useState(false);
  const overlaysRef = useRef<AnySeries[]>([]);
  const colorKeysRef = useRef(new Map<AnySeries, string>());
  const candlesRef = useRef<CandleData[]>([]);
  const extendedRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready'>('loading');
  const [legend, setLegend] = useState('');
  const [chips, setChips] = useState<{ color: string; text: string }[]>([]);
  // Formato de etiquetas de fibo fuera del efecto de pintado.
  const fibFmtRef = useRef<{ refClose: number; ext: boolean }>({ refClose: 0, ext: false });

  // x para cualquier tiempo (dentro o fuera de las velas): primero la escala,
  // si no lo conoce se extrapola con logicalToCoordinate + paso de vela.
  // Base del lienzo infinito: todo lo dibujado usa esto, nunca series.
  const xAtTimeMs = useCallback((chartApi: IChartApi, timeMs: number): number | null => {
    try {
      const v = chartApi.timeScale().timeToCoordinate(sec(timeMs));
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    } catch {
      // extrapolado abajo
    }
    try {
      const data = candlesRef.current;
      if (data.length < 2) return null;
      const first = data[0]!.time;
      const step = data[data.length - 1]!.time - data[data.length - 2]!.time;
      if (!Number.isFinite(step) || step <= 0) return null;
      const x = chartApi.timeScale().logicalToCoordinate(((timeMs - first) / step) as Logical);
      return typeof x === 'number' && Number.isFinite(x) ? x : null;
    } catch {
      return null;
    }
  }, []);

  // Etiquetas al final de cada linea, fuera de ella (a la derecha del
  // punto final; si no hay sitio, a la izquierda como antes).
  const refreshFibLabels = useCallback(() => {
    const chartApi = chartRef.current;
    const candlesApi = candleRef.current;
    const el = containerRef.current;
    if (!chartApi || !candlesApi || !el) return;
    const width = el.clientWidth || 0;
    const height = el.clientHeight || 500;
    const out: { top: number; left: number; text: string; color: string; after: boolean }[] = [];
    for (const def of fibDefsRef.current) {
      let y: number | null = null;
      let x: number | null = null;
      try {
        y = candlesApi.priceToCoordinate(def.price);
      } catch {
        y = null;
      }
      try {
        x = xAtTimeMs(chartApi, def.time * 1000);
      } catch {
        x = null;
      }
      if (
        y == null || !Number.isFinite(y) || y < 0 || y > height ||
        x == null || !Number.isFinite(x)
      ) {
        continue;
      }
      const after = x <= width - 90;
      out.push({
        top: y,
        left: after
          ? Math.min(x + 8, Math.max(width - 8, 8))
          : Math.min(Math.max(x - 4, 8), Math.max(width - 8, 8)),
        text: def.text,
        color: def.color,
        after,
      });
    }
    setFibLabels(out);
  }, [xAtTimeMs]);

  // Niveles del fibo como overlay SVG: solo lee coordenadas (hoverIdRef para
  // el atenuado, sin depender del estado y sin re-suscribir nada).
  const refreshFibLines = useCallback(() => {
    const chartApi = chartRef.current;
    const candlesApi = candleRef.current;
    const el = containerRef.current;
    if (!chartApi || !candlesApi || !el) return;
    const H = el.clientHeight || 500;
    const hovered = hoverIdRef.current;
    const out: { fibId: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dimmed: boolean }[] = [];
    for (const fib of fibListRef.current) {
      if (fib.hidden) continue;
      const x1 = xAtTimeMs(chartApi, fib.start.time);
      const x2 = xAtTimeMs(chartApi, fib.end.time);
      if (x1 == null || x2 == null) continue;
      const dimmed = hovered != null && fib.id !== hovered;
      const color = dimmed ? (hexWithAlpha(fib.colorHex, 0.35) ?? fib.colorHex) : fib.colorHex;
      for (const ratio of levelsSorted(fib)) {
        const price = fibLevelPrice(fib.end.price, fib.start.price, ratio);
        let y: number | null = null;
        try {
          const v = candlesApi.priceToCoordinate(price);
          if (typeof v === 'number' && Number.isFinite(v)) y = v;
        } catch {
          y = null;
        }
        if (y == null || y < 0 || y > H) continue;
        out.push({ fibId: fib.id, x1, y1: y, x2, y2: y, color, width: fib.width, dimmed });
      }
    }
    setFibLines(out);
  }, [xAtTimeMs]);

  // Etiquetas de un fibo (una por nivel, en el punto final). Fuente unica
  // para pintado, patch, drag y borrado: si no, quedan numeros huerfanos.
  const syncFibDefs = useCallback((fib: FibOverlay) => {
    const { refClose, ext } = fibFmtRef.current;
    const endT = fib.end.time >= fib.start.time ? sec(fib.end.time) : sec(fib.start.time);
    const defs = levelsSorted(fib).map((ratio) => {
      const price = fibLevelPrice(fib.end.price, fib.start.price, ratio);
      return {
        fibId: fib.id,
        time: endT,
        price,
        text: `${trimRatio(ratio)} (${formatAxisPrice(price, refClose, ext)})`,
        color: fib.colorHex,
      };
    });
    fibDefsRef.current = [
      ...fibDefsRef.current.filter((d) => d.fibId !== fib.id),
      ...defs,
    ];
  }, []);

  // Cuenta regresiva al cierre: paso de vela sale de los datos, sin tabla de TFs.
  const refreshCountdown = useCallback(() => {
    const chartApi = chartRef.current;
    const candlesApi = candleRef.current;
    const el = containerRef.current;
    const data = candlesRef.current;
    setNowMs(Date.now());
    priceTagTopRef.current = null;
    if (!chartApi || !candlesApi || !el || data.length < 2) {
      setCountdown(null);
      return;
    }
    const last = data[data.length - 1]!;
    const prev = data[data.length - 2]!;
    const step = last.time - prev.time;
    if (!Number.isFinite(step) || step <= 0) {
      setCountdown(null);
      return;
    }
    let y: number | null = null;
    try {
      y = candlesApi.priceToCoordinate(last.close);
    } catch {
      y = null;
    }
    const height = el.clientHeight || 500;
    if (y == null || !Number.isFinite(y) || y < 0 || y > height) {
      setCountdown(null);
      return;
    }
    // Mismo ancho del eje de precios: el tag queda encuadrado bajo el precio.
    let axisWidth: number | null = null;
    try {
      const w = chartApi.priceScale('right').width();
      if (typeof w === 'number' && Number.isFinite(w) && w > 0) axisWidth = w;
    } catch {
      axisWidth = null;
    }
    // Un solo cuadro en el eje (precio + contador apagado) y el nombre
    // flotando sobre el grafico al final de la linea, como TradingView.
    const color = last.close >= last.open ? COLORS.up : COLORS.down;
    priceTagTopRef.current = y - 18;
    setCountdown({
      top: y - 18,
      label: displayPairLabel(symbol),
      price: formatPriceForChart(last.close, extendedRef.current),
      text: formatCountdown(last.time + step - Date.now()),
      color,
      dim: hexWithAlpha(color, 0.9) ?? color,
      lineTop: y,
      lineRight: axisWidth != null ? axisWidth + 4 : 6,
      lineBg: hexWithAlpha(color, 0.55) ?? color,
      ...(axisWidth != null ? { width: axisWidth } : {}),
    });
  }, [symbol]);

  // Tags al final de cada media: solo etiqueta (SMA50), texto y borde del
  // color de su linea, lider quebrado (tramo a 45 + recta horizontal),
  // sin pisarse. Las HTF llevan su TF (SMA200 1h).
  const refreshMaTags = useCallback(() => {
    const chartApi = chartRef.current;
    const candlesApi = candleRef.current;
    const el = containerRef.current;
    if (!chartApi || !candlesApi || !el) {
      setMaTags(null);
      return;
    }
    const W = el.clientWidth || 0;
    const H = el.clientHeight || 500;
    const ends: { x: number; y: number; text: string; color: string }[] = [];
    for (const def of maTagsRef.current) {
      let x: number | null = null;
      let y: number | null = null;
      try {
        x = chartApi.timeScale().timeToCoordinate(sec(def.time));
      } catch {
        x = null;
      }
      try {
        y = candlesApi.priceToCoordinate(def.price);
      } catch {
        y = null;
      }
      if (
        x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ||
        x < 0 || x > W || y < 0 || y > H
      ) {
        continue;
      }
      ends.push({ x, y, text: def.text, color: def.color });
    }
    if (!ends.length) {
      setMaTags(null);
      return;
    }
    const s = MA_ELBOW / Math.SQRT2;
    const colLeft = (x: number): number => Math.min(x + s + MA_RUN, Math.max(8, W - 96));
    const stacked = stackTagCenters(
      ends.map((p) => p.y - s),
      MA_TAG_H,
      MA_TAG_GAP,
      MA_TAG_H / 2,
      H - MA_TAG_H / 2,
    );
    setMaTags({
      tags: ends.map((p, i) => ({
        left: colLeft(p.x),
        top: stacked[i]! - MA_TAG_H / 2,
        text: p.text,
        color: p.color,
      })),
      leaders: ends.map((p, i) => ({
        x1: p.x,
        y1: p.y,
        x2: p.x + s,
        y2: p.y - s,
        x3: colLeft(p.x),
        y3: stacked[i]!,
        color: p.color,
      })),
    });
  }, []);

  // Volume Profile sobre el rango visible (VRVP de TV): filas en espacio de
  // precio; el render las lleva a pixeles con la escala viva.
  const refreshVp = useCallback(() => {
    const chartApi = chartRef.current;
    const data = candlesRef.current;
    if (!chartApi || data.length < 2) {
      setVp(null);
      return;
    }
    try {
      const range = chartApi.timeScale().getVisibleLogicalRange();
      if (!range) {
        setVp(null);
        return;
      }
      const i0 = Math.max(0, Math.floor(range.from));
      const i1 = Math.min(data.length - 1, Math.ceil(range.to));
      if (i1 < i0) {
        setVp(null);
        return;
      }
      const vpCalc = calculateVolumeProfile(toLegacy(data.slice(i0, i1 + 1)), 64);
      if (!vpCalc.rows.length || !(vpCalc.maxVolume > 0)) {
        setVp(null);
        return;
      }
      setVp({
        rows: vpCalc.rows.map((r) => ({
          high: r.high, low: r.low, up: r.up, down: r.down, total: r.total, poc: r === vpCalc.poc,
        })),
        maxVolume: vpCalc.maxVolume,
        poc: vpCalc.poc ? { price: vpCalc.poc.price, total: vpCalc.poc.total } : null,
      });
    } catch {
      setVp(null);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    patchColor: (key, hex) => {
      for (const [s, colorKey] of colorKeysRef.current) {
        if (colorKey !== key) continue;
        try {
          s.applyOptions({ color: hex } as never);
        } catch {
          // serie ya removida
        }
      }
    },
  }), []);

  // Eje de tiempo y cruceta en la zona elegida (por defecto Lima, como TV).
  const applyTimezone = useCallback((chart: IChartApi, zone: string) => {
    try {
      chart.applyOptions({
        localization: {
          locale: 'es-PE',
          timeFormatter: (t: Time) =>
            typeof t === 'number' ? formatCrosshairInZone(t, zone) : String(t),
        },
        timeScale: {
          tickMarkFormatter: (t: Time, tk: TickMarkType) => {
            if (typeof t !== 'number') return String(t);
            const kind = tk === TickMarkType.Year ? 'year'
              : tk === TickMarkType.Month ? 'month'
              : tk === TickMarkType.DayOfMonth ? 'day'
              : 'time';
            return formatTickInZone(t, kind, zone);
          },
        },
      });
    } catch {
      // chart en reconstruccion
    }
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) applyTimezone(chart, tz);
  }, [tz, applyTimezone, status]);

  // El fibo hovereado queda seleccionado (como TradingView) hasta borrarlo o elegir otro.
  useEffect(() => {
    if (hoverFibId) setSelectedFibId(hoverFibId);
  }, [hoverFibId]);

  // Si el seleccionado se borro fuera (limpiar todo), se cierra barra y modal.
  useEffect(() => {
    if (!selectedFibId) return;
    const still = loadFibOverlays(symbol).some((f) => f.id === selectedFibId);
    if (!still) {
      setSelectedFibId(null);
      setFibSettingsOpen(false);
      if (hoverIdRef.current === selectedFibId) {
        hoverIdRef.current = null;
        setHoverFibId(null);
      }
    }
  }, [overlaysTick, symbol, selectedFibId]);

  // Crea el chart por par/TF; los toggles solo actualizan series (sin reset de vista).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !symbol) return;
    let cancelled = false;
    // Chart nuevo: la caché HTF y las series vivas del anterior no sirven.
    htfCacheRef.current.clear();
    htfSeriesRef.current.clear();

    const chart = createChart(el, {
      layout: { background: { color: COLORS.bg }, textColor: COLORS.ink2 },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 9 },
    });
    chartRef.current = chart;
    applyTimezone(chart, tzRef.current);

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
      priceScaleId: 'right',
      // El tag de precio + contador es propio (un solo cuadro): se apaga el nativo.
      lastValueVisible: false,
    });
    candleRef.current = candles;
    markersRef.current = createSeriesMarkers(candles, []);

    const onResize = () => {
      try {
        chart.resize(Math.max(el.clientWidth, 50), Math.max(el.clientHeight, 480));
      } catch {
        // contenedor oculto
      }
    };
    const rafIds = new Set<number>();
    const rafThrottle = (fn: () => void): void => {
      if (typeof requestAnimationFrame === 'undefined') {
        fn();
        return;
      }
      const id = requestAnimationFrame(() => {
        rafIds.delete(id);
        if (cancelled) return;
        fn();
      });
      rafIds.add(id);
    };
    let ghostQueued = false;
    let legendQueued = false;
    let labelsQueued = false;
    let dragQueued = false;
    let vpQueued = false;

    const fibPixels = (fib: FibOverlay): { ax: number; ay: number; bx: number; by: number } | null => {
      const candlesApi = candleRef.current;
      if (!candlesApi) return null;
      try {
        const ax = xAtTimeMs(chart, fib.start.time);
        const bx = xAtTimeMs(chart, fib.end.time);
        const ay = candlesApi.priceToCoordinate(fib.start.price);
        const by = candlesApi.priceToCoordinate(fib.end.price);
        if (ax == null || bx == null || ay == null || by == null) return null;
        if (![ax, bx, ay, by].every((v) => Number.isFinite(v))) return null;
        return { ax, ay, bx, by };
      } catch {
        return null;
      }
    };

    // Tiempo para cualquier x del chart, aun fuera de las velas (futuro o
    // pasado): coordinateToTime devuelve null mas alla de la ultima vela, asi
    // que se extrapola con el paso de vela. Magnet estilo TV: siempre cae
    // sobre una vela/punto real (nunca entre velas) para no churnear los
    // puntos de la escala y que la vista no se mueva sola al dibujar.
    const timeAtX = (x: number): number | null => {
      const data = candlesRef.current;
      if (data.length < 2) return null;
      const first = data[0]!.time;
      const step = data[data.length - 1]!.time - data[data.length - 2]!.time;
      if (!Number.isFinite(step) || step <= 0) return null;
      const snap = (logical: number): number | null => {
        if (!Number.isFinite(logical)) return null;
        const idx = Math.min(
          Math.max(Math.round(logical), 0),
          data.length - 1 + FUTURE_PAD_BARS,
        );
        return first + idx * step;
      };
      try {
        const t = chart.timeScale().coordinateToTime(x);
        if (t != null) {
          const snapped = snap((Number(t) * 1000 - first) / step);
          return snapped ?? Number(t) * 1000;
        }
      } catch {
        // cae al extrapolado
      }
      try {
        const logical = chart.timeScale().coordinateToLogical(x);
        if (logical == null) return null;
        return snap(logical);
      } catch {
        return null;
      }
    };

    // Etiqueta estilo TV para Medir: % | delta | velas (solo overlay, no toca series).
    const measureLabel = (a: { time: number; price: number }, tB: number, pB: number): { label: string; up: boolean } => {
      const data = candlesRef.current;
      const step = data.length >= 2 ? data[data.length - 1]!.time - data[data.length - 2]!.time : 0;
      const bars = step > 0 ? Math.round(Math.abs(tB - a.time) / step) + 1 : 0;
      const delta = pB - a.price;
      const pct = a.price ? (delta / a.price) * 100 : 0;
      const up = delta >= 0;
      const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% | ${delta >= 0 ? '+' : ''}${formatPriceForChart(delta, extendedRef.current)} | ${bars} velas`;
      return { label, up };
    };

    const moveDraggedAnchor = () => {
      const drag = draggingRef.current;
      const mouse = mouseRef.current;
      const candlesApi = candleRef.current;
      if (!drag || !mouse || !candlesApi) return;
      const timeMs: number | null = timeAtX(mouse.x);
      let price: number | null = null;
      try {
        const p = candlesApi.coordinateToPrice(mouse.y);
        if (typeof p === 'number' && Number.isFinite(p)) price = p;
      } catch {
        // fuera de escala
      }
      if (timeMs == null || price == null) return;
      const fib = fibListRef.current.find((f) => f.id === drag.id);
      if (!fib || fib.locked) {
        draggingRef.current = null;
        return;
      }
      // timeAtX ya viene con magnet: los deltas son multiplos del paso,
      // asi la forma se conserva exacta al trasladar. El delta siempre parte
      // de las anclas originales (no del fibo ya movido) para no contar doble.
      const movedBase = drag.moveBase;
      const updated: FibOverlay = movedBase
        ? moveFibOverlay(
            { ...fib, start: movedBase.start, end: movedBase.end },
            timeMs - movedBase.time,
            price - movedBase.price,
          )
        : drag.isStart
          ? { ...fib, start: { time: timeMs, price } }
          : { ...fib, end: { time: timeMs, price } };
      // Frame sin cambio (misma vela y precio): se salta todo para no
      // re-renderizar ni tocar series en vano.
      if (
        updated.start.time === fib.start.time &&
        updated.start.price === fib.start.price &&
        updated.end.time === fib.end.time &&
        updated.end.price === fib.end.price
      ) {
        return;
      }
      fibListRef.current = fibListRef.current.map((f) => (f.id === drag.id ? updated : f));
      setDragView({ id: updated.id, start: { ...updated.start }, end: { ...updated.end } });
      // Solo overlay: el chart ni se entera (no se mueve nada).
      syncFibDefs(updated);
      refreshFibLines();
      refreshFibLabels();
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      onResize();
      if (!labelsQueued) {
        labelsQueued = true;
        rafThrottle(() => {
          labelsQueued = false;
          refreshFibLabels();
        });
      }
    });
    observer?.observe(el);
    onResize();

    // Posicion del mouse sin renders: el click y el fantasma salen de cualquier pixel.
    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      mouseRef.current = mouse;
      // El tag de precio de la cruceta pasa por encima: si el mouse ronda
      // el cuadro de precio actual, este se esconde hasta que se aleja.
      const tagTop = priceTagTopRef.current;
      const overTag = tagTop != null &&
        mouse.y >= tagTop - CROSSHAIR_LABEL_HALF &&
        mouse.y <= tagTop + PRICE_TAG_H + CROSSHAIR_LABEL_HALF;
      if (priceTagHiddenRef.current !== overTag) {
        priceTagHiddenRef.current = overTag;
        setPriceTagHidden(overTag);
      }
      if (draggingRef.current) {
        if (!dragQueued) {
          dragQueued = true;
          rafThrottle(() => {
            dragQueued = false;
            moveDraggedAnchor();
          });
        }
        return;
      }
      if (drawToolRef.current && pendingRef.current && !ghostQueued) {
        ghostQueued = true;
        rafThrottle(() => {
          ghostQueued = false;
          paintGhostFib();
        });
        return;
      }
      if (drawToolRef.current) {
        el.style.cursor = '';
        return;
      }
      // Hover: primero anclas (para arrastrar), luego lineas.
      const fibs = fibListRef.current.filter((f) => !f.hidden);
      let anchor: { id: string; isStart: boolean } | null = null;
      let hovered: FibOverlay | null = null;
      for (const fib of fibs) {
        const pts = fibPixels(fib);
        if (!pts) continue;
        if (!fib.locked) {
          if (Math.hypot(mouse.x - pts.ax, mouse.y - pts.ay) <= FIB_ANCHOR_GRAB_PX) {
            anchor = { id: fib.id, isStart: true };
            hovered = fib;
            break;
          }
          if (Math.hypot(mouse.x - pts.bx, mouse.y - pts.by) <= FIB_ANCHOR_GRAB_PX) {
            anchor = { id: fib.id, isStart: false };
            hovered = fib;
            break;
          }
        }
      }
      if (!hovered) {
        const toX = (timeMs: number): number | null => {
          try {
            return xAtTimeMs(chart, timeMs);
          } catch {
            return null;
          }
        };
        const candlesApi = candleRef.current;
        const toY = (price: number): number | null => {
          try {
            const v = candlesApi?.priceToCoordinate(price);
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
          } catch {
            return null;
          }
        };
        hovered = hitFibOverlay(fibs, mouse, toX, toY);
      }
      hoverAnchorRef.current = anchor;
      const id = hovered?.id ?? null;
      if (hoverIdRef.current !== id) {
        hoverIdRef.current = id;
        setHoverFibId(id);
      }
      el.style.cursor = anchor ? 'move' : hovered ? 'pointer' : '';
    };
    const onMouseLeave = () => {
      mouseRef.current = null;
      hoverAnchorRef.current = null;
      if (priceTagHiddenRef.current) {
        priceTagHiddenRef.current = false;
        setPriceTagHidden(false);
      }
      if (hoverIdRef.current !== null) {
        hoverIdRef.current = null;
        setHoverFibId(null);
      }
      el.style.cursor = '';
    };
    const onMouseDown = (e: MouseEvent) => {
      if (drawToolRef.current || e.button !== 0) return;
      const anchor = hoverAnchorRef.current;
      const hoveredFib = !anchor && hoverIdRef.current
        ? fibListRef.current.find((f) => f.id === hoverIdRef.current)
        : undefined;
      if (!anchor && !hoveredFib) {
        if (!hoverIdRef.current) setSelectedFibId(null);
        else setSelectedFibId(hoverIdRef.current);
        return;
      }
      const fib = anchor
        ? fibListRef.current.find((f) => f.id === anchor.id)
        : hoveredFib;
      if (!fib || fib.locked || fib.hidden) return;
      if (!anchor && hoveredFib) {
        // Agarró el cuerpo: traslada ambas anclas conservando la forma.
        const mouse = mouseRef.current;
        const candlesApi = candleRef.current;
        const baseTime = mouse ? timeAtX(mouse.x) : null;
        let basePrice: number | null = null;
        try {
          const p = mouse && candlesApi ? candlesApi.coordinateToPrice(mouse.y) : null;
          if (typeof p === 'number' && Number.isFinite(p)) basePrice = p;
        } catch {
          // fuera de escala
        }
        if (baseTime == null || basePrice == null) {
          setSelectedFibId(fib.id);
          return;
        }
        draggingRef.current = {
          id: fib.id,
          isStart: false,
          moveBase: { time: baseTime, price: basePrice, start: { ...fib.start }, end: { ...fib.end } },
        };
      } else if (anchor) {
        draggingRef.current = { ...anchor, moveBase: null };
      } else {
        return;
      }
      setSelectedFibId(fib.id);
      setDragView({ id: fib.id, start: { ...fib.start }, end: { ...fib.end } });
      try {
        chart.applyOptions({ handleScroll: false, handleScale: false });
      } catch {
        // chart en reconstruccion
      }
      e.preventDefault();
      e.stopPropagation();
    };
    const onMouseUp = () => {
      const drag = draggingRef.current;
      if (!drag) return;
      draggingRef.current = null;
      try {
        chart.applyOptions({ handleScroll: true, handleScale: true });
      } catch {
        // chart en reconstruccion
      }
      const fib = fibListRef.current.find((f) => f.id === drag.id);
      if (fib) {
        try {
          saveFibOverlays(symbol, fibListRef.current.slice(-10));
        } catch {
          // persiste en el proximo cambio
        }
      }
      setDragView(null);
      refreshFibLabels();
    };
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp);

    // Fibo fantasma mientras se dibuja: niveles continuos A -> cursor, en
    // pixeles (sin series: no toca la escala ni mueve nada).
    const clearGhost = () => {
      ghostPxRef.current = null;
      setGhostFib(null);
    };
    // Fantasma para cualquier herramienta: A en pixeles, B = cursor.
    const paintGhostFib = () => {
      const tool = drawToolRef.current;
      const pending = pendingRef.current;
      const mouse = mouseRef.current;
      const candlesApi = candleRef.current;
      const chartApi = chartRef.current;
      if (!tool || !pending || !mouse || !candlesApi || !chartApi) return;
      let ax: number | null = null;
      let ay: number | null = null;
      try {
        ax = xAtTimeMs(chartApi, pending.time);
      } catch {
        ax = null;
      }
      try {
        const v = candlesApi.priceToCoordinate(pending.price);
        if (typeof v === 'number' && Number.isFinite(v)) ay = v;
      } catch {
        ay = null;
      }
      if (ax == null || ay == null) {
        ghostPxRef.current = null;
        setGhostFib(null);
        return;
      }
      const next = { tool, ax, ay, bx: mouse.x, by: mouse.y } as { tool: string; ax: number; ay: number; bx: number; by: number; label?: string; up?: boolean };
      // Medir resuelve cursor a tiempo/precio para la etiqueta en vivo.
      if (tool === 'MEASURE') {
        const tB = timeAtX(mouse.x);
        let pB: number | null = null;
        try {
          const p = candlesApi.coordinateToPrice(mouse.y);
          if (typeof p === 'number' && Number.isFinite(p)) pB = p;
        } catch {
          pB = null;
        }
        if (tB == null || pB == null) {
          ghostPxRef.current = null;
          setGhostFib(null);
          return;
        }
        const m = measureLabel(pending, tB, pB);
        next.label = m.label;
        next.up = m.up;
      }
      const prev = ghostPxRef.current;
      if (
        prev && prev.tool === next.tool &&
        Math.abs(prev.ax - next.ax) < 1 && Math.abs(prev.ay - next.ay) < 1 &&
        Math.abs(prev.bx - next.bx) < 1 && Math.abs(prev.by - next.by) < 1
      ) {
        return;
      }
      ghostPxRef.current = next;
      setGhostFib(next);
    };

    const cross = (param: { time?: unknown }) => {
      if (legendQueued) return;
      legendQueued = true;
      const snapshot = param.time;
      rafThrottle(() => {
        legendQueued = false;
        const data = candlesRef.current;
        if (!data.length) return;
        let candle = data[data.length - 1]!;
        let idx = data.length - 1;
        if (snapshot != null) {
          const t = Number(snapshot) * 1000;
          const foundIdx = data.findIndex((c) => c.time >= t);
          if (foundIdx >= 0) {
            idx = foundIdx;
            candle = data[foundIdx]!;
          }
        }
        // Misma vela que el frame anterior: no re-renderiza (anti-freeze).
        const hoverKey = snapshot != null ? idx : -1;
        if (hoverPaneIdxRef.current === hoverKey) return;
        hoverPaneIdxRef.current = hoverKey;
        const chg = candle.open ? ((candle.close - candle.open) / candle.open) * 100 : 0;
        const ext = extendedRef.current;
        setLegend(
          `O ${formatPriceForChart(candle.open, ext)}  H ${formatPriceForChart(candle.high, ext)}  ` +
          `L ${formatPriceForChart(candle.low, ext)}  C ${formatPriceForChart(candle.close, ext)}  ` +
          `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
        );
        // Subpaneles siguen a la cruceta: valores de la vela apuntada, no de la ultima.
        const base = paneLastRef.current;
        if (base) {
          const next: PaneLegends = { ...base };
          if (snapshot != null) {
            const rsi = rsiArrRef.current;
            if (base.rsi && rsi.length === data.length) {
              const v = rsi[idx] ?? 0;
              const m = rsiMaArrRef.current[idx] ?? 0;
              if (v > 0) next.rsi = { v, ma: m > 0 ? m : null };
            }
            const st = stochArrRef.current;
            if (base.stoch && st && st.k.length === data.length) {
              const k = st.k[idx]?.y ?? null;
              const d = st.d[idx]?.y ?? null;
              if (k != null && d != null) next.stoch = { k, d };
            }
            const mc = macdArrRef.current;
            if (base.macd && mc) {
              const atIdx = (pairs: [number, number][]): number | null => {
                let v: number | null = null;
                for (const [i, val] of pairs) {
                  if (i <= idx) v = val;
                  else break;
                }
                return v;
              };
              const dif = atIdx(mc.dif);
              const dea = atIdx(mc.dea);
              const hist = atIdx(mc.hist);
              if (dif != null && dea != null && hist != null) {
                next.macd = { hist, dif, dea, p: base.macd.p };
              }
            }
            const vol = data[idx]?.volume;
            if (base.vol && typeof vol === 'number') next.vol = { total: compactNumber(vol) };
          }
          setPaneLegends(next);
        }
      });
    };
    chart.subscribeCrosshairMove(cross);

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      refreshFibLabels();
      refreshCountdown();
      refreshMaTags();
      if (!vpQueued) {
        vpQueued = true;
        rafThrottle(() => {
          vpQueued = false;
          refreshVp();
        });
      }
    });

    // Historial infinito hacia atras: al acercarse al borde izquierdo se traen
    // velas mas viejas y se anteponen sin mover la vista. Una carga a la vez,
    // tope en memoria para no perder fluidez.
    let historyLoading = false;
    let historyDone = false;
    const loadOlderHistory = () => {
      if (historyLoading || historyDone || cancelled) return;
      let range: { from: number; to: number } | null = null;
      try {
        range = chart.timeScale().getVisibleLogicalRange();
      } catch {
        return;
      }
      if (!range || range.from > HISTORY_PREFETCH_BARS) return;
      const data = candlesRef.current;
      const candlesApi = candleRef.current;
      if (!candlesApi || data.length < 2) return;
      if (data.length >= HISTORY_HARD_CAP) {
        historyDone = true;
        return;
      }
      historyLoading = true;
      setHistoryLoading(true);
      const oldest = data[0]!.time;
      fetchCandlesBefore(symbol, interval, oldest - 1, HISTORY_PAGE)
        .then((rows) => {
          if (cancelled) return;
          const have = new Set(data.map((c) => c.time));
          const add = toCandleList(rows).filter((c) => c.time < oldest && !have.has(c.time));
          if (!add.length) {
            historyDone = true;
            return;
          }
          const merged = [...add, ...data].slice(-HISTORY_HARD_CAP);
          const added = merged.length - data.length;
          if (added <= 0) {
            historyDone = true;
            return;
          }
          candlesRef.current = merged;
          try {
            candlesApi.setData(candleDisplayData(merged));
          } catch {
            // serie en reconstruccion
          }
          try {
            const cur = chart.timeScale().getVisibleLogicalRange();
            if (cur && added > 0) {
              chart.timeScale().setVisibleLogicalRange({ from: cur.from + added, to: cur.to + added });
            }
          } catch {
            // vista en transicion
          }
          setTick((t) => t + 1);
        })
        .catch(() => {
          // el proximo scroll reintenta
        })
        .finally(() => {
          historyLoading = false;
          if (!cancelled) setHistoryLoading(false);
        });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(loadOlderHistory);

    // Scroll sobre el eje Y = zoom solo vertical; fuera del eje, zoom horizontal nativo.
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let axisWidth = 60;
      try {
        axisWidth = chart.priceScale('right').width();
      } catch {
        // sin escala medida: se asume franja derecha
      }
      if (x < el.clientWidth - axisWidth) return;
      e.preventDefault();
      e.stopPropagation();
      const candlesApi = candleRef.current;
      if (!candlesApi) return;
      const y = e.clientY - rect.top;
      let cursor: number | null = null;
      try {
        const v = candlesApi.coordinateToPrice(y);
        if (typeof v === 'number' && Number.isFinite(v)) cursor = v;
      } catch {
        // sin precio bajo el cursor: se centra en el rango
      }
      const scale = chart.priceScale('right');
      let range: { from: number; to: number } | null = null;
      try {
        range = scale.getVisibleRange();
      } catch {
        // autoScale activo sin rango leible
      }
      if (!range) {
        try {
          scale.setAutoScale(false);
          range = scale.getVisibleRange();
        } catch {
          return;
        }
      }
      if (!range || !(range.to > range.from)) return;
      if (cursor == null || cursor < range.from || cursor > range.to) {
        cursor = (range.from + range.to) / 2;
      }
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const lo = cursor - (cursor - range.from) * factor;
      const hi = cursor + (range.to - cursor) * factor;
      if (!(hi > lo)) return;
      try {
        scale.setVisibleRange({ from: lo, to: hi });
      } catch {
        // rango rechazado por la escala
      }
      if (!labelsQueued) {
        labelsQueued = true;
        rafThrottle(() => {
          labelsQueued = false;
          refreshFibLabels();
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });

    // Dibujo a dos toques desde cualquier pixel: el primero ancla, el segundo completa.
    const pointFromPixels = (): { time: number; price: number } | null => {
      const mouse = mouseRef.current;
      const candlesApi = candleRef.current;
      if (mouse && candlesApi) {
        const timeMs = timeAtX(mouse.x);
        try {
          const p = candlesApi.coordinateToPrice(mouse.y);
          if (timeMs != null && typeof p === 'number' && Number.isFinite(p)) {
            return { time: timeMs, price: p };
          }
        } catch {
          // cae al fallback por serie
        }
      }
      return null;
    };
    const onClick = (param: { time?: unknown; seriesData?: Map<unknown, unknown> }) => {
      const tool = drawToolRef.current;
      if (!tool) return;
      const anchor = pointFromPixels();
      let timeMs: number | null = null;
      let price: number | null = null;
      if (anchor) {
        timeMs = anchor.time;
        price = anchor.price;
      } else if (param.time != null) {
        timeMs = Number(param.time) * 1000;
        const sd = param.seriesData?.get(candleRef.current as never) as { close?: unknown } | undefined;
        if (sd && Number.isFinite(Number(sd.close))) price = Number(sd.close);
        else {
          const last = candlesRef.current[candlesRef.current.length - 1];
          if (last) price = last.close;
        }
      }
      if (timeMs == null || !Number.isFinite(timeMs) || price == null) return;
      const pend = pendingRef.current;
      if (!pend || pend.tool !== tool) {
        pendingRef.current = { tool, time: timeMs, price };
        setDrawStep(1);
        return;
      }
      const id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const start = { time: pend.time, price: pend.price };
      const end = { time: timeMs, price };
      // Medir no persiste: queda una sola medida hasta cambiar de herramienta.
      if (tool === 'MEASURE') {
        const m = measureLabel(start, end.time, end.price);
        setMeasured({ a: { ...start }, b: { ...end }, label: m.label, up: m.up });
        pendingRef.current = null;
        setDrawStep(0);
        clearGhost();
        return;
      }
      if (tool === 'FIBO') {
        const list = loadFibOverlays(symbol);
        list.push({
          id, start, end, colorHex: '#FFFFFF', width: 1,
          enabledLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], hidden: false, locked: false,
        });
        saveFibOverlays(symbol, list.slice(-10));
      } else {
        const list = loadDrawOverlays(symbol);
        list.push({
          id, kind: tool as import('@/lib/chart/draw').DrawKind, start, end,
          colorHex: '#FFD60A', width: 1, hidden: false, locked: false,
        });
        saveDrawOverlays(symbol, list.slice(-20));
      }
      pendingRef.current = null;
      setDrawStep(0);
      clearGhost();
      useMarketStore.getState().setDrawTool(null);
      if (tool === 'FIBO') {
        // Solo overlay: el chart ni se entera.
        fibListRef.current = loadFibOverlays(symbol);
        const created = fibListRef.current.find((f) => f.id === id);
        if (created) syncFibDefs(created);
        refreshFibLines();
        refreshFibLabels();
      } else {
        useMarketStore.getState().bumpOverlays();
      }
    };
    chart.subscribeClick(onClick);

    (async () => {
      setStatus('loading');
      extendedRef.current = false;
      const count = intervalBarCount(interval);
      const [rows, extended] = await Promise.all([
        fetchCandles(symbol, interval, count),
        fetchExtendedFlag(symbol),
      ]);
      if (cancelled) return;
      const data = toCandleList(rows).slice(-count);
      if (!data.length) {
        setStatus('empty');
        return;
      }
      candlesRef.current = data;
      extendedRef.current = extended;
      const refClose = data[data.length - 1]!.close;
      const precision = precisionFor(refClose, extended);
      chart.applyOptions({
        localization: { priceFormatter: (p: number) => formatPriceForChart(p, extendedRef.current) },
      });
      candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } });
      candles.setData(candleDisplayData(data));
      cross({});
      // Estilo TradingView: enmarcar las ultimas N velas en vez de
      // encoger toda la historia (fitContent la deja ilegible).
      try {
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, data.length - INITIAL_VISIBLE_BARS),
          to: data.length + INITIAL_RIGHT_OFFSET_BARS,
        });
      } catch {
        chart.timeScale().fitContent();
      }
      setStatus('ready');
    })().catch(() => {
      if (!cancelled) setStatus('empty');
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      try {
        chart.unsubscribeClick(onClick);
      } catch {
        // chart en reconstruccion
      }
      el.removeEventListener('wheel', onWheel, true);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp);
      for (const id of rafIds) {
        try {
          cancelAnimationFrame(id);
        } catch {
          // frame ya corrido
        }
      }
      rafIds.clear();
      ghostQueued = false;
      legendQueued = false;
      labelsQueued = false;
      dragQueued = false;
      vpQueued = false;
      draggingRef.current = null;
      hoverAnchorRef.current = null;
      hoverIdRef.current = null;
      hoverPaneIdxRef.current = null;
      el.style.cursor = '';
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      markersRef.current = null;
      overlaysRef.current = [];
      candlesRef.current = [];
      pendingRef.current = null;
      fibDefsRef.current = [];
      fibListRef.current = [];
      draggingRef.current = null;
      hoverAnchorRef.current = null;
    };
  }, [symbol, interval, applyTimezone, refreshFibLabels, refreshFibLines, refreshCountdown, refreshMaTags, refreshVp, syncFibDefs, xAtTimeMs]);

  // Si cambia la herramienta (o se suelta), se limpian fantasma, pendiente y medida.
  useEffect(() => {
    if (prevToolRef.current === indicators.drawTool) return;
    prevToolRef.current = indicators.drawTool;
    pendingRef.current = null;
    ghostPxRef.current = null;
    setGhostFib(null);
    setMeasured(null);
    setDrawStep(0);
  }, [indicators.drawTool]);

  useEffect(() => {
    setMeasured(null);
  }, [symbol]);

  // Fibo hovereado a full, los demas tenues: el overlay se re-deriva.
  useEffect(() => {
    refreshFibLines();
  }, [hoverFibId, refreshFibLines]);

  // Series de indicadores: se reconstruyen al cambiar toggles o datos.
  useEffect(() => {
    const chart = chartRef.current;
    const data = candlesRef.current;
    if (!chart || !data.length || status !== 'ready') return;
    let cancelled = false;

    // MAs de otro TF que se quieren: sus series vivas no se tocan (cero parpadeo).
    const allMasEarly = maConfigs(indicators.smaLines, indicators.emaLines).filter((m) => m.visible);
    const wantHtfIds = new Set(
      allMasEarly.filter((m) => m.timeframe !== 'chart' && m.timeframe !== interval).map((m) => m.id),
    );
    const keptHtf = new Set<AnySeries>();
    for (const [id, s] of htfSeriesRef.current) {
      if (wantHtfIds.has(id)) keptHtf.add(s);
      else {
        try {
          chart.removeSeries(s);
        } catch {
          // ya removida
        }
        htfSeriesRef.current.delete(id);
      }
    }
    for (const s of overlaysRef.current) {
      if (keptHtf.has(s)) continue;
      try {
        chart.removeSeries(s);
      } catch {
        // ya removida
      }
    }
    overlaysRef.current = [...keptHtf];
    colorKeysRef.current.clear();
    fibDefsRef.current = [];
    maTagsRef.current = [];
    for (const { series, line } of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ya removida
      }
    }
    priceLinesRef.current = [];
    const legacy = toLegacy(data);
    const times = data.map((c) => sec(c.time));

    const groups: ('vol' | 'osc' | 'macd')[] = [];
    if (indicators.volume || indicators.taker) groups.push('vol');
    if (indicators.stochRsi || indicators.rsiEnabled) groups.push('osc');
    if (indicators.macd) groups.push('macd');
    const reserved = groups.length ? 0.42 : 0;
    const slot = (name: 'vol' | 'osc' | 'macd') => {
      const i = Math.max(groups.indexOf(name), 0);
      const h = reserved / Math.max(groups.length, 1);
      return { top: 1 - reserved + i * h + 0.01, bottom: Math.max(reserved - (i + 1) * h, 0) };
    };
    const candleMargins = { top: 0.08, bottom: reserved + 0.05 };
    chart.priceScale('right').applyOptions({ scaleMargins: candleMargins });
    const track = (s: AnySeries, colorKey?: string): AnySeries => {
      overlaysRef.current.push(s);
      if (colorKey) colorKeysRef.current.set(s, colorKey);
      return s;
    };
    const quiet = {
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    } as const;
    const colors = indicators.colors;
    const ext = extendedRef.current;
    const refClose = data[data.length - 1]!.close;
    fibFmtRef.current = { refClose, ext };
    const fmtP = (v: number): string => {
      const s = formatAxisPrice(v, refClose, ext);
      return /^-0\.0+$/.test(s) ? s.slice(1) : s;
    };
    const chips: { color: string; text: string }[] = [];
    // Leyendas dentro de cada subpanel, como la app (los chips de arriba se quedan).
    const pl: PaneLegends = {};
    const last = (values: (number | null | undefined)[]): number | null => {
      for (let i = values.length - 1; i >= 0; i--) {
        const v = values[i];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      return null;
    };

    if (indicators.bollinger) {
      const bb = calculateBollingerBands(legacy, 20, 2);
      const toData = (pts: { x: number; y: number | null }[]) =>
        pts.map((p, i) => ({ time: times[i]!, value: p.y as number })).filter((p) => Number.isFinite(p.value));
      const basis = track(chart.addSeries(LineSeries, { color: colors.bbBasis, lineWidth: 1, priceScaleId: 'right', ...quiet }));
      basis.setData(toData(bb.middle));
      const upper = track(
        chart.addSeries(LineSeries, { color: colors.bbLine, lineWidth: 1, priceScaleId: 'right', ...quiet }), 'bbLine',
      );
      upper.setData(toData(bb.upper));
      const lower = track(chart.addSeries(LineSeries, { color: colors.bbLine, lineWidth: 1, priceScaleId: 'right', ...quiet }));
      lower.setData(toData(bb.lower));
      const upLast = last(bb.upper.map((p) => p.y));
      const midLast = last(bb.middle.map((p) => p.y));
      const loLast = last(bb.lower.map((p) => p.y));
      if (upLast != null && midLast != null && loLast != null) {
        chips.push({
          color: colors.bbLine,
          text: `BB ${fmtP(upLast)}/${fmtP(midLast)}/${fmtP(loLast)}`,
        });
      }
    }

    const allMas = allMasEarly;
    const localMas = allMas.filter((m) => m.timeframe === 'chart' || m.timeframe === interval);
    const lines = computeMaLines(data, interval, localMas, new Map());
    for (const [id, pts] of Object.entries(lines)) {
      const cfg = [...indicators.smaLines, ...indicators.emaLines].find((l) => l.id === id);
      const maCfg = allMas.find((m) => m.id === id);
      const s = track(chart.addSeries(LineSeries, {
        color: cfg?.color ?? COLORS.sma, lineWidth: (cfg?.width ?? 1) as 1 | 2 | 3 | 4, priceScaleId: 'right', ...quiet,
      }));
      s.setData(pts.map((p) => ({ time: sec(p.time), value: p.value })));
      const maLast = pts.length ? pts[pts.length - 1]!.value : null;
      if (maLast != null && maCfg) {
        chips.push({
          color: cfg?.color ?? COLORS.sma,
          text: `${maCfg.type}${maCfg.period} ${fmtP(maLast)}`,
        });
        maTagsRef.current.push({
          time: pts[pts.length - 1]!.time,
          price: maLast,
          text: `${maCfg.type}${maCfg.period}`,
          color: cfg?.color ?? COLORS.sma,
        });
      }
    }
    refreshMaTags();
    // MAs de otro TF: primero desde caché (sin hueco visual), el fetch solo
    // refresca en fondo y actualiza la serie viva con setData (sin recrearla).
    const extraTfs = [...new Set(
      allMas.filter((m) => m.timeframe !== 'chart' && m.timeframe !== interval).map((m) => m.timeframe),
    )].slice(0, 3);
    // Pinta (o actualiza) las HTF con los extras dados; devuelve sus tags.
    const paintHtf = (extras: Map<string, CandleData[]>): { time: number; price: number; text: string; color: string; htfId: string }[] => {
      const tags: { time: number; price: number; text: string; color: string; htfId: string }[] = [];
      const htf = computeMaLines(data, interval, allMas.filter((m) => extras.has(m.timeframe)), extras);
      for (const [id, pts] of Object.entries(htf)) {
        const cfg = [...indicators.smaLines, ...indicators.emaLines].find((l) => l.id === id);
        const maCfg = allMas.find((m) => m.id === id);
        // Otro TF: linea solida (el punteado es solo del lider al tag),
        // blanco hueso salvo color personalizado en el modal.
        const htfColor = resolveHtfColor({ color: cfg?.color, customColor: cfg?.customColor });
        const width = (cfg?.width ?? 1) as 1 | 2 | 3 | 4;
        let s = htfSeriesRef.current.get(id);
        if (!s) {
          s = track(chart.addSeries(LineSeries, {
            color: htfColor, lineWidth: width, priceScaleId: 'right', ...quiet,
          }));
          htfSeriesRef.current.set(id, s);
        } else {
          try {
            s.applyOptions({ color: htfColor, lineWidth: width });
          } catch {
            // serie en reconstruccion
          }
        }
        try {
          s.setData(pts.map((p) => ({ time: sec(p.time), value: p.value })));
        } catch {
          // serie en reconstruccion: el proximo tick reintenta
        }
        const htfLast = pts.length ? pts[pts.length - 1]! : null;
        if (htfLast && maCfg) {
          tags.push({
            time: htfLast.time,
            price: htfLast.value,
            text: `${maCfg.type}${maCfg.period} ${maCfg.timeframe}`,
            color: htfColor,
            htfId: id,
          });
        }
      }
      return tags;
    };
    if (extraTfs.length) {
      const nowMs = Date.now();
      const cachedExtras = new Map<string, CandleData[]>();
      const staleTfs: string[] = [];
      for (const tf of extraTfs) {
        const hit = htfCacheRef.current.get(`${symbol}|${tf}`);
        if (hit?.data.length) {
          cachedExtras.set(tf, hit.data);
          if (shouldRefreshHtf(hit.at, nowMs)) staleTfs.push(tf);
        } else {
          staleTfs.push(tf);
        }
      }
      if (cachedExtras.size) {
        maTagsRef.current = maTagsRef.current.filter((t) => t.htfId == null);
        for (const t of paintHtf(cachedExtras)) maTagsRef.current.push(t);
        refreshMaTags();
      }
      if (staleTfs.length) {
        (async () => {
          const fresh = new Map(cachedExtras);
          for (const tf of staleTfs) {
            try {
              const rows = await fetchCandles(symbol, tf, EXTRA_TF_LIMIT);
              if (cancelled || chartRef.current !== chart) return;
              const candlesTf = toCandleList(rows);
              if (candlesTf.length) {
                fresh.set(tf, candlesTf);
                htfCacheRef.current.set(`${symbol}|${tf}`, { data: candlesTf, at: Date.now() });
              }
            } catch {
              // ese TF queda con su caché
            }
          }
          if (cancelled || chartRef.current !== chart || !fresh.size) return;
          maTagsRef.current = maTagsRef.current.filter((t) => t.htfId == null);
          for (const t of paintHtf(fresh)) maTagsRef.current.push(t);
          refreshMaTags();
        })().catch(() => {
          // MAs HTF opcionales: el chart local ya esta pintado
        });
      }
    }

    if (indicators.volume) {
      const m = slot('vol');
      const vol = track(chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' }, priceScaleId: 'vol',
      }));
      vol.priceScale().applyOptions({ scaleMargins: m });
      vol.setData(data.map((c) => ({
        time: sec(c.time), value: c.volume,
        color: c.close >= c.open ? 'rgba(0,192,135,0.5)' : 'rgba(242,54,69,0.5)',
      })));
      pl.vol = { total: compactNumber(data[data.length - 1]!.volume) };
    }

    if (indicators.taker) {
      const { source, symbol: raw } = parseTrackedPair(symbol);
      const m = slot('vol');
      (async () => {
        let rows: { timeMs: number; buy: number; sell: number }[] = [];
        try {
          rows = await fetchTakerVolumes(raw, interval, source, 500);
        } catch {
          return;
        }
        if (cancelled || !chartRef.current || !rows.length) return;
        const chartApi = chartRef.current;
        const rowLast = rows[rows.length - 1]!;
        const buyLast = Number(rowLast.buy) || 0;
        const sellLast = Number(rowLast.sell) || 0;
        setPaneLegends((prev) => (prev ? {
          ...prev,
          taker: { base: displayBase(symbol), cv: buyLast + sellLast, buy: buyLast, sell: sellLast },
        } : prev));
        const buyRows = toLineData(rows.map((r) => ({ time: sec(r.timeMs), value: r.buy })));
        const sellRows = toLineData(rows.map((r) => ({ time: sec(r.timeMs), value: -r.sell })));
        if (buyRows.length) {
          const buy = track(chartApi.addSeries(HistogramSeries, { priceScaleId: 'vol' }));
          try {
            buy.priceScale().applyOptions({ scaleMargins: m });
            buy.setData(buyRows.map((p) => ({ ...p, color: 'rgba(0,192,135,0.45)' })));
          } catch {
            // escala vol no disponible
          }
        }
        if (sellRows.length) {
          const sell = track(chartApi.addSeries(HistogramSeries, { priceScaleId: 'vol' }));
          try {
            sell.setData(sellRows.map((p) => ({ ...p, color: 'rgba(242,54,69,0.45)' })));
          } catch {
            // escala vol no disponible
          }
        }
      })().catch(() => {
        // taker opcional
      });
    }

    // Volume Profile estilo TV: solo dispara el cálculo sobre el rango
    // visible; el overlay SVG lo pinta (barras a la derecha + POC + tag).
    if (indicators.volumeProfile) {
      refreshVp();
    } else {
      setVp(null);
    }

    if (indicators.stochRsi || indicators.rsiEnabled) {
      const m = slot('osc');
      // Fondo negro solido del slot (estilo TV): tapa lo que sangre detras.
      // Stoch/RSI van de 0 a 100, asi el techo siempre cubre sin distorsionar.
      const oscBg = track(chart.addSeries(AreaSeries, {
        topColor: COLORS.bg, bottomColor: COLORS.bg, lineColor: 'rgba(0,0,0,0)',
        lineWidth: 1, priceScaleId: 'osc', ...quiet,
      }));
      oscBg.setData(times.map((t) => ({ time: t, value: 100 })));
      if (indicators.stochRsi) {
        const stoch = calculateStochRSI(legacy, 14, 14, 3, 3);
        const toData = (pts: { x: number; y: number | null }[]) =>
          pts.filter((p) => p.y != null).map((p) => ({ time: sec(p.x), value: p.y as number }));
        const k = track(chart.addSeries(LineSeries, {
          color: colors.stochK, lineWidth: 1, priceScaleId: 'osc', ...quiet,
        }), 'stochK');
        k.priceScale().applyOptions({ scaleMargins: m });
        k.setData(toData(stoch.k));
        const d = track(chart.addSeries(LineSeries, {
          color: colors.stochD, lineWidth: 1, priceScaleId: 'osc', ...quiet,
        }), 'stochD');
        d.setData(toData(stoch.d));
        const kLast = last(stoch.k.map((p) => p.y));
        const dLast = last(stoch.d.map((p) => p.y));
        if (kLast != null && dLast != null) {
          chips.push({ color: colors.stochK, text: `Stoch ${kLast.toFixed(1)}/${dLast.toFixed(1)}` });
          pl.stoch = { k: kLast, d: dLast };
        }
        stochArrRef.current = { k: stoch.k, d: stoch.d };
        // Niveles 80/20 punteados como la app.
        for (const lv of [80, 20]) {
          const s = track(chart.addSeries(LineSeries, {
            color: COLORS.neutral, lineWidth: 1, lineStyle: 2, priceScaleId: 'osc', ...quiet,
          }));
          s.setData(toLineData([{ time: times[0]!, value: lv }, { time: times[times.length - 1]!, value: lv }]));
        }
      }
      if (indicators.rsiEnabled) {
        const rsi = calculateRsi(data, indicators.rsiPeriod);
        const rsiMa = rsiMaOf(rsi, 14);
        const r = track(chart.addSeries(LineSeries, {
          color: colors.rsi, lineWidth: 1, priceScaleId: 'osc', ...quiet,
        }), 'rsi');
        r.priceScale().applyOptions({ scaleMargins: m });
        r.setData(
          rsi.map((v, i) => ({ time: times[i]!, value: v })).filter((p) => p.value > 0),
        );
        const rsiLast = last(rsi.map((v) => (v > 0 ? v : null)));
        const rsiMaLast = last(rsiMa.map((v, i) => (v > 0 && i >= rsi.length - 1 ? v : null)));
        if (rsiLast != null) {
          chips.push({
            color: colors.rsi,
            text: rsiMaLast != null ? `RSI ${rsiLast.toFixed(1)}/${rsiMaLast.toFixed(1)}` : `RSI ${rsiLast.toFixed(1)}`,
          });
          pl.rsi = { v: rsiLast, ma: rsiMaLast };
        }
        rsiArrRef.current = rsi;
        rsiMaArrRef.current = rsiMa;
        // Niveles 70/30 punteados como la app.
        for (const lv of [70, 30]) {
          const s = track(chart.addSeries(LineSeries, {
            color: COLORS.neutral, lineWidth: 1, lineStyle: 2, priceScaleId: 'osc', ...quiet,
          }));
          s.setData(toLineData([{ time: times[0]!, value: lv }, { time: times[times.length - 1]!, value: lv }]));
        }
        const signal = track(chart.addSeries(LineSeries, {
          color: RSI_MA_COLOR, lineWidth: 2, priceScaleId: 'osc', ...quiet,
        }));
        signal.setData(
          rsiMa.map((v, i) => ({ time: times[i]!, value: v })).filter((p) => p.value > 0),
        );
      }
    }

    if (indicators.macd) {
      const m = slot('macd');
      const macd = calculateMacd(data);
      const at = (idx: number) => times[idx]!;
      const difLast = macd.dif.length ? macd.dif[macd.dif.length - 1]![1] : null;
      const deaLast = macd.dea.length ? macd.dea[macd.dea.length - 1]![1] : null;
      const histLast = macd.hist.length ? macd.hist[macd.hist.length - 1]![1] : null;
      // Decimales por magnitud: 0.0011 sale 0.0011, no 0.00.
      const p = difLast != null && deaLast != null && histLast != null
        ? precisionForValue(Math.max(Math.abs(difLast), Math.abs(deaLast), Math.abs(histLast)))
        : 4;
      const macdFmt = { type: 'price', precision: p, minMove: 1 / 10 ** p } as const;
      // Fondo negro solido del slot (estilo TV): techo = maximo del slot.
      let macdTop = 0;
      for (const pairs of [macd.dif, macd.dea, macd.hist]) {
        for (const [, v] of pairs) {
          if (Number.isFinite(v)) macdTop = Math.max(macdTop, Math.abs(v));
        }
      }
      const macdBg = track(chart.addSeries(AreaSeries, {
        topColor: COLORS.bg, bottomColor: COLORS.bg, lineColor: 'rgba(0,0,0,0)',
        lineWidth: 1, priceScaleId: 'macd', priceFormat: macdFmt, ...quiet,
      }));
      macdBg.setData(times.map((t) => ({ time: t, value: macdTop })));
      const hist = track(chart.addSeries(HistogramSeries, { priceScaleId: 'macd', priceFormat: macdFmt }));
      hist.priceScale().applyOptions({ scaleMargins: m });
      hist.setData(macd.hist.map(([i, v]) => ({
        time: at(i), value: v, color: v >= 0 ? 'rgba(0,192,135,0.5)' : 'rgba(242,54,69,0.5)',
      })));
      const dif = track(chart.addSeries(LineSeries, {
        color: MACD_DIF_COLOR, lineWidth: 1, priceScaleId: 'macd', priceFormat: macdFmt, ...quiet,
      }));
      dif.setData(macd.dif.map(([i, v]) => ({ time: at(i), value: v })));
      const dea = track(chart.addSeries(LineSeries, {
        color: MACD_DEA_COLOR, lineWidth: 1, priceScaleId: 'macd', priceFormat: macdFmt, ...quiet,
      }));
      dea.setData(macd.dea.map(([i, v]) => ({ time: at(i), value: v })));
      if (difLast != null && deaLast != null && histLast != null) {
        chips.push({
          color: MACD_DIF_COLOR,
          text: `MACD ${difLast.toFixed(p)}/${deaLast.toFixed(p)}/${histLast.toFixed(p)}`,
        });
          pl.macd = { hist: histLast, dif: difLast, dea: deaLast, p };
        }
        macdArrRef.current = macd;
    }

    // Marcadores: divergencias RSI + señales + tags SMC.
    const markers: SeriesMarker<Time>[] = [];
    if (indicators.divs) {
      const rsi = calculateRsi(data, 14);
      if (rsi.length === data.length) {
        const divs = mergeConfirmedAndEarly(
          detectRsiDivergences(data, rsi),
          detectRsiDivergences(data, rsi, RSI_DIV_EARLY_LOOKBACK),
        );
        for (const d of divs) {
          const bullish = isBullishDiv(d.kind);
          const hid = d.kind.startsWith('HID');
          const text = d.early ? `Pre-${bullish ? 'Bull' : 'Bear'}` : hid ? `Hid ${bullish ? 'Bull' : 'Bear'}` : bullish ? 'Bull' : 'Bear';
          markers.push({
            time: times[d.idx2]!,
            position: bullish ? 'belowBar' : 'aboveBar',
            color: d.early ? '#f2c94c' : bullish ? '#1ecb81' : '#e74c3c',
            shape: d.early ? 'circle' : bullish ? 'arrowUp' : 'arrowDown',
            text,
          });
        }
      }
    }
    if (indicators.signals) {
      for (const sig of detectSignals(data)) {
        const t = times[times.length - 2] ?? times[times.length - 1]!;
        markers.push({
          time: t,
          position: sig.bullish ? 'belowBar' : 'aboveBar',
          color: sig.bullish ? '#1ecb81' : '#e74c3c',
          shape: sig.bullish ? 'arrowUp' : 'arrowDown',
          text: sig.label,
        });
      }
    }

    const smcOn = indicators.smc.swings || indicators.smc.structure || indicators.smc.zones ||
      indicators.smc.premium || indicators.smc.eq || indicators.smc.liquidity || indicators.smc.confluence;
    if (smcOn) {
      const smc = computeSmc(data, interval);
      const atIdx = (idx: number) => times[Math.min(Math.max(idx, 0), times.length - 1)]!;
      const box = (top: number, bottom: number, i0: number, i1: number, color: string, dashed: boolean) => {
        const t0 = atIdx(i0);
        const t1 = atIdx(Math.max(i1, i0));
        const s = track(chart.addSeries(LineSeries, {
          color, lineWidth: 1, lineStyle: dashed ? 2 : 0, ...quiet,
        }));
        s.setData(toLineData([
          { time: t0, value: top }, { time: t1, value: top }, { time: t1, value: bottom },
          { time: t0, value: bottom }, { time: t0, value: top },
        ]));
      };
      const hline = (price: number, i0: number, i1: number, color: string, dashed: boolean) => {
        const s = track(chart.addSeries(LineSeries, {
          color, lineWidth: 1, lineStyle: dashed ? 2 : 0, ...quiet,
        }));
        s.setData([{ time: atIdx(i0), value: price }, { time: atIdx(Math.max(i1, i0)), value: price }]);
      };
      const bullZone = 'rgba(0,192,135,0.75)';
      const bearZone = 'rgba(242,54,69,0.75)';
      const deadZone = 'rgba(133,139,147,0.6)';
      if (indicators.smc.zones) {
        for (const z of smc.zones) {
          box(z.top, z.bottom, z.startIdx, z.endIdx, z.mitigated ? deadZone : z.bullish ? bullZone : bearZone, z.mitigated);
        }
      }
      if (indicators.smc.premium && smc.premium) {
        const last = times.length - 1;
        hline(smc.premium.high, 0, last, 'rgba(133,139,147,0.5)', false);
        hline(smc.premium.low, 0, last, 'rgba(133,139,147,0.5)', false);
        hline(smc.premium.equilibrium, 0, last, 'rgba(240,238,235,0.6)', true);
      }
      if (indicators.smc.eq) {
        for (const eq of smc.eqLevels) {
          hline(eq.price, eq.idx1, eq.idx2, '#f2c94c', true);
          markers.push({ time: atIdx(eq.idx1), position: 'aboveBar', color: '#f2c94c', shape: 'circle', text: eq.isHigh ? 'EQH' : 'EQL' });
        }
      }
      if (indicators.smc.confluence) {
        for (const b of smc.confluence) {
          box(b.top, b.bottom, b.startIdx, b.endIdx, 'rgba(133,139,147,0.45)', false);
          markers.push({ time: atIdx(b.startIdx), position: 'aboveBar', color: '#858b93', shape: 'circle', text: b.tfLabel });
        }
      }
      if (indicators.smc.structure) {
        for (const e of smc.events) {
          markers.push({
            time: atIdx(e.breakIdx),
            position: e.bullish ? 'belowBar' : 'aboveBar',
            color: e.bullish ? '#1ecb81' : '#e74c3c',
            shape: 'circle',
            text: e.kind === 'BOS' ? 'BOS' : 'CHoCH',
          });
        }
      }
      if (indicators.smc.swings) {
        for (const sw of smc.swings) {
          markers.push({
            time: atIdx(sw.idx),
            position: sw.isHigh ? 'aboveBar' : 'belowBar',
            color: '#858b93',
            shape: 'circle',
          });
        }
      }
      if (indicators.smc.liquidity) {
        for (const liq of smc.liquidity) {
          markers.push({
            time: atIdx(liq.sweepIdx ?? liq.idx),
            position: liq.isBuySide ? 'aboveBar' : 'belowBar',
            color: liq.swept ? '#f2c94c' : '#f0eeeb',
            shape: 'circle',
            text: liq.isBuySide ? 'BSL' : 'SSL',
          });
        }
      }
    }
    // Fibos guardados por simbolo: el overlay SVG los pinta (ver
    // refreshFibLines); aqui solo se migran anclas y etiquetas.
    const candlesApi = candleRef.current;
    if (candlesApi && data.length) {
      const firstT = sec(data[0]!.time);
      const w = (width: number): 1 | 2 | 3 | 4 =>
        Math.min(Math.max(Math.round(width), 1), 4) as 1 | 2 | 3 | 4;
      // Auto-repara fibos viejos con anclas fuera de grilla (una sola
      // re-grabada; despues es no-op): sin esto churnean la escala y la vista
      // se mueve sola al arrastrar o borrar.
      const storedFibs = loadFibOverlays(symbol);
      const migrated = snapFibOverlaysToGrid(storedFibs, data, FUTURE_PAD_BARS);
      if (migrated.changed) {
        try {
          saveFibOverlays(symbol, migrated.list);
        } catch {
          // persiste en el proximo cambio
        }
      }
      fibListRef.current = migrated.list;
      for (const fib of migrated.list.filter((f) => !f.hidden)) syncFibDefs(fib);
      refreshFibLines();
      refreshFibLabels();
      // Fin del area con puntos (incluye el pad futuro): LINE/RAY/H parten de ahi.
      const padEnd = futurePadEnd(data) ?? data[data.length - 1]!.time;
      const slopeLine = (t0: number, p0: number, t1: number, p1: number, color: string, width: number, at0: number, at1: number) => {
        const slope = t1 === t0 ? 0 : (p1 - p0) / (t1 - t0);
        const s = track(chart.addSeries(LineSeries, { color, lineWidth: w(width), ...quiet }));
        s.setData([
          { time: sec(at0), value: p0 + slope * (at0 - t0) },
          { time: sec(at1), value: p0 + slope * (at1 - t0) },
        ]);
      };
      for (const d of loadDrawOverlays(symbol)) {
        if (d.hidden) continue;
        const t0 = d.start.time;
        const p0 = d.start.price;
        const t1 = d.end.time;
        const p1 = d.end.price;
        switch (d.kind) {
          case 'SEGMENT':
          case 'ARROW': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([{ time: sec(t0), value: p0 }, { time: sec(t1), value: p1 }]));
            if (d.kind === 'ARROW') {
              markers.push({
                time: sec(t1), position: p1 >= p0 ? 'aboveBar' : 'belowBar',
                color: d.colorHex, shape: p1 >= p0 ? 'arrowUp' : 'arrowDown', text: '',
              });
            }
            break;
          }
          case 'LINE':
            slopeLine(t0, p0, t1, p1, d.colorHex, d.width, data[0]!.time, padEnd);
            break;
          case 'RAY':
            slopeLine(t0, p0, t1, p1, d.colorHex, d.width, t0, padEnd);
            break;
          case 'H_SEGMENT': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([{ time: sec(t0), value: p0 }, { time: sec(t1), value: p0 }]));
            break;
          }
          case 'H_LINE': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData([{ time: firstT, value: p0 }, { time: sec(padEnd), value: p0 }]);
            break;
          }
          case 'H_RAY': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([{ time: sec(t0), value: p0 }, { time: sec(padEnd), value: p0 }]));
            break;
          }
          case 'RECT': {
            const top = Math.max(p0, p1);
            const bottom = Math.min(p0, p1);
            const a = sec(Math.min(t0, t1));
            const b = sec(Math.max(t0, t1));
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([
              { time: a, value: top }, { time: b, value: top }, { time: b, value: bottom },
              { time: a, value: bottom }, { time: a, value: top },
            ]));
            break;
          }
          case 'CIRCLE': {
            const cx = (t0 + t1) / 2;
            const cy = (p0 + p1) / 2;
            const rx = Math.abs(t1 - t0) / 2 || 1;
            const ry = Math.abs(p1 - p0) / 2 || Math.abs(cy) * 0.01 || 1;
            const pts = Array.from({ length: 25 }, (_, i) => {
              const a = (i / 24) * Math.PI * 2;
              return { time: sec(cx + Math.cos(a) * rx), value: cy + Math.sin(a) * ry };
            });
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData(pts));
            break;
          }
          case 'TRIANGLE': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([
              { time: sec(t0), value: p0 }, { time: sec(t1), value: p1 },
              { time: sec(t0), value: p1 }, { time: sec(t0), value: p0 },
            ]));
            break;
          }
          case 'PRICE_LINE':
            try {
              const line = candlesApi.createPriceLine({
                price: p0, color: d.colorHex, lineWidth: w(d.width),
                lineStyle: 0, axisLabelVisible: true, title: drawKindLabel(d.kind),
              });
              priceLinesRef.current.push({ series: candlesApi, line });
            } catch {
              // fuera de rango
            }
            break;
        }
      }
    }

    setChips(chips);
    setPaneLegends(pl);
    paneLastRef.current = pl;
    hoverPaneIdxRef.current = null;
    // Los margenes de velas se reafirman al final (con todas las series ya
    // creadas) para que ningun orden raro los deje sin efecto.
    try {
      markersRef.current?.setMarkers(markers.sort((a, b) => Number(a.time) - Number(b.time)));
    } catch {
      // chart en reconstruccion
    }

    return () => {
      cancelled = true;
    };
    }, [indicators, status, symbol, interval, tick, overlaysTick, refreshFibLabels, refreshFibLines, refreshMaTags, refreshVp, syncFibDefs]);

  // Polling 5s: parchea la ultima vela o agrega la nueva.
  useEffect(() => {
    if (!symbol || status !== 'ready') return;
    const { source } = parseTrackedPair(symbol);
    if (source === 'Binance' && intervalAggregate(interval)) return;
    if (source === 'TV') return;
    const id = setInterval(async () => {
      const candles = candleRef.current;
      const data = candlesRef.current;
      if (!candles || !data.length) return;
      try {
        const rows = await fetchLatestCandles(symbol, interval, 2);
        const fresh = toCandleList(rows);
        if (!fresh.length) return;
        const lastLocal = data[data.length - 1]!;
        let appended = false;
        for (const c of fresh) {
          if (c.time === lastLocal.time) Object.assign(lastLocal, c);
          else if (c.time > lastLocal.time) {
            data.push(c);
            if (data.length > HISTORY_HARD_CAP) data.splice(0, data.length - HISTORY_HARD_CAP);
            appended = true;
          }
        }
        if (appended) {
          try {
            candles.setData(candleDisplayData(data));
          } catch {
            // serie en reconstruccion: el proximo tick reintenta
          }
          setTick((t) => t + 1);
        }
        const last = data[data.length - 1]!;
        candles.update({ time: sec(last.time), open: last.open, high: last.high, low: last.low, close: last.close });
      } catch {
        // el proximo tick reintenta
      }
    }, CHART_POLL_MS);
    return () => clearInterval(id);
  }, [symbol, interval, status]);

  // Contador 1s pegado al tag de precio actual (estilo TradingView).
  useEffect(() => {
    if (!symbol || status !== 'ready') {
      setCountdown(null);
      priceTagTopRef.current = null;
      priceTagHiddenRef.current = false;
      setPriceTagHidden(false);
      return;
    }
    refreshCountdown();
    const id = setInterval(refreshCountdown, 1000);
    return () => clearInterval(id);
  }, [symbol, interval, status, refreshCountdown]);

  useEffect(() => {
    if (resetSignal > 0) {
      // Rango explicito (no resetTimeScale): el pad futuro no debe encogerse a la vista.
      const data = candlesRef.current;
      if (data.length) {
        try {
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: Math.max(0, data.length - INITIAL_VISIBLE_BARS),
            to: data.length + INITIAL_RIGHT_OFFSET_BARS,
          });
        } catch {
          // chart aun no creado
        }
      }
      try {
        chartRef.current?.priceScale('right').setAutoScale(true);
      } catch {
        // escala aun no lista
      }
    }
  }, [resetSignal]);

  const pending = pendingRef.current;
  let pendingDot: { left: number; top: number } | null = null;  if (pending && drawStep === 1 && chartRef.current && candleRef.current && containerRef.current) {
    try {
      const x = xAtTimeMs(chartRef.current, pending.time);
      const y = candleRef.current.priceToCoordinate(pending.price);
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        pendingDot = { left: x, top: y };
      }
    } catch {
      pendingDot = null;
    }
  }

  // Medida fijada a pixeles del frame actual (solo overlay: la vista no se mueve).
  let measuredView: { x: number; y: number; w: number; h: number; label: string; up: boolean } | null = null;
  if (measured && chartRef.current && candleRef.current) {
    try {
      const ax = xAtTimeMs(chartRef.current, measured.a.time);
      const bx = xAtTimeMs(chartRef.current, measured.b.time);
      const ay = candleRef.current.priceToCoordinate(measured.a.price);
      const by = candleRef.current.priceToCoordinate(measured.b.price);
      if (typeof ax === 'number' && typeof bx === 'number' && typeof ay === 'number' && typeof by === 'number' &&
        [ax, bx, ay, by].every((v) => Number.isFinite(v))) {
        measuredView = {
          x: Math.min(ax, bx), y: Math.min(ay, by),
          w: Math.max(Math.abs(bx - ax), 1), h: Math.max(Math.abs(by - ay), 1),
          label: measured.label, up: measured.up,
        };
      }
    } catch {
      measuredView = null;
    }
  }

  // Volume Profile a pixeles del frame actual (solo overlay: la vista no se mueve).
  const VP_MAX_WIDTH = 140;
  let vpView: { bars: VpBarRect[]; pocY: number | null; tag: string | null } | null = null;
  if (indicators.volumeProfile && vp && vp.rows.length && containerRef.current && chartRef.current && candleRef.current) {
    try {
      const el = containerRef.current;
      const W = el.clientWidth || 0;
      const H = el.clientHeight || 500;
      let axisW = 60;
      try {
        const w = chartRef.current.priceScale('right').width();
        if (typeof w === 'number' && Number.isFinite(w) && w > 0) axisW = w;
      } catch {
        // eje aun no listo
      }
      const candlesApi = candleRef.current;
      const yOf = (p: number): number | null => {
        try {
          const v = candlesApi.priceToCoordinate(p);
          return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= H ? v : null;
        } catch {
          return null;
        }
      };
      const bars = vpRowRects(vp.rows, vp.maxVolume, yOf, W - axisW - 2, VP_MAX_WIDTH);
      if (bars.length) {
        const pocY = vp.poc ? yOf(vp.poc.price) : null;
        const { refClose, ext } = fibFmtRef.current;
        vpView = {
          bars,
          pocY,
          tag: vp.poc ? `VP POC ${formatAxisPrice(vp.poc.price, refClose, ext)} | ${compactNumber(vp.poc.total)}` : null,
        };
      }
    } catch {
      vpView = null;
    }
  }

  const activeSelectedId = dragView?.id ?? selectedFibId ?? hoverFibId;
  const selectedFib = activeSelectedId
    ? (loadFibOverlays(symbol).find((f) => f.id === activeSelectedId) ?? null)
    : null;

  const patchSelectedFib = (patch: Partial<FibOverlay>) => {
    if (!symbol || !selectedFib) return;
    const next = loadFibOverlays(symbol).map((f) => (f.id === selectedFib.id ? { ...f, ...patch } : f));
    saveFibOverlays(symbol, next.slice(-10));
    // Solo overlay: re-deriva sin reconstruir el chart (la vista no se mueve).
    fibListRef.current = next;
    const patched = next.find((f) => f.id === selectedFib.id);
    if (patched && !patched.hidden) syncFibDefs(patched);
    else fibDefsRef.current = fibDefsRef.current.filter((d) => d.fibId !== selectedFib.id);
    refreshFibLines();
    refreshFibLabels();
  };

  const deleteSelectedFib = () => {
    if (!symbol || !selectedFib) return;
    const next = loadFibOverlays(symbol).filter((f) => f.id !== selectedFib.id);
    saveFibOverlays(symbol, next);
    setSelectedFibId(null);
    setFibSettingsOpen(false);
    if (hoverIdRef.current === selectedFib.id) {
      hoverIdRef.current = null;
      setHoverFibId(null);
    }
    // Solo overlay: sin sus numeros y con la vista donde estaba.
    fibDefsRef.current = fibDefsRef.current.filter((d) => d.fibId !== selectedFib.id);
    fibListRef.current = next;
    setFibBarPos((prev) => Object.fromEntries(
      Object.entries(prev).filter(([id]) => id !== selectedFib.id),
    ));
    refreshFibLines();
    refreshFibLabels();
  };

  const toggleSelectedLevel = (ratio: number) => {
    if (!selectedFib) return;
    const has = selectedFib.enabledLevels.includes(ratio);
    const levels = has
      ? selectedFib.enabledLevels.filter((l) => l !== ratio)
      : [...selectedFib.enabledLevels, ratio].sort((a, b) => a - b);
    if (!levels.length) return;
    patchSelectedFib({ enabledLevels: levels });
  };

  const onBarHandleDown = (e: { currentTarget: HTMLElement; clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }) => {
    const bar = e.currentTarget.closest('.fib-selected-bar') as HTMLElement | null;
    const parent = bar?.parentElement?.getBoundingClientRect();
    const rect = bar?.getBoundingClientRect();
    // selectedFib (no solo selectedFibId): la barra ya es visible por hover
    // antes de que el efecto fije el id.
    const fibId = selectedFib?.id;
    if (!rect || !parent || !fibId) return;
    const origX = rect.left - parent.left;
    const origY = rect.top - parent.top;
    barDragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    setFibBarPos((prev) => ({ ...prev, [fibId]: { x: origX, y: origY } }));
    const move = (ev: MouseEvent) => {
      const d = barDragRef.current;
      if (!d) return;
      const pos = { x: d.origX + ev.clientX - d.startX, y: Math.max(0, d.origY + ev.clientY - d.startY) };
      setFibBarPos((prev) => ({ ...prev, [fibId]: pos }));
    };
    const up = () => {
      barDragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
    e.stopPropagation();
  };

  // Orden y altura de cada subpanel, igual que slot() del efecto (fraccion -> %).
  const paneGroups: ('vol' | 'osc' | 'macd')[] = [];
  if (indicators.volume || indicators.taker) paneGroups.push('vol');
  if (indicators.stochRsi || indicators.rsiEnabled) paneGroups.push('osc');
  if (indicators.macd) paneGroups.push('macd');
  const paneReserved = paneGroups.length ? 0.42 : 0;
  const paneTopPct = (name: 'vol' | 'osc' | 'macd'): number => {
    const i = Math.max(paneGroups.indexOf(name), 0);
    const h = paneReserved / Math.max(paneGroups.length, 1);
    return (1 - paneReserved + i * h + 0.01) * 100;
  };

  // Barra flotante sobre el fibo seleccionado (estilo TV): nace arriba del
  // dibujo y se recoge dentro del contenedor. El arrastre manual la fija
  // por fibo y se recuerda al reseleccionar.
  const manualBarPos = selectedFib ? fibBarPos[selectedFib.id] : undefined;
  let fibBarAuto: { x: number; y: number } | null = null;
  if (selectedFib && !manualBarPos && chartRef.current && candleRef.current && containerRef.current) {
    try {
      const ax = xAtTimeMs(chartRef.current, selectedFib.start.time);
      const bx = xAtTimeMs(chartRef.current, selectedFib.end.time);
      const ay = candleRef.current.priceToCoordinate(selectedFib.start.price);
      const by = candleRef.current.priceToCoordinate(selectedFib.end.price);
      if (
        typeof ax === 'number' && typeof bx === 'number' &&
        typeof ay === 'number' && typeof by === 'number' &&
        [ax, bx, ay, by].every((v) => Number.isFinite(v))
      ) {
        const W = containerRef.current.clientWidth || 0;
        const H = containerRef.current.clientHeight || 500;
        const midX = (ax + bx) / 2;
        const topY = Math.min(ay, by);
        fibBarAuto = {
          x: Math.min(Math.max(midX - 160, 8), Math.max(8, W - 330)),
          y: Math.min(Math.max(topY - 56, 8), Math.max(8, H - 60)),
        };
      }
    } catch {
      fibBarAuto = null;
    }
  }
  const fibBarStyle = manualBarPos
    ? { left: manualBarPos.x, top: manualBarPos.y, transform: 'none' as const }
    : fibBarAuto
      ? { left: fibBarAuto.x, top: fibBarAuto.y, transform: 'none' as const }
      : undefined;

  return (
    <div className="lw-chart">
      <FloatDrawBar />
      {selectedFib && !dragView && (
        <div
          className="fib-selected-bar"
          role="toolbar"
          aria-label="Opciones del fibo seleccionado"
          style={fibBarStyle}
        >
          <span
            className="fib-bar-handle"
            title="Mover barra"
            aria-label="Mover barra"
            onMouseDown={onBarHandleDown}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
            </svg>
          </span>
          <label className="fib-bar-btn" title="Color del fibo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9.5 12.5l7-7a2.1 2.1 0 013 3l-7 7-3.5.5z" />
              <path d="M4 20h16" strokeWidth="3" stroke="currentColor" style={{ color: selectedFib.colorHex }} />
            </svg>
            <input
              type="color"
              aria-label="Color del fibo"
              className="fib-bar-color-input"
              value={selectedFib.colorHex}
              onChange={(e) => patchSelectedFib({ colorHex: e.target.value })}
            />
          </label>
          <select
            className="fib-bar-select"
            aria-label="Grosor de línea"
            title="Grosor de línea"
            value={selectedFib.width}
            onChange={(e) => patchSelectedFib({ width: Number(e.target.value) })}
          >
            <option value={1}>— 1px</option>
            <option value={2}>— 2px</option>
            <option value={3}>— 3px</option>
            <option value={4}>— 4px</option>
          </select>
          <button
            type="button"
            className="fib-bar-btn"
            title="Niveles del fibo"
            aria-label="Niveles del fibo"
            onClick={() => setFibSettingsOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </button>
          <button
            type="button"
            className={`fib-bar-btn${selectedFib.locked ? ' active' : ''}`}
            title={selectedFib.locked ? 'Desbloquear fibo' : 'Bloquear fibo'}
            aria-label={selectedFib.locked ? 'Desbloquear fibo' : 'Bloquear fibo'}
            aria-pressed={selectedFib.locked}
            onClick={() => patchSelectedFib({ locked: !selectedFib.locked })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d={selectedFib.locked ? 'M8 11V7a4 4 0 018 0v4' : 'M8 11V7a4 4 0 017.8-1.3'} />
            </svg>
          </button>
          <button
            type="button"
            className="fib-bar-btn danger"
            title="Borrar fibo"
            aria-label="Borrar fibo"
            onClick={deleteSelectedFib}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
          <button
            type="button"
            className="fib-bar-btn"
            title="Soltar selección"
            aria-label="Soltar selección"
            onClick={() => {
              setSelectedFibId(null);
              setFibSettingsOpen(false);
              if (hoverIdRef.current === selectedFib.id) {
                hoverIdRef.current = null;
                setHoverFibId(null);
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </div>
      )}
      {fibSettingsOpen && selectedFib && (
        <div
          className="ma-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFibSettingsOpen(false);
          }}
        >
          <div className="ma-modal" role="dialog" aria-label="Ajustes de Fibonacci">
            <div className="ma-modal-header">
              <span>Fibo · niveles y estilo</span>
              <button type="button" className="ma-modal-close" aria-label="Cerrar ajustes" onClick={() => setFibSettingsOpen(false)}>✕</button>
            </div>
            <div className="ma-modal-body">
              <div className="ma-modal-row">
                <span className="ma-modal-label">Color</span>
                <input
                  type="color"
                  aria-label="Color del fibo"
                  className="ma-modal-color"
                  value={selectedFib.colorHex}
                  onChange={(e) => patchSelectedFib({ colorHex: e.target.value })}
                />
                <span className="ma-modal-label">Grosor</span>
                <select
                  className="ma-modal-select"
                  aria-label="Grosor de línea del fibo"
                  value={selectedFib.width}
                  onChange={(e) => patchSelectedFib({ width: Number(e.target.value) })}
                >
                  <option value={1}>1px</option>
                  <option value={2}>2px</option>
                  <option value={3}>3px</option>
                  <option value={4}>4px</option>
                </select>
              </div>
              {ALL_FIB_LEVELS.map((ratio) => (
                <div className="ma-modal-row" key={ratio}>
                  <label className="ma-modal-check">
                    <input
                      type="checkbox"
                      checked={selectedFib.enabledLevels.includes(ratio)}
                      onChange={() => toggleSelectedLevel(ratio)}
                      aria-label={`Nivel ${ratio}`}
                    />
                  </label>
                  <span className="ma-modal-label">{trimRatio(ratio)}</span>
                </div>
              ))}
            </div>
            <div className="ma-modal-footer">
              <button type="button" className="ma-modal-add" onClick={() => setFibSettingsOpen(false)}>Listo</button>
            </div>
          </div>
        </div>
      )}
      <div className="lw-legend" aria-live="polite">
        <div>{legend || symbol}</div>
        {chips.length > 0 && (
          <div className="lw-chips">
            {chips.map((chip, i) => (
              <span key={i} className="lw-chip" style={{ color: chip.color }}>{chip.text}</span>
            ))}
          </div>
        )}
      </div>
      {paneLegends?.vol != null && (
        <div className="pane-legend" style={{ top: `${paneTopPct('vol')}%` }} aria-live="polite">
          <div className="pane-legend-big">{paneLegends.vol.total}</div>
        </div>
      )}
      {paneLegends?.taker != null && (
        <div
          className="pane-legend"
          style={{ top: `${paneTopPct('vol') + (paneLegends.vol ? 4 : 0)}%` }}
          aria-live="polite"
        >
          C/V del tomador{' '}
          <span>C/V({paneLegends.taker.base}) {compactVol3(paneLegends.taker.cv)}</span>{' '}
          <span style={{ color: COLORS.up }}>Buy({paneLegends.taker.base}) {compactVol3(paneLegends.taker.buy)}</span>{' '}
          <span style={{ color: COLORS.down }}>Sell({paneLegends.taker.base}) {compactVol3(paneLegends.taker.sell)}</span>
        </div>
      )}
      {paneLegends?.stoch != null && indicators.stochRsi && (
        <div className="pane-legend" style={{ top: `${paneTopPct('osc')}%` }} aria-live="polite">
          <span style={{ color: indicators.colors.stochK }}>K: {paneLegends.stoch.k.toFixed(2)}</span>{' '}
          <span style={{ color: indicators.colors.stochD }}>D: {paneLegends.stoch.d.toFixed(2)}</span>
        </div>
      )}
      {paneLegends?.rsi != null && indicators.rsiEnabled && (
        <div
          className="pane-legend"
          style={{ top: `${paneTopPct('osc') + (paneLegends.stoch && indicators.stochRsi ? 4 : 0)}%` }}
          aria-live="polite"
        >
          <span style={{ color: indicators.colors.rsi }}>RSI: {paneLegends.rsi.v.toFixed(2)}</span>{' '}
            {paneLegends.rsi.ma != null && (
              <span style={{ color: RSI_MA_COLOR }}>MA: {paneLegends.rsi.ma.toFixed(2)}</span>
            )}
        </div>
      )}
      {paneLegends?.macd != null && (
        <div className="pane-legend" style={{ top: `${paneTopPct('macd')}%` }} aria-live="polite">
          <span>MACD(12,26,9)</span>{' '}
          <span>MACD {paneLegends.macd.hist.toFixed(paneLegends.macd.p)}</span>{' '}
          <span style={{ color: MACD_DIF_COLOR }}>DIF {paneLegends.macd.dif.toFixed(paneLegends.macd.p)}</span>{' '}
          <span style={{ color: MACD_DEA_COLOR }}>DEA {paneLegends.macd.dea.toFixed(paneLegends.macd.p)}</span>
        </div>
      )}
      {(fibLines.length > 0 || ghostFib || measuredView) && (
        <svg className="fib-lines-svg" aria-hidden="true">
          {fibLines.map((l, i) => (
            <line
              key={`${l.fibId}-${i}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.color}
              strokeOpacity={l.dimmed ? 0.35 : 1}
              strokeWidth={l.width}
              strokeLinecap="round"
              className="fib-level-line"
            />
          ))}
          {ghostFib && (() => {
            const g = ghostFib;
            const W = containerRef.current?.clientWidth || 0;
            const H = containerRef.current?.clientHeight || 500;
            const stroke = 'rgba(255,255,255,0.65)';
            const dx = g.bx - g.ax;
            const dy = g.by - g.ay;
            const hline = (y: number, x1: number, x2: number, key: string) => (
              <line key={key} x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={1} className="fib-ghost-line" />
            );
            const seg = (x1: number, y1: number, x2: number, y2: number, key: string) => (
              <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={1} className="fib-ghost-line" />
            );
            // Proyeccion al borde para rectas (igual que el pintado final).
            const rayTo = (xEdge: number): { x: number; y: number } => {
              if (Math.abs(dx) < 0.5) return { x: g.ax, y: g.by };
              const t = (xEdge - g.ax) / dx;
              return { x: xEdge, y: g.ay + t * dy };
            };
            switch (g.tool) {
              case 'FIBO':
                return (<>{DEFAULT_FIB_LEVELS.map((ratio) => hline(g.by + (g.ay - g.by) * ratio, g.ax, g.bx, `ghost-${ratio}`))}</>);
              case 'LINE': {
                if (Math.abs(dx) < 0.5) return seg(g.ax, 0, g.ax, H, 'ghost-v');
                const p0 = rayTo(0);
                const p1 = rayTo(W);
                return seg(p0.x, p0.y, p1.x, p1.y, 'ghost-line');
              }
              case 'RAY': {
                const p = rayTo(dx >= 0 ? W : 0);
                return seg(g.ax, g.ay, p.x, p.y, 'ghost-ray');
              }
              case 'ARROW': {
                const a = Math.atan2(dy, dx);
                const s = 10;
                const head = `${g.bx},${g.by} ${g.bx - s * Math.cos(a - 0.42)},${g.by - s * Math.sin(a - 0.42)} ${g.bx - s * Math.cos(a + 0.42)},${g.by - s * Math.sin(a + 0.42)}`;
                return (<>{seg(g.ax, g.ay, g.bx, g.by, 'ghost-arrow')}<polygon key="ghost-head" points={head} fill={stroke} className="fib-ghost-line" /></>);
              }
              case 'H_SEGMENT':
                return hline(g.ay, g.ax, g.bx, 'ghost-hseg');
              case 'H_LINE':
                return hline(g.ay, 0, W, 'ghost-hline');
              case 'H_RAY':
                return hline(g.ay, g.ax, dx >= 0 ? W : 0, 'ghost-hray');
              case 'RECT':
                return (<rect key="ghost-rect" x={Math.min(g.ax, g.bx)} y={Math.min(g.ay, g.by)} width={Math.max(Math.abs(dx), 1)} height={Math.max(Math.abs(dy), 1)} fill="none" stroke={stroke} strokeWidth={1} className="fib-ghost-line" />);
              case 'CIRCLE':
                return (<ellipse key="ghost-circle" cx={(g.ax + g.bx) / 2} cy={(g.ay + g.by) / 2} rx={Math.max(Math.abs(dx) / 2, 1)} ry={Math.max(Math.abs(dy) / 2, 1)} fill="none" stroke={stroke} strokeWidth={1} className="fib-ghost-line" />);
              case 'TRIANGLE':
                return (<polygon key="ghost-tri" points={`${g.ax},${g.ay} ${g.bx},${g.by} ${g.ax},${g.by}`} fill="none" stroke={stroke} strokeWidth={1} className="fib-ghost-line" />);
              case 'PRICE_LINE':
                return hline(g.by, 0, W, 'ghost-price');
              case 'MEASURE': {
                const color = g.up ? COLORS.up : COLORS.down;
                const text = g.label ?? '';
                const lw = text.length * 6.2 + 16;
                const lx = Math.min(Math.max(Math.min(g.ax, g.bx) + Math.abs(dx) / 2 - lw / 2, 8), Math.max(W - lw - 8, 8));
                const ly = Math.max(Math.min(g.ay, g.by) - 30, 8);
                return (<g key="ghost-measure">
                  <rect x={Math.min(g.ax, g.bx)} y={Math.min(g.ay, g.by)} width={Math.max(Math.abs(dx), 1)} height={Math.max(Math.abs(dy), 1)} fill={hexWithAlpha(color, 0.12) ?? 'transparent'} stroke={color} strokeWidth={1} strokeDasharray="3 2" className="fib-ghost-line" />
                  {text !== '' && (<>
                    <rect x={lx} y={ly} width={lw} height={20} rx={4} fill="rgba(10,10,10,0.92)" stroke={color} strokeWidth={1} className="fib-ghost-line" />
                    <text x={lx + lw / 2} y={ly + 10} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#f5f7fa" className="measure-ghost-label">{text}</text>
                  </>)}
                </g>);
              }
              default:
                return seg(g.ax, g.ay, g.bx, g.by, 'ghost-seg');
            }
          })()}
          {measuredView && (() => {
            const v = measuredView;
            const Wm = containerRef.current?.clientWidth || 0;
            const color = v.up ? COLORS.up : COLORS.down;
            const lw = v.label.length * 6.2 + 16;
            const lx = Math.min(Math.max(v.x + v.w / 2 - lw / 2, 8), Math.max(Wm - lw - 8, 8));
            const ly = Math.max(v.y - 30, 8);
            return (<g key="measured">
              <rect x={v.x} y={v.y} width={v.w} height={v.h} fill={hexWithAlpha(color, 0.12) ?? 'transparent'} stroke={color} strokeWidth={1} strokeDasharray="3 2" className="measure-line" />
              <rect x={lx} y={ly} width={lw} height={20} rx={4} fill="rgba(10,10,10,0.92)" stroke={color} strokeWidth={1} className="measure-label-box" />
              <text x={lx + lw / 2} y={ly + 10} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#f5f7fa" className="measure-label">{v.label}</text>
            </g>);
          })()}
        </svg>
      )}
      {fibLabels.length > 0 && (
        <div className="fib-labels" aria-hidden="true">
          {fibLabels.map((label, i) => (
            <span
              key={i}
              className={label.after ? 'fib-label' : 'fib-label fib-label-end'}
              style={{ top: label.top, left: label.left, color: label.color }}
            >
              {label.text}
            </span>
          ))}
        </div>
      )}
      {vpView && vpView.bars.length > 0 && (
        <>
          <svg className="vp-overlay" aria-hidden="true">
            {vpView.pocY != null && (
              <line x1={0} y1={vpView.pocY} x2="100%" y2={vpView.pocY} stroke={COLORS.accent} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="4 3" className="vp-poc-line" />
            )}
            {vpView.bars.map((b, i) => (
              <g key={i}>
                <rect x={b.x} y={b.top} width={b.downWidth} height={b.height} fill={b.poc ? 'rgba(242,201,76,0.30)' : 'rgba(242,54,69,0.32)'} className="vp-row" />
                <rect x={b.x + b.downWidth} y={b.top} width={b.upWidth} height={b.height} fill={b.poc ? 'rgba(242,201,76,0.42)' : 'rgba(0,192,135,0.32)'} className="vp-row" />
              </g>
            ))}
          </svg>
          {vpView.tag && (
            <div className="vp-tag" style={{ borderColor: COLORS.accent }}>{vpView.tag}</div>
          )}
        </>
      )}
      {maTags && (
        <>
          <svg className="ma-leaders" aria-hidden="true">
            {maTags.leaders.map((l, i) => (
              <polyline
                key={i}
                points={`${l.x1},${l.y1} ${l.x2},${l.y2} ${l.x3},${l.y3}`}
                fill="none"
                stroke={l.color}
                strokeWidth={1}
                strokeDasharray="2 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {maTags.tags.map((t, i) => (
            <span
              key={i}
              className="ma-tag"
              style={{ left: t.left, top: t.top, color: t.color, borderColor: t.color }}
            >
              {t.text}
            </span>
          ))}
        </>
      )}
      {countdown && !priceTagHidden && (
        <>
          <div
            className="lw-price-line-label"
            aria-hidden="true"
            style={{ top: countdown.lineTop, right: countdown.lineRight, background: countdown.lineBg }}
          >
            {countdown.label}
          </div>
          <div
            className="lw-price-tag"
            style={{
              top: countdown.top,
              ...(countdown.width != null ? { width: countdown.width, right: 0 } : {}),
            }}
            aria-label={`${countdown.label} ${countdown.price}, cierra en ${countdown.text}`}
          >
            <div className="lw-price-tag-main" style={{ background: countdown.color }}>
              {countdown.price}
            </div>
            <div className="lw-price-tag-countdown" style={{ background: countdown.dim }}>
              {countdown.text}
            </div>
          </div>
        </>
      )}
      {pendingDot && (
        <>
          <span className="fib-pending-dot" style={{ left: pendingDot.left, top: pendingDot.top }} />
          <span
            className="fib-pending-tag"
            style={{ left: pendingDot.left + 12, top: Math.max(pendingDot.top - 34, 4) }}
          >
            Toca fin
          </span>
        </>
      )}
      {(() => {
        const active = dragView ?? (hoverFibId
          ? (() => {
            const f = fibListRef.current.find((x) => x.id === hoverFibId);
            return f ? { id: f.id, start: f.start, end: f.end } : null;
          })()
          : null);
        if (!active || !chartRef.current || !candleRef.current) return null;
        const dots: { left: number; top: number; locked: boolean }[] = [];
        const locked = fibListRef.current.find((x) => x.id === active.id)?.locked ?? false;
        for (const anchor of [active.start, active.end]) {
          try {
            const x = xAtTimeMs(chartRef.current, anchor.time);
            const y = candleRef.current.priceToCoordinate(anchor.price);
            if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
              dots.push({ left: x, top: y, locked });
            }
          } catch {
            // fuera de escala
          }
        }
        if (!dots.length) return null;
        return (
          <>
            {dots.map((d, i) => (
              <span key={i} className={`fib-anchor-dot${d.locked ? ' locked' : ''}`} style={{ left: d.left, top: d.top }} />
            ))}
          </>
        );
      })()}
      {indicators.drawTool && (
        <div className="lw-draw-hint">
          {drawStep === 0 ? 'Toca el primer punto' : 'Toca el segundo punto'} · {indicators.drawTool === 'FIBO' ? 'Fibo' : drawKindLabel(indicators.drawTool as import('@/lib/chart/draw').DrawKind)}
        </div>
      )}
      <div className="lw-tz">
        {historyLoading && <span className="lw-tz-loading">Cargando historia…</span>}
        <span className="lw-tz-clock" aria-hidden="true">
          {formatClockInZone(nowMs, tz)} {zoneOffsetLabel(tz, nowMs)}
        </span>
        <select
          className="lw-tz-select"
          value={tz}
          onChange={(e) => {
            const v = e.target.value;
            setTz(v);
            writeChartTimezone(v);
          }}
          aria-label="Zona horaria del chart"
        >
          {CHART_TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {zoneOffsetLabel(z, nowMs)} {zoneShortName(z)}
            </option>
          ))}
        </select>
      </div>
      <div ref={containerRef} className="lw-container" />
      {status === 'loading' && <div className="chart-empty-state"><p>Cargando gráfica…</p></div>}
      {status === 'empty' && (
        <div className="chart-empty-state"><p>Sin datos para este par en la web (TradingView aún no disponible).</p></div>
      )}
    </div>
  );
});
