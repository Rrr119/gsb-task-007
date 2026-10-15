/**
 * 全局常量与通用工具。
 * 所有模块共享的枚举、尺寸、AI 参数、存储键都集中在这里，避免散落魔数。
 */

export const BOARD_SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const WIN_COUNT = 5;

/** 四个扫描方向：横、竖、主对角、副对角 */
export const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]);

export const MODE = Object.freeze({ PVE: 'pve', PVP: 'pvp' });
export const DIFFICULTY = Object.freeze({ EASY: 'easy', NORMAL: 'normal', HARD: 'hard' });
export const STATUS = Object.freeze({ PLAYING: 'playing', THINKING: 'thinking', OVER: 'over' });
export const RESULT = Object.freeze({ BLACK: 'black', WHITE: 'white', DRAW: 'draw' });

/** 人机对战里玩家固定执黑先行 */
export const HUMAN_COLOR = BLACK;

/** 每档难度的思考时间上限（毫秒，硬性要求困难档 <= 2000ms） */
export const AI_TIME_LIMIT = Object.freeze({ easy: 60, normal: 500, hard: 2000 });
/** 每档难度的搜索深度上限（迭代加深不会超过它） */
export const AI_MAX_DEPTH = Object.freeze({ easy: 0, normal: 4, hard: 8 });
/** 每档难度的候选分支数上限，控制搜索规模 */
export const AI_BRANCH = Object.freeze({ easy: 0, normal: 8, hard: 12 });

export const HISTORY_LIMIT = 12;

export const STORAGE_KEY_CURRENT = 'gomoku.current.v1';
export const STORAGE_KEY_HISTORY = 'gomoku.history.v1';
export const STORAGE_KEY_SETTINGS = 'gomoku.settings.v1';

export const DIFFICULTY_LABEL = Object.freeze({
  easy: '简单',
  normal: '普通',
  hard: '困难',
});

export const DIFFICULTY_HINT = Object.freeze({
  easy: '随机选点为主，只会挡下“下一步成五”的明显杀招。',
  normal: '棋型启发式评估 + 浅层搜索，会自己做活二、活三并主动进攻。',
  hard: 'Alpha-Beta 剪枝 minimax + 完整棋型评估，思考不超过 2 秒。',
});

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function playerName(player) {
  return player === BLACK ? '黑棋' : '白棋';
}

export function resultToPlayer(result) {
  if (result === RESULT.BLACK) return BLACK;
  if (result === RESULT.WHITE) return WHITE;
  return EMPTY;
}

export function resultLabel(result, mode) {
  if (result === RESULT.DRAW) return '平局';
  const isHumanWin = mode === MODE.PVE && resultToPlayer(result) === HUMAN_COLOR;
  const who = result === RESULT.BLACK ? '黑棋胜' : '白棋胜';
  if (mode === MODE.PVE) return isHumanWin ? `${who} · 你赢了` : `${who} · AI 获胜`;
  return who;
}
