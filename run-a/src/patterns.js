import { EMPTY, BLACK, WHITE } from './config.js';
import { DIRECTIONS } from './rules.js';

export { DIRECTIONS };

export const PATTERN_SCORE = {
  FIVE: 5000000,
  OPEN_FOUR: 500000,
  FOUR: 50000,
  OPEN_THREE: 20000,
  SLEEP_THREE: 2000,
  OPEN_TWO: 800,
  SLEEP_TWO: 80,
};

const GROUPS = [
  { score: PATTERN_SCORE.FIVE, patterns: ['11111'] },
  { score: PATTERN_SCORE.OPEN_FOUR, patterns: ['011110'] },
  { score: PATTERN_SCORE.FOUR, patterns: ['011112', '211110', '11011', '10111', '11101'] },
  { score: PATTERN_SCORE.OPEN_THREE, patterns: ['001110', '011100', '011010', '010110'] },
  {
    score: PATTERN_SCORE.SLEEP_THREE,
    patterns: ['001112', '211100', '010112', '211010', '011012', '210110', '2011102', '10011', '11001', '10101'],
  },
  { score: PATTERN_SCORE.OPEN_TWO, patterns: ['001100', '011000', '000110', '010100', '001010'] },
  {
    score: PATTERN_SCORE.SLEEP_TWO,
    patterns: ['001102', '201100', '011002', '200110', '010102', '201010', '10012', '21001', '10102', '20101'],
  },
];

export function matchPatterns(str) {
  let score = 0;
  let work = str;

  for (let g = 0; g < GROUPS.length; g++) {
    const group = GROUPS[g];
    for (let p = 0; p < group.patterns.length; p++) {
      const pattern = group.patterns[p];
      let from = 0;
      for (;;) {
        const idx = work.indexOf(pattern, from);
        if (idx < 0) break;
        score += group.score;
        work = work.slice(0, idx) + 'x'.repeat(pattern.length) + work.slice(idx + pattern.length);
        from = idx + pattern.length;
      }
    }
  }

  return score;
}

export function buildLines(size) {
  const lines = [];
  const push = (cells) => {
    if (cells.length >= 5) lines.push(cells);
  };

  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) row.push(y * size + x);
    push(row);
  }

  for (let x = 0; x < size; x++) {
    const col = [];
    for (let y = 0; y < size; y++) col.push(y * size + x);
    push(col);
  }

  for (let d = -(size - 1); d <= size - 1; d++) {
    const diag = [];
    for (let y = 0; y < size; y++) {
      const x = y - d;
      if (x >= 0 && x < size) diag.push(y * size + x);
    }
    push(diag);
  }

  for (let s = 0; s <= 2 * (size - 1); s++) {
    const anti = [];
    for (let y = 0; y < size; y++) {
      const x = s - y;
      if (x >= 0 && x < size) anti.push(y * size + x);
    }
    push(anti);
  }

  return lines;
}

function lineToPerspective(cells, indices, me) {
  let str = '2';
  for (let k = 0; k < indices.length; k++) {
    const value = cells[indices[k]];
    str += value === me ? '1' : value === EMPTY ? '0' : '2';
  }
  return str + '2';
}

export function scoreLineForPlayer(cells, indices, me) {
  return matchPatterns(lineToPerspective(cells, indices, me));
}

export class Evaluator {
  constructor(size) {
    this.size = size;
    this.lines = buildLines(size);
    this.cellLines = new Array(size * size);
    for (let i = 0; i < this.cellLines.length; i++) this.cellLines[i] = [];
    for (let li = 0; li < this.lines.length; li++) {
      const cells = this.lines[li];
      for (let k = 0; k < cells.length; k++) this.cellLines[cells[k]].push(li);
    }
    this.lineScores = [null, new Float64Array(this.lines.length), new Float64Array(this.lines.length)];
    this.total = [0, 0, 0];
    this.board = null;
  }

  bind(board) {
    this.board = board;
    this.lineScores[1].fill(0);
    this.lineScores[2].fill(0);
    this.total[1] = 0;
    this.total[2] = 0;
    for (let li = 0; li < this.lines.length; li++) this.rescoreLine(li, true);
  }

  rescoreLine(li, accumulate) {
    const cells = this.board.cells;
    const indices = this.lines[li];
    const s1 = scoreLineForPlayer(cells, indices, BLACK);
    const s2 = scoreLineForPlayer(cells, indices, WHITE);

    if (accumulate) {
      this.total[1] += s1;
      this.total[2] += s2;
    } else {
      this.total[1] += s1 - this.lineScores[1][li];
      this.total[2] += s2 - this.lineScores[2][li];
    }

    this.lineScores[1][li] = s1;
    this.lineScores[2][li] = s2;
  }

  applyCell(x, y) {
    const affected = this.cellLines[y * this.size + x];
    for (let k = 0; k < affected.length; k++) this.rescoreLine(affected[k], false);
  }

  evaluate(player) {
    const opp = player === BLACK ? WHITE : BLACK;
    return this.total[player] - this.total[opp];
  }
}
