import { createTouchHeldKeys } from './create-touch-held-keys';
import type { DisplayMode } from './display';
import { isDisplayMode } from './display';
import type { Level } from './game.constants';
import type { Settings } from './settings';
import type { MusicStyle } from './sound';
import {
  isBGStyle,
  isPieceStyle,
  type BGStyle,
  type PieceStyle,
} from './sprites';

function getSelect(
  id:
    | 'levelSelect'
    | 'piecesSelect'
    | 'backgroundSelect'
    | 'musicSelect'
    | 'displaySelect'
): HTMLSelectElement {
  return document.getElementById(id) as HTMLSelectElement;
}

function getButton(
  id:
    | 'startBtn'
    | 'pauseBtn'
    | 'highScoresBtn'
    | 'aboutBtn'
    | 'musicBtn'
    | 'soundBtn'
    | 'highScoreModalOk'
    | 'mobileLeft'
    | 'mobileRight'
    | 'mobileSoftDrop'
    | 'mobileHardDrop'
    | 'mobileRotateCcw'
    | 'mobileRotateCw'
    | 'mobileStartPause'
    | 'mobileToggleBar'
    | 'deadArea'
): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

function getInput(id: 'highScoreNameInput'): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function getElement(
  id: 'highScoreModalOverlay' | 'sidePanelWrapper' | 'mobileControls'
): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

export function getCanvas(): HTMLCanvasElement {
  return document.getElementById('gameCanvas') as HTMLCanvasElement;
}

function vibrateBrief() {
  navigator?.vibrate?.(10);
}

export const promptPlayerName = (onSubmit: (playerName: string) => void) => {
  const highScoreModalOverlay = getElement('highScoreModalOverlay');
  highScoreModalOverlay.removeAttribute('hidden');
  const input = getInput('highScoreNameInput');
  input.value = localStorage.getItem('tetrisMaxPlayerName') ?? 'Player';
  input.focus();
  input.select();
  getButton('startBtn').disabled = true;

  const submitHighScoreName = () => {
    const playerName =
      input.value && input.value.trim()
        ? input.value.trim().substring(0, 20)
        : 'Anonymous';
    localStorage.setItem('tetrisMaxPlayerName', playerName);
    onSubmit(playerName);

    highScoreModalOverlay.setAttribute('hidden', '');
    getButton('startBtn').disabled = false;

    highScoreModalOk.removeEventListener('click', submitHighScoreName);
    input.removeEventListener('keydown', handleKeyDown);
    highScoreModalOverlay.removeEventListener('click', handleClick);
  };
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') submitHighScoreName();
  };
  const handleClick = (e: MouseEvent) => {
    if (e.target === highScoreModalOverlay) {
      submitHighScoreName();
    }
  };

  // High score name modal
  const highScoreModalOk = getButton('highScoreModalOk');
  highScoreModalOk.addEventListener('click', submitHighScoreName);
  input.addEventListener('keydown', handleKeyDown);
  highScoreModalOverlay.addEventListener('click', handleClick);
};

export const setDisplayModeUI = (mode: DisplayMode) => {
  const isBw = mode === 'bw';
  getSelect('piecesSelect').disabled = isBw;
  getSelect('backgroundSelect').disabled = isBw;
  if (isBw) {
    getSelect('piecesSelect').value = 'default';
    getSelect('backgroundSelect').value = 'default';
  }
  document.body.classList.toggle('bw', isBw);
};

