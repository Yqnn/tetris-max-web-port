import type { DisplayMode } from './display';

const SPRITES = {
  highScores: 'sprites/highscores.png',
  about: 'sprites/about.png',
  gameOver: 'sprites/gameover.png',
  pause: 'sprites/pause.png',
  welcome: 'sprites/welcome.png',
  scoreFrame: 'sprites/score_frame.png',
  levelFrame: 'sprites/level_frame.png',
  rowsFrame: 'sprites/rows_frame.png',
};

export type SpriteKey = keyof typeof SPRITES;

const LG_SPRITES: Record<SpriteKey, string> = {
  ...SPRITES,
  gameOver: 'sprites/gameover_lg.png',
  pause: 'sprites/pause_lg.png',
  welcome: 'sprites/welcome_lg.png',
};

const BW_SPRITES: Record<SpriteKey, string> = {
  highScores: 'sprites/highscores_bw.png',
  about: 'sprites/about_bw.png',
  gameOver: 'sprites/gameover_bw.png',
  pause: 'sprites/paused_bw.png',
  welcome: 'sprites/welcome_bw.png',
  scoreFrame: 'sprites/frame_bw.png',
  levelFrame: 'sprites/frame_bw.png',
  rowsFrame: 'sprites/frame_bw.png',
};

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

// Pre-rendered piece block images (16x16 canvas for each color)
const ORIGINAL_BLOCK = 16;
const FULLSCREEN_BLOCK = 22;

export const BG_STYLES = ['default', 'pot_luck'];
export type BGStyle = (typeof BG_STYLES)[number];
export const PIECE_STYLES = ['default', 'diamond', 'spherical'];
export type PieceStyle = (typeof PIECE_STYLES)[number];

export const isPieceStyle = (style: string): style is PieceStyle => {
  return PIECE_STYLES.includes(style as PieceStyle);
};

export const isBGStyle = (style: string): style is BGStyle => {
  return BG_STYLES.includes(style as BGStyle);
};

const getSpritesForMode = (mode: DisplayMode): Record<SpriteKey, string> => {
  if (mode === 'bw') return BW_SPRITES;
  if (mode === 'fullscreen' || mode === 'mobile') return LG_SPRITES;
  return SPRITES;
};

const initMainSprites = async (
  displayMode: DisplayMode
): Promise<Record<SpriteKey, HTMLImageElement>> => {
  const promises = Object.entries(getSpritesForMode(displayMode)).map(
    ([id, sprite]) => {
      return new Promise<[string, HTMLImageElement]>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve([id, image]);
        image.onerror = () => reject(new Error(`Could not load sprite ${id}`));
        image.src = sprite;
      });
    }
  );
  return Object.fromEntries(await Promise.all(promises)) as Record<
    SpriteKey,
    HTMLImageElement
  >;
};

const initBackgroundImages = async (
  bgStyle: BGStyle,
  scale: number
): Promise<CanvasPattern[]> => {
  // Background pattern images (64x64 tiles for each level)
  const promises = BACKGROUND_FILES.map((filename) => {
    return new Promise<CanvasPattern>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error(`Could not get context for background ${filename}`));
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pattern = ctx.createPattern(canvas, 'repeat');
        if (!pattern) {
          reject(
            new Error(`Could not create pattern for background ${filename}`)
          );
          return;
        }
        resolve(pattern);
      };
      img.onerror = () => {
        reject(new Error(`Could not load background ${filename}`));
      };
      img.src = `backgrounds/${bgStyle}/${filename}`;
    });
  });
  return Promise.all(promises);
};

// Create a static BW checkerboard pattern (like classic Mac 50% gray)
const initBwBackgroundPattern = (scale: number): CanvasPattern[] => {
  const canvas = document.createElement('canvas');
  canvas.width = 8 * scale;
  canvas.height = 8 * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get context for BW background');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(2 * scale, 0 * scale, scale, scale);
  ctx.fillRect(4 * scale, 1 * scale, scale, scale);
  ctx.fillRect(1 * scale, 2 * scale, scale, scale);
  ctx.fillRect(6 * scale, 4 * scale, scale, scale);
  const pattern = ctx.createPattern(canvas, 'repeat');
  if (!pattern) throw new Error('Could not create BW background pattern');
  // Return the same pattern for all 10 levels (static, no level changes)
  return new Array(10).fill(pattern);
};

