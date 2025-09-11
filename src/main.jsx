import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

// Allow fallback to HashRouter if Vercel SPA rewrite not active yet.
const UseRouter = import.meta.env.VITE_USE_HASH_ROUTER ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <UseRouter>
    {/* Aurora background (tinted by body category class) */}
    <div className="aurora" aria-hidden />
    <App />
  </UseRouter>
);
