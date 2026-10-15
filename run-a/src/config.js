export const BOARD_SIZE = 15;

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const WALL = 3;

export const RESULT = {
  NONE: 0,
  BLACK: 1,
  WHITE: 2,
  DRAW: 3,
};

export const MODE = {
  PVE: 'pve',
  PVP: 'pvp',
};

export const DIFFICULTY = {
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
};

export const HUMAN_COLOR = BLACK;
export const AI_COLOR = WHITE;

export const STORAGE = {
  CURRENT: 'gomoku.current.v1',
  HISTORY: 'gomoku.history.v1',
  SETTINGS: 'gomoku.settings.v1',
};

export const HISTORY_LIMIT = 12;

export const AI_THINK_LIMIT_MS = 2000;

export const DIFFICULTY_LABEL = {
  [DIFFICULTY.EASY]: '简单',
  [DIFFICULTY.NORMAL]: '普通',
  [DIFFICULTY.HARD]: '困难',
};

export const MODE_LABEL = {
  [MODE.PVE]: '人机对战',
  [MODE.PVP]: '双人对战',
};

export function otherColor(color) {
  return color === BLACK ? WHITE : BLACK;
}

export function colorLabel(color) {
  if (color === BLACK) return '黑方';
  if (color === WHITE) return '白方';
  return '平局';
}
