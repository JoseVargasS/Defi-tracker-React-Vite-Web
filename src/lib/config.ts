export const BINANCE_API = import.meta.env.VITE_BINANCE_API || 'https://api.binance.com/api/v3';
export const COINSTATS_API = import.meta.env.VITE_COINSTATS_API || 'https://openapiv1.coinstats.app';
export const COINSTATS_API_KEY = import.meta.env.VITE_COINSTATS_API_KEY || '';
export const ETH_API = import.meta.env.VITE_ETH_API || 'https://api.etherscan.io/v2/api';
export const ETH_KEY = import.meta.env.VITE_ETH_KEY || '';

export const HAS_COINSTATS_CONFIG = Boolean(COINSTATS_API_KEY && COINSTATS_API_KEY !== 'replace-me');
export const HAS_ETHERSCAN_CONFIG = Boolean(ETH_KEY && ETH_KEY !== 'replace-me');

export const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ether', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'base-wallet', name: 'Base', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'binancesmartchain', name: 'BSC', icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' },
] as const;

export const DEFAULT_TRACKED_PAIRS = [
  'ETHUSDT',
  'BTCUSDT',
  'USUALUSDT',
  'VELODROMEUSDT',
  'BATUSDT',
  'BIOUSDT',
];

export const APP_STORAGE_VERSION = '2026-05-20-1';