export const setSettingsUI = ({
  isMusicOn,
  isSoundOn,
  piecesStyle,
  backgroundStyle,
  musicStyle,
  displayMode,
  level,
}: Partial<Settings>) => {
  if (isMusicOn !== undefined) {
    getButton('musicBtn').textContent = 'Music: ' + (isMusicOn ? 'ON' : 'OFF');
  }
  if (isSoundOn !== undefined) {
    getButton('soundBtn').textContent =
      'Sound Effects: ' + (isSoundOn ? 'ON' : 'OFF');
  }
  if (piecesStyle !== undefined) {
    getSelect('piecesSelect').value = piecesStyle;
  }
  if (backgroundStyle !== undefined) {
    getSelect('backgroundSelect').value = backgroundStyle;
  }
  if (musicStyle !== undefined) {
    getSelect('musicSelect').value = musicStyle;
  }
  if (displayMode !== undefined) {
    getSelect('displaySelect').value = displayMode;
  }
  if (level !== undefined) {
    getSelect('levelSelect').value = level.toString();
  }
};

export const initHandlers = ({
  onPause,
  onKeyUp,
  onKeyDown,
  onClick,
  onStart,
  onToggleMusic,
  onToggleSound,
  onShowHighScores,
  onShowAbout,
  onSelectLevel,
  onSelectPieces,
  onSelectBackground,
  onSelectMusic,
  onSelectDisplay,
  initialDisplayMode,
  initialSettings,
}: {
  onPause: () => void;
  onKeyUp: (key: string) => void;
  onKeyDown: (key: string) => void;
  onClick: (e: MouseEvent) => void;
  onStart: () => void;
  onToggleMusic: () => boolean;
  onToggleSound: () => boolean;
  onShowHighScores: () => void;
  onShowAbout: () => void;
  onSelectLevel: (level: Level) => void;
  onSelectPieces: (pieces: PieceStyle) => void;
  onSelectBackground: (background: BGStyle) => void;
  onSelectMusic: (music: MusicStyle) => void;
  onSelectDisplay: (mode: DisplayMode) => void;
  initialDisplayMode: DisplayMode;
  initialSettings: Settings;
}) => {
  setDisplayModeUI(initialDisplayMode);
  setSettingsUI(initialSettings);

  // Event listeners
  document.addEventListener('keydown', (e) => {
    const highScoreModalOverlay = getElement('highScoreModalOverlay');
    if (!highScoreModalOverlay.hasAttribute('hidden')) {
      return;
    }

    const gameKeys = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowDown',
      'ArrowUp',
      'Space',
      'KeyJ',
      'KeyL',
      'KeyK',
      'KeyI',
      'KeyM',
      'KeyP',
    ];
    if (gameKeys.includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === 'KeyP') {
      onPause();
      return;
    }
    onKeyDown(e.key);
  });

  document.addEventListener('keyup', (e) => {
    onKeyUp(e.key);
  });

  getCanvas().addEventListener('click', onClick);
  getButton('startBtn').addEventListener('click', () => {
    onStart();
    getButton('startBtn').blur();
    document.body.classList.remove('mobile-controls-expanded');
  });
  getButton('pauseBtn').addEventListener('click', () => {
    onPause();
    if (currentState === 'running') {
      document.body.classList.remove('mobile-controls-expanded');
    }
  });
  getButton('musicBtn').addEventListener('click', () => {
    const isMusicOn = onToggleMusic();
    setSettingsUI({ isMusicOn });
  });
  getButton('soundBtn').addEventListener('click', () => {
    const isSoundOn = onToggleSound();
    setSettingsUI({ isSoundOn });
  });
  getButton('highScoresBtn').addEventListener('click', () => {
    onShowHighScores();
    document.body.classList.remove('mobile-controls-expanded');
  });
  getButton('aboutBtn').addEventListener('click', () => {
    onShowAbout();
    document.body.classList.remove('mobile-controls-expanded');
  });
  getSelect('levelSelect').addEventListener('change', (e) => {
    const value = (e?.target as HTMLSelectElement)?.value;
    if (value) {
      onSelectLevel(parseInt(value) as Level);
    }
  });
  getSelect('piecesSelect').addEventListener('change', (e) => {
    const style = (e?.target as HTMLSelectElement)?.value;
    if (isPieceStyle(style)) {
      onSelectPieces(style);
    }
  });
  getSelect('backgroundSelect').addEventListener('change', (e) => {
    const style = (e?.target as HTMLSelectElement)?.value;
    if (isBGStyle(style)) {
      onSelectBackground(style);
    }
  });
  getSelect('musicSelect').addEventListener('change', (e) => {
    const style = (e?.target as HTMLSelectElement)?.value;
    if (style === 'peter_wagner' || style === 'animal_instinct') {
      onSelectMusic(style);
    }
  });
  getSelect('displaySelect').addEventListener('change', (e) => {
    const mode = (e?.target as HTMLSelectElement)?.value;
    if (isDisplayMode(mode)) {
      onSelectDisplay(mode);
    }
  });

  const bindHeldKey = createTouchHeldKeys({ deadArea: getButton('deadArea') });
  const makeKeyHandlers = (key: string) => ({
    keyDown: () => {
      onKeyDown(key);
      vibrateBrief();
    },
    keyUp: () => onKeyUp(key),
  });
  bindHeldKey(getButton('mobileLeft'), makeKeyHandlers('j'));
  bindHeldKey(getButton('mobileRight'), makeKeyHandlers('l'));
  bindHeldKey(getButton('mobileSoftDrop'), makeKeyHandlers('m'));
  bindHeldKey(getButton('mobileHardDrop'), makeKeyHandlers('ArrowDown'));

  const bindButton = (
    btn: HTMLButtonElement,
    handler: (btn: HTMLButtonElement) => void
  ) => bindHeldKey(btn, { keyUp: () => handler(btn) });
  bindButton(getButton('mobileRotateCw'), () => onKeyDown('k'));
  bindButton(getButton('mobileRotateCcw'), () => onKeyDown('i'));
  bindButton(getButton('mobileStartPause'), () => {
    if (currentState === 'ready') {
      onStart();
    } else {
      onPause();
    }
  });
  bindButton(getButton('mobileToggleBar'), () => {
    if (
      currentState === 'running' &&
      !document.body.classList.contains('mobile-controls-expanded')
    ) {
      onPause();
    }
    document.body.classList.toggle('mobile-controls-expanded');
  });

  document.addEventListener(
    'touchstart',
    (e) => {
      if (
        (!(e.target instanceof Element) || !e.target.closest('.side-panel')) &&
        (!(e.target instanceof HTMLButtonElement) ||
          e.target.id !== 'mobileToggleBar')
      ) {
        document.body.classList.remove('mobile-controls-expanded');
      }
    },
    { capture: true }
  );

  document.body.classList.add('enable-transition');
  getElement('mobileControls').addEventListener('touchstart', (e) =>
    e.preventDefault()
  );

  let currentState: 'running' | 'ready' | 'paused' = 'ready';
  const setState = (state: 'running' | 'ready' | 'paused') => {
    currentState = state;
    getButton('startBtn').textContent =
      state === 'ready' ? 'Begin Game' : 'Abort';
    getButton('startBtn').classList.toggle('primary', state === 'ready');
    getButton('pauseBtn').disabled = state === 'ready';
    getButton('pauseBtn').classList.toggle('primary', state === 'paused');
    getButton('pauseBtn').textContent = state === 'paused' ? 'Resume' : 'Pause';
    getSelect('levelSelect').disabled = state !== 'ready';

    const mobileStartPause = getButton('mobileStartPause');
    mobileStartPause.textContent =
      state === 'ready' ? 'Start' : state === 'paused' ? 'Resume' : 'Pause';

    getElement('sidePanelWrapper').classList.toggle(
      'collapsed',
      state === 'running'
    );
    if (state === 'running') {
      setTimeout(() => {
        getElement('sidePanelWrapper').classList.add('collapsed-interactive');
      }, 300);
    } else {
      getElement('sidePanelWrapper').classList.remove('collapsed-interactive');
    }
  };

  return setState;
};
