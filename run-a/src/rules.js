import { EMPTY, WALL } from './config.js';

export const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function collectLine(board, x, y) {
  const color = board.get(x, y);
  if (color === EMPTY || color === WALL) return null;

  for (let d = 0; d < DIRECTIONS.length; d++) {
    const dx = DIRECTIONS[d][0];
    const dy = DIRECTIONS[d][1];
    const cells = [board.index(x, y)];

    let cx = x - dx;
    let cy = y - dy;
    while (board.get(cx, cy) === color) {
      cells.unshift(board.index(cx, cy));
      cx -= dx;
      cy -= dy;
    }

    cx = x + dx;
    cy = y + dy;
    while (board.get(cx, cy) === color) {
      cells.push(board.index(cx, cy));
      cx += dx;
      cy += dy;
    }

    if (cells.length >= 5) return { cells, dx, dy, color };
  }

  return null;
}

export function isWinningMove(board, x, y) {
  return collectLine(board, x, y) !== null;
}
