import { useState, useEffect, useRef, useCallback } from 'react'
import type { TransactionEntry } from '@/store/useTransactionStore'
import { getTokenPriceUSD, getHistoricalTokenPriceUSD } from '@/api/prices'
import { safeImageUrl } from '@/lib/utils'
import { tokenIconUrl } from '@/lib/assets'
import { CHART_THEME } from '@/lib/chart/indicators'

interface PriceData {
  usdValue: number
  usdHist: number
  pnl: number
  pnlPct: number
}

interface TransactionTableProps {
  txs: TransactionEntry[]
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  title: string
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
]

function groupByDate(txs: TransactionEntry[]): Map<string, TransactionEntry[]> {
  const groups = new Map<string, TransactionEntry[]>()
  for (const tx of txs) {
    const d = new Date(tx.timestamp * 1000)
    const key = d.toLocaleDateString('es-ES')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }
  return groups
}

function formatAmount(value: number, symbol: string): string {
  const decimals = symbol === 'ETH' || symbol === 'SOL' ? 6 : 4
  const abs = Math.abs(value)
  return abs.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

function TxTokenIcon({ symbol, imgUrl }: { symbol: string; imgUrl: string }) {
  const [hasError, setHasError] = useState(false)
  const resolvedUrl = imgUrl || tokenIconUrl(symbol)
  const url = safeImageUrl(resolvedUrl)

  if (url && !hasError) {
    return (
      <img
        src={url}
        alt={symbol}
        className="tx-icon"
        onError={() => setHasError(true)}
      />
    )
  }

  return <span className="tx-icon-fallback">{symbol ? symbol[0].toUpperCase() : '?'}</span>
}

export default function TransactionTable({ txs, onLoadMore, hasMore, loading, title }: TransactionTableProps) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({})
  const [hydrating, setHydrating] = useState(false)
  const hydratedRef = useRef(new Set<string>())
  const grouped = groupByDate(txs)

  const hydrateBatch = useCallback(async (entries: TransactionEntry[]) => {
    setHydrating(true)
    const results = await Promise.all(
      entries.map(async (tx) => {
        try {
          const [currentPrice, histPrice] = await Promise.all([
            getTokenPriceUSD(tx.tokenSymbol),
            getHistoricalTokenPriceUSD(tx.tokenSymbol, new Date(tx.timestamp * 1000))
          ])
          const usdValue = tx.value * (currentPrice || 0)
          const usdHist = tx.value * (histPrice || 0)
          const pnl = usdValue - usdHist
          const pnlPct = usdHist ? (pnl / usdHist) * 100 : 0
          return [tx.hash, { usdValue, usdHist, pnl, pnlPct }] as const
        } catch {
          return [tx.hash, { usdValue: 0, usdHist: 0, pnl: 0, pnlPct: 0 }] as const
        }
      })
    )

    const next: Record<string, PriceData> = {}
    for (const [hash, data] of results) {
      next[hash] = data
    }
    setPrices(prev => ({ ...prev, ...next }))
    setHydrating(false)
  }, [])

  useEffect(() => {
    const unhydrated = txs.filter(tx => !hydratedRef.current.has(tx.hash))
    if (unhydrated.length === 0) return
    for (const tx of unhydrated) hydratedRef.current.add(tx.hash)
    hydrateBatch(unhydrated)
  }, [txs, hydrateBatch])

  if (!txs.length && !loading) {
    return (
      <div className="tx-section">
        <header><h1 className="tx-title">{title}</h1></header>
        <div className="tx-content">
          <table className="tx-table-styled">
            <tbody>
              <tr><td className="tx-message-cell" colSpan={4}>Sin transacciones</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="tx-section">
      <header><h1 className="tx-title">{title}</h1></header>
      <div className="tx-content">
        <table className="tx-table-styled">
          <tbody>
            {[...grouped.entries()].map(([date, transactions]) => (
              <DateGroup key={date} date={date} transactions={transactions} prices={prices} hydrating={hydrating} />
            ))}
            {loading && (
              <tr><td className="tx-message-cell" colSpan={4}>Cargando...</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="load-more">
          <button onClick={onLoadMore} disabled={loading}>Ver mas</button>
        </div>
      )}
    </div>
  )
}

function DateGroup({ date, transactions, prices, hydrating }: {
  date: string
  transactions: TransactionEntry[]
  prices: Record<string, PriceData>
  hydrating: boolean
}) {
  const [day, month, year] = date.split('/')
  const dateObj = new Date(`${year}-${month}-${day}`)
  const dateText = `${parseInt(day, 10)} ${MONTH_NAMES[dateObj.getMonth()]}, ${year}`
  const header = dateText.charAt(0).toUpperCase() + dateText.slice(1)

  return (
    <>
      <tr className="tx-date-row"><td colSpan={4}>{header}</td></tr>
      <tr className="tx-list-tags">
        <td>tipo</td>
        <td>token</td>
        <td>cantidad</td>
        <td>USD / P&L</td>
      </tr>
      {transactions.map(tx => (
        <TransactionRow key={`${tx.hash}-${tx.tokenSymbol}`} tx={tx} price={prices[tx.hash]} hydrating={hydrating} />
      ))}
    </>
  )
}

function TransactionRow({ tx, price, hydrating }: { tx: TransactionEntry; price?: PriceData; hydrating: boolean }) {
  const isSent = tx.type === 'send'
  const amtFormatted = formatAmount(tx.value, tx.tokenSymbol)
  const d = new Date(tx.timestamp * 1000)
  const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const usdDisplay = price != null
    ? `$${price.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : '...'

  const plDisplay = price != null
    ? `${price.pnl >= 0 ? '+' : ''}${price.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : '...'

  const plPctDisplay = price != null
    ? `(${price.pnlPct >= 0 ? '+' : ''}${price.pnlPct.toFixed(2)}%)`
    : ''

  const plColor = price
    ? price.pnl > 0 ? CHART_THEME.plPositive : price.pnl < 0 ? CHART_THEME.plNegative : CHART_THEME.plNeutral
    : CHART_THEME.plNeutral

  return (
    <tr className="tx-list-row">
      <td className={`tx-type${isSent ? ' sent' : ''}`}>
        <div>{isSent ? 'Sent' : 'Received'}</div>
        <div className="tx-time">{timeStr}</div>
      </td>
      <td className="tx-token">
        <TxTokenIcon symbol={tx.tokenSymbol} imgUrl={tx.imgUrl || ''} />
        {tx.tokenSymbol}
      </td>
      <td>
        <span className={`tx-amount${isSent ? ' sent' : ''}`}>
          {isSent ? '-' : '+'} {amtFormatted}
        </span>
        <div className={`tx-detail tx-price-detail${hydrating || !price ? ' muted' : ''}`}>
          {hydrating
            ? 'Calculando historico...'
            : price && price.usdHist > 0
              ? `$${price.usdHist.toLocaleString(undefined, { maximumFractionDigits: 2 })} hist.`
              : 'Sin datos historicos'}
        </div>
      </td>
      <td className="tx-usd">
        <div className="tx-usd-current">{usdDisplay}</div>
        <div className="tx-pl-line" style={{ color: plColor }}>{plDisplay}</div>
        <div className="tx-pl-pct" style={{ color: plColor }}>{plPctDisplay}</div>
      </td>
    </tr>
  )
}
