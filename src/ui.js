import {
  BOARD_SIZE,
  BLACK,
  WHITE,
  RESULT,
  MODE,
  MODE_LABEL,
  DIFFICULTY_LABEL,
  HUMAN_COLOR,
  colorLabel,
} from './config.js';
import { GomokuGame } from './game.js';
import { Renderer } from './renderer.js';
import { Board } from './board.js';
import { Clock } from './timer.js';
import { collectLine } from './rules.js';
import * as Store from './record.js';

export class UI {
  constructor() {
    this.dom = {
      canvas: document.getElementById('board'),
      frame: document.getElementById('board-frame'),
      modeGroup: document.getElementById('mode-group'),
      difficultyGroup: document.getElementById('difficulty-group'),
      timerMode: document.getElementById('timer-mode'),
      turnDot: document.getElementById('turn-dot'),
      turnText: document.getElementById('turn-text'),
      thinking: document.getElementById('thinking'),
      statMoves: document.getElementById('stat-moves'),
      statTime: document.getElementById('stat-time'),
      statMoveTime: document.getElementById('stat-move-time'),
      stats: document.querySelector('.stats'),
      btnNew: document.getElementById('btn-new'),
      btnUndo: document.getElementById('btn-undo'),
      btnRestart: document.getElementById('btn-restart'),
      btnClearHistory: document.getElementById('btn-clear-history'),
      historyList: document.getElementById('history-list'),
      toast: document.getElementById('toast'),
      modal: document.getElementById('modal'),
      resultIcon: document.getElementById('result-icon'),
      resultTitle: document.getElementById('result-title'),
      resultSub: document.getElementById('result-sub'),
      resultMoves: document.getElementById('result-moves'),
      resultTime: document.getElementById('result-time'),
      modalAgain: document.getElementById('modal-again'),
      modalClose: document.getElementById('modal-close'),
      replayBar: document.getElementById('replay-bar'),
      rpFirst: document.getElementById('rp-first'),
      rpPrev: document.getElementById('rp-prev'),
      rpNext: document.getElementById('rp-next'),
      rpLast: document.getElementById('rp-last'),
      rpAuto: document.getElementById('rp-auto'),
      rpSlider: document.getElementById('rp-slider'),
      rpInfo: document.getElementById('rp-info'),
      rpExit: document.getElementById('rp-exit'),
    };

    this.renderer = new Renderer(this.dom.canvas, BOARD_SIZE);
    this.renderer.onResize = () => this.scheduleDraw();

    this.settings = Store.loadSettings();
    this.hover = null;
    this.toastTimer = null;
    this.drawQueued = false;
    this.replay = {
      active: false,
      entry: null,
      moves: [],
      index: 0,
      board: new Board(BOARD_SIZE),
      timer: null,
    };

    this.game = new GomokuGame({
      onChange: () => this.refresh(),
      onResult: (entry) => this.showResult(entry),
      onToast: (message) => this.toast(message),
      onHistoryChange: () => this.renderHistory(),
    });
  }

  start() {
    this.bindEvents();
    this.applySettings();

    const saved = Store.loadCurrent();
    if (saved && Array.isArray(saved.moves) && saved.moves.length > 0 && saved.status !== 'over') {
      this.game.resume(saved);
      this.toast('已恢复未完成的对局');
    } else {
      this.game.newGame({ mode: this.settings.mode, difficulty: this.settings.difficulty });
    }

    this.renderHistory();
    this.tickTimer = window.setInterval(() => this.updateTimes(), 200);
    this.updateTimes();
    this.refresh();
  }

