import {
  BOARD_SIZE,
  BLACK,
  WHITE,
  RESULT,
  MODE,
  DIFFICULTY,
  AI_COLOR,
  HUMAN_COLOR,
  otherColor,
} from './config.js';
import { Board } from './board.js';
import { collectLine } from './rules.js';
import { AIPlayer } from './ai.js';
import { Clock } from './timer.js';
import { saveCurrent, clearCurrent, addHistory } from './record.js';

export class GomokuGame {
  constructor(hooks = {}) {
    this.size = BOARD_SIZE;
    this.board = new Board(this.size);
    this.ai = new AIPlayer(this.size);
    this.hooks = hooks;

    this.mode = MODE.PVE;
    this.difficulty = DIFFICULTY.NORMAL;
    this.moves = [];
    this.turn = BLACK;
    this.status = 'playing';
    this.winner = RESULT.NONE;
    this.winLine = null;
    this.lastMove = null;

    this.version = 0;
    this.aiRunning = false;
    this.gameClock = new Clock();
    this.moveClock = new Clock();
  }

  emit() {
    if (this.hooks.onChange) this.hooks.onChange(this);
  }

  toast(message) {
    if (this.hooks.onToast) this.hooks.onToast(message);
  }

  get humanTurn() {
    return this.mode === MODE.PVP || this.turn === HUMAN_COLOR;
  }

  get canUndo() {
    return this.status !== 'thinking' && this.moves.length > 0;
  }

  get isThinking() {
    return this.status === 'thinking';
  }

  newGame({ mode, difficulty } = {}) {
    if (mode) this.mode = mode;
    if (difficulty) this.difficulty = difficulty;

    this.version++;
    this.board.reset();
    this.moves = [];
    this.turn = BLACK;
    this.status = 'playing';
    this.winner = RESULT.NONE;
    this.winLine = null;
    this.lastMove = null;
    this.aiRunning = false;

    this.gameClock.reset();
    this.moveClock.reset();
    this.gameClock.start();
    this.moveClock.start();

    this.save();
    this.emit();
    this.maybeScheduleAI();
  }

  resume(saved) {
    this.version++;
    this.mode = saved.mode === MODE.PVP ? MODE.PVP : MODE.PVE;
    this.difficulty = saved.difficulty || DIFFICULTY.NORMAL;

    this.board.reset();
    this.moves = [];
    const list = Array.isArray(saved.moves) ? saved.moves : [];
    for (let i = 0; i < list.length; i++) {
      const move = list[i];
      const x = move[0];
      const y = move[1];
      const color = i % 2 === 0 ? BLACK : WHITE;
      if (!this.board.place(x, y, color)) break;
      this.moves.push([x, y]);
    }

    this.turn = this.moves.length % 2 === 0 ? BLACK : WHITE;
    this.lastMove = this.moves.length ? this.moves[this.moves.length - 1] : null;
    this.winner = RESULT.NONE;
    this.status = 'playing';
    this.winLine = null;
    this.aiRunning = false;

    this.gameClock.setElapsed(saved.totalTimeMs || 0);
    this.moveClock.reset();
    this.gameClock.start();
    this.moveClock.start();

    this.emit();
    this.maybeScheduleAI();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (this.moves.length > 0) {
      this.toast('对局进行中，切换模式将开始新的一局');
    }
    this.newGame({ mode });
  }

  setDifficulty(difficulty) {
    if (difficulty === this.difficulty) return;
    this.difficulty = difficulty;
    this.save();
    this.emit();
  }

  tryPlace(x, y) {
    if (this.status === 'thinking') {
      this.toast('AI 正在思考，请稍候');
      return false;
    }
    if (this.status === 'over') {
      this.toast('对局已结束，请选择悔棋或重开');
      return false;
    }
    if (!this.board.inBounds(x, y)) {
      this.toast('不能落在棋盘之外');
      return false;
    }
    if (!this.board.isFree(x, y)) {
      this.toast('该交叉点已经有棋子了');
      return false;
    }
    if (this.mode === MODE.PVE && this.turn === AI_COLOR) {
      this.toast('现在是 AI 的回合');
      return false;
    }
    return this.commit(x, y, this.turn);
  }

