import { EMPTY, BLACK, WHITE, otherColor } from './config.js';
import { Evaluator, DIRECTIONS } from './patterns.js';
import { isWinningMove } from './rules.js';

const WIN_SCORE = 100000000;
const MAX_PLY = 12;

function shapeValue(count, blocks) {
  if (count >= 5) return 1000000;
  if (count === 4) return blocks === 0 ? 120000 : blocks === 1 ? 12000 : 0;
  if (count === 3) return blocks === 0 ? 9000 : blocks === 1 ? 600 : 0;
  if (count === 2) return blocks === 0 ? 500 : blocks === 1 ? 60 : 0;
  if (count === 1) return blocks === 0 ? 30 : 3;
  return 0;
}

export class AIPlayer {
  constructor(size) {
    this.size = size;
    this.cellCount = size * size;
    this.center = (size - 1) / 2;
    this.ev = new Evaluator(size);
    this.marks = new Uint8Array(this.cellCount);
    this.topIdx = new Int32Array(this.cellCount);
    this.topScore = new Float64Array(this.cellCount);
    this.candBuf = [];
    for (let d = 0; d <= MAX_PLY; d++) this.candBuf.push(new Int32Array(this.cellCount));
    this.nodes = 0;
    this.deadline = 0;
    this.hardDeadline = 0;
    this.stepLimit = 300;
    this.aborted = false;
    this.curDepth = 6;
    this.innerBranch = 8;
  }

  async chooseMove(board, me, difficulty) {
    const opp = otherColor(me);

    const winning = this.findImmediateWin(board, me);
    if (winning >= 0) return this.toPoint(winning);

    if (difficulty === 'easy') {
      const block = this.findImmediateWin(board, opp);
      if (block >= 0) return this.toPoint(block);
      return this.toPoint(this.randomCandidate(board));
    }

    const threat = this.findImmediateWin(board, opp);
    if (threat >= 0) {
      const best = this.bestBlockingMove(board, me, opp);
      return this.toPoint(best >= 0 ? best : threat);
    }

    const options =
      difficulty === 'hard'
        ? { maxDepth: 6, rootBranch: 10, innerBranch: 8, timeLimit: 1500, stepLimit: 300 }
        : { maxDepth: 2, rootBranch: 12, innerBranch: 10, timeLimit: 400, stepLimit: 150 };

    const move = await this.search(board, me, options);
    if (move >= 0) return this.toPoint(move);
    return this.toPoint(this.randomCandidate(board));
  }

  toPoint(index) {
    if (index < 0) return null;
    return { x: index % this.size, y: Math.floor(index / this.size) };
  }

