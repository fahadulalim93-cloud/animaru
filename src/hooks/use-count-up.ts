"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates from 0 to `target` with an ease-out curve once `started` flips
 * true (typically driven by an IntersectionObserver / whileInView trigger).
 * Shared by Landing + Guide page stat rows.
 */
export function useCountUp(target: number, duration = 1800, started = false) {
  const [count, setCount] = useState(0);
  const startedRef = useRef(started);
  const doneRef = useRef(false);

  useEffect(() => {
    startedRef.current = started;
    if (!started || doneRef.current) return;
    doneRef.current = true;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [started, target, duration]);

  return count;
}
