import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

if (typeof window !== 'undefined' && typeof window.__nihongoApplyUpdate !== 'function') {
  window.__nihongoApplyUpdate = null;
}

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      try {
        localStorage.setItem('nihongo:pwa-update-ready', '1');
      } catch {
        // ignore localStorage issues
      }
      window.__nihongoApplyUpdate = () => updateSW(true);
      window.dispatchEvent(new CustomEvent('nihongo:pwa-update-ready'));
    },
    onOfflineReady() {
      console.log('Ung dung da san sang offline.');
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);