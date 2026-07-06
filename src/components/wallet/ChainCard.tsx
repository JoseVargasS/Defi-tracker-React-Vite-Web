import { useState } from 'react';
import { ZeroValueToggle } from './ZeroValueToggle';
import type { WalletAsset } from '@/store/useWalletStore';
import { safeImageUrl, tokenIconUrl } from '@/lib/utils';

const SPECIAL_SYMBOLS = ['USUAL', 'USUALX', 'USD0', 'BIO'];

function TokenIcon({ symbol, imgUrl }: { symbol: string; imgUrl: string }) {
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = imgUrl || tokenIconUrl(symbol);
  const url = safeImageUrl(resolvedUrl);

  if (url && !hasError) {
    return (
      <img
        src={url}
        alt=""
        className="token-icon"
        onError={() => setHasError(true)}
      />
    );
  }

  const char = symbol ? symbol[0].toUpperCase() : 'T';
  return <span className="token-fallback-icon">{char}</span>;
}

function renderRow(asset: WalletAsset) {
  const sym = asset.symbol?.toUpperCase() || 'TOKEN';
  const priceStr = asset.price == null
    ? '-'
    : SPECIAL_SYMBOLS.includes(sym)
      ? `$${Number(asset.price).toFixed(4)}`
      : `$${Number(asset.price).toFixed(2)}`;
  const amountStr = asset.amount == null
    ? '-'
    : sym === 'ETH' || sym === 'SOL'
      ? Number(asset.amount).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
      : Number(asset.amount).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const totalStr = asset.total ? `$${asset.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-';

  return (
    <tr key={`${asset.chain}-${asset.symbol}-${asset.amount}`}>
      <td><TokenIcon symbol={asset.symbol} imgUrl={asset.imgUrl} />{asset.symbol}</td>
      <td>{amountStr}</td>
      <td>{priceStr}</td>
      <td>{totalStr}</td>
    </tr>
  );
}

export function ChainCard({ chainName, chainIcon, chainTotal, assets }: {
  chainName: string;
  chainIcon: string;
  chainTotal: number;
  assets: WalletAsset[];
}) {
  const validChainIcon = safeImageUrl(chainIcon);
  const valuable = assets.filter(a => (a.total || 0) > 0).sort((a, b) => (b.total || 0) - (a.total || 0));
  const worthless = assets.filter(a => !a.total || a.total <= 0);

  return (
    <div className="wallet-assets-card">
      <div className="wallet-assets-card-head">
        <div className="wallet-section-title">
          {validChainIcon && <img src={validChainIcon} alt="" className="chain-icon" />}
          {chainName}
        </div>
        <div className="chain-total-green">
          Total {chainName}: ${chainTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      </div>
      <table className="wallet-assets-table">
        <thead>
          <tr><th>Name</th><th>Amount</th><th>Price</th><th>Total</th></tr>
        </thead>
        <tbody>
          {valuable.map(renderRow)}
          {worthless.length > 0 && (
            <ZeroValueToggle count={worthless.length}>
              {worthless.map(renderRow)}
            </ZeroValueToggle>
          )}
        </tbody>
      </table>
    </div>
  );
}
