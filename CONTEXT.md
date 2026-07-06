# CONTEXT.md

## Domain

DeFi & Crypto Terminal — static web app for:
- EVM wallet balance aggregation across Ethereum, Base, BSC
- Transaction history (Etherscan + CoinStats)
- Binance spot USDT pair watchlist with candlestick chart

## Key decisions

| Decision | Rationale |
|----------|-----------|
| Static SPA, no bundler | Simpler deploy (GitHub Pages), no build step |
| Chart.js + chartjs-chart-financial | Only viable free candlestick lib for browser ESM |
| CoinStats for multi-chain balances | Free tier covers wallet balance + tx history |
| Etherscan API v2 for ETH tx history | Reliable, well-documented, paginated |
| `localStorage` for persistence | No backend needed for saved wallets/pairs |
| `config.local.js` generated from `.env` | Keep API keys out of version control |

## Architecture invariants

- All modules are ES modules — `import`/`export` only, no globals
- `state.js` is the single source of runtime state
- Chart rendering lives in `pairs.js`; technical calculations in `chartAdvanced.js`
- `utils.js` holds shared utilities (fetch wrapper, sanitizers, concurrency helper)
- `makeRequest` in `utils.js` is the only fetch entry point for Binance/CoinStats
- API keys never appear in version-controlled files

## Known ceilings

- Etherscan `apikey` visible in browser network tab — use a proxy/serverless for production
- Historical P&L only works for Binance-traded tokens (via klines)
- No backend = no data privacy for API keys in client-side code
