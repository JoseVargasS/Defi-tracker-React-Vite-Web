// Browser storage helpers for app-owned localStorage keys.
import { APP_STORAGE_VERSION, DEFAULT_TRACKED_PAIRS } from './state.js';

export const STORAGE_KEYS = {
  version: 'defiTrackerStorageVersion',
  trackedPairs: 'trackedPairs',
  coinsListCache: 'coinsListCache',
  savedWallets: 'savedWallets',
  walletAutoFetchDisabled: 'walletAutoFetchDisabled'
};

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const PAIR_RE = /^[A-Z0-9]{3,30}$/;

export function readSavedWallets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.savedWallets) || '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(wallet => typeof wallet === 'string' && WALLET_RE.test(wallet)))];
  } catch {
    return [];
  }
}

export function writeSavedWallets(wallets) {
  const cleanWallets = [...new Set((wallets || []).filter(wallet => typeof wallet === 'string' && WALLET_RE.test(wallet)))];
  if (cleanWallets.length) localStorage.setItem(STORAGE_KEYS.savedWallets, JSON.stringify(cleanWallets));
  else localStorage.removeItem(STORAGE_KEYS.savedWallets);
  return cleanWallets;
}

export function readTrackedPairs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.trackedPairs) || '[]');
    const cleanPairs = [...new Set(parsed
      .map(pair => typeof pair === 'string' ? pair.toUpperCase() : '')
      .filter(pair => PAIR_RE.test(pair)))];
    return cleanPairs.length ? cleanPairs : [...DEFAULT_TRACKED_PAIRS];
  } catch {
    return [...DEFAULT_TRACKED_PAIRS];
  }
}

export function writeTrackedPairs(pairs) {
  localStorage.setItem(STORAGE_KEYS.trackedPairs, JSON.stringify(readablePairs(pairs)));
}

function readablePairs(pairs) {
  const parsed = Array.isArray(pairs) ? pairs : [];
  const cleanPairs = [...new Set(parsed
    .map(pair => typeof pair === 'string' ? pair.toUpperCase() : '')
    .filter(pair => PAIR_RE.test(pair)))];
  return cleanPairs.length ? cleanPairs : [...DEFAULT_TRACKED_PAIRS];
}

export function migrateAppStorage() {
  if (localStorage.getItem(STORAGE_KEYS.version) !== APP_STORAGE_VERSION) {
    localStorage.removeItem(STORAGE_KEYS.trackedPairs);
    localStorage.removeItem(STORAGE_KEYS.coinsListCache);
    localStorage.setItem(STORAGE_KEYS.walletAutoFetchDisabled, '1');
  }

  writeSavedWallets(readSavedWallets());
  localStorage.setItem(STORAGE_KEYS.version, APP_STORAGE_VERSION);
}

export function clearAppStorage() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  migrateAppStorage();
}
