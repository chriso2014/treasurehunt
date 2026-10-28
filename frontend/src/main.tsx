import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { Admin } from './pages/admin/Admin.js';
import { Results } from './pages/Results.js';
import { configureAuth } from './auth/index.js';
import './index.css';

configureAuth();

// Three pages, picked by path; CloudFront serves index.html for all of them.
const path = window.location.pathname;
const page = path.startsWith('/admin') ? 'admin' : path.startsWith('/results') ? 'results' : 'team';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page === 'admin' ? <Admin /> : page === 'results' ? <Results /> : <App />}
  </StrictMode>,
);
