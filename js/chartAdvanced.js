// js/chartAdvanced.js
// Calculos tecnicos y plugins para el grafico de velas.

export const CHART_THEME = {
  bg: '#060708',
  panel: '#0b0d10',
  grid: 'rgba(255, 255, 255, 0.055)',
  text: '#aeb4bd',
  muted: '#69707a',
  up: '#00c087',
  down: '#f23645',
  neutral: '#858b93',
  accent: '#f2c94c',
  stochK: '#2f80ed',
  stochD: '#f2994a',
  border: 'rgba(255, 255, 255, 0.1)'
};

export function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: number >= 1000 ? 1 : 2
  }).format(number);
}

export function normalizeKline(kline) {
  return {
    x: Number(kline[0]),
    o: Number(kline[1]),
    h: Number(kline[2]),
    l: Number(kline[3]),
    c: Number(kline[4]),
    v: Number(kline[5] ?? 0),
    q: Number(kline[7] ?? 0)
  };
}

function calculateRSI(data, period = 14) {
  if (!Array.isArray(data) || data.length <= period) {
    return (data || []).map(d => ({ x: d.x, y: null }));
  }

  const rsi = [{ x: data[0].x, y: null }];
  const gains = [];
  const losses = [];

  for (let i = 1; i < data.length; i++) {
    const change = data[i].c - data[i - 1].c;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  let avgGain = gains.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((acc, value) => acc + value, 0) / period;

  for (let i = 1; i < period; i++) {
    rsi.push({ x: data[i].x, y: null });
  }

  rsi.push({
    x: data[period].x,
    y: avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
  });

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi.push({
      x: data[i + 1].x,
      y: avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
    });
  }

  return rsi;
}

export function calculateVolume(data) {
  return data.map(item => ({
    x: item.x,
    y: item.v || 0,
    q: item.q || 0,
    color: item.c >= item.o ? CHART_THEME.up : CHART_THEME.down
  }));
}

export function calculateBollingerBands(data, period = 20, multiplier = 2) {
  const bands = { upper: [], middle: [], lower: [] };

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      bands.upper.push({ x: data[i].x, y: null });
      bands.middle.push({ x: data[i].x, y: null });
      bands.lower.push({ x: data[i].x, y: null });
      continue;
    }

    const slice = data.slice(i - period + 1, i + 1);
    const sma = slice.reduce((acc, item) => acc + item.c, 0) / period;
    const variance = slice.reduce((acc, item) => acc + (item.c - sma) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);

    bands.upper.push({ x: data[i].x, y: sma + deviation * multiplier });
    bands.middle.push({ x: data[i].x, y: sma });
    bands.lower.push({ x: data[i].x, y: sma - deviation * multiplier });
  }

  return bands;
}

export function calculateStochRSI(data, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsi = calculateRSI(data, rsiPeriod);
  const rsiValues = rsi.filter(item => item.y !== null);
  const rsiOffset = rsi.length - rsiValues.length;
  const rawK = rsiValues.map((item, index) => {
    if (index < stochPeriod - 1) return null;
    const slice = rsiValues.slice(index - stochPeriod + 1, index + 1);
    const low = Math.min(...slice.map(d => d.y));
    const high = Math.max(...slice.map(d => d.y));
    return high === low ? 0 : ((item.y - low) / (high - low)) * 100;
  });

  const smooth = (values, period) => values.map((value, index) => {
    if (value === null || index < period - 1) return null;
    const slice = values.slice(index - period + 1, index + 1);
    return slice.some(item => item === null)
      ? null
      : slice.reduce((acc, item) => acc + item, 0) / period;
  });

  const kValues = smooth(rawK, kPeriod);
  const dValues = smooth(kValues, dPeriod);

  return {
    k: rsi.map((item, index) => {
      const valueIndex = index - rsiOffset;
      return { x: item.x, y: valueIndex >= 0 ? kValues[valueIndex] : null };
    }),
    d: rsi.map((item, index) => {
      const valueIndex = index - rsiOffset;
      return { x: item.x, y: valueIndex >= 0 ? dValues[valueIndex] : null };
    })
  };
}

export function createAdvancedTooltipPlugin() {
  return {
    id: 'advancedTooltip',
    afterDraw(chart) {
      if (!chart.ctx || !chart.chartArea || !chart.crosshair || chart.crosshair.x === null) return;

      const candleData = chart.data.datasets[0]?.data?.[chart.crosshair.snapIndex];
      if (!candleData) return;

      const ctx = chart.ctx;
      const hasVolume = Number.isFinite(candleData.v) && candleData.v > 0;
      const tooltipHeight = 42;
      const tooltipX = chart.chartArea.left + 8;
      const tooltipY = Math.max(4, chart.chartArea.top - tooltipHeight - 8);
      const tooltipWidth = Math.min(chart.chartArea.width - 16, hasVolume ? 620 : 540);

      const dateStr = new Date(candleData.x).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const isUp = candleData.c >= candleData.o;
      const priceColor = isUp ? CHART_THEME.up : CHART_THEME.down;
      const change = candleData.c - candleData.o;
      const changePct = candleData.o ? (change / candleData.o) * 100 : 0;

      ctx.save();
      ctx.fillStyle = 'rgba(8, 10, 12, 0.78)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 6);
      else ctx.rect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = CHART_THEME.text;
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(dateStr, tooltipX + 10, tooltipY + 10);

      const rows = [
        ['O', candleData.o?.toFixed?.(4)],
        ['H', candleData.h?.toFixed?.(4), CHART_THEME.up],
        ['L', candleData.l?.toFixed?.(4), CHART_THEME.down],
        ['C', candleData.c?.toFixed?.(4), priceColor],
        [
          'CHG',
          `${change >= 0 ? '+' : ''}${change.toFixed(4)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`,
          priceColor
        ]
      ];

      if (hasVolume) rows.push(['VOL', compactNumber(candleData.v)]);

      ctx.font = '11px Inter, sans-serif';
      let cursorX = tooltipX + 10;
      const rowY = tooltipY + 27;
      rows.forEach(([label, value, color]) => {
        ctx.fillStyle = CHART_THEME.muted;
        ctx.textAlign = 'left';
        ctx.fillText(label, cursorX, rowY);
        cursorX += ctx.measureText(`${label} `).width;
        ctx.fillStyle = color || '#f3f5f7';
        ctx.fillText(value || '-', cursorX, rowY);
        cursorX += ctx.measureText(`${value || '-'}   `).width;
      });

      ctx.restore();
    }
  };
}
