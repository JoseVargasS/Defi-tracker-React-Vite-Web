import { create } from 'zustand';

export interface WalletAsset {
  symbol: string;
  amount: number;
  price: number | null;
  total: number | null;
  imgUrl: string;
  chain: string;
  chainId: string;
  chainIcon: string;
}

interface WalletState {
  address: string;
  savedWallets: string[];
  loading: boolean;
  error: string | null;
  assets: WalletAsset[];
  totalWorth: number;

  setAddress: (address: string) => void;
  setSavedWallets: (wallets: string[]) => void;
  addSavedWallet: (wallet: string) => void;
  removeSavedWallet: (wallet: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAssets: (assets: WalletAsset[], totalWorth: number) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: '',
  savedWallets: [],
  loading: false,
  error: null,
  assets: [],
  totalWorth: 0,

  setAddress: (address) => set({ address }),
  setSavedWallets: (wallets) => set({ savedWallets: wallets }),
  addSavedWallet: (wallet) =>
    set((state) => ({
      savedWallets: state.savedWallets.includes(wallet)
        ? state.savedWallets
        : [...state.savedWallets, wallet],
    })),
  removeSavedWallet: (wallet) =>
    set((state) => ({
      savedWallets: state.savedWallets.filter((w) => w !== wallet),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAssets: (assets, totalWorth) => set({ assets, totalWorth }),
}));
