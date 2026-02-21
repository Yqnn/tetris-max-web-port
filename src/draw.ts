import { BOARD_COLS, BOARD_ROWS } from './game.constants';
import type { initGame } from './game';
import type { initSprites } from './sprites';
import { HIGH_SCORE_COUNT, type HighScore } from './high-scores';
import type { DisplayMode, LayoutConfig } from './display';

export type DrawWindowParams = {
  isShowingHighScores: boolean;
  lastHighScoreIndex: number;
  isShowingWelcomeScreen: boolean;
  isShowingAbout: boolean;
  isGameInProgress: boolean;
  isGamePaused: boolean;
  highScores: HighScore[];
};

export const initDraw = (
  canvas: HTMLCanvasElement,
  scale: number,
  game: ReturnType<typeof initGame>,
  initialLayout: LayoutConfig,
  initialDisplayMode: DisplayMode = 'window'
) => {
  // Mutable scaled dimensions for rendering
  let BLOCK_WIDTH = 0,
    BLOCK_HEIGHT = 0,
    // Mutable scaled positions
    BOARD_X = 0,
    BOARD_Y = 0,
    BOARD_WIDTH = 0,
    BOARD_HEIGHT = 0,
    NEXT_X = 0,
    NEXT_Y = 0,
    NEXT_SIZE = 0,
    SCORE_X = 0,
    SCORE_Y = 0,
    SCORE_HEIGHT = 0,
    SCORE_SPACING = 0;

  let isBw = initialDisplayMode === 'bw';

  function applyLayout(layout: LayoutConfig) {
    BLOCK_WIDTH = layout.BLOCK_SIZE * scale;
    BLOCK_HEIGHT = layout.BLOCK_SIZE * scale;
    BOARD_X = layout.BOARD_X * scale;
    BOARD_Y = layout.BOARD_Y * scale;
    BOARD_WIDTH = BOARD_COLS * BLOCK_WIDTH;
    BOARD_HEIGHT = BOARD_ROWS * BLOCK_HEIGHT;
    NEXT_X = layout.NEXT_X * scale;
    NEXT_Y = layout.NEXT_Y * scale;
    NEXT_SIZE = layout.NEXT_SIZE * scale;
    SCORE_X = layout.SCORE_X * scale;
    SCORE_Y = layout.SCORE_Y * scale;
    SCORE_HEIGHT = layout.SCORE_HEIGHT * scale;
    SCORE_SPACING = layout.SCORE_SPACING * scale;

    canvas.width = layout.WINDOW_WIDTH * scale;
    canvas.height = layout.WINDOW_HEIGHT * scale;

    // Browsers reset context state on canvas resize
    ctx.imageSmoothingEnabled = false;
  }

  function drawClearingAnimation() {
    ctx.fillStyle = isBw ? '#FFFFFF' : 'rgb(255, 255, 0)';
    for (const row of game.getRowsToClear()) {
      const y = BOARD_Y + (BOARD_ROWS - 1 - row) * BLOCK_HEIGHT;
      ctx.fillRect(BOARD_X, y, BOARD_WIDTH, BLOCK_HEIGHT);
    }
  }

  function drawWindow(params: DrawWindowParams) {
    const pattern = sprites?.getBackgroundImage(game.getCurrentLevel() - 1);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawNextBox();
    drawBoardArea(params);
    drawScoreBoxes();
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

    // "Next:" label — white in BW mode, yellow in color
    ctx.fillStyle = isBw ? '#FFFFFF' : '#FFFF00';
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

            const piecesImage = sprites?.getPiecesImage(colorIndex);
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
    if (isShowingWelcomeScreen) {
      drawWelcome();
      return;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);

    drawBoard();
    if (game.getCurrentPiece() && !game.getRowsToClear().length) {
      drawPiece();
    }

    if (game.getRowsToClear().length) {
      drawClearingAnimation();
    }

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = scale;
    ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD_WIDTH + 2, BOARD_HEIGHT + 2);

    if (isGamePaused) {
      drawOverlayScreen('pause');
    } else if (!isGameInProgress && game.getCurrentPiece()) {
      drawOverlayScreen('gameover');
    }
  }

  function drawScoreBoxes() {
    const frameImages = [
      sprites?.getMainSprite('scoreFrame'),
      sprites?.getMainSprite('levelFrame'),
      sprites?.getMainSprite('rowsFrame'),
    ];
    const values = [
      game.getScore(),
      game.getCurrentLevel(),
      game.getLinesCleared(),
    ];
    const labels = ['score', 'level', 'rows'];

    const FRAME_WIDTH = 98 * scale;
    const FRAME_HEIGHT = 63 * scale;

    for (let i = 0; i < 3; i++) {
      const boxY = SCORE_Y + i * (SCORE_HEIGHT + SCORE_SPACING);
      const frameImg = frameImages[i];

      if (frameImg?.complete) {
        ctx.drawImage(frameImg, SCORE_X, boxY, FRAME_WIDTH, FRAME_HEIGHT);
      }

      // In BW mode, the frame has no labels — draw them programmatically
      if (isBw) {
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${14 * scale}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = 'left';
        const labelX = i === 0 ? 25 : 30;
        ctx.fillText(labels[i], SCORE_X + labelX * scale, boxY + 20 * scale);
      }

      // Score values — white in BW, dark gray in color
      ctx.fillStyle = isBw ? '#FFFFFF' : '#4E4E4E';
      ctx.font = `${18 * scale}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'right';
      ctx.fillText(String(values[i]), SCORE_X + 89 * scale, boxY + 50 * scale);
    }

    ctx.textAlign = 'left';
  }

  function drawWelcome() {
    const welcomeImage = sprites?.getMainSprite('welcome');
    if (welcomeImage?.complete) {
      ctx.drawImage(welcomeImage, BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);
    }

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = scale;
    ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD_WIDTH + 2, BOARD_HEIGHT + 2);
  }

  function drawOverlayScreen(type: 'pause' | 'gameover') {
    const overlayX = BOARD_X;
    const overlayY = BOARD_Y + 7 * BLOCK_HEIGHT;
    const overlayWidth = BOARD_WIDTH;
    const overlayHeight = 5 * BLOCK_HEIGHT;

    const img = sprites?.getMainSprite(type === 'pause' ? 'pause' : 'gameOver');

    if (img?.complete) {
      ctx.drawImage(img, overlayX, overlayY, overlayWidth, overlayHeight);
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
    const piecesImage = sprites?.getPiecesImage(colorIndex);
    if (piecesImage) {
      ctx.drawImage(piecesImage, x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
    }
  }

  function drawBeveledBorder(
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    if (isBw) {
      // BW mode: 5px white (internal) then 1px black (external)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, width, scale); // Top
      ctx.fillRect(x, y, scale, height); // Left
      ctx.fillRect(x, y + height - scale, width, scale); // Bottom
      ctx.fillRect(x + width - scale, y, scale, height); // Right
      return;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 2 * scale, y + 2 * scale, width - scale, height - scale);
    ctx.fillRect(x, y, width, height);

    const borderColors = {
      topLeft: ['#000000', '#BBBBBB', '#FFFFFF'],
      bottomRight: ['#000000', '#555555', '#999999'],
    };

    for (let i = 0; i < 3; i++) {
      const offset = i;

      // Top edge
      ctx.fillStyle = borderColors.topLeft[i];
      ctx.fillRect(
        x + offset * scale,
        y + offset * scale,
        width - offset * 2 * scale,
        scale
      );

      // Left edge
      ctx.fillRect(
        x + offset * scale,
        y + offset * scale,
        scale,
        height - offset * 2 * scale
      );

      // Bottom edge
      ctx.fillStyle = borderColors.bottomRight[i];
      ctx.fillRect(
        x + (offset + 1) * scale,
        y + height - offset * scale - scale,
        width - (offset * 2 + 1) * scale,
        scale
      );

      // Right edge
      ctx.fillRect(
        x + width - offset * scale - scale,
        y + (offset + 1) * scale,
        scale,
        height - (offset * 2 + 1) * scale
      );
    }

    // Let's be pixel perfect
    ctx.fillStyle = borderColors.topLeft[1];
    ctx.fillRect(width + x - 3 * scale, y + 2 * scale, scale, scale);
    ctx.fillRect(x + 2 * scale, height + y - 3 * scale, scale, scale);
  }

  function drawAboutPopup({ isShowingAbout }: DrawWindowParams) {
    if (!isShowingAbout) return;

    const aboutImage = sprites?.getMainSprite('about');
    if (!aboutImage?.complete) return;

    // Use image natural dimensions (differs between color 477x244 and BW 477x246)
    const IMG_WIDTH = aboutImage.naturalWidth;
    const IMG_HEIGHT = aboutImage.naturalHeight;
    const PADDING = 3;
    const BORDER_WIDTH = 3;

    const drawW = IMG_WIDTH * scale;
    const drawH = IMG_HEIGHT * scale;
    const POPUP_WIDTH = drawW + PADDING * 2 * scale + BORDER_WIDTH * 2 * scale;
    const POPUP_HEIGHT = drawH + PADDING * 2 * scale + BORDER_WIDTH * 2 * scale;
    const POPUP_X =
      scale * Math.floor((canvas.width - POPUP_WIDTH) / 2 / scale);
    const POPUP_Y =
      scale * Math.floor((canvas.height - POPUP_HEIGHT) / 2 / scale);

    drawBeveledBorder(POPUP_X, POPUP_Y, POPUP_WIDTH, POPUP_HEIGHT);

    // Draw about image centered
    const CONTENT_X = POPUP_X + BORDER_WIDTH * scale + PADDING * scale;
    const CONTENT_Y = POPUP_Y + BORDER_WIDTH * scale + PADDING * scale;

    ctx.drawImage(aboutImage, CONTENT_X, CONTENT_Y, drawW, drawH);
  }

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

    drawBeveledBorder(POPUP_X, POPUP_Y, POPUP_WIDTH, POPUP_HEIGHT);

    // Fill interior with black (inside the 3px border)
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      POPUP_X + 3 * scale,
      POPUP_Y + 3 * scale,
      POPUP_WIDTH - 6 * scale,
      POPUP_HEIGHT - 6 * scale
    );

    const BORDER_WIDTH = 3 * scale;
    const CONTENT_X = POPUP_X + BORDER_WIDTH;
    const CONTENT_Y = POPUP_Y + BORDER_WIDTH;

    const highScoresImage = sprites?.getMainSprite('highScores');
    if (highScoresImage?.complete) {
      const headerX = CONTENT_X + 109 * scale + 3 * scale;
      const headerY = CONTENT_Y + 3 * scale;
      ctx.drawImage(highScoresImage, headerX, headerY, 220 * scale, 50 * scale);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${15 * scale}px "Times New Roman", serif`;

    const ROW_START_Y = CONTENT_Y + 62 * scale;
    const ROW_HEIGHT = 22 * scale;

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

    // Draw each high score entry
    ctx.font = `${15 * scale}px "Times New Roman", serif`;

    for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
      const entry = highScores[i];
      const y = ROW_START_Y + (i + 1) * ROW_HEIGHT + 3 * scale;

      if (i === lastHighScoreIndex) {
        if (isBw) {
          // BW mode: bold + slightly larger instead of yellow
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${16 * scale}px "Times New Roman", serif`;
        } else {
          ctx.fillStyle = '#FFFF00'; // gYellowRGB
        }
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${15 * scale}px "Times New Roman", serif`;
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
  let sprites: Awaited<ReturnType<typeof initSprites>> | null = null;

  applyLayout(initialLayout);

  // Show loading message
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${12 * scale}px Geneva, Helvetica, sans-serif`;
  ctx.fillText('Loading assets...', 20, canvas.height / 2);

  return {
    drawWindow,
    setSprites: (s: Awaited<ReturnType<typeof initSprites>>) => (sprites = s),
    setLayout: applyLayout,
    setDisplayMode: (mode: DisplayMode) => {
      isBw = mode === 'bw';
    },
  };
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
