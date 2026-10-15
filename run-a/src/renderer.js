import { BLACK, WHITE } from './config.js';

const STAR_POINTS = [
  [3, 3],
  [3, 11],
  [11, 3],
  [11, 11],
  [7, 7],
];

const COLUMN_LABELS = 'ABCDEFGHIJKLMNO'.split('');

export class Renderer {
  constructor(canvas, size) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = size;
    this.cssSize = 640;
    this.dpr = 1;
    this.geom = { size: 640, pad: 38, cell: 40 };
    this.onResize = null;
    this._resize = () => this.handleResize();
    window.addEventListener('resize', this._resize);
    this.handleResize();
  }

  handleResize() {
    const frame = this.canvas.parentElement;
    const frameWidth = frame && frame.clientWidth ? frame.clientWidth - 24 : 640;
    const heightLimit = Math.max(300, window.innerHeight - 230);
    let size = Math.min(frameWidth, heightLimit, 720);
    if (!Number.isFinite(size) || size <= 0) size = 640;
    size = Math.max(280, Math.floor(size));

    const dpr = window.devicePixelRatio || 1;
    this.cssSize = size;
    this.dpr = dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.floor(size * dpr);
    this.canvas.height = Math.floor(size * dpr);

    const pad = Math.round(size * 0.06);
    const cell = (size - pad * 2) / (this.size - 1);
    this.geom = { size, pad, cell };
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.onResize) this.onResize();
  }

  toPixel(x, y) {
    const { pad, cell } = this.geom;
    return { px: pad + x * cell, py: pad + y * cell };
  }

  pixelToCell(px, py) {
    const { pad, cell } = this.geom;
    const col = Math.round((px - pad) / cell);
    const row = Math.round((py - pad) / cell);
    const { px: cx, py: cy } = this.toPixel(col, row);
    const dist = Math.hypot(px - cx, py - cy);
    return { col, row, dist };
  }

  draw(snapshot) {
    const ctx = this.ctx;
    const { size, pad, cell } = this.geom;
    const n = this.size;

    ctx.clearRect(0, 0, size, size);
    this.drawBoardBackground(size);
    this.drawGrid(n, pad, cell);
    this.drawStarPoints(pad, cell);
    this.drawCoordinates(n, pad, cell, size);

    const board = snapshot.board;
    const stones = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const value = board.cells[y * n + x];
        if (value !== BLACK && value !== WHITE) continue;
        stones.push({ x, y, value });
      }
    }

    const radius = cell * 0.44;
    for (let i = 0; i < stones.length; i++) {
      const { px, py } = this.toPixel(stones[i].x, stones[i].y);
      this.drawStone(px, py, radius, stones[i].value);
    }

    if (snapshot.winLine && snapshot.winLine.length >= 5) {
      this.drawWinLine(snapshot.winLine, n, pad, cell, radius);
    }

    if (snapshot.lastMove) {
      const { px, py } = this.toPixel(snapshot.lastMove[0], snapshot.lastMove[1]);
      this.drawLastMarker(px, py, radius, board.cells[snapshot.lastMove[1] * n + snapshot.lastMove[0]]);
    }

    if (snapshot.hover) {
      const { px, py } = this.toPixel(snapshot.hover.x, snapshot.hover.y);
      this.drawGhost(px, py, radius, snapshot.hover.color);
    }
  }

  drawBoardBackground(size) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#f0cf95');
    grad.addColorStop(0.5, '#e2b978');
    grad.addColorStop(1, '#cf9c58');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const glow = ctx.createRadialGradient(size * 0.3, size * 0.2, size * 0.05, size * 0.5, size * 0.5, size * 0.8);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    glow.addColorStop(1, 'rgba(120, 80, 30, 0.12)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  }

  drawGrid(n, pad, cell) {
    const ctx = this.ctx;
    const end = pad + (n - 1) * cell;
    ctx.strokeStyle = 'rgba(76, 50, 20, 0.75)';
    ctx.lineWidth = Math.max(1, cell * 0.03);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pad + i * cell;
      ctx.moveTo(pad, p);
      ctx.lineTo(end, p);
      ctx.moveTo(p, pad);
      ctx.lineTo(p, end);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(60, 38, 12, 0.9)';
    ctx.lineWidth = Math.max(1.6, cell * 0.06);
    ctx.strokeRect(pad, pad, end - pad, end - pad);
  }

  drawStarPoints(pad, cell) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(60, 38, 12, 0.9)';
    for (let i = 0; i < STAR_POINTS.length; i++) {
      const [x, y] = STAR_POINTS[i];
      if (x >= this.size || y >= this.size) continue;
      const { px, py } = this.toPixel(x, y);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.4, cell * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCoordinates(n, pad, cell, size) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(70, 45, 15, 0.7)';
    ctx.font = `${Math.max(9, Math.round(cell * 0.32))}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const p = pad + i * cell;
      ctx.fillText(COLUMN_LABELS[i], p, size - pad * 0.45);
      ctx.fillText(String(i + 1), pad * 0.45, p);
    }
  }

  drawStone(px, py, radius, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px + radius * 0.06, py + radius * 0.1, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60, 40, 12, 0.22)';
    ctx.fill();

    const grad = ctx.createRadialGradient(
      px - radius * 0.35,
      py - radius * 0.4,
      radius * 0.12,
      px,
      py,
      radius
    );
    if (color === BLACK) {
      grad.addColorStop(0, '#6d727a');
      grad.addColorStop(0.4, '#1f2226');
      grad.addColorStop(1, '#05060a');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.65, '#eef0f2');
      grad.addColorStop(1, '#bcc2c9');
    }
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.strokeStyle = color === BLACK ? 'rgba(0,0,0,0.65)' : 'rgba(120,128,138,0.65)';
    ctx.stroke();
    ctx.restore();
  }

  drawLastMarker(px, py, radius, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.95, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, radius * 0.18);
    ctx.strokeStyle = color === BLACK ? '#ff5a5a' : '#e0322c';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, radius * 0.24), 0, Math.PI * 2);
    ctx.fillStyle = '#ff5a5a';
    ctx.fill();
    ctx.restore();
  }

  drawGhost(px, py, radius, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = color === BLACK ? '#20242a' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = 'rgba(80, 60, 30, 0.5)';
    ctx.stroke();
    ctx.restore();
  }

  drawWinLine(indices, n, pad, cell, radius) {
    const ctx = this.ctx;
    const first = indices[0];
    const last = indices[indices.length - 1];
    const a = this.toPixel(first % n, Math.floor(first / n));
    const b = this.toPixel(last % n, Math.floor(last / n));

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, radius * 0.42);
    ctx.strokeStyle = '#ff3b30';
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < indices.length; i++) {
      const { px, py } = this.toPixel(indices[i] % n, Math.floor(indices[i] / n));
      ctx.beginPath();
      ctx.arc(px, py, radius * 1.02, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
