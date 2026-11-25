import { useEffect, useRef } from 'react';

/** Smoothed scroll speed in px/ms, read by ScrollReveal to pace reveals to the visitor. */
export function useScrollVelocity() {
  const speedRef = useRef(0);

  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();

    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();
      const dt = t - lastT;
      if (dt > 0) {
        const instant = Math.abs(y - lastY) / dt;
        speedRef.current = speedRef.current * 0.7 + instant * 0.3;
      }
      lastY = y;
      lastT = t;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return speedRef;
}
