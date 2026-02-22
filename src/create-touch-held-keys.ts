type Handlers = {
  keyDown?: () => void;
  keyUp?: () => void;
};

export function createTouchHeldKeys() {
  const registry = new Map<HTMLElement, Handlers>();
  /** Which button (and handlers) each touch is currently over. */
  const touchTargets = new Map<number, { btn: HTMLElement; key: Handlers }>();
  /** Number of touches currently on each button (keyDown once, keyUp when 0). */
  const refCount = new Map<HTMLElement, number>();

  const enter = (btn: HTMLElement, handler?: () => void) => {
    handler?.();
    btn.classList.add('active');
  };
  const leave = (btn: HTMLElement, handler?: () => void) => {
    handler?.();
    btn.classList.remove('active');
  };
  const getAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    for (const [btn, key] of registry) {
      if (btn === el || btn.contains(el)) return { btn, key };
    }
    return null;
  };

  const setTargetForTouch = (
    touchId: number,
    hit: { btn: HTMLElement; key: Handlers } | null
  ) => {
    const prev = touchTargets.get(touchId);
    if (prev?.btn === hit?.btn) return;
    if (prev) {
      const n = (refCount.get(prev.btn) ?? 0) - 1;
      if (n <= 0) {
        refCount.delete(prev.btn);
        leave(prev.btn, prev.key.keyUp);
      } else {
        refCount.set(prev.btn, n);
      }
      touchTargets.delete(touchId);
    }
    if (hit) {
      touchTargets.set(touchId, hit);
      const n = (refCount.get(hit.btn) ?? 0) + 1;
      refCount.set(hit.btn, n);
      if (n === 1) enter(hit.btn, hit.key.keyDown);
    }
  };

  const endTouch = (touchId: number) => {
    const prev = touchTargets.get(touchId);
    if (!prev) return;
    const n = (refCount.get(prev.btn) ?? 0) - 1;
    if (n <= 0) {
      refCount.delete(prev.btn);
      leave(prev.btn, prev.key.keyUp);
    } else {
      refCount.set(prev.btn, n);
    }
    touchTargets.delete(touchId);
  };

  document.addEventListener(
    'touchstart',
    (e) => {
      for (const t of e.changedTouches) {
        setTargetForTouch(t.identifier, getAt(t.clientX, t.clientY));
      }
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      for (const t of e.touches) {
        const hit = getAt(t.clientX, t.clientY);
        setTargetForTouch(t.identifier, hit);
      }
    },
    { passive: true }
  );
  const end = (e: TouchEvent) => {
    for (const t of e.changedTouches) endTouch(t.identifier);
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);

  return (btn: HTMLButtonElement, key: Handlers) => {
    registry.set(btn, key);
    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') {
        return;
      }
      e.preventDefault();
      enter(btn, key.keyDown);
    });
    btn.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'touch') {
        return;
      }
      leave(btn, key.keyUp);
      if (e && typeof btn.releasePointerCapture === 'function') {
        btn.releasePointerCapture(e.pointerId);
      }
    });
  };
}
