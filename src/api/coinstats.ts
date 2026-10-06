import { makeRequest } from '@/api/client';
import {
  COINSTATS_API,
  TRANSACTION_QUERY_DAYS,
  TRANSACTION_SYNC_TTL_MS,
} from '@/lib/config';

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
  action?: string;
  items?: CoinStatsTransactionItem[];
}

export interface FlatChainTransaction {
  hash: string;
  timeStamp: number;
  from: string;
  to: string;
  tokenSymbol: string;
  tokenName: string;
  value: number;
  tokenDecimal: string;
  imgUrl: string | null;
  _chainId: string;
}

export interface CoinStatsTransactionResult {
  hash?: { id: string };
  id?: string;
  date?: string;
  type?: string;
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

const SYNC_STATUS_ATTEMPTS = 3;
const SYNC_STATUS_DELAY_MS = 650;
const txSyncTimes = new Map<string, number>();

function txStatusOf(err: unknown): number | null {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
}

export function coinStatsTxError(err: unknown): Error | null {
  const status = txStatusOf(err);
  if (status === 401 || status === 403) {
    return new Error('CoinStats API key inválida o expirada.');
  }
  if (status === 429) {
    return new Error('Límite de CoinStats alcanzado. Intenta más tarde.');
  }
  return null;
}

async function syncWalletTransactions(address: string, connectionId: string): Promise<string | null> {
  try {
    const data = (await makeRequest(`${COINSTATS_API}/wallet/transactions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallets: [{ address, connectionId }] }),
    })) as { status?: string } | null;
    return data?.status ?? null;
  } catch (err) {
    if (txStatusOf(err) === 409) return 'syncing';
    const visible = coinStatsTxError(err);
    if (visible) throw visible;
    console.warn('syncWalletTransactions error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function getTxSyncStatus(address: string, connectionId: string): Promise<string | null> {
  try {
    const params = `address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(connectionId)}`;
    const data = (await makeRequest(
      `${COINSTATS_API}/wallet/status?${params}`,
    )) as { status?: string } | null;
    return data?.status ?? null;
  } catch {
    return null;
  }
}

async function ensureTxSynced(address: string, connectionId: string): Promise<void> {
  const key = `${address.toLowerCase()}:${connectionId}`;
  const syncedAt = txSyncTimes.get(key);
  if (syncedAt != null && Date.now() - syncedAt <= TRANSACTION_SYNC_TTL_MS) return;
  const status = await syncWalletTransactions(address, connectionId);
  if (status != null && status.toLowerCase() === 'syncing') {
    for (let i = 0; i < SYNC_STATUS_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, SYNC_STATUS_DELAY_MS));
      const current = await getTxSyncStatus(address, connectionId);
      if (current != null && current.toLowerCase() === 'synced') break;
    }
  }
  txSyncTimes.set(key, Date.now());
}

// Historial CoinStats por chain: sync + GET page 1, filtra registros Fill
// (sinteticos de balance, no transacciones del usuario) y aplana a filas.
export async function fetchChainTransactions(
  address: string,
  connectionId: string,
  networkName: string,
  limit = 100,
): Promise<FlatChainTransaction[]> {
  const cleanLimit = Math.min(Math.max(limit, 5), 100);
  await ensureTxSynced(address, connectionId);
  const to = new Date().toISOString();
  const from = new Date(Date.now() - TRANSACTION_QUERY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const params =
    `address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(connectionId)}` +
    `&page=1&limit=${cleanLimit}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const data = (await makeRequest(
    `${COINSTATS_API}/wallet/transactions?${params}`,
  )) as CoinStatsTransactionResponse;
  const results = Array.isArray(data?.result) ? data.result : [];

  const out: FlatChainTransaction[] = [];
  for (const res of results) {
    if (String(res.type ?? '').toLowerCase() === 'fill') continue;
    const group = res.transactions?.[0];
    const item = group?.items?.[0];
    const count = item?.count ?? res.coinData?.count;
    const symbol = item?.coin?.symbol ?? res.coinData?.symbol;
    if (count == null || !symbol) continue;
    const action = group?.action ?? res.type ?? '';
    const absCount = Math.abs(count);
    const isSent = action.toLowerCase() === 'sent' || count < 0;
    const hash = res.hash?.id ?? res.id ?? '';
    if (!hash) continue;
    const timeStamp = res.date ? Math.floor(new Date(res.date).getTime() / 1000) : 0;
    out.push({
      hash,
      timeStamp,
      from: item?.fromAddress ?? (isSent ? address : ''),
      to: item?.toAddress ?? (isSent ? '' : address),
      tokenSymbol: symbol.trim(),
      tokenName: symbol.trim(),
      value: absCount,
      tokenDecimal: '0',
      imgUrl: item?.coin?.icon ?? res.mainContent?.coinIcons?.[0] ?? null,
      _chainId: networkName,
    });
  }
  return out;
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
