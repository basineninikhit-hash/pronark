import { useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

/**
 * Moves an indicator element onto the container's `[data-active="true"]` child with
 * critically damped springs on each axis (decomposed X/Y, per the fluid-interfaces talk).
 * The first placement and resizes jump; selection changes animate from the live position.
 */
export function useSlidingIndicator(container: RefObject<HTMLElement | null>, indicator: RefObject<HTMLElement | null>, key: unknown) {
  const first = useRef(true);
  const style = () => indicator.current?.style;
  const pos = useRef({ x: 0, y: 0 }).current;
  const move = () => { const s = style(); if (s) s.translate = `${pos.x.toFixed(2)}px ${pos.y.toFixed(2)}px`; };
  const x = useSpring(0, (v) => { pos.x = v; move(); }, { precision: 0.1 });
  const y = useSpring(0, (v) => { pos.y = v; move(); }, { precision: 0.1 });
  const w = useSpring(0, (v) => { const s = style(); if (s) s.width = `${Math.max(0, v).toFixed(2)}px`; }, { precision: 0.1 });
  const h = useSpring(0, (v) => { const s = style(); if (s) s.height = `${Math.max(0, v).toFixed(2)}px`; }, { precision: 0.1 });

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const place = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>('[data-active="true"]');
      const s = style();
      if (!s) return;
      s.opacity = active ? '1' : '0';
      if (!active) return;
      const targets: [typeof x, number][] = [[x, active.offsetLeft], [y, active.offsetTop], [w, active.offsetWidth], [h, active.offsetHeight]];
      for (const [spring, value] of targets) animate && !prefersReducedMotion() ? spring.to(value) : spring.set(value);
    };
    place(!first.current);
    first.current = false;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [key]);
}
