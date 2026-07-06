# CONTEXT.md

## Domain

DeFi & Crypto Terminal — single-page app para:
- Agregar balances EVM en Ethereum, Base y BSC.
- Ver historial de transacciones (Etherscan v2 + CoinStats).
- Seguir pares spot `*/USDT` de Binance con grafica de velas.

## Key decisions

| Decision | Por que |
|----------|---------|
| React 19 + Vite + TS | Ecosistema maduro, HMR rapido, build a static para GitHub Pages |
| Chart.js + chartjs-chart-financial | Unica opcion libre viable para velas en navegador |
| Zustand para estado | Menos boilerplate que Redux, devtools decentes |
| CoinStats para balances multired | Free tier cubre balances + historial por chain |
| Etherscan API v2 para ETH | Fiable, paginada, una key para todas las chains |
| `localStorage` para persistencia | Sin backend; wallets y watchlist son del usuario |
| `.env` con prefijo `VITE_` | Vite inyecta solo esas en build; keys fuera de control de versiones |
| `src/lib/config.ts` lee env | Un solo punto de verdad, defaults publicos si no hay key |

## Architecture invariants

- Toda UI es React + TS estricto. Evitar `as any` salvo union narrowing legitimo.
- Stores Zustand en `src/store/`: `useMarketStore`, `useWalletStore`, `useTransactionStore`. Estado global solo ahi.
- Cliente HTTP unico en `src/api/client.ts` (`makeRequest`): reintentos, redaccion de `apikey` en logs, timeouts.
- Calculos tecnicos (Bollinger, Stoch RSI, RSI, Volume Profile, SMA/EMA) viven en `src/lib/chart/indicators.ts`. Plugins visuales de Chart.js en `src/lib/chart/plugins/`.
- Datasets y escalas del grafico se arman en `src/components/market/CandlestickChart.tsx`.
- Keys API nunca viven en archivos versionados.
- CSS por dominio en `src/styles/`. Sin gradientes decorativos grandes, border radius 6-8px.
- Datos externos al DOM pasan por `escapeHTML()`; URLs por `safeImageUrl()`. CSP en `index.html` minimiza superficie XSS.

## Known ceilings

- `apikey` de Etherscan visible en la red del navegador. Mover a proxy/serverless antes de produccion seria.
- P&L historico solo funciona para tokens con par en Binance (klines consultan precio en fecha de tx).
- Sin backend = sin privacidad real para keys en cliente.
- CoinStats responde `429`/`409`; el codigo mitiga con caches y concurrencia limitada pero no los elimina.
- Iconos de tokens dependen de CoinGecko/cdn; si fallan, hay fallback en UI.