  commit(x, y, color) {
    if (!this.board.place(x, y, color)) return false;
    this.moves.push([x, y]);
    this.lastMove = [x, y];

    const line = collectLine(this.board, x, y);
    if (line) {
      this.winLine = line.cells;
      this.finish(color);
      return true;
    }
    if (this.board.filled) {
      this.winLine = null;
      this.finish(RESULT.DRAW);
      return true;
    }

    this.turn = otherColor(color);
    this.moveClock.reset();
    this.save();
    this.emit();
    this.maybeScheduleAI();
    return true;
  }

  finish(winner) {
    this.status = 'over';
    this.winner = winner;
    this.gameClock.pause();
    this.moveClock.pause();

    const entry = {
      id: `g${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      endedAt: Date.now(),
      mode: this.mode,
      difficulty: this.difficulty,
      winner,
      moveCount: this.moves.length,
      durationMs: Math.round(this.gameClock.elapsed),
      moves: this.moves.map((m) => [m[0], m[1]]),
    };
    addHistory(entry);
    clearCurrent();

    this.emit();
    if (this.hooks.onResult) this.hooks.onResult(entry);
    if (this.hooks.onHistoryChange) this.hooks.onHistoryChange();
  }

  undo() {
    if (this.status === 'thinking') {
      this.toast('AI 正在思考，暂时无法悔棋');
      return;
    }
    if (this.moves.length === 0) {
      this.toast('还没有落子，无法悔棋');
      return;
    }

    const steps = this.mode === MODE.PVE && this.moves.length >= 2 ? 2 : 1;
    for (let s = 0; s < steps; s++) {
      const move = this.moves.pop();
      if (!move) break;
      this.board.remove(move[0], move[1]);
    }

    this.version++;
    this.aiRunning = false;
    this.turn = this.moves.length % 2 === 0 ? BLACK : WHITE;
    this.lastMove = this.moves.length ? this.moves[this.moves.length - 1] : null;
    this.status = 'playing';
    this.winner = RESULT.NONE;
    this.winLine = null;
    this.moveClock.reset();
    this.gameClock.start();
    this.moveClock.start();

    this.save();
    this.emit();
    this.maybeScheduleAI();
  }

  restart() {
    this.newGame();
  }

  pauseClocks() {
    this.gameClock.pause();
    this.moveClock.pause();
  }

  resumeClocks() {
    if (this.status === 'over') return;
    this.gameClock.start();
    this.moveClock.start();
    this.maybeScheduleAI();
  }

  maybeScheduleAI() {
    if (this.mode !== MODE.PVE) return;
    if (this.turn !== AI_COLOR) return;
    if (this.status !== 'playing') return;
    if (this.aiRunning) return;
    this.runAI();
  }

  async runAI() {
    this.aiRunning = true;
    const version = this.version;
    const color = this.turn;

    this.status = 'thinking';
    this.hooks.onThinking && this.hooks.onThinking(true);
    this.emit();

    await this.waitVisible();
    if (version !== this.version) {
      this.aiRunning = false;
      return;
    }

    let move = null;
    try {
      move = await this.ai.chooseMove(this.board, color, this.difficulty);
    } catch (err) {
      move = null;
    }

    this.hooks.onThinking && this.hooks.onThinking(false);
    this.aiRunning = false;

    if (version !== this.version || this.status !== 'thinking') return;
    this.status = 'playing';

    if (move && this.board.isFree(move.x, move.y)) {
      this.commit(move.x, move.y, color);
    } else {
      this.emit();
    }
  }

  waitVisible() {
    if (!document.hidden) return Promise.resolve();
    return new Promise((resolve) => {
      const handler = () => {
        if (!document.hidden) {
          document.removeEventListener('visibilitychange', handler);
          resolve();
        }
      };
      document.addEventListener('visibilitychange', handler);
    });
  }

  save() {
    saveCurrent({
      version: 1,
      mode: this.mode,
      difficulty: this.difficulty,
      moves: this.moves,
      turn: this.turn,
      status: this.status,
      winner: this.winner,
      totalTimeMs: Math.round(this.gameClock.elapsed),
      savedAt: Date.now(),
    });
  }
}
