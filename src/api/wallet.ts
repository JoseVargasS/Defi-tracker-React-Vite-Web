import {
  BALANCE_DUST_THRESHOLD,
  BINANCE_API,
  CHAIN_FALLBACKS,
  ETH_API,
  ETH_KEY,
  HAS_COINSTATS_CONFIG,
  HAS_ETHERSCAN_CONFIG,
  STABLE_PRICES,
  SUPPORTED_CHAINS,
  WALLET_CHAIN_DELAY_MS,
} from '@/lib/config';
import { TOKEN_ICON_FALLBACKS } from '@/lib/assets';
import { makeRequest } from '@/api/client';
import { integerAmountToNumber, safeErrorMessage } from '@/lib/utils';
import { getTokenAssetsByAddress } from '@/api/coinstats';
import type { EtherscanTokenTx } from '@/api/etherscan';
import type { WalletAsset } from '@/store/useWalletStore';

interface ChainBalances {
  chain: { id: string; name: string; icon: string };
  balances: { name: string; symbol: string; amount: number; price: number | null; imgUrl: string | null }[];
}

// Solo EVM de 18 decimales (Solana usa 9 y no es EVM: queda fuera del fallback).
const EXPLORER_FALLBACK_CHAINS = ['ethereum', 'base-wallet', 'binancesmartchain'];

function statusOf(err: unknown): number | null {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
}

export function coinStatsBalanceError(err: unknown): Error | null {
  const status = statusOf(err);
  if (status === 401 || status === 403) {
    return new Error('CoinStats API key inválida o expirada.');
  }
  if (status === 429) {
    return new Error('Límite de CoinStats alcanzado. Intenta más tarde.');
  }
  return null;
}

