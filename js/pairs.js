// js/pairs.js
// UI de mercado, watchlist y renderer flexible de velas.
import { state, names } from './state.js';
import { escapeHTML, formatPrice, safeImageUrl } from './utils.js';
import { fetchPrice, fetch24hStats, fetchKlines } from './exchange.js';
import {
  CHART_THEME,
  calculateBollingerBands,
  calculateStochRSI,
  calculateVolume,
  calculateVolumeProfile,
  compactNumber,
  createAdvancedTooltipPlugin,
  normalizeKline
} from './chartAdvanced.js';
import { writeTrackedPairs } from './storage.js';

const CANDLE_COLORS = {
  up: CHART_THEME.up,
  down: CHART_THEME.down,
  unchanged: CHART_THEME.neutral
};

const PANEL_STACK = 'market-panels';

const getPairMeta = symbol => {
  const normalized = String(symbol || '').toUpperCase();
  const listed = state.coinsList?.find(item => item.symbol === normalized);
  if (listed) return listed;

  const knownQuotes = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR', 'BRL', 'DAI'];
  const quote = knownQuotes.find(item => normalized.endsWith(item)) || '';
  return {
    symbol: normalized,
    base: quote ? normalized.slice(0, -quote.length) : normalized,
    quote
  };
};

const getPairLabel = symbol => {
  const { base, quote } = getPairMeta(symbol);
  return quote ? `${base}/${quote}` : symbol;
};

const getCoinName = symbol => {
  const { base } = getPairMeta(symbol);
  return names[base.toUpperCase()] || base;
};

const formatPairPrice = (price, quote) => {
  const formatted = formatPrice(price);
  if (formatted === '-') return formatted;
  return quote ? `${formatted} ${quote}` : formatted;
};

const timeUnitByInterval = interval => {
  if (['3M', '1M'].includes(interval)) return 'month';
  if (interval === '1w') return 'week';
  if (['5d', '3d', '1d'].includes(interval)) return 'day';
  if (['12h', '4h', '1h'].includes(interval)) return 'hour';
  return 'minute';
};

const isIndicatorEnabled = key => state.chartIndicators?.[key] !== false;

const getVisibleWindow = dataLength => {
  const minVisible = state.chartView?.minVisible ?? 24;
  const zoom = Math.max(minVisible, Math.min(state.chartZoom, dataLength));
  const end = dataLength;
  const start = Math.max(0, end - zoom);
  state.chartZoom = zoom;
  return { start, end };
};

const sliceTechnicalSeries = (series, start, end) => ({
  bands: {
    upper: series.bands.upper.slice(start, end),
    middle: series.bands.middle.slice(start, end),
    lower: series.bands.lower.slice(start, end)
  },
  volume: series.volume.slice(start, end),
  stochRsi: {
    k: series.stochRsi.k.slice(start, end),
    d: series.stochRsi.d.slice(start, end)
  }
});

const buildTechnicalSeries = data => ({
  bands: calculateBollingerBands(data),
  volume: calculateVolume(data),
  stochRsi: calculateStochRSI(data)
});

const horizontalLevel = (candles, value) => candles.map(item => ({ x: item.x, y: value }));

const lastDefined = items => {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.y !== null && items[i]?.y !== undefined) return items[i];
  }
  return null;
};

const formatIndicatorValue = value => Number.isFinite(value) ? value.toFixed(2) : '-';
const isScaleVisible = scale => Boolean(scale) && scale.options?.display !== false;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatProfilePrice = value => {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
};

const formatMeasurePrice = value => {
  if (!Number.isFinite(value)) return '-';
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
};

const getNearestCandlePoint = (chart, x, y) => {
  const priceScale = chart?.scales?.price;
  const xScale = chart?.scales?.x;
  const candles = chart?.data?.datasets?.[0]?.data || [];
  if (!priceScale || !xScale || !candles.length) return null;
  if (y < priceScale.top || y > priceScale.bottom) return null;

  let index = 0;
  let xPixel = xScale.getPixelForValue(candles[0].x);
  let minDistance = Math.abs(x - xPixel);

  candles.forEach((candle, candleIndex) => {
    const candleX = xScale.getPixelForValue(candle.x);
    const distance = Math.abs(x - candleX);
    if (distance < minDistance) {
      index = candleIndex;
      xPixel = candleX;
      minDistance = distance;
    }
  });

  return {
    index,
    x: candles[index].x,
    y: priceScale.getValueForPixel(y)
  };
};

function drawValueChip(ctx, chart, scale, value, color, y) {
  if (!Number.isFinite(value) || !scale) return;

  const label = value.toFixed(1);
  const width = Math.max(42, ctx.measureText(label).width + 16);
  const x = chart.chartArea.right + 4;

  ctx.save();
  ctx.fillStyle = '#121820';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, width, 22, 5);
  else ctx.rect(x, y, width, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f5f7fa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 12px Inter, sans-serif';
  ctx.fillText(label, x + width / 2, y + 11);
  ctx.restore();
}

