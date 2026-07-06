# TESTING.md

## Unit tests (Vitest)

```bash
npm test                 # una corrida
npm run test:watch       # watch mode
npm run test:coverage    # con coverage v8
```

Cobertura actual en `src/__tests__/unit/`:

- `utils.test.ts` — `formatPrice`, `safeImageUrl`, `safeErrorMessage`, `escapeHTML`, `concurrencyLimit`.
- `storage.test.ts` — `sanitizePairs`, `readSavedWallets`, versionado de `localStorage`.
- `normalize.test.ts` — `normalizeKline`, `compactNumber`.
- `indicators.test.ts` — Bollinger, Stoch RSI, Volume, Volume Profile.

Cuando agregues logica nueva:

- Pure functions de `src/lib/chart/indicators.ts` y `src/lib/chart/normalize.ts` -> test directo.
- Logica de stores (`src/store/`) -> test con `useStore.getState()`.
- Componentes -> `@testing-library/react` ya esta instalado.

## E2E (Playwright)

```bash
npm run test:e2e
```

Configuracion en `playwright.config.ts`. Para iterar contra el dev server: `npm run dev` en una terminal, tests en otra.

## CI

`.github/workflows/deploy-pages.yml` corre en cada push/PR a `main` o `master`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:coverage`
5. `npm run build` con secrets `COINSTATS_API_KEY` y `ETH_KEY` como `VITE_*`
6. Deploy a GitHub Pages.

El job de CI tambien existe en `.github/ci.yml` como duplicado minimo (lint + typecheck + test + build) para PR checks si Pages no aplica.

## Smoke checks manuales

Antes de cerrar un PR que toque:

- **Wallet**: abrir una wallet con actividad ETH + Base. Confirmar balances y que tx cargan sin duplicar filas. Verificar que USD y P&L se hidratan en background.
- **Mercado**: abrir un par, mover mouse sobre la grafica. Comprobar OHLC, precio actual, tags de indicadores. Probar toggles BB/Vol/Stoch RSI/SMA/EMA. Zoom con rueda y pan con drag.
- **Transacciones**: paginacion "ver mas" no debe duplicar filas al cambiar filtros.
- **Responsive**: probar a 1024px, 768px y 480px (ver `src/styles/responsive.css`).
- **CSP**: abrir DevTools y confirmar que no hay warnings de CSP ni de recursos bloqueados.
