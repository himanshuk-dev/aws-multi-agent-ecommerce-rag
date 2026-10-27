import { useCallback, useEffect, useState } from 'react';
import type { Order } from '../../services/contracts';
import { ApiError } from '../../services/portalService';
import { useAuth } from '../auth/AuthProvider';
export function useOrders() {
  const { service, expire } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    service
      .orders(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setOrders(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) expire();
        else setError('We couldn’t load your orders. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, expire, revision]);
  return { orders, loading, error, reload };
}
