import { nowMs } from '../utils/async.js';

/**
 * 对局计时器。
 * - totalMs 记录整盘用时；
 * - turnMs 记录当前这一手的用时；
 * - pause()/start() 用于“切到后台冻结计时”。
 * 采用累加式设计：暂停时把已流逝的时间固化进累计值，恢复后重新计时，
 * 因此切走再切回不会出现时间偷跑。
 */
export class GameClock {
  constructor(now = nowMs) {
    this._now = now;
    this.totalMs = 0;
    this.turnMs = 0;
    this.running = false;
    this._last = 0;
  }

  get isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = this._now();
  }

  pause() {
    if (!this.running) return;
    const delta = this._now() - this._last;
    this.totalMs += delta;
    this.turnMs += delta;
    this.running = false;
  }

  /** 进入下一手：结算本手耗时并清零回合计时 */
  newTurn() {
    if (this.running) {
      const delta = this._now() - this._last;
      this.totalMs += delta;
      this._last = this._now();
    }
    this.turnMs = 0;
  }

  reset() {
    this.totalMs = 0;
    this.turnMs = 0;
    this.running = false;
    this._last = 0;
  }

  setTotal(ms) {
    this.totalMs = Math.max(0, ms || 0);
  }

  elapsed() {
    return this.totalMs + (this.running ? this._now() - this._last : 0);
  }

  turnElapsed() {
    return this.turnMs + (this.running ? this._now() - this._last : 0);
  }
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
