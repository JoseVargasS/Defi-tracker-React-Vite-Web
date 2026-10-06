import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PulsePanel } from '@/components/market/PulsePanel';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/market', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/api/market')>();
  return {
    ...orig,
    fetchCandles: vi.fn(async () =>
      Array.from({ length: 300 }, (_, i) => [
        (i + 1) * 3_600_000, 100 + i, 103 + i, 99 + i, 102 + i, 1000, (i + 1) * 3_600_000, 100000, 1, 500, 50000, 0,
      ]),
    ),
  };
});

describe('PulsePanel', () => {
  it('renders pulse headline for a trend', async () => {
    useMarketStore.setState({ currentPair: 'BTCUSDT', currentInterval: '1h' });
    render(<PulsePanel onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Sesgo|Sin ventaja/)).toBeTruthy();
    });
    expect(screen.getByText(/No es recomendación/)).toBeTruthy();
  });
});
