import type { Sound } from './sound';

export type Piece = {
  height: number;
  offset: number;
  color: number;
  grid: number[][];
};

// Level speeds in ticks (exact from initGame)
export const LEVEL_SPEED = {
  1: 30,
  2: 20,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 7,
  8: 6,
  9: 5,
  10: 4, // Effectively 3.5 due to special handling
};

// Level thresholds - lines needed to advance (exact from initGame)
export const LEVEL_THRESHOLD = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 60,
  7: 70,
  8: 80,
  9: 90,
  10: 32000,
};
export type Level = keyof typeof LEVEL_THRESHOLD;

// Key repeat timing in ticks
export const ZIP_DELAY_TICKS = 10; // Wait before zip mode starts
export const ZIP_RATE_TICKS = 1; // Zip every tick
export const FREEFALL_RATE_TICKS = 2; // Freefall drop rate
export const SLOW_MOVE_TICKS = 15; // Slow movement delay

// Timing: 1 tick = 1/60 second = ~16.67ms
export const TICK_MS = 1000 / 60;
export const CLEAR_ANIM_TICKS = 10; // Original had 10 tick delay for yellow flash

export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;

// Scoring values (exact from reduceRows - NO level multiplier)
export const SCORE_1_LINE = 100;
export const SCORE_2_LINES = 300;
export const SCORE_3_LINES = 600;
export const SCORE_4_LINES = 1000;
export const SCORE_SAME_COLOR_BONUS = 2500;
export const SCORE_CLEAR_BOARD_BONUS = 10000;
export const PIECE_LIST: Piece[] = [
  [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [2, 2, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [3, 3, 3, 0],
    [0, 0, 3, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 4, 0],
    [4, 4, 4, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 5, 5, 0],
    [5, 5, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [6, 6, 0, 0],
    [0, 6, 6, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 7, 0, 0],
    [0, 7, 7, 0],
    [0, 7, 0, 0],
  ],
].map((grid, color) => ({
  height: BOARD_ROWS + 4 - 3,
  offset: Math.floor(BOARD_COLS / 2) - 2,
  color,
  grid,
}));

export type InternalGameState = {
  score: {
    currentScore: number;
    linesCleared: number;
    level: Level;
  };

  isGameOver: boolean;
  events: Sound[];

  board: number[][];

  currentPiece: Piece | null;
  nextPiece: Piece | null;

  // Timing (in ticks)
  timing: {
    lastDropTime: number;
    lastLeftTime: number;
    lastRightTime: number;
  };

  // Movement state
  movement: {
    zippingL: boolean;
    zippingR: boolean;
    zipNow: boolean;
    inFreefall: boolean;
    movePieceSlowly: boolean;
    downKeyActive: boolean;
    pushKeyActive: boolean;
  };

  // Row clearing animation state
  rowClearing: {
    rowsToClear: number[];
    clearAnimStartTime: number;
    clearAnimData: {
      dropped: number;
      bonus: boolean;
      wasDropOrFreefall?: boolean;
    } | null; // Stores bonus/score info during animation
  };

  // Hard drop animation state (original showed piece falling row by row)
  hardDrop: {
    isHardDropping: boolean;
    hardDropStartTime: number;
  };

  pendingDropScore: number; // Accumulated during drop, added when piece lands

  tick: {
    accumulator: number;
    count: number;
  };
};
