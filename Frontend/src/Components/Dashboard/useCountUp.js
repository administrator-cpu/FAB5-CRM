import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Animated number for KPI figures.
 * - While `pending` (data still loading), climbs from 0 toward `placeholder`,
 *   fast at first and then slower, never quite reaching it.
 * - When `target` arrives, eases from wherever it is to `target`.
 * Users with "reduce motion" turned on get the final number without animation.
 */
export function useCountUp(target, { pending = false, placeholder = 0, duration = 900 } = {}) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const set = (v) => {
      displayRef.current = v;
      setDisplay(v);
    };
    cancelAnimationFrame(frameRef.current);
    const reduce = prefersReducedMotion();
    const start = performance.now();
    const from = displayRef.current;

    if (pending) {
      if (reduce || !(placeholder > 0)) return undefined;
      const ceiling = placeholder * 0.95;
      const step = (now) => {
        const t = (now - start) / 1000;
        set(from + (ceiling - from) * (1 - Math.exp(-t / 1.2)));
        frameRef.current = requestAnimationFrame(step);
      };
      frameRef.current = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frameRef.current);
    }

    if (target === null || target === undefined || !Number.isFinite(Number(target))) return undefined;
    const to = Number(target);
    if (reduce) {
      set(to);
      return undefined;
    }
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      set(from + (to - from) * easeOutCubic(p));
      if (p < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, pending, placeholder, duration]);

  return display;
}
