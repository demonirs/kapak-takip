import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';

if (Capacitor.isNativePlatform()) {
  // Native WebView bundles its assets with the APK. A PWA service worker can
  // otherwise keep serving an older UI after an Android update.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then(registrations =>
      Promise.all(registrations.map(registration => registration.unregister()))
    );
  }
} else {
  registerSW({
    immediate: true,
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
