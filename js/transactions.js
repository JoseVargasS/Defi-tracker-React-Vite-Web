// js/transactions.js
// Transaction fetch/render for Ethereum ERC-20/native ETH and Base via CoinStats.

import {
  ETH_API,
  ETH_KEY,
  COINSTATS_API,
  COINSTATS_API_KEY,
  HAS_COINSTATS_CONFIG,
  HAS_ETHERSCAN_CONFIG
} from './config.js';
import { escapeHTML, makeRequest, safeErrorMessage, safeImageUrl } from './utils.js';
import { getTokenPriceUSD, getHistoricalTokenPriceUSD } from './prices.js';
import { monthNames } from './state.js';

const networks = {
  ethereum: { txList: [], offset: 0, tbodyId: 'eth-txBody', tableId: 'eth-txTable', btnId: 'btnLoadMoreEth' },
  'base-wallet': { txList: [], offset: 0, tbodyId: 'base-txBody', tableId: 'base-txTable', btnId: 'btnLoadMoreBase' }
};

const TOKEN_ICON_FALLBACKS = {
  USUAL: 'https://etherscan.io/token/images/usualtoken_32.svg',
  USUALX: 'https://etherscan.io/token/images/usualx_32.png',
  USD0: 'https://static.coinstats.app/coins/usual-usdE9O.png',
  BIO: 'https://etherscan.io/token/images/bioxyz_32.png',
  ETH: './images/Eth-icon-purple.png',
  USDC: 'https://etherscan.io/token/images/usdc_ofc_32.svg',
  USDT: 'https://etherscan.io/token/images/tethernew_32.svg'
};

let currentTxAddress = null;
const TX_PAGE_SIZE = 10;
const PRICE_CONCURRENCY = 1;
const ETHERSCAN_PAGE_LIMIT = 300;

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

function normalizePriceSymbol(tx) {
  return tx.tokenSymbol || tx.symbol || 'ETH';
}

function safeIsIntegerString(s) {
  return typeof s === 'string' && /^\d+$/.test(s);
}

function formatDisplayAmount(valueStr, decimals = 18, displayDecimals = 4) {
  try {
    const vStr = String(valueStr || '0');
    const dec = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
    const disp = Number.isFinite(Number(displayDecimals)) ? Number(displayDecimals) : 4;

    if (vStr.includes('.')) {
      const n = Number(vStr);
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    if (!safeIsIntegerString(vStr)) {
      const n = Number(vStr) || 0;
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    if (vStr.length <= 15) {
      const n = Number(vStr) / Math.pow(10, dec);
      return n.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
    }

    if (typeof BigInt !== 'undefined') {
      const big = BigInt(vStr);
      const base = BigInt(10) ** BigInt(dec);
      const intPart = big / base;
      const fracPart = big % base;
      const needed = disp + 1;
      let fracFull = fracPart.toString().padStart(dec, '0').slice(0, Math.max(needed, 0));
      if (fracFull.length < needed) fracFull = fracFull.padEnd(needed, '0');

      let fracToRound = fracFull.slice(0, disp);
      const roundDigit = Number(fracFull.charAt(disp) || '0');

      if (roundDigit >= 5) {
        const fracNum = BigInt(fracToRound || '0') + BigInt(1);
        const maxFrac = BigInt(10) ** BigInt(disp);
        if (fracNum >= maxFrac) return `${(intPart + BigInt(1)).toString()}.${'0'.repeat(disp)}`;
        return `${intPart.toString()}.${fracNum.toString().padStart(disp, '0')}`;
      }

      fracToRound = fracToRound.padEnd(disp, '0');
      return `${intPart.toString()}.${fracToRound}`;
    }

    const fallback = Number(vStr) / Math.pow(10, dec);
    return fallback.toLocaleString(undefined, { minimumFractionDigits: disp, maximumFractionDigits: disp });
  } catch {
    return String(valueStr || '0');
  }
}

function amountToFloat(valueStr, decimals = 18) {
  try {
    const vStr = String(valueStr || '0');
    if (vStr.includes('.')) return Number(vStr);
    if (vStr.length <= 15) return Number(vStr) / Math.pow(10, Number(decimals));

    if (typeof BigInt !== 'undefined') {
      const dec = Number(decimals || 18);
      const big = BigInt(vStr);
      const base = BigInt(10) ** BigInt(dec);
      const intPart = big / base;
      const fracPart = big % base;
      const fracStr = fracPart.toString().padStart(dec, '0').slice(0, 8).padEnd(8, '0');
      return parseFloat(`${intPart.toString()}.${fracStr}`);
    }

    return Number(vStr) / Math.pow(10, Number(decimals));
  } catch {
    return 0;
  }
}

function tokenIconHtml(symbol, imgUrl) {
  const safeSymbol = escapeHTML(symbol || 'Token');
  const iconUrl = safeImageUrl(imgUrl, TOKEN_ICON_FALLBACKS[String(symbol || '').toUpperCase()] || '');
  if (!iconUrl) return '';
  return `<img src="${escapeHTML(iconUrl)}" alt="${safeSymbol}" class="tx-icon">`;
}

function setTableMessage(tbody, message) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 4;
  td.className = 'tx-message-cell';
  td.textContent = message;
  tr.appendChild(td);
  tbody.replaceChildren(tr);
}

function appendDateHeader(tbody, date) {
  const [day, month, year] = date.split('/');
  const dateObj = new Date(`${year}-${month}-${day}`);
  const dateText = `${parseInt(day, 10)} ${monthNames[dateObj.getMonth()]}${year ? `, ${year}` : ''}`;

  const dateRow = document.createElement('tr');
  dateRow.className = 'tx-date-row';
  const dateCell = document.createElement('td');
  dateCell.colSpan = 4;
  dateCell.textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);
  dateRow.appendChild(dateCell);
  tbody.appendChild(dateRow);

  const tagsRow = document.createElement('tr');
  tagsRow.className = 'tx-list-tags';
  ['tipo', 'token', 'cantidad', 'USD / P&L'].forEach(label => {
    const cell = document.createElement('td');
    cell.textContent = label;
    tagsRow.appendChild(cell);
  });
  tbody.appendChild(tagsRow);
}

