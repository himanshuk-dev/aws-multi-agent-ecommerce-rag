import { useRef } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import type { Order } from '../../services/contracts';
import { ProductArt, formatDate, statusLabels } from './OrderCard';
export function TrackingDialog({
  order,
  onClose,
  onAsk,
}: {
  order: Order | null;
  onClose(): void;
  onAsk(order: Order): void;
}) {
  const pendingQuestion = useRef<Order | null>(null);
  return (
    <Dialog
      open={!!order}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="tracking-title"
      slotProps={{
        transition: {
          onExited: () => {
            const pending = pendingQuestion.current;
            pendingQuestion.current = null;
            if (pending) onAsk(pending);
          },
        },
      }}
    >
      {order && (
        <>
          <DialogTitle id="tracking-title">
            {statusLabels[order.status]}{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}
              · {order.id}
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Stack direction="row" spacing={2} sx={{ my: 2, alignItems: 'center' }}>
              <ProductArt order={order} compact />
              <Box>
                <Typography sx={{ fontWeight: 650 }}>{order.product}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {order.status === 'delivered' ? 'Delivered' : 'Estimated arrival'}{' '}
                  {formatDate(order.deliveryDate)}
                </Typography>
              </Box>
            </Stack>
            <Divider sx={{ my: 3 }} />
            <Stepper
              orientation="vertical"
              activeStep={order.events.filter((event) => event.complete).length - 1}
            >
              {order.events.map((event) => (
                <Step key={event.label} completed={event.complete}>
                  <StepLabel optional={<Typography variant="caption">{event.date}</Typography>}>
                    {event.label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
            <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                DEMO TRACKING REFERENCE
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {order.trackingNumber}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Destination: {order.destination}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Fictional timeline; no carrier or AWS lookup.
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="contained"
              onClick={() => {
                pendingQuestion.current = order;
                onClose();
              }}
            >
              Ask Nova about this order
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
