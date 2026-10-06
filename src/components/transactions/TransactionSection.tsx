import { useState, useEffect, useCallback } from 'react'
import TransactionTable from './TransactionTable'
import type { TransactionEntry } from '@/store/useTransactionStore'
import { fetchEtherscanTransactions } from '@/api/etherscan'
import { coinStatsTxError, fetchChainTransactions } from '@/api/coinstats'
import { useWalletStore } from '@/store/useWalletStore'
import { integerAmountToNumber, safeErrorMessage } from '@/lib/utils'
import { HAS_COINSTATS_CONFIG, TRANSACTION_CHAINS, TRANSACTION_CHAIN_DELAY_MS } from '@/lib/config'

const TX_PAGE_SIZE = 10

interface ChainState {
  all: TransactionEntry[]
  offset: number
  loading: boolean
}

interface RawTransaction {
  hash?: string;
  transactionHash?: string;
  txHash?: string;
  timeStamp?: string | number;
  timestamp?: string | number;
  time?: string | number;
  tokenSymbol?: string;
  symbol?: string;
  tokenName?: string;
  tokenDecimal?: string | number;
  value?: string | number;
  tokenValue?: string | number;
  amount?: string | number;
  from?: string;
  to?: string;
  imgUrl?: string;
}

function normalizeEntry(raw: RawTransaction, userAddress: string): TransactionEntry {
  const addr = (raw.from || '').toLowerCase()
  const isSent = addr === (userAddress || '').toLowerCase()

  const decimals = raw.tokenDecimal !== undefined && raw.tokenDecimal !== null
    ? Number(raw.tokenDecimal)
    : 18;
  const rawValue = raw.value ?? raw.tokenValue ?? raw.amount ?? '0';
  const floatValue = integerAmountToNumber(rawValue, decimals);

  return {
    hash: raw.hash || raw.transactionHash || raw.txHash || '',
    timestamp: Number(raw.timeStamp || raw.timestamp || raw.time || 0),
    tokenSymbol: raw.tokenSymbol || raw.symbol || 'ETH',
    tokenName: raw.tokenName || '',
    type: isSent ? 'send' as const : 'receive' as const,
    value: floatValue,
    usdValue: null,
    pnl: null,
    from: raw.from || '',
    to: raw.to || '',
    imgUrl: raw.imgUrl || ''
  }
}

function deduplicate(entries: TransactionEntry[]): TransactionEntry[] {
  const seen = new Set<string>()
  const result: TransactionEntry[] = []
  for (const tx of entries) {
    const key = `${tx.hash}-${tx.tokenSymbol}-${tx.value}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tx)
  }
  result.sort((a, b) => b.timestamp - a.timestamp)
  return result
}

export default function TransactionSection() {
  const address = useWalletStore((s) => s.address)
  const [chains, setChains] = useState<Record<string, ChainState>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!address) return
    setError(null)
    setChains(Object.fromEntries(
      TRANSACTION_CHAINS.map((c) => [c.id, { all: [], offset: 0, loading: true }]),
    ))
    // Secuencial con delay como la app (evita 429 de CoinStats).
    const next: Record<string, ChainState> = {}
    for (let i = 0; i < TRANSACTION_CHAINS.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, TRANSACTION_CHAIN_DELAY_MS));
      const chain = TRANSACTION_CHAINS[i]!
      try {
        let raw: unknown[] = []
        if (HAS_COINSTATS_CONFIG) {
          raw = await fetchChainTransactions(address, chain.id, chain.name, 100)
        } else if (chain.id === 'ethereum') {
          raw = await fetchEtherscanTransactions(address, 1)
        }
        const normalized = (raw as RawTransaction[]).map((tx) => normalizeEntry(tx, address))
        next[chain.id] = { all: deduplicate(normalized), offset: 0, loading: false }
      } catch (err) {
        const visible = coinStatsTxError(err)
        if (visible) {
          setError(visible.message)
          setChains(Object.fromEntries(
            TRANSACTION_CHAINS.map((c) => [c.id, { all: [], offset: 0, loading: false }]),
          ))
          return
        }
        console.warn(`tx fetch failed for ${chain.name}:`, safeErrorMessage(err))
        next[chain.id] = { all: [], offset: 0, loading: false }
      }
      setChains((prev) => ({ ...prev, [chain.id]: next[chain.id]! }))
    }
  }, [address])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const loadMore = useCallback((chainId: string) => {
    setChains((prev) => {
      const cur = prev[chainId]
      if (!cur) return prev
      return { ...prev, [chainId]: { ...cur, offset: cur.offset + TX_PAGE_SIZE } }
    })
  }, [])

  const totalTxs = Object.values(chains).reduce((acc, c) => acc + c.all.length, 0)
  const networks = Object.values(chains).filter((c) => c.all.length > 0).length

  return (
    <div className="transactions-container">
      <div className="transactions-header">
        <span>{totalTxs} txs · {networks} networks</span>
        <button type="button" className="btn-refresh" onClick={fetchAll} disabled={!address}>
          Actualizar
        </button>
      </div>
      {error && <div className="wallet-error">{error}</div>}
      {TRANSACTION_CHAINS.map((chain) => {
        const state = chains[chain.id] ?? { all: [], offset: 0, loading: false }
        const visible = state.all.slice(0, state.offset + TX_PAGE_SIZE)
        if (!state.loading && visible.length === 0) return null
        return (
          <TransactionTable
            key={chain.id}
            title={chain.name}
            txs={visible}
            loading={state.loading}
            hasMore={state.offset + TX_PAGE_SIZE < state.all.length}
            onLoadMore={() => loadMore(chain.id)}
          />
        )
      })}
    </div>
  )
}
