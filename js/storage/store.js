import {
  HISTORY_LIMIT,
  STORAGE_KEY_CURRENT,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_SETTINGS,
} from '../config.js';

/** localStorage 在隐私模式/禁用 Cookie 时可能抛异常，这里做一层安全包装 */
function safeStorage() {
  try {
    const probe = '__gomoku_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

/**
 * 棋谱仓库。
 * - 未完成对局：整盘只存“每手坐标 + 少量元信息”，关掉页面再打开可原样继续；
 * - 已结束对局：滚动保留最近 HISTORY_LIMIT 盘，供逐手复盘。
 * 全程不保存棋盘快照，避免存储膨胀。
 */
export class Store {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    this.available = !!storage;
  }

  _read(key, fallback) {
    if (!this.available) return fallback;
    try {
      const raw = this.storage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  _write(key, value) {
    if (!this.available) return false;
    try {
      this.storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  _remove(key) {
    if (!this.available) return;
    try {
      this.storage.removeItem(key);
    } catch (error) {
      /* 忽略 */
    }
  }

  saveCurrent(snapshot) {
    return this._write(STORAGE_KEY_CURRENT, snapshot);
  }

  loadCurrent() {
    const data = this._read(STORAGE_KEY_CURRENT, null);
    if (!data || !Array.isArray(data.moves)) return null;
    return data;
  }

  clearCurrent() {
    this._remove(STORAGE_KEY_CURRENT);
  }

  listFinished() {
    const list = this._read(STORAGE_KEY_HISTORY, []);
    return Array.isArray(list) ? list : [];
  }

  getFinished(id) {
    return this.listFinished().find((item) => item.id === id) || null;
  }

  addFinished(record) {
    const list = this.listFinished();
    list.unshift(record);
    if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
    this._write(STORAGE_KEY_HISTORY, list);
    return list;
  }

  removeFinished(id) {
    const list = this.listFinished().filter((item) => item.id !== id);
    this._write(STORAGE_KEY_HISTORY, list);
    return list;
  }

  clearFinished() {
    this._remove(STORAGE_KEY_HISTORY);
  }

  loadSettings() {
    return this._read(STORAGE_KEY_SETTINGS, {});
  }

  saveSettings(settings) {
    return this._write(STORAGE_KEY_SETTINGS, settings);
  }
}
