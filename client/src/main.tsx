import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initTheme } from './hooks/useTheme';
import './index.css';

// Antes de montar React, para que la página no llegue a pintarse en claro y
// luego saltara a oscuro.
initTheme();

const container = document.getElementById('root');

if (!container) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      {/* Sin esto, un fallo al pintar deja la página en blanco y no hay forma de
          saber qué pasó. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
