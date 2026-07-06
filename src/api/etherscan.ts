import { makeRequest } from '@/api/client';
import { ETH_API, ETH_KEY } from '@/lib/config';

const BASE_URL = ETH_API;
const CHAIN_ID = 1;

function buildUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({ chainid: String(CHAIN_ID), apikey: ETH_KEY, ...params });
  return `${BASE_URL}?${query.toString()}`;
}

export async function getETHBalance(address: string): Promise<string | null> {
  const url = buildUrl({ module: 'account', action: 'balance', address, tag: 'latest' });
  try {
    const data = await makeRequest(url) as Record<string, unknown> | null;
    return data != null && typeof data.result === 'string' ? data.result : null;
  } catch {
    return null;
  }
}

// ponytail: Etherscan v2 may lack tokenlist endpoint; reconstructing from tokentx
export async function getTokenBalances(
  address: string
): Promise<{
  result: {
    contractAddress: string;
    tokenBalance: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
  }[];
} | null> {
  try {
    const data = await getTokenTransactions(address, 1, 1000);
    if (!data?.result) return { result: [] };

    const addressLower = address.toLowerCase();
    const balances = new Map<
      string,
      {
        contractAddress: string;
        tokenBalance: bigint;
        tokenName: string;
        tokenSymbol: string;
        tokenDecimal: string;
      }
    >();

    for (const tx of data.result as any[]) {
      const contract = (tx.contractAddress || '').toLowerCase();
      if (!contract) continue;
      const current = balances.get(contract) || {
        contractAddress: tx.contractAddress,
        tokenBalance: BigInt(0),
        tokenName: tx.tokenName || '',
        tokenSymbol: tx.tokenSymbol || '',
        tokenDecimal: tx.tokenDecimal || '18',
      };

      const value = BigInt(String(tx.value || '0'));
      if ((tx.to || '').toLowerCase() === addressLower) current.tokenBalance += value;
      if ((tx.from || '').toLowerCase() === addressLower) current.tokenBalance -= value;
      balances.set(contract, current);
    }

    const result = Array.from(balances.values())
      .filter(b => b.tokenBalance > 0)
      .map(b => ({
        contractAddress: b.contractAddress,
        tokenBalance: b.tokenBalance.toString(),
        tokenName: b.tokenName,
        tokenSymbol: b.tokenSymbol,
        tokenDecimal: b.tokenDecimal,
      }));

    return { result };
  } catch {
    return null;
  }
}

export async function getTokenTransactions(
  address: string,
  page = 1,
  offset = 100
): Promise<{ result: unknown[]; status: string } | null> {
  const url = buildUrl({ module: 'account', action: 'tokentx', address, page: String(page), offset: String(offset), sort: 'desc' });
  try {
    return await makeRequest(url) as { result: unknown[]; status: string } | null;
  } catch {
    return null;
  }
}

export async function getNormalTransactions(
  address: string,
  page = 1,
  offset = 100
): Promise<{ result: unknown[]; status: string } | null> {
  const url = buildUrl({ module: 'account', action: 'txlist', address, page: String(page), offset: String(offset), sort: 'desc' });
  try {
    return await makeRequest(url) as { result: unknown[]; status: string } | null;
  } catch {
    return null;
  }
}

export async function fetchEtherscanTransactions(address: string, chainId = 1): Promise<unknown[]> {
  const [tokentx, txlist] = await Promise.allSettled([
    getTokenTransactions(address),
    getNormalTransactions(address),
  ]);
  const results: unknown[] = [];
  if (tokentx.status === 'fulfilled' && tokentx.value?.result) {
    results.push(...tokentx.value.result.map((tx: unknown) => ({ ...(tx as object), _chainId: chainId })));
  }
  if (txlist.status === 'fulfilled' && txlist.value?.result) {
    results.push(...txlist.value.result.map((tx: unknown) => ({
      ...(tx as object),
      tokenSymbol: 'ETH',
      tokenName: 'Ether',
      tokenDecimal: '18',
      _chainId: chainId,
    })));
  }
  return results;
}
