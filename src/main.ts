import './style.css';

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

// Pre-rendered piece block images (16x16 canvas for each color)
let pieceBlockCanvases: HTMLCanvasElement[] = [];

// Background pattern images (64x64 tiles for each level)
let backgroundImages: (HTMLImageElement | null)[] = [];

// Current asset selections
let currentPiecesStyle = 'default';
let currentBackgroundStyle = 'default';
let currentMusicStyle: keyof typeof MUSIC_CONFIGS = 'peter_wagner';

// Background filenames (all sets use level01.png through level10.png now)
const BACKGROUND_FILES = [
  'level01.png',
  'level02.png',
  'level03.png',
  'level04.png',
  'level05.png',
  'level06.png',
  'level07.png',
  'level08.png',
  'level09.png',
  'level10.png',
];

// Load and slice the pieces image into individual block canvases (scaled 2x)
function loadPiecesImage(style: string | null = null): Promise<void> {
  const pieceStyle = style || currentPiecesStyle;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Original image is 112x16 (7 blocks of 16x16)
      // Scale each block to BLOCK_WIDTH x BLOCK_HEIGHT (32x32 at 2x scale)
      const ORIGINAL_BLOCK = 16;

      pieceBlockCanvases = [];
      for (let i = 0; i < 7; i++) {
        const blockCanvas = document.createElement('canvas');
        blockCanvas.width = BLOCK_WIDTH;
        blockCanvas.height = BLOCK_HEIGHT;
        const blockCtx = blockCanvas.getContext('2d');

        if (!blockCtx) {
          continue;
        }

        // Disable smoothing for pixel-perfect scaling
        blockCtx.imageSmoothingEnabled = false;

        // Copy and scale from 16x16 source to 32x32 destination
        blockCtx.drawImage(
          img,
          i * ORIGINAL_BLOCK,
          0, // Source x, y (original 16x16 positions)
          ORIGINAL_BLOCK,
          ORIGINAL_BLOCK, // Source width, height
          0,
          0, // Dest x, y
          BLOCK_WIDTH,
          BLOCK_HEIGHT // Dest scaled size
        );

        pieceBlockCanvases.push(blockCanvas);
      }

      console.log(`Loaded piece style: ${pieceStyle}`);
      resolve();
    };
    img.onerror = () => {
      console.warn('Could not load pieces image, using fallback');
      generateFallbackBlocks();
      resolve();
    };
    img.src = `pieces/${pieceStyle}.png`;
  });
}

// Load background pattern images
function loadBackgroundImages(style: string | null = null): Promise<void> {
  const bgStyle = style || currentBackgroundStyle;
  backgroundImages = []; // Clear existing

  const promises = BACKGROUND_FILES.map((filename, index) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        backgroundImages[index] = img;
        resolve();
      };
      img.onerror = () => {
        console.warn(`Could not load background ${filename}`);
        backgroundImages[index] = null;
        resolve();
      };
      img.src = `backgrounds/${bgStyle}/${filename}`;
    });
  });

  return Promise.all(promises).then(() => {
    console.log(
      `Loaded background style: ${bgStyle} (${backgroundImages.filter((b) => b).length} patterns)`
    );
  });
}

