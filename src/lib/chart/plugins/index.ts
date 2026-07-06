import type { Chart } from 'chart.js';
import { CHART_THEME } from '@/lib/chart/indicators';
import { compactNumber, type Candle } from '@/lib/chart/normalize';
import type { EnhancedChart, ScaleLike, ChartDatasetLike, VPRow, CrosshairState } from '@/lib/chart/types';

type ChartPoint = { x: number; y?: number | null; q?: number };
const asPoints = (data: unknown[]): ChartPoint[] =>
  (data ?? []) as unknown as ChartPoint[];

const getPairMeta = (symbol?: string) => {
  const s = String(symbol || '').toUpperCase();
  const knownQuotes = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR', 'BRL', 'DAI'];
  const quote = knownQuotes.find(q => s.endsWith(q)) || '';
  return { symbol: s, base: quote ? s.slice(0, -quote.length) : s, quote };
};

const lastDefined = (items: { y?: number | null }[]) => {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.y != null) return items[i];
  }
  return null;
};

const formatIndicatorValue = (value: number | null | undefined) =>
  Number.isFinite(value) ? (value as number).toFixed(2) : '-';

const isScaleVisible = (scale: ScaleLike | undefined) =>
  scale != null && scale.options?.display !== false;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getActiveYScale = (chart: EnhancedChart, yPosition: number) => {
  const scales = ['price', 'volume', 'stochRsi']
    .map((id) => chart.scales?.[id])
    .filter(Boolean) as ScaleLike[];
  return (
    scales.find(
      (scale) => yPosition >= scale.top && yPosition <= scale.bottom,
    ) || chart.scales?.price
  );
};

const formatScaleValue = (scaleId: string, value: number) => {
  if (!Number.isFinite(value)) return '';
  if (scaleId === 'volume') return compactNumber(value);
  if (scaleId === 'stochRsi') return value.toFixed(1);
  return value >= 100 ? value.toFixed(2) : value.toFixed(4);
};

