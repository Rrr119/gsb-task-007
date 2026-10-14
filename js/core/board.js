import { BOARD_SIZE, EMPTY } from '../config.js';

export const PLACE_ERROR = Object.freeze({
  OUT_OF_BOUNDS: 'out-of-bounds',
  OCCUPIED: 'occupied',
  GAME_OVER: 'game-over',
  BUSY: 'busy',
  NOT_YOUR_TURN: 'not-your-turn',
});

export const PLACE_ERROR_MESSAGE = Object.freeze({
  [PLACE_ERROR.OUT_OF_BOUNDS]: '不能落在棋盘外，请点击交叉点',
  [PLACE_ERROR.OCCUPIED]: '该交叉点已经有棋子了',
  [PLACE_ERROR.GAME_OVER]: '本局已结束，请悔棋或重开',
  [PLACE_ERROR.BUSY]: 'AI 正在思考，请稍候',
  [PLACE_ERROR.NOT_YOUR_TURN]: '还没轮到你落子',
});

/**
 * 棋盘数据 + 落子规则。
 *
 * - cells：一维 Int8Array，0 空 / 1 黑 / 2 白；
 * - history：扁平数组 [r, c, player, r, c, player, ...]，
 *   只保存坐标与颜色，不保存整盘快照，落子/悔棋都是 O(1) 且几乎不产生垃圾对象；
 * - adjacent：以每个交叉点为中心 5x5 邻域内的棋子计数，
 *   用于快速得到“有棋子的附近空点”作为搜索候选，避免每次都扫全盘。
 */
export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.cells = new Int8Array(size * size);
    this.history = [];
    this.adjacent = new Int16Array(size * size);
  }

  reset() {
    this.cells.fill(EMPTY);
    this.adjacent.fill(0);
    this.history.length = 0;
  }

  index(r, c) {
    return r * this.size + c;
  }

  inBounds(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  get(r, c) {
    return this.cells[this.index(r, c)];
  }

  isEmpty(r, c) {
    return this.inBounds(r, c) && this.cells[this.index(r, c)] === EMPTY;
  }

  /** 返回错误码，合法时返回 null */
  canPlace(r, c) {
    if (!this.inBounds(r, c)) return PLACE_ERROR.OUT_OF_BOUNDS;
    if (this.cells[this.index(r, c)] !== EMPTY) return PLACE_ERROR.OCCUPIED;
    return null;
  }

  /** 直接落子，调用方需保证合法（搜索内部高频调用，不做校验、不分配对象） */
  place(r, c, player) {
    this.cells[this.index(r, c)] = player;
    this.updateAdjacent(r, c, 1);
    this.history.push(r, c, player);
  }

  /** 撤销最后一手，返回被撤销的坐标，棋盘为空时返回 null */
  undo() {
    const n = this.history.length;
    if (n < 3) return null;
    const player = this.history[n - 1];
    const c = this.history[n - 2];
    const r = this.history[n - 3];
    this.history.length = n - 3;
    this.cells[this.index(r, c)] = EMPTY;
    this.updateAdjacent(r, c, -1);
    return { r, c, player };
  }

  get moveCount() {
    return this.history.length / 3;
  }

  get lastMove() {
    const n = this.history.length;
    if (n < 3) return null;
    return { r: this.history[n - 3], c: this.history[n - 2], player: this.history[n - 1] };
  }

  /** 按第 index 手取出坐标（index 从 0 开始） */
  moveAt(index) {
    const base = index * 3;
    if (base < 0 || base + 2 >= this.history.length) return null;
    return { r: this.history[base], c: this.history[base + 1], player: this.history[base + 2] };
  }

  isFull() {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === EMPTY) return false;
    }
    return true;
  }

  /**
   * 复制一份棋盘给 AI 搜索专用。
   * 搜索会在棋盘上做大量 place/undo，用副本可以把“搜索结果”和“界面上真实局面”
   * 彻底隔离，避免搜索中途渲染出幽灵棋子。每步只克隆一次，开销极小。
   */
  clone() {
    const copy = new Board(this.size);
    copy.cells.set(this.cells);
    copy.adjacent.set(this.adjacent);
    copy.history = this.history.slice();
    return copy;
  }

  /** 附近（切比雪夫距离 <= 2）是否有棋子 */
  hasNeighbor(r, c) {
    return this.adjacent[this.index(r, c)] > 0;
  }

  updateAdjacent(r, c, delta) {
    const size = this.size;
    const adj = this.adjacent;
    const r0 = r - 2 < 0 ? 0 : r - 2;
    const r1 = r + 2 >= size ? size - 1 : r + 2;
    const c0 = c - 2 < 0 ? 0 : c - 2;
    const c1 = c + 2 >= size ? size - 1 : c + 2;
    for (let rr = r0; rr <= r1; rr++) {
      const base = rr * size;
      for (let cc = c0; cc <= c1; cc++) {
        if (rr === r && cc === c) continue;
        adj[base + cc] += delta;
      }
    }
  }

  /** 序列化为紧凑字符串（仅用于调试/单测） */
  toString() {
    const rows = [];
    for (let r = 0; r < this.size; r++) {
      let line = '';
      for (let c = 0; c < this.size; c++) line += this.cells[this.index(r, c)];
      rows.push(line);
    }
    return rows.join('\n');
  }
}
