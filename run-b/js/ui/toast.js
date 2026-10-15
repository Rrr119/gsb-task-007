let timer = 0;
let element = null;

export function bindToast(el) {
  element = el;
}

/** 轻量提示：非法落点等操作反馈，绝不静默失败 */
export function showToast(message, duration = 1600) {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    element.hidden = true;
  }, duration);
}
