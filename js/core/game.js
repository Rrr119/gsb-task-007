import {
  BLACK,
  WHITE,
  EMPTY,
  HUMAN_COLOR,
  MODE,
  DIFFICULTY,
  STATUS,
  RESULT,
  opponent,
} from '../config.js';
import { Board, PLACE_ERROR } from './board.js';
import { hasFive, findWinLine } from './rules.js';
import { GameClock } from './clock.js';

/**
 * 对局状态机：谁在下、能不能下、什么时候结束、怎么悔棋。
 * 通过 EventTarget 抛出 'change' / 'end' 事件，界面层只做订阅，不反向依赖 DOM。
 */
export class Game extends EventTarget {
  constructor() {
    super();
    this.board = new Board();
    this.clock = new GameClock();
    this.mode = MODE.PVE;
    this.difficulty = DIFFICULTY.NORMAL;
    this.status = STATUS.PLAYING;
    this.currentPlayer = BLACK;
    this.winner = null;
    this.winLine = null;
    this.showTurnTime = false;
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent('change', { detail: this }));
  }

  newGame(options = {}) {
    if (options.mode) this.mode = options.mode;
    if (options.difficulty) this.difficulty = options.difficulty;
    if (typeof options.showTurnTime === 'boolean') this.showTurnTime = options.showTurnTime;
    this.board.reset();
    this.clock.reset();
    this.clock.start();
    this.status = STATUS.PLAYING;
    this.currentPlayer = BLACK;
    this.winner = null;
    this.winLine = null;
    this.emitChange();
  }

  /** 从本地存档恢复：只回放坐标，不保存棋盘快照 */
  restore(state) {
    this.mode = state.mode === MODE.PVP ? MODE.PVP : MODE.PVE;
    this.difficulty = Object.values(DIFFICULTY).includes(state.difficulty)
      ? state.difficulty
      : DIFFICULTY.NORMAL;
    this.showTurnTime = !!state.showTurnTime;

    this.board.reset();
    const moves = Array.isArray(state.moves) ? state.moves : [];
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (!Array.isArray(move) || move.length !== 2) continue;
      const player = this.board.moveCount % 2 === 0 ? BLACK : WHITE;
      this.board.place(move[0], move[1], player);
    }

    // 正常情况下轮次由棋谱长度即可推出；若存档里带了明确的 currentPlayer 则优先信任它
    this.currentPlayer =
      state.currentPlayer === BLACK || state.currentPlayer === WHITE
        ? state.currentPlayer
        : this.board.moveCount % 2 === 0
          ? BLACK
          : WHITE;
    this.status = STATUS.PLAYING;
    this.winner = null;
    this.winLine = null;
    this.clock.reset();
    this.clock.setTotal(state.elapsedMs);
    this.clock.start();
    this.emitChange();
  }

  get moveCount() {
    return this.board.moveCount;
  }

  get isOver() {
    return this.status === STATUS.OVER;
  }

  get isThinking() {
    return this.status === STATUS.THINKING;
  }

  get isHumanTurn() {
    if (this.mode === MODE.PVP) return true;
    return this.currentPlayer === HUMAN_COLOR;
  }

  /**
   * 玩家/AI 落子。
   * 返回 { ok, reason, player }，非法落点绝不静默失败。
   */
  place(r, c) {
    if (this.status === STATUS.OVER) return { ok: false, reason: PLACE_ERROR.GAME_OVER };
    if (this.status === STATUS.THINKING) return { ok: false, reason: PLACE_ERROR.BUSY };

    const error = this.board.canPlace(r, c);
    if (error) return { ok: false, reason: error };

    const player = this.currentPlayer;
    this.board.place(r, c, player);

    const line = findWinLine(this.board, r, c, player);
    if (line) {
      this.winner = player === BLACK ? RESULT.BLACK : RESULT.WHITE;
      this.winLine = line;
      this.status = STATUS.OVER;
      this.clock.pause();
    } else if (this.board.isFull()) {
      this.winner = RESULT.DRAW;
      this.winLine = null;
      this.status = STATUS.OVER;
      this.clock.pause();
    } else {
      this.currentPlayer = opponent(player);
      this.clock.newTurn();
    }

    this.emitChange();
    if (this.status === STATUS.OVER) {
      this.dispatchEvent(new CustomEvent('end', { detail: this }));
    }
    return { ok: true, player };
  }

  /**
   * 悔棋。
   * - 人机模式：一次回退双方各一步（若最后一手是 AI，则连同玩家那手一起撤销）；
   * - 双人模式：回退一手；
   * - 对局结束后也可悔棋，会回到进行中状态。
   */
  undo() {
    if (this.board.moveCount === 0) return { ok: false, reason: 'empty' };

    let removed = 0;
    if (this.mode === MODE.PVE) {
      const last = this.board.lastMove;
      this.board.undo();
      removed++;
      // 最后一手是 AI（白），说明玩家刚下完，需要连玩家的那一手一起撤掉
      if (last && last.player !== HUMAN_COLOR && this.board.moveCount > 0) {
        this.board.undo();
        removed++;
      }
      this.currentPlayer = HUMAN_COLOR;
    } else {
      const last = this.board.lastMove;
      this.board.undo();
      removed++;
      this.currentPlayer = last ? last.player : BLACK;
    }

    this.status = STATUS.PLAYING;
    this.winner = null;
    this.winLine = null;
    if (!this.clock.isRunning) this.clock.start();
    this.clock.newTurn();
    this.emitChange();
    return { ok: true, removed };
  }

  /** 把最后一手临时标记为“AI 思考中” */
  setThinking(thinking) {
    if (this.status === STATUS.OVER) return;
    this.status = thinking ? STATUS.THINKING : STATUS.PLAYING;
    this.emitChange();
  }

  snapshot() {
    const history = this.board.history;
    const moves = [];
    for (let i = 0; i < history.length; i += 3) {
      moves.push([history[i], history[i + 1]]);
    }
    return {
      version: 1,
      mode: this.mode,
      difficulty: this.difficulty,
      moves,
      currentPlayer: this.currentPlayer,
      elapsedMs: Math.round(this.clock.elapsed()),
      showTurnTime: this.showTurnTime,
      updatedAt: Date.now(),
    };
  }

  /** 生成一条已结束对局的棋谱记录 */
  toRecord() {
    const history = this.board.history;
    const moves = [];
    for (let i = 0; i < history.length; i += 3) {
      moves.push([history[i], history[i + 1]]);
    }
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      mode: this.mode,
      difficulty: this.difficulty,
      winner: this.winner,
      moves,
      moveCount: moves.length,
      durationMs: Math.round(this.clock.elapsed()),
      finishedAt: Date.now(),
    };
  }

  static EMPTY() {
    return EMPTY;
  }
}
