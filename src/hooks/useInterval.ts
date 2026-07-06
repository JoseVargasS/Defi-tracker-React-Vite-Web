import { useEffect, useRef } from 'react';

export function useInterval(
  callback: () => void,
  delayMs: number | null,
  options?: { immediate?: boolean }
) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;

    if (options?.immediate) {
      savedCallback.current();
    }

    const id = setInterval(() => savedCallback.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs, options?.immediate]);
}
