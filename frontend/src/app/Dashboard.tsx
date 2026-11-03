import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowForward,
  AutoAwesomeOutlined,
  ExpandMore,
  Inventory2Outlined,
  LocalShippingOutlined,
  Search,
  ShieldOutlined,
  TaskAltOutlined,
} from '@mui/icons-material';
import { AppShell } from '../components/AppShell';
import type { PortalView } from '../components/AppShell';
import { useAuth } from '../features/auth/AuthProvider';
import { ChatPanel } from '../features/chat/ChatPanel';
import { useOrders } from '../features/orders/useOrders';
import { OrderCard } from '../features/orders/OrderCard';
import { TrackingDialog } from '../features/orders/TrackingDialog';
import type { Order } from '../services/contracts';
const faqs = [
  {
    question: 'What does Premium membership include?',
    answer:
      'The project’s Premium return window is 60 days, compared with 30 days for Standard members. Actual eligibility and other benefits require verified policy and order information. Ask the deployed agent to verify your membership and applicable policy.',
  },
  {
    question: 'How do I track my order?',
    answer:
      'Choose an order to see its recorded details, or ask Nova about the order number. Carrier event history is not recorded in the project Orders table; dates may be estimates.',
  },
  {
    question: 'Can I create a return here?',
    answer:
      'The project agent can evaluate a return request using its existing tools and policies. The current return tool validates requests without processing payments.',
  },
];
export function Dashboard() {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { customer, error: authError, mode } = useAuth();
  const { orders, loading, error, reload } = useOrders();
  const [view, setView] = useState<PortalView>('overview');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [draft, setDraft] = useState<{ text: string; key: number } | null>(null);
  const chatAnchor = useRef<HTMLDivElement>(null);
  const clearDraft = useCallback(() => setDraft(null), []);
  const ask = (text: string) => {
    setDraft({ text, key: Date.now() });
    chatAnchor.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };
  const onAsk = (order: Order) => ask(`Where is my ${order.product} order ${order.id}?`);
  const filtered =
    view === 'orders'
      ? orders.filter((order) =>
          `${order.id} ${order.product}`.toLowerCase().includes(query.toLowerCase().trim()),
        )
      : orders;
  const inTransit = orders.filter(
    (order) => order.status === 'in_transit' || order.status === 'shipped',
  ).length;
  const delivered = orders.filter((order) => order.status === 'delivered').length;
  return (
    <AppShell view={view} onNavigate={setView}>
      {authError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {authError}
        </Alert>
      )}
      <Stack
        direction="row"
        sx={{ mb: 3.5, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ fontSize: 10, letterSpacing: 2 }}
            color="text.secondary"
          >
            A GOOD DAY TO FEEL TAKEN CARE OF
          </Typography>
          <Typography component="h1" variant="h1" sx={{ fontSize: { xs: 30, lg: 38 }, mt: 0.5 }}>
            {view === 'overview'
              ? `Hello, ${customer?.name.split(' ')[0]}.`
              : view === 'orders'
                ? 'Your orders, at a glance.'
                : 'We’re here to help.'}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            {view === 'support'
              ? 'A little clarity goes a long way. Let’s find your answer.'
              : 'A quick look at your orders. A little help whenever you need it.'}
          </Typography>
        </Box>
        <Chip
          label={`${customer?.tier} member`}
          sx={{
            display: { xs: 'none', sm: 'flex' },
            bgcolor: '#e6ecd5',
            color: '#53663e',
            fontSize: 11,
          }}
          icon={
            <AutoAwesomeOutlined
              sx={{ fontSize: '16px !important', color: '#738456 !important' }}
            />
          }
        />
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.25fr) minmax(340px, .85fr)' },
          gap: 3.5,
          alignItems: 'start',
        }}
      >
        <Stack spacing={3.5}>
          {view === 'overview' && (
            <>
              <Paper
                sx={{
                  bgcolor: 'primary.dark',
                  color: '#fff',
                  p: { xs: 3, sm: 3.5 },
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ position: 'relative', zIndex: 1, maxWidth: '78%' }}>
                  <Stack direction="row" spacing={0.7} sx={{ mb: 2, alignItems: 'center' }}>
                    <Box sx={{ width: 6, height: 6, bgcolor: '#c8edb4', borderRadius: '50%' }} />
                    <Typography
                      variant="caption"
                      color="#c8edb4"
                      sx={{ fontSize: 10, letterSpacing: 1 }}
                    >
                      YOUR EVERYDAY SUPPORT, SIMPLIFIED
                    </Typography>
                  </Stack>
                  <Typography
                    component="h2"
                    variant="h3"
                    sx={{ fontSize: { xs: 25, sm: 30 }, lineHeight: 1.25 }}
                  >
                    Less wondering.
                    <br />
                    More knowing.
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#bed0c4', mt: 1.5, lineHeight: 1.8 }}>
                    Your next delivery is a conversation away.
                  </Typography>
                  <Button
                    variant="contained"
                    sx={{
                      bgcolor: '#d8e8bd',
                      color: 'primary.dark',
                      mt: 2.5,
                      fontSize: 12,
                      '&:hover': { bgcolor: '#c7dda4' },
                    }}
                    endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
                    onClick={() =>
                      ask(
                        mode === 'demo'
                          ? 'Where is my order DEMO-1042?'
                          : 'Please show my orders and their current status.',
                      )
                    }
                  >
                    Ask Nova about an order
                  </Button>
                </Box>
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    right: -35,
                    top: 35,
                    width: 190,
                    height: 190,
                    border: '1px solid #a8c89d40',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 0 0 35px #c8edb408, 0 0 0 70px #c8edb405',
                    transform: 'rotate(-12deg)',
                  }}
                >
                  <LocalShippingOutlined sx={{ color: '#d8e8bd', fontSize: 75, opacity: 0.8 }} />
                </Box>
              </Paper>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                {[
                  { label: 'Total orders', value: orders.length, icon: Inventory2Outlined },
                  { label: 'On the way', value: inTransit, icon: LocalShippingOutlined },
                  { label: 'Delivered', value: delivered, icon: TaskAltOutlined },
                ].map(({ label, value, icon: Icon }) => (
                  <Paper variant="outlined" key={label} sx={{ p: { xs: 1.5, sm: 2.25 } }}>
                    <Icon sx={{ fontSize: 19, color: '#7b8e75', mb: 1 }} />
                    <Typography sx={{ fontSize: 25, fontWeight: 650, lineHeight: 1.2 }}>
                      {loading || error ? '—' : String(value).padStart(2, '0')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      {label}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </>
          )}
          {view !== 'support' && (
            <Box component="section" aria-labelledby="orders-title">
              <Stack
                direction="row"
                sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Typography id="orders-title" component="h2" sx={{ fontWeight: 650, fontSize: 19 }}>
                  {view === 'overview' ? 'Recent orders' : 'My orders'}
                </Typography>
                {view === 'overview' && (
                  <Button
                    size="small"
                    endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
                    onClick={() => setView('orders')}
                    sx={{ fontSize: 11 }}
                  >
                    View all orders
                  </Button>
                )}
              </Stack>
              {view === 'orders' && (
                <TextField
                  label="Search your orders"
                  placeholder="Order number or product"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ fontSize: 'small' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
              {loading ? (
                <Stack spacing={2}>
                  <Skeleton variant="rounded" height={230} />
                  <Skeleton variant="rounded" height={230} />
                </Stack>
              ) : error ? (
                <Alert
                  severity="error"
                  action={
                    <Button color="inherit" size="small" onClick={reload}>
                      Retry
                    </Button>
                  }
                >
                  {error}
                </Alert>
              ) : (
                <Stack spacing={2}>
                  {filtered.length ? (
                    filtered.map((order) => (
                      <OrderCard key={order.id} order={order} onTrack={setSelected} onAsk={onAsk} />
                    ))
                  ) : (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                      <Inventory2Outlined color="disabled" />
                      <Typography sx={{ mt: 1 }}>No matching orders</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Try a different order number or product name.
                      </Typography>
                      {query && (
                        <Button sx={{ mt: 1 }} onClick={() => setQuery('')}>
                          Clear search
                        </Button>
                      )}
                    </Paper>
                  )}
                </Stack>
              )}
            </Box>
          )}
          {view === 'support' && (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography component="h2" variant="h3" sx={{ mb: 2, fontSize: 23 }}>
                A few helpful answers
              </Typography>
              {faqs.map((faq) => (
                <Accordion
                  key={faq.question}
                  disableGutters
                  elevation={0}
                  sx={{
                    '&:before': { display: 'none' },
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{faq.question}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                      {faq.answer}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
              <Button
                sx={{ mt: 2 }}
                onClick={() => ask('What is the return window?')}
                endIcon={<ArrowForward />}
              >
                Ask Nova about returns
              </Button>
            </Paper>
          )}
          <Stack direction="row" spacing={1} sx={{ px: 1, alignItems: 'flex-start' }}>
            <ShieldOutlined sx={{ fontSize: 17, color: '#899681', mt: 0.2 }} />
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              {mode === 'demo'
                ? 'You’re exploring a local portfolio demo. Orders and delivery dates are fictional. No AWS services are called, and no orders or refunds are changed.'
                : 'Connected to your deployed NovaMart agent. Orders are read from the project database. Chat invokes AWS models and may write workflow state. Carrier history and conversation recall are not integrated.'}
            </Typography>
          </Stack>
        </Stack>
        <Box ref={chatAnchor} sx={{ minWidth: 0 }}>
          <ChatPanel draft={draft} onDraftConsumed={clearDraft} />
        </Box>
      </Box>
      <TrackingDialog order={selected} onClose={() => setSelected(null)} onAsk={onAsk} />
      <Typography
        component="footer"
        variant="caption"
        sx={{ mt: 5, color: '#829080', fontSize: 10 }}
      >
        NOVAMART CUSTOMER CARE{' '}
        <Box component="span" sx={{ mx: 1 }}>
          ·
        </Box>{' '}
        Thoughtful shopping. Thoughtful support.
      </Typography>
    </AppShell>
  );
}
