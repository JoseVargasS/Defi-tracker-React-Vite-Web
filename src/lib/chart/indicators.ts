import { Candle, XY } from "./normalize";

export const CHART_THEME = {
  bg: "#060708",
  panel: "#0b0d10",
  grid: "rgba(255, 255, 255, 0.055)",
  text: "#aeb4bd",
  muted: "#69707a",
  up: "#00c087",
  down: "#f23645",
  neutral: "#858b93",
  accent: "#f2c94c",
  stochK: "#2f80ed",
  stochD: "#f2994a",
  stochLevelOver: "rgba(242, 54, 69, 0.35)",
  stochLevelUnder: "rgba(0, 192, 135, 0.35)",
  sma: "#f5eef2",
  ema: "#06b6d4",
  bbLine: "rgba(242, 201, 76, 0.78)",
  bbFill: "rgba(242, 201, 76, 0.055)",
  bbBasis: "rgba(235, 87, 87, 0.7)",
  volGrid: "rgba(255, 255, 255, 0.035)",
  stochGrid: "rgba(255, 255, 255, 0.04)",
  plPositive: "#1ecb81",
  plNegative: "#e74c3c",
  plNeutral: "#aaa",
  border: "rgba(255, 255, 255, 0.1)",
};

function calculateRSI(data: Candle[], period = 14): XY[] {
  if (!Array.isArray(data) || data.length <= period) {
    return (data || []).map((d) => ({ x: d.x, y: null }));
  }

  const rsi: XY[] = [{ x: data[0]!.x, y: null }];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i]!.c - data[i - 1]!.c;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  let avgGain = gains.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((acc, v) => acc + v, 0) / period;

  for (let i = 1; i < period; i++) {
    rsi.push({ x: data[i]!.x, y: null });
  }

  rsi.push({
    x: data[period]!.x,
    y: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss),
  });

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]!) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]!) / period;
    rsi.push({
      x: data[i + 1]!.x,
      y: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss),
    });
  }

  return rsi;
}

export function calculateVolume(data: Candle[]) {
  return data.map((item) => ({
    x: item.x,
    y: item.v || 0,
    q: item.q || 0,
    color: item.c >= item.o ? CHART_THEME.up : CHART_THEME.down,
  }));
}

export function calculateVolumeProfile(data: Candle[], rowCount = 48) {
  const candles = (data || []).filter(
    (item) =>
      Number.isFinite(item?.h) &&
      Number.isFinite(item?.l) &&
      Number.isFinite(item?.c) &&
      Number.isFinite(item?.o),
  );

  if (!candles.length) return { rows: [], poc: null, maxVolume: 0 };

  const minPrice = Math.min(...candles.map((item) => item.l));
  const maxPrice = Math.max(...candles.map((item) => item.h));
  if (
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    minPrice === maxPrice
  ) {
    return { rows: [], poc: null, maxVolume: 0 };
  }

  const rowsTotal = Math.max(12, Math.min(96, Math.round(rowCount)));
  const rowSize = (maxPrice - minPrice) / rowsTotal;
  const rows = Array.from({ length: rowsTotal }, (_, index) => {
    const low = minPrice + rowSize * index;
    const high = low + rowSize;
    return {
      low,
      high,
      price: low + rowSize / 2,
      up: 0,
      down: 0,
      total: 0,
    };
  });

  candles.forEach((candle) => {
    const rawVolume =
      Number.isFinite(candle.q) && candle.q > 0 ? candle.q : candle.v;
    const volume = Number.isFinite(rawVolume) ? rawVolume : 0;
    if (volume <= 0) return;

    const candleLow = Math.max(minPrice, Math.min(candle.l, candle.h));
    const candleHigh = Math.min(maxPrice, Math.max(candle.l, candle.h));
    const isUp = candle.c >= candle.o;

    if (candleHigh === candleLow) {
      const idx = Math.max(
        0,
        Math.min(rows.length - 1, Math.floor((candle.c - minPrice) / rowSize)),
      );
      rows[idx]![isUp ? "up" : "down"] += volume;
      rows[idx]!.total += volume;
      return;
    }

    const firstRow = Math.max(0, Math.floor((candleLow - minPrice) / rowSize));
    const lastRow = Math.min(
      rows.length - 1,
      Math.floor((candleHigh - minPrice) / rowSize),
    );
    const candleRange = candleHigh - candleLow;

    for (let idx = firstRow; idx <= lastRow; idx++) {
      const row = rows[idx]!;
      const overlap = Math.max(
        0,
        Math.min(candleHigh, row.high) - Math.max(candleLow, row.low),
      );
      if (overlap <= 0) continue;

      const rowVolume = volume * (overlap / candleRange);
      row[isUp ? "up" : "down"] += rowVolume;
      row.total += rowVolume;
    }
  });

  const maxVolume = rows.reduce((max, row) => Math.max(max, row.total), 0);
  const poc = rows.reduce<(typeof rows)[number] | null>(
    (best, row) => (row.total > (best?.total ?? 0) ? row : best),
    null,
  );

  return { rows, poc, maxVolume };
}