function getSeparatedChipPositions(scale, values) {
  const chipHeight = 22;
  const gap = 5;
  const minY = scale.top + 4;
  const maxY = scale.bottom - chipHeight;
  const chips = values
    .filter(item => Number.isFinite(item.value))
    .map(item => ({
      ...item,
      y: Math.max(minY, Math.min(scale.getPixelForValue(item.value) - chipHeight / 2, maxY))
    }))
    .sort((a, b) => a.y - b.y);

  for (let i = 1; i < chips.length; i++) {
    chips[i].y = Math.max(chips[i].y, chips[i - 1].y + chipHeight + gap);
  }

  const overflow = chips.at(-1)?.y - maxY;
  if (overflow > 0) {
    for (let i = chips.length - 1; i >= 0; i--) chips[i].y -= overflow;
  }

  if (chips[0]?.y < minY) {
    const underflow = minY - chips[0].y;
    chips.forEach(chip => { chip.y += underflow; });
  }

  return chips;
}

const buildDatasets = (symbol, candles, series) => {
  const datasets = [
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
      order: 1
    }
  ];

  if (isIndicatorEnabled('bollinger')) {
    datasets.push(
      {
        label: 'BB Upper',
        type: 'line',
        data: series.bands.upper,
        yAxisID: 'price',
        borderColor: 'rgba(242, 201, 76, 0.78)',
        borderWidth: 1.2,
        pointRadius: 0,
        fill: false,
        order: 2
      },
      {
        label: 'BB Lower',
        type: 'line',
        data: series.bands.lower,
        yAxisID: 'price',
        borderColor: 'rgba(242, 201, 76, 0.78)',
        backgroundColor: 'rgba(242, 201, 76, 0.055)',
        borderWidth: 1.2,
        pointRadius: 0,
        fill: '-1',
        order: 2
      },
      {
        label: 'BB Basis',
        type: 'line',
        data: series.bands.middle,
        yAxisID: 'price',
        borderColor: 'rgba(235, 87, 87, 0.7)',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        order: 2
      }
    );
  }

  if (isIndicatorEnabled('volume')) {
    datasets.push({
      label: 'Volume',
      type: 'bar',
      data: series.volume,
      yAxisID: 'volume',
      backgroundColor: series.volume.map(item => `${item.color}66`),
      borderColor: series.volume.map(item => `${item.color}bb`),
      borderWidth: 0,
      barPercentage: 1,
      categoryPercentage: 0.82,
      order: 20
    });
  }

  if (isIndicatorEnabled('stochRsi')) {
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
        order: 30
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
        order: 31
      },
      {
        label: 'Stoch RSI 80',
        type: 'line',
        data: horizontalLevel(candles, 80),
        yAxisID: 'stochRsi',
        borderColor: 'rgba(242, 54, 69, 0.35)',
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
        order: 32
      },
      {
        label: 'Stoch RSI 20',
        type: 'line',
        data: horizontalLevel(candles, 20),
        yAxisID: 'stochRsi',
        borderColor: 'rgba(0, 192, 135, 0.35)',
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
        order: 33
      }
    );
  }

  return datasets;
};

const getActiveYScale = (chart, yPosition) => {
  const scales = ['price', 'volume', 'stochRsi']
    .map(id => chart.scales[id])
    .filter(Boolean);
  return scales.find(scale => yPosition >= scale.top && yPosition <= scale.bottom) || chart.scales.price;
};

const formatScaleValue = (scaleId, value) => {
  if (!Number.isFinite(value)) return '';
  if (scaleId === 'volume') return compactNumber(value);
  if (scaleId === 'stochRsi') return value.toFixed(1);
  return value >= 100 ? value.toFixed(2) : value.toFixed(4);
};

