export type LayoutConfig = {
  WINDOW_WIDTH: number;
  WINDOW_HEIGHT: number;
  BLOCK_SIZE: number;
  BOARD_X: number;
  BOARD_Y: number;
  NEXT_X: number;
  NEXT_Y: number;
  NEXT_SIZE: number;
  SCORE_X: number;
  SCORE_Y: number;
  SCORE_WIDTH: number;
  SCORE_HEIGHT: number;
  SCORE_SPACING: number;
};

export const WINDOW_LAYOUT: LayoutConfig = {
  WINDOW_WIDTH: 500,
  WINDOW_HEIGHT: 330,
  BLOCK_SIZE: 16,
  BOARD_X: 170,
  BOARD_Y: 5,
  NEXT_X: 24,
  NEXT_Y: 4,
  NEXT_SIZE: 96,
  SCORE_X: 380,
  SCORE_Y: 4,
  SCORE_WIDTH: 96,
  SCORE_HEIGHT: 60,
  SCORE_SPACING: 20,
};

export const FULLSCREEN_LAYOUT: LayoutConfig = {
  WINDOW_WIDTH: 640,
  WINDOW_HEIGHT: 480,
  BLOCK_SIZE: 22,
  BOARD_X: 210,
  BOARD_Y: 25,
  NEXT_X: 18,
  NEXT_Y: 24,
  NEXT_SIZE: 132,
  SCORE_X: 534,
  SCORE_Y: 24,
  SCORE_WIDTH: 96,
  SCORE_HEIGHT: 60,
  SCORE_SPACING: 68,
};

export const DISPLAY_MODES = ['window', 'fullscreen'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const getLayout = (mode: DisplayMode): LayoutConfig =>
  mode === 'fullscreen' ? FULLSCREEN_LAYOUT : WINDOW_LAYOUT;

export const isDisplayMode = (value: string): value is DisplayMode =>
  DISPLAY_MODES.includes(value as DisplayMode);
