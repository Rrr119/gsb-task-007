import { BOARD_SIZE, EMPTY } from '../config.js';
import { SCORE } from './patterns.js';

/**
 * 全盘棋型评估（供搜索叶子节点使用）。
 *
 * 预先把棋盘切成 4 个方向的全部“线”（15 横 + 15 竖 + 29 + 29 斜），
 * 每条线一次扫描即可统计出双方的各种棋型：
 *   成五 / 活四 / 冲四（含跳四 11011 等断点四）/ 活三 / 眠三 / 活二 / 眠二 …
 * 这样每条线的成本是 O(len)，整盘评估成本可控。
 */

const LINE_INDICES = buildLines(BOARD_SIZE);
const scratch = new Int8Array(BOARD_SIZE);

function buildLines(size) {
  const lines = [];
  const push = (r0, c0, dr, dc) => {
    const indices = [];
    let r = r0;
    let c = c0;
    while (r >= 0 && r < size && c >= 0 && c < size) {
      indices.push(r * size + c);
      r += dr;
      c += dc;
    }
    if (indices.length > 1) lines.push(Int16Array.from(indices));
  };

  for (let r = 0; r < size; r++) push(r, 0, 0, 1);
  for (let c = 0; c < size; c++) push(0, c, 1, 0);
  for (let c = 0; c < size; c++) push(0, c, 1, 1);
  for (let r = 1; r < size; r++) push(r, 0, 1, 1);
  for (let c = 0; c < size; c++) push(0, c, 1, -1);
  for (let r = 1; r < size; r++) push(r, size - 1, 1, -1);

  return lines;
}

function runScore(length, openEnds) {
  if (length >= 5) return SCORE.FIVE;
  if (length === 4) {
    if (openEnds === 2) return SCORE.OPEN_FOUR;
    if (openEnds === 1) return SCORE.FOUR;
    return 0;
  }
  if (length === 3) {
    if (openEnds === 2) return SCORE.OPEN_THREE;
    if (openEnds === 1) return SCORE.THREE;
    return 0;
  }
  if (length === 2) {
    if (openEnds === 2) return SCORE.OPEN_TWO;
    if (openEnds === 1) return SCORE.TWO;
    return 0;
  }
  if (openEnds === 2) return SCORE.ONE * 2;
  if (openEnds === 1) return SCORE.ONE;
  return 0;
}

/**
 * 扫描一条线中 target 一方的棋型得分。
 * scratch 中：0 空、1 表示属于 player、2 表示属于对手。
 */
function scanLine(length, target, stoneCount) {
  let score = 0;

  for (let i = 0; i < length; i++) {
    if (scratch[i] !== target) continue;
    let j = i + 1;
    while (j < length && scratch[j] === target) j++;
    const runLength = j - i;
    const openEnds =
      (i > 0 && scratch[i - 1] === 0 ? 1 : 0) + (j < length && scratch[j] === 0 ? 1 : 0);
    score += runScore(runLength, openEnds);
    i = j - 1;
  }

  // 断点四（11011 / 10111 / 11101）：五格窗口内 4 子 1 空且空位在中间
  if (stoneCount >= 4) {
    for (let i = 0; i + 5 <= length; i++) {
      let stones = 0;
      let gap = -1;
      let blocked = false;
      for (let k = 0; k < 5; k++) {
        const v = scratch[i + k];
        if (v === target) stones++;
        else if (v !== 0) {
          blocked = true;
          break;
        } else {
          gap = k;
        }
      }
      if (blocked || stones !== 4) continue;
      if (gap > 0 && gap < 4) score += SCORE.FOUR;
    }
  }

  return score;
}

/**
 * 返回以 player 为视角的盘面分（自己 - 对手 * 1.15）。
 * 1.15 的防守系数让 AI 对对手的成型威胁稍微更敏感一点。
 */
export function evaluateBoard(board, player) {
  const cells = board.cells;
  let mine = 0;
  let theirs = 0;

  for (let li = 0; li < LINE_INDICES.length; li++) {
    const line = LINE_INDICES[li];
    const n = line.length;
    let myCount = 0;
    let oppCount = 0;

    for (let i = 0; i < n; i++) {
      const value = cells[line[i]];
      if (value === EMPTY) {
        scratch[i] = 0;
      } else if (value === player) {
        scratch[i] = 1;
        myCount++;
      } else {
        scratch[i] = 2;
        oppCount++;
      }
    }

    if (myCount) mine += scanLine(n, 1, myCount);
    if (oppCount) theirs += scanLine(n, 2, oppCount);
  }

  return mine - theirs * 1.15;
}

export const LINE_COUNT = LINE_INDICES.length;
