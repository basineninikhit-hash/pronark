import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drag-to-reorder by a handle, for touch and mouse. The list reorders live as the pointer
 * crosses another item's midpoint (1:1, no ghost image), and the moved item stays highlighted.
 * Pair with Move up/down buttons for keyboards and screen readers.
 */
export function useReorder(onMove: (from: number, to: number) => void) {
  const container = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const state = useRef<{ id: string; pointer: number } | null>(null);

  const items = () => [...(container.current?.querySelectorAll<HTMLElement>(':scope > [data-reorder-id]') ?? [])];
  const handleProps = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      state.current = { id, pointer: e.pointerId };
      setDragging(id);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const s = state.current;
      if (!s || s.pointer !== e.pointerId) return;
      const list = items(), from = list.findIndex((el) => el.dataset.reorderId === s.id);
      if (from < 0) return;
      let to = from;
      list.forEach((el, i) => {
        const r = el.getBoundingClientRect(), mid = r.top + r.height / 2;
        if (i < from && e.clientY < mid) to = Math.min(to, i);
        if (i > from && e.clientY > mid) to = Math.max(to, i);
      });
      if (to !== from) { onMove(from, to); navigator.vibrate?.(5); }
    },
    onPointerUp: () => { state.current = null; setDragging(null); },
    onPointerCancel: () => { state.current = null; setDragging(null); },
    style: { touchAction: 'none' as const, cursor: 'grab' },
  });
  return { container, dragging, handleProps };
}

export function moveItem<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}
