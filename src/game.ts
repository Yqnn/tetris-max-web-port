import type { InternalGameState, Level, Piece } from './game.constants';
import {
  PIECE_LIST,
  TICK_MS,
  LEVEL_SPEED,
  ZIP_DELAY_TICKS,
  ZIP_RATE_TICKS,
  FREEFALL_RATE_TICKS,
  SLOW_MOVE_TICKS,
  CLEAR_ANIM_TICKS,
  BOARD_COLS,
  BOARD_ROWS,
  SCORE_1_LINE,
  SCORE_2_LINES,
  SCORE_3_LINES,
  SCORE_4_LINES,
  SCORE_SAME_COLOR_BONUS,
  SCORE_CLEAR_BOARD_BONUS,
  LEVEL_THRESHOLD,
} from './game.constants';

export const initGame = () => {
  let state = makeInitialGameState();

  const start = (level: Level) => {
    // Initialize game
    state = makeInitialGameState();
    state.score.currentLevel = level;

    // Spawn first piece
    state.nextPiece = copyPiece(PIECE_LIST[Math.floor(Math.random() * 7)]);
    startNextPiece(state);

    // Start timing
    state.timing.lastDropTime = state.tick.count;
    state.tick.accumulator = 0;
  };

  const tick = (deltaTime: number) => {
    state.events = [];
    // Accumulate ticks
    state.tick.accumulator += deltaTime;

    // Update virtual ticks (60 ticks per second)
    while (state.tick.accumulator >= TICK_MS) {
      state.tick.count++;
      state.tick.accumulator -= TICK_MS;

      // Run game logic per tick (like original main loop)
      // Check if row clearing animation is complete
      if (state.rowClearing.rowsToClear.length) {
        if (
          state.tick.count - state.rowClearing.clearAnimStartTime >=
          CLEAR_ANIM_TICKS
        ) {
          finishRowClearing(state);
        }
        // Don't run normal game logic during clearing animation
      } else if (state.hardDrop.isHardDropping) {
        // Process animated hard drop (row by row like original)
        processHardDrop(state);
      } else {
        animateActivePiece(state);
      }
    }
  };

  return {
    start,
    tick,
    handleKeyDown: (key: string) => handleKeyDown(state, key),
    handleKeyUp: (key: string) => handleKeyUp(state, key),

    getScore: () => state.score.currentScore,
    getLinesCleared: () => state.score.linesCleared,
    getCurrentLevel: () => state.score.currentLevel,

    getCurrentPiece: () => state.currentPiece,
    getNextPiece: () => state.nextPiece,
    getGameBoard: () => state.board,

    getRowsToClear: () => state.rowClearing.rowsToClear,

    isGameOver: () => state.isGameOver,
    getEvents: () => state.events,
  };
};

function makeInitialGameState(): InternalGameState {
  // Initialize board (column-major like original)
  const board: number[][] = [];
  for (let i = 0; i < BOARD_COLS; i++) {
    board[i] = [];
    for (let j = 0; j < BOARD_ROWS; j++) {
      board[i][j] = 0;
    }
  }
  return {
    score: {
      currentScore: 0,
      linesCleared: 0,
      currentLevel: 1,
    },
    isGameOver: false,
    events: [],
    board,
    currentPiece: null,
    nextPiece: null,
    timing: {
      lastDropTime: 0,
      lastLeftTime: 0,
      lastRightTime: 0,
    },
    movement: {
      zippingL: false,
      zippingR: false,
      zipNow: false,
      inFreefall: false,
      movePieceSlowly: false,
      downKeyActive: false,
      pushKeyActive: false,
    },
    rowClearing: {
      rowsToClear: [],
      clearAnimStartTime: 0,
      clearAnimData: null,
    },
    hardDrop: {
      isHardDropping: false,
      hardDropStartTime: 0,
    },
    pendingDropScore: 0,
    tick: {
      accumulator: 0,
      count: 0,
    },
  };
}

