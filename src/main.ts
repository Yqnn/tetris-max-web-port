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

/**
 * Tetris Max - Accurate Web Port
 * Ported from the original PowerPC Macintosh version
 *
 * This is a faithful recreation of the original game mechanics,
 * matching the exact behavior of GameLogic.c and Main.c
 */

// ===========================================
// CONSTANTS (exact values from original)
// ===========================================

// Scale factor (2x from original 500x330 windowed mode)
const SCALE = 2;

const BOARD_COLS = 10;
const BOARD_ROWS = 20;

// Original windowed mode layout (from WIND 256: 500x330, and PositionGameElements)
const ORIGINAL = {
  WINDOW_WIDTH: 500,
  WINDOW_HEIGHT: 330,
  BLOCK_SIZE: 16,
  BOARD_X: 170,
  BOARD_Y: 5,
  NEXT_X: 24, // gBoardXOffset + gNextXOffset - 6*gBlockWidth = 170 + (-50) - 96
  NEXT_Y: 4, // BOARD_YOFFSET - 1
  NEXT_SIZE: 96, // 6 * 16
  SCORE_X: 380, // gBoardXOffset + gBoardWidth + 40 + 10 = 170 + 160 + 50
  SCORE_Y: 4,
  SCORE_WIDTH: 96,
  SCORE_HEIGHT: 60,
  SCORE_SPACING: 20,
};

// Scaled dimensions for rendering
const BLOCK_WIDTH = ORIGINAL.BLOCK_SIZE * SCALE;
const BLOCK_HEIGHT = ORIGINAL.BLOCK_SIZE * SCALE;

// Timing: 1 tick = 1/60 second = ~16.67ms
const TICK_MS = 1000 / 60;

