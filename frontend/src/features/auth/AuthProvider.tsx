import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Customer, PortalService } from '../../services/contracts';
import { ApiError, portalService } from '../../services/portalService';

interface AuthState {
  mode: 'demo' | 'agentcore';
  customer: Customer | null;
  loading: boolean;
  error: string;
  service: PortalService;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  expire(): void;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({
  children,
  service = portalService,
}: PropsWithChildren<{ service?: PortalService }>) {
  const [mode, setMode] = useState<'demo' | 'agentcore'>('agentcore');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    service
      .info(controller.signal)
      .then((info) => {
        if (!controller.signal.aborted) setMode(info.mode);
        return service.currentCustomer(controller.signal);
      })
      .then((user) => {
        if (!controller.signal.aborted) setCustomer(user);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && !(err instanceof ApiError && err.status === 401))
          setError('The local API is unavailable. Start npm run api and try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service]);
  const expire = useCallback(() => {
    setCustomer(null);
    setError('Your session expired. Please sign in again.');
  }, []);
  const login = async (email: string, password: string) => {
    setError('');
    try {
      setCustomer(await service.login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
      throw err;
    }
  };
  const logout = async () => {
    try {
      await service.logout();
      setCustomer(null);
      setError('');
    } catch {
      setError('Unable to sign out. Please try again.');
    }
  };
  return (
    <AuthContext.Provider
      value={{ customer, mode, loading, error, service, login, logout, expire }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth requires AuthProvider');
  return auth;
}
