import { useEffect, useRef, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Measure an element and keep the measurement current.
 *
 * Returns `{ width: 0, height: 0 }` until the first observation, which is also
 * what the server render sees — the density engine treats a zero width as
 * "not measured yet" and lays the cards out without overlap.
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((previous) =>
        Math.abs(previous.width - box.width) < 1 && Math.abs(previous.height - box.height) < 1
          ? previous
          : { width: box.width, height: box.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
