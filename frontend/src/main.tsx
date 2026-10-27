import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './app/theme';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline />
    <main style={{ padding: '3rem' }}><h1>NovaMart customer care</h1><p>Portal foundation ready.</p></main>
  </ThemeProvider></StrictMode>,
);