  applySettings() {
    const mode = this.settings.mode === MODE.PVP ? MODE.PVP : MODE.PVE;
    this.dom.modeGroup.querySelectorAll('.seg').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this.dom.difficultyGroup.querySelectorAll('.seg').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.difficulty === this.settings.difficulty);
    });
    this.dom.difficultyGroup.classList.toggle('disabled', mode === MODE.PVP);
    this.dom.timerMode.checked = !!this.settings.timerMode;
    this.dom.stats.classList.toggle('hide-move-time', !this.settings.timerMode);
  }

  persistSettings() {
    this.settings.mode = this.game.mode;
    this.settings.difficulty = this.game.difficulty;
    this.settings.timerMode = this.dom.timerMode.checked;
    Store.saveSettings(this.settings);
  }

  bindEvents() {
    this.dom.canvas.addEventListener('click', (event) => this.onCanvasClick(event));
    this.dom.canvas.addEventListener('mousemove', (event) => this.onCanvasMove(event));
    this.dom.canvas.addEventListener('mouseleave', () => {
      if (this.hover) {
        this.hover = null;
        this.scheduleDraw();
      }
    });

    this.dom.modeGroup.addEventListener('click', (event) => {
      const btn = event.target.closest('.seg');
      if (!btn) return;
      this.exitReplay();
      this.settings.mode = btn.dataset.mode;
      this.dom.modeGroup.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b === btn));
      this.dom.difficultyGroup.classList.toggle('disabled', btn.dataset.mode === MODE.PVP);
      this.game.setMode(btn.dataset.mode);
      this.persistSettings();
      this.updateTimes();
    });

    this.dom.difficultyGroup.addEventListener('click', (event) => {
      const btn = event.target.closest('.seg');
      if (!btn) return;
      this.settings.difficulty = btn.dataset.difficulty;
      this.dom.difficultyGroup.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b === btn));
      this.game.setDifficulty(btn.dataset.difficulty);
      this.persistSettings();
      this.toast(`AI 难度已切换为「${DIFFICULTY_LABEL[btn.dataset.difficulty]}」`);
    });

    this.dom.timerMode.addEventListener('change', () => {
      this.dom.stats.classList.toggle('hide-move-time', !this.dom.timerMode.checked);
      this.persistSettings();
    });

    this.dom.btnNew.addEventListener('click', () => {
      if (this.confirmLeave()) this.game.newGame();
    });
    this.dom.btnUndo.addEventListener('click', () => this.game.undo());
    this.dom.btnRestart.addEventListener('click', () => {
      if (this.confirmLeave()) this.game.restart();
    });

    this.dom.btnClearHistory.addEventListener('click', () => {
      Store.clearHistory();
      this.renderHistory();
      this.toast('已清空棋谱记录');
    });

    this.dom.modalAgain.addEventListener('click', () => {
      this.hideModal();
      this.game.newGame();
    });
    this.dom.modalClose.addEventListener('click', () => this.hideModal());

    this.dom.historyList.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-replay]');
      if (!btn) return;
      const entry = Store.loadHistory().find((item) => item.id === btn.dataset.replay);
      if (entry) this.enterReplay(entry);
    });

    this.dom.rpFirst.addEventListener('click', () => this.gotoReplay(0));
    this.dom.rpPrev.addEventListener('click', () => this.stepReplay(-1));
    this.dom.rpNext.addEventListener('click', () => this.stepReplay(1));
    this.dom.rpLast.addEventListener('click', () => this.gotoReplay(this.replay.moves.length));
    this.dom.rpAuto.addEventListener('click', () => this.toggleAuto());
    this.dom.rpExit.addEventListener('click', () => this.exitReplay());
    this.dom.rpSlider.addEventListener('input', () => this.gotoReplay(Number(this.dom.rpSlider.value)));

    document.addEventListener('visibilitychange', () => {
      if (this.replay.active) return;
      if (document.hidden) this.game.pauseClocks();
      else this.game.resumeClocks();
      this.updateTimes();
    });

    window.addEventListener('beforeunload', () => {
      if (!this.replay.active) this.game.save();
    });

    document.addEventListener('keydown', (event) => {
      if (!this.replay.active) return;
      if (event.key === 'ArrowLeft') this.stepReplay(-1);
      else if (event.key === 'ArrowRight') this.stepReplay(1);
      else if (event.key === 'Escape') this.exitReplay();
    });
  }

  confirmLeave() {
    if (this.game.moves.length === 0 || this.game.status === 'over') return true;
    return window.confirm('当前对局尚未结束，确定要开始新的一局吗？');
  }

  onCanvasClick(event) {
    if (this.replay.active) {
      this.toast('复盘模式下不能落子，请先退出复盘');
      return;
    }
    const rect = this.dom.canvas.getBoundingClientRect();
    const { col, row, dist } = this.renderer.pixelToCell(event.clientX - rect.left, event.clientY - rect.top);
    const tolerance = this.renderer.geom.cell * 0.5;
    if (col < 0 || row < 0 || col >= BOARD_SIZE || row >= BOARD_SIZE || dist > tolerance) {
      this.toast('请点击棋盘内的交叉点');
      return;
    }
    this.game.tryPlace(col, row);
  }

  onCanvasMove(event) {
    if (this.replay.active) return;
    const rect = this.dom.canvas.getBoundingClientRect();
    const { col, row, dist } = this.renderer.pixelToCell(event.clientX - rect.left, event.clientY - rect.top);
    const tolerance = this.renderer.geom.cell * 0.5;
    let next = null;
    if (col >= 0 && row >= 0 && col < BOARD_SIZE && row < BOARD_SIZE && dist <= tolerance) {
      next = { x: col, y: row };
    }
    const changed = (!!next !== !!this.hover) || (next && this.hover && (next.x !== this.hover.x || next.y !== this.hover.y));
    this.hover = next;
    if (changed) this.scheduleDraw();
  }

  scheduleDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    window.requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  draw() {
    const game = this.game;
    let snapshot;
    if (this.replay.active) {
      snapshot = {
        board: this.replay.board,
        lastMove: this.replay.index > 0 ? this.replay.moves[this.replay.index - 1] : null,
        winLine: this.replayWinLine(),
        hover: null,
      };
    } else {
      const hover =
        this.hover && game.status === 'playing' && game.humanTurn
          ? { x: this.hover.x, y: this.hover.y, color: game.turn }
          : null;
      snapshot = {
        board: game.board,
        lastMove: game.lastMove,
        winLine: game.winLine,
        hover,
      };
    }
    this.renderer.draw(snapshot);
  }

  refresh() {
    const game = this.game;
    const thinking = game.status === 'thinking';

    this.dom.turnDot.classList.toggle('white', game.turn === WHITE);
    this.dom.turnText.textContent =
      game.status === 'over' ? this.resultText(game.winner) : `${colorLabel(game.turn)}落子`;
    this.dom.thinking.classList.toggle('hidden', !thinking);

    this.dom.btnUndo.disabled = !game.canUndo;
    this.dom.btnRestart.disabled = false;

    this.updateTimes();
    this.scheduleDraw();
  }

  updateTimes() {
    if (this.replay.active) return;
    const game = this.game;
    this.dom.statMoves.textContent = String(game.moves.length);
    this.dom.statTime.textContent = Clock.format(game.gameClock.elapsed);
    this.dom.statMoveTime.textContent = Clock.format(game.moveClock.elapsed);
  }

  resultText(winner) {
    if (winner === RESULT.DRAW) return '平局';
    return `${colorLabel(winner)}获胜`;
  }

  showResult(entry) {
    const icon = this.dom.resultIcon;
    icon.classList.remove('black', 'white', 'draw');
    if (entry.winner === RESULT.DRAW) {
      icon.textContent = '●';
      icon.classList.add('draw');
      this.dom.resultTitle.textContent = '平局';
      this.dom.resultSub.textContent = '棋盘已下满，双方未分胜负';
    } else {
      icon.textContent = entry.winner === BLACK ? '●' : '○';
      icon.classList.add(entry.winner === BLACK ? 'black' : 'white');
      const label = `${colorLabel(entry.winner)}获胜`;
      if (entry.mode === MODE.PVE) {
        const humanWon = entry.winner === HUMAN_COLOR;
        this.dom.resultTitle.textContent = humanWon ? '你赢了！' : '你输了';
        this.dom.resultSub.textContent = humanWon ? `${label} · 击败「${DIFFICULTY_LABEL[entry.difficulty]}」AI` : `${label} · 再接再厉`;
      } else {
        this.dom.resultTitle.textContent = label;
        this.dom.resultSub.textContent = `${MODE_LABEL[entry.mode]} · 共 ${entry.moveCount} 手`;
      }
    }
    this.dom.resultMoves.textContent = String(entry.moveCount);
    this.dom.resultTime.textContent = Clock.format(entry.durationMs);
    this.dom.modal.classList.remove('hidden');
  }

  hideModal() {
    this.dom.modal.classList.add('hidden');
  }

  toast(message) {
    const el = this.dom.toast;
    el.textContent = message;
    el.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2000);
  }

  renderHistory() {
    const list = Store.loadHistory();
    const container = this.dom.historyList;
    container.textContent = '';

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const li = document.createElement('li');

      const main = document.createElement('div');
      main.className = 'h-main';

      const title = document.createElement('div');
      title.className = 'h-title';
      const badge = document.createElement('span');
      const outcome = this.outcomeFor(entry);
      badge.className = `badge ${outcome.cls}`;
      badge.textContent = outcome.text;
      title.appendChild(badge);
      const modeText = document.createElement('span');
      modeText.textContent =
        entry.mode === MODE.PVE ? `人机 · ${DIFFICULTY_LABEL[entry.difficulty] || ''}` : '双人对战';
      title.appendChild(modeText);

      const sub = document.createElement('div');
      sub.className = 'h-sub';
      sub.textContent = `${this.formatDate(entry.endedAt)} · ${entry.moveCount} 手 · ${Clock.format(entry.durationMs)}`;

      main.appendChild(title);
      main.appendChild(sub);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small';
      btn.dataset.replay = entry.id;
      btn.textContent = '复盘';

      li.appendChild(main);
      li.appendChild(btn);
      container.appendChild(li);
    }
  }

  outcomeFor(entry) {
    if (entry.winner === RESULT.DRAW) return { text: '平局', cls: '' };
    if (entry.mode === MODE.PVE) {
      return entry.winner === HUMAN_COLOR
        ? { text: '你赢了', cls: 'win' }
        : { text: '你输了', cls: 'lose' };
    }
    return { text: `${colorLabel(entry.winner)}胜`, cls: entry.winner === BLACK ? 'win' : '' };
  }

  formatDate(ts) {
    const d = new Date(ts || Date.now());
    const pad = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  enterReplay(entry) {
    this.replay.active = true;
    this.replay.entry = entry;
    this.replay.moves = (entry.moves || []).map((m) => [m[0], m[1]]);
    this.replay.index = this.replay.moves.length;
    this.hover = null;
    this.game.pauseClocks();
    this.dom.replayBar.classList.remove('hidden');
    this.dom.rpSlider.max = String(this.replay.moves.length);
    this.dom.rpAuto.textContent = '自动播放';
    this.syncReplay();
    this.updateReplayUI();
    this.toast(`正在复盘 ${this.formatDate(entry.endedAt)} 的对局`);
  }

  exitReplay() {
    if (!this.replay.active) return;
    this.stopAuto();
    this.replay.active = false;
    this.replay.entry = null;
    this.replay.moves = [];
    this.dom.replayBar.classList.add('hidden');
    this.game.resumeClocks();
    this.refresh();
  }

  syncReplay() {
    const board = this.replay.board;
    board.reset();
    for (let i = 0; i < this.replay.index; i++) {
      const move = this.replay.moves[i];
      board.place(move[0], move[1], i % 2 === 0 ? BLACK : WHITE);
    }
  }

  updateReplayUI() {
    this.dom.rpSlider.value = String(this.replay.index);
    this.dom.rpInfo.textContent = `${this.replay.index} / ${this.replay.moves.length}`;
    this.scheduleDraw();
  }

  gotoReplay(index) {
    const total = this.replay.moves.length;
    this.replay.index = Math.max(0, Math.min(total, index));
    this.syncReplay();
    this.updateReplayUI();
  }

  stepReplay(delta) {
    this.stopAuto();
    this.gotoReplay(this.replay.index + delta);
  }

  toggleAuto() {
    if (this.replay.timer) {
      this.stopAuto();
      return;
    }
    if (this.replay.index >= this.replay.moves.length) this.gotoReplay(0);
    this.dom.rpAuto.textContent = '暂停';
    this.replay.timer = window.setInterval(() => {
      if (this.replay.index >= this.replay.moves.length) {
        this.stopAuto();
        return;
      }
      this.gotoReplay(this.replay.index + 1);
    }, 650);
  }

  stopAuto() {
    if (this.replay.timer) {
      window.clearInterval(this.replay.timer);
      this.replay.timer = null;
    }
    this.dom.rpAuto.textContent = '自动播放';
  }

  replayWinLine() {
    const entry = this.replay.entry;
    if (!entry) return null;
    if (this.replay.index !== this.replay.moves.length) return null;
    if (entry.winner !== BLACK && entry.winner !== WHITE) return null;
    if (this.replay.index === 0) return null;
    const last = this.replay.moves[this.replay.index - 1];
    const line = collectLine(this.replay.board, last[0], last[1]);
    return line ? line.cells : null;
  }
}