function animateActivePiece(state: InternalGameState) {
  if (!state.currentPiece) {
    return;
  }
  const currentTicks = state.tick.count;

  // Wait 10 ticks for zip mode to take effect
  if (
    currentTicks - state.timing.lastLeftTime >= ZIP_DELAY_TICKS &&
    state.movement.zippingL &&
    !state.movement.zipNow
  ) {
    state.movement.zipNow = true;
  }
  if (
    currentTicks - state.timing.lastRightTime >= ZIP_DELAY_TICKS &&
    state.movement.zippingR &&
    !state.movement.zipNow
  ) {
    state.movement.zipNow = true;
  }

  // Zip left if it's time
  if (
    currentTicks - state.timing.lastLeftTime >= ZIP_RATE_TICKS &&
    state.movement.zippingL &&
    state.movement.zipNow
  ) {
    state.timing.lastLeftTime = currentTicks;
    state.currentPiece.offset--;
    if (!inLegalPos(state, state.currentPiece)) {
      state.currentPiece.offset++;
    }
  }

  // Zip right if it's time
  if (
    currentTicks - state.timing.lastRightTime >= ZIP_RATE_TICKS &&
    state.movement.zippingR &&
    state.movement.zipNow
  ) {
    state.timing.lastRightTime = currentTicks;
    state.currentPiece.offset++;
    if (!inLegalPos(state, state.currentPiece)) {
      state.currentPiece.offset--;
    }
  }

  // Determine if it's time to drop
  let shouldDrop = false;
  const levelSpeed = LEVEL_SPEED[state.score.currentLevel];

  if (state.movement.inFreefall) {
    // Freefall mode: drop every 2 ticks
    shouldDrop =
      currentTicks - state.timing.lastDropTime >= FREEFALL_RATE_TICKS;
  } else if (state.movement.movePieceSlowly) {
    // Slow move mode: 15 tick delay before locking
    shouldDrop = currentTicks - state.timing.lastDropTime >= SLOW_MOVE_TICKS;
  } else {
    // Normal drop based on level speed
    shouldDrop = currentTicks - state.timing.lastDropTime >= levelSpeed;

    // Level 10 special handling (effectively 3.5 ticks)
    if (
      state.score.currentLevel === 10 &&
      state.currentPiece.height % 2 === 0
    ) {
      shouldDrop = currentTicks - state.timing.lastDropTime >= levelSpeed - 1;
    }
  }

  if (shouldDrop) {
    state.currentPiece.height--;

    if (state.movement.inFreefall) {
      state.pendingDropScore += 1; // Point for freefall (added when piece lands)
    }

    if (inLegalPos(state, state.currentPiece)) {
      state.movement.movePieceSlowly = false;
    } else {
      state.currentPiece.height++;

      if (state.movement.movePieceSlowly || state.movement.inFreefall) {
        const wasFreefall = state.movement.inFreefall;
        state.movement.movePieceSlowly = false;
        // Add pending drop score when piece lands
        state.score.currentScore += state.pendingDropScore;
        state.pendingDropScore = 0;
        if (placePiece(state, state.currentPiece)) {
          reduceRows(state, wasFreefall);
          // startNextPiece is now called by reduceRows after animation
        } else {
          state.isGameOver = true;
        }
      } else {
        // Enter slow move mode (grace period before lock)
        state.movement.movePieceSlowly = true;
      }
    }

    state.timing.lastDropTime = currentTicks;
  }
}

function startNextPiece(state: InternalGameState) {
  if (state.nextPiece === null) {
    // First piece of game
    state.nextPiece = copyPiece(PIECE_LIST[Math.floor(Math.random() * 7)]);
  }

  // Current piece becomes next piece
  state.currentPiece = state.nextPiece;
  state.currentPiece.height = BOARD_ROWS + 4 - 3; // Reset to starting height (21)
  state.currentPiece.offset = Math.floor(BOARD_COLS / 2) - 2; // Center (3)

  // Generate new next piece
  state.nextPiece = copyPiece(PIECE_LIST[Math.floor(Math.random() * 7)]);

  // Check if game over (piece can't be placed)
  if (!inLegalPos(state, state.currentPiece)) {
    state.isGameOver = true;
    return false;
  }

  state.timing.lastDropTime = state.tick.count;
  // Next piece is drawn by DrawWindow() in MainLoop
  return true;
}

