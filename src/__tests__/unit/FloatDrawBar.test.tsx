import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { FloatDrawBar } from '@/components/market/FloatDrawBar';
import { useMarketStore } from '@/store/useMarketStore';

beforeEach(() => {
  localStorage.clear();
  useMarketStore.setState({
    currentPair: 'BTCUSDT',
    chartIndicators: { ...useMarketStore.getState().chartIndicators, drawTool: null },
  });
});

describe('FloatDrawBar', () => {
  it('renders drawing tools', () => {
    render(<FloatDrawBar />);
    expect(screen.getByTitle('Fibonacci')).toBeTruthy();
    expect(screen.getByTitle('Rectángulo')).toBeTruthy();
    expect(screen.getByTitle('Cursor')).toBeTruthy();
  });

  it('renders all twelve draw kinds', () => {
    const { container } = render(<FloatDrawBar />);
    for (const title of [
      'Fibonacci', 'Segmento', 'Línea', 'Rayo', 'Flecha', 'Segmento H',
      'Línea H', 'Recta H', 'Rectángulo', 'Círculo', 'Triángulo', 'Línea de precio',
    ]) {
      expect(screen.getByTitle(title)).toBeTruthy();
    }
    expect(container.querySelectorAll('.float-draw-btn').length).toBe(14);
  });

  it('toggles the fibo tool', () => {
    render(<FloatDrawBar />);
    fireEvent.click(screen.getByTitle('Fibonacci'));
    expect(useMarketStore.getState().chartIndicators.drawTool).toBe('FIBO');
    fireEvent.click(screen.getByTitle('Fibonacci'));
    expect(useMarketStore.getState().chartIndicators.drawTool).toBeNull();
  });

  it('selects draw kinds', () => {
    render(<FloatDrawBar />);
    fireEvent.click(screen.getByTitle('Rectángulo'));
    expect(useMarketStore.getState().chartIndicators.drawTool).toBe('RECT');
  });

  it('selects the new ray and circle kinds', () => {
    render(<FloatDrawBar />);
    fireEvent.click(screen.getByTitle('Rayo'));
    expect(useMarketStore.getState().chartIndicators.drawTool).toBe('RAY');
    fireEvent.click(screen.getByTitle('Círculo'));
    expect(useMarketStore.getState().chartIndicators.drawTool).toBe('CIRCLE');
  });

  it('clears overlays of the pair', () => {
    localStorage.setItem('fib_overlays_BTCUSDT', 'f1;1;100;2;110;#FFFFFF;1;0+1;0;0');
    render(<FloatDrawBar />);
    fireEvent.click(screen.getByTitle('Borrar dibujos del par'));
    expect(localStorage.getItem('fib_overlays_BTCUSDT')).toBe('');
  });
});
