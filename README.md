# DeFi & Crypto Terminal

App web para consultar balances de wallets EVM, revisar transacciones en Ethereum/Base y seguir pares spot USDT de Binance con una grafica de velas estilo exchange.

## Stack

- React 19 + TypeScript 5.8 + Vite 6
- Chart.js + `chartjs-chart-financial` + `chartjs-adapter-date-fns`
- Zustand para estado global
- Vitest para tests unitarios
- Playwright para E2E
- APIs: Binance Spot, Etherscan v2, CoinStats Open API

## Comandos

```bash
npm run dev          # servidor dev Vite
npm run build        # tsc -b && vite build
npm run preview      # vite preview
npm run lint         # eslint src/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:e2e     # playwright test
```

## Configuracion

Las API keys viven en `.env` con prefijo `VITE_` (leido por Vite en build). Solo Binance funciona con endpoints publicos; CoinStats y Etherscan necesitan key.

```env
VITE_BINANCE_API=https://api.binance.com/api/v3
VITE_COINSTATS_API=https://openapiv1.coinstats.app
VITE_COINSTATS_API_KEY=replace-me
VITE_ETH_API=https://api.etherscan.io/v2/api
VITE_ETH_KEY=replace-me
```

`scripts/generate-config.mjs` toma un `.env` con keys sin prefijo y lo reescribe con el prefijo `VITE_` para que Vite las lea.

Para produccion, mueve las llamadas con key a un proxy o funcion serverless; cualquier key en el bundle queda visible en el navegador.

CSP definida en `index.html`: limita scripts/estilos/conexiones a origines conocidos y bloquea `object-src`. Datos externos que se inyectan al DOM pasan por `escapeHTML()` y `safeImageUrl()`.

## Estructura

```text
src/
  api/         cliente HTTP, Binance, CoinStats, Etherscan, precios
  components/  layout, market (pares, velas), wallet, transactions
  hooks/       hooks compartidos
  lib/         config, utils, storage, chart (normalize, indicators, plugins)
  store/       stores Zustand: market, wallet, transactions
  styles/      CSS por dominio
  __tests__/unit/  tests Vitest
```

Detalles de archivos, reglas de edicion y arquitectura de la grafica: ver `AGENTS.md`.

## Deploy

Workflow en `.github/workflows/deploy-pages.yml` (lint, test con coverage, build, deploy a Pages) con secrets `COINSTATS_API_KEY` y `ETH_KEY` en GitHub Actions.

## Notas

- `AGENTS.md` es la guia canonica para agentes que toquen el repo.
- `.env` y `*.tsbuildinfo` estan en `.gitignore`.
