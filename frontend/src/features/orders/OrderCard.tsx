import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import {
  ArrowForward,
  CheckCircleOutlined,
  HeadphonesOutlined,
  LocalShippingOutlined,
  SpeakerOutlined,
} from '@mui/icons-material';
import type { Order } from '../../services/contracts';
export const statusLabels = {
  in_transit: 'On the way',
  delivered: 'Delivered',
  return_requested: 'Return requested',
};
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z'),
  );
export const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
export function ProductArt({ order, compact = false }: { order: Order; compact?: boolean }) {
  const Icon = order.product.includes('Headphone') ? HeadphonesOutlined : SpeakerOutlined;
  return (
    <Box
      aria-hidden
      sx={{
        width: compact ? 58 : 88,
        height: compact ? 58 : 88,
        flexShrink: 0,
        borderRadius: '16px',
        bgcolor: order.status === 'in_transit' ? '#e7ebdf' : '#ece8e2',
        display: 'grid',
        placeItems: 'center',
        color: '#476255',
      }}
    >
      <Icon sx={{ fontSize: compact ? 30 : 49, filter: 'drop-shadow(0 5px 3px #244f4320)' }} />
    </Box>
  );
}
export function OrderCard({
  order,
  onTrack,
  onAsk,
}: {
  order: Order;
  onTrack(order: Order): void;
  onAsk(order: Order): void;
}) {
  return (
    <Paper component="article" variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2.5, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {order.id}{' '}
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 400 }}>
            {' '}
            · Placed {formatDate(order.placedAt)}
          </Box>
        </Typography>
        <Chip
          size="small"
          label={statusLabels[order.status]}
          icon={order.status === 'delivered' ? <CheckCircleOutlined /> : <LocalShippingOutlined />}
          sx={{
            bgcolor: order.status === 'delivered' ? '#f0f2eb' : '#e8f0e0',
            color: 'primary.main',
            fontSize: 11,
            '& .MuiChip-icon': { color: 'inherit', fontSize: 15 },
          }}
        />
      </Stack>
      <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center' }}>
        <ProductArt order={order} />
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" sx={{ fontSize: 16, fontWeight: 650 }}>
            {order.product}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Qty {order.quantity} · {formatMoney(order.price)}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
            {order.status === 'delivered' ? 'Delivered' : 'Estimated delivery'}{' '}
            {formatDate(order.deliveryDate)}
          </Typography>
        </Box>
      </Stack>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Button
          size="small"
          variant={order.status === 'in_transit' ? 'contained' : 'outlined'}
          onClick={() => onTrack(order)}
          endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
        >
          {order.status === 'in_transit' ? 'Track order' : 'View details'}
        </Button>
        <Button size="small" onClick={() => onAsk(order)}>
          Ask about this order
        </Button>
      </Stack>
    </Paper>
  );
}
