import { BLACK, EMPTY } from '../config.js';

const STAR_POINTS_15 = [
  [3, 3],
  [3, 11],
  [11, 3],
  [11, 11],
  [7, 7],
];

const COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTU';

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Canvas 棋盘渲染器：只负责“把 Board 画出来”，不含任何游戏逻辑。
 * 棋盘、棋子、落子标记、获胜连线、悬停预览都在这里绘制。
 */
export class BoardRenderer {
  constructor(canvas, board, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = board;
    this.maxSize = options.maxSize ?? 660;
    this.minSize = options.minSize ?? 280;
    this.hover = null;
    this.winLine = null;
    this.showLastMove = options.showLastMove !== false;
    this.padding = 0;
    this.cell = 0;
    this.cssSize = 0;
    this.resize();
  }

  setBoard(board) {
    this.board = board;
    this.render();
  }

  /** 按容器宽度自适应尺寸，并处理高分屏 (devicePixelRatio) */
  resize() {
    const parent = this.canvas.parentElement;
    let target = this.maxSize;

    if (parent) {
      const styles = window.getComputedStyle(parent);
      const padX =
        (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const available = parent.clientWidth - padX;
      if (available > 0) target = Math.min(available, this.maxSize);
    }

    target = Math.max(this.minSize, Math.floor(target));
    const dpr = window.devicePixelRatio || 1;

    this.cssSize = target;
    this.canvas.style.width = `${target}px`;
    this.canvas.style.height = `${target}px`;
    this.canvas.width = Math.round(target * dpr);
    this.canvas.height = Math.round(target * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.padding = target * 0.062;
    this.cell = (target - this.padding * 2) / (this.board.size - 1);
  }

  cellX(c) {
    return this.padding + c * this.cell;
  }

  cellY(r) {
    return this.padding + r * this.cell;
  }

  setHover(position) {
    const changed =
      (this.hover?.r ?? null) !== (position?.r ?? null) ||
      (this.hover?.c ?? null) !== (position?.c ?? null);
    this.hover = position || null;
    if (changed) this.render();
  }

  setWinLine(line) {
    this.winLine = line || null;
    this.render();
  }

  /** 客户端坐标 -> 交叉点；返回 null 表示没有点在任何交叉点附近 */
  locate(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    const c = Math.round((x - this.padding) / this.cell);
    const r = Math.round((y - this.padding) / this.cell);
    if (r < 0 || r >= this.board.size || c < 0 || c >= this.board.size) return null;

    const px = this.cellX(c);
    const py = this.cellY(r);
    const distance = Math.hypot(x - px, y - py);
    if (distance > this.cell * 0.58) return null;
    return { r, c };
  }

  render() {
    const ctx = this.ctx;
    const size = this.cssSize;
    const pad = this.padding;
    const cell = this.cell;
    const count = this.board.size;
    const gridSize = cell * (count - 1);

    ctx.clearRect(0, 0, size, size);

    const wood = ctx.createLinearGradient(0, 0, size, size);
    wood.addColorStop(0, '#f2d7a5');
    wood.addColorStop(0.55, '#e6c288');
    wood.addColorStop(1, '#d9b075');
    ctx.fillStyle = wood;
    roundRect(ctx, 0, 0, size, size, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(96, 64, 32, 0.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, size - 2, size - 2, 10);
    ctx.stroke();

    // 网格
    ctx.strokeStyle = 'rgba(92, 62, 34, 0.72)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const p = pad + i * cell;
      ctx.moveTo(pad, p);
      ctx.lineTo(pad + gridSize, p);
      ctx.moveTo(p, pad);
      ctx.lineTo(p, pad + gridSize);
    }
    ctx.stroke();

    // 外框加粗
    ctx.strokeStyle = 'rgba(74, 48, 24, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(pad, pad, gridSize, gridSize);

    // 星位
    ctx.fillStyle = 'rgba(74, 48, 24, 0.9)';
    for (const [r, c] of STAR_POINTS_15) {
      if (r >= count || c >= count) continue;
      ctx.beginPath();
      ctx.arc(this.cellX(c), this.cellY(r), Math.max(2, cell * 0.075), 0, Math.PI * 2);
      ctx.fill();
    }

    // 坐标标注
    ctx.fillStyle = 'rgba(88, 58, 30, 0.75)';
    ctx.font = `${Math.max(9, Math.round(cell * 0.38))}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < count; i++) {
      ctx.fillText(COLUMN_LABELS[i], pad + i * cell, pad * 0.5);
      ctx.fillText(String(i + 1), pad * 0.5, pad + i * cell);
    }

    // 棋子
    const cells = this.board.cells;
    const radius = cell * 0.45;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        const value = cells[r * count + c];
        if (value === EMPTY) continue;
        this.drawStone(ctx, this.cellX(c), this.cellY(r), radius, value, 1);
      }
    }

    // 悬停预览
    if (this.hover && this.board.isEmpty(this.hover.r, this.hover.c)) {
      const preview = this.board.moveCount % 2 === 0 ? BLACK : 2;
      this.drawStone(ctx, this.cellX(this.hover.c), this.cellY(this.hover.r), radius, preview, 0.42);
    }

    // 最后一手标记
    const last = this.board.lastMove;
    if (this.showLastMove && last && !this.winLine) {
      ctx.strokeStyle = '#ff5a5f';
      ctx.lineWidth = Math.max(1.5, cell * 0.07);
      ctx.beginPath();
      ctx.arc(this.cellX(last.c), this.cellY(last.r), cell * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 获胜连线
    if (this.winLine && this.winLine.length >= 2) {
      this.drawWinLine(ctx);
    }
  }

  drawStone(ctx, x, y, radius, player, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(x, y + radius * 0.16, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 26, 12, 0.35)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.4,
      radius * 0.15,
      x,
      y,
      radius * 1.05,
    );

    if (player === BLACK) {
      gradient.addColorStop(0, '#6b6b6b');
      gradient.addColorStop(0.45, '#2a2a2a');
      gradient.addColorStop(1, '#080808');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.6, '#f0f0f0');
      gradient.addColorStop(1, '#c2c2c2');
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = player === BLACK ? 'rgba(255,255,255,0.12)' : 'rgba(120,120,120,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  drawWinLine(ctx) {
    const cell = this.cell;
    const line = this.winLine;
    const start = line[0];
    const end = line[line.length - 1];

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ff3d57';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, cell * 0.16);
    ctx.beginPath();
    ctx.moveTo(this.cellX(start[1]), this.cellY(start[0]));
    ctx.lineTo(this.cellX(end[1]), this.cellY(end[0]));
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.strokeStyle = '#fff3b0';
    for (let i = 0; i < line.length; i++) {
      ctx.beginPath();
      ctx.arc(
        this.cellX(line[i][1]),
        this.cellY(line[i][0]),
        cell * 0.46,
        Math.PI * 0.15,
        Math.PI * 1.85,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}
