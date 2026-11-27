import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { initInstallCapture, markUpdateAvailable, setUpdateHandler } from './lib/pwa';

initInstallCapture();
if (import.meta.env.PROD) {
  // Ask before switching to a new version, so nothing being typed is lost by a reload.
  setUpdateHandler(registerSW({ onNeedRefresh: markUpdateAvailable }));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
