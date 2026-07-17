import { describe, it, expect } from 'vitest';
import {
  crosshairPlugin,
  currentPricePlugin,
  indicatorLegendPlugin,
  fixedRangeVolumeProfilePlugin,
  rightScaleBackgroundPlugin,
  measureRangePlugin,
  createAdvancedTooltipPlugin,
} from '@/lib/chart/plugins';

describe('chart plugins', () => {
  it('crosshairPlugin has correct id and hooks', () => {
    expect(crosshairPlugin.id).toBe('crosshair');
    expect(typeof crosshairPlugin.afterInit).toBe('function');
  });

  it('currentPricePlugin has correct id and hooks', () => {
    expect(currentPricePlugin.id).toBe('currentPrice');
    expect(typeof currentPricePlugin.afterDraw).toBe('function');
  });

  it('indicatorLegendPlugin has correct id and hooks', () => {
    expect(indicatorLegendPlugin.id).toBe('indicatorLegend');
    expect(typeof indicatorLegendPlugin.afterDraw).toBe('function');
  });

  it('fixedRangeVolumeProfilePlugin has correct id and hooks', () => {
    expect(fixedRangeVolumeProfilePlugin.id).toBe('fixedRangeVolumeProfile');
    expect(typeof fixedRangeVolumeProfilePlugin.beforeDatasetsDraw).toBe('function');
  });

  it('rightScaleBackgroundPlugin has correct id and hooks', () => {
    expect(rightScaleBackgroundPlugin.id).toBe('rightScaleBackground');
    expect(typeof rightScaleBackgroundPlugin.beforeDatasetsDraw).toBe('function');
  });

  it('measureRangePlugin has correct id and hooks', () => {
    expect(measureRangePlugin.id).toBe('measureRange');
    expect(typeof measureRangePlugin.afterDraw).toBe('function');
  });

  it('createAdvancedTooltipPlugin returns plugin with correct id', () => {
    const plugin = createAdvancedTooltipPlugin();
    expect(plugin.id).toBe('advancedTooltip');
    expect(typeof plugin.afterDraw).toBe('function');
  });
});
