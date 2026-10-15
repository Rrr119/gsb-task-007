import {
  BLACK,
  WHITE,
  EMPTY,
  DIFFICULTY,
  AI_TIME_LIMIT,
  AI_MAX_DEPTH,
  AI_BRANCH,
  opponent,
} from '../config.js';
import { hasFive } from '../core/rules.js';
import { shapeScore, SCORE } from './patterns.js';
import { evaluateBoard } from './evaluator.js';
import { yieldToEventLoop, sleep, nowMs } from '../utils/async.js';

/** 比任何叶子评估分都大一个量级，代表“这一步直接成五” */
export const WIN_SCORE = 50_000_000;

/**
 * 收集候选落点：任何棋子周围 2 格内的空点。
 * 借助 Board.adjacent 计数，一次线性扫描即可，不需要每次做 5x5 探测。
 */
function collectCandidates(board) {
  const size = board.size;
  const cells = board.cells;
  const adjacent = board.adjacent;
  const out = [];

  for (let r = 0; r < size; r++) {
    const base = r * size;
    for (let c = 0; c < size; c++) {
      const i = base + c;
      if (cells[i] === EMPTY && adjacent[i] > 0) out.push({ r, c });
    }
  }

  if (out.length === 0) {
    const center = size >> 1;
    out.push({ r: center, c: center });
  }
  return out;
}

/**
 * 找出 player 一步成五的所有点。
 * 若存在多个（对手活四），返回其中对己方棋型最优的一个。
 */
function findWinningMove(board, player, candidates) {
  let best = null;
  let bestScore = -1;
  const cells = board.cells;
  const size = board.size;

  for (let i = 0; i < candidates.length; i++) {
    const { r, c } = candidates[i];
    cells[r * size + c] = player;
    const win = hasFive(board, r, c, player);
    if (win) {
      const score = shapeScore(board, r, c, player);
      if (score > bestScore) {
        bestScore = score;
        best = { r, c };
      }
    }
    cells[r * size + c] = EMPTY;
  }

  return best;
}

/**
 * 搜索器。
 * negamax 写成 generator：每遍历 1024 个节点 yield 一次，
 * 由驱动器把控制权交还事件循环，从而“思考期间界面不卡死”。
 */
class Searcher {
  constructor(board, me, options = {}) {
    this.board = board;
    this.me = me;
    this.opp = opponent(me);
    this.timeLimit = options.timeLimit ?? 800;
    // 留出一点安全余量，确保“每步不超过 2 秒”这类硬约束不会被调度抖动击穿
    this.safetyMs = options.safetyMs ?? 60;
    this.maxDepth = options.maxDepth ?? 4;
    this.branch = options.branch ?? 10;
    this.rootBranch = options.rootBranch ?? this.branch;
    this.shouldAbort = options.shouldAbort || (() => false);
    this.nodes = 0;
    this.aborted = false;
    this.start = 0;
  }

  budgetExceeded() {
    return nowMs() - this.start >= this.timeLimit - this.safetyMs || this.shouldAbort();
  }

  /** 候选点排序：进攻分 + 0.85 * 防守分，兼顾“做自己的棋”和“堵对手的棋” */
  orderMoves(player, candidates, limit) {
    const n = candidates.length;
    const scored = new Array(n);
    for (let i = 0; i < n; i++) {
      const move = candidates[i];
      const attack = shapeScore(this.board, move.r, move.c, player);
      const defend = shapeScore(this.board, move.r, move.c, opponent(player));
      scored[i] = { move, key: attack + defend * 0.85 };
    }
    scored.sort((a, b) => b.key - a.key);
    if (scored.length > limit) scored.length = limit;
    return scored;
  }

  *negamax(depth, alpha, beta, player) {
    this.nodes++;
    // 每 256 个节点检查一次时间，粒度约 5ms，保证整体不越过时间预算
    if ((this.nodes & 255) === 0) {
      yield 0;
      if (this.budgetExceeded()) {
        this.aborted = true;
        return 0;
      }
    }
    if (this.aborted) return 0;

    if (depth <= 0) return evaluateBoard(this.board, player);

    const candidates = collectCandidates(this.board);
    const moves = this.orderMoves(player, candidates, this.branch);
    if (moves.length === 0) return evaluateBoard(this.board, player);

    const next = opponent(player);
    let best = -Infinity;

    for (let i = 0; i < moves.length; i++) {
      const { r, c } = moves[i].move;
      this.board.place(r, c, player);

      let score;
      if (hasFive(this.board, r, c, player)) {
        // 越靠近根部的胜利越好（depth 越大代表剩余层数越多，即赢得越早）
        score = WIN_SCORE + depth;
      } else {
        const child = yield* this.negamax(depth - 1, -beta, -alpha, next);
        if (this.aborted) {
          this.board.undo();
          return 0;
        }
        score = -child;
      }

      this.board.undo();

      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // Alpha-Beta 剪枝
    }

    return best;
  }

  /** 驱动器：推进 generator，并周期性把控制权交还事件循环 */
  async drain(generator) {
    let result = generator.next();
    let yields = 0;
    while (!result.done) {
      yields++;
      // 每 4 次 yield（约 1024 个节点）把控制权交还事件循环，界面保持可响应
      if ((yields & 3) === 0) await yieldToEventLoop();
      result = generator.next();
    }
    return result.value;
  }