function buildTransactionMeta(tx) {
  const addr = currentTxAddress ? currentTxAddress.toLowerCase() : '';
  const isSent = Boolean(tx.from && tx.from.toLowerCase() === addr);
  const sym = tx.tokenSymbol || tx.symbol || 'ETH';
  const dec = tx.tokenDecimal !== undefined && tx.tokenDecimal !== null
    ? Number(tx.tokenDecimal)
    : (tx.decimals !== undefined && tx.decimals !== null ? Number(tx.decimals) : 18);
  const rawValue = tx.value ?? tx.tokenValue ?? tx.amount ?? '0';
  const displayDecimals = (sym === 'ETH' || sym === 'BASE') ? 6 : 4;
  const amtFormatted = formatDisplayAmount(String(rawValue || '0'), dec, displayDecimals);
  const amtFloat = amountToFloat(String(rawValue || '0'), dec);
  const txDateObj = new Date(Number(tx.timeStamp) * 1000);

  return {
    isSent,
    type: isSent ? 'Sent' : 'Received',
    sym,
    amtFloat,
    amtFormatted,
    txDateObj,
    timeStr: txDateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  };
}

function renderPriceState(row, meta, priceUSD, priceHistRaw) {
  let priceHist = priceHistRaw;
  const noData = !priceHist || priceHist === 0;
  if (noData) priceHist = null;

  const usd = meta.amtFloat * (priceUSD || 0);
  const usdHist = meta.amtFloat * (priceHist || 0);
  const pl = usd - usdHist;
  const plPct = usdHist ? (pl / usdHist) * 100 : 0;
  const plColor = pl > 0 ? '#1ecb81' : (pl < 0 ? '#e74c3c' : '#aaa');
  const amountDetail = row.querySelector('.tx-price-detail');
  const current = row.querySelector('.tx-usd-current');
  const plLine = row.querySelector('.tx-pl-line');
  const plPctLine = row.querySelector('.tx-pl-pct');

  if (amountDetail) {
    amountDetail.textContent = noData
      ? 'Sin datos historicos'
      : `$${usdHist.toLocaleString(undefined, { maximumFractionDigits: 2 })} (1 ${meta.sym} = $${priceHist.toFixed(4)})`;
    amountDetail.classList.toggle('muted', noData);
  }

  if (current) current.textContent = `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (plLine) {
    plLine.textContent = `${pl >= 0 ? '+' : ''}${pl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    plLine.style.color = plColor;
  }
  if (plPctLine) {
    plPctLine.textContent = `(${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%)`;
    plPctLine.style.color = plColor;
  }
}

async function hydrateTransactionPrice(row, tx, meta) {
  try {
    const sym = normalizePriceSymbol(tx);
    const [priceUSD, priceHist] = await Promise.all([
      getTokenPriceUSD(sym),
      getHistoricalTokenPriceUSD(sym, meta.txDateObj)
    ]);
    renderPriceState(row, meta, priceUSD, priceHist);
  } catch {
    renderPriceState(row, meta, 0, null);
  }
}