// Fallback procedural block generation (in case assets fail to load)
function generateFallbackBlocks() {
  const PIECE_COLORS = [
    {
      base: [255, 204, 0],
      light: [255, 255, 102],
      dark: [153, 102, 0],
      highlight: [255, 255, 204],
    },
    {
      base: [0, 204, 204],
      light: [102, 255, 255],
      dark: [0, 102, 102],
      highlight: [204, 255, 255],
    },
    {
      base: [255, 102, 0],
      light: [255, 178, 102],
      dark: [153, 51, 0],
      highlight: [255, 204, 153],
    },
    {
      base: [0, 102, 255],
      light: [102, 178, 255],
      dark: [0, 51, 153],
      highlight: [153, 204, 255],
    },
    {
      base: [255, 0, 0],
      light: [255, 102, 102],
      dark: [153, 0, 0],
      highlight: [255, 153, 153],
    },
    {
      base: [0, 204, 0],
      light: [102, 255, 102],
      dark: [0, 102, 0],
      highlight: [153, 255, 153],
    },
    {
      base: [204, 0, 204],
      light: [255, 102, 255],
      dark: [102, 0, 102],
      highlight: [255, 178, 255],
    },
  ];

  pieceBlockCanvases = [];
  for (let i = 0; i < 7; i++) {
    const colorDef = PIECE_COLORS[i];
    const canvas = document.createElement('canvas');
    canvas.width = BLOCK_WIDTH;
    canvas.height = BLOCK_HEIGHT;
    const blockCtx = canvas.getContext('2d');

    if (!blockCtx) {
      continue;
    }

    // Simple 3D block
    blockCtx.fillStyle = `rgb(${colorDef.base[0]}, ${colorDef.base[1]}, ${colorDef.base[2]})`;
    blockCtx.fillRect(0, 0, BLOCK_WIDTH, BLOCK_HEIGHT);
    blockCtx.strokeStyle = '#000000';
    blockCtx.strokeRect(0.5, 0.5, BLOCK_WIDTH - 1, BLOCK_HEIGHT - 1);
    blockCtx.fillStyle = `rgb(${colorDef.light[0]}, ${colorDef.light[1]}, ${colorDef.light[2]})`;
    blockCtx.fillRect(1, 1, BLOCK_WIDTH - 2, 2);
    blockCtx.fillRect(1, 1, 2, BLOCK_HEIGHT - 2);
    blockCtx.fillStyle = `rgb(${colorDef.dark[0]}, ${colorDef.dark[1]}, ${colorDef.dark[2]})`;
    blockCtx.fillRect(1, BLOCK_HEIGHT - 3, BLOCK_WIDTH - 2, 2);
    blockCtx.fillRect(BLOCK_WIDTH - 3, 1, 2, BLOCK_HEIGHT - 2);

    pieceBlockCanvases.push(canvas);
  }
}

// Initialize background patterns (load from extracted assets)
async function initBackgroundPatterns() {
  await loadBackgroundImages();
}

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
let highScoresImage: HTMLImageElement | null = null; // PICT 259 header image
let gPendingHighScore: PendingHighScore | null = null; // { scoreIndex, finalScore, finalRows } when high score name modal is open
let gShowingAbout = false; // Whether about popup is visible
let aboutImage: HTMLImageElement | null = null; // About panel image

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

// Audio
let audioContext: AudioContext | null = null;
const soundFiles = {
  drop: 'sounds/drop.wav',
  stick: 'sounds/stick.wav',
  clear1: 'sounds/clear1.wav',
  clear2: 'sounds/clear2.wav',
  clear3: 'sounds/clear3.wav',
  clear4: 'sounds/clear4.wav',
  highscore: 'sounds/highscore.wav',
  smallBonus: 'sounds/smallBonus.wav',
  bigBonus: 'sounds/bigBonus.wav',
  newLevel: 'sounds/newlevel.wav',
  gameOver: 'sounds/gameover.wav',
  pause: 'sounds/pause.wav',
};
const sounds: Partial<Record<keyof typeof soundFiles, AudioBuffer>> = {};

// ===========================================
// PIECE SETUP (exact from SetupDefaultPieces)
// ===========================================