  async searchRoot(orderedMoves, depth) {
    let alpha = -Infinity;
    let bestMove = null;
    let bestScore = -Infinity;

    for (let i = 0; i < orderedMoves.length; i++) {
      const { r, c } = orderedMoves[i].move;
      this.board.place(r, c, this.me);

      let score;
      try {
        if (hasFive(this.board, r, c, this.me)) {
          score = WIN_SCORE;
        } else {
          const value = await this.drain(this.negamax(depth - 1, -Infinity, -alpha, this.opp));
          score = -value;
        }
      } finally {
        this.board.undo();
      }

      if (this.aborted) break;
      if (score > bestScore) {
        bestScore = score;
        bestMove = orderedMoves[i].move;
      }
      if (score > alpha) alpha = score;
      if (this.budgetExceeded()) break;
    }

    return { aborted: this.aborted, move: bestMove, score: bestScore };
  }

  async run() {
    this.start = nowMs();
    const candidates = collectCandidates(this.board);
    if (!candidates.length) return null;

    const ordered = this.orderMoves(this.me, candidates, this.rootBranch);
    if (ordered.length === 0) return null;

    let bestMove = ordered[0].move;
    let bestScore = -Infinity;
    let completedDepth = 0;

    for (let depth = 2; depth <= this.maxDepth; depth += 2) {
      const result = await this.searchRoot(ordered, depth);
      if (result.move) {
        bestMove = result.move;
        bestScore = result.score;
        completedDepth = depth;
      }
      if (result.aborted || this.budgetExceeded()) break;
      if (bestScore >= WIN_SCORE / 2) break; // 已找到必胜
    }

    this.completedDepth = completedDepth;
    return bestMove;
  }
}

/** 简单档：随机为主，但绝不放过“一步成五”和“必须堵的一步成五” */
function pickEasyMove(board, candidates, player) {
  let totalWeight = 0;
  const weights = new Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const { r, c } = candidates[i];
    const weight = 1 + board.adjacent[r * board.size + c];
    weights[i] = weight;
    totalWeight += weight;
  }
  let target = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    target -= weights[i];
    if (target <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * AI 引擎入口。
 * 三档难度共用同一套战术前置判断（必杀必胜 / 必堵），区别在搜索深度与时间预算：
 * - easy：随机选点 + 只挡明显杀招；
 * - normal：棋型启发式 + 浅层搜索（深度 <= 4，500ms）；
 * - hard：迭代加深 Alpha-Beta + 完整棋型评估（深度 <= 8，2000ms）。
 */
export class AIEngine {
  constructor(difficulty = DIFFICULTY.NORMAL) {
    this.difficulty = difficulty;
    this.searcher = null;
    this.lastStats = null;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
  }

  abort() {
    if (this.searcher) this.searcher.aborted = true;
  }

  async chooseMove(board, player, options = {}) {
    const started = nowMs();
    const shouldAbort = options.shouldAbort || (() => false);
    const difficulty = this.difficulty;
    const timeLimit = options.timeLimit ?? AI_TIME_LIMIT[difficulty];

    const candidates = collectCandidates(board);
    if (!candidates.length) return null;

    // 1) 能一步成五，必须成五
    const winning = findWinningMove(board, player, candidates);
    if (winning) {
      await sleep(60);
      this.lastStats = { depth: 0, nodes: 0, elapsed: nowMs() - started, reason: 'win' };
      return { ...winning, reason: 'win' };
    }

    // 2) 对手下一步能成五，必须堵（含“挡明显的活四/冲四”）
    const block = findWinningMove(board, opponent(player), candidates);
    if (block) {
      if (difficulty === DIFFICULTY.EASY) await sleep(180 + Math.random() * 220);
      this.lastStats = { depth: 0, nodes: 0, elapsed: nowMs() - started, reason: 'block' };
      return { ...block, reason: 'block' };
    }

    // 3) 简单档：其余情况随机选点
    if (difficulty === DIFFICULTY.EASY) {
      await sleep(180 + Math.random() * 260);
      const move = pickEasyMove(board, candidates, player);
      this.lastStats = { depth: 0, nodes: 0, elapsed: nowMs() - started, reason: 'random' };
      return { ...move, reason: 'random' };
    }

    // 4) 普通 / 困难：棋型评估 + 搜索
    const searcher = new Searcher(board, player, {
      timeLimit,
      maxDepth: AI_MAX_DEPTH[difficulty],
      branch: AI_BRANCH[difficulty],
      rootBranch: AI_BRANCH[difficulty],
      shouldAbort,
    });
    this.searcher = searcher;

    const move = await searcher.run();
    this.lastStats = {
      depth: searcher.completedDepth || 0,
      nodes: searcher.nodes,
      elapsed: nowMs() - started,
      reason: 'search',
    };
    this.searcher = null;

    if (shouldAbort()) return null;
    if (!move) return null;
    return { ...move, reason: 'search' };
  }
}

export { collectCandidates, findWinningMove, SCORE, BLACK, WHITE };
