import { DIRECTIONS, WIN_COUNT, EMPTY } from '../config.js';

/**
 * 胜负判定：横、竖、斜任一方向连成 5 子（或更长）即为胜利。
 * 提供两个版本：
 * - hasFive：只做计数，零分配，供 AI 搜索的高频路径使用；
 * - findWinLine：返回获胜棋子坐标，供界面高亮连线使用。
 */
export function hasFive(board, r, c, player) {
  const size = board.size;
  const cells = board.cells;
  for (let d = 0; d < DIRECTIONS.length; d++) {
    const dr = DIRECTIONS[d][0];
    const dc = DIRECTIONS[d][1];
    let count = 1;

    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && cells[rr * size + cc] === player) {
      count++;
      rr += dr;
      cc += dc;
    }

    rr = r - dr;
    cc = c - dc;
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && cells[rr * size + cc] === player) {
      count++;
      rr -= dr;
      cc -= dc;
    }

    if (count >= WIN_COUNT) return true;
  }
  return false;
}

export function findWinLine(board, r, c, player) {
  const size = board.size;
  const cells = board.cells;
  for (let d = 0; d < DIRECTIONS.length; d++) {
    const dr = DIRECTIONS[d][0];
    const dc = DIRECTIONS[d][1];
    const line = [[r, c]];

    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && cells[rr * size + cc] === player) {
      line.push([rr, cc]);
      rr += dr;
      cc += dc;
    }

    rr = r - dr;
    cc = c - dc;
    while (rr >= 0 && rr < size && cc >= 0 && cc < size && cells[rr * size + cc] === player) {
      line.unshift([rr, cc]);
      rr -= dr;
      cc -= dc;
    }

    if (line.length >= WIN_COUNT) return line;
  }
  return null;
}

export function isBoardFull(board) {
  return board.isFull();
}

export function isBoardEmpty(board) {
  return board.moveCount === 0;
}

export { EMPTY };
