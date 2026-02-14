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

const initMainSprites = async (): Promise<
  Record<SpriteKey, HTMLImageElement>
> => {
  const promises = Object.entries(SPRITES).map(([id, sprite]) => {
    return new Promise<[string, HTMLImageElement]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([id, image]);
      image.onerror = () => reject(new Error(`Could not load sprite ${id}`));
      image.src = sprite;
    });
  });
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

const initPiecesImage = async (
  pieceStyle: PieceStyle,
  scale: number
): Promise<HTMLCanvasElement[]> => {
  const promises = [...new Array(8)].map((_, i) => {
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const blockCanvas = document.createElement('canvas');
        blockCanvas.width = ORIGINAL_BLOCK * scale;
        blockCanvas.height = ORIGINAL_BLOCK * scale;
        const blockCtx = blockCanvas.getContext('2d');
        if (!blockCtx) {
          reject(new Error(`Could not get context for piece ${i}`));
          return;
        }
        blockCtx.imageSmoothingEnabled = false;
        blockCtx.drawImage(
          img,
          i * ORIGINAL_BLOCK,
          0, // Source x, y (original 16x16 positions)
          ORIGINAL_BLOCK,
          ORIGINAL_BLOCK, // Source width, height
          0,
          0, // Dest x, y
          ORIGINAL_BLOCK * scale,
          ORIGINAL_BLOCK * scale // Dest scaled size
        );
        resolve(blockCanvas);
      };
      img.src = `pieces/${pieceStyle}.png`;
    });
  });
  return Promise.all(promises);
};

export const initSprites = async (
  backgroundStyle: BGStyle,
  pieceStyle: PieceStyle,
  scale: number
) => {
  const [mainSprites, backgroundImages, piecesImages] = await Promise.all([
    initMainSprites(),
    initBackgroundImages(backgroundStyle, scale),
    initPiecesImage(pieceStyle, scale),
  ]);
  return {
    getMainSprite: (name: SpriteKey) => mainSprites[name],
    getBackgroundImage: (index: number) => backgroundImages[index],
    getPiecesImage: (index: number) => piecesImages[index],
    setBackgroundImages: async (backgroundStyle: BGStyle) => {
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
        ...(await initPiecesImage(pieceStyle, scale))
      );
    },
  };
};
