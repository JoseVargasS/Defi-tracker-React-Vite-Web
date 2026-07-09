# AGENTS.md

Guia para agentes que trabajen en este repositorio.

## Objetivo del proyecto

App React + Vite + TypeScript llamada **DeFi & Crypto Terminal**. Sirve para:
- consultar balances de wallets EVM,
- listar transacciones Ethereum/Base,
- seguir pares Binance `*/USDT`,
- visualizar velas con indicadores tecnicos.

## Stack

- React 19 + TypeScript 5.8 + Vite 6
- Chart.js + chartjs-chart-financial + chartjs-adapter-date-fns
- Zustand para estado global
- Vitest para tests unitarios
- Playwright para E2E
- APIs: Binance Spot, Etherscan v2, CoinStats Open API

## Comandos utiles

```powershell
npm run dev          # servidor dev Vite
npm run build        # tsc -b && vite build
npm run lint         # eslint src/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:e2e     # playwright test
npm run preview      # vite preview
```

## Mapa de archivos

```text
src/
├── main.tsx                    Entry point React
├── App.tsx                     Layout principal, polling, Chart.js register
├── vite-env.d.ts               Tipos ImportMetaEnv
├── api/
│   ├── client.ts               makeRequest con retry y redact
│   ├── binance.ts              Precios, klines, exchangeInfo
│   ├── coinstats.ts            Balances y transacciones CoinStats
│   ├── etherscan.ts            Transacciones y balances ETH
│   └── prices.ts               Precio actual e historico USD
├── components/
│   ├── layout/Header.tsx
│   ├── layout/Footer.tsx
│   ├── market/PairSearch.tsx   Buscador de pares Binance
│   ├── market/TrackedPairs.tsx Watchlist con polling
│   ├── market/CandlestickChart.tsx  Velas, zoom/pan, indicadores
│   ├── wallet/WalletSection.tsx     Input, fetch, render dashboard
│   ├── wallet/WalletDashboard.tsx   Totales y agrupacion por chain
│   ├── wallet/ChainCard.tsx         Tabla de assets por red
│   ├── wallet/ZeroValueToggle.tsx   Toggle tokens sin valor
│   ├── transactions/TransactionSection.tsx  Fetch ETH + Base
│   └── transactions/TransactionTable.tsx    Tabla con USD/P&L
├── lib/
│   ├── config.ts               Endpoints, chains, defaults
│   ├── utils.ts                formatPrice, escapeHTML, safeImageUrl, etc
│   ├── storage.ts              localStorage helpers
│   ├── assets.ts               COIN_ICON_URLS por simbolo
│   └── chart/
│       ├── normalize.ts        normalizeKline, compactNumber
│       ├── indicators.ts       Bollinger, StochRSI, RSI, Volume, VP, SMA, EMA
│       ├── types.ts            EnhancedChart, ScaleLike, VPRow, etc.
│       └── plugins/index.ts    Crosshair, currentPrice, legend, VRVP, measure
├── store/
│   ├── useMarketStore.ts       Zustand: pares, chart, precios
│   ├── useWalletStore.ts       Zustand: wallet, assets, chains
│   └── useTransactionStore.ts  Solo exporta interface TransactionEntry
├── hooks/
│   └── useInterval.ts          setInterval con cleanup y flag immediate
├── components/
│   └── ErrorBoundary.tsx       Fallback UI en main.tsx
├── test/
│   └── setup.ts                Setup de Vitest (jsdom, jest-dom)
├── styles/
│   ├── index.css               @import de todos los CSS
│   ├── general.css             Layout global, header, grid
│   ├── forms.css               Inputs, botones, sugerencias
│   ├── wallet.css              Panel wallet y balances
│   ├── crypto.css              Watchlist, mercado, chart
│   ├── transactions.css        Tablas de transacciones
│   └── responsive.css          Breakpoints
└── __tests__/unit/             Tests Vitest (utils, storage, normalize, indicators)
```

## Reglas de edicion

- TypeScript estricto, evitar `as any`.
- Usar Zustand stores para estado global (`useMarketStore`, `useWalletStore`, `useTransactionStore`).
- Indicadores tecnicos en `lib/chart/indicators.ts`; plugins en `lib/chart/plugins/`.
- No dejar codigo muerto comentado.
- UI en CSS modules/classes, no inline styles.
- Colores en variables/tokens de `CHART_THEME` (indicators.ts) o CSS.
- Iconos externos deben tener fallback.
- Validar URLs externas con `safeImageUrl()`.
- No loguear URLs con `apikey`, headers ni respuestas completas.
- Tests con Vitest: `npm test`.

