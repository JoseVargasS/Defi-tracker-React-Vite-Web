import { useState, useEffect, useCallback } from 'react'
import TransactionTable from './TransactionTable'
import type { TransactionEntry } from '@/store/useTransactionStore'
import { fetchEtherscanTransactions } from '@/api/etherscan'
import { fetchBaseTransactions } from '@/api/coinstats'
import { useWalletStore } from '@/store/useWalletStore'
import { integerAmountToNumber } from '@/lib/utils'

const TX_PAGE_SIZE = 10

interface ChainState {
  all: TransactionEntry[]
  offset: number
  loading: boolean
}

function normalizeEntry(raw: any, userAddress: string): TransactionEntry {
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
  const [eth, setEth] = useState<ChainState>({ all: [], offset: 0, loading: false })
  const [base, setBase] = useState<ChainState>({ all: [], offset: 0, loading: false })

  const fetchEth = useCallback(async () => {
    if (!address) return
    setEth(prev => ({ ...prev, loading: true }))
    try {
      const raw = await fetchEtherscanTransactions(address, 1)
      const normalized = raw.map(tx => normalizeEntry(tx, address))
      setEth({ all: deduplicate(normalized), offset: 0, loading: false })
    } catch {
      setEth(prev => ({ ...prev, loading: false }))
    }
  }, [address])

  const fetchBase = useCallback(async () => {
    if (!address) return
    setBase(prev => ({ ...prev, loading: true }))
    try {
      const raw = await fetchBaseTransactions(address)
      const normalized = raw.map(tx => normalizeEntry(tx, address))
      setBase({ all: deduplicate(normalized), offset: 0, loading: false })
    } catch {
      setBase(prev => ({ ...prev, loading: false }))
    }
  }, [address])

  useEffect(() => {
    fetchEth()
    fetchBase()
  }, [fetchEth, fetchBase])

  const loadMoreEth = useCallback(() => {
    setEth(prev => ({ ...prev, offset: prev.offset + TX_PAGE_SIZE }))
  }, [])

  const loadMoreBase = useCallback(() => {
    setBase(prev => ({ ...prev, offset: prev.offset + TX_PAGE_SIZE }))
  }, [])

  const visibleEth = eth.all.slice(0, eth.offset + TX_PAGE_SIZE)
  const visibleBase = base.all.slice(0, base.offset + TX_PAGE_SIZE)

  return (
    <div className="transactions-container">
      <TransactionTable
        title="Ethereum"
        txs={visibleEth}
        loading={eth.loading}
        hasMore={eth.offset + TX_PAGE_SIZE < eth.all.length}
        onLoadMore={loadMoreEth}
      />
      <TransactionTable
        title="Base"
        txs={visibleBase}
        loading={base.loading}
        hasMore={base.offset + TX_PAGE_SIZE < base.all.length}
        onLoadMore={loadMoreBase}
      />
    </div>
  )
}