function copyPiece(src: Piece): Piece {
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

function rotateCw(color: number, grid: number[][]) {
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

function rotateCCw(color: number, grid: number[][]) {
  for (let i = 0; i < 3; i++) {
    rotateCw(color, grid);
  }
}

function inLegalPos(state: InternalGameState, piece: Piece): boolean {
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
          if (state.board[i + off][ht - j]) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function placePiece(state: InternalGameState, piece: Piece): boolean {
  let ok = true;

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (piece.grid[i][j]) {
        if (piece.height - j < BOARD_ROWS) {
          state.board[i + piece.offset][piece.height - j] = piece.grid[i][j];
        } else {
          ok = false;
        }
      }
    }
  }
  return ok;
}

function reduceRows(state: InternalGameState, wasDropOrFreefall: boolean) {
  let bonus = false;
  const rowsToClear = [];

  // Play piece placement sound (exact from original)
  if (wasDropOrFreefall) {
    state.events.push('drop');
  } else {
    state.events.push('stick');
  }

  // Find full rows
  for (let j = 0; j < BOARD_ROWS; j++) {
    let rowFull = true;
    let firstColor = 0;
    let sameColor = true;

    for (let i = 0; i < BOARD_COLS; i++) {
      if (!state.board[i][j]) {
        rowFull = false;
        break;
      }
      if (firstColor === 0) {
        firstColor = state.board[i][j];
      } else if (state.board[i][j] !== firstColor) {
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
    state.rowClearing.rowsToClear = rowsToClear;
    state.rowClearing.clearAnimStartTime = state.tick.count;
    state.rowClearing.clearAnimData = { dropped, bonus, wasDropOrFreefall };

    // Play clear sound immediately
    if (dropped === 1) state.events.push('clear1');
    else if (dropped === 2) state.events.push('clear2');
    else if (dropped === 3) state.events.push('clear3');
    else if (dropped === 4) state.events.push('clear4');
  } else {
    // No rows to clear, spawn next piece immediately
    resetMovementFlags(state);
    startNextPiece(state);
  }
}

function finishRowClearing(state: InternalGameState) {
  if (!state.rowClearing.clearAnimData) {
    return;
  }
  // Called after the yellow flash animation completes
  const { dropped, bonus } = state.rowClearing.clearAnimData;

  // Calculate score (no level multiplier in original!)
  if (dropped === 1) state.score.currentScore += SCORE_1_LINE;
  else if (dropped === 2) state.score.currentScore += SCORE_2_LINES;
  else if (dropped === 3) state.score.currentScore += SCORE_3_LINES;
  else if (dropped === 4) state.score.currentScore += SCORE_4_LINES;

  // Remove rows (from top to bottom to maintain indices)
  state.rowClearing.rowsToClear.sort((a, b) => b - a);
  for (const row of state.rowClearing.rowsToClear) {
    // Shift all rows above down
    for (let j = row; j < BOARD_ROWS - 1; j++) {
      for (let i = 0; i < BOARD_COLS; i++) {
        state.board[i][j] = state.board[i][j + 1];
      }
    }
    // Clear top row
    for (let i = 0; i < BOARD_COLS; i++) {
      state.board[i][BOARD_ROWS - 1] = 0;
    }
  }

  state.score.linesCleared += dropped;

  // Check for board clear bonus
  let boardEmpty = true;
  let tbonus = false;
  for (let i = 0; i < BOARD_COLS && boardEmpty; i++) {
    for (let j = 0; j < BOARD_ROWS && boardEmpty; j++) {
      if (state.board[i][j]) {
        boardEmpty = false;
      }
    }
  }

  if (boardEmpty) {
    tbonus = true;
    state.score.currentScore += SCORE_CLEAR_BOARD_BONUS;
    state.events.push('bigBonus');
  }

  if (bonus) {
    state.score.currentScore += SCORE_SAME_COLOR_BONUS;
    if (!tbonus) {
      state.events.push('smallBonus');
    }
  }

  // Check for level up
  if (
    state.score.linesCleared >= LEVEL_THRESHOLD[state.score.currentLevel] &&
    state.score.currentLevel < 10
  ) {
    state.score.currentLevel++;
    if (!bonus && !tbonus) {
      state.events.push('newLevel');
    }
  }

  // Clear animation state
  state.rowClearing.rowsToClear = [];
  state.rowClearing.clearAnimData = null;

  // Reset movement flags and spawn next piece
  resetMovementFlags(state);
  startNextPiece(state);
}

function resetMovementFlags(state: InternalGameState) {
  state.movement.downKeyActive = false;
  state.movement.pushKeyActive = false;
  state.movement.inFreefall = false;
  state.movement.zippingL = false;
  state.movement.zippingR = false;
  state.movement.zipNow = false;
  state.movement.movePieceSlowly = false;
  state.hardDrop.isHardDropping = false;
}

function handleKeyDown(state: InternalGameState, key: string) {
  // Convert to lowercase
  key = key.toLowerCase();

  // Block all input during hard drop (original was blocking while loop)
  // and during row clearing animation
  if (state.hardDrop.isHardDropping || state.rowClearing.rowsToClear.length)
    return;

  if (state.currentPiece) {
    // Rotate counter-clockwise (K key)
    if (key === 'k') {
      rotateCCw(state.currentPiece.color, state.currentPiece.grid);
      if (!inLegalPos(state, state.currentPiece)) {
        rotateCw(state.currentPiece.color, state.currentPiece.grid);
      }
    }

    // Rotate clockwise (I key or Up arrow)
    if (key === 'i' || key === 'arrowup') {
      rotateCw(state.currentPiece.color, state.currentPiece.grid);
      if (!inLegalPos(state, state.currentPiece)) {
        rotateCCw(state.currentPiece.color, state.currentPiece.grid);
      }
    }

    // Push/Freefall (M key)
    if (key === 'm' && !state.movement.pushKeyActive) {
      state.movement.inFreefall = true;
      state.movement.pushKeyActive = true;
      state.movement.zippingR = false;
      state.movement.zippingL = false;
      state.movement.zipNow = false;
    }

    // Move left (J key or Left arrow)
    if (key === 'j' || key === 'arrowleft') {
      state.movement.zippingR = false;
      if (!state.movement.zippingL) {
        state.movement.zippingL = true;
        state.timing.lastLeftTime = state.tick.count;
        state.currentPiece.offset--;
        if (!inLegalPos(state, state.currentPiece)) {
          state.currentPiece.offset++;
        }
      }
    }

    // Move right (L key or Right arrow)
    if (key === 'l' || key === 'arrowright') {
      state.movement.zippingL = false;
      if (!state.movement.zippingR) {
        state.movement.zippingR = true;
        state.timing.lastRightTime = state.tick.count;
        state.currentPiece.offset++;
        if (!inLegalPos(state, state.currentPiece)) {
          state.currentPiece.offset--;
        }
      }
    }
  }

  // Hard drop (Space or Down arrow) - exact from original handleKeyDown
  // Original shows animated drop row by row, then places piece
  if (
    (key === ' ' || key === 'arrowdown') &&
    !state.movement.downKeyActive &&
    !state.hardDrop.isHardDropping
  ) {
    state.movement.zippingR = false;
    state.movement.zippingL = false;
    state.movement.downKeyActive = true;
    state.movement.movePieceSlowly = false;

    // Start animated hard drop (like original - drops row by row with visual)
    state.hardDrop.isHardDropping = true;
    state.hardDrop.hardDropStartTime = state.tick.count;
  }
}

function processHardDrop(state: InternalGameState) {
  if (!state.hardDrop.isHardDropping || !state.currentPiece) return;

  // Drop one row per tick (original had small delay between rows)
  const currentTicks = state.tick.count;
  if (currentTicks - state.hardDrop.hardDropStartTime >= 1) {
    state.hardDrop.hardDropStartTime = currentTicks;

    state.currentPiece.height--;
    state.pendingDropScore += 1; // Point for hard drop (added when piece lands)

    if (!inLegalPos(state, state.currentPiece)) {
      // Hit bottom or collision
      state.pendingDropScore -= 1; // Don't count the illegal move
      state.currentPiece.height++;
      state.hardDrop.isHardDropping = false;

      // Add pending drop score when piece lands
      state.score.currentScore += state.pendingDropScore;
      state.pendingDropScore = 0;

      if (placePiece(state, state.currentPiece)) {
        reduceRows(state, true); // true = was a drop
      } else {
        state.isGameOver = true;
      }
      state.timing.lastDropTime = state.tick.count;
    }
  }
}

function handleKeyUp(state: InternalGameState, key: string) {
  key = key.toLowerCase();

  if (key === 'j' || key === 'arrowleft') {
    state.movement.zippingL = false;
    state.movement.zipNow = false;
  }
  if (key === 'l' || key === 'arrowright') {
    state.movement.zippingR = false;
    state.movement.zipNow = false;
  }
  if (key === 'm') {
    state.movement.inFreefall = false; // Stop freefall when key released (like original)
    state.movement.pushKeyActive = false;
  }
  if (key === ' ' || key === 'arrowdown') {
    state.movement.downKeyActive = false;
  }
}