## Grafica de velas

`src/components/market/CandlestickChart.tsx`:

- `buildTechnicalSeries(data)` -> calcula indicadores
- `buildDatasets(symbol, candles, series, indicators)` -> datasets Chart.js
- `createScales(interval, indicators)` -> escalas con paneles
- `crosshairPlugin`, `currentPricePlugin`, `indicatorLegendPlugin` en `lib/chart/plugins/`
- `fixedRangeVolumeProfilePlugin`, `measureRangePlugin`

Calculos en `src/lib/chart/indicators.ts`:

- `normalizeKline(kline)`, `compactNumber(value)` en `normalize.ts`
- `calculateVolume`, `calculateBollingerBands`, `calculateStochRSI`, `calculateRSI`, `calculateVolumeProfile`

## Transacciones

`src/components/transactions/TransactionSection.tsx`:

- `TX_PAGE_SIZE = 10`
- Etherscan: `tokentx` + `txlist` en paralelo, dedup por hash+symbol+value
- Base: CoinStats GET -> si 409, PATCH sync + retry
- `TransactionTable.tsx`: renderiza filas, hidrata USD/P&L en segundo plano

## Precios

`src/api/prices.ts`:

- Sin cache propio: cada llamada pega a Binance `*/USDT` y cae a CoinStats si no hay par.
- `STABLE_PRICES` local para `USDT/USDC/USD0/DAI` (siempre 1).
- `getTokenPriceUSD`, `getHistoricalTokenPriceUSD` retornan `number | null`.
- `src/api/binance.ts` mantiene `_klinesCache` (60s TTL) para velas y la lista de monedas de `exchangeInfo` en `localStorage` con versionado por `APP_STORAGE_VERSION`.

## Estado

Zustand stores en `src/store/`:

- `useMarketStore`: `activeView`, `tracked`, `currentPair`, `currentInterval`, `chartIndicators`, `lastPrices`, `coinsList`.
- `useWalletStore`: `address`, `savedWallets`, `loading`, `error`, `assets`, `totalWorth`.
- `useTransactionStore`: solo exporta el tipo `TransactionEntry`. La lista paginada y `loading` viven como `useState` dentro de `TransactionSection` (paginacion de 10 en 10, `ChainState.all/offset/loading`).

## CSS

- `src/styles/crypto.css` -> mayoria UI de mercado
- `src/styles/wallet.css` -> panel wallet y dashboard
- border radius: `6px` a `8px`
- Sin gradientes decorativos grandes
- Revisar `responsive.css` para mobile

## APIs y seguridad

- Keys en `.env`, se inyectan via `import.meta.env`
- `src/lib/config.ts` lee defaults y overrides de env
- `makeRequest` en `src/api/client.ts`: redacta `apikey` en logs
- CSP en `index.html` (actualizar si se agregan dominios)
- `unsafe-inline` en script-src solo por compatibilidad con wallets
- No insertar datos externos en `innerHTML` sin `escapeHTML()`
- Preferir `textContent` y nodos DOM

## Verificacion antes de finalizar

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Si se toca grafica:
- abrir un par, mover mouse, comprobar OHLC + precio actual + tags
- probar toggles, zoom/pan

Si se toca transacciones:
- probar wallet con actividad Ethereum y Base
- confirmar USD/P&L se actualizan sin duplicar filas

## Commits

El mensaje debe ser entendible para alguien no tecnico. Formato:

```
<tipo>(<ambito>): <descripcion clara en español>

- <archivo.ts>: <que se cambio y por que>
- <otro.ts>: <que se cambio y por que>
- <explicacion del comportamiento>
```

Reglas:
- `tipo` conventional commit (feat, fix, refactor, etc.)
- descripcion: menos de 72 chars, en español, clara para no tecnicos
- body: solo guiones, sin lineas de encabezado como "archivos:" o "cambios:"
- cada bullet en una sola linea (sin wrap)
- nombre de archivo sin ruta (ej. `binance.ts`, no `src/api/binance.ts`)
- explicar el comportamiento, no el como interno
