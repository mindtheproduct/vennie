import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './lib/ThemeProvider.jsx';
import App from './App.jsx';
import './styles.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
