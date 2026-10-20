import { useEffect, useRef, useSyncExternalStore } from 'react';

/*
 * Fluid-motion toolkit, after Apple's "Designing Fluid Interfaces" (WWDC 2018).
 *
 * Springs are described with Apple's two designer-facing parameters:
 *   damping  – 1 is critically damped (no overshoot); below 1 overshoots.
 *   response – roughly how quickly the value reaches its target, in seconds.
 * A spring always animates from its live (presentation) value and keeps its
 * velocity when re-targeted, so every animation can be interrupted mid-flight.
 */

export type SpringOptions = { damping?: number; response?: number; precision?: number };
type ToOptions = SpringOptions & { velocity?: number };

/** Default house style: critically damped. Use `momentum` only after a flick or throw. */
export const springs = {
  default: { damping: 1, response: 0.35 },
  snappy: { damping: 1, response: 0.25 },
  gentle: { damping: 1, response: 0.5 },
  momentum: { damping: 0.8, response: 0.3 },
} as const;

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  onRest?: () => void;
  private base: Required<SpringOptions>;
  private current: Required<SpringOptions>;
  private frame = 0;
  private last = 0;

  constructor(value: number, private apply: (value: number) => void, options: SpringOptions = {}) {
    this.value = this.target = value;
    this.base = this.current = { damping: 1, response: 0.35, precision: 0.01, ...options };
    apply(value);
  }

  get animating() { return this.frame !== 0; }

  to(target: number, options: ToOptions = {}) {
    const { velocity, ...rest } = options;
    this.target = target;
    this.current = { ...this.base, ...rest };
    if (velocity !== undefined) this.velocity = velocity;
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.step);
    }
  }

  /** Jump without animating (also used for 1:1 gesture tracking). */
  set(value: number) {
    this.stop();
    this.value = this.target = value;
    this.velocity = 0;
    this.apply(value);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private step = (now: number) => {
    const dt = Math.min(0.064, (now - this.last) / 1000);
    this.last = now;
    const { damping, response, precision } = this.current;
    const stiffness = (2 * Math.PI / response) ** 2;
    const friction = 4 * Math.PI * damping / response;
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acceleration = -stiffness * (this.value - this.target) - friction * this.velocity;
      this.velocity += acceleration * h;
      this.value += this.velocity * h;
    }
    if (Math.abs(this.velocity) < precision * 10 && Math.abs(this.value - this.target) < precision) {
      this.frame = 0;
      this.value = this.target;
      this.velocity = 0;
      this.apply(this.value);
      this.onRest?.();
      return;
    }
    this.apply(this.value);
    this.frame = requestAnimationFrame(this.step);
  };
}

/** A spring that writes straight to the DOM through `apply`, never re-rendering React. */
export function useSpring(initial: number, apply: (value: number) => void, options?: SpringOptions) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const ref = useRef<Spring | null>(null);
  if (!ref.current) ref.current = new Spring(initial, (v) => applyRef.current(v), options);
  useEffect(() => () => ref.current?.stop(), []);
  return ref.current;
}

/** Where a flick will come to rest, using scroll-view deceleration (Apple's sample code). */
export function project(velocity: number, decelerationRate = 0.998) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further you pull, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Keeps a short pointer history so release velocity reflects the last ~100ms of movement. */
export class VelocityTracker {
  private samples: { value: number; time: number }[] = [];
  push(value: number, time = performance.now()) {
    this.samples.push({ value, time });
    while (this.samples.length > 2 && time - this.samples[0].time > 100) this.samples.shift();
  }
  /** px per second; 0 if the pointer has been still. */
  velocity(now = performance.now()) {
    const first = this.samples[0], last = this.samples[this.samples.length - 1];
    if (!first || !last || last.time === first.time || now - last.time > 80) return 0;
    return ((last.value - first.value) / (last.time - first.time)) * 1000;
  }
  reset() { this.samples = []; }
}

/* ---------- reduced motion: the OS setting or Pronark's own "Reduce animations" ---------- */

const query = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let appReduced = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
query?.addEventListener('change', notify);

export function setAppReducedMotion(reduced: boolean) {
  if (appReduced === reduced) return;
  appReduced = reduced;
  document.documentElement.dataset.reducedMotion = String(reduced);
  notify();
}

export function prefersReducedMotion() {
  return appReduced || !!query?.matches;
}

export function useReducedMotion() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    prefersReducedMotion,
    () => false,
  );
}

/* ---------- last press location, so surfaces can grow out of what opened them ---------- */

let lastPointer: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
  window.addEventListener('keydown', () => { lastPointer = null; }, { capture: true, passive: true });
}
export const getLastPointer = () => lastPointer;
