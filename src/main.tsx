import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { bootstrapApplication } from './bootstrap';
import './index.css';

const root = createRoot(document.getElementById('root')!);

void bootstrapApplication(() => {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}).then((result) => {
  if (result.ok) return;
  root.render(
    <StrictMode>
      <main className="page-shell">
        <section className="empty-state panel" role="alert">
          <h1>Project persistence unavailable</h1>
          <p>{result.error}</p>
          <p>Local-development project mode does not fall back to browser storage.</p>
        </section>
      </main>
    </StrictMode>,
  );
});
