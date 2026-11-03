import type { ChatReply, Customer, Order, PortalService } from './contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(body?.error ?? 'Unable to connect. Please try again.', response.status);
  return body as T;
}
/** Cookie-authenticated API adapter. No AWS configuration or keys enter the browser. */
export const portalService: PortalService = {
  info: (signal) =>
    request<{ mode: 'demo' | 'agentcore'; testLogin?: boolean }>('/config', { signal }),
  currentCustomer: (signal) => request<Customer>('/me', { signal }),
  login: (email, password) =>
    request<Customer>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  loginTestAccount: () => request<Customer>('/test-login', { method: 'POST', body: '{}' }),
  logout: () => request<void>('/logout', { method: 'POST', body: '{}' }),
  orders: (signal) => request<Order[]>('/orders', { signal }),
  chat: (message, sessionId, signal) =>
    request<ChatReply>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
      signal,
    }),
};
