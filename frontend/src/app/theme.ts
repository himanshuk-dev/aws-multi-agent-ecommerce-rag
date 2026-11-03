import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#244f43', dark: '#132f2a', contrastText: '#ffffff' },
    secondary: { main: '#d8e8bd' },
    background: { default: '#f5f5ef', paper: '#ffffff' },
    text: { primary: '#192f2a', secondary: '#64736c' },
    divider: '#e4e8df',
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.05em' },
    h2: { fontWeight: 650, letterSpacing: '-0.04em' },
    h3: { fontWeight: 650, letterSpacing: '-0.03em' },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 12, padding: '11px 20px' } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: '#e4e8df' } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiOutlinedInput: { styleOverrides: { root: { background: '#fff', borderRadius: 12 } } },
  },
});
