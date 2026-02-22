import './style.css';

import type { MusicStyle } from './sound';
import { initSound } from './sound';
import { initSprites, type PieceStyle, type BGStyle } from './sprites';
import { initGame } from './game';
import { initDraw } from './draw';
import {
  getCanvas,
  initHandlers,
  promptPlayerName,
  setDisplayModeUI,
} from './ui';
import type { Level } from './game.constants';
import { addHighScore, isHighScore, loadHighScores } from './high-scores';
import type { HighScore } from './high-scores';
import { getLayout, type DisplayMode } from './display';
import { initSettings } from './settings';

/**
 * Tetris Max - Accurate Web Port
 * Ported from the original PowerPC Macintosh version
 *
 * This is a faithful recreation of the original game mechanics,
 * matching the exact behavior of GameLogic.c and Main.c
 */

const SCALE = 2;

async function init() {
  // State:
  const { setSetting, settings } = initSettings();

  let highScores: HighScore[] = []; // Array of {name, score, rows, date}
  let lastHighScoreIndex = -1; // Index of player's latest high score entry
  let isShowingHighScores = false; // Whether high scores popup is visible
  let isShowingAbout = false; // Whether about popup is visible
  let isGameInProgress = false;
  let isGamePaused = false;
  let isShowingWelcomeScreen = true; // Show welcome screen until game starts
  let lastFrameTime = 0;

  const game = initGame();
  const draw = initDraw(
    getCanvas(),
    SCALE,
    game,
    getLayout(settings.displayMode),
    settings.displayMode
  );
  const sprites = await initSprites(
    settings.backgroundStyle,
    settings.piecesStyle,
    SCALE,
    settings.displayMode
  );
  draw.setSprites(sprites);
  const sound = await initSound(
    settings.musicStyle,
    settings.isMusicOn,
    settings.isSoundOn
  );

  highScores = loadHighScores();

  const pauseGame = () => {
    isGamePaused = true;
    setState('paused');
    sound?.stopMusic();
  };

  const setState = initHandlers({
    initialSettings: settings,
    onStart: () => {
      if (isGameInProgress) {
        stopGame();
        return;
      }
      game.start(settings.level);
      sound?.startMusic(settings.musicStyle);
      isShowingHighScores = false;
      isShowingAbout = false;
      lastFrameTime = performance.now();
      isGameInProgress = true;
      isGamePaused = false;
      isShowingWelcomeScreen = false;
      setState('running');
    },
    onPause: () => {
      if (!isGameInProgress) return;
      if (!isGamePaused) {
        sound?.playSound('pause');
        pauseGame();
      } else {
        isGamePaused = false;
        setState('running');
        isShowingHighScores = false;
        isShowingAbout = false;
        sound?.startMusic(settings.musicStyle);
        lastFrameTime = performance.now();
      }
    },
    onKeyUp: (key) => {
      if (isGameInProgress && !isGamePaused) {
        game.handleKeyUp(key);
      }
    },
    onKeyDown: (key) => {
      if (isGameInProgress && !isGamePaused) {
        game.handleKeyDown(key);
      }
    },
    onClick: () => {
      isShowingHighScores = false;
      isShowingAbout = false;
    },
    onToggleMusic: () => {
      setSetting(
        'isMusicOn',
        sound?.toggleMusic(isGameInProgress && !isGamePaused) ?? false
      );
      return settings.isMusicOn;
    },
    onToggleSound: () => {
      setSetting('isSoundOn', sound?.toggleSound() ?? false);
      return settings.isSoundOn;
    },
    onShowHighScores: () => {
      if (isShowingHighScores) {
        isShowingHighScores = false;
      } else {
        isShowingAbout = false;
        lastHighScoreIndex = -1; // Don't highlight any entry when viewing manually
        isShowingHighScores = true;
        if (isGameInProgress && !isGamePaused) {
          pauseGame();
        }
      }
    },
    onShowAbout: () => {
      if (isShowingAbout) {
        isShowingAbout = false;
      } else {
        isShowingHighScores = false;
        isShowingAbout = true;
        if (isGameInProgress && !isGamePaused) {
          pauseGame();
        }
      }
    },
    onSelectLevel: (level: Level) => {
      setSetting('level', level);
    },
    onSelectPieces: (pieces: PieceStyle) => {
      setSetting('piecesStyle', pieces);
      sprites.setPiecesImage(settings.piecesStyle);
    },
    onSelectBackground: (background: BGStyle) => {
      setSetting('backgroundStyle', background);
      sprites.setBackgroundImages(settings.backgroundStyle);
    },
    onSelectMusic: (music: MusicStyle) => {
      setSetting('musicStyle', music);
      const wasPlaying = sound?.getIsPlaying();
      if (wasPlaying) {
        sound?.stopMusic();
      }
      if (wasPlaying && isGameInProgress && !isGamePaused) {
        sound?.startMusic(settings.musicStyle);
      }
    },
    onSelectDisplay: async (mode: DisplayMode) => {
      setSetting('displayMode', mode);
      // BW mode forces default pieces and background
      if (mode === 'bw') {
        setSetting('piecesStyle', 'default');
        setSetting('backgroundStyle', 'default');
      }
      setDisplayModeUI(mode);
      draw.setDisplayMode(mode);
      draw.setLayout(getLayout(mode));
      await sprites.setDisplayMode(mode, settings.piecesStyle);
    },
    initialDisplayMode: settings.displayMode,
  });

  const stopGame = () => {
    isGamePaused = false;
    isGameInProgress = false;
    setState('ready');
    sound?.stopMusic();
    if (isHighScore(highScores, game.getScore())) {
      setTimeout(() => {
        sound?.playSound('highscore');
        promptPlayerName((playerName) => {
          lastHighScoreIndex = addHighScore(highScores, {
            name: playerName,
            score: game.getScore(),
            rows: game.getLinesCleared(),
          });
          isShowingHighScores = true;
        });
      }, 1000);
    }
  };

  const mainLoop = (timestamp: number) => {
    if (isGameInProgress && !isGamePaused) {
      const deltaTime = timestamp - lastFrameTime;
      lastFrameTime = timestamp;
      game.tick(deltaTime);
      for (const event of game.getEvents()) {
        sound?.playSound(event);
      }
      if (game.isGameOver()) {
        sound?.playSound('gameOver');
        stopGame();
      }
    }
    draw.drawWindow({
      isShowingHighScores,
      lastHighScoreIndex,
      isShowingWelcomeScreen,
      isShowingAbout,
      isGameInProgress,
      isGamePaused,
      highScores,
    });
    requestAnimationFrame(mainLoop);
  };

  // Start main loop
  requestAnimationFrame(mainLoop);
}

document.addEventListener('DOMContentLoaded', init);
