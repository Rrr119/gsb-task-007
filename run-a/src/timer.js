export class Clock {
  constructor(autoStart = false) {
    this._accum = 0;
    this._since = 0;
    this._running = false;
    if (autoStart) this.start();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._since = performance.now();
  }

  pause() {
    if (!this._running) return;
    this._accum += performance.now() - this._since;
    this._running = false;
  }

  reset() {
    this._accum = 0;
    this._since = performance.now();
  }

  setElapsed(ms) {
    this._accum = Math.max(0, Number(ms) || 0);
    this._since = performance.now();
  }

  get elapsed() {
    return this._accum + (this._running ? performance.now() - this._since : 0);
  }

  get running() {
    return this._running;
  }

  format() {
    return Clock.format(this.elapsed);
  }

  static format(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
