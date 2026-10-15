/**
 * 与事件循环协作的小工具。
 * 困难档 AI 在主线程上搜索，必须周期性把控制权交回浏览器，
 * 否则动画、按钮、渲染都会卡死。
 */

const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

// 浏览器用 MessageChannel（不受 setTimeout 的最小 4ms 钳制，让出更及时）；
// Node 下改用 setImmediate，避免常驻端口阻止进程退出。
const channel =
  !isNode && typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;

/**
 * 让出一次宏任务（比 setTimeout(0) 更快，且不受 4ms 钳制）。
 * 浏览器可以在两次宏任务之间完成渲染，因此界面不会被冻结。
 */
export function yieldToEventLoop() {
  if (isNode && typeof setImmediate === 'function') {
    return new Promise((resolve) => setImmediate(resolve));
  }
  if (!channel) {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
