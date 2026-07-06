import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16,
          background: '#030405', color: '#d6dbe1', fontFamily: 'Inter, sans-serif',
        }}>
          <h2 style={{ color: '#e74c3c', margin: 0 }}>Algo salio mal</h2>
          <p style={{ color: '#69707a', margin: 0, maxWidth: 420, textAlign: 'center' }}>
            Ocurrio un error inesperado. Recarga la pagina para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '10px 24px', border: '1px solid #353945',
              borderRadius: 8, background: '#1a1d26', color: '#f4f4f4',
              cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
            }}
          >
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