const initPiecesImage = async (
  pieceStyle: PieceStyle,
  scale: number,
  displayMode: DisplayMode
): Promise<HTMLCanvasElement[]> => {
  // BW mode always uses the BW pieces regardless of style
  const isBw = displayMode === 'bw';
  // For default pieces in fullscreen, use native _lg sprite (22px blocks)
  const isLgPieces =
    (displayMode === 'fullscreen' || displayMode === 'mobile') &&
    pieceStyle === 'default';

  let srcFile: string;
  let srcBlockSize: number;
  if (isBw) {
    srcFile = 'sprites/default_pieces_bw.png';
    srcBlockSize = ORIGINAL_BLOCK;
  } else if (isLgPieces) {
    srcFile = 'sprites/default_pieces_lg.png';
    srcBlockSize = FULLSCREEN_BLOCK;
  } else {
    srcFile = `pieces/${pieceStyle}.png`;
    srcBlockSize = ORIGINAL_BLOCK;
  }

  const promises = [...new Array(8)].map((_, i) => {
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const blockCanvas = document.createElement('canvas');
        blockCanvas.width = srcBlockSize * scale;
        blockCanvas.height = srcBlockSize * scale;
        const blockCtx = blockCanvas.getContext('2d');
        if (!blockCtx) {
          reject(new Error(`Could not get context for piece ${i}`));
          return;
        }
        blockCtx.imageSmoothingEnabled = false;
        blockCtx.drawImage(
          img,
          i * srcBlockSize,
          0,
          srcBlockSize,
          srcBlockSize,
          0,
          0,
          srcBlockSize * scale,
          srcBlockSize * scale
        );
        resolve(blockCanvas);
      };
      img.onerror = () => reject(new Error(`Could not load pieces ${srcFile}`));
      img.src = srcFile;
    });
  });
  return Promise.all(promises);
};

export const initSprites = async (
  backgroundStyle: BGStyle,
  pieceStyle: PieceStyle,
  scale: number,
  initialDisplayMode: DisplayMode = 'window'
) => {
  const bgPromise =
    initialDisplayMode === 'bw'
      ? Promise.resolve(initBwBackgroundPattern(scale))
      : initBackgroundImages(backgroundStyle, scale);

  const [mainSprites, backgroundImages, piecesImages] = await Promise.all([
    initMainSprites(initialDisplayMode),
    bgPromise,
    initPiecesImage(pieceStyle, scale, initialDisplayMode),
  ]);
  let displayMode = initialDisplayMode;
  return {
    getMainSprite: (name: SpriteKey) => mainSprites[name],
    getBackgroundImage: (index: number) => backgroundImages[index],
    getPiecesImage: (index: number) => piecesImages[index],
    setBackgroundImages: async (backgroundStyle: BGStyle) => {
      if (displayMode === 'bw') return;
      backgroundImages.splice(
        0,
        backgroundImages.length,
        ...(await initBackgroundImages(backgroundStyle, scale))
      );
    },
    setPiecesImage: async (pieceStyle: PieceStyle) => {
      piecesImages.splice(
        0,
        piecesImages.length,
        ...(await initPiecesImage(pieceStyle, scale, displayMode))
      );
    },
    setDisplayMode: async (mode: DisplayMode, pStyle: PieceStyle) => {
      displayMode = mode;
      const newBg =
        mode === 'bw'
          ? initBwBackgroundPattern(scale)
          : await initBackgroundImages('default', scale);
      const [newMain, newPieces] = await Promise.all([
        initMainSprites(mode),
        initPiecesImage(pStyle, scale, mode),
      ]);
      for (const key of Object.keys(newMain) as SpriteKey[]) {
        mainSprites[key] = newMain[key];
      }
      piecesImages.splice(0, piecesImages.length, ...newPieces);
      backgroundImages.splice(0, backgroundImages.length, ...newBg);
    },
  };
};
