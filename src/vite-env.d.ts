/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BINANCE_API?: string;
  readonly VITE_COINSTATS_API?: string;
  readonly VITE_COINSTATS_API_KEY?: string;
  readonly VITE_ETH_API?: string;
  readonly VITE_ETH_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
