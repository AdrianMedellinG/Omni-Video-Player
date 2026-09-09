import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App.jsx';
import TizenApp from './TizenApp.jsx';
import './styles.css';

const isTizenBuild = import.meta.env.MODE === 'tizen';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#090b10', paper: '#11151d' },
    primary: { main: '#e50914' },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&:focus-visible': {
            outline: '4px solid var(--universal-primary-color, #e50914)',
            outlineOffset: '3px',
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px var(--universal-primary-focus-shadow, rgba(229, 9, 20, .28))',
          },
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    {isTizenBuild ? <TizenApp /> : <App />}
  </ThemeProvider>,
);