async function getFallbackTokenPrice(symbol: string): Promise<number | null> {
  const normalized = symbol.toUpperCase();
  if (STABLE_PRICES[normalized] !== undefined) return STABLE_PRICES[normalized];
  if (normalized === 'ETH' || normalized === 'BNB') {
    try {
      const res = await makeRequest(
        `${BINANCE_API}/ticker/price?symbol=${normalized}USDT`,
      ) as { price: string };
      const price = Number.parseFloat(res.price);
      return Number.isFinite(price) && price > 0 ? price : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchExplorerBalances(address: string, chain: { id: string; name: string; icon: string }) {
  if (!HAS_ETHERSCAN_CONFIG) return null;
  if (!EXPLORER_FALLBACK_CHAINS.includes(chain.id)) return null;

  const fallback = CHAIN_FALLBACKS[chain.id];
  if (!fallback) return null;

  const safeAddress = encodeURIComponent(address);
  const balanceUrl = `${ETH_API}?chainid=${fallback.chainId}&module=account&action=balance&address=${safeAddress}&tag=latest&apikey=${ETH_KEY}`;
  const tokenUrl = `${ETH_API}?chainid=${fallback.chainId}&module=account&action=tokentx&address=${safeAddress}&page=1&offset=1000&sort=asc&apikey=${ETH_KEY}`;

  const [nativeResponse, tokenResponse] = await Promise.allSettled([
    makeRequest(balanceUrl),
    makeRequest(tokenUrl),
  ]);

  const balances: { name: string; symbol: string; amount: number; price: number | null; imgUrl: string | null }[] = [];

  const nativeWei: string = nativeResponse.status === 'fulfilled'
    ? (nativeResponse.value as { result?: string } | undefined)?.result ?? '0'
    : '0';
  const nativeAmount = integerAmountToNumber(nativeWei, 18);
  const nativePrice = await getFallbackTokenPrice(fallback.nativeSymbol);
  if (nativeAmount > 0) {
    balances.push({
      name: fallback.nativeName,
      symbol: fallback.nativeSymbol,
      amount: nativeAmount,
      price: nativePrice,
      imgUrl: TOKEN_ICON_FALLBACKS[fallback.nativeSymbol] || null,
    });
  }

  const tokenResult = tokenResponse.status === 'fulfilled'
    ? (tokenResponse.value as { result?: unknown } | undefined)?.result
    : undefined;
  const tokenTxs: EtherscanTokenTx[] = Array.isArray(tokenResult) ? (tokenResult as EtherscanTokenTx[]) : [];

  const addressLower = address.toLowerCase();
  const tokenBalances = new Map<string, { raw: bigint; decimals: number; name: string; symbol: string; imgUrl: string | null }>();

  for (const tx of tokenTxs) {
    const contract = String(tx.contractAddress || tx.tokenSymbol || '').toLowerCase();
    const symbol = String(tx.tokenSymbol || 'TOKEN').toUpperCase();
    const decimals = Number(tx.tokenDecimal ?? 18);
    const key = `${contract}-${symbol}`;
    const current = tokenBalances.get(key) || {
      raw: BigInt(0),
      decimals,
      name: tx.tokenName || symbol,
      symbol,
      imgUrl: TOKEN_ICON_FALLBACKS[symbol] || null,
    };

    let value: bigint;
    try { value = BigInt(String(tx.value || '0')); } catch { value = BigInt(0); }

    if (String(tx.to || '').toLowerCase() === addressLower) current.raw += value;
    if (String(tx.from || '').toLowerCase() === addressLower) current.raw -= value;
    tokenBalances.set(key, current);
  }

  const tokenList: { name: string; symbol: string; amount: number; imgUrl: string | null }[] = [];
  for (const token of tokenBalances.values()) {
    if (token.raw <= BigInt(0)) continue;
    const amount = integerAmountToNumber(token.raw.toString(), token.decimals);
    if (amount <= 0) continue;
    tokenList.push({ name: token.name, symbol: token.symbol, amount, imgUrl: token.imgUrl });
  }

  if (tokenList.length) {
    const prices = await Promise.all(tokenList.map((t) => getFallbackTokenPrice(t.symbol)));
    for (let i = 0; i < tokenList.length; i++) {
      balances.push({ ...tokenList[i]!, price: prices[i] ?? null });
    }
  }

  return { chain, balances, source: 'etherscan' as const };
}

async function fetchChainBalances(address: string, chain: { id: string; name: string; icon: string }): Promise<ChainBalances & { source: 'coinstats' | 'etherscan' }> {
  if (HAS_COINSTATS_CONFIG) {
    try {
      const data = await getTokenAssetsByAddress(address, chain.id);
      const normalizedBalances = data?.result ?? [];
      if (normalizedBalances.length > 0 || !CHAIN_FALLBACKS[chain.id]) {
        return {
          chain,
          balances: normalizedBalances.map((b) => {
            const raw = typeof b.price !== 'number' ? NaN : b.price;
            return {
              name: b.name || b.symbol,
              symbol: b.symbol,
              amount: b.amount || 0,
              price: Number.isFinite(raw) ? raw : null,
              imgUrl: b.icon || null,
            };
          }),
          source: 'coinstats' as const,
        };
      }
    } catch (error) {
      // Auth/rate-limit no cae al fallback: se propaga el original (con status).
      if (coinStatsBalanceError(error)) throw error;
      console.warn(`Error fetching ${chain.name} from CoinStats:`, safeErrorMessage(error));
    }
  }

  const explorer = await fetchExplorerBalances(address, chain);
  if (!explorer) {
    return { chain, balances: [], source: 'coinstats' as const };
  }
  return explorer;
}

export async function fetchWalletAssets(address: string): Promise<{ assets: WalletAsset[]; totalWorth: number }> {
  // Secuencial con delay como la app (evita 429 de CoinStats).
  const allAssets: WalletAsset[] = [];

  for (let i = 0; i < SUPPORTED_CHAINS.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, WALLET_CHAIN_DELAY_MS));
    const chain = SUPPORTED_CHAINS[i]!;
    let result: Awaited<ReturnType<typeof fetchChainBalances>>;
    try {
      result = await fetchChainBalances(address, chain);
    } catch (error) {
      const visible = coinStatsBalanceError(error);
      if (visible) throw visible;
      console.warn(`Error fetching ${chain.name}:`, safeErrorMessage(error));
      continue;
    }
    if (!result || !result.balances || result.balances.length === 0) continue;

    for (const token of result.balances) {
      const amount = token.amount || 0;
      if (amount <= 0) continue;
      const price = token.price;
      const total = price != null ? amount * price : 0;
      // Polvo fuera solo con precio conocido; sin precio se conserva por cantidad.
      if (price != null && total <= BALANCE_DUST_THRESHOLD) continue;
      allAssets.push({
        symbol: token.symbol,
        amount,
        price,
        total,
        chain: result.chain.name,
        chainId: result.chain.id,
        chainIcon: result.chain.icon,
        imgUrl: token.imgUrl || '',
      });
    }
  }

  const totalWorth = allAssets.reduce((acc, a) => acc + (a.total || 0), 0);
  return { assets: allAssets, totalWorth };
}