  nearStone(board, x, y, radius) {
    const size = this.size;
    const cells = board.cells;
    const x0 = Math.max(0, x - radius);
    const x1 = Math.min(size - 1, x + radius);
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(size - 1, y + radius);
    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        if (cells[ny * size + nx] !== EMPTY) return true;
      }
    }
    return false;
  }

  findImmediateWin(board, player) {
    const size = this.size;
    const cells = board.cells;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== EMPTY) continue;
      const x = i % size;
      const y = (i - x) / size;
      if (!this.nearStone(board, x, y, 2)) continue;
      cells[i] = player;
      const win = isWinningMove(board, x, y);
      cells[i] = EMPTY;
      if (win) return i;
    }
    return -1;
  }

  bestBlockingMove(board, me, opp) {
    const size = this.size;
    const cells = board.cells;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== EMPTY) continue;
      const x = i % size;
      const y = (i - x) / size;
      if (!this.nearStone(board, x, y, 2)) continue;
      cells[i] = opp;
      const blocks = isWinningMove(board, x, y);
      cells[i] = EMPTY;
      if (!blocks) continue;
      const score = this.pointHeuristic(cells, x, y, me) + this.pointHeuristic(cells, x, y, opp);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  randomCandidate(board) {
    const size = this.size;
    const cells = board.cells;
    const pool = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== EMPTY) continue;
      const x = i % size;
      const y = (i - x) / size;
      if (this.nearStone(board, x, y, 2)) pool.push(i);
    }
    if (pool.length === 0) {
      for (let i = 0; i < cells.length; i++) if (cells[i] === EMPTY) pool.push(i);
    }
    if (pool.length === 0) return -1;
    return pool[(Math.random() * pool.length) | 0];
  }

  pointHeuristic(cells, x, y, player) {
    const size = this.size;
    let total = 0;
    for (let d = 0; d < DIRECTIONS.length; d++) {
      const dx = DIRECTIONS[d][0];
      const dy = DIRECTIONS[d][1];
      let count = 1;
      let blocks = 0;
      for (let s = -1; s <= 1; s += 2) {
        let nx = x + dx * s;
        let ny = y + dy * s;
        for (;;) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
            blocks++;
            break;
          }
          const value = cells[ny * size + nx];
          if (value === player) {
            count++;
            nx += dx * s;
            ny += dy * s;
            continue;
          }
          if (value === EMPTY) break;
          blocks++;
          break;
        }
      }
      total += shapeValue(count, blocks);
    }
    return total;
  }

  orderScore(cells, x, y, player) {
    const opp = otherColor(player);
    const centerBias =
      (this.size - 1 - (Math.abs(x - this.center) + Math.abs(y - this.center))) * 1.0;
    return (
      this.pointHeuristic(cells, x, y, player) +
      this.pointHeuristic(cells, x, y, opp) * 0.9 +
      centerBias
    );
  }

  collectCandidates(board, player, limit) {
    const size = this.size;
    const cells = board.cells;
    const marks = this.marks;
    marks.fill(0);

    let hasStone = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === EMPTY) continue;
      hasStone = true;
      const x = i % size;
      const y = (i - x) / size;
      const x0 = Math.max(0, x - 2);
      const x1 = Math.min(size - 1, x + 2);
      const y0 = Math.max(0, y - 2);
      const y1 = Math.min(size - 1, y + 2);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const ni = ny * size + nx;
          if (cells[ni] === EMPTY) marks[ni] = 1;
        }
      }
    }

    if (!hasStone) {
      const c = Math.floor(size / 2);
      this.topIdx[0] = c * size + c;
      this.topScore[0] = 0;
      return 1;
    }

    const topIdx = this.topIdx;
    const topScore = this.topScore;
    let k = 0;

    for (let i = 0; i < marks.length; i++) {
      if (!marks[i]) continue;
      const x = i % size;
      const y = (i - x) / size;
      const score = this.orderScore(cells, x, y, player);

      if (k < limit) {
        let pos = k;
        while (pos > 0 && topScore[pos - 1] < score) {
          topScore[pos] = topScore[pos - 1];
          topIdx[pos] = topIdx[pos - 1];
          pos--;
        }
        topScore[pos] = score;
        topIdx[pos] = i;
        k++;
      } else if (score > topScore[k - 1]) {
        let pos = k - 1;
        while (pos > 0 && topScore[pos - 1] < score) {
          topScore[pos] = topScore[pos - 1];
          topIdx[pos] = topIdx[pos - 1];
          pos--;
        }
        topScore[pos] = score;
        topIdx[pos] = i;
      }
    }

    return k;
  }

  negamax(board, turn, depth, alpha, beta) {
    if (++this.nodes % 128 === 0 && performance.now() > this.deadline) this.aborted = true;
    if (this.aborted) return 0;

    if (depth <= 0) return this.ev.evaluate(turn);

    const size = this.size;
    const k = this.collectCandidates(board, turn, this.innerBranch);
    if (k === 0) return this.ev.evaluate(turn);

    const buf = this.candBuf[depth];
    for (let j = 0; j < k; j++) buf[j] = this.topIdx[j];

    const opp = otherColor(turn);
    let a = alpha;
    const b = beta;
    let best = -WIN_SCORE;

    for (let j = 0; j < k; j++) {
      const i = buf[j];
      const x = i % size;
      const y = (i - x) / size;

      board.place(x, y, turn);
      this.ev.applyCell(x, y);
      let value;
      if (isWinningMove(board, x, y)) {
        value = WIN_SCORE - (MAX_PLY - depth);
      } else {
        value = -this.negamax(board, opp, depth - 1, -b, -a);
      }
      board.remove(x, y);
      this.ev.applyCell(x, y);

      if (this.aborted) return 0;
      if (value > best) best = value;
      if (best > a) a = best;
      if (a >= b) break;
    }

    return best;
  }

  async search(board, me, options) {
    const size = this.size;
    this.ev.bind(board);
    const opp = otherColor(me);
    this.hardDeadline = performance.now() + options.timeLimit;
    this.stepLimit = options.stepLimit || 300;
    this.innerBranch = options.innerBranch;

    let bestMove = -1;
    let bestScore = -WIN_SCORE;

    for (let depth = 2; depth <= options.maxDepth; depth += 2) {
      this.curDepth = depth;
      this.aborted = false;

      const k = this.collectCandidates(board, me, options.rootBranch);
      const roots = [];
      for (let j = 0; j < k; j++) roots.push(this.topIdx[j]);
      if (roots.length === 0) break;

      let localBest = -1;
      let localScore = -WIN_SCORE;
      let alpha = -WIN_SCORE;

      for (let j = 0; j < roots.length; j++) {
        const i = roots[j];
        const x = i % size;
        const y = (i - x) / size;

        this.deadline = Math.min(this.hardDeadline, performance.now() + this.stepLimit);
        board.place(x, y, me);
        this.ev.applyCell(x, y);
        let value;
        if (isWinningMove(board, x, y)) {
          value = WIN_SCORE - (MAX_PLY - depth);
        } else {
          value = -this.negamax(board, opp, depth - 1, -WIN_SCORE, -alpha);
        }
        board.remove(x, y);
        this.ev.applyCell(x, y);

        if (this.aborted) break;
        if (value > localScore) {
          localScore = value;
          localBest = i;
        }
        if (value > alpha) alpha = value;
        if (performance.now() > this.hardDeadline) {
          this.aborted = true;
          break;
        }
        await this.yieldToUI();
      }

      if (!this.aborted && localBest >= 0) {
        bestMove = localBest;
        bestScore = localScore;
      }
      if (this.aborted) break;
      if (bestScore >= WIN_SCORE - MAX_PLY - 1) break;
      if (performance.now() > this.hardDeadline) break;
    }

    if (bestMove < 0) {
      const k = this.collectCandidates(board, me, 1);
      bestMove = k > 0 ? this.topIdx[0] : -1;
    }

    return bestMove;
  }

  yieldToUI() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
