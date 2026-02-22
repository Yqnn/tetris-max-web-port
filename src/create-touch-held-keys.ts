type Handlers = {
  keyDown?: () => void;
  keyUp?: () => void;
};

export function createTouchHeldKeys() {
  const registry = new Map<HTMLElement, Handlers>();
  let activeTouchId: number | null = null;
  let current: HTMLElement | null = null;
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
  const setTarget = (hit: { btn: HTMLElement; key: Handlers } | null) => {
    if (current === hit?.btn) {
      return;
    }
    if (current) {
      const key = registry.get(current);
      if (key) {
        leave(current, key.keyUp);
      }
    }
    current = hit?.btn ?? null;
    if (hit) {
      enter(hit.btn, hit.key.keyDown);
    }
  };

  document.addEventListener(
    'touchstart',
    (e) => {
      if (activeTouchId !== null || !e.changedTouches[0]) {
        return;
      }
      const t = e.changedTouches[0];
      activeTouchId = t.identifier;
      setTarget(getAt(t.clientX, t.clientY));
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (activeTouchId === null) {
        return;
      }
      const t = [...e.touches].find((x) => x.identifier === activeTouchId);
      if (t) {
        setTarget(getAt(t.clientX, t.clientY));
      }
    },
    { passive: true }
  );
  const end = (e: TouchEvent) => {
    for (const t of e.changedTouches) {
      if (t.identifier === activeTouchId) {
        setTarget(null);
        activeTouchId = null;
      }
    }
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
