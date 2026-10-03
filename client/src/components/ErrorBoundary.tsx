import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Sin esto, cualquier excepción al pintar deja la página en blanco: React
 * desmonta el árbol entero y no queda nada en pantalla. Aquí se atrapa, se
 * avisa y se ofrece recargar.
 *
 * El detalle técnico solo se muestra en desarrollo. En producción va a la
 * consola, que es donde se mira cuando algo falla de verdad.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] fallo al pintar', error, info.componentStack);
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

          {import.meta.env.DEV ? (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-surface-subtle p-3 text-left text-xs text-ink-soft dark:bg-neutral-800 dark:text-neutral-300">
              {error.message}
            </pre>
          ) : null}

          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={this.reload}>
              Recargar
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                this.setState({ error: null });
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