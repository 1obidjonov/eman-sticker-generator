import { CircleAlert, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Renderer crashed', error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="fatal-error-page">
        <div className="fatal-error-card">
          <div className="fatal-error-icon">
            <CircleAlert size={28} />
          </div>
          <div className="eyebrow">Ошибка интерфейса</div>
          <h1>Приложение не смогло открыть этот экран</h1>
          <p>
            Шаблоны на диске не повреждены. Перезапустите интерфейс и повторите
            действие.
          </p>
          <details>
            <summary>Технические детали</summary>
            <code>{this.state.error.message}</code>
          </details>
          <button
            type="button"
            className="button primary"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={17} />
            Перезапустить интерфейс
          </button>
        </div>
      </main>
    );
  }
}
