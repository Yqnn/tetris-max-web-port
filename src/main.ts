import './style.css';

import type { MusicStyle } from './sound';
import { initSound } from './sound';
import { initSprites, type PieceStyle, type BGStyle } from './sprites';
import { initGame } from './game';
import { initDraw } from './draw';
import { getCanvas, initHandlers, promptPlayerName, setState } from './ui';
import type { Level } from './game.constants';
import { addHighScore, isHighScore, loadHighScores } from './high-scores';
import type { HighScore } from './high-scores';

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
  let currentPiecesStyle: PieceStyle = 'default';
  let currentBackgroundStyle: BGStyle = 'default';
  let currentMusicStyle: MusicStyle = 'peter_wagner';
  let currentLevel: Level = 1;
  let highScores: HighScore[] = []; // Array of {name, score, rows, date}
  let lastHighScoreIndex = -1; // Index of player's latest high score entry
  let isShowingHighScores = false; // Whether high scores popup is visible
  let isShowingAbout = false; // Whether about popup is visible
  let isGameInProgress = false;
  let isGamePaused = false;
  let isShowingWelcomeScreen = true; // Show welcome screen until game starts
  let lastFrameTime = 0;

  const game = initGame();
  const sound = await initSound(currentMusicStyle);
  const sprites = await initSprites(
    currentBackgroundStyle,
    currentPiecesStyle,
    SCALE
  );
  const draw = initDraw(getCanvas(), SCALE, game, sprites);

  highScores = loadHighScores();

  const pauseGame = () => {
    isGamePaused = true;
    setState('paused');
    sound?.stopMusic();
  };

  initHandlers({
    onStart: () => {
      game.start(currentLevel);
      sound?.startMusic(currentMusicStyle);
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
        sound?.startMusic(currentMusicStyle);
        lastFrameTime = performance.now();
      }
    },
    onKeyUp: (key) => game.handleKeyUp(key),
    onKeyDown: (key) => game.handleKeyDown(key),
    onClick: () => {
      isShowingHighScores = false;
      isShowingAbout = false;
    },
    onToggleMusic: () => {
      const gMusicOn = sound?.toggleMusic(isGameInProgress && !isGamePaused);
      return gMusicOn ?? false;
    },
    onToggleSound: () => {
      const gSoundOn = sound?.toggleSound();
      return gSoundOn ?? false;
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
      currentLevel = level;
    },
    onSelectPieces: (pieces: PieceStyle) => {
      currentPiecesStyle = pieces;
      sprites.setPiecesImage(currentPiecesStyle);
    },
    onSelectBackground: (background: BGStyle) => {
      currentBackgroundStyle = background;
      sprites.setBackgroundImages(currentBackgroundStyle);
    },
    onSelectMusic: (music: MusicStyle) => {
      currentMusicStyle = music;
      const wasPlaying = sound?.getIsPlaying();
      if (wasPlaying) {
        sound?.stopMusic();
      }
      if (wasPlaying && isGameInProgress && !isGamePaused) {
        sound?.startMusic(currentMusicStyle);
      }
    },
  });

  const stopGame = () => {
    isGameInProgress = false;
    setState('ready');
    sound?.stopMusic();
    sound?.playSound('gameOver');
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
        stopGame();
      }
    }
    draw?.({
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
