// js/main.js
//Importa todo y hace el DOMContentLoaded (reemplaza el app.js original).
import { formatPrice, safeErrorMessage } from './utils.js';
import { state } from './state.js';
import { fetchCoinsList, fetchPriceBatch, fetch24hStatsBatch } from './exchange.js';
import { renderTrackedPairs, addTrackedPair, renderCandlestick } from './pairs.js';
import { renderSavedWallets, saveWallet, fetchAndRenderWallet, getSavedWallets } from './wallet.js';
import { loadTx } from './transactions.js';
import { CHART_THEME } from './chartAdvanced.js';
import { clearAppStorage, migrateAppStorage, readTrackedPairs, STORAGE_KEYS, writeSavedWallets } from './storage.js';

let appInitialized = false;

async function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  migrateAppStorage();

  // Suppress "User rejected the request" errors from external wallet extensions
  window.addEventListener('unhandledrejection', function (event) {
    if (event.reason && (event.reason.code === 4001 || (event.reason.message && event.reason.message.includes('User rejected')))) {
      event.preventDefault();
      console.log('Aviso: Se ignoró un error de conexión de billetera externa (esperado en dApps sin conexión Web3).');
    }
  });

  // Restaurar tracked pairs
  state.tracked = readTrackedPairs();

  // Chart.js defaults (si Chart está cargado)
  if (window.Chart && window.Chart.defaults && window.Chart.defaults.elements && window.Chart.defaults.elements.candlestick) {
    const upColor = CHART_THEME.up;
    const downColor = CHART_THEME.down;
    const neutralColor = CHART_THEME.neutral;

    // Forzar defaults globales para evitar herencias de estilos viejos
    window.Chart.defaults.elements.candlestick.color = { up: upColor, down: downColor, unchanged: neutralColor };
    window.Chart.defaults.elements.candlestick.borderColor = { up: upColor, down: downColor, unchanged: neutralColor };
    window.Chart.defaults.elements.candlestick.wickColor = { up: upColor, down: downColor, unchanged: neutralColor };
    window.Chart.defaults.elements.candlestick.borderWidth = 1;
  }

  const pairSearch = document.getElementById('pair-search');
  const pairSuggestions = document.getElementById('pair-suggestions');
  const pairDetails = document.getElementById('pair-details');
  const closeDetails = document.getElementById('close-details');
  const intervalSelector = document.querySelector('.interval-selector');

  if (closeDetails) {
    closeDetails.addEventListener('click', () => {
      if (state.detailInterval) {
        clearInterval(state.detailInterval);
        state.detailInterval = null;
      }
      state.currentPair = null;
      if (pairDetails) pairDetails.classList.add('hidden');
      try {
        const existing = Chart.getChart(document.getElementById('candlestick-chart'));
        if (existing) existing.destroy();
      } catch (e) {
        if (state.chartInstance) { try { state.chartInstance.destroy(); } catch (err) { } state.chartInstance = null; }
      }
    });
  }

  const btnFetchWallet = document.getElementById('btnFetchWallet');
  if (btnFetchWallet) {
    btnFetchWallet.addEventListener('click', async () => {
      const address = document.getElementById('walletAddress').value.trim();
      const walletDataEl = document.getElementById('walletData');
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return alert('Por favor ingresa una dirección válida.');
      if (walletDataEl) walletDataEl.innerHTML = '<div class="wallet-loading">Cargando balances...</div>';
      try {
        await fetchAndRenderWallet(address);
      } catch (err) {
        if (walletDataEl) {
          const error = document.createElement('div');
          error.textContent = `Error: ${safeErrorMessage(err)}`;
          walletDataEl.replaceChildren(error);
        }
      }
    });
  }

  // interval selector
  if (intervalSelector) {
    const desired = [
      { key: '3M', label: '3M' },
      { key: '1M', label: '1M' },
      { key: '1w', label: '1w' },
      { key: '5d', label: '5D' },
      { key: '3d', label: '3D' },
      { key: '1d', label: '1D' },
      { key: '12h', label: '12H' },
      { key: '4h', label: '4H' },
      { key: '1h', label: '1H' },
      { key: '15m', label: '15m' },
      { key: '5m', label: '5m' },
      { key: '1m', label: '1m' }
    ];
    intervalSelector.innerHTML = '';
    desired.forEach(d => {
      const btn = document.createElement('button');
      btn.dataset.interval = d.key;
      btn.textContent = d.label;
      if (d.key === state.currentInterval) btn.classList.add('active');
      intervalSelector.appendChild(btn);
    });
    intervalSelector.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        state.currentInterval = e.target.dataset.interval;
        intervalSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (state.currentPair) renderCandlestick(state.currentPair, state.currentInterval);
      }
    });
  }

  document.querySelectorAll('.chart-indicator-toggle').forEach(button => {
    const key = button.dataset.indicator;
    button.classList.toggle('active', state.chartIndicators[key] !== false);
    button.addEventListener('click', () => {
      state.chartIndicators[key] = !state.chartIndicators[key];
      button.classList.toggle('active', state.chartIndicators[key]);
      if (state.currentPair) renderCandlestick(state.currentPair, state.currentInterval);
    });
  });

  // Fetch coins list
  fetchCoinsList();

  // Pair suggestions
  if (pairSearch && pairSuggestions) {
    const pairLabel = coin => `${coin.base}/${coin.quote}`;
    const pairSearchText = coin => `${coin.symbol} ${coin.base} ${coin.quote} ${pairLabel(coin)}`;

    const renderPairSuggestions = matches => {
      pairSuggestions.replaceChildren();
      if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No se encontraron pares.';
        pairSuggestions.appendChild(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      matches.forEach(coin => {
        const item = document.createElement('div');
        item.dataset.symbol = coin.symbol;
        item.textContent = pairLabel(coin);
        fragment.appendChild(item);
      });
      pairSuggestions.appendChild(fragment);
    };

    pairSearch.addEventListener('input', () => {
      const q = pairSearch.value.trim().toUpperCase();
      if (!q) { pairSuggestions.classList.remove('active'); return; }
      const normalized = q.replace(/[^A-Z0-9]/g, '');
      const matches = (state.coinsList || [])
        .filter(c => pairSearchText(c).includes(q) || c.symbol.includes(normalized))
        .slice(0, 10);
      renderPairSuggestions(matches);
      pairSuggestions.classList.add('active');
    });
    pairSuggestions.addEventListener('click', (e) => {
      if (e.target.dataset.symbol) {
        addTrackedPair(e.target.dataset.symbol);
        pairSuggestions.classList.remove('active');
        pairSearch.value = '';
      }
    });
    document.addEventListener('click', (e) => {
      if (pairSuggestions && !pairSuggestions.contains(e.target) && e.target !== pairSearch) pairSuggestions.classList.remove('active');
    });
  }

  // Render tracked pairs
  renderTrackedPairs();

  // Auto-update prices every 5s — ONE batch request for all pairs
  setInterval(async () => {
    try {
      const symbols = state.tracked.slice(); // snapshot
      if (!symbols.length) return;

      // Two batch requests instead of N×2 individual ones
      const [prices, stats] = await Promise.all([
        fetchPriceBatch(symbols),
        fetch24hStatsBatch(symbols)
      ]);

      const pairQuote = symbol => state.coinsList?.find(item => item.symbol === symbol)?.quote || '';

      for (const symbol of symbols) {
        const price = prices[symbol];
        const stat = stats[symbol];

        const priceSpan = document.querySelector(`.pair-price[data-symbol="${symbol}"]`);
        if (priceSpan && price) {
          const quote = pairQuote(symbol);
          const formatted = formatPrice(price);
          priceSpan.textContent = quote && formatted !== '-' ? `${formatted} ${quote}` : formatted;
        }

        if (stat && stat.priceChangePercent !== undefined) {
          const pct = parseFloat(stat.priceChangePercent);
          const changeClass = pct > 0 ? 'positive' : (pct < 0 ? 'negative' : '');
          const changeSpan = document.querySelector(`.pair-change[data-symbol="${symbol}"]`);
          if (changeSpan) {
            changeSpan.className = `pair-change ${changeClass}`;
            changeSpan.textContent = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
          }
        }
      }
    } catch (e) {
      console.error('Auto-update error', e);
    }
  }, 5000);

  // Saved wallets UI
  renderSavedWallets();
  const walletsOnLoad = getSavedWallets();
  if (walletsOnLoad.length) {
    const walletAddress = document.getElementById('walletAddress');
    if (walletAddress) {
      walletAddress.value = walletsOnLoad[walletsOnLoad.length - 1];
    }
  }

  const btnClearAppStorage = document.getElementById('btnClearAppStorage');
  if (btnClearAppStorage) {
    btnClearAppStorage.addEventListener('click', () => {
      clearAppStorage();
      state.tracked = readTrackedPairs();
      renderSavedWallets();
      renderTrackedPairs();
      document.getElementById('walletAddress').value = '';
      const walletData = document.getElementById('walletData');
      if (walletData) walletData.replaceChildren();
      localStorage.setItem(STORAGE_KEYS.walletAutoFetchDisabled, '1');
    });
  }

  const btnSaveWallet = document.getElementById('btnSaveWallet');
  if (btnSaveWallet) {
    btnSaveWallet.addEventListener('click', () => {
      const address = document.getElementById('walletAddress').value.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) { alert('Dirección no válida'); return; }
      saveWallet(address);
      renderSavedWallets(address);
      document.getElementById('walletAddress').value = address;
      const btnFetchWallet = document.getElementById('btnFetchWallet');
      if (btnFetchWallet) btnFetchWallet.click();
    });
  }

  const savedWallets = document.getElementById('savedWallets');
  if (savedWallets) {
    savedWallets.addEventListener('change', (e) => {
      const address = e.target.value;
      if (address) {
        document.getElementById('walletAddress').value = address;
        const btnFetchWallet = document.getElementById('btnFetchWallet');
        if (btnFetchWallet) btnFetchWallet.click();
      }
    });
  }

  const btnDeleteWallet = document.getElementById('btnDeleteWallet');
  if (btnDeleteWallet) {
    btnDeleteWallet.addEventListener('click', () => {
      const select = document.getElementById('savedWallets');
      const address = select.value;
      if (!address) return;
      let wallets = getSavedWallets();
      wallets = wallets.filter(w => w !== address);
      writeSavedWallets(wallets);
      renderSavedWallets();
      document.getElementById('walletAddress').value = '';
      const walletData = document.getElementById('walletData');
      if (walletData) walletData.innerHTML = '';
    });
  }

  const btnCopyWallet = document.getElementById('btnCopyWallet');
  if (btnCopyWallet) {
    btnCopyWallet.addEventListener('click', async () => {
      const select = document.getElementById('savedWallets');
      const address = select.value;
      if (!address) return;
      try {
        await navigator.clipboard.writeText(address);
      } catch {
        alert('No se pudo copiar');
      }
    });
  }

  const btnLoadMoreEth = document.getElementById('btnLoadMoreEth');
  if (btnLoadMoreEth) btnLoadMoreEth.addEventListener('click', () => loadTx('ethereum'));

  const btnLoadMoreBase = document.getElementById('btnLoadMoreBase');
  if (btnLoadMoreBase) btnLoadMoreBase.addEventListener('click', () => loadTx('base-wallet'));

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}
