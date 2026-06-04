// js/wallet.js
// Saved wallets, multichain balances and wallet dashboard rendering.
import {
  COINSTATS_API,
  COINSTATS_API_KEY,
  ETH_API,
  ETH_KEY,
  HAS_COINSTATS_CONFIG,
  HAS_ETHERSCAN_CONFIG,
  SUPPORTED_CHAINS
} from './config.js';
import { fetchPrice } from './exchange.js';
import { fetchAndShowTransactions } from './transactions.js';
import { readSavedWallets, writeSavedWallets } from './storage.js';
import { apiStatusMessage, escapeHTML, makeRequest, safeErrorMessage, safeImageUrl } from './utils.js';

const BALANCE_CONCURRENCY = 1;

const TOKEN_ICON_FALLBACKS = {
  USUAL: 'https://etherscan.io/token/images/usualtoken_32.svg',
  USUALX: 'https://etherscan.io/token/images/usualx_32.png',
  USD0: 'https://static.coinstats.app/coins/usual-usdE9O.png',
  BIO: 'https://etherscan.io/token/images/bioxyz_32.png',
  ETH: './images/Eth-icon-purple.png',
  BNB: 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
  USDC: 'https://etherscan.io/token/images/usdc_ofc_32.svg',
  USDT: 'https://etherscan.io/token/images/tethernew_32.svg',
  SOL: 'https://cryptologos.cc/logos/solana-sol-logo.png'
};

