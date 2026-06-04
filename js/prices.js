// js/prices.js
import { fetchPrice } from './exchange.js';

const STABLE_PRICES = {
  USDT: 1,
  USDC: 1,
  USD0: 1,
  DAI: 1
};

function normalizeSymbol(symbol) {
  return String(symbol || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function isValidSymbol(symbol) {
  const s = normalizeSymbol(symbol);
  return Boolean(s && s !== '?' && s !== 'ERC20');
}

export async function getTokenPriceUSD(symbol) {
  if (!isValidSymbol(symbol)) return null;

  const s = normalizeSymbol(symbol);
  if (STABLE_PRICES[s] !== undefined) return STABLE_PRICES[s];

  if (s === 'ETH') {
    const price = Number.parseFloat(await fetchPrice('ETHUSDT'));
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  return null;
}

export async function getHistoricalTokenPriceUSD(symbol) {
  if (!isValidSymbol(symbol)) return null;

  const s = normalizeSymbol(symbol);
  if (STABLE_PRICES[s] !== undefined) return STABLE_PRICES[s];

  return null;
}
