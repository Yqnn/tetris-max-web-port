import './style.css';

import type { MusicStyle } from './sound';
import { initSound } from './sound';
import {
  initSprites,
  type PieceStyle,
  type BGStyle,
  isBGStyle,
  isPieceStyle,
} from './sprites';
import { initGame } from './game';
import type { Level } from './game.constants';
import { HIGH_SCORE_COUNT, initDraw } from './draw';
import type { HighScore } from './draw';

/**
 * Tetris Max - Accurate Web Port
 * Ported from the original PowerPC Macintosh version
 *
 * This is a faithful recreation of the original game mechanics,
 * matching the exact behavior of GameLogic.c and Main.c
 */

type PendingHighScore = {
  scoreIndex: number;
  finalScore: number;
  finalRows: number;
};

// Scale factor (2x from original 500x330 windowed mode)
const SCALE = 2;

// ===========================================
// game STATE (matching original globals)
// ===========================================
/// Handlers
let sound: Awaited<ReturnType<typeof initSound>> | null = null;
let draw: ReturnType<typeof initDraw> | null = null;
const game = initGame();

let currentPiecesStyle: PieceStyle = 'default';
let currentBackgroundStyle: BGStyle = 'default';
let currentMusicStyle: MusicStyle = 'peter_wagner';

let highScores: HighScore[] = []; // Array of {name, score, rows, date}
let lastHighScoreIndex = -1; // Index of player's latest high score entry
let isShowingHighScores = false; // Whether high scores popup is visible
let pendingHighScore: PendingHighScore | null = null; // { scoreIndex, finalScore, finalRows } when high score name modal is open
let isShowingAbout = false; // Whether about popup is visible

let isGameInProgress = false;
let isGamePaused = false;
let isShowingWelcomeScreen = true; // Show welcome screen until game starts

// Animation
let lastFrameTime = 0;

function getSelect(
  id: 'levelSelect' | 'piecesSelect' | 'backgroundSelect' | 'musicSelect'
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
): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

function getInput(id: 'highScoreNameInput'): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function getElement(id: 'highScoreModalOverlay'): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function getCanvas(): HTMLCanvasElement {
  return document.getElementById('gameCanvas') as HTMLCanvasElement;
}

function startNewGame() {
  // Get starting level
  const levelSelect = getSelect('levelSelect');
  game.start(parseInt(levelSelect.value) as Level);
  lastFrameTime = performance.now();

  // Set game state
  isGameInProgress = true;
  isGamePaused = false;
  isShowingWelcomeScreen = false; // Hide welcome screen when game starts

  // Update UI
  getButton('startBtn').textContent = 'Restart';
  getButton('pauseBtn').disabled = false;
  getButton('pauseBtn').textContent = 'Pause';
  getSelect('levelSelect').disabled = true;

  // Start music
  sound?.startMusic(currentMusicStyle);
}

function stopGame() {
  isGameInProgress = false;

  // Stop music
  sound?.stopMusic();
  sound?.playSound('gameOver');

  // Update UI
  getButton('startBtn').textContent = 'Begin Game';
  getButton('pauseBtn').disabled = true;
  getSelect('levelSelect').disabled = false;

  // Check for high score after a short delay
  setTimeout(() => {
    checkAndRecordHighScore();
  }, 1000);
}

// ===========================================
// HIGH SCORES SYSTEM
// ===========================================

// Load high scores from localStorage
function loadHighScores() {
  try {
    const stored = localStorage.getItem('tetrisMaxHighScores');
    if (stored) {
      highScores = JSON.parse(stored);
    } else {
      // Initialize with default "Anonymous" entries (like original)
      highScores = [];
      for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
        highScores.push({
          name: 'Anonymous',
          score: 0,
          rows: 0,
          date: new Date('1970-01-01').toISOString(),
        });
      }
    }
  } catch (e) {
    console.log('Failed to load high scores:', e);
    highScores = [];
  }
}

// Save high scores to localStorage
function saveHighScores() {
  try {
    localStorage.setItem('tetrisMaxHighScores', JSON.stringify(highScores));
  } catch (e) {
    console.log('Failed to save high scores:', e);
  }
}

