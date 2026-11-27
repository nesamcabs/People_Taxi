/**
 * A ref callback for a row that scrolls sideways (a strip of chips): on a computer it can be dragged with the mouse and
 * scrolled with an ordinary up/down wheel, the way a phone swipes it. Touch and pen already swipe natively, so only the
 * mouse is handled. A drag never fires the click of the chip it started on.
 *
 * Use it as `ref={dragToScroll}`; React 19 runs the returned cleanup when the row unmounts.
 */
export function dragToScroll(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  let pointer: number | null = null;
  let startX = 0;
  let startLeft = 0;
  let dragged = false;

  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startLeft = el.scrollLeft;
    dragged = false;
  };
  const move = (e: PointerEvent) => {
    if (pointer !== e.pointerId) return;
    const dx = e.clientX - startX;
    if (!dragged) {
      if (Math.abs(dx) < 5) return;
      dragged = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    }
    el.scrollLeft = startLeft - dx;
  };
  const up = (e: PointerEvent) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    el.classList.remove('is-dragging');
  };
  // After a drag the browser still sends a click; swallow it so the chip under the mouse is not picked.
  const click = (e: MouseEvent) => {
    if (!dragged) return;
    dragged = false;
    e.preventDefault();
    e.stopPropagation();
  };
  // An up/down wheel scrolls the row sideways while there is more of it to see.
  const wheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY));
    if (next === el.scrollLeft) return;
    e.preventDefault();
    el.scrollLeft = next;
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('click', click, true);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('click', click, true);
    el.removeEventListener('wheel', wheel);
  };
}
