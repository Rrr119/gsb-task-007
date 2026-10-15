import { BLACK, WHITE, RESULT, DIFFICULTY_LABEL } from '../config.js';
import { Board } from '../core/board.js';
import { findWinLine } from '../core/rules.js';
import { BoardRenderer } from './renderer.js';

/**
 * 棋谱复盘：只看每手坐标，逐手重放。
 * 复用 BoardRenderer，用一个独立 Board 实例重建局面，
 * 不会影响正在进行的对局。
 */
export class ReplayView {
  constructor(elements) {
    this.el = elements;
    this.board = new Board();
    this.renderer = new BoardRenderer(elements.canvas, this.board, { maxSize: 440, minSize: 240 });
    this.moves = [];
    this.step = 0;
    this.record = null;
    this.timer = 0;
    this.playing = false;
  }

  bind() {
    this.el.first.addEventListener('click', () => {
      this.pause();
      this.goTo(0);
    });
    this.el.prev.addEventListener('click', () => {
      this.pause();
      this.goTo(this.step - 1);
    });
    this.el.next.addEventListener('click', () => {
      this.pause();
      this.goTo(this.step + 1);
    });
    this.el.last.addEventListener('click', () => {
      this.pause();
      this.goTo(this.moves.length);
    });
    this.el.play.addEventListener('click', () => this.toggle());
    this.el.range.addEventListener('input', () => {
      this.pause();
      this.goTo(Number(this.el.range.value));
    });
  }

  open(record) {
    if (!record) return;
    this.record = record;
    this.moves = Array.isArray(record.moves) ? record.moves : [];
    this.el.range.max = String(this.moves.length);
    this.el.meta.textContent = this.describe(record);
    this.el.modal.hidden = false;
    this.renderer.resize();
    this.goTo(this.moves.length);
    this.el.modal.scrollIntoView({ block: 'center' });
  }

  close() {
    this.pause();
    this.el.modal.hidden = true;
  }

  describe(record) {
    const mode =
      record.mode === 'pve'
        ? `人机 · ${DIFFICULTY_LABEL[record.difficulty] || record.difficulty}`
        : '双人对战';
    const result =
      record.winner === RESULT.DRAW
        ? '平局'
        : record.winner === RESULT.BLACK
          ? '黑棋胜'
          : '白棋胜';
    const duration = Math.round((record.durationMs || 0) / 1000);
    return `${mode} · ${result} · ${record.moveCount} 手 · ${duration}s`;
  }

  goTo(step) {
    const target = Math.max(0, Math.min(this.moves.length, step | 0));
    this.step = target;
    this.board.reset();
    for (let i = 0; i < target; i++) {
      const move = this.moves[i];
      if (!Array.isArray(move)) continue;
      this.board.place(move[0], move[1], i % 2 === 0 ? BLACK : WHITE);
    }

    let winLine = null;
    if (target > 0 && target === this.moves.length && this.record && this.record.winner !== RESULT.DRAW) {
      const last = this.board.lastMove;
      if (last) winLine = findWinLine(this.board, last.r, last.c, last.player);
    }

    this.renderer.setWinLine(winLine);
    this.renderer.render();

    this.el.range.value = String(target);
    this.el.info.textContent = `第 ${target} / ${this.moves.length} 手`;
    this.el.prev.disabled = target <= 0;
    this.el.first.disabled = target <= 0;
    this.el.next.disabled = target >= this.moves.length;
    this.el.last.disabled = target >= this.moves.length;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  play() {
    if (this.moves.length === 0) return;
    if (this.step >= this.moves.length) this.goTo(0);
    this.playing = true;
    this.el.play.textContent = '⏸';
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (this.step >= this.moves.length) {
        this.pause();
        return;
      }
      this.goTo(this.step + 1);
    }, 520);
  }

  pause() {
    this.playing = false;
    this.el.play.textContent = '▶';
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  handleResize() {
    if (this.el.modal.hidden) return;
    this.renderer.resize();
    this.renderer.render();
  }
}
