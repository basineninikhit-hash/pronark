import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanionCharacter, type CharacterHandle, type CharacterStyle } from '@/components/companion-character';
import { VelocityTracker, prefersReducedMotion, project, rubberband, useSpring } from '@/lib/motion';

type Dock = { side: 'left' | 'right'; y: number; minimized: boolean }; // y: 0 (top) … 1 (bottom) of the free space
const MARGIN = 16;

/**
 * The companion that floats over every screen. Drag it (1:1, rubber-banded at the edges) and a
 * flick's projected momentum docks it to the left or right edge; the grip button does the same from
 * the keyboard. "–" tucks it into a small bubble. Its spot is remembered on this device.
 */
export function FloatingCompanion({ style, line, scene, storageKey }: { style: CharacterStyle; line: string | null; scene: string; storageKey: string }) {
  const [dock, setDock] = useState<Dock>(() => {
    try { return { side: 'right', y: 1, minimized: false, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') }; } catch { return { side: 'right', y: 1, minimized: false }; }
  });
  const [eventLine, setEventLine] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false), [quiet, setQuiet] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null), character = useRef<CharacterHandle>(null);
  const pos = useRef({ x: 0, y: 0 });
  const place = () => { if (boxRef.current) boxRef.current.style.translate = `${pos.current.x.toFixed(1)}px ${pos.current.y.toFixed(1)}px`; };
  const sx = useSpring(0, (v) => { pos.current.x = v; place(); }, { precision: 0.5 });
  const sy = useSpring(0, (v) => { pos.current.y = v; place(); }, { precision: 0.5 });

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(dock)); } catch { /* storage blocked */ } }, [dock, storageKey]);

  // Event lines (from checkoffs) take over the bubble for a few seconds.
  useEffect(() => {
    let timer = 0;
    const onSay = (e: Event) => { setEventLine((e as CustomEvent<string>).detail); window.clearTimeout(timer); timer = window.setTimeout(() => setEventLine(null), 7000); };
    window.addEventListener('pronark-companion-say', onSay);
    return () => { window.removeEventListener('pronark-companion-say', onSay); window.clearTimeout(timer); };
  }, []);

  // A checkoff line belongs to the screen it happened on.
  useEffect(() => { setEventLine(null); }, [scene]);
  // On phones the bubble steps aside after a few seconds so it doesn't cover the list; tap to see it again.
  const shown = eventLine ?? line;
  useEffect(() => {
    setQuiet(false);
    if (window.innerWidth >= 768) return;
    const t = window.setTimeout(() => setQuiet(true), 6000);
    return () => window.clearTimeout(t);
  }, [shown, scene]);

  // Free area: below the top bar, above the phone tab bar.
  const bounds = () => {
    const box = boxRef.current, w = box?.offsetWidth ?? 120, h = box?.offsetHeight ?? 140, phone = window.innerWidth < 768;
    const top = 72, bottom = window.innerHeight - h - (phone ? 104 : MARGIN);
    return { left: MARGIN, right: window.innerWidth - w - MARGIN, top, bottom: Math.max(top, bottom) };
  };
  const target = (d: Dock) => { const b = bounds(); return { x: d.side === 'left' ? b.left : b.right, y: b.top + (b.bottom - b.top) * d.y }; };

  // Settle on the docked spot (and stay there across resizes and minimize/restore).
  const first = useRef(true), skipSettle = useRef(false);
  useLayoutEffect(() => {
    if (skipSettle.current) { skipSettle.current = false; return; } // a drag release is already springing there
    const go = (animate: boolean) => { const t = target(dock); if (animate && !prefersReducedMotion()) { sx.to(t.x); sy.to(t.y); } else { sx.set(t.x); sy.set(t.y); } };
    go(!first.current); first.current = false;
    const onResize = () => go(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dock.side, dock.y, dock.minimized]);

  // Drag with hysteresis: under 8px it's a tap (say hi), beyond that it tracks the finger 1:1.
  const drag = useRef<{ id: number; px: number; py: number; x0: number; y0: number; moved: boolean } | null>(null);
  const tx = useRef(new VelocityTracker()), ty = useRef(new VelocityTracker());
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    sx.stop(); sy.stop();
    drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x0: pos.current.x, y0: pos.current.y, moved: false };
    tx.current.reset(); ty.current.reset(); tx.current.push(e.clientX); ty.current.push(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) { d.moved = true; setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    const b = bounds();
    const band = (v: number, lo: number, hi: number, size: number) => (v < lo ? lo + rubberband(v - lo, size) : v > hi ? hi + rubberband(v - hi, size) : v);
    sx.set(band(d.x0 + dx, b.left, b.right, window.innerWidth)); pos.current.x = sx.value;
    sy.set(band(d.y0 + dy, b.top, b.bottom, window.innerHeight)); pos.current.y = sy.value;
    tx.current.push(e.clientX); ty.current.push(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) { character.current?.react('hello'); setQuiet(false); return; }
    setDragging(false);
    const vx = tx.current.velocity(), vy = ty.current.velocity(), b = bounds(), w = boxRef.current?.offsetWidth ?? 120;
    const side = pos.current.x + project(vx) + w / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const y = Math.min(b.bottom, Math.max(b.top, pos.current.y + project(vy) * 0.4));
    const next: Dock = { ...dock, side, y: b.bottom > b.top ? (y - b.top) / (b.bottom - b.top) : 1 };
    const t = target(next), fast = Math.hypot(vx, vy) > 400;
    if (prefersReducedMotion()) { sx.set(t.x); sy.set(t.y); }
    else { sx.to(t.x, { velocity: vx, damping: fast ? 0.75 : 1, response: 0.4 }); sy.to(t.y, { velocity: vy, damping: fast ? 0.75 : 1, response: 0.4 }); }
    skipSettle.current = next.side !== dock.side || next.y !== dock.y;
    setDock(next);
  };

  const text = quiet ? null : shown;
  const right = dock.side === 'right';
  if (dock.minimized) {
    return (
      <div ref={boxRef} className="fixed top-0 left-0 z-30 print:hidden">
        <button type="button" onClick={() => setDock({ ...dock, minimized: false })} aria-label="Show your companion"
          className="grid size-14 place-items-center overflow-hidden rounded-full bg-card shadow-lg ring-1 ring-foreground/10 transition-[scale] duration-100 active:scale-90">
          <CompanionCharacter style={style} listen={false} className="mt-6 h-16 w-14" />
        </button>
      </div>
    );
  }
  return (
    <div ref={boxRef} className={cn('fixed top-0 left-0 z-30 w-20 touch-none select-none md:w-32 print:hidden', dragging && 'cursor-grabbing')}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {text && (
        <div key={text} role="status" className={cn('absolute bottom-[calc(100%-0.5rem)] w-40 rounded-2xl bg-card px-3.5 py-2.5 shadow-lg ring-1 ring-foreground/10 animate-in fade-in zoom-in-95 duration-300 md:w-52',
          right ? 'right-6 rounded-br-sm' : 'left-6 rounded-bl-sm', dragging && 'opacity-60')}>
          <p className="font-hand text-lg leading-5 text-ink">{text}</p>
        </div>
      )}
      <CompanionCharacter ref={character} style={style} className="h-24 w-20 cursor-grab md:h-36 md:w-32" label="Your companion. Drag to move it, or tap to say hi." />
      <div data-no-drag className={cn('absolute top-2 flex flex-col items-center gap-1', right ? '-left-2' : '-right-2')}>
        <button type="button" onClick={() => setDock({ ...dock, minimized: true })} aria-label="Minimize your companion"
          className="grid size-7 place-items-center rounded-full bg-card text-muted-foreground shadow ring-1 ring-foreground/15 transition-[scale] duration-100 hover:text-foreground active:scale-90 pointer-coarse:size-9"><Minus className="size-4" /></button>
        <button type="button" onClick={() => setDock({ ...dock, side: right ? 'left' : 'right' })} aria-label={`Move your companion to the ${right ? 'left' : 'right'} side`}
          className="grid h-8 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground pointer-coarse:h-10"><GripVertical className="size-4" /></button>
      </div>
    </div>
  );
}
