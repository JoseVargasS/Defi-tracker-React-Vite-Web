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
- Vitest para tests unitarios (299 tests, 25 archivos)
- Playwright para E2E (declarado, sin specs)
- APIs: Binance Spot, Etherscan v2, CoinStats Open API

## Comandos utiles

```powershell
npm run dev          # servidor dev Vite
npm run build        # tsc -b && vite build
npm run lint         # eslint src/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:coverage # vitest run --coverage
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
│   ├── binance.ts              Precios, klines, exchangeInfo, agregacion 5d/3M
│   ├── coinstats.ts            Balances y transacciones CoinStats
│   ├── etherscan.ts            Transacciones y balances ETH
│   └── prices.ts               Precio actual e historico USD
├── components/
│   ├── layout/Header.tsx
│   ├── layout/Footer.tsx
│   ├── ErrorBoundary.tsx       Fallback UI en main.tsx
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
│   ├── config.ts               Endpoints, chains, defaults, periodos SMA/EMA
│   ├── utils.ts                formatPrice, escapeHTML, safeImageUrl, integerAmountToNumber
│   ├── storage.ts              localStorage helpers
│   ├── assets.ts               COIN_ICON_URLS, TOKEN_ICON_FALLBACKS, tokenIconUrl
│   └── chart/
│       ├── normalize.ts        normalizeKline, compactNumber
│       ├── indicators.ts       Bollinger, StochRSI, RSI, Volume, VP, SMA, EMA
│       ├── types.ts            EnhancedChart, ScaleLike, VPRow, SMA_PERIOD_OPTIONS
│       └── plugins/index.ts    Crosshair, currentPrice, legend, VRVP, measure
├── store/
│   ├── useMarketStore.ts       Zustand: pares, chart, precios
│   ├── useWalletStore.ts       Zustand: wallet, assets, chains
│   └── useTransactionStore.ts  Solo exporta interface TransactionEntry
├── hooks/
│   └── useInterval.ts          setInterval con cleanup y flag immediate
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
└── __tests__/unit/             Tests Vitest (25 archivos, 299 tests)
    ├── utils.test.ts           formatPrice, escapeHTML, safeImageUrl, etc
    ├── storage.test.ts         localStorage, migracion, colores
    ├── normalize.test.ts       normalizeKline, compactNumber
    ├── indicators.test.ts      Bollinger, StochRSI, Volume, VP, CHART_THEME
    ├── binance.test.ts         fetchPrice, fetchKlines, agregacion, cache, batch
    ├── client.test.ts          makeRequest, retry 406/429
    ├── coinstats.test.ts       balances, transacciones, precios
    ├── etherscan.test.ts       ETH balance, token tx, normal tx
    ├── prices.test.ts          getTokenPriceUSD, getHistoricalTokenPriceUSD
    ├── stores.test.ts          useMarketStore, useWalletStore
    ├── assets.test.ts          COIN_ICON_URLS, tokenIconUrl, coinDisplayName
    ├── useInterval.test.ts     callback, delay null, immediate, cleanup
    ├── chartTypes.test.ts      SMA_PERIOD_OPTIONS, interfaces y tipos de Chart
    ├── App.test.tsx            tabs, intervalos, indicadores, empty state
    ├── ErrorBoundary.test.tsx  renderiza children, captura errores, UI de error
    ├── Header.test.tsx         logo, titulo, header element
    ├── Footer.test.tsx         links, atribucion
    ├── PairSearch.test.tsx     busqueda, seleccion, limpieza, sin resultados
    ├── TrackedPairs.test.tsx   render, click, delete, precios, cambio %
    ├── TransactionSection.test.tsx  fetch por chain, empty state, tablas
    ├── TransactionTable.test.tsx    empty, loading, fechas, montos, P&L, paginacion
    ├── WalletSection.test.tsx       input, validacion, error, loading, saved wallets
    ├── WalletDashboard.test.tsx     total worth, sorting de chains, ChainCard
    ├── ChainCard.test.tsx           tokens, precios, formateo, ZeroValueToggle
    └── ZeroValueToggle.test.tsx     toggle open/close, iconos +/-, muestra hijos
```

## Reglas de edicion

- TypeScript estricto, **cero `as any`** en el codebase. Usar `as unknown as TargetType` o tipos inline cuando Chart.js lo requiera.
- Usar Zustand stores para estado global (`useMarketStore`, `useWalletStore`, `useTransactionStore`).
- Indicadores tecnicos en `lib/chart/indicators.ts`; plugins en `lib/chart/plugins/`.
- No dejar codigo muerto comentado.
- UI en CSS modules/classes, no inline styles.
- Colores en variables/tokens de `CHART_THEME` (indicators.ts) o CSS.
- Iconos externos deben tener fallback.
- Validar URLs externas con `safeImageUrl()`.
- No loguear URLs con `apikey`, headers ni respuestas completas.
- Tests con Vitest: `npm test`. Mocks via `vi.mock('@/api/client')`, no `vi.stubGlobal('fetch')`.
- Iconos de tokens en `lib/assets.ts` (no duplicar en utils.ts).

