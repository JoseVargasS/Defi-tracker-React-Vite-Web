import { create } from 'zustand';

export interface TransactionEntry {
  hash: string;
  timestamp: number;
  tokenSymbol: string;
  tokenName: string;
  type: 'send' | 'receive';
  value: number;
  usdValue: number | null;
  pnl: number | null;
  from: string;
  to: string;
  imgUrl?: string;
}

interface TransactionState {
  ethTxs: TransactionEntry[];
  baseTxs: TransactionEntry[];
  ethPage: number;
  basePage: number;
  loading: boolean;
  hasMoreEth: boolean;
  hasMoreBase: boolean;

  setEthTxs: (txs: TransactionEntry[]) => void;
  setBaseTxs: (txs: TransactionEntry[]) => void;
  appendEthTxs: (txs: TransactionEntry[]) => void;
  appendBaseTxs: (txs: TransactionEntry[]) => void;
  setEthPage: (page: number) => void;
  setBasePage: (page: number) => void;
  setLoading: (loading: boolean) => void;
  setHasMoreEth: (hasMore: boolean) => void;
  setHasMoreBase: (hasMore: boolean) => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  ethTxs: [],
  baseTxs: [],
  ethPage: 1,
  basePage: 1,
  loading: false,
  hasMoreEth: true,
  hasMoreBase: true,

  setEthTxs: (txs) => set({ ethTxs: txs }),
  setBaseTxs: (txs) => set({ baseTxs: txs }),
  appendEthTxs: (txs) =>
    set((state) => ({ ethTxs: [...state.ethTxs, ...txs] })),
  appendBaseTxs: (txs) =>
    set((state) => ({ baseTxs: [...state.baseTxs, ...txs] })),
  setEthPage: (page) => set({ ethPage: page }),
  setBasePage: (page) => set({ basePage: page }),
  setLoading: (loading) => set({ loading }),
  setHasMoreEth: (hasMore) => set({ hasMoreEth: hasMore }),
  setHasMoreBase: (hasMore) => set({ hasMoreBase: hasMore }),
}));
