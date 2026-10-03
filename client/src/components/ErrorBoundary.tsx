import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string;
}

/**
 * Sin esto, cualquier excepción al pintar deja la página en blanco: React
 * desmonta el árbol entero y no queda nada en pantalla. Aquí se atrapa, se
 * avisa y se ofrece recargar.
 *
 * El mensaje se muestra siempre, también en producción: si no, la única pista es
 * la consola y no hay forma de depurar a distancia. Solo el stack va plegado.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): State {
    // El stack lo rellena componentDidCatch, que se llama justo después.
    return { error, stack: '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] fallo al pintar', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  private reload = () => window.location.reload();

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-6 dark:bg-neutral-950">
        <div className="card w-full max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-ink dark:text-neutral-100">
            Algo se ha roto al pintar esta página
          </h1>
          <p className="mt-2 text-sm text-ink-soft dark:text-neutral-300">
            Vuelve a cargar. Si sigue igual, es que la web se ha actualizado y el
            backend todavía va con la versión anterior.
          </p>

          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-subtle p-3 text-left text-xs text-ink-soft dark:bg-neutral-800 dark:text-neutral-300">
            {error.message}
          </pre>

          {this.state.stack ? (
            <details className="mt-2 text-left">
              <summary className="cursor-pointer text-xs text-ink-muted dark:text-neutral-400">
                Ver traza
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-subtle p-3 text-left text-[11px] text-ink-soft dark:bg-neutral-800 dark:text-neutral-300">
                {this.state.stack.trim()}
              </pre>
            </details>
          ) : null}

          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={this.reload}>
              Recargar
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                this.setState({ error: null, stack: '' });
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }
}