// Level speeds in ticks (exact from InitGame)
const LEVEL_SPEED = {
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

// Level thresholds - lines needed to advance (exact from InitGame)
const LEVEL_THRESHOLD = {
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

// Scoring values (exact from ReduceRows - NO level multiplier)
const SCORE_1_LINE = 100;
const SCORE_2_LINES = 300;
const SCORE_3_LINES = 600;
const SCORE_4_LINES = 1000;
const SCORE_SAME_COLOR_BONUS = 2500;
const SCORE_CLEAR_BOARD_BONUS = 10000;

// Key repeat timing in ticks
const ZIP_DELAY_TICKS = 10; // Wait before zip mode starts
const ZIP_RATE_TICKS = 1; // Zip every tick
const FREEFALL_RATE_TICKS = 2; // Freefall drop rate
const SLOW_MOVE_TICKS = 15; // Slow movement delay

// ===========================================
// ORIGINAL GRAPHICS - Extracted from Mac Resource Fork
// Using actual Default Pieces and Default Backgrounds
// ===========================================

// Current asset selections
let currentPiecesStyle: PieceStyle = 'default';
let currentBackgroundStyle: BGStyle = 'default';
let currentMusicStyle: MusicStyle = 'peter_wagner';

let SOUND: Awaited<ReturnType<typeof initSound>> | null = null;
let SPRITES: Awaited<ReturnType<typeof initSprites>> | null = null;
// ===========================================
// TYPE DEFINITIONS (matching original structs)
// ===========================================

type Piece = {
  height: number;
  offset: number;
  color: number;
  grid: number[][];
};

type HighScore = {
  name: string;
  score: number;
  rows: number;
  date: string;
};

type PendingHighScore = {
  scoreIndex: number;
  finalScore: number;
  finalRows: number;
};

// ===========================================
// GAME STATE (matching original globals)
// ===========================================

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

// Board: gGameBoard[col][row] - column-major order like original
let gGameBoard: number[][] = [];

// Current piece state
let gCurrentPiece: Piece | null = null;
let gNextPiece: Piece | null = null;
let gPieceList: Piece[] = []; // 7 default piece templates

// Game state
let gGameInProgress = false;
let gGamePause = false;
let gCurrentScore = 0;
let gPendingDropScore = 0; // Accumulated during drop, added when piece lands
let gLinesCleared = 0;
let gCurrentLev: keyof typeof LEVEL_THRESHOLD = 1;

// High scores (10 entries max, stored in localStorage)
const HIGH_SCORE_COUNT = 10;
let gHighScores: HighScore[] = []; // Array of {name, score, rows, date}
let gLastHighScoreIndex = -1; // Index of player's latest high score entry
let gShowingHighScores = false; // Whether high scores popup is visible
let gPendingHighScore: PendingHighScore | null = null; // { scoreIndex, finalScore, finalRows } when high score name modal is open
let gShowingAbout = false; // Whether about popup is visible

// Timing (in ticks)
let gLastDropTime = 0;
let gLastLeftTime = 0;
let gLastRightTime = 0;

// Movement state
let gZippingL = false;
let gZippingR = false;
let gZipNow = false;
let gInFreefall = false;
let gMovePieceSlowly = false;
let gDownKeyActive = false;
let gPushKeyActive = false;

// Row clearing animation state
let gClearingRows = false;
let gRowsToClear: number[] = [];
let gClearAnimStartTime = 0;
let gClearAnimData: {
  dropped: number;
  bonus: boolean;
  wasDropOrFreefall?: boolean;
} | null = null; // Stores bonus/score info during animation
const CLEAR_ANIM_TICKS = 10; // Original had 10 tick delay for yellow flash

// Hard drop animation state (original showed piece falling row by row)
let gHardDropping = false;
let gHardDropStartTime = 0;

// Animation
let lastFrameTime = 0;
let tickAccumulator = 0;

// ===========================================
// PIECE SETUP (exact from SetupDefaultPieces)
// ===========================================

function SetupDefaultPieces() {
  gPieceList = [
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
}

// ===========================================
// PIECE OPERATIONS
// ===========================================

function CopyPiece(src: Piece): Piece {
  const dest: Piece = {
    height: src.height,
    offset: src.offset,
    color: src.color,
    grid: [],
  };
  for (let i = 0; i < 4; i++) {
    dest.grid[i] = [...src.grid[i]];
  }
  return dest;
}

// Clockwise rotation (exact from original RotateCw)
function RotateCw(color: number, grid: number[][]) {
  let ttype;
  switch (color) {
    case 0: // Square - no rotation
      return;
    case 1: // Long block (I-piece) - 4x4 rotation
      ttype = grid[1][0];
      grid[1][0] = grid[0][2];
      grid[0][2] = grid[2][3];
      grid[2][3] = grid[3][1];
      grid[3][1] = ttype;
      ttype = grid[2][0];
      grid[2][0] = grid[0][1];
      grid[0][1] = grid[1][3];
      grid[1][3] = grid[3][2];
      grid[3][2] = ttype;
      ttype = grid[1][1];
      grid[1][1] = grid[1][2];
      grid[1][2] = grid[2][2];
      grid[2][2] = grid[2][1];
      grid[2][1] = ttype;
      break;
    case 2:
    case 3:
    case 4:
    case 5:
    case 6: // L, J, S, Z, T pieces - 3x3 rotation
      ttype = grid[1][0];
      grid[1][0] = grid[1][2];
      grid[1][2] = grid[3][2];
      grid[3][2] = grid[3][0];
      grid[3][0] = ttype;
      ttype = grid[2][0];
      grid[2][0] = grid[1][1];
      grid[1][1] = grid[2][2];
      grid[2][2] = grid[3][1];
      grid[3][1] = ttype;
      break;
  }
}

// Counter-clockwise rotation (exact from original RotateCCw)
function RotateCCw(color: number, grid: number[][]) {
  for (let i = 0; i < 3; i++) {
    RotateCw(color, grid);
  }
}

// ===========================================
// COLLISION DETECTION (exact from InLegalPos)
// ===========================================

function InLegalPos(piece: Piece): boolean {
  const off = piece.offset;
  const ht = piece.height;

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (piece.grid[i][j]) {
        // Check horizontal bounds
        if (i + off >= BOARD_COLS || i + off < 0) {
          return false;
        }
        // Check bottom bound (ht - j is the board row)
        if (ht - j < 0) {
          return false;
        }
        // Check collision with existing blocks
        if (ht - j < BOARD_ROWS) {
          if (gGameBoard[i + off][ht - j]) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

// ===========================================
// PIECE PLACEMENT (exact from PlacePiece)
// ===========================================

function PlacePiece(piece: Piece): boolean {
  let ok = true;

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (piece.grid[i][j]) {
        if (piece.height - j < BOARD_ROWS) {
          gGameBoard[i + piece.offset][piece.height - j] = piece.grid[i][j];
        } else {
          ok = false;
        }
      }
    }
  }
  return ok;
}

// ===========================================
// ROW CLEARING (exact from ReduceRows)
// ===========================================

function ReduceRows(wasDropOrFreefall: boolean) {
  let bonus = false;
  const rowsToClear = [];

  // Play piece placement sound (exact from original)
  if (wasDropOrFreefall) {
    SOUND?.playSound('drop');
  } else {
    SOUND?.playSound('stick');
  }

  // Find full rows
  for (let j = 0; j < BOARD_ROWS; j++) {
    let rowFull = true;
    let firstColor = 0;
    let sameColor = true;

    for (let i = 0; i < BOARD_COLS; i++) {
      if (!gGameBoard[i][j]) {
        rowFull = false;
        break;
      }
      if (firstColor === 0) {
        firstColor = gGameBoard[i][j];
      } else if (gGameBoard[i][j] !== firstColor) {
        sameColor = false;
      }
    }

    if (rowFull) {
      rowsToClear.push(j);
      if (sameColor) {
        bonus = true; // All same color bonus
      }
    }
  }

  const dropped = rowsToClear.length;

  if (dropped > 0) {
    // Start row clearing animation
    gClearingRows = true;
    gRowsToClear = rowsToClear;
    gClearAnimStartTime = getTicks();
    gClearAnimData = { dropped, bonus, wasDropOrFreefall };

    // Play clear sound immediately
    if (dropped === 1) SOUND?.playSound('clear1');
    else if (dropped === 2) SOUND?.playSound('clear2');
    else if (dropped === 3) SOUND?.playSound('clear3');
    else if (dropped === 4) SOUND?.playSound('clear4');
  } else {
    // No rows to clear, spawn next piece immediately
    resetMovementFlags();
    StartNextPiece();
  }
}

function finishRowClearing() {
  if (!gClearAnimData) {
    return;
  }
  // Called after the yellow flash animation completes
  const { dropped, bonus } = gClearAnimData;

  // Calculate score (no level multiplier in original!)
  if (dropped === 1) gCurrentScore += SCORE_1_LINE;
  else if (dropped === 2) gCurrentScore += SCORE_2_LINES;
  else if (dropped === 3) gCurrentScore += SCORE_3_LINES;
  else if (dropped === 4) gCurrentScore += SCORE_4_LINES;

  // Remove rows (from top to bottom to maintain indices)
  gRowsToClear.sort((a, b) => b - a);
  for (const row of gRowsToClear) {
    // Shift all rows above down
    for (let j = row; j < BOARD_ROWS - 1; j++) {
      for (let i = 0; i < BOARD_COLS; i++) {
        gGameBoard[i][j] = gGameBoard[i][j + 1];
      }
    }
    // Clear top row
    for (let i = 0; i < BOARD_COLS; i++) {
      gGameBoard[i][BOARD_ROWS - 1] = 0;
    }
  }

  gLinesCleared += dropped;

  // Check for board clear bonus
  let boardEmpty = true;
  let tbonus = false;
  for (let i = 0; i < BOARD_COLS && boardEmpty; i++) {
    for (let j = 0; j < BOARD_ROWS && boardEmpty; j++) {
      if (gGameBoard[i][j]) {
        boardEmpty = false;
      }
    }
  }

  if (boardEmpty) {
    tbonus = true;
    gCurrentScore += SCORE_CLEAR_BOARD_BONUS;
    SOUND?.playSound('bigBonus');
  }

  if (bonus) {
    gCurrentScore += SCORE_SAME_COLOR_BONUS;
    if (!tbonus) {
      SOUND?.playSound('smallBonus');
    }
  }

  // Check for level up
  if (gLinesCleared >= LEVEL_THRESHOLD[gCurrentLev] && gCurrentLev < 10) {
    gCurrentLev++;
    if (!bonus && !tbonus) {
      SOUND?.playSound('newLevel');
    }
  }

  // Clear animation state
  gClearingRows = false;
  gRowsToClear = [];
  gClearAnimData = null;

  // Reset movement flags and spawn next piece
  resetMovementFlags();
  StartNextPiece();
}

function resetMovementFlags() {
  gDownKeyActive = false;
  gPushKeyActive = false;
  gInFreefall = false;
  gZippingL = false;
  gZippingR = false;
  gZipNow = false;
  gMovePieceSlowly = false;
  gHardDropping = false;
}

function drawClearingAnimation() {
  // Draw yellow flash over rows being cleared (like original gYellowRGB)
  if (!ctx) {
    return;
  }
  ctx.fillStyle = 'rgb(255, 255, 0)';
  for (const row of gRowsToClear) {
    const y = BOARD_Y + (BOARD_ROWS - 1 - row) * BLOCK_HEIGHT;
    ctx.fillRect(BOARD_X, y, BOARD_WIDTH, BLOCK_HEIGHT);
  }
}

// ===========================================
// NEXT PIECE
// ===========================================

function StartNextPiece() {
  if (gNextPiece === null) {
    // First piece of game
    gNextPiece = CopyPiece(gPieceList[Math.floor(Math.random() * 7)]);
  }

  // Current piece becomes next piece
  gCurrentPiece = gNextPiece;
  gCurrentPiece.height = BOARD_ROWS + 4 - 3; // Reset to starting height (21)
  gCurrentPiece.offset = Math.floor(BOARD_COLS / 2) - 2; // Center (3)

  // Generate new next piece
  gNextPiece = CopyPiece(gPieceList[Math.floor(Math.random() * 7)]);

  // Check if game over (piece can't be placed)
  if (!InLegalPos(gCurrentPiece)) {
    StopGame();
    return false;
  }

  gLastDropTime = getTicks();
  // Next piece is drawn by DrawWindow() in MainLoop
  return true;
}

// ===========================================
// GAME LOOP (exact from AnimateActivePiece)
// ===========================================

function AnimateActivePiece() {
  if (!gCurrentPiece) {
    return;
  }
  const currentTicks = getTicks();

  // Wait 10 ticks for zip mode to take effect
  if (
    currentTicks - gLastLeftTime >= ZIP_DELAY_TICKS &&
    gZippingL &&
    !gZipNow
  ) {
    gZipNow = true;
  }
  if (
    currentTicks - gLastRightTime >= ZIP_DELAY_TICKS &&
    gZippingR &&
    !gZipNow
  ) {
    gZipNow = true;
  }

  // Zip left if it's time
  if (currentTicks - gLastLeftTime >= ZIP_RATE_TICKS && gZippingL && gZipNow) {
    gLastLeftTime = currentTicks;
    gCurrentPiece.offset--;
    if (!InLegalPos(gCurrentPiece)) {
      gCurrentPiece.offset++;
    }
  }

  // Zip right if it's time
  if (currentTicks - gLastRightTime >= ZIP_RATE_TICKS && gZippingR && gZipNow) {
    gLastRightTime = currentTicks;
    gCurrentPiece.offset++;
    if (!InLegalPos(gCurrentPiece)) {
      gCurrentPiece.offset--;
    }
  }

  // Determine if it's time to drop
  let shouldDrop = false;
  const levelSpeed = LEVEL_SPEED[gCurrentLev];

  if (gInFreefall) {
    // Freefall mode: drop every 2 ticks
    shouldDrop = currentTicks - gLastDropTime >= FREEFALL_RATE_TICKS;
  } else if (gMovePieceSlowly) {
    // Slow move mode: 15 tick delay before locking
    shouldDrop = currentTicks - gLastDropTime >= SLOW_MOVE_TICKS;
  } else {
    // Normal drop based on level speed
    shouldDrop = currentTicks - gLastDropTime >= levelSpeed;

    // Level 10 special handling (effectively 3.5 ticks)
    if (gCurrentLev === 10 && gCurrentPiece.height % 2 === 0) {
      shouldDrop = currentTicks - gLastDropTime >= levelSpeed - 1;
    }
  }

  if (shouldDrop) {
    gCurrentPiece.height--;

    if (gInFreefall) {
      gPendingDropScore += 1; // Point for freefall (added when piece lands)
    }

    if (InLegalPos(gCurrentPiece)) {
      gMovePieceSlowly = false;
    } else {
      gCurrentPiece.height++;

      if (gMovePieceSlowly || gInFreefall) {
        const wasFreefall = gInFreefall;
        gMovePieceSlowly = false;
        // Add pending drop score when piece lands
        gCurrentScore += gPendingDropScore;
        gPendingDropScore = 0;
        if (PlacePiece(gCurrentPiece)) {
          ReduceRows(wasFreefall);
          // StartNextPiece is now called by ReduceRows after animation
        } else {
          StopGame();
        }
      } else {
        // Enter slow move mode (grace period before lock)
        gMovePieceSlowly = true;
      }
    }

    gLastDropTime = currentTicks;
  }
}

// ===========================================
// RENDERING (single canvas like original)
// ===========================================

// Scaled positions
const BOARD_X = ORIGINAL.BOARD_X * SCALE;
const BOARD_Y = ORIGINAL.BOARD_Y * SCALE;
const BOARD_WIDTH = BOARD_COLS * BLOCK_WIDTH;
const BOARD_HEIGHT = BOARD_ROWS * BLOCK_HEIGHT;
const NEXT_X = ORIGINAL.NEXT_X * SCALE;
const NEXT_Y = ORIGINAL.NEXT_Y * SCALE;
const NEXT_SIZE = ORIGINAL.NEXT_SIZE * SCALE;
const SCORE_X = ORIGINAL.SCORE_X * SCALE;
const SCORE_Y = ORIGINAL.SCORE_Y * SCALE;
const SCORE_WIDTH = ORIGINAL.SCORE_WIDTH * SCALE;
const SCORE_HEIGHT = ORIGINAL.SCORE_HEIGHT * SCALE;
const SCORE_SPACING = ORIGINAL.SCORE_SPACING * SCALE;

function DrawWindow() {
  if (!ctx) {
    return;
  }

  // Fill with background pattern (scaled 2x)
  const pattern = SPRITES?.getBackgroundImage(gCurrentLev - 1);
  if (pattern) {
    ctx.fillStyle = pattern;
    if (canvas) {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Draw Next box
  DrawNextBox();

  // Draw main board area
  DrawBoardArea();

  // Draw score boxes
  DrawScoreBoxes();

  // Draw high scores popup if visible
  if (gShowingHighScores) {
    drawHighScoresPopup();
  }

  if (gShowingAbout) {
    drawAboutPopup();
  }
}

function DrawNextBox() {
  if (!ctx) {
    return;
  }

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(NEXT_X, NEXT_Y, NEXT_SIZE, NEXT_SIZE);

  // White/blue frame
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = SCALE;
  ctx.strokeRect(NEXT_X + 1, NEXT_Y + 1, NEXT_SIZE - 2, NEXT_SIZE - 2);

  // "Next:" label
  ctx.fillStyle = '#FFFF00';
  ctx.font = `${9 * SCALE}px Geneva, Helvetica, sans-serif`;
  ctx.fillText('Next:', NEXT_X + 3 * SCALE, NEXT_Y + 12 * SCALE);

  // Draw next piece
  if (gNextPiece && gNextPiece.grid) {
    // Piece centering offsets (from original DrawNext)
    let xOffset = 0;
    let yOffset = 0;

    switch (gNextPiece.color) {
      case 1:
        xOffset = BLOCK_WIDTH / 2;
        break; // Long piece
      case 2:
        xOffset = -BLOCK_WIDTH;
        yOffset = BLOCK_WIDTH / 2;
        break; // J piece
      case 6:
        xOffset = -BLOCK_WIDTH / 2;
        break; // T piece
      case 3:
      case 4:
      case 5:
        yOffset = BLOCK_WIDTH / 2;
        break; // L, S, Z
    }

    const baseX = NEXT_X + BLOCK_WIDTH + xOffset;
    const baseY = NEXT_Y + BLOCK_HEIGHT + yOffset;

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (gNextPiece.grid[i] && gNextPiece.grid[i][j]) {
          const x = baseX + i * BLOCK_WIDTH;
          const y = baseY + j * BLOCK_HEIGHT;
          const colorIndex = gNextPiece.color;

          const piecesImage = SPRITES?.getPiecesImage(colorIndex);
          if (colorIndex >= 0 && colorIndex < 7 && piecesImage) {
            ctx.drawImage(piecesImage, x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
          }
        }
      }
    }
  }
}

function DrawBoardArea() {
  // Show welcome screen if game hasn't started yet
  if (gShowWelcomeScreen) {
    DrawWelcome();
    return;
  }

  if (!ctx) {
    return;
  }

  // Black background for board
  ctx.fillStyle = '#000000';
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);

  // Draw placed blocks
  DrawBoard();

  // Draw current piece (but not during row clearing animation)
  if (gCurrentPiece && gGameInProgress && !gClearingRows) {
    DrawPiece();
  }

  // Draw yellow flash during row clearing animation
  if (gClearingRows && gRowsToClear.length > 0) {
    drawClearingAnimation();
  }

  // White frame around board
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = SCALE;
  ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD_WIDTH + 2, BOARD_HEIGHT + 2);

  // Draw pause or game over overlay
  if (gGamePause) {
    drawOverlayScreen('pause');
  } else if (!gGameInProgress && gCurrentPiece) {
    drawOverlayScreen('gameover');
  }
}

function DrawScoreBoxes() {
  if (!ctx) {
    return;
  }
  // Original: each box frame is 98x63 pixels (PICT 260/261/262)
  // Values drawn in gGrayRGB (RGB 20000/65535 ≈ 30% = #4E4E4E)
  // Values: 18pt normal, right-aligned at x=89, y=50

  const frameImages = [
    SPRITES?.getMainSprite('scoreFrame'),
    SPRITES?.getMainSprite('levelFrame'),
    SPRITES?.getMainSprite('rowsFrame'),
  ];
  const values = [gCurrentScore, gCurrentLev, gLinesCleared];

  // Frame dimensions from PICT (98x63), scale to our display
  const FRAME_WIDTH = 98 * SCALE;
  const FRAME_HEIGHT = 63 * SCALE;

  for (let i = 0; i < 3; i++) {
    const boxY = SCORE_Y + i * (SCORE_HEIGHT + SCORE_SPACING);
    const frameImg = frameImages[i];

    // Draw the extracted frame image (contains label and decorative border)
    if (frameImg?.complete) {
      // Draw frame scaled to match our 2x display
      ctx.drawImage(frameImg, SCORE_X, boxY, FRAME_WIDTH, FRAME_HEIGHT);
    } else {
      // Fallback: simple black box with white frame
      ctx.fillStyle = '#000000';
      ctx.fillRect(SCORE_X, boxY, SCORE_WIDTH, SCORE_HEIGHT);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = SCALE;
      ctx.strokeRect(
        SCORE_X + SCALE * 0.5,
        boxY + SCALE * 0.5,
        SCORE_WIDTH - SCALE,
        SCORE_HEIGHT - SCALE
      );
    }

    // Value (gray, exactly like original - right aligned at x=89, y=50)
    // Original gGrayRGB = RGB(20000, 20000, 20000) = #4E4E4E
    ctx.fillStyle = '#4E4E4E';
    ctx.font = `${18 * SCALE}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'right';
    ctx.fillText(String(values[i]), SCORE_X + 89 * SCALE, boxY + 50 * SCALE);
  }

  ctx.textAlign = 'left';
}

let gShowWelcomeScreen = true; // Show welcome screen until game starts

// Draw welcome screen (original PICT 258) - shown before game starts
function DrawWelcome() {
  if (!ctx) {
    return;
  }
  // Draw welcome image filling the board area
  const welcomeImage = SPRITES?.getMainSprite('welcome');
  if (welcomeImage?.complete) {
    // Welcome image is 160x320 (board size), scale to our 2x display
    ctx.drawImage(welcomeImage, BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);
  } else {
    // Fallback: black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);
  }

  // White frame around board (like original)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = SCALE;
  ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD_WIDTH + 2, BOARD_HEIGHT + 2);
}

// Draw pause/game over overlay using extracted original images (scaled)
function drawOverlayScreen(type: 'pause' | 'gameover') {
  if (!ctx) {
    return;
  }
  // Original rect: from row 7 to row 12 (from top), full board width
  const overlayX = BOARD_X;
  const overlayY = BOARD_Y + 7 * BLOCK_HEIGHT;
  const overlayWidth = BOARD_WIDTH;
  const overlayHeight = 5 * BLOCK_HEIGHT;

  const img = SPRITES?.getMainSprite(type === 'pause' ? 'pause' : 'gameOver');

  if (img?.complete) {
    // Draw the original extracted image scaled 2x
    ctx.drawImage(img, overlayX, overlayY, overlayWidth, overlayHeight);
  } else {
    // Fallback if images not loaded
    ctx.fillStyle = '#000066';
    ctx.fillRect(overlayX, overlayY, overlayWidth, overlayHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${16 * SCALE}px Geneva, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      type === 'pause' ? 'PAUSED' : 'GAME OVER',
      overlayX + overlayWidth / 2,
      overlayY + overlayHeight / 2
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function DrawBoard() {
  if (!gGameBoard) return;

  for (let i = 0; i < BOARD_COLS; i++) {
    if (!gGameBoard[i]) continue;
    for (let j = 0; j < BOARD_ROWS; j++) {
      if (gGameBoard[i][j]) {
        const colorIndex = gGameBoard[i][j] - 1;
        if (colorIndex >= 0 && colorIndex < 7) {
          DrawBlockAt(
            BOARD_X + i * BLOCK_WIDTH,
            BOARD_Y + (BOARD_ROWS - 1 - j) * BLOCK_HEIGHT,
            colorIndex
          );
        }
      }
    }
  }
}

function DrawPiece() {
  if (!gCurrentPiece || !gCurrentPiece.grid) return;

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (gCurrentPiece.grid[i] && gCurrentPiece.grid[i][j]) {
        const boardCol = i + gCurrentPiece.offset;
        const boardRow = gCurrentPiece.height - j;

        // Only draw if within valid board bounds
        if (
          boardRow >= 0 &&
          boardRow < BOARD_ROWS &&
          boardCol >= 0 &&
          boardCol < BOARD_COLS
        ) {
          const colorIndex = gCurrentPiece.grid[i][j] - 1;
          if (colorIndex >= 0 && colorIndex < 7) {
            DrawBlockAt(
              BOARD_X + boardCol * BLOCK_WIDTH,
              BOARD_Y + (BOARD_ROWS - 1 - boardRow) * BLOCK_HEIGHT,
              colorIndex
            );
          }
        }
      }
    }
  }
}

// Note: Ghost piece (landing preview) was NOT a feature in the original 1994 Tetris Max
// It became standard only after the Tetris Guideline was established in 2001

function DrawBlockAt(x: number, y: number, colorIndex: number) {
  if (!ctx) {
    return;
  }
  // Use pre-rendered block graphics scaled
  const piecesImage = SPRITES?.getPiecesImage(colorIndex);
  if (piecesImage) {
    ctx.drawImage(piecesImage, x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
  }
}

// ===========================================
// INPUT HANDLING (exact from HandleKeyDown/Up)
// ===========================================

function HandleKeyDown(key: string) {
  if (!gGameInProgress || gGamePause) return;

  // Convert to lowercase
  key = key.toLowerCase();

  // Block all input during hard drop (original was blocking while loop)
  // and during row clearing animation
  if (gHardDropping || gClearingRows) return;

  if (gCurrentPiece) {
    // Rotate counter-clockwise (K key)
    if (key === 'k') {
      RotateCCw(gCurrentPiece.color, gCurrentPiece.grid);
      if (!InLegalPos(gCurrentPiece)) {
        RotateCw(gCurrentPiece.color, gCurrentPiece.grid);
      }
    }

    // Rotate clockwise (I key or Up arrow)
    if (key === 'i' || key === 'arrowup') {
      RotateCw(gCurrentPiece.color, gCurrentPiece.grid);
      if (!InLegalPos(gCurrentPiece)) {
        RotateCCw(gCurrentPiece.color, gCurrentPiece.grid);
      }
    }

    // Push/Freefall (M key)
    if (key === 'm' && !gPushKeyActive) {
      gInFreefall = true;
      gPushKeyActive = true;
      gZippingR = false;
      gZippingL = false;
      gZipNow = false;
    }

    // Move left (J key or Left arrow)
    if (key === 'j' || key === 'arrowleft') {
      gZippingR = false;
      if (!gZippingL) {
        gZippingL = true;
        gLastLeftTime = getTicks();
        gCurrentPiece.offset--;
        if (!InLegalPos(gCurrentPiece)) {
          gCurrentPiece.offset++;
        }
      }
    }

    // Move right (L key or Right arrow)
    if (key === 'l' || key === 'arrowright') {
      gZippingL = false;
      if (!gZippingR) {
        gZippingR = true;
        gLastRightTime = getTicks();
        gCurrentPiece.offset++;
        if (!InLegalPos(gCurrentPiece)) {
          gCurrentPiece.offset--;
        }
      }
    }
  }

  // Hard drop (Space or Down arrow) - exact from original HandleKeyDown
  // Original shows animated drop row by row, then places piece
  if (
    (key === ' ' || key === 'arrowdown') &&
    !gDownKeyActive &&
    !gHardDropping
  ) {
    gZippingR = false;
    gZippingL = false;
    gDownKeyActive = true;
    gMovePieceSlowly = false;

    // Start animated hard drop (like original - drops row by row with visual)
    gHardDropping = true;
    gHardDropStartTime = getTicks();
  }
}

// Process animated hard drop (called from game loop)
function processHardDrop() {
  if (!gHardDropping || !gCurrentPiece) return;

  // Drop one row per tick (original had small delay between rows)
  const currentTicks = getTicks();
  if (currentTicks - gHardDropStartTime >= 1) {
    gHardDropStartTime = currentTicks;

    gCurrentPiece.height--;
    gPendingDropScore += 1; // Point for hard drop (added when piece lands)

    if (!InLegalPos(gCurrentPiece)) {
      // Hit bottom or collision
      gPendingDropScore -= 1; // Don't count the illegal move
      gCurrentPiece.height++;
      gHardDropping = false;

      // Add pending drop score when piece lands
      gCurrentScore += gPendingDropScore;
      gPendingDropScore = 0;

      if (PlacePiece(gCurrentPiece)) {
        ReduceRows(true); // true = was a drop
      } else {
        StopGame();
      }
      gLastDropTime = getTicks();
    }
  }
}

function HandleKeyUp(key: string) {
  key = key.toLowerCase();

  if (key === 'j' || key === 'arrowleft') {
    gZippingL = false;
    gZipNow = false;
  }
  if (key === 'l' || key === 'arrowright') {
    gZippingR = false;
    gZipNow = false;
  }
  if (key === 'm') {
    gInFreefall = false; // Stop freefall when key released (like original)
    gPushKeyActive = false;
  }
  if (key === ' ' || key === 'arrowdown') {
    gDownKeyActive = false;
  }
}

// ===========================================
// GAME CONTROL
// ===========================================

function InitGame() {
  // Initialize board (column-major like original)
  gGameBoard = [];
  for (let i = 0; i < BOARD_COLS; i++) {
    gGameBoard[i] = [];
    for (let j = 0; j < BOARD_ROWS; j++) {
      gGameBoard[i][j] = 0;
    }
  }

  // Setup piece templates
  SetupDefaultPieces();

  // Reset game state
  gCurrentScore = 0;
  gPendingDropScore = 0;
  gLinesCleared = 0;
  gCurrentPiece = null;
  gNextPiece = null;

  // Reset movement flags
  gZippingL = false;
  gZippingR = false;
  gZipNow = false;
  gInFreefall = false;
  gMovePieceSlowly = false;
  gDownKeyActive = false;
  gPushKeyActive = false;
  gHardDropping = false;
}

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
): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

function getInput(id: 'highScoreNameInput'): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function getElement(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function StartNewGame() {
  // Get starting level
  const levelSelect = getSelect('levelSelect');
  gCurrentLev = parseInt(levelSelect.value) as keyof typeof LEVEL_THRESHOLD;

  // Initialize game
  InitGame();

  // Set game state
  gGameInProgress = true;
  gGamePause = false;
  gShowWelcomeScreen = false; // Hide welcome screen when game starts

  // Spawn first piece
  gNextPiece = CopyPiece(gPieceList[Math.floor(Math.random() * 7)]);
  StartNextPiece();

  // Update UI
  getButton('startBtn').textContent = 'Restart';
  getButton('pauseBtn').disabled = false;
  getButton('pauseBtn').textContent = 'Pause';
  getSelect('levelSelect').disabled = true;

  // Start timing
  gLastDropTime = getTicks();
  lastFrameTime = performance.now();
  tickAccumulator = 0;

  // Start music
  SOUND?.startMusic(currentMusicStyle);
}

function StopGame() {
  gGameInProgress = false;

  // Stop music
  SOUND?.stopMusic();
  SOUND?.playSound('gameOver');

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
      gHighScores = JSON.parse(stored);
    } else {
      // Initialize with default "Anonymous" entries (like original)
      gHighScores = [];
      for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
        gHighScores.push({
          name: 'Anonymous',
          score: 0,
          rows: 0,
          date: new Date('1970-01-01').toISOString(),
        });
      }
    }
  } catch (e) {
    console.log('Failed to load high scores:', e);
    gHighScores = [];
  }
}

// Save high scores to localStorage
function saveHighScores() {
  try {
    localStorage.setItem('tetrisMaxHighScores', JSON.stringify(gHighScores));
  } catch (e) {
    console.log('Failed to save high scores:', e);
  }
}

// Check if current score qualifies for high score list
async function checkAndRecordHighScore() {
  if (gCurrentScore === 0) return;

  gLastHighScoreIndex = -1;

  // Find position in high score list
  for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
    if (gCurrentScore >= gHighScores[i].score) {
      gLastHighScoreIndex = i;

      // Store score info before async operations
      const scoreIndex = i;
      const finalScore = gCurrentScore;
      const finalRows = gLinesCleared;

      // Play high score sound and wait for it to finish (like original: AsyncPlay(gHighScoreSnd))
      SOUND?.playSound('highscore');

      // Show HTML modal for name entry (original used Mac dialog)
      showHighScoreModal(scoreIndex, finalScore, finalRows);
      return; // Exit after finding high score position
    }
  }
}

// Format date like original (short date format)
function formatDate(isoDate: string) {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-UK', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '--';
  }
}

// Show high scores popup (like original ShowHighs())
function showHighScores() {
  gShowingHighScores = true;
  // Pause game if in progress
  if (gGameInProgress && !gGamePause) {
    gGamePause = true;
    getButton('pauseBtn').textContent = 'Resume';
    SOUND?.stopMusic();
  }
  DrawWindow();
}

// Hide high scores popup
function hideHighScores() {
  gShowingHighScores = false;
  DrawWindow();
}

// Show high score name entry modal (replaces prompt)
function showHighScoreModal(
  scoreIndex: number,
  finalScore: number,
  finalRows: number
) {
  gPendingHighScore = { scoreIndex, finalScore, finalRows };
  const overlay = document.getElementById(
    'highScoreModalOverlay'
  ) as HTMLDivElement;
  const input = getInput('highScoreNameInput');
  const startBtn = getButton('startBtn');
  // Use current piece style for modal tetromino texture
  document.documentElement.style.setProperty(
    '--highscore-piece-url',
    `url('pieces/${currentPiecesStyle}.png')`
  );
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
  if (!gPendingHighScore) return;
  const { scoreIndex, finalScore, finalRows } = gPendingHighScore;
  gPendingHighScore = null;
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
    gHighScores[j] = gHighScores[j - 1];
  }
  gHighScores[scoreIndex] = newEntry;
  saveHighScores();
  const overlay = getElement('highScoreModalOverlay');
  const startBtn = getButton('startBtn');
  if (overlay) overlay.setAttribute('hidden', '');
  if (startBtn) startBtn.disabled = false;
  showHighScores();
}

// Show about popup
function showAbout() {
  gShowingAbout = true;
  // Pause game if in progress
  if (gGameInProgress && !gGamePause) {
    gGamePause = true;
    getButton('pauseBtn').textContent = 'Resume';
    SOUND?.stopMusic();
  }
  DrawWindow();
}

// Hide about popup
function hideAbout() {
  gShowingAbout = false;
  DrawWindow();
}

// Draw about popup overlay (image only, Mac OS 9 style border)
function drawAboutPopup() {
  if (!gShowingAbout) return;

  if (!canvas || !ctx) {
    return;
  }

  // About image: use loaded image size (reference ~700x410 / 800x480)
  const IMG_WIDTH = 477;
  const IMG_HEIGHT = 244;
  const PADDING = 3; // No padding around image
  const BORDER_WIDTH = 3; // Same as high scores (3px bevel)

  const drawW = IMG_WIDTH * SCALE;
  const drawH = IMG_HEIGHT * SCALE;
  const POPUP_WIDTH = drawW + PADDING * 2 * SCALE + BORDER_WIDTH * 2 * SCALE;
  const POPUP_HEIGHT = drawH + PADDING * 2 * SCALE + BORDER_WIDTH * 2 * SCALE;
  const POPUP_X = SCALE * Math.floor((canvas.width - POPUP_WIDTH) / 2 / SCALE);
  const POPUP_Y =
    SCALE * Math.floor((canvas.height - POPUP_HEIGHT) / 2 / SCALE);

  // Drop shadow
  ctx.fillStyle = '#000000';
  ctx.fillRect(
    POPUP_X + 2 * SCALE,
    POPUP_Y + 2 * SCALE,
    POPUP_WIDTH - SCALE,
    POPUP_HEIGHT - SCALE
  );

  // 3D beveled border (same as high scores: 3 layers, 1px each)
  ctx.fillStyle = '#000000';
  ctx.fillRect(POPUP_X, POPUP_Y, POPUP_WIDTH, POPUP_HEIGHT);

  const borderColors = {
    topLeft: ['#000000', '#BBBBBB', '#FFFFFF'],
    bottomRight: ['#000000', '#555555', '#999999'],
  };

  for (let i = 0; i < 3; i++) {
    const offset = i;

    // Top edge
    ctx.fillStyle = borderColors.topLeft[i];
    ctx.fillRect(
      POPUP_X + offset * SCALE,
      POPUP_Y + offset * SCALE,
      POPUP_WIDTH - offset * 2 * SCALE,
      SCALE
    );

    // Left edge
    ctx.fillRect(
      POPUP_X + offset * SCALE,
      POPUP_Y + offset * SCALE,
      SCALE,
      POPUP_HEIGHT - offset * 2 * SCALE
    );

    // Bottom edge
    ctx.fillStyle = borderColors.bottomRight[i];
    ctx.fillRect(
      POPUP_X + offset * SCALE,
      POPUP_Y + POPUP_HEIGHT - offset * SCALE - SCALE,
      POPUP_WIDTH - offset * 2 * SCALE,
      SCALE
    );

    // Right edge
    ctx.fillRect(
      POPUP_X + POPUP_WIDTH - offset * SCALE - SCALE,
      POPUP_Y + offset * SCALE,
      SCALE,
      POPUP_HEIGHT - offset * 2 * SCALE
    );
  }

  // Draw about image centered
  const CONTENT_X = POPUP_X + BORDER_WIDTH * SCALE + PADDING * SCALE;
  const CONTENT_Y = POPUP_Y + BORDER_WIDTH * SCALE + PADDING * SCALE;

  const aboutImage = SPRITES?.getMainSprite('about');
  if (aboutImage?.complete) {
    ctx.drawImage(aboutImage, CONTENT_X, CONTENT_Y, drawW, drawH);
  }
}

// Draw high scores popup overlay
function drawHighScoresPopup() {
  if (!gShowingHighScores) return;

  if (!canvas || !ctx) {
    return;
  }

  const POPUP_WIDTH = 452 * SCALE;
  const POPUP_HEIGHT = 308 * SCALE;
  const POPUP_X = (canvas.width - POPUP_WIDTH) / 2;
  const POPUP_Y = (canvas.height - POPUP_HEIGHT) / 2;

  // Drop shadow (1px right, 1px bottom, plain black)
  ctx.fillStyle = '#000000';
  ctx.fillRect(
    POPUP_X + 2 * SCALE,
    POPUP_Y + 2 * SCALE,
    POPUP_WIDTH - SCALE,
    POPUP_HEIGHT - SCALE
  );

  // Black background (original: PaintRect(&gHiScoreDg->portRect))
  ctx.fillStyle = '#000000';
  ctx.fillRect(POPUP_X, POPUP_Y, POPUP_WIDTH, POPUP_HEIGHT);

  // 3D beveled border (3 layers, from outside to inside)
  // Top/Left edges: #000000, #BBBBBB, #FFFFFF
  // Bottom/Right edges: #000000, #555555, #999999
  const borderColors = {
    topLeft: ['#000000', '#BBBBBB', '#FFFFFF'],
    bottomRight: ['#000000', '#555555', '#999999'],
  };

  for (let i = 0; i < 3; i++) {
    const offset = i;

    // Top edge
    ctx.fillStyle = borderColors.topLeft[i];
    ctx.fillRect(
      POPUP_X + offset * SCALE,
      POPUP_Y + offset * SCALE,
      POPUP_WIDTH - offset * 2 * SCALE,
      SCALE
    );

    // Left edge
    ctx.fillRect(
      POPUP_X + offset * SCALE,
      POPUP_Y + offset * SCALE,
      SCALE,
      POPUP_HEIGHT - offset * 2 * SCALE
    );

    // Bottom edge
    ctx.fillStyle = borderColors.bottomRight[i];
    ctx.fillRect(
      POPUP_X + offset * SCALE,
      POPUP_Y + POPUP_HEIGHT - offset * SCALE - SCALE,
      POPUP_WIDTH - offset * 2 * SCALE,
      SCALE
    );

    // Right edge
    ctx.fillRect(
      POPUP_X + POPUP_WIDTH - offset * SCALE - SCALE,
      POPUP_Y + offset * SCALE,
      SCALE,
      POPUP_HEIGHT - offset * 2 * SCALE
    );
  }

  // Fill interior with black (inside the 3px border)
  ctx.fillStyle = '#000000';
  ctx.fillRect(
    POPUP_X + 3 * SCALE,
    POPUP_Y + 3 * SCALE,
    POPUP_WIDTH - 6 * SCALE,
    POPUP_HEIGHT - 6 * SCALE
  );

  // Content area starts after the 3px border
  const BORDER_WIDTH = 3 * SCALE;
  const CONTENT_X = POPUP_X + BORDER_WIDTH;
  const CONTENT_Y = POPUP_Y + BORDER_WIDTH;

  // Draw header image (PICT 259, 220x50, centered at x=109 in content area)
  // Original: SetRect(&r,109,0,329,50); DrawPicture(h,&r);
  const highScoresImage = SPRITES?.getMainSprite('highScores');
  if (highScoresImage?.complete) {
    const headerX = CONTENT_X + 109 * SCALE + 3 * SCALE;
    const headerY = CONTENT_Y + 3 * SCALE;
    ctx.drawImage(highScoresImage, headerX, headerY, 220 * SCALE, 50 * SCALE);
  }

  // Column headers (original: TextFont(2); TextSize(14); TextFace(4))
  // TextFace(4) = italic
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${15 * SCALE}px "Times New Roman", serif`;

  const ROW_START_Y = CONTENT_Y + 62 * SCALE;
  const ROW_HEIGHT = 22 * SCALE;

  // Column positions (from original, relative to content area)
  const COL_NAME_X = CONTENT_X + 14 * SCALE;
  const COL_SCORE_X = CONTENT_X + 256 * SCALE;
  const COL_ROWS_X = CONTENT_X + 320 * SCALE;
  const COL_DATE_X = CONTENT_X + 335 * SCALE;

  ctx.textAlign = 'left';
  ctx.fillText('Name', COL_NAME_X, ROW_START_Y);
  const { width: nameWidth } = ctx.measureText('Name');
  ctx.fillRect(COL_NAME_X, ROW_START_Y + SCALE, nameWidth, SCALE);

  ctx.textAlign = 'right';
  ctx.fillText('Score', COL_SCORE_X, ROW_START_Y);
  const { width: scoreWidth } = ctx.measureText('Score');
  ctx.fillRect(
    COL_SCORE_X - scoreWidth,
    ROW_START_Y + SCALE,
    scoreWidth,
    SCALE
  );

  ctx.fillText('Rows', COL_ROWS_X, ROW_START_Y);
  const { width: rowsWidth } = ctx.measureText('Rows');
  ctx.fillRect(COL_ROWS_X - rowsWidth, ROW_START_Y + SCALE, rowsWidth, SCALE);

  ctx.textAlign = 'left';
  ctx.fillText('Date', COL_DATE_X, ROW_START_Y);
  const { width: dateWidth } = ctx.measureText('Date');
  ctx.fillRect(COL_DATE_X, ROW_START_Y + SCALE, dateWidth, SCALE);

  // Draw each high score entry (original: TextFace(0) for normal)
  ctx.font = `${15 * SCALE}px "Times New Roman", serif`;

  for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
    const entry = gHighScores[i];
    const y = ROW_START_Y + (i + 1) * ROW_HEIGHT + 3 * SCALE;

    // Highlight player's recent high score in yellow (like original)
    if (i === gLastHighScoreIndex) {
      ctx.fillStyle = '#FFFF00'; // gYellowRGB
    } else {
      ctx.fillStyle = '#FFFFFF';
    }

    // Rank and name
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}. ${entry.name}`, COL_NAME_X, y);

    // Score (right-aligned)
    ctx.textAlign = 'right';
    ctx.fillText(String(entry.score), COL_SCORE_X, y);

    // Rows (right-aligned)
    ctx.fillText(String(entry.rows), COL_ROWS_X, y);

    // Date (left-aligned)
    ctx.textAlign = 'left';
    ctx.fillText(formatDate(entry.date), COL_DATE_X, y);
  }

  // Reset text alignment
  ctx.textAlign = 'left';
}

function TogglePause() {
  if (!gGameInProgress) return;

  gGamePause = !gGamePause;

  getButton('pauseBtn').textContent = gGamePause ? 'Resume' : 'Pause';

  if (gGamePause) {
    SOUND?.playSound('pause');
    SOUND?.stopMusic();
  } else {
    gLastDropTime = getTicks();
    // Close High Scores and About when resuming
    if (gShowingHighScores) {
      gShowingHighScores = false;
    }
    if (gShowingAbout) {
      gShowingAbout = false;
    }
    // Resume music (SOUND?.startMusic so it restarts even if user changed music during pause)
    SOUND?.startMusic(currentMusicStyle);
  }

  // Redraw to show/hide pause overlay
  DrawWindow();
}

// ===========================================
// TIMING
// ===========================================

let virtualTicks = 0;

function getTicks() {
  return virtualTicks;
}

function MainLoop(timestamp: number) {
  // Calculate delta time
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  // Accumulate ticks
  tickAccumulator += deltaTime;

  // Update virtual ticks (60 ticks per second)
  while (tickAccumulator >= TICK_MS) {
    virtualTicks++;
    tickAccumulator -= TICK_MS;

    // Run game logic per tick (like original main loop)
    if (gGameInProgress && !gGamePause) {
      // Check if row clearing animation is complete
      if (gClearingRows) {
        if (getTicks() - gClearAnimStartTime >= CLEAR_ANIM_TICKS) {
          finishRowClearing();
        }
        // Don't run normal game logic during clearing animation
      } else if (gHardDropping) {
        // Process animated hard drop (row by row like original)
        processHardDrop();
      } else {
        AnimateActivePiece();
      }
    }
  }

  // Render
  DrawWindow();

  requestAnimationFrame(MainLoop);
}

// ===========================================
// INITIALIZATION
// ===========================================

async function init() {
  canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Could not get context');
    return;
  }

  // Set canvas size to original 500x330 scaled 2x = 1000x660
  canvas.width = ORIGINAL.WINDOW_WIDTH * SCALE;
  canvas.height = ORIGINAL.WINDOW_HEIGHT * SCALE;

  // Disable image smoothing for pixel-perfect scaling (crisp retro look)
  // Must be set AFTER canvas resize as some browsers reset this property
  ctx.imageSmoothingEnabled = false;

  // Show loading message
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${12 * SCALE}px Geneva, Helvetica, sans-serif`;
  ctx.fillText('Loading assets...', 20, canvas.height / 2);

  // Load original graphics from extracted PNG assets
  SPRITES = await initSprites(
    currentBackgroundStyle,
    currentPiecesStyle,
    SCALE
  );

  // Initialize audio (load sound files)
  try {
    SOUND = await initSound(currentMusicStyle);
  } catch (e) {
    console.error('Failed to initialize audio', e);
  }

  // Initialize game (but don't start)
  InitGame();

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
      TogglePause();
      return;
    }

    HandleKeyDown(e.key);
  });

  document.addEventListener('keyup', (e) => {
    HandleKeyUp(e.key);
  });

  // Click on canvas to close high scores popup
  canvas.addEventListener('click', () => {
    if (gShowingHighScores) {
      hideHighScores();
    }
    if (gShowingAbout) {
      hideAbout();
    }
  });

  getButton('startBtn').addEventListener('click', () => {
    // Resume audio context on user interaction
    SOUND?.startMusic(currentMusicStyle);

    // Close popups if showing
    if (gShowingHighScores) {
      hideHighScores();
    }
    if (gShowingAbout) {
      hideAbout();
    }
    StartNewGame();
  });

  getButton('pauseBtn').addEventListener('click', TogglePause);
  getButton('musicBtn').addEventListener('click', () => {
    const gMusicOn = SOUND?.toggleMusic(gGameInProgress && !gGamePause);
    // Update button text
    const musicBtn = document.getElementById('musicBtn');
    if (musicBtn) {
      musicBtn.textContent = gMusicOn ? 'Music: ON' : 'Music: OFF';
    }
  });
  getButton('soundBtn').addEventListener('click', () => {
    const gSoundOn = SOUND?.toggleSound();
    // Update button text
    const soundBtn = document.getElementById('soundBtn');
    if (soundBtn) {
      soundBtn.textContent = gSoundOn
        ? 'Sound Effects: ON'
        : 'Sound Effects: OFF';
    }
  });
  getButton('highScoresBtn').addEventListener('click', () => {
    if (gShowingHighScores) {
      hideHighScores();
    } else {
      hideAbout(); // Close About if open
      gLastHighScoreIndex = -1; // Don't highlight any entry when viewing manually
      showHighScores();
    }
  });

  getButton('aboutBtn').addEventListener('click', () => {
    if (gShowingAbout) {
      hideAbout();
    } else {
      hideHighScores(); // Close High Scores if open
      showAbout();
    }
  });

  // High score name modal
  const highScoreModalOverlay = document.getElementById(
    'highScoreModalOverlay'
  );
  const highScoreNameInput = document.getElementById('highScoreNameInput');
  const highScoreModalOk = document.getElementById('highScoreModalOk');
  if (highScoreModalOk) {
    highScoreModalOk.addEventListener('click', submitHighScoreName);
  }
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
    SPRITES?.setPiecesImage(currentPiecesStyle);
    DrawWindow();
  });

  getSelect('backgroundSelect').addEventListener('change', async (e) => {
    const style = (e?.target as HTMLSelectElement)?.value;
    if (isBGStyle(style)) {
      currentBackgroundStyle = style;
    }
    SPRITES?.setBackgroundImages(currentBackgroundStyle);
    DrawWindow();
  });

  getSelect('musicSelect').addEventListener('change', async (e) => {
    const wasPlaying = SOUND?.getIsPlaying();
    if (wasPlaying) {
      SOUND?.stopMusic();
    }
    const value = (e?.target as HTMLSelectElement)?.value;
    if (value === 'peter_wagner' || value === 'animal_instinct') {
      currentMusicStyle = value;
    }
    if (wasPlaying && gGameInProgress && !gGamePause) {
      await SOUND?.startMusic(currentMusicStyle);
    }
  });

  // Initial draw
  DrawWindow();

  // Start main loop
  lastFrameTime = performance.now();
  requestAnimationFrame(MainLoop);
}

document.addEventListener('DOMContentLoaded', init);
