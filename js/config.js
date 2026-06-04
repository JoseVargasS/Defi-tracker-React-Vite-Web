// js/config.js
// Public defaults plus local runtime overrides from js/config.local.js.
const runtimeConfig = globalThis.DEFI_TRACKER_CONFIG || {};

export const BINANCE_API = runtimeConfig.BINANCE_API || 'https://api.binance.com/api/v3';
export const COINSTATS_API = runtimeConfig.COINSTATS_API || 'https://openapiv1.coinstats.app';
export const COINSTATS_API_KEY = runtimeConfig.COINSTATS_API_KEY || '';
export const ETH_API = runtimeConfig.ETH_API || 'https://api.etherscan.io/v2/api';
export const ETH_KEY = runtimeConfig.ETH_KEY || '';

export const HAS_COINSTATS_CONFIG = Boolean(COINSTATS_API_KEY && COINSTATS_API_KEY !== 'replace-me');
export const HAS_ETHERSCAN_CONFIG = Boolean(ETH_KEY && ETH_KEY !== 'replace-me');

export const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ether', icon: 'ETH' },
  { id: 'base-wallet', name: 'Base', icon: 'BASE' },
  { id: 'binancesmartchain', name: 'BSC', icon: 'BSC' }
];
