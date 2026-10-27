import { Component, lazy, Suspense } from 'react';
import type { ErrorInfo, PropsWithChildren } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import type { PortalService } from '../services/contracts';
import { LoginPage } from '../features/auth/LoginPage';
const Dashboard = lazy(() =>
  import('./Dashboard').then((module) => ({ default: module.Dashboard })),
);
class ErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not log customer conversations or credentials. */
  }
  render() {
    if (this.state.failed)
      return (
        <Box sx={{ p: 5, maxWidth: 600, mx: 'auto' }}>
          <Alert severity="error">Something went wrong displaying the portal.</Alert>
          <Button sx={{ mt: 2 }} onClick={() => window.location.reload()}>
            Reload portal
          </Button>
        </Box>
      );
    return this.props.children;
  }
}
function AuthenticatedApp() {
  const { customer, loading } = useAuth();
  if (loading)
    return (
      <Box
        role="status"
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={24} />
        <Typography>Opening your account…</Typography>
      </Box>
    );
  return customer ? (
    <Suspense
      fallback={
        <Box role="status" sx={{ p: 5 }}>
          Loading your workspace…
        </Box>
      }
    >
      <Dashboard />
    </Suspense>
  ) : (
    <LoginPage />
  );
}
export function App({ service }: { service?: PortalService }) {
  return (
    <ErrorBoundary>
      <AuthProvider service={service}>
        <AuthenticatedApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
