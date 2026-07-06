import { APP_STORAGE_VERSION, DEFAULT_TRACKED_PAIRS } from '@/lib/config';

export const STORAGE_KEYS = {
  version: 'defiTrackerStorageVersion',
  trackedPairs: 'trackedPairs',
  coinsListCache: 'coinsListCache',
  savedWallets: 'savedWallets',
  walletAutoFetchDisabled: 'walletAutoFetchDisabled',
} as const;

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const PAIR_RE = /^[A-Z0-9]{3,30}$/;

export function readSavedWallets(): string[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.savedWallets) || '[]'
    );
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter(
          (wallet: unknown) =>
            typeof wallet === 'string' && WALLET_RE.test(wallet)
        )
      ),
    ];
  } catch {
    return [];
  }
}

export function writeSavedWallets(wallets: string[]): string[] {
  const cleanWallets = [
    ...new Set(
      (wallets || []).filter(
        (wallet) => typeof wallet === 'string' && WALLET_RE.test(wallet)
      )
    ),
  ];
  if (cleanWallets.length)
    localStorage.setItem(
      STORAGE_KEYS.savedWallets,
      JSON.stringify(cleanWallets)
    );
  else localStorage.removeItem(STORAGE_KEYS.savedWallets);
  return cleanWallets;
}

function sanitizePairs(pairs: string[]): string[] {
  if (!Array.isArray(pairs)) return [];
  const clean = [
    ...new Set(
      pairs
        .map((p) => (typeof p === 'string' ? p.toUpperCase() : ''))
        .filter((p) => PAIR_RE.test(p))
    ),
  ];
  return clean.length ? clean : [...DEFAULT_TRACKED_PAIRS];
}

export function readTrackedPairs(): string[] {
  try {
    return sanitizePairs(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.trackedPairs) || '[]')
    );
  } catch {
    return [...DEFAULT_TRACKED_PAIRS];
  }
}

export function writeTrackedPairs(pairs: string[]): void {
  localStorage.setItem(
    STORAGE_KEYS.trackedPairs,
    JSON.stringify(sanitizePairs(pairs))
  );
}

export function migrateAppStorage(): void {
  if (localStorage.getItem(STORAGE_KEYS.version) !== APP_STORAGE_VERSION) {
    localStorage.removeItem(STORAGE_KEYS.trackedPairs);
    localStorage.removeItem(STORAGE_KEYS.coinsListCache);
    localStorage.setItem(STORAGE_KEYS.walletAutoFetchDisabled, '1');
  }

  writeSavedWallets(readSavedWallets());
  localStorage.setItem(STORAGE_KEYS.version, APP_STORAGE_VERSION);
}

export function clearAppStorage(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  migrateAppStorage();
}
