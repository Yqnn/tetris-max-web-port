import type { DisplayMode } from './display';
import type { Level } from './game.constants';
import type { MusicStyle } from './sound';
import type { PieceStyle, BGStyle } from './sprites';

const LOCAL_STORAGE_KEY = 'tetrisMaxSettings';

export type Settings = {
  piecesStyle: PieceStyle;
  backgroundStyle: BGStyle;
  musicStyle: MusicStyle;
  displayMode: DisplayMode;
  level: Level;
  isMusicOn: boolean;
  isSoundOn: boolean;
};

const isMobile =
  /Android|Mobi|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

export const initSettings = () => {
  const rawSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
  let parsedSettings: Partial<Settings> = {};
  try {
    parsedSettings = JSON.parse(rawSettings ?? '{}');
  } catch (e) {
    console.error('Failed to parse settings', e);
  }
  const settings: Settings = {
    piecesStyle: 'default',
    backgroundStyle: 'default',
    musicStyle: 'peter_wagner',
    displayMode: isMobile ? 'mobile' : 'window',
    level: 1,
    isMusicOn: true,
    isSoundOn: true,
    ...parsedSettings,
  };
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    settings[key] = value;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  };
  return { settings, setSetting };
};
