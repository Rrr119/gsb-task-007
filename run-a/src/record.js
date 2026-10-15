import { STORAGE, HISTORY_LIMIT, MODE, DIFFICULTY } from './config.js';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

export function saveCurrent(state) {
  return write(STORAGE.CURRENT, state);
}

export function loadCurrent() {
  const state = read(STORAGE.CURRENT, null);
  if (!state || !Array.isArray(state.moves)) return null;
  return state;
}

export function clearCurrent() {
  try {
    localStorage.removeItem(STORAGE.CURRENT);
  } catch (err) {
    /* ignore */
  }
}

export function loadHistory() {
  const list = read(STORAGE.HISTORY, []);
  return Array.isArray(list) ? list : [];
}

export function saveHistory(list) {
  return write(STORAGE.HISTORY, list);
}

export function addHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
  saveHistory(list);
  return list;
}

export function clearHistory() {
  return saveHistory([]);
}

export function loadSettings() {
  const settings = read(STORAGE.SETTINGS, null);
  return {
    mode: settings && settings.mode ? settings.mode : MODE.PVE,
    difficulty: settings && settings.difficulty ? settings.difficulty : DIFFICULTY.NORMAL,
    timerMode: !!(settings && settings.timerMode),
  };
}

export function saveSettings(settings) {
  return write(STORAGE.SETTINGS, settings);
}
