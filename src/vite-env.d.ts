/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  readonly VITE_BINANCE_API?: string;
  readonly VITE_BINANCE_FUTURES_API?: string;
  readonly VITE_MEXC_FUTURES_API?: string;
  readonly VITE_COINSTATS_API?: string;
  readonly VITE_COINSTATS_API_KEY?: string;
  readonly VITE_ETH_API?: string;
  readonly VITE_ETH_KEY?: string;
  readonly VITE_OPENCODE_GO_KEY?: string;
  readonly VITE_OPENCODE_MODEL?: string;
  readonly VITE_AI_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'chartjs-adapter-date-fns';