// Check if current score qualifies for high score list
function checkAndRecordHighScore() {
  if (game.getScore() === 0) return;

  lastHighScoreIndex = -1;

  // Find position in high score list
  for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
    if (game.getScore() >= highScores[i].score) {
      lastHighScoreIndex = i;

      const scoreIndex = i;
      const finalScore = game.getScore();
      const finalRows = game.getLinesCleared();

      // Play high score sound and wait for it to finish (like original: AsyncPlay(gHighScoreSnd))
      sound?.playSound('highscore');

      // Show HTML modal for name entry (original used Mac dialog)
      showHighScoreModal(scoreIndex, finalScore, finalRows);
      return; // Exit after finding high score position
    }
  }
}

// Show high scores popup (like original ShowHighs())
function showHighScores() {
  isShowingHighScores = true;
  // Pause game if in progress
  if (isGameInProgress && !isGamePaused) {
    isGamePaused = true;
    getButton('pauseBtn').textContent = 'Resume';
    sound?.stopMusic();
  }
  repaint();
}

// Hide high scores popup
function hideHighScores() {
  isShowingHighScores = false;
  repaint();
}

// Show high score name entry modal
function showHighScoreModal(
  scoreIndex: number,
  finalScore: number,
  finalRows: number
) {
  pendingHighScore = { scoreIndex, finalScore, finalRows };
  const overlay = getElement('highScoreModalOverlay');
  const input = getInput('highScoreNameInput');
  const startBtn = getButton('startBtn');
  if (overlay) overlay.removeAttribute('hidden');
  if (input) {
    input.value = 'Player';
    input.focus();
    input.select();
  }
  if (startBtn) startBtn.disabled = true;
}

// Submit high score name from modal and close it
function submitHighScoreName() {
  if (!pendingHighScore) return;
  const { scoreIndex, finalScore, finalRows } = pendingHighScore;
  pendingHighScore = null;
  const input = getInput('highScoreNameInput');
  const playerName =
    input && input.value && input.value.trim()
      ? input.value.trim().substring(0, 20)
      : 'Anonymous';
  const newEntry = {
    name: playerName,
    score: finalScore,
    rows: finalRows,
    date: new Date().toISOString(),
  };
  for (let j = HIGH_SCORE_COUNT - 1; j > scoreIndex; j--) {
    highScores[j] = highScores[j - 1];
  }
  highScores[scoreIndex] = newEntry;
  saveHighScores();
  const overlay = getElement('highScoreModalOverlay');
  const startBtn = getButton('startBtn');
  if (overlay) overlay.setAttribute('hidden', '');
  if (startBtn) startBtn.disabled = false;
  showHighScores();
}

// Show about popup
function showAbout() {
  isShowingAbout = true;
  // Pause game if in progress
  if (isGameInProgress && !isGamePaused) {
    isGamePaused = true;
    getButton('pauseBtn').textContent = 'Resume';
    sound?.stopMusic();
  }
  repaint();
}

// Hide about popup
function hideAbout() {
  isShowingAbout = false;
  repaint();
}

function togglePause() {
  if (!isGameInProgress) return;

  isGamePaused = !isGamePaused;

  getButton('pauseBtn').textContent = isGamePaused ? 'Resume' : 'Pause';

  if (isGamePaused) {
    sound?.playSound('pause');
    sound?.stopMusic();
  } else {
    // Close High Scores and About when resuming
    if (isShowingHighScores) {
      isShowingHighScores = false;
    }
    if (isShowingAbout) {
      isShowingAbout = false;
    }
    // Resume music (sound?.startMusic so it restarts even if user changed music during pause)
    sound?.startMusic(currentMusicStyle);
    lastFrameTime = performance.now();
  }

  // Redraw to show/hide pause overlay
  repaint();
}

// ===========================================
// TIMING
// ===========================================

function mainLoop(timestamp: number) {
  if (isGameInProgress && !isGamePaused) {
    // Calculate delta time
    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    game.tick(deltaTime);
    for (const event of game.getEvents()) {
      sound?.playSound(event);
    }
    if (game.isGameOver()) {
      stopGame();
    }
  }
  // Render
  repaint();

  requestAnimationFrame(mainLoop);
}

// ===========================================
// INITIALIZATION
// ===========================================

