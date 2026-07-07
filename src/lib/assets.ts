// ponytail: single source of truth for the coin icons rendered in the sidebar
// Falls back to a generic crypto icon CDN when no specific entry exists.

const CRYPTOLOGOS_BASE = 'https://cryptologos.cc/logos';
const COINGECKO_BASE = 'https://assets.coingecko.com/coins/images';
const COINSTATS_BASE = 'https://static.coinstats.app/coins';
const GENERIC_CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/32/icon';

export const COIN_ICON_URLS: Record<string, string> = {
  BTC:  `${CRYPTOLOGOS_BASE}/bitcoin-btc-logo.png`,
  ETH:  `${CRYPTOLOGOS_BASE}/ethereum-eth-logo.png`,
  BNB:  `${CRYPTOLOGOS_BASE}/bnb-bnb-logo.png`,
  SOL:  `${CRYPTOLOGOS_BASE}/solana-sol-logo.png`,
  ADA:  `${CRYPTOLOGOS_BASE}/cardano-ada-logo.png`,
  XRP:  `${CRYPTOLOGOS_BASE}/xrp-xrp-logo.png`,
  DOGE: `${CRYPTOLOGOS_BASE}/dogecoin-doge-logo.png`,
  MATIC:`${CRYPTOLOGOS_BASE}/polygon-matic-logo.png`,
  DOT:  `${CRYPTOLOGOS_BASE}/polkadot-new-dot-logo.png`,
  LINK: `${CRYPTOLOGOS_BASE}/chainlink-link-logo.png`,
  LTC:  `${CRYPTOLOGOS_BASE}/litecoin-ltc-logo.png`,
  TRX:  `${CRYPTOLOGOS_BASE}/tron-trx-logo.png`,
  SHIB: `${CRYPTOLOGOS_BASE}/shiba-inu-shib-logo.png`,
  AVAX: `${CRYPTOLOGOS_BASE}/avalanche-avax-logo.png`,
  USDC: `${CRYPTOLOGOS_BASE}/usd-coin-usdc-logo.png`,
  USDT: `${CRYPTOLOGOS_BASE}/tether-usdt-logo.png`,
  PEPE: `${CRYPTOLOGOS_BASE}/pepe-pepe-logo.png`,
  ARB:  `${CRYPTOLOGOS_BASE}/arbitrum-arb-logo.png`,
  OP:   `${CRYPTOLOGOS_BASE}/optimism-op-logo.png`,
  BAT:  `${CRYPTOLOGOS_BASE}/basic-attention-token-bat-logo.png`,
  BIO:  `${COINGECKO_BASE}/51761/large/bio.png`,
  USDC_ALT: `${COINGECKO_BASE}/6319/large/USD_Coin_icon.png`,
  USDT_ALT: `${COINGECKO_BASE}/325/large/Tether.png`,
  BNB_ALT:  `${COINGECKO_BASE}/825/large/binance-coin-logo.png`,
  SOL_ALT:  `${COINGECKO_BASE}/4128/large/solana.png`,
  ETH_LOCAL: '/images/Eth-icon-purple.png',
  USUAL:  `${COINSTATS_BASE}/usual-usdE9O.png`,
  USUALX: `${COINSTATS_BASE}/usualx8Xz.png`,
  USD0:   `${COINSTATS_BASE}/usual-usdE9O.png`,
};

export const TOKEN_ICON_FALLBACKS: Record<string, string> = {
  USUAL:  COIN_ICON_URLS.USUAL,
  USUALX: COIN_ICON_URLS.USUALX,
  USD0:   COIN_ICON_URLS.USD0,
  BIO:    COIN_ICON_URLS.BIO,
  ETH:    COIN_ICON_URLS.ETH_LOCAL,
  BNB:    COIN_ICON_URLS.BNB_ALT,
  USDC:   COIN_ICON_URLS.USDC_ALT,
  USDT:   COIN_ICON_URLS.USDT_ALT,
  SOL:    COIN_ICON_URLS.SOL_ALT,
};

const COIN_DISPLAY_NAMES: Record<string, string> = {
  BTC: 'BTC', ETH: 'ETH', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana',
  ADA: 'Cardano', XRP: 'XRP', DOGE: 'Dogecoin', MATIC: 'Polygon',
  TRX: 'TRON', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot',
  SHIB: 'Shiba Inu', USDC: 'USD Coin', AVAX: 'Avalanche', OP: 'Optimism',
  ARB: 'Arbitrum', PEPE: 'Pepe',
};

export function coinDisplayName(base: string): string {
  return COIN_DISPLAY_NAMES[base] ?? base;
}

export function tokenIconUrl(symbol: string): string {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return '';
  if (TOKEN_ICON_FALLBACKS[sym]) return TOKEN_ICON_FALLBACKS[sym];
  return `${GENERIC_CDN}/${sym.toLowerCase()}.png`;
}
