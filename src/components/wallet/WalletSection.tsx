import { useCallback, useEffect } from 'react';
import { useWalletStore } from '@/store/useWalletStore';
import { readSavedWallets, writeSavedWallets, clearAppStorage } from '@/lib/storage';
import {
  HAS_COINSTATS_CONFIG,
  HAS_ETHERSCAN_CONFIG,
  WALLET_ADDRESS_RE,
} from '@/lib/config';
import { safeErrorMessage } from '@/lib/utils';
import { fetchWalletAssets } from '@/api/wallet';
import { WalletDashboard } from './WalletDashboard';

const truncated = (w: string) => w.length > 14 ? `${w.slice(0, 6)}...${w.slice(-4)}` : w;

export function WalletSection() {
  const {
    address, savedWallets, loading, error, assets, totalWorth,
    setAddress, setSavedWallets, addSavedWallet, removeSavedWallet,
    setLoading, setError, setAssets,
  } = useWalletStore();

  useEffect(() => {
    setSavedWallets(readSavedWallets());
  }, [setSavedWallets]);

  const handleSave = useCallback(() => {
    if (!WALLET_ADDRESS_RE.test(address)) {
      setError('Direccion invalida. Debe ser 0x seguido de 40 caracteres hex.');
      return;
    }
    addSavedWallet(address);
    const updated = writeSavedWallets([...savedWallets, address]);
    setSavedWallets(updated);
    setError(null);
  }, [address, addSavedWallet, savedWallets, setSavedWallets, setError]);

  const handleDelete = useCallback((wallet: string) => {
    removeSavedWallet(wallet);
    const updated = writeSavedWallets(savedWallets.filter(w => w !== wallet));
    setSavedWallets(updated);
    if (wallet === useWalletStore.getState().address) {
      setAddress('');
    }
    setError(null);
  }, [removeSavedWallet, savedWallets, setSavedWallets, setAddress, setError]);

  const handleCopy = useCallback((wallet: string) => {
    navigator.clipboard.writeText(wallet).catch(() => {});
  }, []);

  const handleClearAll = useCallback(() => {
    clearAppStorage();
    setSavedWallets([]);
    setAddress('');
    setAssets([], 0);
    setError(null);
  }, [setSavedWallets, setAddress, setAssets, setError]);

  const doSearch = useCallback(async (wallet: string) => {
    if (!WALLET_ADDRESS_RE.test(wallet)) {
      setError('Direccion invalida. Debe ser 0x seguido de 40 caracteres hex.');
      return;
    }

    if (!HAS_COINSTATS_CONFIG && !HAS_ETHERSCAN_CONFIG) {
      setError('Falta cargar config con COINSTATS_API_KEY o ETH_KEY. Ejecuta node scripts/generate-config.mjs.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchWalletAssets(wallet);
      setAssets(result.assets, result.totalWorth);
    } catch (err) {
      setError(safeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setAssets]);

  const handleSearch = useCallback(async () => {
    if (!WALLET_ADDRESS_RE.test(address)) {
      setError('Direccion invalida. Debe ser 0x seguido de 40 caracteres hex.');
      return;
    }
    await doSearch(address);
  }, [address, doSearch, setError]);

  const handleSavedClick = useCallback((wallet: string) => {
    setAddress(wallet);
    doSearch(wallet);
  }, [setAddress, doSearch]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
  }, [setAddress]);

  const isSaved = savedWallets.includes(address);

  return (
    <section className="wallet-section">
      <header>
        <h1>Wallet</h1>
      </header>

      <div className="card">
        <div className="input-group">
          <input
            type="text"
            value={address}
            onChange={handleInput}
            placeholder="0x..."
            className="wallet-input"
          />
          <button
            type="button"
            className="btn-search"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            )}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          {address && !isSaved && (
            <button type="button" className="btn-save" onClick={handleSave} disabled={loading} title="Guardar billetera">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          )}
        </div>

        {error && (
          <div className="wallet-error">{error}</div>
        )}

        {loading && (
          <div className="wallet-loading">Cargando balances de multiples redes...</div>
        )}

        {savedWallets.length > 0 && (
          <div className="wallet-saved-section">
            <div className="wallet-saved-header">
              <span className="wallet-saved-title">Billeteras guardadas</span>
              <button type="button" className="btn-clear-all" onClick={handleClearAll} title="Eliminar todas">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Limpiar
              </button>
            </div>
            <div className="wallet-saved-list">
              {savedWallets.map(w => (
                <div
                  key={w}
                  className={`wallet-chip${w === address ? ' active' : ''}`}
                  onClick={() => { if (!loading) handleSavedClick(w); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleSavedClick(w); }}
                >
                  <span className="wallet-chip-address">{truncated(w)}</span>
                  <div className="wallet-chip-actions">
                    <button
                      type="button"
                      className="wallet-chip-btn"
                      onClick={(e) => { e.stopPropagation(); handleCopy(w); }}
                      title="Copiar direccion"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="wallet-chip-btn wallet-chip-btn-danger"
                      onClick={(e) => { e.stopPropagation(); handleDelete(w); }}
                      title="Eliminar billetera"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div id="walletData">
          {!loading && assets.length > 0 && (
            <WalletDashboard assets={assets} totalWorth={totalWorth} />
          )}
          {!loading && !error && assets.length === 0 && address && (
            <div className="wallet-empty">
              No se encontraron balances con valor en ninguna red
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
