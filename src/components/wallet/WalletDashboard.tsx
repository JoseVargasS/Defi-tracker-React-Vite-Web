import { useMemo } from 'react';
import { SUPPORTED_CHAINS } from '@/lib/config';
import { ChainCard } from './ChainCard';
import type { WalletAsset } from '@/store/useWalletStore';

export function WalletDashboard({ assets, totalWorth }: { assets: WalletAsset[]; totalWorth: number }) {
  const sortedChains = useMemo(() => {
    const byChain = new Map<string, WalletAsset[]>();
    for (const asset of assets) {
      const list = byChain.get(asset.chain) || [];
      list.push(asset);
      byChain.set(asset.chain, list);
    }

    const chainOrder = SUPPORTED_CHAINS.map(c => c.name);
    return [...byChain.entries()].sort(
      (a, b) => chainOrder.indexOf(a[0] as typeof chainOrder[number]) - chainOrder.indexOf(b[0] as typeof chainOrder[number])
    ).map(([chainName, chainAssets]) => ({
      chainName,
      chainAssets,
      chainTotal: chainAssets.reduce((s, a) => s + (a.total || 0), 0),
      chainIcon: chainAssets[0]?.chainIcon || '',
    }));
  }, [assets]);

  return (
    <div className="wallet-dashboard">
      <div className="wallet-totals">
        <div className="wallet-total-title">Total Worth</div>
        <div className="wallet-total-usd">
          ${totalWorth.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <div className="wallet-total-sub">
          Assets: ${totalWorth.toLocaleString(undefined, { maximumFractionDigits: 2 })} &nbsp; | &nbsp; DeFi: $0
        </div>
      </div>

      {sortedChains.map(({ chainName, chainAssets, chainTotal, chainIcon }) => (
          <ChainCard
            key={chainName}
            chainName={chainName}
            chainIcon={chainIcon}
            chainTotal={chainTotal}
            assets={chainAssets}
          />
        ))}
    </div>
  );
}
