import { describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { App } from '../src/app/App';
import { theme } from '../src/app/theme';
import type { Customer, Order, PortalService } from '../src/services/contracts';
import { ApiError } from '../src/services/portalService';
const customer: Customer = {
  id: 'test-customer',
  name: 'Alex Morgan',
  email: 'demo@novamart.local',
  tier: 'Premium',
};
const orders: Order[] = [
  {
    id: 'DEMO-1042',
    product: 'Wireless Headphones Pro',
    category: 'Audio',
    quantity: 1,
    price: 149.99,
    status: 'in_transit',
    placedAt: '2026-10-24',
    deliveryDate: '2026-10-28',
    trackingNumber: 'DEMO-TRACK-1042',
    destination: 'Vancouver, BC',
    events: [
      { label: 'On the way', date: 'Oct 26', complete: true },
      { label: 'Delivered', date: 'Estimated Oct 28', complete: false },
    ],
  },
];
function service(overrides: Partial<PortalService> = {}): PortalService {
  return {
    currentCustomer: vi.fn().mockRejectedValue(new ApiError('Sign in', 401)),
    login: vi.fn().mockResolvedValue(customer),
    logout: vi.fn().mockResolvedValue(undefined),
    orders: vi.fn().mockResolvedValue(orders),
    chat: vi
      .fn()
      .mockResolvedValue({ reply: 'Your demo order is on the way.', sessionId: 'test-session' }),
    ...overrides,
  };
}
function mount(api: PortalService) {
  return render(
    <ThemeProvider theme={theme}>
      <App service={api} />
    </ThemeProvider>,
  );
}
async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Welcome back.' });
  await user.click(screen.getByRole('button', { name: /Fill demo credentials/ }));
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}
describe('customer portal', () => {
  it('opens in StrictMode even when browser scrolling returns a Promise', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => Promise.resolve());
    const api = service({ currentCustomer: vi.fn().mockResolvedValue(customer) });
    render(
      <StrictMode>
        <ThemeProvider theme={theme}>
          <App service={api} />
        </ThemeProvider>
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Hello, Alex.' });
    expect(
      screen.queryByText('Something went wrong displaying the portal.'),
    ).not.toBeInTheDocument();
  });

  it('signs in, tracks a demo order, sends contextual chat, and signs out', async () => {
    const api = service();
    const user = userEvent.setup();
    mount(api);
    await signIn(user);
    await screen.findByRole('heading', { name: 'Hello, Alex.' });
    expect(api.login).toHaveBeenCalledWith('demo@novamart.local', 'NovaMartDemo!');
    await user.click(await screen.findByRole('button', { name: 'Track order' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('DEMO-TRACK-1042')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ask Nova about this order' }));
    const composer = await screen.findByRole('textbox', { name: 'Message Nova' });
    await waitFor(() =>
      expect(composer).toHaveValue('Where is my Wireless Headphones Pro order DEMO-1042?'),
    );
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Your demo order is on the way.');
    expect(api.chat).toHaveBeenCalledWith(
      'Where is my Wireless Headphones Pro order DEMO-1042?',
      expect.any(String),
      expect.any(AbortSignal),
    );
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    await screen.findByRole('heading', { name: 'Welcome back.' });
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });
  it('shows invalid login errors without exposing the customer dashboard', async () => {
    const user = userEvent.setup();
    mount(
      service({
        login: vi.fn().mockRejectedValue(new ApiError('Email or password is incorrect.', 401)),
      }),
    );
    await signIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.queryByRole('heading', { name: 'Hello, Alex.' })).not.toBeInTheDocument();
  });
  it('retains a failed message for retry and uses a stable session across turns', async () => {
    const chat = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection interrupted.'))
      .mockImplementation(async (_message, sessionId) => ({ reply: 'Demo reply', sessionId }));
    const user = userEvent.setup();
    mount(service({ currentCustomer: vi.fn().mockResolvedValue(customer), chat }));
    const composer = await screen.findByRole('textbox', { name: 'Message Nova' });
    await user.type(composer, 'Track DEMO-1042');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Connection interrupted.');
    expect(composer).toHaveValue('Track DEMO-1042');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Demo reply');
    expect(chat.mock.calls[0][1]).toBe(chat.mock.calls[1][1]);
    expect(composer).toHaveValue('');
  });
  it('searches orders, shows the empty state, and recovers an order loading failure', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(orders);
    const user = userEvent.setup();
    mount(service({ currentCustomer: vi.fn().mockResolvedValue(customer), orders: list }));
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Wireless Headphones Pro' });
    await user.click(screen.getByRole('button', { name: /My orders/ }));
    const search = screen.getByRole('textbox', { name: 'Search your orders' });
    await user.type(search, 'missing-order');
    await screen.findByText('No matching orders');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('heading', { name: 'Wireless Headphones Pro' })).toBeInTheDocument();
  });
  it('expires authentication when the orders endpoint rejects a session', async () => {
    mount(
      service({
        currentCustomer: vi.fn().mockResolvedValue(customer),
        orders: vi.fn().mockRejectedValue(new ApiError('Expired', 401)),
      }),
    );
    await screen.findByRole('heading', { name: 'Welcome back.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Your session expired.');
  });
  it('prevents duplicate sends and starts a fresh conversation only when idle', async () => {
    let finish!: (value: { reply: string; sessionId: string }) => void;
    const chat = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    mount(service({ currentCustomer: vi.fn().mockResolvedValue(customer), chat }));
    await user.type(await screen.findByRole('textbox', { name: 'Message Nova' }), 'hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start a new conversation' })).toBeDisabled();
    finish({ reply: 'Welcome!', sessionId: 'server-session' });
    await screen.findByText('Welcome!');
    await user.click(screen.getByRole('button', { name: 'Start a new conversation' }));
    await waitFor(() => expect(screen.queryByText('Welcome!')).not.toBeInTheDocument());
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
