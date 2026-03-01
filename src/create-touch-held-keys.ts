type HandlerOptions = {
  keyDown?: () => void;
  keyUp?: () => void;
  isDisabled?: boolean;
};

type TouchTarget = { btn?: HTMLElement; isDisabled?: boolean };

export const createTouchHeldKeys = () => {
  const registry = new Map<HTMLElement, HandlerOptions>();
  /** Which button (and HandlerOptions) each touch is currently over. */
  const touchTargets = new Map<number, TouchTarget>();
  /** Number of touches currently on each button (keyDown once, keyUp when 0). */
  const refCount = new Map<HTMLElement, number>();

  const handlerKeyDown = (btn: HTMLElement, handler?: () => void) => {
    handler?.();
    btn.classList.add('active');
  };
  const handlerKeyUp = (btn: HTMLElement, handler?: () => void) => {
    handler?.();
    btn.classList.remove('active');
  };
  const getAt = (clientX: number, clientY: number): HTMLElement | undefined => {
    const el = document.elementFromPoint(clientX, clientY);
    return [...registry.keys()].find((btn) => btn === el || btn.contains(el));
  };

  const setTargetForTouch = (touchId: number, btn?: HTMLElement) => {
    const { keyDown, isDisabled } = btn ? (registry.get(btn) ?? {}) : {};
    const prev = touchTargets.get(touchId) ?? { isDisabled };
    touchTargets.set(touchId, prev);

    if (prev?.isDisabled || btn === prev.btn) {
      return;
    }
    if (prev?.btn) {
      const n = (refCount.get(prev.btn) ?? 0) - 1;
      if (n <= 0) {
        refCount.delete(prev.btn);
        const { keyUp } = prev.btn ? (registry.get(prev.btn) ?? {}) : {};
        handlerKeyUp(prev.btn, keyUp);
      } else {
        refCount.set(prev.btn, n);
      }
    }
    prev.btn = btn ?? undefined;
    if (btn) {
      const n = (refCount.get(btn) ?? 0) + 1;
      refCount.set(btn, n);
      if (n === 1) {
        handlerKeyDown(btn, keyDown);
      }
    }
  };

  const handleTouch = (e: TouchEvent) =>
    [...e.changedTouches].forEach(({ identifier, clientX, clientY }) => {
      setTargetForTouch(identifier, getAt(clientX, clientY));
    });
  document.addEventListener('touchstart', handleTouch, { passive: true });
  document.addEventListener('touchmove', handleTouch, { passive: true });

  const handleTouchEnd = (e: TouchEvent) =>
    [...e.changedTouches].forEach(({ identifier }) => {
      setTargetForTouch(identifier);
      touchTargets.delete(identifier);
    });
  document.addEventListener('touchend', handleTouchEnd);
  document.addEventListener('touchcancel', handleTouchEnd);

  const addHandler = (btn: HTMLButtonElement, options: HandlerOptions) => {
    registry.set(btn, options);
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') {
        e.preventDefault();
        handlerKeyDown(btn, options.keyDown);
      }
    });
    btn.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch') {
        handlerKeyUp(btn, options.keyUp);
      }
    });
  };
  return addHandler;
};
