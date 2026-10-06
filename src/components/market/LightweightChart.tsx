import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { displayBase, displayPairLabel, fetchCandles, fetchExtendedFlag, fetchLatestCandles } from '@/api/market';
import { fetchTakerVolumes } from '@/api/binanceFutures';
import { calculateBollingerBands, calculateStochRSI, calculateVolumeProfile } from '@/lib/chart/indicators';
import { calculateMacd } from '@/lib/chart/macd';
import { computeMaLines, resolveHtfColor, stackTagCenters, type MaConfig } from '@/lib/chart/ma';
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
  intervalAggregate,
  intervalBarCount,
  parseTrackedPair,
} from '@/lib/config';
import type { ChartIndicatorsState, MaLineConfig } from '@/lib/chart/types';
import type { ChartHandle } from '@/components/market/CandlestickChart';
import { useMarketStore } from '@/store/useMarketStore';
import { ALL_FIB_LEVELS, DEFAULT_FIB_LEVELS, fibLevelPrice, hexWithAlpha, hitFibOverlay, levelsSorted, trimRatio, type FibOverlay } from '@/lib/chart/fib';
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
// Tags de MAs: alto exacto para el anti-encimado, lider quebrado (tramo
// corto a 45 grados + recta horizontal hasta el tag).
const MA_TAG_H = 20;
const MA_TAG_GAP = 4;
const MA_ELBOW = 14;
const MA_RUN = 30;
// Alto aprox del cuadro de precio actual (para cederle paso a la cruceta).
const PRICE_TAG_H = 36;
const CROSSHAIR_LABEL_HALF = 11;
// Velas visibles al abrir, estilo TradingView (el resto queda a la izquierda con pan).
const INITIAL_VISIBLE_BARS = 150;
const INITIAL_RIGHT_OFFSET_BARS = 8;

type AnySeries = ISeriesApi<'Candlestick' | 'Histogram' | 'Line'>;

const MACD_DIF_COLOR = '#2962FF';
const MACD_DEA_COLOR = '#FF6D00';

interface PaneLegends {
  stoch?: { k: number; d: number };
  rsi?: { v: number; ma: number | null };
  macd?: { hist: number; dif: number; dea: number; p: number };
  vol?: { total: string };
  taker?: { base: string; cv: number; buy: number; sell: number };
}