const crosshairPlugin = {
  id: 'crosshair',
  afterInit(chart) {
    if (!chart.canvas) return;
    chart.crosshair = { x: null, y: null, snapIndex: null };
    const canvas = chart.canvas;

    const moveListener = event => {
      if (!chart.canvas || chart.canvas !== canvas || !chart.ctx) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      let snapIndex = null;
      let snapX = mouseX;
      let minDist = Infinity;

      chart.data.datasets[0]?.data?.forEach((item, index) => {
        const xPixel = chart.scales.x.getPixelForValue(item.x);
        const distance = Math.abs(mouseX - xPixel);
        if (distance < minDist) {
          minDist = distance;
          snapIndex = index;
          snapX = xPixel;
        }
      });

      chart.crosshair = { x: snapX, y: mouseY, snapIndex };
      chart.draw();
    };

    const leaveListener = () => {
      if (!chart.canvas || chart.canvas !== canvas || !chart.ctx) return;
      chart.crosshair = { x: null, y: null, snapIndex: null };
      chart.draw();
    };

    canvas.addEventListener('mousemove', moveListener);
    canvas.addEventListener('mouseleave', leaveListener);
    chart.crosshair.moveListener = moveListener;
    chart.crosshair.leaveListener = leaveListener;
    chart.crosshair.canvas = canvas;
  },
  beforeDestroy(chart) {
    cleanupCrosshair(chart);
  },
  afterDestroy(chart) {
    cleanupCrosshair(chart);
  },
  afterDraw(chart) {
    if (!chart.ctx || !chart.chartArea || !chart.crosshair || chart.crosshair.x === null || chart.crosshair.y === null) return;

    const ctx = chart.ctx;
    const activeScale = getActiveYScale(chart, chart.crosshair.y);

    ctx.save();
    ctx.strokeStyle = 'rgba(174, 180, 189, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(chart.crosshair.x, chart.chartArea.top);
    ctx.lineTo(chart.crosshair.x, chart.chartArea.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(chart.chartArea.left, chart.crosshair.y);
    ctx.lineTo(chart.chartArea.right, chart.crosshair.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const yValue = activeScale.getValueForPixel(chart.crosshair.y);
    const yLabel = formatScaleValue(activeScale.id, yValue);
    if (yLabel) {
      ctx.font = '12px Inter, sans-serif';
      const labelWidth = ctx.measureText(yLabel).width + 18;
      const labelHeight = 22;
      const boxX = chart.chartArea.right + 4;
      const boxY = Math.max(activeScale.top, Math.min(chart.crosshair.y - labelHeight / 2, activeScale.bottom - labelHeight));

      ctx.fillStyle = '#11151a';
      ctx.strokeStyle = CHART_THEME.border;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, labelWidth, labelHeight, 6);
      else ctx.rect(boxX, boxY, labelWidth, labelHeight);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4f6f8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(yLabel, boxX + labelWidth / 2, boxY + labelHeight / 2);
    }

    const xValue = chart.data.datasets[0]?.data?.[chart.crosshair.snapIndex]?.x;
    if (xValue) {
      const date = new Date(xValue);
      const dateLabel = ['3M', '1M'].includes(state.currentInterval)
        ? `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
        : date.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      const labelWidth = ctx.measureText(dateLabel).width + 18;
      const xBoxX = Math.max(chart.chartArea.left, Math.min(chart.crosshair.x - labelWidth / 2, chart.chartArea.right - labelWidth));
      const xBoxY = chart.chartArea.bottom + 6;

      ctx.fillStyle = '#11151a';
      ctx.strokeStyle = CHART_THEME.border;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(xBoxX, xBoxY, labelWidth, 22, 6);
      else ctx.rect(xBoxX, xBoxY, labelWidth, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4f6f8';
      ctx.fillText(dateLabel, xBoxX + labelWidth / 2, xBoxY + 11);
    }

    ctx.restore();
  }
};

function cleanupCrosshair(chart) {
  const crosshair = chart?.crosshair;
  const canvas = crosshair?.canvas || chart?.canvas;
  if (!canvas || !crosshair) return;
  if (crosshair.moveListener) canvas.removeEventListener('mousemove', crosshair.moveListener);
  if (crosshair.leaveListener) canvas.removeEventListener('mouseleave', crosshair.leaveListener);
  chart.crosshair = null;
}

const currentPricePlugin = {
  id: 'currentPrice',
  afterDraw(chart) {
    if (!chart.ctx || !chart.chartArea) return;
    const priceScale = chart.scales.price;
    const candles = chart.data.datasets[0]?.data;
    if (!priceScale || !candles?.length) return;

    const lastCandle = candles[candles.length - 1];
    const yValue = Number.isFinite(state.currentPairPrice) ? state.currentPairPrice : lastCandle.c;
    const yPixel = priceScale.getPixelForValue(yValue);
    if (yPixel < priceScale.top || yPixel > priceScale.bottom) return;

    const isUp = lastCandle.c >= lastCandle.o;
    const color = isUp ? CHART_THEME.up : CHART_THEME.down;
    const label = yValue >= 100 ? yValue.toFixed(2) : yValue.toFixed(4);
    const ctx = chart.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(chart.chartArea.left, yPixel);
    ctx.lineTo(chart.chartArea.right, yPixel);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 12px Inter, sans-serif';
    const labelWidth = ctx.measureText(label).width + 18;
    const labelHeight = 22;
    const boxX = chart.chartArea.right + 4;
    const boxY = Math.max(priceScale.top, Math.min(yPixel - labelHeight / 2, priceScale.bottom - labelHeight));

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + labelHeight / 2);
    ctx.lineTo(boxX + 7, boxY);
    ctx.lineTo(boxX + labelWidth, boxY);
    ctx.lineTo(boxX + labelWidth, boxY + labelHeight);
    ctx.lineTo(boxX + 7, boxY + labelHeight);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + 7 + (labelWidth - 7) / 2, boxY + labelHeight / 2);
    ctx.restore();
  }
};

const indicatorLegendPlugin = {
  id: 'indicatorLegend',
  afterDraw(chart) {
    if (!chart.ctx || !chart.chartArea) return;
    const fallbackIndex = chart.data.datasets[0]?.data?.length - 1 ?? 0;
    const index = chart.crosshair?.snapIndex ?? fallbackIndex;
    const ctx = chart.ctx;
    const volumeScale = chart.scales.volume;
    const stochScale = chart.scales.stochRsi;

    ctx.save();
    ctx.font = '700 11px Inter, sans-serif';
    ctx.textBaseline = 'top';

    if (isScaleVisible(volumeScale)) {
      const volumeData = chart.data.datasets.find(ds => ds.label === 'Volume')?.data || [];
      const volumePoint = volumeData[index] || lastDefined(volumeData);
      const vol = volumePoint?.y ?? 0;
      const quoteVol = volumePoint?.q ?? 0;
      const quoteLabel = getPairMeta(chart._symbol || state.currentPair).quote || 'QUOTE';
      const quoteVolumeLabel = `VOL(${quoteLabel})`;
      let x = chart.chartArea.left + 10;
      const y = volumeScale.top + 7;

      ctx.fillStyle = '#f5f7fa';
      ctx.fillText('v VOLUME', x, y);
      x += ctx.measureText('v VOLUME  ').width;
      ctx.fillStyle = '#aeb4bd';
      ctx.fillText('VOL', x, y);
      x += ctx.measureText('VOL ').width;
      ctx.fillStyle = CHART_THEME.accent;
      ctx.fillText(compactNumber(vol), x, y);
      x += ctx.measureText(`${compactNumber(vol)}  `).width;
      ctx.fillStyle = '#aeb4bd';
      ctx.fillText(quoteVolumeLabel, x, y);
      x += ctx.measureText(`${quoteVolumeLabel} `).width;
      ctx.fillStyle = CHART_THEME.stochD;
      ctx.fillText(compactNumber(quoteVol), x, y);
    }

    if (isScaleVisible(stochScale)) {
      const kData = chart.data.datasets.find(ds => ds.label === 'Stoch RSI %K')?.data || [];
      const dData = chart.data.datasets.find(ds => ds.label === 'Stoch RSI %D')?.data || [];
      const kPoint = kData[index] || lastDefined(kData);
      const dPoint = dData[index] || lastDefined(dData);
      let x = chart.chartArea.left + 10;
      const y = stochScale.top + 7;

      ctx.fillStyle = '#f5f7fa';
      ctx.fillText('v StochRSI(14,14,3,3)', x, y);
      x += ctx.measureText('v StochRSI(14,14,3,3)  ').width;
      ctx.fillStyle = '#aeb4bd';
      ctx.fillText('STOCHRSI', x, y);
      x += ctx.measureText('STOCHRSI ').width;
      ctx.fillStyle = CHART_THEME.stochK;
      ctx.fillText(formatIndicatorValue(kPoint?.y), x, y);
      x += ctx.measureText(`${formatIndicatorValue(kPoint?.y)}  `).width;
      ctx.fillStyle = '#aeb4bd';
      ctx.fillText('MASTOCHRSI', x, y);
      x += ctx.measureText('MASTOCHRSI ').width;
      ctx.fillStyle = CHART_THEME.stochD;
      ctx.fillText(formatIndicatorValue(dPoint?.y), x, y);

      getSeparatedChipPositions(stochScale, [
        { key: 'k', value: kPoint?.y, color: CHART_THEME.stochK },
        { key: 'd', value: dPoint?.y, color: CHART_THEME.stochD }
      ]).forEach(chip => {
        drawValueChip(ctx, chart, stochScale, chip.value, chip.color, chip.y);
      });
    }

    ctx.restore();
  }
};

const fixedRangeVolumeProfilePlugin = {
  id: 'fixedRangeVolumeProfile',
  beforeDatasetsDraw(chart) {
    chart._volumeProfile = null;
    if (!isIndicatorEnabled('volumeProfile') || !chart.ctx || !chart.chartArea) return;

    const priceScale = chart.scales.price;
    const candles = chart.data.datasets[0]?.data || [];
    if (!isScaleVisible(priceScale) || candles.length < 2) return;

    const settings = state.volumeProfile || {};
    const profile = calculateVolumeProfile(candles, settings.rows ?? 48);
    if (!profile.rows.length || !profile.poc || profile.maxVolume <= 0) return;

    chart._volumeProfile = profile;

    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const profileWidth = clamp(
      Math.round(chartArea.width * (settings.widthRatio ?? 0.28)),
      settings.minWidth ?? 82,
      settings.maxWidth ?? 220
    );
    const xRight = chartArea.right - 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, priceScale.top, chartArea.width, priceScale.bottom - priceScale.top);
    ctx.clip();

    profile.rows.forEach(row => {
      if (row.total <= 0) return;

      const yTop = priceScale.getPixelForValue(row.high);
      const yBottom = priceScale.getPixelForValue(row.low);
      const y = Math.min(yTop, yBottom) + 1;
      const height = Math.max(1, Math.abs(yBottom - yTop) - 1);
      const width = Math.max(1, (row.total / profile.maxVolume) * profileWidth);
      const x = xRight - width;
      const upWidth = row.total > 0 ? width * (row.up / row.total) : 0;
      const downWidth = width - upWidth;
      const isPoc = row === profile.poc;

      ctx.fillStyle = isPoc ? 'rgba(242, 201, 76, 0.28)' : 'rgba(236, 84, 125, 0.28)';
      ctx.fillRect(x, y, downWidth, height);
      ctx.fillStyle = isPoc ? 'rgba(242, 201, 76, 0.36)' : 'rgba(54, 211, 219, 0.32)';
      ctx.fillRect(x + downWidth, y, upWidth, height);
    });

    const pocY = priceScale.getPixelForValue(profile.poc.price);
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.58)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, pocY);
    ctx.lineTo(chartArea.right, pocY);
    ctx.stroke();
    ctx.restore();
  },
  afterDraw(chart) {
    if (!isIndicatorEnabled('volumeProfile') || !chart.ctx || !chart.chartArea) return;

    const profile = chart._volumeProfile;
    const priceScale = chart.scales.price;
    if (!profile?.poc || !isScaleVisible(priceScale)) return;

    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const label = `VP POC ${formatProfilePrice(profile.poc.price)} | ${compactNumber(profile.poc.total)}`;

    ctx.save();
    ctx.font = '400 11px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    const labelWidth = Math.min(chartArea.width - 16, ctx.measureText(label).width + 18);
    const labelHeight = 22;
    const x = Math.max(chartArea.left + 8, chartArea.right - labelWidth - 8);
    const y = priceScale.top + 9;

    ctx.fillStyle = 'rgba(8, 10, 12, 0.78)';
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, labelWidth, labelHeight, 5);
    else ctx.rect(x, y, labelWidth, labelHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f5f7fa';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + labelWidth / 2, y + labelHeight / 2, labelWidth - 12);
    ctx.restore();
  }
};

const measureRangePlugin = {
  id: 'measureRange',
  afterDraw(chart) {
    if (!state.chartMeasure?.active || !chart.ctx || !chart.chartArea) return;

    const measure = state.chartMeasure;
    const start = measure.start;
    const end = measure.end || measure.preview;
    const priceScale = chart.scales.price;
    const xScale = chart.scales.x;
    const candles = chart.data.datasets[0]?.data || [];
    if (!start || !priceScale || !xScale || !candles.length) return;

    const ctx = chart.ctx;
    const startX = xScale.getPixelForValue(start.x);
    const startY = priceScale.getPixelForValue(start.y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(chart.chartArea.left, priceScale.top, chart.chartArea.width, priceScale.bottom - priceScale.top);
    ctx.clip();

    if (!end) {
      ctx.fillStyle = 'rgba(242, 201, 76, 0.92)';
      ctx.beginPath();
      ctx.arc(startX, startY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const endX = xScale.getPixelForValue(end.x);
    const endY = priceScale.getPixelForValue(end.y);
    const leftPoint = start.index <= end.index ? start : end;
    const rightPoint = start.index <= end.index ? end : start;
    const leftX = Math.min(startX, endX);
    const rightX = Math.max(startX, endX);
    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);
    const width = Math.max(1, rightX - leftX);
    const height = Math.max(1, bottomY - topY);
    const delta = rightPoint.y - leftPoint.y;
    const percent = leftPoint.y ? (delta / leftPoint.y) * 100 : 0;
    const isUp = delta >= 0;
    const color = isUp ? CHART_THEME.up : CHART_THEME.down;
    const fill = isUp ? 'rgba(0, 192, 135, 0.11)' : 'rgba(242, 54, 69, 0.11)';
    const bars = Math.abs(rightPoint.index - leftPoint.index) + 1;
    const label = `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}% | ${delta >= 0 ? '+' : ''}${formatMeasurePrice(delta)} | ${bars} velas`;

    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(leftX, topY, width, height);
    ctx.strokeRect(leftX, topY, width, height);
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(245, 247, 250, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, priceScale.top);
    ctx.lineTo(leftX, priceScale.bottom);
    ctx.moveTo(rightX, priceScale.top);
    ctx.lineTo(rightX, priceScale.bottom);
    ctx.stroke();

    ctx.font = '400 11px Inter, sans-serif';
    const labelWidth = Math.min(chart.chartArea.width - 16, ctx.measureText(label).width + 18);
    const labelX = clamp(leftX + width / 2 - labelWidth / 2, chart.chartArea.left + 8, chart.chartArea.right - labelWidth - 8);
    const labelY = clamp(topY - 28, priceScale.top + 8, priceScale.bottom - 30);

    ctx.fillStyle = 'rgba(8, 10, 12, 0.86)';
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(labelX, labelY, labelWidth, 22, 5);
    else ctx.rect(labelX, labelY, labelWidth, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f5f7fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + labelWidth / 2, labelY + 11, labelWidth - 12);
    ctx.restore();
  }
};

function createPairHtml(symbol, price, stats) {
  const { base, quote } = getPairMeta(symbol);
  const pairLabel = getPairLabel(symbol);
  const safeBase = escapeHTML(base);
  const safeQuote = escapeHTML(quote);
  const safePairLabel = escapeHTML(pairLabel);
  const safeSymbol = escapeHTML(symbol);
  const safeCoinName = escapeHTML(getCoinName(symbol));
  const iconUrl = safeImageUrl(`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`);
  const pct = Number.parseFloat(stats?.priceChangePercent ?? 0);
  const changeClass = pct > 0 ? 'positive' : pct < 0 ? 'negative' : '';
  const item = document.createElement('div');

  item.className = 'tracked-pair';
  item.dataset.symbol = symbol;
  item.innerHTML = `
    <div class="coin-icon">
      <img src="${escapeHTML(iconUrl)}" alt="" />
    </div>
    <div class="coin-info">
      <span class="coin-symbol">${safeBase}<span class="coin-symbol-suffix">/${safeQuote}</span></span>
      <span class="coin-name">${safeCoinName}</span>
    </div>
    <div class="pair-price-group">
      <span class="pair-price" data-symbol="${safeSymbol}">${formatPairPrice(price, quote)}</span>
      <span class="pair-change ${changeClass}" data-symbol="${safeSymbol}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
    </div>
    <button type="button" class="delete-btn" aria-label="Eliminar ${safePairLabel}">x</button>
  `;
  item.querySelector('img')?.addEventListener('error', event => {
    event.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/1213/1213387.png';
  });

  item.addEventListener('click', () => showPairDetails(symbol));
  item.querySelector('.delete-btn')?.addEventListener('click', event => {
    event.stopPropagation();
    removeTrackedPair(symbol);
  });

  return item;
}

export async function renderTrackedPairs() {
  const container = document.getElementById('tracked-pairs');
  if (!container) return;

  const fragment = document.createDocumentFragment();
  for (const symbol of state.tracked) {
    fragment.appendChild(createPairHtml(symbol, '0.00', {}));
  }

  container.replaceChildren(fragment);

  state.tracked.forEach(async symbol => {
    try {
      const [price, stats] = await Promise.all([fetchPrice(symbol), fetch24hStats(symbol)]);
      if (!state.tracked.includes(symbol)) return;

      const current = container.querySelector(`.tracked-pair[data-symbol="${symbol}"]`);
      if (current) current.replaceWith(createPairHtml(symbol, price, stats));
    } catch (error) {
      console.error('Error actualizando par:', error);
    }
  });
}

export async function addTrackedPair(symbol) {
  if (!symbol || state.tracked.includes(symbol)) return;

  state.tracked.push(symbol);
  writeTrackedPairs(state.tracked);

  const container = document.getElementById('tracked-pairs');
  if (!container) {
    renderTrackedPairs();
    return;
  }

  try {
    const [price, stats] = await Promise.all([fetchPrice(symbol), fetch24hStats(symbol)]);
    container.appendChild(createPairHtml(symbol, price, stats));
  } catch (error) {
    console.error('Error agregando par:', error);
  }
}

function removeTrackedPair(symbol) {
  state.tracked = state.tracked.filter(item => item !== symbol);
  writeTrackedPairs(state.tracked);
  document.querySelector(`.tracked-pair[data-symbol="${symbol}"]`)?.remove();

  if (state.currentPair === symbol) {
    state.currentPair = null;
    document.getElementById('pair-details')?.classList.add('hidden');
  }
}

function destroyChart(canvas) {
  if (canvas) {
    const existingChart = Chart.getChart(canvas);
    cleanupCrosshair(existingChart);
    if (canvas._zoomHandler) canvas.removeEventListener('wheel', canvas._zoomHandler);
    if (canvas._downHandler) canvas.removeEventListener('pointerdown', canvas._downHandler);
    if (canvas._moveHandler) canvas.removeEventListener('pointermove', canvas._moveHandler);
    if (canvas._upHandler) {
      canvas.removeEventListener('pointerup', canvas._upHandler);
      canvas.removeEventListener('pointercancel', canvas._upHandler);
    }
    delete canvas._zoomHandler;
    delete canvas._downHandler;
    delete canvas._moveHandler;
    delete canvas._upHandler;
  }

  if (state.chartMeasure) {
    state.chartMeasure.start = null;
    state.chartMeasure.end = null;
    state.chartMeasure.preview = null;
  }

  try {
    Chart.getChart(canvas)?.destroy();
  } catch (error) {
    console.warn('No se pudo destruir el grafico previo:', error);
  }
  state.chartInstance = null;
}

function createScales(interval) {
  const showVolume = isIndicatorEnabled('volume');
  const showStoch = isIndicatorEnabled('stochRsi');

  return {
    x: {
      type: 'time',
      time: { unit: timeUnitByInterval(interval) },
      grid: { color: CHART_THEME.grid, tickLength: 0 },
      ticks: { color: CHART_THEME.muted, maxRotation: 0, autoSkipPadding: 24 },
      border: { color: CHART_THEME.border }
    },
    price: {
      type: 'linear',
      axis: 'y',
      position: 'right',
      stack: PANEL_STACK,
      stackWeight: 5.6,
      grid: { color: CHART_THEME.grid },
      ticks: { color: CHART_THEME.text },
      border: { color: CHART_THEME.border }
    },
    volume: {
      type: 'linear',
      axis: 'y',
      display: showVolume,
      position: 'right',
      stack: PANEL_STACK,
      stackWeight: showVolume ? 1.35 : 0,
      beginAtZero: true,
      grid: { color: 'rgba(255, 255, 255, 0.035)' },
      ticks: { color: CHART_THEME.muted, callback: value => compactNumber(value), maxTicksLimit: 3 },
      border: { color: CHART_THEME.border }
    },
    stochRsi: {
      type: 'linear',
      axis: 'y',
      display: showStoch,
      position: 'right',
      stack: PANEL_STACK,
      stackWeight: showStoch ? 1.55 : 0,
      min: 0,
      max: 100,
      grid: { color: 'rgba(255, 255, 255, 0.04)' },
      ticks: { color: CHART_THEME.muted, stepSize: 50 },
      border: { color: CHART_THEME.border }
    }
  };
}

export async function renderCandlestick(symbol, interval) {
  if (state.candleRenderLock) return;
  state.candleRenderLock = true;

  try {
    const canvas = document.getElementById('candlestick-chart');
    if (!canvas) return;

    const rawData = (await fetchKlines(symbol, interval)).map(normalizeKline);
    if (!rawData.length) {
      destroyChart(canvas);
      return;
    }

    const fullLastTimestamp = rawData.at(-1)?.x ?? null;
    const fullSeries = buildTechnicalSeries(rawData);
    let { start, end } = getVisibleWindow(rawData.length);
    let visibleData = rawData.slice(start, end);
    let visibleSeries = sliceTechnicalSeries(fullSeries, start, end);

    destroyChart(canvas);

    const updateChartSlice = () => {
      const currentEnd = Math.min(rawData.length, start + state.chartZoom);
      visibleData = rawData.slice(start, currentEnd);
      visibleSeries = sliceTechnicalSeries(fullSeries, start, currentEnd);

      if (!state.chartInstance) return;
      state.chartInstance.data.datasets = buildDatasets(symbol, visibleData, visibleSeries);
      state.chartInstance._fullLastTimestamp = fullLastTimestamp;
      state.chartInstance.update('none');
    };

    const ctx = canvas.getContext('2d');
    state.chartInstance = new Chart(ctx, {
      type: 'candlestick',
      data: { datasets: buildDatasets(symbol, visibleData, visibleSeries) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        layout: { padding: { right: 98, bottom: 28, left: 6, top: 56 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: createScales(interval)
      },
      plugins: [
        fixedRangeVolumeProfilePlugin,
        measureRangePlugin,
        crosshairPlugin,
        createAdvancedTooltipPlugin(),
        currentPricePlugin,
        indicatorLegendPlugin
      ]
    });

    Object.assign(state.chartInstance, {
      _symbol: symbol,
      _interval: interval,
      _fullLastTimestamp: fullLastTimestamp
    });

    let zoomRafPending = false;
    canvas._zoomHandler = event => {
      event.preventDefault();
      const previousZoom = state.chartZoom;
      const step = state.chartView?.zoomStep ?? 16;
      const minVisible = state.chartView?.minVisible ?? 24;
      state.chartZoom = event.deltaY < 0
        ? Math.max(minVisible, state.chartZoom - step)
        : Math.min(rawData.length, state.chartZoom + step);

      const currentEnd = Math.min(rawData.length, start + previousZoom);
      start = Math.max(0, Math.min(currentEnd - state.chartZoom, rawData.length - state.chartZoom));

      if (!zoomRafPending) {
        zoomRafPending = true;
        requestAnimationFrame(() => {
          updateChartSlice();
          zoomRafPending = false;
        });
      }
    };
    canvas.addEventListener('wheel', canvas._zoomHandler, { passive: false });

    let isPanning = false;
    let panStartX = 0;
    let panStartIndex = start;

    const handleMeasureClick = event => {
      const chart = state.chartInstance;
      if (!state.chartMeasure?.active || !chart) return false;

      const rect = canvas.getBoundingClientRect();
      const point = getNearestCandlePoint(chart, event.clientX - rect.left, event.clientY - rect.top);
      if (!point) return true;

      if (!state.chartMeasure.start || state.chartMeasure.end) {
        state.chartMeasure.start = point;
        state.chartMeasure.end = null;
        state.chartMeasure.preview = null;
      } else {
        state.chartMeasure.end = point;
        state.chartMeasure.preview = null;
      }

      chart.update('none');
      return true;
    };

    canvas._downHandler = event => {
      if (handleMeasureClick(event)) return;

      isPanning = true;
      panStartX = event.clientX;
      panStartIndex = start;
      canvas.setPointerCapture?.(event.pointerId);
    };
    canvas._moveHandler = event => {
      if (state.chartMeasure?.active) {
        const chart = state.chartInstance;
        if (chart && state.chartMeasure.start && !state.chartMeasure.end) {
          const rect = canvas.getBoundingClientRect();
          state.chartMeasure.preview = getNearestCandlePoint(chart, event.clientX - rect.left, event.clientY - rect.top);
          chart.update('none');
        }
        return;
      }

      if (!isPanning) return;
      const sensitivity = state.chartView?.panSensitivity ?? 6;
      const moveBars = Math.round((event.clientX - panStartX) / sensitivity);
      start = Math.max(0, Math.min(rawData.length - state.chartZoom, panStartIndex - moveBars));
      updateChartSlice();
    };
    canvas._upHandler = event => {
      isPanning = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    canvas.addEventListener('pointerdown', canvas._downHandler);
    canvas.addEventListener('pointermove', canvas._moveHandler);
    canvas.addEventListener('pointerup', canvas._upHandler);
    canvas.addEventListener('pointercancel', canvas._upHandler);
  } finally {
    state.candleRenderLock = false;
  }
}

function updatePairUI(symbol, price, stats = {}) {
  const pairTitle = document.getElementById('pair-title');
  const pairPrice = document.getElementById('pair-price');
  if (!pairTitle || !pairPrice) return;

  const { base, quote } = getPairMeta(symbol);
  const pairLabel = getPairLabel(symbol);
  const safeBase = escapeHTML(base);
  const safeQuote = escapeHTML(quote);
  const change = Number.parseFloat(stats.priceChange ?? 0);
  const changePct = Number.parseFloat(stats.priceChangePercent ?? 0);
  const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
  const high = Number.parseFloat(stats.highPrice ?? 0);
  const low = Number.parseFloat(stats.lowPrice ?? 0);
  const volBase = Number.parseFloat(stats.volume ?? 0);
  const volQuote = Number.parseFloat(stats.quoteVolume ?? 0);

  pairTitle.textContent = pairLabel;
  pairPrice.innerHTML = `
    <span>${formatPairPrice(price, quote)}</span>
    <strong class="${changeClass}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</strong>
  `;
  document.title = `${formatPairPrice(price, quote)} | ${pairLabel} | DeFi & Crypto Terminal`;

  let statsContainer = document.querySelector('.pair-stats');
  if (!statsContainer) {
    statsContainer = document.createElement('div');
    statsContainer.className = 'pair-stats';
    document.querySelector('.chart-market-summary')?.appendChild(statsContainer);
  }

  statsContainer.innerHTML = `
    <div><span class="label">24h cambio</span><span class="pair-change ${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(4)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)</span></div>
    <div><span class="label">Max</span><span>${formatPrice(high)}</span></div>
    <div><span class="label">Min</span><span>${formatPrice(low)}</span></div>
    <div><span class="label">Vol ${safeBase}</span><span>${compactNumber(volBase)}</span></div>
    <div><span class="label">Vol ${safeQuote}</span><span>${compactNumber(volQuote)}</span></div>
  `;
}

async function updatePairInfo(symbol) {
  if (state.currentPair !== symbol) return;

  const [price, stats] = await Promise.all([fetchPrice(symbol), fetch24hStats(symbol)]);
  updatePairUI(symbol, price, stats);

  const parsedPrice = Number.parseFloat(price);
  state.currentPairPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;

  const chart = state.chartInstance;
  if (!chart || chart._symbol !== symbol || state.currentPairPrice === null) return;

  const lastCandle = chart.data.datasets[0]?.data?.at(-1);
  if (lastCandle?.x === chart._fullLastTimestamp) {
    lastCandle.h = Math.max(lastCandle.h, state.currentPairPrice);
    lastCandle.l = Math.min(lastCandle.l, state.currentPairPrice);
    lastCandle.c = state.currentPairPrice;
  }
  chart.update('none');
}

async function showPairDetails(symbol) {
  const pairDetails = document.getElementById('pair-details');
  if (!pairDetails) return;

  if (state.detailInterval) clearInterval(state.detailInterval);
  state.currentPair = symbol;
  state.currentPairPrice = null;
  pairDetails.classList.remove('hidden');

  await updatePairInfo(symbol);
  await renderCandlestick(symbol, state.currentInterval);

  state.detailInterval = setInterval(() => updatePairInfo(symbol), 5000);

  const closeBtn = document.getElementById('close-details');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = 'true';
    closeBtn.addEventListener('click', () => {
      if (state.detailInterval) clearInterval(state.detailInterval);
      state.detailInterval = null;
      state.currentPair = null;
      pairDetails.classList.add('hidden');
      destroyChart(document.getElementById('candlestick-chart'));
    });
  }
}
