import { Component } from 'react';
import { RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-stack" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h1 style={{ color: '#b91c1c' }}>Algo salió mal</h1>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto 16px' }}>
            Ocurrió un error inesperado en la pantalla. Puedes intentar recargar la aplicación.
          </p>
          {this.state.error?.message && (
            <pre style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: 12, borderRadius: 8, maxWidth: 600, margin: '0 auto 16px', overflow: 'auto' }}>
              {this.state.error.message}
            </pre>
          )}
          <button className="btn primary" onClick={this.handleReset}>
            <RefreshCw size={16} /> Recargar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}