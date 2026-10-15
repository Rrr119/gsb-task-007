import { BOARD_SIZE, EMPTY, WALL } from './config.js';

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.cells = new Int8Array(size * size);
    this.count = 0;
  }

  index(x, y) {
    return y * this.size + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.cells[y * this.size + x] : WALL;
  }

  isFree(x, y) {
    return this.inBounds(x, y) && this.cells[y * this.size + x] === EMPTY;
  }

  place(x, y, color) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.size + x;
    if (this.cells[i] !== EMPTY) return false;
    this.cells[i] = color;
    this.count++;
    return true;
  }

  remove(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.size + x;
    if (this.cells[i] === EMPTY) return false;
    this.cells[i] = EMPTY;
    this.count--;
    return true;
  }

  reset() {
    this.cells.fill(EMPTY);
    this.count = 0;
  }

  get filled() {
    return this.count >= this.size * this.size;
  }
}