function SetupDefaultPieces() {
  gPieceList = [];

  for (let i = 0; i < 7; i++) {
    const piece: Piece = {
      height: BOARD_ROWS + 4 - 3, // = 21 (starting height)
      offset: Math.floor(BOARD_COLS / 2) - 2, // = 3 (centered)
      color: i,
      grid: [],
    };

    // Initialize 4x4 grid to zeros
    for (let col = 0; col < 4; col++) {
      piece.grid[col] = [0, 0, 0, 0];
    }

    gPieceList.push(piece);
  }

  // Square block (color 0) - Yellow
  // grid[col][row] - EXACT from original SetupDefaultPieces
  gPieceList[0].grid[1][1] = 1;
  gPieceList[0].grid[1][2] = 1;
  gPieceList[0].grid[2][1] = 1;
  gPieceList[0].grid[2][2] = 1;

  // Long block (color 1) - Cyan (I-piece) - VERTICAL in column 1
  gPieceList[1].grid[1][0] = 2;
  gPieceList[1].grid[1][1] = 2;
  gPieceList[1].grid[1][2] = 2;
  gPieceList[1].grid[1][3] = 2;

  // Left-pointing L (color 2) - Orange (J-piece)
  gPieceList[2].grid[2][0] = 3;
  gPieceList[2].grid[2][1] = 3;
  gPieceList[2].grid[2][2] = 3;
  gPieceList[2].grid[3][2] = 3;

  // Right-pointing L (color 3) - Blue (L-piece)
  gPieceList[3].grid[2][0] = 4;
  gPieceList[3].grid[2][1] = 4;
  gPieceList[3].grid[2][2] = 4;
  gPieceList[3].grid[1][2] = 4;

  // Left-pointing step (color 4) - Red (S-piece)
  gPieceList[4].grid[2][0] = 5;
  gPieceList[4].grid[2][1] = 5;
  gPieceList[4].grid[1][1] = 5;
  gPieceList[4].grid[1][2] = 5;

  // Right-pointing step (color 5) - Green (Z-piece)
  gPieceList[5].grid[1][0] = 6;
  gPieceList[5].grid[1][1] = 6;
  gPieceList[5].grid[2][1] = 6;
  gPieceList[5].grid[2][2] = 6;

  // T (color 6) - Magenta
  gPieceList[6].grid[2][2] = 7;
  gPieceList[6].grid[1][1] = 7;
  gPieceList[6].grid[2][1] = 7;
  gPieceList[6].grid[3][1] = 7;
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
  let ttype;

  switch (color) {
    case 0: // Square - no rotation
      return;

    case 1: // Long block (I-piece)
      ttype = grid[3][1];
      grid[3][1] = grid[2][3];
      grid[2][3] = grid[0][2];
      grid[0][2] = grid[1][0];
      grid[1][0] = ttype;

      ttype = grid[2][0];
      grid[2][0] = grid[3][2];
      grid[3][2] = grid[1][3];
      grid[1][3] = grid[0][1];
      grid[0][1] = ttype;

      ttype = grid[1][1];
      grid[1][1] = grid[2][1];
      grid[2][1] = grid[2][2];
      grid[2][2] = grid[1][2];
      grid[1][2] = ttype;
      break;

    case 2:
    case 3:
    case 4:
    case 5:
    case 6: // L, J, S, Z, T pieces
      ttype = grid[1][0];
      grid[1][0] = grid[3][0];
      grid[3][0] = grid[3][2];
      grid[3][2] = grid[1][2];
      grid[1][2] = ttype;

      ttype = grid[2][0];
      grid[2][0] = grid[3][1];
      grid[3][1] = grid[2][2];
      grid[2][2] = grid[1][1];
      grid[1][1] = ttype;
      break;
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
    playSound('drop');
  } else {
    playSound('stick');
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
    if (dropped === 1) playSound('clear1');
    else if (dropped === 2) playSound('clear2');
    else if (dropped === 3) playSound('clear3');
    else if (dropped === 4) playSound('clear4');
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
    playSound('bigBonus');
  }

  if (bonus) {
    gCurrentScore += SCORE_SAME_COLOR_BONUS;
    if (!tbonus) {
      playSound('smallBonus');
    }
  }

  // Check for level up
  if (gLinesCleared >= LEVEL_THRESHOLD[gCurrentLev] && gCurrentLev < 10) {
    gCurrentLev++;
    if (!bonus && !tbonus) {
      playSound('newLevel');
    }
  }

  UpdateScoreDisplay();

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
  // Fill with background pattern (scaled 2x)
  const bgImage = backgroundImages[gCurrentLev - 1];
  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    // Create scaled pattern for 2x rendering
    const scaledPattern = document.createElement('canvas');
    scaledPattern.width = bgImage.width * SCALE;
    scaledPattern.height = bgImage.height * SCALE;
    const pCtx = scaledPattern.getContext('2d');
    if (!pCtx) {
      return;
    }
    pCtx.imageSmoothingEnabled = false;
    pCtx.drawImage(bgImage, 0, 0, scaledPattern.width, scaledPattern.height);

    if (!ctx) {
      return;
    }

    const pattern = ctx.createPattern(scaledPattern, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
    }
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

          if (
            colorIndex >= 0 &&
            colorIndex < 7 &&
            pieceBlockCanvases[colorIndex]
          ) {
            ctx.drawImage(
              pieceBlockCanvases[colorIndex],
              x,
              y,
              BLOCK_WIDTH,
              BLOCK_HEIGHT
            );
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

  const frameImages = [scoreFrameImage, levelFrameImage, rowsFrameImage];
  const values = [gCurrentScore, gCurrentLev, gLinesCleared];

  // Frame dimensions from PICT (98x63), scale to our display
  const FRAME_WIDTH = 98 * SCALE;
  const FRAME_HEIGHT = 63 * SCALE;

  for (let i = 0; i < 3; i++) {
    const boxY = SCORE_Y + i * (SCORE_HEIGHT + SCORE_SPACING);
    const frameImg = frameImages[i];

    // Draw the extracted frame image (contains label and decorative border)
    if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
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

// Overlay images (extracted from original PICT 256/257)
let gameOverImage: HTMLImageElement | null = null;
let pauseImage: HTMLImageElement | null = null;

// Welcome screen image (extracted from original PICT 258)
let welcomeImage: HTMLImageElement | null = null;
let gShowWelcomeScreen = true; // Show welcome screen until game starts

// Score box frame images (extracted from original PICT 260/261/262)
let scoreFrameImage: HTMLImageElement | null = null;
let levelFrameImage: HTMLImageElement | null = null;
let rowsFrameImage: HTMLImageElement | null = null;

// Load overlay images
async function loadOverlayImages() {
  return new Promise<void>((resolve) => {
    let loaded = 0;
    const total = 8; // gameover, pause, welcome, highscores, about, score, level, rows frames
    const checkDone = () => {
      loaded++;
      if (loaded >= total) resolve();
    };

    gameOverImage = new Image();
    gameOverImage.onload = checkDone;
    gameOverImage.onerror = checkDone;
    gameOverImage.src = 'sprites/gameover.png';

    pauseImage = new Image();
    pauseImage.onload = checkDone;
    pauseImage.onerror = checkDone;
    pauseImage.src = 'sprites/pause.png';

    welcomeImage = new Image();
    welcomeImage.onload = checkDone;
    welcomeImage.onerror = checkDone;
    welcomeImage.src = 'sprites/welcome.png';

    highScoresImage = new Image();
    highScoresImage.onload = checkDone;
    highScoresImage.onerror = checkDone;
    highScoresImage.src = 'sprites/highscores.png';

    aboutImage = new Image();
    aboutImage.onload = checkDone;
    aboutImage.onerror = checkDone;
    aboutImage.src = 'sprites/about.png';

    scoreFrameImage = new Image();
    scoreFrameImage.onload = checkDone;
    scoreFrameImage.onerror = checkDone;
    scoreFrameImage.src = 'sprites/score_frame.png';

    levelFrameImage = new Image();
    levelFrameImage.onload = checkDone;
    levelFrameImage.onerror = checkDone;
    levelFrameImage.src = 'sprites/level_frame.png';

    rowsFrameImage = new Image();
    rowsFrameImage.onload = checkDone;
    rowsFrameImage.onerror = checkDone;
    rowsFrameImage.src = 'sprites/rows_frame.png';
  });
}

// Draw welcome screen (original PICT 258) - shown before game starts
function DrawWelcome() {
  if (!ctx) {
    return;
  }
  // Draw welcome image filling the board area
  if (welcomeImage && welcomeImage.complete && welcomeImage.naturalWidth > 0) {
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

  const img = type === 'pause' ? pauseImage : gameOverImage;

  if (img && img.complete && img.naturalWidth > 0) {
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
  if (pieceBlockCanvases[colorIndex]) {
    ctx.drawImage(
      pieceBlockCanvases[colorIndex],
      x,
      y,
      BLOCK_WIDTH,
      BLOCK_HEIGHT
    );
  }
}

function UpdateScoreDisplay() {
  // Score is now drawn on canvas in DrawScoreBoxes()
  // No need to explicitly redraw - MainLoop calls DrawWindow every frame
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
  UpdateScoreDisplay();
  getButton('startBtn').textContent = 'Restart';
  getButton('pauseBtn').disabled = false;
  getButton('pauseBtn').textContent = 'Pause';
  getSelect('levelSelect').disabled = true;

  // Start timing
  gLastDropTime = getTicks();
  lastFrameTime = performance.now();
  tickAccumulator = 0;

  // Start music
  if (gMusicOn) {
    startMusic();
  }
}

function StopGame() {
  gGameInProgress = false;

  // Stop music
  stopMusic();

  playSound('gameOver');

  // Update UI
  getButton('startBtn').textContent = 'Begin Game';
  getButton('pauseBtn').disabled = true;
  getSelect('levelSelect').disabled = false;

  // Update score display to ensure it's current
  UpdateScoreDisplay();

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

      // Ensure audioContext is running before playing sound
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Play high score sound and wait for it to finish (like original: AsyncPlay(gHighScoreSnd))
      playSound('highscore');

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
    if (musicSource) {
      try {
        musicSource.onended = null;
        musicSource.stop();
      } catch {
        /**/
      }
      musicSource = null;
    }
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
    if (musicSource) {
      try {
        musicSource.onended = null;
        musicSource.stop();
      } catch {
        /**/
      }
      musicSource = null;
    }
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

  // Interior (black)
  /*ctx.fillStyle = '#000000';
  ctx.fillRect(
    POPUP_X + BORDER_WIDTH,
    POPUP_Y + BORDER_WIDTH,
    POPUP_WIDTH - BORDER_WIDTH * 2,
    POPUP_HEIGHT - BORDER_WIDTH * 2
  );*/

  // Draw about image centered
  const CONTENT_X = POPUP_X + BORDER_WIDTH * SCALE + PADDING * SCALE;
  const CONTENT_Y = POPUP_Y + BORDER_WIDTH * SCALE + PADDING * SCALE;

  if (aboutImage && aboutImage.complete && aboutImage.naturalWidth > 0) {
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
  if (
    highScoresImage &&
    highScoresImage.complete &&
    highScoresImage.naturalWidth > 0
  ) {
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
    playSound('pause');
    // Stop music during pause
    if (musicSource) {
      try {
        musicSource.onended = null; // Prevent callback
        musicSource.stop();
      } catch {
        /**/
      }
      musicSource = null;
    }
  } else {
    gLastDropTime = getTicks();
    // Close High Scores and About when resuming
    if (gShowingHighScores) {
      gShowingHighScores = false;
    }
    if (gShowingAbout) {
      gShowingAbout = false;
    }
    // Resume music (startMusic so it restarts even if user changed music during pause)
    if (gMusicOn && musicBuffers.length > 0) {
      startMusic();
    }
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
// AUDIO SYSTEM
// ===========================================

// Music state
let musicBuffers: (AudioBuffer | null)[] = [];
let musicSegmentNames: string[] = [];
let currentMusicSegment = 0;
let repeatMusicSegment = 0;
let lastMusicSegment = 0;
let musicSource: AudioBufferSourceNode | null = null;
let musicGainNode: GainNode | null = null;
let gMusicOn = true;
let gSoundOn = true;

// Music configurations for different styles
const MUSIC_CONFIGS = {
  peter_wagner: {
    prefix: 'peter_wagner',
    segments: [
      'repeat',
      'repeat',
      'CD',
      'repeat',
      'repeat',
      'E',
      'E',
      'Fa',
      'Fb',
      'Fc',
      'repeat',
      'repeat',
      'E',
      'Fb',
      'G',
    ],
    repeatSegment: 0,
    folder: 'music',
  },
  animal_instinct: {
    prefix: 'animal_instinct',
    segments: ['A'], // Single looping segment
    repeatSegment: 0,
    folder: 'music',
  },
};
let gMusicIsPlaying = false;

async function initAudio() {
  try {
    audioContext = new window.AudioContext({
      latencyHint: 'interactive',
    });

    const names = Object.keys(soundFiles) as (keyof typeof soundFiles)[];

    // Load all sound files
    for (const name of names) {
      try {
        const path = soundFiles[name];
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        sounds[name] = audioBuffer;
      } catch (e) {
        console.log(`Failed to load sound: ${name}`, e);
      }
    }

    console.log(`Loaded ${Object.keys(sounds).length} sounds`);

    // Load default music
    await loadMusicSegments(currentMusicStyle);
  } catch (e) {
    console.log('Audio not available:', e);
  }
}

// Load music segments for a given style
async function loadMusicSegments(style: keyof typeof MUSIC_CONFIGS) {
  const config = MUSIC_CONFIGS[style];
  if (!config) {
    console.warn(`Unknown music style: ${style}`);
    return;
  }

  if (!audioContext) {
    return;
  }
  musicSegmentNames = config.segments;
  repeatMusicSegment = config.repeatSegment;
  lastMusicSegment = config.segments.length - 1;

  // Load unique segments first, then reference them for the full sequence
  const uniqueSegments = [...new Set(musicSegmentNames)];
  const segmentCache: Record<string, AudioBuffer | null> = {};

  for (const segName of uniqueSegments) {
    try {
      const response = await fetch(
        `${config.folder}/${config.prefix}_${segName}.wav`
      );
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      segmentCache[segName] = audioBuffer;
    } catch (e) {
      console.log(`Failed to load music segment: ${segName}`, e);
      segmentCache[segName] = null;
    }
  }

  // Build the full sequence array referencing cached buffers
  musicBuffers = musicSegmentNames.map((name) => segmentCache[name] || null);

  console.log(
    `Loaded music style: ${style} (${Object.keys(segmentCache).filter((k) => segmentCache[k]).length} segments)`
  );
}

function startMusic() {
  if (!audioContext || !gMusicOn || musicBuffers.length === 0) return;

  // Resume audio context if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  currentMusicSegment = 0;
  gMusicIsPlaying = true;
  playMusicSegment();
}

function playMusicSegment() {
  if (!gMusicIsPlaying || !gMusicOn || gGamePause) return;

  if (!audioContext) {
    return;
  }

  // Safety check (shouldn't normally happen with correct logic)
  if (currentMusicSegment >= musicBuffers.length || currentMusicSegment < 0) {
    currentMusicSegment = repeatMusicSegment;
  }

  const buffer = musicBuffers[currentMusicSegment];
  if (!buffer) {
    // Skip missing segment using original logic
    if (currentMusicSegment === lastMusicSegment) {
      currentMusicSegment = repeatMusicSegment;
    } else {
      currentMusicSegment++;
    }
    playMusicSegment();
    return;
  }

  // Stop any currently playing music source
  if (musicSource) {
    try {
      musicSource.onended = null;
      musicSource.stop();
    } catch {
      /**/
    }
  }

  // Create new source
  musicSource = audioContext.createBufferSource();
  musicSource.buffer = buffer;

  // Create gain node for music volume
  musicGainNode = audioContext.createGain();
  musicGainNode.gain.value = 0.3; // 30% volume for background music

  musicSource.connect(musicGainNode);
  musicGainNode.connect(audioContext.destination);

  // When this segment ends, play the next one (original MusicSeq logic)
  musicSource.onended = () => {
    if (gMusicIsPlaying && gMusicOn) {
      // Original: if current == last, go to repeat; else increment
      if (currentMusicSegment === lastMusicSegment) {
        currentMusicSegment = repeatMusicSegment;
      } else {
        currentMusicSegment++;
      }
      playMusicSegment();
    }
  };

  musicSource.start(0);
}

function stopMusic() {
  gMusicIsPlaying = false;
  if (musicSource) {
    try {
      musicSource.onended = null;
      musicSource.stop();
    } catch {
      /**/
    }
    musicSource = null;
  }
}

function toggleMusic() {
  gMusicOn = !gMusicOn;
  if (gMusicOn && gGameInProgress && !gGamePause) {
    startMusic();
  } else {
    stopMusic();
  }
  // Update button text
  const musicBtn = document.getElementById('musicBtn');
  if (musicBtn) {
    musicBtn.textContent = gMusicOn ? 'Music: ON' : 'Music: OFF';
  }
}

function toggleSound() {
  gSoundOn = !gSoundOn;
  // Update button text
  const soundBtn = document.getElementById('soundBtn');
  if (soundBtn) {
    soundBtn.textContent = gSoundOn
      ? 'Sound Effects: ON'
      : 'Sound Effects: OFF';
  }
}

function playSound(name: keyof typeof sounds) {
  if (!audioContext || !sounds[name] || !gSoundOn) return;

  // Resume audio context if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  // Create buffer source and play the sound
  const source = audioContext.createBufferSource();
  source.buffer = sounds[name];

  // Add gain node for volume control
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0.5; // 50% volume

  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  source.start(audioContext.currentTime + 0.01);
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
  await loadPiecesImage();
  await initBackgroundPatterns();
  await loadOverlayImages();

  // Initialize audio (load sound files)
  await initAudio();

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
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
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
  getButton('musicBtn').addEventListener('click', toggleMusic);
  getButton('soundBtn').addEventListener('click', toggleSound);
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
    currentPiecesStyle = (e?.target as HTMLSelectElement)?.value;
    await loadPiecesImage(currentPiecesStyle);
    DrawWindow();
  });

  getSelect('backgroundSelect').addEventListener('change', async (e) => {
    currentBackgroundStyle = (e?.target as HTMLSelectElement)?.value;
    await loadBackgroundImages(currentBackgroundStyle);
    DrawWindow();
  });

  getSelect('musicSelect').addEventListener('change', async (e) => {
    const wasPlaying = gMusicIsPlaying;
    if (wasPlaying) {
      stopMusic();
    }
    const value = (e?.target as HTMLSelectElement)?.value;
    if (value === 'peter_wagner' || value === 'animal_instinct') {
      currentMusicStyle = value;
    }
    await loadMusicSegments(currentMusicStyle);
    if (wasPlaying && gGameInProgress && !gGamePause) {
      startMusic();
    }
  });

  // Initial draw
  DrawWindow();

  // Start main loop
  lastFrameTime = performance.now();
  requestAnimationFrame(MainLoop);
}

document.addEventListener('DOMContentLoaded', init);
