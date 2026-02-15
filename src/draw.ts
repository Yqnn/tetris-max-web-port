import { BOARD_COLS, BOARD_ROWS } from './game.constants';
import type { initGame } from './game';
import type { initSprites } from './sprites';

export type HighScore = {
  name: string;
  score: number;
  rows: number;
  date: string;
};

export type DrawWindowParams = {
  isShowingHighScores: boolean;
  lastHighScoreIndex: number;
  isShowingWelcomeScreen: boolean;
  isShowingAbout: boolean;
  isGameInProgress: boolean;
  isGamePaused: boolean;
  highScores: HighScore[];
};

// High scores (10 entries max, stored in localStorage)
export const HIGH_SCORE_COUNT = 10;

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

export const initDraw = (
  canvas: HTMLCanvasElement,
  scale: number,
  game: ReturnType<typeof initGame>,
  SPRITES: Awaited<ReturnType<typeof initSprites>>
) => {
  // Scaled dimensions for rendering
  const BLOCK_WIDTH = ORIGINAL.BLOCK_SIZE * scale;
  const BLOCK_HEIGHT = ORIGINAL.BLOCK_SIZE * scale;

  // Scaled positions
  const BOARD_X = ORIGINAL.BOARD_X * scale;
  const BOARD_Y = ORIGINAL.BOARD_Y * scale;
  const BOARD_WIDTH = BOARD_COLS * BLOCK_WIDTH;
  const BOARD_HEIGHT = BOARD_ROWS * BLOCK_HEIGHT;
  const NEXT_X = ORIGINAL.NEXT_X * scale;
  const NEXT_Y = ORIGINAL.NEXT_Y * scale;
  const NEXT_SIZE = ORIGINAL.NEXT_SIZE * scale;
  const SCORE_X = ORIGINAL.SCORE_X * scale;
  const SCORE_Y = ORIGINAL.SCORE_Y * scale;
  const SCORE_WIDTH = ORIGINAL.SCORE_WIDTH * scale;
  const SCORE_HEIGHT = ORIGINAL.SCORE_HEIGHT * scale;
  const SCORE_SPACING = ORIGINAL.SCORE_SPACING * scale;

  function drawClearingAnimation() {
    // Draw yellow flash over rows being cleared (like original gYellowRGB)
    ctx.fillStyle = 'rgb(255, 255, 0)';
    for (const row of game.getRowsToClear()) {
      const y = BOARD_Y + (BOARD_ROWS - 1 - row) * BLOCK_HEIGHT;
      ctx.fillRect(BOARD_X, y, BOARD_WIDTH, BLOCK_HEIGHT);
    }
  }

  // ===========================================
  // RENDERING (single canvas like original)
  // ===========================================

  function drawWindow(params: DrawWindowParams) {
    // Fill with background pattern (scaled 2x)
    const pattern = SPRITES?.getBackgroundImage(game.getCurrentLevel() - 1);
    if (pattern) {
      ctx.fillStyle = pattern;
      if (canvas) {
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Draw Next box
    drawNextBox();

    // Draw main board area
    drawBoardArea(params);

    // Draw score boxes
    drawScoreBoxes();

    // Draw high scores popup if visible
    if (params.isShowingHighScores) {
      drawHighScoresPopup(params);
    }

    if (params.isShowingAbout) {
      drawAboutPopup(params);
    }
  }

  function drawNextBox() {
    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(NEXT_X, NEXT_Y, NEXT_SIZE, NEXT_SIZE);

    // White/blue frame
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = scale;
    ctx.strokeRect(NEXT_X + 1, NEXT_Y + 1, NEXT_SIZE - 2, NEXT_SIZE - 2);

    // "Next:" label
    ctx.fillStyle = '#FFFF00';
    ctx.font = `${9 * scale}px Geneva, Helvetica, sans-serif`;
    ctx.fillText('Next:', NEXT_X + 3 * scale, NEXT_Y + 12 * scale);

    // Draw next piece
    const nextPiece = game.getNextPiece();
    if (nextPiece?.grid) {
      // Piece centering offsets (from original drawNext)
      let xOffset = 0;
      let yOffset = 0;

      switch (nextPiece.color) {
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
          if (nextPiece.grid[i] && nextPiece.grid[i][j]) {
            const x = baseX + i * BLOCK_WIDTH;
            const y = baseY + j * BLOCK_HEIGHT;
            const colorIndex = nextPiece.color;

            const piecesImage = SPRITES?.getPiecesImage(colorIndex);
            if (colorIndex >= 0 && colorIndex < 7 && piecesImage) {
              ctx.drawImage(piecesImage, x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
            }
          }
        }
      }
    }
  }

  function drawBoardArea({
    isShowingWelcomeScreen,
    isGameInProgress,
    isGamePaused,
  }: DrawWindowParams) {
    // Show welcome screen if game hasn't started yet
    if (isShowingWelcomeScreen) {
      drawWelcome();
      return;
    }

    // Black background for board
    ctx.fillStyle = '#000000';
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);

    // Draw placed blocks
    drawBoard();

    // Draw current piece (but not during row clearing animation)
    if (
      game.getCurrentPiece() &&
      isGameInProgress &&
      !game.getRowsToClear().length
    ) {
      drawPiece();
    }

    // Draw yellow flash during row clearing animation
    if (game.getRowsToClear().length) {
      drawClearingAnimation();
    }

    // White frame around board
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = scale;
    ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD_WIDTH + 2, BOARD_HEIGHT + 2);

    // Draw pause or game over overlay
    if (isGamePaused) {
      drawOverlayScreen('pause');
    } else if (!isGameInProgress && game.getCurrentPiece()) {
      drawOverlayScreen('gameover');
    }
  }

  function drawScoreBoxes() {
    // Original: each box frame is 98x63 pixels (PICT 260/261/262)
    // Values drawn in gGrayRGB (RGB 20000/65535 ≈ 30% = #4E4E4E)
    // Values: 18pt normal, right-aligned at x=89, y=50

    const frameImages = [
      SPRITES?.getMainSprite('scoreFrame'),
      SPRITES?.getMainSprite('levelFrame'),
      SPRITES?.getMainSprite('rowsFrame'),
    ];
    const values = [
      game.getScore(),
      game.getCurrentLevel(),
      game.getLinesCleared(),
    ];

    // Frame dimensions from PICT (98x63), scale to our display
    const FRAME_WIDTH = 98 * scale;
    const FRAME_HEIGHT = 63 * scale;

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
        ctx.lineWidth = scale;
        ctx.strokeRect(
          SCORE_X + scale * 0.5,
          boxY + scale * 0.5,
          SCORE_WIDTH - scale,
          SCORE_HEIGHT - scale
        );
      }

      // Value (gray, exactly like original - right aligned at x=89, y=50)
      // Original gGrayRGB = RGB(20000, 20000, 20000) = #4E4E4E
      ctx.fillStyle = '#4E4E4E';
      ctx.font = `${18 * scale}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'right';
      ctx.fillText(String(values[i]), SCORE_X + 89 * scale, boxY + 50 * scale);
    }

    ctx.textAlign = 'left';
  }

  // Draw welcome screen (original PICT 258) - shown before game starts
  function drawWelcome() {
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
    ctx.lineWidth = scale;
    ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD_WIDTH + 2, BOARD_HEIGHT + 2);
  }

  // Draw pause/game over overlay using extracted original images (scaled)
  function drawOverlayScreen(type: 'pause' | 'gameover') {
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
      ctx.font = `bold ${16 * scale}px Geneva, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        type === 'pause' ? 'PAUSED' : 'game OVER',
        overlayX + overlayWidth / 2,
        overlayY + overlayHeight / 2
      );
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawBoard() {
    const board = game.getGameBoard();
    if (!board) return;

    for (let i = 0; i < BOARD_COLS; i++) {
      if (!board[i]) continue;
      for (let j = 0; j < BOARD_ROWS; j++) {
        if (board[i][j]) {
          const colorIndex = board[i][j] - 1;
          if (colorIndex >= 0 && colorIndex < 7) {
            drawBlockAt(
              BOARD_X + i * BLOCK_WIDTH,
              BOARD_Y + (BOARD_ROWS - 1 - j) * BLOCK_HEIGHT,
              colorIndex
            );
          }
        }
      }
    }
  }

  function drawPiece() {
    const currentPiece = game.getCurrentPiece();
    if (!currentPiece?.grid) return;

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (currentPiece.grid[i] && currentPiece.grid[i][j]) {
          const boardCol = i + currentPiece.offset;
          const boardRow = currentPiece.height - j;

          // Only draw if within valid board bounds
          if (
            boardRow >= 0 &&
            boardRow < BOARD_ROWS &&
            boardCol >= 0 &&
            boardCol < BOARD_COLS
          ) {
            const colorIndex = currentPiece.grid[i][j] - 1;
            if (colorIndex >= 0 && colorIndex < 7) {
              drawBlockAt(
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

  function drawBlockAt(x: number, y: number, colorIndex: number) {
    // Use pre-rendered block graphics scaled
    const piecesImage = SPRITES?.getPiecesImage(colorIndex);
    if (piecesImage) {
      ctx.drawImage(piecesImage, x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
    }
  }

  // Draw about popup overlay (image only, Mac OS 9 style border)
  function drawAboutPopup({ isShowingAbout }: DrawWindowParams) {
    if (!isShowingAbout) return;

    // About image: use loaded image size (reference ~700x410 / 800x480)
    const IMG_WIDTH = 477;
    const IMG_HEIGHT = 244;
    const PADDING = 3; // No padding around image
    const BORDER_WIDTH = 3; // Same as high scores (3px bevel)

    const drawW = IMG_WIDTH * scale;
    const drawH = IMG_HEIGHT * scale;
    const POPUP_WIDTH = drawW + PADDING * 2 * scale + BORDER_WIDTH * 2 * scale;
    const POPUP_HEIGHT = drawH + PADDING * 2 * scale + BORDER_WIDTH * 2 * scale;
    const POPUP_X =
      scale * Math.floor((canvas.width - POPUP_WIDTH) / 2 / scale);
    const POPUP_Y =
      scale * Math.floor((canvas.height - POPUP_HEIGHT) / 2 / scale);

    // Drop shadow
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      POPUP_X + 2 * scale,
      POPUP_Y + 2 * scale,
      POPUP_WIDTH - scale,
      POPUP_HEIGHT - scale
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
        POPUP_X + offset * scale,
        POPUP_Y + offset * scale,
        POPUP_WIDTH - offset * 2 * scale,
        scale
      );

      // Left edge
      ctx.fillRect(
        POPUP_X + offset * scale,
        POPUP_Y + offset * scale,
        scale,
        POPUP_HEIGHT - offset * 2 * scale
      );

      // Bottom edge
      ctx.fillStyle = borderColors.bottomRight[i];
      ctx.fillRect(
        POPUP_X + offset * scale,
        POPUP_Y + POPUP_HEIGHT - offset * scale - scale,
        POPUP_WIDTH - offset * 2 * scale,
        scale
      );

      // Right edge
      ctx.fillRect(
        POPUP_X + POPUP_WIDTH - offset * scale - scale,
        POPUP_Y + offset * scale,
        scale,
        POPUP_HEIGHT - offset * 2 * scale
      );
    }

    // Draw about image centered
    const CONTENT_X = POPUP_X + BORDER_WIDTH * scale + PADDING * scale;
    const CONTENT_Y = POPUP_Y + BORDER_WIDTH * scale + PADDING * scale;

    const aboutImage = SPRITES?.getMainSprite('about');
    if (aboutImage?.complete) {
      ctx.drawImage(aboutImage, CONTENT_X, CONTENT_Y, drawW, drawH);
    }
  }

  // Draw high scores popup overlay
  function drawHighScoresPopup({
    isShowingHighScores,
    lastHighScoreIndex,
    highScores,
  }: DrawWindowParams) {
    if (!isShowingHighScores) return;

    const POPUP_WIDTH = 452 * scale;
    const POPUP_HEIGHT = 308 * scale;
    const POPUP_X = (canvas.width - POPUP_WIDTH) / 2;
    const POPUP_Y = (canvas.height - POPUP_HEIGHT) / 2;

    // Drop shadow (1px right, 1px bottom, plain black)
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      POPUP_X + 2 * scale,
      POPUP_Y + 2 * scale,
      POPUP_WIDTH - scale,
      POPUP_HEIGHT - scale
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
        POPUP_X + offset * scale,
        POPUP_Y + offset * scale,
        POPUP_WIDTH - offset * 2 * scale,
        scale
      );

      // Left edge
      ctx.fillRect(
        POPUP_X + offset * scale,
        POPUP_Y + offset * scale,
        scale,
        POPUP_HEIGHT - offset * 2 * scale
      );

      // Bottom edge
      ctx.fillStyle = borderColors.bottomRight[i];
      ctx.fillRect(
        POPUP_X + offset * scale,
        POPUP_Y + POPUP_HEIGHT - offset * scale - scale,
        POPUP_WIDTH - offset * 2 * scale,
        scale
      );

      // Right edge
      ctx.fillRect(
        POPUP_X + POPUP_WIDTH - offset * scale - scale,
        POPUP_Y + offset * scale,
        scale,
        POPUP_HEIGHT - offset * 2 * scale
      );
    }

    // Fill interior with black (inside the 3px border)
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      POPUP_X + 3 * scale,
      POPUP_Y + 3 * scale,
      POPUP_WIDTH - 6 * scale,
      POPUP_HEIGHT - 6 * scale
    );

    // Content area starts after the 3px border
    const BORDER_WIDTH = 3 * scale;
    const CONTENT_X = POPUP_X + BORDER_WIDTH;
    const CONTENT_Y = POPUP_Y + BORDER_WIDTH;

    // Draw header image (PICT 259, 220x50, centered at x=109 in content area)
    // Original: SetRect(&r,109,0,329,50); drawPicture(h,&r);
    const highScoresImage = SPRITES?.getMainSprite('highScores');
    if (highScoresImage?.complete) {
      const headerX = CONTENT_X + 109 * scale + 3 * scale;
      const headerY = CONTENT_Y + 3 * scale;
      ctx.drawImage(highScoresImage, headerX, headerY, 220 * scale, 50 * scale);
    }

    // Column headers (original: TextFont(2); TextSize(14); TextFace(4))
    // TextFace(4) = italic
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${15 * scale}px "Times New Roman", serif`;

    const ROW_START_Y = CONTENT_Y + 62 * scale;
    const ROW_HEIGHT = 22 * scale;

    // Column positions (from original, relative to content area)
    const COL_NAME_X = CONTENT_X + 14 * scale;
    const COL_SCORE_X = CONTENT_X + 256 * scale;
    const COL_ROWS_X = CONTENT_X + 320 * scale;
    const COL_DATE_X = CONTENT_X + 335 * scale;

    ctx.textAlign = 'left';
    ctx.fillText('Name', COL_NAME_X, ROW_START_Y);
    const { width: nameWidth } = ctx.measureText('Name');
    ctx.fillRect(COL_NAME_X, ROW_START_Y + scale, nameWidth, scale);

    ctx.textAlign = 'right';
    ctx.fillText('Score', COL_SCORE_X, ROW_START_Y);
    const { width: scoreWidth } = ctx.measureText('Score');
    ctx.fillRect(
      COL_SCORE_X - scoreWidth,
      ROW_START_Y + scale,
      scoreWidth,
      scale
    );

    ctx.fillText('Rows', COL_ROWS_X, ROW_START_Y);
    const { width: rowsWidth } = ctx.measureText('Rows');
    ctx.fillRect(COL_ROWS_X - rowsWidth, ROW_START_Y + scale, rowsWidth, scale);

    ctx.textAlign = 'left';
    ctx.fillText('Date', COL_DATE_X, ROW_START_Y);
    const { width: dateWidth } = ctx.measureText('Date');
    ctx.fillRect(COL_DATE_X, ROW_START_Y + scale, dateWidth, scale);

    // Draw each high score entry (original: TextFace(0) for normal)
    ctx.font = `${15 * scale}px "Times New Roman", serif`;

    for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
      const entry = highScores[i];
      const y = ROW_START_Y + (i + 1) * ROW_HEIGHT + 3 * scale;

      // Highlight player's recent high score in yellow (like original)
      if (i === lastHighScoreIndex) {
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

  const ctx = getContext(canvas);

  // Set canvas size to original 500x330 scaled 2x = 1000x660
  canvas.width = ORIGINAL.WINDOW_WIDTH * scale;
  canvas.height = ORIGINAL.WINDOW_HEIGHT * scale;

  // Disable image smoothing for pixel-perfect scaling (crisp retro look)
  // Must be set AFTER canvas resize as some browsers reset this property
  ctx.imageSmoothingEnabled = false;

  // Show loading message
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${12 * scale}px Geneva, Helvetica, sans-serif`;
  ctx.fillText('Loading assets...', 20, canvas.height / 2);

  return drawWindow;
};

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get context');
  }
  return ctx;
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
