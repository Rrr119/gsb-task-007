import { EMPTY, DIRECTIONS } from '../config.js';

/**
 * 棋型分值表。
 * 数量级刻意拉开：成五 >> 活四 >> 冲四 > 活三 > 眠三 > 活二 > 眠二。
 * 搜索层的 WIN_SCORE 比这里任何叶子分值都大一个量级，因此不会混淆
 * “真的赢了”和“评估分很高”。
 */
export const SCORE = Object.freeze({
  FIVE: 5_000_000,
  OPEN_FOUR: 120_000,
  FOUR: 15_000,
  OPEN_THREE: 10_000,
  THREE: 800,
  OPEN_TWO: 350,
  TWO: 60,
  ONE: 6,
});

/**
 * 方向窗口模式表：以落点为中心取前后各 4 格，共 9 格。
 * 字符含义：'1' 己方棋子，'0' 空点，'2' 对方棋子或棋盘外。
 * 按优先级从高到低匹配，命中即返回，避免同一棋型被重复计分。
 */
const DIR_PATTERNS = [
  { score: SCORE.FIVE, pats: ['11111'] },
  { score: SCORE.OPEN_FOUR, pats: ['011110'] },
  { score: SCORE.FOUR, pats: ['11110', '01111', '11011', '10111', '11101'] },
  { score: SCORE.OPEN_THREE, pats: ['011100', '001110', '011010', '010110'] },
  {
    score: SCORE.THREE,
    pats: [
      '211100',
      '001112',
      '211010',
      '010112',
      '210110',
      '011012',
      '10011',
      '11001',
      '10101',
      '01011',
      '11010',
      '10110',
      '01101',
      '00111',
      '11100',
      '01110',
      '21110',
      '01112',
      '11102',
      '20111',
    ],
  },
  { score: SCORE.OPEN_TWO, pats: ['001100', '011000', '000110', '010100', '001010'] },
  {
    score: SCORE.TWO,
    pats: ['00100', '11000', '00011', '01100', '00110', '01010', '10100', '00101'],
  },
  { score: SCORE.ONE, pats: ['1'] },
];

/**
 * 9 格窗口共有 3^9 = 19683 种取值，直接做全量查表：
 * 命中率极高且零字符串拼接，避免搜索过程中的 GC 压力。
 * 表初值 -1 表示尚未计算。
 */
const WINDOW_CODE_COUNT = 19683;
const WINDOW_TABLE = new Int32Array(WINDOW_CODE_COUNT).fill(-1);
const codeDigits = new Array(9);

function scoreFromCode(code) {
  const cached = WINDOW_TABLE[code];
  if (cached >= 0) return cached;

  let value = code;
  for (let i = 8; i >= 0; i--) {
    const digit = value % 3;
    codeDigits[i] = digit;
    value = (value - digit) / 3;
  }

  let text = '';
  for (let i = 0; i < 9; i++) {
    const digit = codeDigits[i];
    text += digit === 0 ? '0' : digit === 1 ? '1' : '2';
  }

  let score = 0;
  for (let g = 0; g < DIR_PATTERNS.length; g++) {
    const group = DIR_PATTERNS[g];
    for (let p = 0; p < group.pats.length; p++) {
      if (text.includes(group.pats[p])) {
        score = group.score;
        break;
      }
    }
    if (score) break;
  }

  WINDOW_TABLE[code] = score;
  return score;
}

/** 把某个方向上前 4 后 4 共 9 格编码成三进制数 */
export function windowCode(board, r, c, dr, dc, player) {
  const size = board.size;
  const cells = board.cells;
  let code = 0;
  for (let k = -4; k <= 4; k++) {
    let value;
    if (k === 0) {
      value = 1;
    } else {
      const rr = r + k * dr;
      const cc = c + k * dc;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) {
        value = 2;
      } else {
        const cell = cells[rr * size + cc];
        value = cell === EMPTY ? 0 : cell === player ? 1 : 2;
      }
    }
    code = code * 3 + value;
  }
  return code;
}

/**
 * 单点棋型分：假设 player 在 (r,c) 落子，四个方向分别取最高优先级棋型后求和。
 * 用于候选点排序与战术判断，是“棋型启发式”的核心。
 */
export function shapeScore(board, r, c, player) {
  let total = 0;
  for (let d = 0; d < DIRECTIONS.length; d++) {
    total += scoreFromCode(windowCode(board, r, c, DIRECTIONS[d][0], DIRECTIONS[d][1], player));
  }
  return total;
}