async function init() {
  const canvas = getCanvas();

  // Load original graphics from extracted PNG assets
  const sprites = await initSprites(
    currentBackgroundStyle,
    currentPiecesStyle,
    SCALE
  );

  // Initialize audio (load sound files)
  try {
    sound = await initSound(currentMusicStyle);
  } catch (e) {
    console.error('Failed to initialize audio', e);
  }

  draw = initDraw(canvas, SCALE, game, sprites);

  // Load high scores from localStorage
  loadHighScores();

  // Event listeners
  document.addEventListener('keydown', (e) => {
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
      togglePause();
      return;
    }

    if (isGameInProgress && !isGamePaused) {
      game.handleKeyDown(e.key);
    }
  });

  document.addEventListener('keyup', (e) => {
    game.handleKeyUp(e.key);
  });

  // Click on canvas to close high scores popup
  canvas.addEventListener('click', () => {
    if (isShowingHighScores) {
      hideHighScores();
    }
    if (isShowingAbout) {
      hideAbout();
    }
  });

  getButton('startBtn').addEventListener('click', () => {
    // Resume audio context on user interaction
    sound?.startMusic(currentMusicStyle);

    // Close popups if showing
    if (isShowingHighScores) {
      hideHighScores();
    }
    if (isShowingAbout) {
      hideAbout();
    }
    startNewGame();
  });

  getButton('pauseBtn').addEventListener('click', togglePause);
  getButton('musicBtn').addEventListener('click', () => {
    const gMusicOn = sound?.toggleMusic(isGameInProgress && !isGamePaused);
    // Update button text
    const musicBtn = getButton('musicBtn');
    musicBtn.textContent = gMusicOn ? 'Music: ON' : 'Music: OFF';
  });
  getButton('soundBtn').addEventListener('click', () => {
    const gSoundOn = sound?.toggleSound();
    // Update button text
    const soundBtn = getButton('soundBtn');
    soundBtn.textContent = gSoundOn
      ? 'Sound Effects: ON'
      : 'Sound Effects: OFF';
  });
  getButton('highScoresBtn').addEventListener('click', () => {
    if (isShowingHighScores) {
      hideHighScores();
    } else {
      hideAbout(); // Close About if open
      lastHighScoreIndex = -1; // Don't highlight any entry when viewing manually
      showHighScores();
    }
  });

  getButton('aboutBtn').addEventListener('click', () => {
    if (isShowingAbout) {
      hideAbout();
    } else {
      hideHighScores(); // Close High Scores if open
      showAbout();
    }
  });

  // High score name modal
  const highScoreModalOverlay = getElement('highScoreModalOverlay');
  const highScoreNameInput = getInput('highScoreNameInput');
  const highScoreModalOk = getButton('highScoreModalOk');
  highScoreModalOk.addEventListener('click', submitHighScoreName);
  if (highScoreNameInput) {
    highScoreNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitHighScoreName();
    });
  }
  if (highScoreModalOverlay) {
    highScoreModalOverlay.addEventListener('click', (e) => {
      if (e.target === highScoreModalOverlay) {
        submitHighScoreName();
      }
    });
  }

  // Asset selection listeners
  getSelect('piecesSelect').addEventListener('change', async (e) => {
    const style = (e?.target as HTMLSelectElement)?.value;
    if (isPieceStyle(style)) {
      currentPiecesStyle = style;
    }
    sprites.setPiecesImage(currentPiecesStyle);
    repaint();
  });

  getSelect('backgroundSelect').addEventListener('change', async (e) => {
    const style = (e?.target as HTMLSelectElement)?.value;
    if (isBGStyle(style)) {
      currentBackgroundStyle = style;
    }
    sprites.setBackgroundImages(currentBackgroundStyle);
    repaint();
  });

  getSelect('musicSelect').addEventListener('change', async (e) => {
    const wasPlaying = sound?.getIsPlaying();
    if (wasPlaying) {
      sound?.stopMusic();
    }
    const value = (e?.target as HTMLSelectElement)?.value;
    if (value === 'peter_wagner' || value === 'animal_instinct') {
      currentMusicStyle = value;
    }
    if (wasPlaying && isGameInProgress && !isGamePaused) {
      await sound?.startMusic(currentMusicStyle);
    }
  });

  // Initial draw
  repaint();

  // Start main loop
  lastFrameTime = performance.now();
  requestAnimationFrame(mainLoop);
}

function repaint() {
  draw?.({
    isShowingHighScores,
    lastHighScoreIndex,
    isShowingWelcomeScreen,
    isShowingAbout,
    isGameInProgress,
    isGamePaused,
    highScores,
  });
}

document.addEventListener('DOMContentLoaded', init);
