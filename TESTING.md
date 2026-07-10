# TESTING.md

## Unit tests (Vitest)

```bash
npm test                 # una corrida
npm run test:watch       # watch mode
npm run test:coverage    # con coverage v8
```

Cobertura actual en `src/__tests__/unit/` (12 archivos, 183 tests):

- `utils.test.ts` — `formatPrice`, `escapeHTML`, `safeErrorMessage`, `apiStatusMessage`, `mapWithConcurrency`, `integerAmountToNumber`.
- `storage.test.ts` — `readSavedWallets`, `writeSavedWallets`, `readTrackedPairs`, `writeTrackedPairs`, `readIndicatorColors`, `writeIndicatorColors`, `migrateAppStorage`, `clearAppStorage`, versionado por `APP_STORAGE_VERSION`.
- `normalize.test.ts` — `normalizeKline`, `compactNumber`.
- `indicators.test.ts` — `calculateVolume`, `calculateBollingerBands`, `calculateStochRSI`, `calculateRSI`, `calculateVolumeProfile`, `CHART_THEME`.
- `binance.test.ts` — `fetchPrice`, `fetch24hStats`, `fetchLatestKlines`, `fetchKlines`, agregacion 5d/3M, cache, `fetchPriceBatch`, `fetch24hStatsBatch`, `fetchExchangeInfo`, `fetchCoinsList`.
- `client.test.ts` — `makeRequest` success, error, retry 406/429.
- `coinstats.test.ts` — `getTokenAssetsByAddress`, `getWalletTransactions`, `fetchBaseTransactions`, `fetchCoinStatsTokenPrice`.
- `etherscan.test.ts` — `getETHBalance`, `getTokenBalances`, `getTokenTransactions`, `getNormalTransactions`, `fetchEtherscanTransactions`.
- `prices.test.ts` — `getTokenPriceUSD` (stablecoins, Binance, CoinStats fallback), `getHistoricalTokenPriceUSD`.
- `stores.test.ts` — `useMarketStore` (all actions), `useWalletStore` (all actions).
- `assets.test.ts` — `COIN_ICON_URLS`, `TOKEN_ICON_FALLBACKS`, `coinDisplayName`, `tokenIconUrl`.
- `useInterval.test.ts` — callback, delay null, immediate, cleanup, ref update.

Cuando agregues logica nueva:

- Pure functions de `src/lib/chart/indicators.ts` y `src/lib/chart/normalize.ts` -> test directo.
- Logica de stores (`src/store/`) -> test con `useStore.getState()`.
- API modules (`src/api/`) -> mockear `makeRequest` via `vi.mock('@/api/client')`.
- Componentes -> `@testing-library/react` ya esta instalado.

## E2E (Playwright)

`npm run test:e2e` esta declarado en `package.json` pero no hay `playwright.config.ts` ni specs en el repo todavia. Agrega la config y los specs bajo `e2e/` o `tests/` cuando habilites esta capa; mientras tanto, no correr el script.

## CI

`.github/workflows/deploy-pages.yml` corre en cada push a `main`/`master` (y manual con `workflow_dispatch`) con cuatro jobs encadenados: `lint` -> `test` -> `build` -> `deploy`. Pasos relevantes: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build` con `VITE_COINSTATS_API_KEY` y `VITE_ETH_KEY` desde secrets, y `actions/upload-pages-artifact` + `actions/deploy-pages` para el deploy.

`.github/ci.yml` existe como pipeline minimo (lint + typecheck + test + build) en push/PR para PR checks rapidos sin deploy.

## Smoke checks manuales

Antes de cerrar un PR que toque:

- **Wallet**: abrir una wallet con actividad ETH + Base. Confirmar balances y que tx cargan sin duplicar filas. Verificar que USD y P&L se hidratan en background.
- **Mercado**: abrir un par, mover mouse sobre la grafica. Comprobar OHLC, precio actual, tags de indicadores. Probar toggles BB/Vol/Stoch RSI/SMA/EMA. Zoom con rueda y pan con drag.
- **Transacciones**: paginacion "ver mas" no debe duplicar filas al cambiar filtros.
- **Responsive**: probar a 1024px, 768px y 480px (ver `src/styles/responsive.css`).
- **CSP**: abrir DevTools y confirmar que no hay warnings de CSP ni de recursos bloqueados.
