# TESTING.md

## Smoke checks

```powershell
node scripts/generate-config.mjs
node --check js/main.js
node --check js/pairs.js
node --check js/chartAdvanced.js
node --check js/exchange.js
node --check js/wallet.js
node --check js/transactions.js
node --check js/prices.js
node --check js/bootstrap.js
node --check js/utils.js
node --check js/storage.js
node --check js/state.js
node --check js/config.js
```

## Current state

No automated test framework is configured. The project uses vanilla ES modules without a bundler, so adding a test runner would require:
1. Creating `package.json`
2. Adding Vitest or a Node test runner
3. Writing tests for critical paths:
   - `chartAdvanced.js` — `normalizeKline`, `calculateBollingerBands`, `calculateStochRSI`, `compactNumber`
   - `transactions.js` — `formatDisplayAmount`, `amountToFloat`, `buildTransactionMeta`
   - `storage.js` — `sanitizePairs`, `readSavedWallets`
   - `prices.js` — `getTokenPriceUSD`, `getHistoricalTokenPriceUSD`

## Manual verification checklist

- Open wallet with ETH activity → balances + tx render
- Open wallet with Base activity → tx load from CoinStats/Etherscan
- Open a Binance pair → candlestick chart renders
- Hover chart → OHLC tooltip bar visible, not overlapping candles
- Toggle BB, VOL, Stoch RSI → indicators appear/disappear
- Scroll zoom + drag pan → chart responds
- Check responsive at 1024px, 768px, 480px
