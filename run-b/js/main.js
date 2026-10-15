import { App } from './ui/app.js';

const app = new App(document);
app.init();

// 供 boot-warning 检测与调试使用
window.__GOMOKU_READY__ = true;
window.gomoku = app;