export function calculateBollingerBands(
  data: Candle[],
  period = 20,
  multiplier = 2,
) {
  const bands: { upper: XY[]; middle: XY[]; lower: XY[] } = {
    upper: [],
    middle: [],
    lower: [],
  };

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      bands.upper.push({ x: data[i]!.x, y: null });
      bands.middle.push({ x: data[i]!.x, y: null });
      bands.lower.push({ x: data[i]!.x, y: null });
      continue;
    }

    const slice = data.slice(i - period + 1, i + 1);
    const sma = slice.reduce((acc, item) => acc + item.c, 0) / period;
    const variance =
      slice.reduce((acc, item) => acc + (item.c - sma) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);

    bands.upper.push({ x: data[i]!.x, y: sma + deviation * multiplier });
    bands.middle.push({ x: data[i]!.x, y: sma });
    bands.lower.push({ x: data[i]!.x, y: sma - deviation * multiplier });
  }

  return bands;
}

export function calculateStochRSI(
  data: Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kPeriod = 3,
  dPeriod = 3,
) {
  const rsi = calculateRSI(data, rsiPeriod);
  const rsiValues = rsi.filter((item) => item.y !== null);
  const rsiOffset = rsi.length - rsiValues.length;
  const rawK = rsiValues.map((item, index) => {
    if (index < stochPeriod - 1) return null;
    const slice = rsiValues.slice(index - stochPeriod + 1, index + 1);
    const low = Math.min(...slice.map((d) => d.y!));
    const high = Math.max(...slice.map((d) => d.y!));
    return high === low ? 0 : ((item.y! - low) / (high - low)) * 100;
  });

  const smooth = (values: (number | null)[], period: number) =>
    values.map((value, index) => {
      if (value === null || index < period - 1) return null;
      const slice = values.slice(index - period + 1, index + 1);
      return slice.some((v) => v === null)
        ? null
        : slice.reduce<number>((acc, v) => acc + (v ?? 0), 0) / period;
    });

  const kValues = smooth(rawK, kPeriod);
  const dValues = smooth(kValues, dPeriod);

  return {
    k: rsi.map((item, index) => {
      const vi = index - rsiOffset;
      return {
        x: item.x,
        y: vi >= 0 && kValues[vi] !== undefined ? kValues[vi] : null,
      };
    }),
    d: rsi.map((item, index) => {
      const vi = index - rsiOffset;
      return {
        x: item.x,
        y: vi >= 0 && dValues[vi] !== undefined ? dValues[vi] : null,
      };
    }),
  };
}

export { calculateRSI };

export function calculateSMA(data: Candle[], period: number): XY[] {
  return data.map((item, i) => {
    if (i < period - 1) return { x: item.x, y: null };
    const sum = data
      .slice(i - period + 1, i + 1)
      .reduce((acc, d) => acc + d.c, 0);
    return { x: item.x, y: sum / period };
  });
}

export function calculateEMA(data: Candle[], period: number): XY[] {
  const k = 2 / (period + 1);
  let ema = 0;
  return data.map((item, i) => {
    if (i < period - 1) return { x: item.x, y: null };
    if (i === period - 1) {
      ema = data.slice(0, period).reduce((acc, d) => acc + d.c, 0) / period;
      return { x: item.x, y: ema };
    }
    ema = item.c * k + ema * (1 - k);
    return { x: item.x, y: ema };
  });
}
