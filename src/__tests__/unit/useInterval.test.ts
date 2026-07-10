import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterval } from '@/hooks/useInterval';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useInterval', () => {
  it('calls callback after delay', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useInterval(cb, 1000));
    expect(cb).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not call callback when delay is null', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useInterval(cb, null));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('calls callback immediately when immediate is true', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useInterval(cb, 1000, { immediate: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not call immediately when immediate is false', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useInterval(cb, 1000, { immediate: false }));
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('clears interval on unmount', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const { unmount } = renderHook(() => useInterval(cb, 1000));
    unmount();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('updates callback ref on re-render', () => {
    vi.useFakeTimers();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useInterval(cb, 1000),
      { initialProps: { cb: cb1 } },
    );
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb1).toHaveBeenCalledTimes(1);
    rerender({ cb: cb2 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb2).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
