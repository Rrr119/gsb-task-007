import {
  HUMAN_COLOR,
  MODE,
  DIFFICULTY,
  DIFFICULTY_LABEL,
  DIFFICULTY_HINT,
  STATUS,
  RESULT,
  resultLabel,
  playerName,
} from '../config.js';
import { PLACE_ERROR } from '../core/board.js';
import { formatDuration } from '../core/clock.js';
import { Game } from '../core/game.js';
import { AIEngine } from '../ai/engine.js';
import { Store } from '../storage/store.js';
import { BoardRenderer } from './renderer.js';
import { ReplayView } from './replay.js';
import { bindToast, showToast } from './toast.js';

const STATUS_TEXT = Object.freeze({
  [PLACE_ERROR.OUT_OF_BOUNDS]: '请点击棋盘上的交叉点',
  [PLACE_ERROR.OCCUPIED]: '这里已经有棋子了',
  [PLACE_ERROR.GAME_OVER]: '本局已结束，请悔棋或重开',
  [PLACE_ERROR.BUSY]: 'AI 正在思考，请稍候',
  [PLACE_ERROR.NOT_YOUR_TURN]: '还没轮到你落子',
});

function formatTimestamp(ts) {
  const date = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 界面与交互层：把 Game / BoardRenderer / ReplayView / Store 粘在一起。
 * 所有 DOM 操作、按钮可用状态、结算弹窗、计时刷新都集中在这里。
 */
export class App {
  constructor(root = document) {
    const $ = (id) => root.getElementById(id);
    this.el = {
      canvas: $('board-canvas'),
      overlay: $('board-overlay'),
      overlayText: $('board-overlay-text'),
      statusText: $('status-text'),
      turnDot: $('turn-dot'),
      modeSwitch: $('mode-switch'),
      difficultySwitch: $('difficulty-switch'),
      difficultyGroup: $('difficulty-group'),
      difficultyHint: $('difficulty-hint'),
      statMoves: $('stat-moves'),
      statTime: $('stat-time'),
      statTurnRow: $('stat-turn-row'),
      statTurnTime: $('stat-turn-time'),
      toggleTurnTimer: $('toggle-turn-timer'),
      btnUndo: $('btn-undo'),
      btnRestart: $('btn-restart'),
      btnClearHistory: $('btn-clear-history'),
      historyList: $('history-list'),
      resultModal: $('result-modal'),
      resultTitle: $('result-title'),
      resultSubtitle: $('result-subtitle'),
      resultMoves: $('result-moves'),
      resultTime: $('result-time'),
      btnResultRestart: $('btn-result-restart'),
      btnResultUndo: $('btn-result-undo'),
      btnResultClose: $('btn-result-close'),
      replayModal: $('replay-modal'),
      toast: $('toast'),
    };

    this.game = new Game();
    this.engine = new AIEngine(this.game.difficulty);
    this.store = new Store();
    this.renderer = new BoardRenderer(this.el.canvas, this.game.board, {
      maxSize: 660,
      minSize: 240,
    });
    this.replay = new ReplayView({
      modal: this.el.replayModal,
      canvas: $('replay-canvas'),
      meta: $('replay-meta'),
      info: $('replay-info'),
      range: $('replay-range'),
      first: $('replay-first'),
      prev: $('replay-prev'),
      play: $('replay-play'),
      next: $('replay-next'),
      last: $('replay-last'),
      close: $('btn-replay-close'),
    });

    this.aiToken = 0;
    this.uiTimer = 0;
    this.lastFinishedId = null;
  }

  init() {
    bindToast(this.el.toast);
    this.replay.bind();
    this.bindEvents();

    const settings = this.store.loadSettings();
    const saved = this.store.loadCurrent();

    if (saved) {
      this.game.restore(saved);
      this.game.showTurnTime = !!saved.showTurnTime;
    } else {
      this.game.newGame({
        mode: settings.mode === MODE.PVP ? MODE.PVP : MODE.PVE,
        difficulty: Object.values(DIFFICULTY).includes(settings.difficulty)
          ? settings.difficulty
          : DIFFICULTY.NORMAL,
        showTurnTime: !!settings.showTurnTime,
      });
    }

    this.engine.setDifficulty(this.game.difficulty);
    this.el.toggleTurnTimer.checked = this.game.showTurnTime;
    this.syncSwitchUI();
    this.renderHistory();
    this.refresh();
    this.startUiLoop();

    // 恢复的对局如果正轮到 AI，自动接着走
    this.maybeTriggerAI();
  }

  bindEvents() {
    this.game.addEventListener('change', () => this.refresh());
    this.game.addEventListener('end', () => this.handleGameEnd());

    this.el.canvas.addEventListener('click', (event) => {
      const point = this.renderer.locate(event.clientX, event.clientY);
      if (!point) {
        showToast(STATUS_TEXT[PLACE_ERROR.OUT_OF_BOUNDS]);
        return;
      }
      this.handleHumanMove(point.r, point.c);
    });

    this.el.canvas.addEventListener('mousemove', (event) => {
      if (!this.canHumanMove()) {
        this.renderer.setHover(null);
        return;
      }
      this.renderer.setHover(this.renderer.locate(event.clientX, event.clientY));
    });

    this.el.canvas.addEventListener('mouseleave', () => this.renderer.setHover(null));

    this.el.modeSwitch.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-mode]');
      if (!button) return;
      this.changeMode(button.dataset.mode);
    });

    this.el.difficultySwitch.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-difficulty]');
      if (!button || button.disabled) return;
      this.changeDifficulty(button.dataset.difficulty);
    });

    this.el.toggleTurnTimer.addEventListener('change', () => {
      this.game.showTurnTime = this.el.toggleTurnTimer.checked;
      this.saveSettings();
      this.refresh();
    });

    this.el.btnUndo.addEventListener('click', () => this.handleUndo());
    this.el.btnRestart.addEventListener('click', () => this.handleRestart());
    this.el.btnClearHistory.addEventListener('click', () => {
      this.store.clearFinished();
      this.renderHistory();
      showToast('已清空本地棋谱');
    });

    this.el.btnResultRestart.addEventListener('click', () => {
      this.hideResult();
      this.handleRestart();
    });
    this.el.btnResultUndo.addEventListener('click', () => {
      this.hideResult();
      this.handleUndo();
    });
    this.el.btnResultClose.addEventListener('click', () => this.hideResult());
    this.el.replayModal.addEventListener('click', (event) => {
      if (event.target === this.el.replayModal) this.replay.close();
    });
    this.replay.el.close.addEventListener('click', () => this.replay.close());

    document.addEventListener('visibilitychange', () => this.handleVisibility());
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.renderer.render();
      this.replay.handleResize();
    });
    window.addEventListener('beforeunload', () => this.persist());
  }

  // ---------------------------------------------------------------- 交互入口

  canHumanMove() {
    if (this.game.status !== STATUS.PLAYING) return false;
    return this.game.isHumanTurn;
  }

  handleHumanMove(r, c) {
    if (this.game.status === STATUS.THINKING) {
      showToast(STATUS_TEXT[PLACE_ERROR.BUSY]);
      return;
    }
    if (this.game.status === STATUS.OVER) {
      showToast(STATUS_TEXT[PLACE_ERROR.GAME_OVER]);
      return;
    }
    if (!this.game.isHumanTurn) {
      showToast(STATUS_TEXT[PLACE_ERROR.NOT_YOUR_TURN]);
      return;
    }

    const result = this.game.place(r, c);
    if (!result.ok) {
      showToast(STATUS_TEXT[result.reason] || '无法落子');
      return;
    }
    this.renderer.setHover(null);
    this.afterMove();
  }

  afterMove() {
    this.persist();
    if (this.game.status === STATUS.PLAYING) this.maybeTriggerAI();
  }

  maybeTriggerAI() {
    if (this.game.mode !== MODE.PVE) return;
    if (this.game.status !== STATUS.PLAYING) return;
    if (this.game.currentPlayer === HUMAN_COLOR) return;
    this.triggerAI();
  }

  async triggerAI() {
    const token = ++this.aiToken;
    const player = this.game.currentPlayer;
    this.game.setThinking(true);

    // 搜索在棋盘副本上进行：思考期间界面渲染 / 悔棋 / 重开都不会被中途的临时落子污染
    const searchBoard = this.game.board.clone();

    try {
      const move = await this.engine.chooseMove(searchBoard, player, {
        shouldAbort: () => token !== this.aiToken,
      });

      if (token !== this.aiToken) return;
      this.game.setThinking(false);

      const target = move && this.game.board.isEmpty(move.r, move.c) ? move : this.fallbackMove();
      if (!target) {
        showToast('棋盘已满，无法落子');
        return;
      }

      const placed = this.game.place(target.r, target.c);
      if (!placed.ok) {
        const backup = this.fallbackMove();
        if (backup) this.game.place(backup.r, backup.c);
      }
      this.persist();
    } catch (error) {
      console.error('[gomoku] AI 搜索失败', error);
      if (token === this.aiToken) this.game.setThinking(false);
    }
  }

  fallbackMove() {
    const board = this.game.board;
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        if (board.isEmpty(r, c)) return { r, c };
      }
    }
    return null;
  }

  handleUndo() {
    if (this.game.status === STATUS.THINKING) {
      this.aiToken++;
      this.game.setThinking(false);
    }
    if (this.lastFinishedId) {
      this.store.removeFinished(this.lastFinishedId);
      this.lastFinishedId = null;
      this.renderHistory();
    }

    const result = this.game.undo();
    if (!result.ok) {
      showToast('还没有可以悔的棋');
      return;
    }
    this.hideResult();
    this.persist();
    this.refresh();
  }

  handleRestart() {
    this.aiToken++;
    this.hideResult();
    this.replay.close();
    this.lastFinishedId = null;
    this.store.clearCurrent();
    this.game.newGame({
      mode: this.game.mode,
      difficulty: this.game.difficulty,
      showTurnTime: this.game.showTurnTime,
    });
    this.engine.setDifficulty(this.game.difficulty);
    this.persist();
    this.refresh();
    this.maybeTriggerAI();
  }

  changeMode(mode) {
    if (mode === this.game.mode) return;
    this.aiToken++;
    this.hideResult();
    this.lastFinishedId = null;
    this.store.clearCurrent();
    this.game.newGame({
      mode,
      difficulty: this.game.difficulty,
      showTurnTime: this.game.showTurnTime,
    });
    this.saveSettings();
    this.syncSwitchUI();
    this.persist();
    this.refresh();
    showToast(mode === MODE.PVP ? '已切换到双人对战，棋盘已重置' : '已切换为人机对战，棋盘已重置');
    this.maybeTriggerAI();
  }

  changeDifficulty(difficulty) {
    this.game.difficulty = difficulty;
    this.engine.setDifficulty(difficulty);
    this.saveSettings();
    this.syncSwitchUI();
    this.persist();
    showToast(`AI 难度：${DIFFICULTY_LABEL[difficulty]}`);
  }

  handleGameEnd() {
    this.persist();
    const record = this.game.toRecord();
    this.store.clearCurrent();
    this.store.addFinished(record);
    this.lastFinishedId = record.id;
    this.renderHistory();
    this.showResult(record);
  }

  // ---------------------------------------------------------------- 视图刷新

  refresh() {
    const game = this.game;

    this.renderer.setWinLine(game.winLine);

    this.el.statMoves.textContent = String(game.moveCount);
    this.el.statTime.textContent = formatDuration(game.clock.elapsed());
    this.el.statTurnRow.hidden = !game.showTurnTime;
    if (game.showTurnTime) {
      this.el.statTurnTime.textContent = `${(game.clock.turnElapsed() / 1000).toFixed(1)}s`;
    }

    const dot = this.el.turnDot;
    if (game.status === STATUS.OVER) {
      delete dot.dataset.player;
      dot.dataset.over = '1';
      this.el.statusText.textContent =
        game.winner === RESULT.DRAW
          ? '平局 · 棋盘已下满'
          : resultLabel(game.winner, game.mode);
    } else {
      delete dot.dataset.over;
      dot.dataset.player = String(game.currentPlayer);
      if (game.status === STATUS.THINKING) {
        this.el.statusText.textContent = `AI 思考中…（${DIFFICULTY_LABEL[game.difficulty]}）`;
      } else {
        let text = `${playerName(game.currentPlayer)}落子`;
        if (game.mode === MODE.PVE) {
          text += game.currentPlayer === HUMAN_COLOR ? '（你）' : '（AI）';
        }
        this.el.statusText.textContent = text;
      }
    }

    this.el.overlay.hidden = game.status !== STATUS.THINKING;
    this.updateControls();
  }

  updateControls() {
    const game = this.game;
    const pvp = game.mode === MODE.PVP;

    this.el.btnUndo.disabled = game.moveCount === 0;
    this.el.btnRestart.disabled = false;

    const difficultyButtons = this.el.difficultySwitch.querySelectorAll('button');
    difficultyButtons.forEach((button) => {
      button.disabled = pvp;
    });
    this.el.difficultyGroup.style.opacity = pvp ? '0.45' : '1';
  }

  syncSwitchUI() {
    this.el.modeSwitch.querySelectorAll('button[data-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === this.game.mode);
    });
    this.el.difficultySwitch.querySelectorAll('button[data-difficulty]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.difficulty === this.game.difficulty);
    });
    this.el.difficultyHint.textContent = DIFFICULTY_HINT[this.game.difficulty] || '';
    this.el.toggleTurnTimer.checked = this.game.showTurnTime;
  }

  startUiLoop() {
    const tick = () => {
      this.el.statTime.textContent = formatDuration(this.game.clock.elapsed());
      if (this.game.showTurnTime) {
        this.el.statTurnTime.textContent = `${(this.game.clock.turnElapsed() / 1000).toFixed(1)}s`;
      }
    };
    window.clearInterval(this.uiTimer);
    this.uiTimer = window.setInterval(tick, 200);
  }

  handleVisibility() {
    if (document.hidden) {
      this.game.clock.pause();
      this.persist();
    } else if (this.game.status !== STATUS.OVER) {
      this.game.clock.start();
    }
  }

  showResult(record) {
    this.el.resultTitle.textContent = resultLabel(record.winner, record.mode);
    const modeText = record.mode === MODE.PVE ? `人机对战 · ${DIFFICULTY_LABEL[record.difficulty]}` : '双人对战';
    const detail =
      record.winner === RESULT.DRAW ? '棋盘已下满，双方握手言和' : '连成五子，对局结束';
    this.el.resultSubtitle.textContent = `${modeText} · ${detail}`;
    this.el.resultMoves.textContent = `${record.moveCount} 手`;
    this.el.resultTime.textContent = formatDuration(record.durationMs);
    this.el.resultModal.hidden = false;
  }

  hideResult() {
    this.el.resultModal.hidden = true;
  }

  renderHistory() {
    const list = this.store.listFinished();
    const ul = this.el.historyList;
    ul.textContent = '';

    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'history__empty';
      li.textContent = '暂无已结束的对局';
      ul.appendChild(li);
      return;
    }

    for (const record of list) {
      const li = document.createElement('li');
      li.className = 'history__item';

      const main = document.createElement('div');
      main.className = 'history__main';

      const title = document.createElement('span');
      title.className = 'history__title';
      title.textContent = resultLabel(record.winner, record.mode);

      const meta = document.createElement('span');
      meta.className = 'history__meta';
      const modeText =
        record.mode === MODE.PVE
          ? `人机 · ${DIFFICULTY_LABEL[record.difficulty] || ''}`
          : '双人';
      meta.textContent = `${modeText} · ${record.moveCount} 手 · ${formatDuration(
        record.durationMs,
      )} · ${formatTimestamp(record.finishedAt)}`;

      main.appendChild(title);
      main.appendChild(meta);
      li.appendChild(main);
      li.title = '点击复盘';
      li.addEventListener('click', () => this.openReplay(record.id));
      ul.appendChild(li);
    }
  }

  openReplay(id) {
    const record = this.store.getFinished(id);
    if (!record) {
      showToast('棋谱已不存在');
      this.renderHistory();
      return;
    }
    this.replay.open(record);
  }

  // ---------------------------------------------------------------- 持久化

  persist() {
    if (this.game.status === STATUS.OVER) return;
    this.store.saveCurrent(this.game.snapshot());
  }

  saveSettings() {
    this.store.saveSettings({
      mode: this.game.mode,
      difficulty: this.game.difficulty,
      showTurnTime: this.game.showTurnTime,
    });
  }
}