const getSeparatedChipPositions = (
  scale: ScaleLike | undefined,
  values: { key: string; value: number | null | undefined; color: string }[],
) => {
  if (!scale) return [];
  const chipHeight = 22;
  const gap = 5;
  const minY = scale.top + 4;
  const maxY = scale.bottom - chipHeight;
  const chips = values
    .filter((v) => Number.isFinite(v.value))
    .map((v) => ({
      ...v,
      y: clamp(
        (scale as ScaleLike).getPixelForValue(v.value as number)! - chipHeight / 2,
        minY,
        maxY,
      ),
    }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < chips.length; i++) {
    chips[i]!.y = Math.max(chips[i]!.y, chips[i - 1]!.y + chipHeight + gap);
  }
  const overflow = (chips.at(-1)?.y ?? minY) - maxY;
  if (overflow > 0) {
    for (let i = chips.length - 1; i >= 0; i--) chips[i]!.y -= overflow;
  }
  if ((chips[0]?.y ?? maxY) < minY) {
    const underflow = minY - chips[0]!.y;
    chips.forEach((c) => (c.y += underflow));
  }
  return chips;
};

const drawValueChip = (
  ctx: CanvasRenderingContext2D,
  chart: EnhancedChart,
  scale: ScaleLike | undefined,
  value: number | null | undefined,
  color: string,
  y: number,
) => {
  if (value == null || !Number.isFinite(value) || !scale) return;
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
};

export const crosshairPlugin = {
  id: 'crosshair',
  afterInit(chart: Chart) {
    if (!chart.canvas) return;
    const chartAny = chart as unknown as EnhancedChart;
    chartAny.crosshair = { x: null, y: null, snapIndex: null, moveListener: null, leaveListener: null, canvas: null };
    const canvas = chart.canvas;

    const moveListener = (event: MouseEvent) => {
      const c = chartAny;
      if (!canvas || !chart.ctx) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      let snapIndex: number | null = null;
      let snapX = mouseX;
      let minDist = Infinity;
      c.data.datasets[0]?.data?.forEach((item, index) => {
        const pt = item as unknown as { x: number };
        const xPixel = chart.scales.x?.getPixelForValue(pt.x);
        if (xPixel == null) return;
        const distance = Math.abs(mouseX - xPixel);
        if (distance < minDist) {
          minDist = distance;
          snapIndex = index;
          snapX = xPixel;
        }
      });
      c.crosshair.x = snapX;
      c.crosshair.y = mouseY;
      c.crosshair.snapIndex = snapIndex;
      chart.draw();
    };

    const leaveListener = () => {
      if (!canvas || !chart.ctx) return;
    chartAny.crosshair = { x: null, y: null, snapIndex: null, moveListener: null, leaveListener: null, canvas: null };
      chart.draw();
    };

    canvas.addEventListener('mousemove', moveListener);
    canvas.addEventListener('mouseleave', leaveListener);
    chartAny.crosshair.moveListener = moveListener;
    chartAny.crosshair.leaveListener = leaveListener;
    chartAny.crosshair.canvas = canvas;
  },
  beforeDestroy(chart: Chart) {
    const chartAny = chart as unknown as EnhancedChart;
    const crosshair = chartAny?.crosshair;
    const canvas = crosshair?.canvas || chart.canvas;
    if (!canvas || !crosshair) return;
    if (crosshair.moveListener)
      canvas.removeEventListener('mousemove', crosshair.moveListener);
    if (crosshair.leaveListener)
      canvas.removeEventListener('mouseleave', crosshair.leaveListener);
    chartAny.crosshair = null as unknown as CrosshairState;
  },
  afterDraw(chart: Chart) {
    const chartAny = chart as unknown as EnhancedChart;
    if (
      !chart.ctx ||
      !chart.chartArea ||
      !chartAny.crosshair ||
      chartAny.crosshair.x === null
    )
      return;

    const ctx = chart.ctx;
    const activeScale = getActiveYScale(chartAny, chartAny.crosshair.y!);

    ctx.save();
    ctx.strokeStyle = 'rgba(174, 180, 189, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(chartAny.crosshair.x, chart.chartArea.top);
    ctx.lineTo(chartAny.crosshair.x, chart.chartArea.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chart.chartArea.left, chartAny.crosshair.y!);
    ctx.lineTo(chart.chartArea.right, chartAny.crosshair.y!);
    ctx.stroke();
    ctx.setLineDash([]);

    const yValue = activeScale!.getValueForPixel!(chartAny.crosshair.y!);
    const yLabel = formatScaleValue(activeScale!.id!, yValue!);
    if (yLabel) {
      ctx.font = '12px Inter, sans-serif';
      const labelWidth = ctx.measureText(yLabel).width + 18;
      const labelHeight = 22;
      const boxX = chart.chartArea.right + 4;
      const boxY = clamp(
        chartAny.crosshair.y! - labelHeight / 2,
        activeScale?.top ?? 0,
        (activeScale?.bottom ?? 0) - labelHeight,
      );

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

    const snapData = chart.data.datasets[0]?.data;
    const snapPoint = snapData ? asPoints(snapData)[chartAny.crosshair.snapIndex!] : null;
    const xValue = snapPoint?.x;
    if (xValue) {
      const date = new Date(xValue);
      const interval = chartAny._interval;
      const dateLabel = ['3M', '1M'].includes(interval)
        ? `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
        : date.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
      const labelWidth = ctx.measureText(dateLabel).width + 18;
      const xBoxX = clamp(
        chartAny.crosshair.x - labelWidth / 2,
        chart.chartArea.left,
        chart.chartArea.right - labelWidth,
      );
      const xBoxY = chart.chartArea.bottom + 6;

      ctx.fillStyle = '#11151a';
      ctx.strokeStyle = CHART_THEME.border;
      ctx.beginPath();
      if (ctx.roundRect)
        ctx.roundRect(xBoxX, xBoxY, labelWidth, 22, 6);
      else ctx.rect(xBoxX, xBoxY, labelWidth, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4f6f8';
      ctx.fillText(
        dateLabel,
        xBoxX + labelWidth / 2,
        xBoxY + 11,
      );
    }
    ctx.restore();
  },
};

export const currentPricePlugin = {
  id: 'currentPrice',
  afterDraw(chart: Chart) {
    if (!chart.ctx || !chart.chartArea) return;
    const chartAny = chart as unknown as EnhancedChart;
    const priceScale = chart.scales?.price;
    const candles = chart.data.datasets[0]?.data;
    if (!priceScale || !candles?.length) return;

    const lastCandle = candles[candles.length - 1] as unknown as { c: number; o: number };
    const yValue = Number.isFinite(chartAny._pairPrice)
      ? chartAny._pairPrice
      : lastCandle?.c;
    const yPixel = priceScale.getPixelForValue(yValue as number);
    if (yPixel < priceScale.top || yPixel > priceScale.bottom) return;

    const isUp = lastCandle?.c >= lastCandle?.o;
    const color = isUp ? CHART_THEME.up : CHART_THEME.down;
    const label =
      yValue! >= 100 ? yValue!.toFixed(2) : yValue!.toFixed(4);
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
    const boxY = clamp(
      yPixel - labelHeight / 2,
      priceScale.top,
      priceScale.bottom - labelHeight,
    );

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
    ctx.fillText(
      label,
      boxX + 7 + (labelWidth - 7) / 2,
      boxY + labelHeight / 2,
    );
    ctx.restore();
  },
};

export const indicatorLegendPlugin = {
  id: 'indicatorLegend',
  afterDraw(chart: Chart) {
    if (!chart.ctx || !chart.chartArea) return;
    const chartAny = chart as unknown as EnhancedChart;
    const fallbackIndex =
      Math.max(0, (chart.data.datasets[0]?.data?.length ?? 0) - 1);
    const index = chartAny.crosshair?.snapIndex ?? fallbackIndex;
    const ctx = chart.ctx;
    const volumeScale = chart.scales?.volume;
    const stochScale = chart.scales?.stochRsi;

    ctx.save();
    ctx.font = '700 11px Inter, sans-serif';
    ctx.textBaseline = 'top';

    if (isScaleVisible(volumeScale as unknown as ScaleLike)) {
      const data = chart.data.datasets as ChartDatasetLike[];
      const volumeData =
        data.find(
      d => d.label === 'Volume',
        )?.data || [];
      const vPoints = asPoints(volumeData);
      const volumePoint = vPoints[index] || lastDefined(vPoints);
      const vol = volumePoint?.y ?? 0;
      const quoteVol = (volumePoint as { q?: number })?.q ?? 0;
      const meta = getPairMeta(chartAny._symbol);
      const quoteLabel = meta.quote || 'QUOTE';
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
      ctx.fillText(`${quoteLabel} VOL`, x, y);
      x += ctx.measureText(`${quoteLabel} VOL `).width;
      ctx.fillStyle = CHART_THEME.stochD;
      ctx.fillText(compactNumber(quoteVol), x, y);
    }

    if (isScaleVisible(stochScale as unknown as ScaleLike)) {
      const data = chart.data.datasets as ChartDatasetLike[];
      const kData =
        data.find(
      d => d.label === 'Stoch RSI %K',
        )?.data || [];
      const dData =
        data.find(
      d => d.label === 'Stoch RSI %D',
        )?.data || [];
      const kPoints = asPoints(kData);
      const dPoints = asPoints(dData);
      const kPoint = kPoints[index] || lastDefined(kPoints);
      const dPoint = dPoints[index] || lastDefined(dPoints);
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

      getSeparatedChipPositions(stochScale as unknown as ScaleLike, [
        {
          key: 'k',
          value: kPoint?.y,
          color: CHART_THEME.stochK,
        },
        {
          key: 'd',
          value: dPoint?.y,
          color: CHART_THEME.stochD,
        },
      ]).forEach((chip) => {
        drawValueChip(ctx, chartAny, stochScale as unknown as ScaleLike, chip.value, chip.color, chip.y);
      });
    }

    const dsList = chart.data.datasets as ChartDatasetLike[];
    const smaDs = dsList.find((d: ChartDatasetLike) => d.label?.startsWith('SMA '));
    const emaDs = dsList.find((d: ChartDatasetLike) => d.label?.startsWith('EMA '));

    if (smaDs || emaDs) {
      const x = chart.chartArea.left + 10;
      let y = chart.chartArea.top + 40;
      const priceSmaData = smaDs ? asPoints(smaDs.data ?? []) : [];
      const priceEmaData = emaDs ? asPoints(emaDs.data ?? []) : [];
      const smaPoint = priceSmaData[index] || lastDefined(priceSmaData);
      const emaPoint = priceEmaData[index] || lastDefined(priceEmaData);

      if (smaDs && Number.isFinite(smaPoint?.y)) {
        ctx.fillStyle = CHART_THEME.sma;
        ctx.fillText(`v SMA ${smaDs.label?.replace('SMA ', '')}`, x, y);
        const textW = ctx.measureText(`v SMA ${smaDs.label?.replace('SMA ', '')}  `).width;
        ctx.fillStyle = '#f5f7fa';
        ctx.fillText(Number(smaPoint!.y!).toFixed(6), x + textW, y);
        y += 16;
      }

      if (emaDs && Number.isFinite(emaPoint?.y)) {
        ctx.fillStyle = CHART_THEME.ema;
        ctx.fillText(`v EMA ${emaDs.label?.replace('EMA ', '')}`, x, y);
        const textW = ctx.measureText(`v EMA ${emaDs.label?.replace('EMA ', '')}  `).width;
        ctx.fillStyle = '#f5f7fa';
        ctx.fillText(Number(emaPoint!.y!).toFixed(6), x + textW, y);
      }
    }

    ctx.restore();
  },
};

export const fixedRangeVolumeProfilePlugin = {
  id: 'fixedRangeVolumeProfile',
  beforeDatasetsDraw(chart: Chart) {
    const chartAny = chart as unknown as EnhancedChart;
    chartAny._volumeProfile = null;
    const indicators = chartAny._indicators || {};
    if (
      indicators.volumeProfile === false ||
      !chart.ctx ||
      !chart.chartArea
    )
      return;

    const priceScale = chart.scales?.price;
    const rawCandles = chart.data.datasets[0]?.data || [];
    if (!isScaleVisible(priceScale as unknown as ScaleLike) || rawCandles.length < 2) return;

    const settings = chartAny._volumeProfileSettings || {};
    const profile = calculateVolumeProfile(
      asPoints(rawCandles) as unknown as Candle[],
      settings.rows ?? 48,
    );
    if (
      !profile.rows.length ||
      !profile.poc ||
      profile.maxVolume <= 0
    )
      return;

    chartAny._volumeProfile = profile;
    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const profileWidth = clamp(
      Math.round(chartArea.width * (settings.widthRatio ?? 0.28)),
      settings.minWidth ?? 82,
      settings.maxWidth ?? 220,
    );
    const xRight = chartArea.right - 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      chartArea.left,
      priceScale.top,
      chartArea.width,
      priceScale.bottom - priceScale.top,
    );
    ctx.clip();

    profile.rows.forEach((row: VPRow) => {
      if (row.total <= 0) return;
      const yTop = priceScale.getPixelForValue(row.high);
      const yBottom = priceScale.getPixelForValue(row.low);
      const y = Math.min(yTop, yBottom) + 1;
      const height = Math.max(1, Math.abs(yBottom - yTop) - 1);
      const width = Math.max(
        1,
        (row.total / profile.maxVolume) * profileWidth,
      );
      const x = xRight - width;
      const upWidth =
        row.total > 0 ? width * (row.up / row.total) : 0;
      const downWidth = width - upWidth;
      const isPoc = row === profile.poc;

      ctx.fillStyle = isPoc
        ? 'rgba(242, 201, 76, 0.28)'
        : 'rgba(236, 84, 125, 0.28)';
      ctx.fillRect(x, y, downWidth, height);
      ctx.fillStyle = isPoc
        ? 'rgba(242, 201, 76, 0.36)'
        : 'rgba(54, 211, 219, 0.32)';
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
  afterDraw(chart: Chart) {
    const chartAny = chart as unknown as EnhancedChart;
    const indicators = chartAny._indicators || {};
    if (
      indicators.volumeProfile === false ||
      !chart.ctx ||
      !chart.chartArea
    )
      return;

    const profile = chartAny._volumeProfile;
    const priceScale = chart.scales?.price;
    if (!profile?.poc || !isScaleVisible(priceScale as unknown as ScaleLike)) return;

    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const label = `VP POC ${formatProfilePrice(profile.poc.price)} | ${compactNumber(profile.poc.total)}`;

    ctx.save();
    ctx.font = '400 11px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    const labelWidth = Math.min(
      chartArea.width - 16,
      ctx.measureText(label).width + 18,
    );
    const labelHeight = 22;
    const x = Math.max(
      chartArea.left + 8,
      chartArea.right - labelWidth - 8,
    );
    const y = priceScale.top + 9;

    ctx.fillStyle = 'rgba(8, 10, 12, 0.78)';
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect)
      ctx.roundRect(x, y, labelWidth, labelHeight, 5);
    else ctx.rect(x, y, labelWidth, labelHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f5f7fa';
    ctx.textAlign = 'center';
    ctx.fillText(
      label,
      x + labelWidth / 2,
      y + labelHeight / 2,
      labelWidth - 12,
    );
    ctx.restore();
  },
};

function formatProfilePrice(value: number) {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000)
    return value.toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
}

import { calculateVolumeProfile } from '@/lib/chart/indicators';

export const measureRangePlugin = {
  id: 'measureRange',
  afterDraw(chart: Chart) {
    const chartAny = chart as unknown as EnhancedChart;
    const measure = chartAny._measure || {};
    if (!measure.active || !chart.ctx || !chart.chartArea) return;

    const start = measure.start;
    const end = measure.end || measure.preview;
    const priceScale = chart.scales?.price;
    const xScale = chart.scales?.x;
    const candles = chart.data.datasets[0]?.data || [];
    if (!start || !priceScale || !xScale || !candles.length) return;

    const ctx = chart.ctx;
    const startX = xScale.getPixelForValue(start.x);
    const startY = priceScale.getPixelForValue(start.y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      chart.chartArea.left,
      priceScale.top,
      chart.chartArea.width,
      priceScale.bottom - priceScale.top,
    );
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
    const percent = leftPoint.y
      ? (delta / leftPoint.y) * 100
      : 0;
    const isUp = delta >= 0;
    const color = isUp ? CHART_THEME.up : CHART_THEME.down;
    const fill = isUp
      ? 'rgba(0, 192, 135, 0.11)'
      : 'rgba(242, 54, 69, 0.11)';
    const bars =
      Math.abs(rightPoint.index - leftPoint.index) + 1;
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
    const labelWidth = Math.min(
      chart.chartArea.width - 16,
      ctx.measureText(label).width + 18,
    );
    const labelX = clamp(
      leftX + width / 2 - labelWidth / 2,
      chart.chartArea.left + 8,
      chart.chartArea.right - labelWidth - 8,
    );
    const labelY = clamp(
      topY - 28,
      priceScale.top + 8,
      priceScale.bottom - 30,
    );

    ctx.fillStyle = 'rgba(8, 10, 12, 0.86)';
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (ctx.roundRect)
      ctx.roundRect(labelX, labelY, labelWidth, 22, 5);
    else ctx.rect(labelX, labelY, labelWidth, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f5f7fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      label,
      labelX + labelWidth / 2,
      labelY + 11,
      labelWidth - 12,
    );
    ctx.restore();
  },
};

function formatMeasurePrice(value: number) {
  if (!Number.isFinite(value)) return '-';
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
}

export function createAdvancedTooltipPlugin() {
  return {
    id: 'advancedTooltip',
    afterDraw(chart: Chart) {
      const ec = chart as unknown as EnhancedChart;
      if (
        !chart.ctx ||
        !chart.chartArea ||
        !ec.crosshair ||
        ec.crosshair.x === null
      )
        return;

      const candleData = (
        chart.data.datasets[0]?.data as unknown as Array<{ x: number; o: number; h: number; l: number; c: number; v?: number }> | undefined
      )?.[ec.crosshair.snapIndex!];
      if (!candleData) return;

      const ctx = chart.ctx;
      const hasVolume =
        Number.isFinite(candleData.v) && candleData.v! > 0;
      const tooltipHeight = 42;
      const tooltipX = chart.chartArea.left + 8;
      const tooltipY = Math.max(
        4,
        chart.chartArea.top - tooltipHeight - 8,
      );
      const tooltipWidth = Math.min(
        chart.chartArea.width - 16,
        hasVolume ? 620 : 540,
      );

      const dateStr = new Date(candleData.x).toLocaleString(
        'es-ES',
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      );
      const isUp = candleData.c >= candleData.o;
      const priceColor = isUp ? CHART_THEME.up : CHART_THEME.down;
      const change = candleData.c - candleData.o;
      const changePct = candleData.o
        ? (change / candleData.o) * 100
        : 0;

      ctx.save();
      ctx.fillStyle = 'rgba(8, 10, 12, 0.78)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect)
        ctx.roundRect(
          tooltipX,
          tooltipY,
          tooltipWidth,
          tooltipHeight,
          6,
        );
      else
        ctx.rect(
          tooltipX,
          tooltipY,
          tooltipWidth,
          tooltipHeight,
        );
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = CHART_THEME.text;
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(dateStr, tooltipX + 10, tooltipY + 10);

      const rows: [string, string, string?][] = [
        ['O', candleData.o?.toFixed?.(4)],
        ['H', candleData.h?.toFixed?.(4), CHART_THEME.up],
        [
          'L',
          candleData.l?.toFixed?.(4),
          CHART_THEME.down,
        ],
        [
          'C',
          candleData.c?.toFixed?.(4),
          priceColor,
        ],
        [
          'CHG',
          `${change >= 0 ? '+' : ''}${change.toFixed(4)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`,
          priceColor,
        ],
      ];
      if (hasVolume)
        rows.push(['VOL', compactNumber(candleData.v!)]);

      ctx.font = '11px Inter, sans-serif';
      let cursorX = tooltipX + 10;
      const rowY = tooltipY + 27;
      rows.forEach(([label, value, color]) => {
        ctx.fillStyle = CHART_THEME.muted;
        ctx.textAlign = 'left';
        ctx.fillText(label!, cursorX, rowY);
        cursorX += ctx.measureText(`${label} `).width;
        ctx.fillStyle = color || '#f3f5f7';
        ctx.fillText(value || '-', cursorX, rowY);
        cursorX += ctx.measureText(`${value || '-'}   `).width;
      });

      ctx.restore();
    },
  };
}
