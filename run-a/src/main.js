import { UI } from './ui.js';

function boot() {
  const ui = new UI();
  ui.start();
  window.__GOMOKU_READY = true;
}

window.__GOMOKU_READY = true;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