## Grafica de velas

`src/components/market/CandlestickChart.tsx`:

- `buildTechnicalSeries(data)` -> calcula indicadores, limpia cache SMA/EMA
- `buildDatasets(symbol, candles, series, indicators)` -> datasets Chart.js
- `createScales(interval, indicators)` -> escalas con paneles
- `crosshairPlugin`, `currentPricePlugin`, `indicatorLegendPlugin` en `lib/chart/plugins/`
- `fixedRangeVolumeProfilePlugin`, `measureRangePlugin`
- SMA/EMA cache usa fingerprint (primer/ultimo timestamp) + se limpia en `buildTechnicalSeries`

Calculos en `src/lib/chart/indicators.ts`:

- `normalizeKline(kline)`, `compactNumber(value)` en `normalize.ts`
- `calculateVolume`, `calculateBollingerBands`, `calculateStochRSI`, `calculateRSI`, `calculateVolumeProfile`
- Periodos SMA/EMA: `SMA_PERIOD_OPTIONS` / `EMA_PERIOD_OPTIONS` en `types.ts` (40, 50, 75, 100, 150, 200)

## Transacciones

`src/components/transactions/TransactionSection.tsx`:

- `TX_PAGE_SIZE = 10`
- Etherscan: `tokentx` + `txlist` en paralelo, dedup por hash+symbol+value
- Base: CoinStats GET -> si 409, PATCH sync + retry
- `TransactionTable.tsx`: renderiza filas, hidrata USD/P&L en paralelo con `Promise.all`

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

## Agent behavior rules

### Language

- **Always respond in Peruvian Spanish** (tuteo, no vosotros). Use natural Peruvian expressions when fitting. Avoid regionalisms from Spain, Argentina, or other LatAm countries.
- Technical terms and code stay in English. Explanations, commit messages, and user-facing text are in Spanish.

### When writing code

- **Never hardcode values.** Extract magic numbers, strings, URLs, and colors into named constants or config. Single source of truth.
- Follow existing patterns in the codebase. If there's a convention for a file, match it exactly.
- Use `context7` skill to fetch up-to-date documentation for any library or framework before writing code that depends on it.
- Use `karpathy-guidelines` skill to avoid common LLM coding mistakes (overcomplication, unnecessary abstractions, etc.).
- Prefer `ponytail` skill for keeping solutions minimal and lazy. Question whether the task needs to exist at all before writing code.
- Zero `as any`. Use `as unknown as TargetType` or inline types when Chart.js requires casts.
- No dead code, no commented-out blocks, no TODO comments that aren't actionable.
- Every new module must have corresponding tests. Pure functions get direct tests; components get `@testing-library/react` tests.

### When auditing or reviewing code

- **Always load `keystone` skill first.** It enforces codebase hardening: architecture audit, dead code removal, standard compliance, test coverage.
- Load `code-reviewer` skill for structured review feedback.
- Load `ponytail-review` or `ponytail-audit` to find over-engineering and unnecessary complexity.
- **Do not break existing functionality** unless the user explicitly asks for a breaking change. If a refactor risks breaking behavior, ask first.
- Preserve all existing tests. If a change would break a test, fix the test to match the new behavior (unless the test was wrong to begin with).
- Hyper-fluidity: changes should feel seamless. No jarring renames, no moved exports, no reordered imports unless part of a focused cleanup.
- Maintainability over cleverness. Readable code > compact code.

### When designing UI or frontend

- **Always load `impeccable` skill** for any UI polish, redesign, or visual improvement task.
- Load `design-taste-frontend` (or `design-taste-frontend-v1` for backward compat) for landing pages, component design, and anti-generic aesthetics.
- Load `emil-design-eng` for animation decisions and invisible polish details.
- Load `ui-ux-pro-max` for comprehensive UI/UX guidance across styles, color palettes, and product types.
- Load `frontend-design` for distinctive, production-grade interfaces.
- Never use generic AI aesthetics. Every design decision should feel intentional and human-directed.
- Respect existing design tokens (`CHART_THEME`, CSS variables). Don't introduce new color systems or spacing scales.
- Test responsive behavior at 1024px, 768px, and 480px before claiming UI work is done.

### When writing tests

- Mock at the module boundary (`vi.mock('@/api/client')`), never at the global level (`vi.stubGlobal('fetch')`).
- Tests should verify behavior, not implementation details.
- Prefer `verification-before-completion` skill before claiming tests pass.
- New features must ship with tests. No exceptions.

### General agent discipline

- Load `commit-policy` skill. Never commit, push, or create PRs unless the user explicitly says so.
- Load `mimocode` skill when unsure about any MiMoCode feature (memory, agents, workflows, config).
- When research is needed, load `deep-research` or `super-research` skill depending on scope.
- For multi-file changes, enter plan mode first. Confirm the plan before implementing.
- One logical change per commit. Don't mix unrelated changes.
