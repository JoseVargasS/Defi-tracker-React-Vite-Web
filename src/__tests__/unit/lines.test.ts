import { describe, it, expect } from 'vitest';
import { toLineData } from '@/lib/chart/lines';
import type { UTCTimestamp } from 'lightweight-charts';

const t = (n: number): UTCTimestamp => n as UTCTimestamp;

describe('toLineData', () => {
  it('sorts ascending and drops the loop-closing duplicate', () => {
    const out = toLineData([
      { time: t(3), value: 3 },
      { time: t(1), value: 1 },
      { time: t(2), value: 2 },
      { time: t(2), value: 2.5 },
      { time: t(1), value: 1 },
    ]);
    expect(out.map((p) => Number(p.time))).toEqual([1, 2, 3]);
    expect(out[1]?.value).toBe(2.5);
  });

  it('drops non-finite values', () => {
    const out = toLineData([
      { time: t(1), value: NaN },
      { time: t(2), value: 5 },
    ]);
    expect(out).toEqual([{ time: t(2), value: 5 }]);
  });

  it('keeps right-to-left user clicks without crashing', () => {
    const out = toLineData([
      { time: t(200), value: 10 },
      { time: t(100), value: 20 },
    ]);
    expect(out.map((p) => Number(p.time))).toEqual([100, 200]);
  });
});