const sec = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

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
  const ghostRef = useRef<AnySeries[]>([]);
  const fibDefsRef = useRef<{ fibId: string; time: UTCTimestamp; price: number; text: string; color: string }[]>([]);
  const fibSeriesRef = useRef(new Map<string, AnySeries[]>());
  const fibListRef = useRef<FibOverlay[]>([]);
  const fibPainterRef = useRef<((fib: FibOverlay) => void) | null>(null);
  const [hoverFibId, setHoverFibId] = useState<string | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const [selectedFibId, setSelectedFibId] = useState<string | null>(null);
  const [fibBarPos, setFibBarPos] = useState<{ x: number; y: number } | null>(null);
  const [fibSettingsOpen, setFibSettingsOpen] = useState(false);
  const barDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const hoverAnchorRef = useRef<{ id: string; isStart: boolean } | null>(null);
  const draggingRef = useRef<{ id: string; isStart: boolean } | null>(null);
  const [dragView, setDragView] = useState<{ id: string; start: { time: number; price: number }; end: { time: number; price: number } } | null>(null);
  const [tick, setTick] = useState(0);
  const [drawStep, setDrawStep] = useState(0);
  const [fibLabels, setFibLabels] = useState<{ top: number; left: number; text: string; color: string }[]>([]);
  const [paneLegends, setPaneLegends] = useState<PaneLegends | null>(null);
  const maTagsRef = useRef<{ time: number; price: number; text: string; color: string }[]>([]);
  const [maTags, setMaTags] = useState<{
    tags: { left: number; top: number; text: string; color: string }[];
    leaders: { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; color: string }[];
  } | null>(null);
  const priceTagTopRef = useRef<number | null>(null);
  const [priceTagHidden, setPriceTagHidden] = useState(false);
  const priceTagHiddenRef = useRef(false);
  const [countdown, setCountdown] = useState<{ top: number; label: string; price: string; text: string; color: string; dim: string; lineTop: number; lineRight: number; lineBg: string; width?: number } | null>(null);
  const overlaysRef = useRef<AnySeries[]>([]);
  const colorKeysRef = useRef(new Map<AnySeries, string>());
  const candlesRef = useRef<CandleData[]>([]);
  const extendedRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready'>('loading');
  const [legend, setLegend] = useState('');
  const [chips, setChips] = useState<{ color: string; text: string }[]>([]);

  // Etiquetas al final de cada linea (no pegadas al eje).
  const refreshFibLabels = useCallback(() => {
    const chartApi = chartRef.current;
    const candlesApi = candleRef.current;
    const el = containerRef.current;
    if (!chartApi || !candlesApi || !el) return;
    const width = el.clientWidth || 0;
    const height = el.clientHeight || 500;
    const out: { top: number; left: number; text: string; color: string }[] = [];
    for (const def of fibDefsRef.current) {
      let y: number | null = null;
      let x: number | null = null;
      try {
        y = candlesApi.priceToCoordinate(def.price);
      } catch {
        y = null;
      }
      try {
        x = chartApi.timeScale().timeToCoordinate(def.time);
      } catch {
        x = null;
      }
      if (
        y == null || !Number.isFinite(y) || y < 0 || y > height ||
        x == null || !Number.isFinite(x)
      ) {
        continue;
      }
      out.push({ top: y, left: Math.min(Math.max(x - 4, 8), Math.max(width - 8, 8)), text: def.text, color: def.color });
    }
    setFibLabels(out);
  }, []);

  // Cuenta regresiva al cierre: paso de vela sale de los datos, sin tabla de TFs.
  const refreshCountdown = useCallback(() => {
    const chartApi = chartRef.current;
    const candlesApi = candleRef.current;
    const el = containerRef.current;
    const data = candlesRef.current;
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
    const fibSeries = fibSeriesRef.current;

    const chart = createChart(el, {
      layout: { background: { color: COLORS.bg }, textColor: COLORS.ink2 },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 9 },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
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

    const fibPixels = (fib: FibOverlay): { ax: number; ay: number; bx: number; by: number } | null => {
      const candlesApi = candleRef.current;
      if (!candlesApi) return null;
      try {
        const ax = chart.timeScale().timeToCoordinate(sec(fib.start.time));
        const bx = chart.timeScale().timeToCoordinate(sec(fib.end.time));
        const ay = candlesApi.priceToCoordinate(fib.start.price);
        const by = candlesApi.priceToCoordinate(fib.end.price);
        if (ax == null || bx == null || ay == null || by == null) return null;
        if (![ax, bx, ay, by].every((v) => Number.isFinite(v))) return null;
        return { ax, ay, bx, by };
      } catch {
        return null;
      }
    };

    const moveDraggedAnchor = () => {
      const drag = draggingRef.current;
      const mouse = mouseRef.current;
      const candlesApi = candleRef.current;
      if (!drag || !mouse || !candlesApi) return;
      let timeMs: number | null = null;
      let price: number | null = null;
      try {
        const t = chart.timeScale().coordinateToTime(mouse.x);
        const p = candlesApi.coordinateToPrice(mouse.y);
        if (t != null && typeof p === 'number' && Number.isFinite(p)) {
          timeMs = Number(t) * 1000;
          price = p;
        }
      } catch {
        // fuera de escala
      }
      if (timeMs == null || price == null) return;
      const fib = fibListRef.current.find((f) => f.id === drag.id);
      if (!fib || fib.locked) {
        draggingRef.current = null;
        return;
      }
      const updated: FibOverlay = drag.isStart
        ? { ...fib, start: { time: timeMs, price } }
        : { ...fib, end: { time: timeMs, price } };
      fibListRef.current = fibListRef.current.map((f) => (f.id === drag.id ? updated : f));
      setDragView({ id: updated.id, start: { ...updated.start }, end: { ...updated.end } });
      fibPainterRef.current?.(updated);
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
      if (drawToolRef.current === 'FIBO' && pendingRef.current && !ghostQueued) {
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
          if (Math.hypot(mouse.x - pts.ax, mouse.y - pts.ay) <= 12) {
            anchor = { id: fib.id, isStart: true };
            hovered = fib;
            break;
          }
          if (Math.hypot(mouse.x - pts.bx, mouse.y - pts.by) <= 12) {
            anchor = { id: fib.id, isStart: false };
            hovered = fib;
            break;
          }
        }
      }
      if (!hovered) {
        const toX = (timeMs: number): number | null => {
          try {
            const v = chart.timeScale().timeToCoordinate(sec(timeMs));
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
      if (!anchor) {
        if (!hoverIdRef.current) setSelectedFibId(null);
        else setSelectedFibId(hoverIdRef.current);
        return;
      }
      const fib = fibListRef.current.find((f) => f.id === anchor.id);
      if (!fib || fib.locked || fib.hidden) return;
      draggingRef.current = anchor;
      setDragView({ id: fib.id, start: { ...fib.start }, end: { ...fib.end } });
      e.preventDefault();
      e.stopPropagation();
    };
    const onMouseUp = () => {
      const drag = draggingRef.current;
      if (!drag) return;
      draggingRef.current = null;
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

    // Fibo fantasma mientras se dibuja: niveles continuos A -> cursor.
    const clearGhost = () => {
      for (const s of ghostRef.current) {
        try {
          chart.removeSeries(s);
        } catch {
          // ya removida
        }
      }
      ghostRef.current = [];
    };
    // Solo niveles creciendo del punto A al cursor (la app no pinta diagonal base).
    const paintGhostFib = () => {
      const pending = pendingRef.current;
      const mouse = mouseRef.current;
      const candlesApi = candleRef.current;
      if (drawToolRef.current !== 'FIBO' || !pending || !mouse || !candlesApi) return;
      let endTime: number | null = null;
      try {
        const t = chart.timeScale().coordinateToTime(mouse.x);
        if (t != null) endTime = Number(t) * 1000;
      } catch {
        endTime = null;
      }
      let endPrice: number | null = null;
      try {
        const p = candlesApi.coordinateToPrice(mouse.y);
        if (typeof p === 'number' && Number.isFinite(p)) endPrice = p;
      } catch {
        endPrice = null;
      }
      if (endTime == null || !Number.isFinite(endTime) || endPrice == null) return;
      if (ghostRef.current.length === 0) {
        for (let i = 0; i < DEFAULT_FIB_LEVELS.length; i++) {
          try {
            ghostRef.current.push(chart.addSeries(LineSeries, {
              color: 'rgba(255,255,255,0.65)',
              lineWidth: 1,
              lineStyle: 0,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            }));
          } catch {
            break;
          }
        }
      }
      const ghost = ghostRef.current;
      if (!ghost.length) return;
      DEFAULT_FIB_LEVELS.forEach((ratio, i) => {
        const s = ghost[i];
        if (!s) return;
        const price = fibLevelPrice(endPrice as number, pending.price, ratio);
        try {
          s.setData(toLineData([
            { time: sec(pending.time), value: price },
            { time: sec(endTime as number), value: price },
          ]));
        } catch {
          // frame descartado
        }
      });
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
        if (snapshot != null) {
          const t = Number(snapshot) * 1000;
          const found = data.find((c) => c.time >= t);
          if (found) candle = found;
        }
        const chg = candle.open ? ((candle.close - candle.open) / candle.open) * 100 : 0;
        const ext = extendedRef.current;
        setLegend(
          `O ${formatPriceForChart(candle.open, ext)}  H ${formatPriceForChart(candle.high, ext)}  ` +
          `L ${formatPriceForChart(candle.low, ext)}  C ${formatPriceForChart(candle.close, ext)}  ` +
          `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
        );
      });
    };
    chart.subscribeCrosshairMove(cross);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      refreshFibLabels();
      refreshCountdown();
      refreshMaTags();
    });

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
        try {
          const t = chart.timeScale().coordinateToTime(mouse.x);
          const p = candlesApi.coordinateToPrice(mouse.y);
          if (t != null && typeof p === 'number' && Number.isFinite(p)) {
            return { time: Number(t) * 1000, price: p };
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
      useMarketStore.getState().bumpOverlays();
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
      candles.setData(data.map((c) => ({
        time: sec(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
      })));
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
      draggingRef.current = null;
      hoverAnchorRef.current = null;
      hoverIdRef.current = null;
      el.style.cursor = '';
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      markersRef.current = null;
      overlaysRef.current = [];
      candlesRef.current = [];
      ghostRef.current = [];
      pendingRef.current = null;
      fibDefsRef.current = [];
      fibSeries.clear();
      fibPainterRef.current = null;
      fibListRef.current = [];
      draggingRef.current = null;
      hoverAnchorRef.current = null;
    };
  }, [symbol, interval, refreshFibLabels, refreshCountdown, refreshMaTags]);

  // Si se suelta la herramienta a medias, se limpia el fantasma y el pendiente.
  useEffect(() => {
    if (indicators.drawTool) return;
    pendingRef.current = null;
    const chartApi = chartRef.current;
    for (const s of ghostRef.current) {
      try {
        chartApi?.removeSeries(s);
      } catch {
        // ya removida
      }
    }
    ghostRef.current = [];
    setDrawStep(0);
  }, [indicators.drawTool]);

  // Fibo hovereado a full, los demas tenues (como la app).
  useEffect(() => {
    const map = fibSeriesRef.current;
    if (!map.size) return;
    for (const [id, series] of map) {
      const base = fibListRef.current.find((f) => f.id === id)?.colorHex ?? '#FFFFFF';
      const dimmed = hoverFibId != null && id !== hoverFibId;
      const color = dimmed ? (hexWithAlpha(base, 0.35) ?? base) : base;
      for (const s of series) {
        try {
          s.applyOptions({ color } as never);
        } catch {
          // serie ya removida
        }
      }
    }
  }, [hoverFibId]);

  // Series de indicadores: se reconstruyen al cambiar toggles o datos.
  useEffect(() => {
    const chart = chartRef.current;
    const data = candlesRef.current;
    if (!chart || !data.length || status !== 'ready') return;
    let cancelled = false;

    for (const s of overlaysRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // ya removida
      }
    }
    overlaysRef.current = [];
    colorKeysRef.current.clear();
    fibSeriesRef.current.clear();
    fibDefsRef.current = [];
    maTagsRef.current = [];
    fibPainterRef.current = null;
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
    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: reserved + 0.05 },
    });
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
      const basis = track(chart.addSeries(LineSeries, { color: colors.bbBasis, lineWidth: 1, ...quiet }));
      basis.setData(toData(bb.middle));
      const upper = track(
        chart.addSeries(LineSeries, { color: colors.bbLine, lineWidth: 1, ...quiet }), 'bbLine',
      );
      upper.setData(toData(bb.upper));
      const lower = track(chart.addSeries(LineSeries, { color: colors.bbLine, lineWidth: 1, ...quiet }));
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

    const allMas = maConfigs(indicators.smaLines, indicators.emaLines).filter((m) => m.visible);
    const localMas = allMas.filter((m) => m.timeframe === 'chart' || m.timeframe === interval);
    const lines = computeMaLines(data, interval, localMas, new Map());
    for (const [id, pts] of Object.entries(lines)) {
      const cfg = [...indicators.smaLines, ...indicators.emaLines].find((l) => l.id === id);
      const maCfg = allMas.find((m) => m.id === id);
      const s = track(chart.addSeries(LineSeries, {
        color: cfg?.color ?? COLORS.sma, lineWidth: (cfg?.width ?? 1) as 1 | 2 | 3 | 4, ...quiet,
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
    // MAs de otro TF: se agregan al llegar (sin tumbar lo ya pintado).
    const extraTfs = [...new Set(
      allMas.filter((m) => m.timeframe !== 'chart' && m.timeframe !== interval).map((m) => m.timeframe),
    )].slice(0, 3);
    if (extraTfs.length) {
      (async () => {
        const extras = new Map<string, CandleData[]>();
        for (const tf of extraTfs) {
          try {
            const rows = await fetchCandles(symbol, tf, EXTRA_TF_LIMIT);
            if (cancelled) return;
            const candlesTf = toCandleList(rows);
            if (candlesTf.length) extras.set(tf, candlesTf);
          } catch {
            // ese TF queda sin pintar
          }
        }
        if (cancelled || !chartRef.current) return;
        const htf = computeMaLines(data, interval, allMas.filter((m) => extras.has(m.timeframe)), extras);
        for (const [id, pts] of Object.entries(htf)) {
          const cfg = [...indicators.smaLines, ...indicators.emaLines].find((l) => l.id === id);
          const maCfg = allMas.find((m) => m.id === id);
          // Otro TF: linea solida (el punteado es solo del lider al tag),
          // blanco hueso salvo color personalizado en el modal.
          const htfColor = resolveHtfColor({ color: cfg?.color, customColor: cfg?.customColor });
          const s = track(chartRef.current.addSeries(LineSeries, {
            color: htfColor, lineWidth: (cfg?.width ?? 1) as 1 | 2 | 3 | 4, ...quiet,
          }));
          s.setData(pts.map((p) => ({ time: sec(p.time), value: p.value })));
          const htfLast = pts.length ? pts[pts.length - 1]! : null;
          if (htfLast && maCfg) {
            maTagsRef.current.push({
              time: htfLast.time,
              price: htfLast.value,
              text: `${maCfg.type}${maCfg.period} ${maCfg.timeframe}`,
              color: htfColor,
            });
          }
        }
        refreshMaTags();
      })().catch(() => {
        // MAs HTF opcionales: el chart local ya esta pintado
      });
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

    if (indicators.volumeProfile) {
      const vp = calculateVolumeProfile(legacy, 48);
      if (vp.rows.length && vp.maxVolume > 0) {
        const span = Math.min(40, data.length);
        const t0 = times[Math.max(0, times.length - span)]!;
        const t1 = times[times.length - 1]!;
        for (const rowVp of vp.rows) {
          const frac = rowVp.total / vp.maxVolume;
          if (!(frac > 0)) continue;
          const s = track(chart.addSeries(LineSeries, {
            color: rowVp.up >= rowVp.down ? 'rgba(0,192,135,0.55)' : 'rgba(242,54,69,0.55)',
            lineWidth: (frac >= 0.66 ? 4 : frac >= 0.33 ? 2 : 1) as 1 | 2 | 3 | 4,
            ...quiet,
          }));
          s.setData(toLineData([
            { time: t0, value: rowVp.price },
            { time: t1, value: rowVp.price },
          ]));
        }
        if (vp.poc) {
          chips.push({ color: COLORS.accent, text: `POC ${fmtP(vp.poc.price)}` });
          try {
            const pocLine = candlesRef.current
              ? candleRef.current?.createPriceLine({
                price: vp.poc.price,
                color: COLORS.accent,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'POC',
              })
              : undefined;
            if (pocLine && candleRef.current) priceLinesRef.current.push({ series: candleRef.current, line: pocLine });
          } catch {
            // fuera de rango
          }
        }
      }
    }

    if (indicators.stochRsi || indicators.rsiEnabled) {
      const m = slot('osc');
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
        // Niveles 70/30 punteados como la app.
        for (const lv of [70, 30]) {
          const s = track(chart.addSeries(LineSeries, {
            color: COLORS.neutral, lineWidth: 1, lineStyle: 2, priceScaleId: 'osc', ...quiet,
          }));
          s.setData(toLineData([{ time: times[0]!, value: lv }, { time: times[times.length - 1]!, value: lv }]));
        }
        const signal = track(chart.addSeries(LineSeries, {
          color: COLORS.neutral, lineWidth: 1, priceScaleId: 'osc', ...quiet,
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
    // Fibos y dibujos guardados por simbolo (anclados por tiempo).
    const candlesApi = candleRef.current;
    if (candlesApi && data.length) {
      const firstT = sec(data[0]!.time);
      const lastT = sec(data[data.length - 1]!.time);
      const w = (width: number): 1 | 2 | 3 | 4 =>
        Math.min(Math.max(Math.round(width), 1), 4) as 1 | 2 | 3 | 4;
      const paintSingleFib = (fib: FibOverlay) => {
        const olds = fibSeriesRef.current.get(fib.id) ?? [];
        for (const s of olds) {
          try {
            chart.removeSeries(s);
          } catch {
            // ya removida
          }
          overlaysRef.current = overlaysRef.current.filter((o) => o !== s);
          colorKeysRef.current.delete(s);
        }
        const created: AnySeries[] = [];
        const localTrack = (s: AnySeries): AnySeries => {
          created.push(s);
          overlaysRef.current.push(s);
          return s;
        };
        const t0 = sec(fib.start.time);
        const t1 = sec(fib.end.time);
        // Solo niveles como segmentos A -> B (la app no pinta diagonal base);
        // el 0 va en el punto final (convencion de la app).
        const endT = t1 >= t0 ? t1 : t0;
        const defs: { fibId: string; time: UTCTimestamp; price: number; text: string; color: string }[] = [];
        for (const ratio of levelsSorted(fib)) {
          const price = fibLevelPrice(fib.end.price, fib.start.price, ratio);
          const s = localTrack(chart.addSeries(LineSeries, {
            color: fib.colorHex, lineWidth: w(fib.width), ...quiet,
          }));
          s.setData(toLineData([
            { time: t0, value: price },
            { time: t1, value: price },
          ]));
          defs.push({
            fibId: fib.id,
            time: endT,
            price,
            text: `${trimRatio(ratio)} (${formatAxisPrice(price, refClose, ext)})`,
            color: fib.colorHex,
          });
        }
        fibSeriesRef.current.set(fib.id, created);
        fibDefsRef.current = [
          ...fibDefsRef.current.filter((d) => d.fibId !== fib.id),
          ...defs,
        ];
      };
      fibPainterRef.current = paintSingleFib;
      const visibleFibs = loadFibOverlays(symbol).filter((f) => !f.hidden);
      fibListRef.current = loadFibOverlays(symbol);
      for (const fib of visibleFibs) paintSingleFib(fib);
      refreshFibLabels();
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
            slopeLine(t0, p0, t1, p1, d.colorHex, d.width, data[0]!.time, data[data.length - 1]!.time);
            break;
          case 'RAY':
            slopeLine(t0, p0, t1, p1, d.colorHex, d.width, t0, data[data.length - 1]!.time);
            break;
          case 'H_SEGMENT': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([{ time: sec(t0), value: p0 }, { time: sec(t1), value: p0 }]));
            break;
          }
          case 'H_LINE': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData([{ time: firstT, value: p0 }, { time: lastT, value: p0 }]);
            break;
          }
          case 'H_RAY': {
            const s = track(chart.addSeries(LineSeries, { color: d.colorHex, lineWidth: w(d.width), ...quiet }));
            s.setData(toLineData([{ time: sec(t0), value: p0 }, { time: lastT, value: p0 }]));
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
    try {
      markersRef.current?.setMarkers(markers.sort((a, b) => Number(a.time) - Number(b.time)));
    } catch {
      // chart en reconstruccion
    }

    return () => {
      cancelled = true;
    };
  }, [indicators, status, symbol, interval, tick, overlaysTick, refreshFibLabels, refreshMaTags]);

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
            const max = intervalBarCount(interval);
            if (data.length > max + 1) data.shift();
            appended = true;
          }
        }
        if (appended) setTick((t) => t + 1);
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
      try {
        chartRef.current?.timeScale().resetTimeScale();
      } catch {
        // chart aun no creado
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
      const x = chartRef.current.timeScale().timeToCoordinate(sec(pending.time));
      const y = candleRef.current.priceToCoordinate(pending.price);
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        pendingDot = { left: x, top: y };
      }
    } catch {
      pendingDot = null;
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
    setTick((t) => t + 1);
    useMarketStore.getState().bumpOverlays();
  };

  const deleteSelectedFib = () => {
    if (!symbol || !selectedFib) return;
    saveFibOverlays(symbol, loadFibOverlays(symbol).filter((f) => f.id !== selectedFib.id));
    setSelectedFibId(null);
    setFibSettingsOpen(false);
    if (hoverIdRef.current === selectedFib.id) {
      hoverIdRef.current = null;
      setHoverFibId(null);
    }
    setTick((t) => t + 1);
    useMarketStore.getState().bumpOverlays();
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
    if (!rect || !parent) return;
    const origX = rect.left - parent.left;
    const origY = rect.top - parent.top;
    barDragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    setFibBarPos({ x: origX, y: origY });
    const move = (ev: MouseEvent) => {
      const d = barDragRef.current;
      if (!d) return;
      setFibBarPos({ x: d.origX + ev.clientX - d.startX, y: Math.max(0, d.origY + ev.clientY - d.startY) });
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

  return (
    <div className="lw-chart">
      <FloatDrawBar />
      {selectedFib && (
        <div
          className="fib-selected-bar"
          role="toolbar"
          aria-label="Opciones del fibo seleccionado"
          style={fibBarPos ? { left: fibBarPos.x, top: fibBarPos.y, transform: 'none' } : undefined}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
            <span style={{ color: COLORS.neutral }}>MA: {paneLegends.rsi.ma.toFixed(2)}</span>
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
      {fibLabels.length > 0 && (
        <div className="fib-labels" aria-hidden="true">
          {fibLabels.map((label, i) => (
            <span
              key={i}
              className="fib-label fib-label-end"
              style={{ top: label.top, left: label.left, color: label.color }}
            >
              {label.text}
            </span>
          ))}
        </div>
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
            const x = chartRef.current.timeScale().timeToCoordinate(sec(anchor.time));
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
          {drawStep === 0 ? 'Toca el primer punto' : 'Toca el segundo punto'} · {indicators.drawTool === 'FIBO' ? 'Fibo' : indicators.drawTool}
        </div>
      )}
      <div ref={containerRef} className="lw-container" />
      {status === 'loading' && <div className="chart-empty-state"><p>Cargando gráfica…</p></div>}
      {status === 'empty' && (
        <div className="chart-empty-state"><p>Sin datos para este par en la web (TradingView aún no disponible).</p></div>
      )}
    </div>
  );
});
