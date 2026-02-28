type Handlers = {
  keyDown?: () => void;
  keyUp?: () => void;
};

export function createTouchHeldKeys({ deadArea }: { deadArea: HTMLElement }) {
  const registry = new Map<HTMLElement, Handlers>([[deadArea, {}]]);
  /** Which button (and handlers) each touch is currently over. */
  const touchTargets = new Map<number, { btn: HTMLElement; key: Handlers }>();
  /** Number of touches currently on each button (keyDown once, keyUp when 0). */
  const refCount = new Map<HTMLElement, number>();

  const enter = (btn: HTMLElement, handler?: () => void) => {
    if (btn === deadArea) {
      return;
    }
    handler?.();
    btn.classList.add('active');
  };
  const leave = (btn: HTMLElement, handler?: () => void) => {
    if (btn === deadArea) {
      return;
    }
    handler?.();
    btn.classList.remove('active');
  };
  const getAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) {
      return null;
    }
    for (const [btn, key] of registry) {
      if (btn === el || btn.contains(el)) {
        return { btn, key };
      }
    }
    return null;
  };

  const setTargetForTouch = (
    touchId: number,
    hit?: { btn: HTMLElement; key: Handlers } | null
  ) => {
    const prev = touchTargets.get(touchId);
    if (prev?.btn === hit?.btn) {
      return;
    }
    if (prev) {
      const n = (refCount.get(prev.btn) ?? 0) - 1;
      if (n <= 0) {
        refCount.delete(prev.btn);
        leave(prev.btn, prev.key.keyUp);
      } else {
        refCount.set(prev.btn, n);
      }
      if (prev.btn !== deadArea || hit === undefined) {
        touchTargets.delete(touchId);
      }
    }
    if (hit && prev?.btn !== deadArea) {
      touchTargets.set(touchId, hit);
      const n = (refCount.get(hit.btn) ?? 0) + 1;
      refCount.set(hit.btn, n);
      if (n === 1) {
        enter(hit.btn, hit.key.keyDown);
      }
    }
  };

  const handleTouch = (e: TouchEvent) => {
    for (const t of e.changedTouches) {
      setTargetForTouch(t.identifier, getAt(t.clientX, t.clientY));
    }
  };
  document.addEventListener('touchstart', handleTouch, { passive: true });
  document.addEventListener('touchmove', handleTouch, { passive: true });

  const handleTouchEnd = (e: TouchEvent) => {
    for (const t of e.changedTouches) {
      setTargetForTouch(t.identifier);
    }
  };
  document.addEventListener('touchend', handleTouchEnd);
  document.addEventListener('touchcancel', handleTouchEnd);

  return (btn: HTMLButtonElement, key: Handlers) => {
    registry.set(btn, key);
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        return;
      }
      e.preventDefault();
      enter(btn, key.keyDown);
    });
    btn.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        return;
      }
      leave(btn, key.keyUp);
    });
  };
}
