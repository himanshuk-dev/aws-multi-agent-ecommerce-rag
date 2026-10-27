import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../services/portalService';
import { useAuth } from '../auth/AuthProvider';
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
const greeting = (): Message => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  content:
    'Hi, I’m Nova, your demo shopping assistant. I can walk you through your sample orders or explain the project’s return windows. What can I help with?',
});
export function useChat() {
  const { service, expire } = useAuth();
  const [messages, setMessages] = useState<Message[]>([greeting()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sessionId = useRef(crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const send = useCallback(
    async (text: string) => {
      if (inFlight.current || !text.trim() || text.length > 2000) return false;
      inFlight.current = true;
      setBusy(true);
      setError('');
      const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
      setMessages((items) => [...items, userMessage]);
      const request = new AbortController();
      controller.current = request;
      try {
        const reply = await service.chat(userMessage.content, sessionId.current, request.signal);
        if (!request.signal.aborted)
          setMessages((items) => [
            ...items,
            { id: crypto.randomUUID(), role: 'assistant', content: reply.reply },
          ]);
        return true;
      } catch (err) {
        if (!request.signal.aborted) {
          // Roll back the failed turn so the composer can retain it for retry.
          setMessages((items) => items.filter((item) => item.id !== userMessage.id));
          if (err instanceof ApiError && err.status === 401) expire();
          else setError(err instanceof Error ? err.message : 'Unable to send. Please try again.');
        }
        return false;
      } finally {
        inFlight.current = false;
        if (!request.signal.aborted) setBusy(false);
      }
    },
    [service, expire],
  );
  const reset = () => {
    if (inFlight.current) return;
    sessionId.current = crypto.randomUUID();
    setMessages([greeting()]);
    setError('');
  };
  return { messages, busy, error, send, reset };
}
