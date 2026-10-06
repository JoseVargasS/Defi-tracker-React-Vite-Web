import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AlertsWidget } from '@/components/market/AlertsPanel';
import { useAlertsStore } from '@/store/useAlertsStore';
import { useMarketStore } from '@/store/useMarketStore';

beforeEach(() => {
  localStorage.clear();
  useAlertsStore.setState({
    alerts: [],
    monitorEnabled: true,
    monitorIntervals: ['5m'],
    confluenceEnabled: true,
  });
  useMarketStore.setState({ tracked: [], currentPair: null });
});

describe('AlertsWidget', () => {
  it('renders bell without badge when no unread', () => {
    render(<AlertsWidget />);
    expect(screen.getByTitle('Alertas de divergencias')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('shows badge with unread count', () => {
    useAlertsStore.getState().ingestCandidate({
      symbol: 'BTC_USDT',
      interval: '5m',
      div: { idx1: 1, idx2: 70, rsi1: 30, rsi2: 35, kind: 'REG_BULL' },
      candleTime: 70 * 300_000,
      pre: false,
    });
    render(<AlertsWidget />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('opens panel with empty state', () => {
    render(<AlertsWidget />);
    fireEvent.click(screen.getByTitle('Alertas de divergencias'));
    expect(screen.getByText(/Sin alertas/)).toBeTruthy();
    expect(screen.getByText(/sin notificaciones push/)).toBeTruthy();
  });

  it('opens chart on alert tap', () => {
    useAlertsStore.getState().ingestCandidate({
      symbol: 'BTC_USDT',
      interval: '15m',
      div: { idx1: 1, idx2: 70, rsi1: 70, rsi2: 65, kind: 'REG_BEAR' },
      candleTime: 70 * 900_000,
      pre: false,
    });
    render(<AlertsWidget />);
    fireEvent.click(screen.getByTitle('Alertas de divergencias'));
    fireEvent.click(screen.getByText(/Bear en 15m/));
    expect(useMarketStore.getState().currentPair).toBe('BTC_USDT-MEXC');
    expect(useMarketStore.getState().currentInterval).toBe('15m');
  });
});
