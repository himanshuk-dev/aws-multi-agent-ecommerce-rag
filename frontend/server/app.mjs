import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { demoCustomer, demoOrders, demoReply } from './data.mjs';

const DEMO_PASSWORD = 'NovaMartDemo!'; // Public, local-only demo credential; never an AWS password.
const passwordHash = scryptSync(DEMO_PASSWORD, 'novamart-public-demo', 64);
const COOKIE = 'novamart_demo';
const TTL = 30 * 60 * 1000;
const MAX_BODY = 8192;
export const demoProvider = {
  mode: 'demo',
  authenticate: (email, password) =>
    email.toLowerCase().trim() === demoCustomer.email &&
    timingSafeEqual(scryptSync(password, 'novamart-public-demo', 64), passwordHash),
  customer: async () => ({ ...demoCustomer, mode: 'demo' }),
  orders: async () => demoOrders,
  chat: async (message, sessionId) => ({ reply: demoReply(message), sessionId }),
};

export function createPortalServer({
  now = Date.now,
  provider = demoProvider,
  allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'],
} = {}) {
  const sessions = new Map();
  const attempts = new Map();
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    // Requests originate from the same-origin Vite proxy. No cross-origin API access.
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin))
      return send(403, { error: 'Origin is not allowed.' });
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const cookie = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1);
    const instant = now();
    for (const [key, session] of sessions) if (session.expires <= instant) sessions.delete(key);
    for (const [key, attempt] of attempts) if (attempt.reset <= instant) attempts.delete(key);
    const session = sessions.get(cookie);
    if (path === '/api/config' && req.method === 'GET') return send(200, { mode: provider.mode });
    let body = {};
    if (req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json'))
        return send(415, { error: 'JSON content is required.' });
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_BODY) {
            send(413, { error: 'Request is too large.' });
            return;
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString());
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      } catch {
        return send(400, { error: 'Invalid JSON request.' });
      }
    }
    if (path === '/api/login' && req.method === 'POST') {
      const key = req.socket.remoteAddress;
      const attempt = attempts.get(key) ?? { count: 0, reset: instant + 60_000 };
      if (attempt.count >= 10)
        return send(429, { error: 'Too many attempts. Try again in a minute.' });
      attempt.count++;
      attempts.set(key, attempt);
      const validPassword =
        typeof body.password === 'string' &&
        body.password.length > 0 &&
        body.password.length <= 128 &&
        typeof body.email === 'string' &&
        body.email.length <= 254 &&
        provider.authenticate(body.email, body.password);
      if (!validPassword) return send(401, { error: 'Email or password is incorrect.' });
      let customer;
      try {
        customer = await provider.customer();
      } catch {
        return send(503, {
          error:
            'Unable to load the project customer. Check AWS authentication and the server customer mapping.',
        });
      }
      if (cookie) sessions.delete(cookie);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, {
        expires: instant + TTL,
        chats: new Map(),
        customer,
        scope: randomBytes(16).toString('hex'),
        busy: new Set(),
      });
      res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=1800`,
      );
      return send(200, customer);
    }
    if (path === '/api/logout' && req.method === 'POST') {
      if (cookie) sessions.delete(cookie);
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
      return send(200, { ok: true });
    }
    if (!session) return send(401, { error: 'Your session has expired. Please sign in again.' });
    if (path === '/api/me' && req.method === 'GET') return send(200, session.customer);
    if (path === '/api/orders' && req.method === 'GET') {
      try {
        return send(200, await provider.orders());
      } catch {
        return send(503, {
          error: 'Unable to load orders from the project. Check local AWS authentication.',
        });
      }
    }
    if (path === '/api/chat' && req.method === 'POST') {
      if (
        typeof body.message !== 'string' ||
        !body.message.trim() ||
        body.message.length > 2000 ||
        typeof body.sessionId !== 'string' ||
        !/^[a-zA-Z0-9-]{8,100}$/.test(body.sessionId)
      )
        return send(400, {
          error: 'Provide a message (1–2,000 characters) and a valid session ID.',
        });
      const window = session.chats.get(body.sessionId) ?? [];
      if (window.length >= 50 || (session.chats.size >= 20 && !session.chats.has(body.sessionId)))
        return send(429, {
          error: 'Conversation limit reached. Sign out and sign in to reset.',
        });
      if (session.busy.has(body.sessionId))
        return send(409, { error: 'This conversation already has a request in progress.' });
      // Serialize turns and scope the Runtime/WorkflowState session to the server
      // login. A browser cannot reuse another login's workflow by forging an ID.
      session.busy.add(body.sessionId);
      session.chats.set(body.sessionId, window);
      try {
        const result = await provider.chat(
          body.message.trim(),
          `${session.scope}-${body.sessionId}`,
        );
        window.push(body.message);
        return send(200, { reply: result.reply, sessionId: body.sessionId });
      } catch {
        // Never substitute a fabricated/demo reply when the live agent fails.
        return send(502, {
          error:
            'The agent could not complete this request. Check AWS authentication and runtime availability before retrying.',
        });
      } finally {
        session.busy.delete(body.sessionId);
      }
    }
    return send(404, { error: 'This endpoint does not exist.' });
  });
}
