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