function renderTransactionRow(tbody, tx) {
  const meta = buildTransactionMeta(tx);
  if (meta.sym === 'ETH' && meta.amtFloat < 0.00001) return null;

  const row = document.createElement('tr');
  row.className = 'tx-list-row';
  const safeSym = escapeHTML(meta.sym);
  const safeAmount = escapeHTML(meta.amtFormatted);

  row.innerHTML = `
    <td class="tx-type${meta.isSent ? ' sent' : ''}">
      <div>${meta.type}</div>
      <div class="tx-time">${escapeHTML(meta.timeStr)}</div>
    </td>
    <td class="tx-token">${tokenIconHtml(meta.sym, tx.imgUrl)}${safeSym}</td>
    <td>
      <span class="tx-amount${meta.isSent ? ' sent' : ''}">${meta.isSent ? '-' : '+'} ${safeAmount}</span>
      <div class="tx-detail tx-price-detail muted">Calculando historico...</div>
    </td>
    <td class="tx-usd">
      <div class="tx-usd-current">...</div>
      <div class="tx-pl-line">...</div>
      <div class="tx-pl-pct">...</div>
    </td>
  `;

  tbody.appendChild(row);
  return { row, tx, meta };
}

async function fetchEtherscanTransactions(address, chainId) {
  const safeAddress = encodeURIComponent(address);
  const tokentxUrl = `${ETH_API}?chainid=${chainId}&module=account&action=tokentx&address=${safeAddress}&sort=desc&page=1&offset=${ETHERSCAN_PAGE_LIMIT}&apikey=${ETH_KEY}`;
  const txlistUrl = `${ETH_API}?chainid=${chainId}&module=account&action=txlist&address=${safeAddress}&sort=desc&page=1&offset=${ETHERSCAN_PAGE_LIMIT}&apikey=${ETH_KEY}`;

  const [r1, r2] = await Promise.allSettled([makeRequest(tokentxUrl), makeRequest(txlistUrl)]);
  const tokenTxs = (r1.status === 'fulfilled' && r1.value && Array.isArray(r1.value.result)) ? r1.value.result : [];
  const normalTxs = (r2.status === 'fulfilled' && r2.value && Array.isArray(r2.value.result)) ? r2.value.result : [];

  const nativeAsTokenStyle = normalTxs
    .filter(tx => tx && tx.timeStamp)
    .map(tx => ({
      ...tx,
      tokenSymbol: 'ETH',
      tokenDecimal: 18,
      value: tx.value ?? '0'
    }));

  const combined = [...tokenTxs, ...nativeAsTokenStyle];
  const seen = new Set();
  const dedup = [];

  for (const tx of combined) {
    const key = `${tx.hash || tx.transactionHash || tx.txHash}-${tx.tokenSymbol || ''}-${String(tx.value || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const normalized = { ...tx };
    normalized.hash = normalized.hash || normalized.transactionHash || normalized.txHash || normalized.hash;
    normalized.timeStamp = normalized.timeStamp || normalized.timestamp || normalized.time || normalized.blockNumber || normalized.timeStamp;
    dedup.push(normalized);
  }

  dedup.sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0));
  return dedup;
}

export async function loadTx(networkId = 'ethereum') {
  const net = networks[networkId];
  const tbody = document.getElementById(net.tbodyId);
  if (!tbody) return;
  if (net.offset === 0) tbody.replaceChildren();

  const slice = net.txList.slice(net.offset, net.offset + TX_PAGE_SIZE);
  const grouped = new Map();
  const hydrateJobs = [];

  for (const tx of slice) {
    if (!tx || !tx.timeStamp) continue;
    const tsNum = Number(tx.timeStamp);
    if (!tsNum) continue;

    const date = new Date(tsNum * 1000).toLocaleDateString('es-ES');
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(tx);
  }

  for (const [date, transactions] of grouped.entries()) {
    appendDateHeader(tbody, date);
    for (const tx of transactions) {
      const job = renderTransactionRow(tbody, tx);
      if (job) hydrateJobs.push(job);
    }
  }

  net.offset += TX_PAGE_SIZE;
  const txTableEl = document.getElementById(net.tableId);
  if (txTableEl) txTableEl.style.display = 'table';

  const btnMore = document.getElementById(net.btnId);
  if (btnMore) {
    btnMore.parentElement.style.display = net.offset < net.txList.length ? 'block' : 'none';
  }

  void mapWithConcurrency(
    hydrateJobs,
    PRICE_CONCURRENCY,
    ({ row, tx, meta }) => hydrateTransactionPrice(row, tx, meta)
  ).catch(error => console.warn('Transaction price hydration failed:', error));
}

export async function fetchAndShowTransactions(address, networkId = 'ethereum') {
  if (networkId === 'all') {
    await fetchAndShowTransactions(address, 'ethereum');
    await fetchAndShowTransactions(address, 'base-wallet');
    return;
  }

  const net = networks[networkId];
  net.offset = 0;
  net.txList = [];
  currentTxAddress = address;

  const tbody = document.getElementById(net.tbodyId);
  if (tbody) setTableMessage(tbody, 'Cargando transacciones...');
  if (!address) return;

  try {
    if (networkId === 'ethereum') {
      if (!HAS_ETHERSCAN_CONFIG) {
        if (tbody) setTableMessage(tbody, 'Falta ETH_KEY en js/config.local.js para cargar transacciones Ethereum.');
        return;
      }

      net.txList = await fetchEtherscanTransactions(address, 1);
    } else if (networkId === 'base-wallet') {
      if (!HAS_COINSTATS_CONFIG && !HAS_ETHERSCAN_CONFIG) {
        if (tbody) setTableMessage(tbody, 'Falta COINSTATS_API_KEY o ETH_KEY en js/config.local.js para cargar transacciones Base.');
        return;
      }

      let loadedFromCoinStats = false;
      if (HAS_ETHERSCAN_CONFIG) {
        net.txList = await fetchEtherscanTransactions(address, 8453);
      } else if (HAS_COINSTATS_CONFIG) {
        const safeAddress = encodeURIComponent(address);
        const url = `${COINSTATS_API}/wallet/transactions?address=${safeAddress}&connectionId=base-wallet&limit=150`;
        let response = await fetch(url, {
          credentials: 'omit',
          headers: { 'Accept': 'application/json', 'X-API-KEY': COINSTATS_API_KEY }
        });

        if (response.status === 409) {
          const patchUrl = `${COINSTATS_API}/wallet/transactions?address=${safeAddress}&connectionId=base-wallet`;
          fetch(patchUrl, {
            method: 'PATCH',
            credentials: 'omit',
            headers: { 'Accept': 'application/json', 'X-API-KEY': COINSTATS_API_KEY }
          }).catch(error => console.warn('Base sync trigger failed:', error));

          await new Promise(resolve => setTimeout(resolve, 1200));
          response = await fetch(url, {
            credentials: 'omit',
            headers: { 'Accept': 'application/json', 'X-API-KEY': COINSTATS_API_KEY }
          });
        }

        if (response.ok) {
          const data = await response.json();
          const rawResult = data.result || [];
          const flattenedTxList = [];

          for (const res of rawResult) {
            const hash = res.hash ? res.hash.id : (res.id || '0x');
            const timeStamp = res.date ? Math.floor(new Date(res.date).getTime() / 1000) : 0;

            if (res.transactions && res.transactions.length) {
              for (const innerTx of res.transactions) {
                if (!innerTx.items || !innerTx.items.length) continue;
                for (const item of innerTx.items) {
                  flattenedTxList.push({
                    hash,
                    timeStamp,
                    from: item.fromAddress || '',
                    to: item.toAddress || '',
                    tokenSymbol: item.coin ? item.coin.symbol : '?',
                    tokenDecimal: 0,
                    value: item.count || 0,
                    imgUrl: (item.coin && item.coin.icon) || (res.mainContent && res.mainContent.coinIcons && res.mainContent.coinIcons[0]) || null
                  });
                }
              }
            } else {
              flattenedTxList.push({
                hash,
                timeStamp,
                from: '',
                to: '',
                tokenSymbol: res.coinData ? res.coinData.symbol : '?',
                tokenDecimal: 0,
                value: res.coinData ? res.coinData.count : 0,
                imgUrl: (res.mainContent && res.mainContent.coinIcons && res.mainContent.coinIcons[0]) || null
              });
            }
          }

          flattenedTxList.sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0));
          net.txList = flattenedTxList;
          loadedFromCoinStats = true;
        }
      }

      if (!loadedFromCoinStats && !HAS_ETHERSCAN_CONFIG && tbody) {
        setTableMessage(tbody, 'No se pudieron cargar transacciones Base.');
      }
    }

    await loadTx(networkId);
  } catch (error) {
    console.warn(`Error fetching ${networkId} transactions:`, safeErrorMessage(error));
    if (tbody) setTableMessage(tbody, `No se pudieron cargar las transacciones de ${networkId}.`);
  }
}
