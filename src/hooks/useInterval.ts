import { useEffect, useRef } from 'react';

export function useInterval(
  callback: () => void,
  delayMs: number | null,
  options?: { immediate?: boolean }
) {
  const savedCallback = useRef(callback);
  // ponytail: snapshot the immediate flag so the timer doesn't re-create when the caller passes a fresh object each render
  const immediate = options?.immediate ?? false;

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;

    if (immediate) {
      savedCallback.current();
    }

    const id = setInterval(() => savedCallback.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs, immediate]);
}
