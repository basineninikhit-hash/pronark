import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spring, VelocityTracker, getLastPointer, prefersReducedMotion, project, rubberband, springs } from '@/lib/motion';

/*
 * One surface for every Pronark dialog.
 * Phones: a bottom sheet that tracks the finger 1:1, rubber-bands past the top, and
 * projects a flick's momentum to decide whether to close (velocity handed to the spring).
 * Larger screens: a centered dialog that grows out of the control that opened it.
 * Both can be interrupted and reversed mid-animation. Reduced motion gets a cross-fade.
 *
 * `open` may turn false while children become empty; the last open content is kept on
 * screen until the exit animation settles.
 */

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Accessible name when the visual title isn't descriptive enough. */
  label?: string;
};

const phoneQuery = () => window.matchMedia('(max-width: 767px)').matches;

export function Sheet(props: SheetProps) {
  const { open, onClose } = props;
  const [mounted, setMounted] = useState(open);
  const cache = useRef(props);
  if (open) cache.current = props;
  const { title, eyebrow, description, children, className, label } = open ? props : cache.current;

  const popupRef = useRef<HTMLDivElement | null>(null);
  // The portal mounts a frame after the root, so track the node itself to start the animation.
  const [popupNode, setPopupNode] = useState<HTMLDivElement | null>(null);
  const attachPopup = (node: HTMLDivElement | null) => { popupRef.current = node; setPopupNode(node); };
  const backdropRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mode = useRef<'sheet' | 'dialog' | 'fade'>('dialog');
  const releaseVelocity = useRef(0);
  const springRef = useRef<Spring | null>(null);

  useEffect(() => { if (open) setMounted(true); }, [open]);

  // progress: 0 = hidden, 1 = presented. For the phone sheet it is a pixel offset instead.
  const closedOffset = () => (popupRef.current?.offsetHeight ?? 600) + 24;
  const apply = (v: number) => {
    const popup = popupRef.current, backdrop = backdropRef.current;
    if (!popup || !backdrop) return;
    if (mode.current === 'sheet') {
      const h = popup.offsetHeight || 1;
      popup.style.transform = `translate3d(0, ${v.toFixed(2)}px, 0)`;
      popup.style.opacity = '1';
      backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - v / h)));
    } else if (mode.current === 'dialog') {
      const p = Math.max(0, v);
      popup.style.transform = `translate(-50%, -50%) scale(${(0.92 + 0.08 * p).toFixed(4)})`;
      popup.style.opacity = String(Math.min(1, p));
      backdrop.style.opacity = String(Math.min(1, p));
    } else {
      popup.style.transform = mode.current === 'fade' && !phoneQuery() ? 'translate(-50%, -50%)' : 'none';
      popup.style.opacity = String(Math.max(0, Math.min(1, v)));
      backdrop.style.opacity = String(Math.max(0, Math.min(1, v)));
    }
  };

  // Enter / exit / re-enter, always from the live on-screen value.
  useLayoutEffect(() => {
    if (!mounted) return;
    const popup = popupRef.current;
    if (!popup) return;
    if (!springRef.current) {
      mode.current = prefersReducedMotion() ? 'fade' : phoneQuery() ? 'sheet' : 'dialog';
      if (mode.current === 'dialog') {
        popup.style.transform = 'translate(-50%, -50%)';
        const pointer = getLastPointer(), rect = popup.getBoundingClientRect();
        popup.style.transformOrigin = pointer
          ? `${Math.max(0, Math.min(rect.width, pointer.x - rect.left))}px ${Math.max(0, Math.min(rect.height, pointer.y - rect.top))}px`
          : 'center';
      }
      springRef.current = new Spring(mode.current === 'sheet' ? closedOffset() : 0, apply, { precision: mode.current === 'sheet' ? 0.5 : 0.002 });
    }
    const spring = springRef.current;
    const hidden = mode.current === 'sheet' ? closedOffset() : 0;
    const shown = mode.current === 'sheet' ? 0 : 1;
    if (open) {
      spring.onRest = undefined;
      spring.to(shown, mode.current === 'fade' ? { damping: 1, response: 0.2 } : mode.current === 'sheet' ? { damping: 1, response: 0.38 } : springs.snappy);
    } else {
      const velocity = releaseVelocity.current;
      releaseVelocity.current = 0;
      spring.onRest = () => { springRef.current = null; setMounted(false); };
      spring.to(hidden, mode.current === 'sheet'
        ? { velocity, damping: Math.abs(velocity) > 300 ? springs.momentum.damping : 1, response: 0.3 }
        : { damping: 1, response: 0.2 });
    }
  }, [open, mounted, popupNode]);

  useEffect(() => () => springRef.current?.stop(), []);

  // Drag-to-dismiss on the sheet's handle and header.
  useEffect(() => {
    const grab = grabRef.current;
    if (!grab || !mounted) return;
    const tracker = new VelocityTracker();
    let drag: { id: number; startY: number; from: number } | null = null;
    const down = (e: PointerEvent) => {
      const spring = springRef.current;
      if (mode.current !== 'sheet' || !spring || !open) return;
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
      grab.setPointerCapture(e.pointerId);
      spring.stop(); // interrupt: continue from where it is on screen right now
      drag = { id: e.pointerId, startY: e.clientY, from: spring.value };
      tracker.reset();
      tracker.push(e.clientY);
    };
    const move = (e: PointerEvent) => {
      const spring = springRef.current;
      if (!drag || e.pointerId !== drag.id || !spring) return;
      const raw = drag.from + (e.clientY - drag.startY);
      const height = popupRef.current?.offsetHeight ?? 600;
      spring.set(raw < 0 ? rubberband(raw, height) : raw);
      tracker.push(e.clientY);
    };
    const up = (e: PointerEvent) => {
      const spring = springRef.current;
      if (!drag || e.pointerId !== drag.id || !spring) return;
      drag = null;
      const velocity = tracker.velocity();
      const height = popupRef.current?.offsetHeight ?? 600;
      if (spring.value + project(velocity) > height * 0.5) {
        releaseVelocity.current = velocity;
        onClose();
      } else {
        spring.to(0, { velocity, damping: Math.abs(velocity) > 300 ? springs.momentum.damping : 1, response: 0.3 });
      }
    };
    grab.addEventListener('pointerdown', down);
    grab.addEventListener('pointermove', move);
    grab.addEventListener('pointerup', up);
    grab.addEventListener('pointercancel', up);
    return () => {
      grab.removeEventListener('pointerdown', down);
      grab.removeEventListener('pointermove', move);
      grab.removeEventListener('pointerup', up);
      grab.removeEventListener('pointercancel', up);
    };
  }, [mounted, open, onClose, popupNode]);

  if (!mounted) return null;
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next && open) onClose(); }}>
      <DialogPrimitive.Portal keepMounted>
        <DialogPrimitive.Backdrop
          ref={backdropRef}
          style={{ opacity: 0 }}
          className={cn('fixed inset-0 z-50 bg-black/45 supports-backdrop-filter:backdrop-blur-[2px]', !open && 'pointer-events-none')}
        />
        <DialogPrimitive.Popup
          ref={attachPopup}
          aria-label={label}
          initialFocus={closeRef}
          style={{ opacity: 0 }}
          className={cn(
            'fixed z-50 flex flex-col bg-popover text-popover-foreground outline-none will-change-transform',
            // phone: bottom sheet with a skirt below it so an overshoot never shows a gap
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.25)] ring-1 ring-foreground/10',
            'after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-40 after:bg-popover',
            // tablet/desktop: centered dialog
            'md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:max-h-[85dvh] md:w-[min(34rem,calc(100vw-2rem))] md:rounded-2xl md:shadow-2xl md:after:hidden',
            className,
          )}
        >
          <div ref={grabRef} className="touch-none select-none px-5 pt-2 pb-3 md:touch-auto md:pt-5 md:select-text">
            <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 md:hidden" />
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {eyebrow && <div className="text-eyebrow mb-1 text-muted-foreground">{eyebrow}</div>}
                <DialogPrimitive.Title className="text-title">{title}</DialogPrimitive.Title>
                {description && <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>}
              </div>
              <Button ref={closeRef} variant="ghost" size="icon" className="-mt-1 -mr-2 rounded-full" onClick={onClose} aria-label="Close">
                <XIcon />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-5">
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Action row pinned to the bottom of a sheet's scroll area. Primary action goes last. */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('sticky bottom-0 -mx-5 mt-5 flex flex-col-reverse gap-2 bg-popover/95 px-5 pt-3 pb-1 backdrop-blur sm:flex-row sm:justify-end [&>*]:sm:min-w-28', className)}>
      {children}
    </div>
  );
}
