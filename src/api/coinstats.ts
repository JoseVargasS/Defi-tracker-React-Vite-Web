import { makeRequest } from '@/api/client';
import { COINSTATS_API } from '@/lib/config';

export interface CoinStatsBalanceItem {
  name: string;
  symbol: string;
  amount: number;
  price: number | null;
  icon?: string;
  decimals?: number;
}

export interface CoinStatsBalanceResponse {
  result: CoinStatsBalanceItem[];
}

export interface CoinStatsTransactionCoin {
  symbol: string;
  icon?: string;
}

export interface CoinStatsTransactionItem {
  fromAddress?: string;
  toAddress?: string;
  coin?: CoinStatsTransactionCoin;
  count?: number;
}

export interface CoinStatsInnerTransaction {
  items?: CoinStatsTransactionItem[];
}

export interface CoinStatsTransactionResult {
  hash?: { id: string };
  id?: string;
  date?: string;
  transactions?: CoinStatsInnerTransaction[];
  coinData?: { symbol: string; count: number };
  mainContent?: { coinIcons?: string[] };
}

export interface CoinStatsTransactionResponse {
  result: CoinStatsTransactionResult[];
}

export interface CoinStatsCoin {
  price: string;
  symbol: string;
  name: string;
  icon?: string;
}

export interface CoinStatsPriceResponse {
  result: CoinStatsCoin[];
}

export async function getTokenAssetsByAddress(
  address: string,
  connectionId?: string,
): Promise<CoinStatsBalanceResponse | null> {
  try {
    const params = `address=${encodeURIComponent(address)}&connectionId=${connectionId ?? ''}`;
    const url = `${COINSTATS_API}/wallet/balance?${params}`;
    const data = await makeRequest(url) as unknown;
    if (data == null) return null;
    if (Array.isArray(data)) return { result: data };
    if (typeof data === 'object' && 'result' in (data as Record<string, unknown>))
      return data as CoinStatsBalanceResponse;
    return { result: [] };
  } catch (err) {
    console.warn('getTokenAssetsByAddress error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getWalletTransactions(
  address: string,
  connectionId: string,
): Promise<CoinStatsTransactionResponse | null> {
  try {
    const params = `address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(connectionId)}&limit=150`;
    const url = `${COINSTATS_API}/wallet/transactions?${params}`;
    let data = await makeRequest(url) as CoinStatsTransactionResponse | null;

    if (data == null) {
      const patchUrl = `${COINSTATS_API}/wallet/transactions?address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(connectionId)}`;
      fetch(patchUrl, { method: 'PATCH' }).catch(e =>
        console.warn('getWalletTransactions sync trigger failed:', e instanceof Error ? e.message : String(e)),
      );
      await new Promise(r => setTimeout(r, 1200));
      data = await makeRequest(url) as CoinStatsTransactionResponse | null;
    }

    if (data == null) return null;
    if (typeof data === 'object' && 'result' in (data as unknown as Record<string, unknown>))
      return data as CoinStatsTransactionResponse;
    return { result: [] };
  } catch (err) {
    console.warn('getWalletTransactions error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function fetchBaseTransactions(address: string): Promise<unknown[]> {
  const result = await getWalletTransactions(address, 'base-wallet');
  if (!result || !result.result) return [];

  const flattenedTxList: unknown[] = [];
  const rawResult = result.result;

  for (const res of rawResult) {
    const hash = res.hash ? res.hash.id : (res.id || '0x');
    const timeStamp = res.date ? Math.floor(new Date(res.date).getTime() / 1000) : 0;

    if (res.transactions && res.transactions.length) {
      for (const innerTx of res.transactions) {
        if (!innerTx.items || !innerTx.items.length) continue;
        for (const item of innerTx.items) {
          flattenedTxList.push({
            hash,
            timeStamp,
            from: item.fromAddress || '',
            to: item.toAddress || '',
            tokenSymbol: item.coin ? item.coin.symbol : '?',
            tokenDecimal: '0',
            value: item.count || 0,
            imgUrl: (item.coin && item.coin.icon) || (res.mainContent && res.mainContent.coinIcons && res.mainContent.coinIcons[0]) || null,
            _chainId: 'base',
          });
        }
      }
    } else {
      flattenedTxList.push({
        hash,
        timeStamp,
        from: '',
        to: '',
        tokenSymbol: res.coinData ? res.coinData.symbol : '?',
        tokenDecimal: '0',
        value: res.coinData ? res.coinData.count : 0,
        imgUrl: (res.mainContent && res.mainContent.coinIcons && res.mainContent.coinIcons[0]) || null,
        _chainId: 'base',
      });
    }
  }

  return flattenedTxList;
}

export async function fetchCoinStatsTokenPrice(
  symbol: string,
): Promise<{ price: number } | null> {
  try {
    const url = `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&limit=1`;
    const data = await makeRequest(url) as CoinStatsPriceResponse | null;
    if (data?.result?.length) {
      const price = Number(data.result[0].price);
      if (Number.isFinite(price) && price > 0) return { price };
    }
    return null;
  } catch (err) {
    console.warn('fetchCoinStatsTokenPrice error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