const CHAIN_FALLBACKS = {
  ethereum: { chainId: 1, nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  'base-wallet': { chainId: 8453, nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  binancesmartchain: { chainId: 56, nativeSymbol: 'BNB', nativeName: 'BNB' }
};

const STABLE_PRICES = {
  USDT: 1,
  USDC: 1,
  USD0: 1,
  DAI: 1
};

export function getSavedWallets() {
  return readSavedWallets();
}

export function saveWallet(address) {
  const wallets = getSavedWallets();
  if (!wallets.includes(address)) {
    wallets.push(address);
    writeSavedWallets(wallets);
  }
}

export function renderSavedWallets(selectedAddress = null) {
  const select = document.getElementById('savedWallets');
  if (!select) return;

  const wallets = getSavedWallets()
    .filter(w => typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w));

  writeSavedWallets(wallets);
  select.replaceChildren();

  if (!wallets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '(Sin billeteras guardadas)';
    select.appendChild(option);
    return;
  }

  const fragment = document.createDocumentFragment();
  wallets.forEach(wallet => {
    const option = document.createElement('option');
    option.value = wallet;
    option.textContent = wallet;
    fragment.appendChild(option);
  });

  select.appendChild(fragment);
  select.value = selectedAddress || wallets[wallets.length - 1];
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function tokenIconHtml(symbol, imgUrl) {
  const safeSymbol = escapeHTML(symbol || 'Token');
  const iconUrl = safeImageUrl(imgUrl, TOKEN_ICON_FALLBACKS[String(symbol || '').toUpperCase()] || '');
  if (!iconUrl) return '';
  return `<img src="${escapeHTML(iconUrl)}" alt="${safeSymbol}" id="icon">`;
}

function setWalletMessage(walletDataEl, message, className = '') {
  const el = document.createElement('div');
  if (className) el.className = className;
  el.textContent = message;
  walletDataEl.replaceChildren(el);
}

function integerAmountToNumber(value, decimals = 18) {
  try {
    const raw = String(value || '0');
    const dec = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
    if (raw.includes('.')) return Number(raw) || 0;
    if (!/^\d+$/.test(raw)) return Number(raw) || 0;
    if (raw.length <= 15) return Number(raw) / Math.pow(10, dec);

    const big = BigInt(raw);
    const base = BigInt(10) ** BigInt(dec);
    const intPart = big / base;
    const fracPart = big % base;
    const fracStr = fracPart.toString().padStart(dec, '0').slice(0, 8).padEnd(8, '0');
    return Number(`${intPart.toString()}.${fracStr}`) || 0;
  } catch {
    return 0;
  }
}

async function getFallbackTokenPrice(symbol) {
  const normalized = String(symbol || '').toUpperCase();
  if (STABLE_PRICES[normalized] !== undefined) return STABLE_PRICES[normalized];
  if (normalized === 'ETH') {
    const price = Number.parseFloat(await fetchPrice('ETHUSDT'));
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  if (normalized === 'BNB') {
    const price = Number.parseFloat(await fetchPrice('BNBUSDT'));
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  return null;
}

async function fetchExplorerBalances(address, chain) {
  if (!HAS_ETHERSCAN_CONFIG) return { chain, balances: [], status: null };

  const fallback = CHAIN_FALLBACKS[chain.id];
  if (!fallback) return { chain, balances: [], status: null };

  const safeAddress = encodeURIComponent(address);
  const balanceUrl = `${ETH_API}?chainid=${fallback.chainId}&module=account&action=balance&address=${safeAddress}&tag=latest&apikey=${ETH_KEY}`;
  const tokenUrl = `${ETH_API}?chainid=${fallback.chainId}&module=account&action=tokentx&address=${safeAddress}&page=1&offset=1000&sort=asc&apikey=${ETH_KEY}`;

  const [nativeResponse, tokenResponse] = await Promise.allSettled([
    makeRequest(balanceUrl),
    makeRequest(tokenUrl)
  ]);

  const balances = [];
  const nativeWei = nativeResponse.status === 'fulfilled' ? nativeResponse.value?.result : '0';
  const nativeAmount = integerAmountToNumber(nativeWei, 18);
  const nativePrice = await getFallbackTokenPrice(fallback.nativeSymbol);
  if (nativeAmount > 0) {
    balances.push({
      name: fallback.nativeName,
      symbol: fallback.nativeSymbol,
      amount: nativeAmount,
      price: nativePrice,
      imgUrl: TOKEN_ICON_FALLBACKS[fallback.nativeSymbol]
    });
  }

  const tokenTxs = tokenResponse.status === 'fulfilled' && Array.isArray(tokenResponse.value?.result)
    ? tokenResponse.value.result
    : [];
  const addressLower = address.toLowerCase();
  const tokenBalances = new Map();

  for (const tx of tokenTxs) {
    const contract = String(tx.contractAddress || tx.tokenSymbol || '').toLowerCase();
    const symbol = String(tx.tokenSymbol || 'TOKEN').toUpperCase();
    const decimals = Number(tx.tokenDecimal ?? 18);
    const key = `${contract}-${symbol}`;
    const current = tokenBalances.get(key) || {
      raw: BigInt(0),
      decimals,
      name: tx.tokenName || symbol,
      symbol,
      imgUrl: TOKEN_ICON_FALLBACKS[symbol] || null
    };

    let value;
    try {
      value = BigInt(String(tx.value || '0'));
    } catch {
      value = BigInt(0);
    }

    if (String(tx.to || '').toLowerCase() === addressLower) current.raw += value;
    if (String(tx.from || '').toLowerCase() === addressLower) current.raw -= value;
    tokenBalances.set(key, current);
  }

  for (const token of tokenBalances.values()) {
    if (token.raw <= BigInt(0)) continue;
    const amount = integerAmountToNumber(token.raw.toString(), token.decimals);
    if (amount <= 0) continue;
    const price = await getFallbackTokenPrice(token.symbol);
    balances.push({
      name: token.name,
      symbol: token.symbol,
      amount,
      price,
      imgUrl: token.imgUrl
    });
  }

  return { chain, balances, source: 'etherscan' };
}

async function fetchChainBalances(address, chain) {
  if (HAS_COINSTATS_CONFIG) {
    try {
      const url = `${COINSTATS_API}/wallet/balance?address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(chain.id)}`;
      const response = await fetch(url, {
        credentials: 'omit',
        headers: { 'Accept': 'application/json', 'X-API-KEY': COINSTATS_API_KEY }
      });

      if (response.ok) {
        const balances = await response.json();
        const normalizedBalances = Array.isArray(balances) ? balances : [];
        if (normalizedBalances.length > 0 || !CHAIN_FALLBACKS[chain.id]) {
          return {
            chain,
            balances: normalizedBalances,
            source: 'coinstats',
            status: response.status
          };
        }

        console.warn(`CoinStats returned empty ${chain.name} balances; trying explorer fallback.`);
      } else {
        console.warn(`Failed to fetch ${chain.name} from CoinStats:`, response.status);
        if (response.status === 401 || (response.status === 429 && !CHAIN_FALLBACKS[chain.id])) {
          return { chain, balances: [], source: 'coinstats', status: response.status };
        }
      }
    } catch (error) {
      console.warn(`Error fetching ${chain.name} from CoinStats:`, safeErrorMessage(error));
    }
  }

  return fetchExplorerBalances(address, chain);
}

export async function fetchAndRenderWallet(address) {
  const walletDataEl = document.getElementById('walletData');
  if (!walletDataEl) return;

  if (!HAS_COINSTATS_CONFIG && !HAS_ETHERSCAN_CONFIG) {
    setWalletMessage(
      walletDataEl,
      'Falta cargar js/config.local.js con COINSTATS_API_KEY o ETH_KEY. Ejecuta node scripts/generate-config.mjs y sirve la app desde la raiz del proyecto.'
    );
    return;
  }

  setWalletMessage(walletDataEl, 'Cargando balances de multiples redes...', 'wallet-loading');

  try {
    const chainResults = await mapWithConcurrency(
      SUPPORTED_CHAINS,
      BALANCE_CONCURRENCY,
      chain => fetchChainBalances(address, chain)
    );

    const statusResult = chainResults.find(result => [401, 429].includes(result.status));
    if (statusResult && chainResults.every(result => !result.balances?.length)) {
      setWalletMessage(
        walletDataEl,
        apiStatusMessage(statusResult.status, 'CoinStats')
      );
      return;
    }

    let allAssets = [];
    const byChain = {};

    for (const { chain, balances } of chainResults) {
      if (!balances || balances.length === 0) continue;

      const chainAssets = balances
        .map(token => ({
          name: token.name || token.symbol,
          symbol: token.symbol,
          amount: token.amount || 0,
          price: Number.isFinite(Number(token.price)) ? Number(token.price) : null,
          total: Number.isFinite(Number(token.price)) ? (token.amount || 0) * Number(token.price) : 0,
          chain: chain.name,
          chainId: chain.id,
          chainIcon: chain.icon,
          imgUrl: token.imgUrl
        }))
        .filter(asset => asset.amount > 0);

      if (chainAssets.length > 0) {
        byChain[chain.name] = chainAssets;
        allAssets = allAssets.concat(chainAssets);
      }
    }

    if (allAssets.length === 0) {
      setWalletMessage(walletDataEl, 'No se encontraron balances con valor en ninguna red');
      await fetchAndShowTransactions(address, 'all')
        .catch(error => console.warn('Error loading transactions:', safeErrorMessage(error)));
      return;
    }

    const assetsTotal = allAssets.reduce((acc, asset) => acc + (asset.total || 0), 0);
    let html = `<div class="wallet-dashboard">
      <div class="wallet-totals">
        <div class="wallet-total-title">Total Worth</div>
        <div class="wallet-total-usd">$${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div class="wallet-total-sub">Assets: $${assetsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $0</div>
      </div>`;

    const chains = Object.keys(byChain).sort();
    for (const chainName of chains) {
      const list = byChain[chainName];
      const chainTotal = list.reduce((sum, asset) => sum + (asset.total || 0), 0);
      const chainIcon = escapeHTML(list[0]?.chainIcon || '');
      const safeChainName = escapeHTML(chainName);

      html += `<div class="wallet-assets-card">
        <div class="wallet-assets-card-head">
          <div class="wallet-section-title">${chainIcon} ${safeChainName}</div>
          <div class="wallet-chain-total">Total ${safeChainName}: $${chainTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <table class="wallet-assets-table">
          <thead><tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>`;

      html += list.map(asset => {
        const symbol = String(asset.symbol || 'TOKEN');
        const safeSymbol = escapeHTML(symbol);
        const special4 = ['USUAL', 'USUALX', 'USD0', 'BIO'];
        const priceStr = asset.price === null || asset.price === undefined
          ? '-'
          : special4.includes(symbol.toUpperCase())
            ? `$${Number(asset.price).toFixed(4)}`
            : `$${Number(asset.price).toFixed(2)}`;
        const amountStr = asset.amount === null || asset.amount === undefined
          ? '-'
          : (symbol === 'ETH' || symbol === 'SOL')
            ? Number(asset.amount).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
            : Number(asset.amount).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        const totalStr = asset.total ? `$${asset.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-';

        return `<tr>
          <td>${tokenIconHtml(symbol, asset.imgUrl)}${safeSymbol}</td>
          <td>${amountStr}</td>
          <td>${priceStr}</td>
          <td>${totalStr}</td>
        </tr>`;
      }).join('');

      html += '</tbody></table></div>';
    }

    html += '</div>';
    walletDataEl.innerHTML = html;

    await fetchAndShowTransactions(address, 'all')
      .catch(error => console.warn('Error loading transactions:', safeErrorMessage(error)));
  } catch (err) {
    console.warn('fetchAndRenderWallet error:', safeErrorMessage(err));
    setWalletMessage(walletDataEl, `Error: ${safeErrorMessage(err)}`);
  }
}
