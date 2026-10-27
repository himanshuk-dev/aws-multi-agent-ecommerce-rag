import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { demoCustomer, demoOrders, demoReply } from './data.mjs';

const DEMO_PASSWORD = 'NovaMartDemo!'; // Public, local-only demo credential; never an AWS password.
const passwordHash = scryptSync(DEMO_PASSWORD, 'novamart-public-demo', 64);
const COOKIE = 'novamart_demo';
const TTL = 30 * 60 * 1000;
const MAX_BODY = 8192;

export function createPortalServer({
  now = Date.now,
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
        body.password.length <= 128 &&
        timingSafeEqual(scryptSync(body.password, 'novamart-public-demo', 64), passwordHash);
      if (
        typeof body.email !== 'string' ||
        body.email.toLowerCase().trim() !== demoCustomer.email ||
        !validPassword
      )
        return send(401, { error: 'Email or password is incorrect.' });
      if (cookie) sessions.delete(cookie);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { expires: instant + TTL, chats: new Map() });
      res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=1800`,
      );
      return send(200, demoCustomer);
    }
    if (path === '/api/logout' && req.method === 'POST') {
      if (cookie) sessions.delete(cookie);
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
      return send(200, { ok: true });
    }
    if (!session) return send(401, { error: 'Your session has expired. Please sign in again.' });
    if (path === '/api/me' && req.method === 'GET') return send(200, demoCustomer);
    if (path === '/api/orders' && req.method === 'GET') return send(200, demoOrders);
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
          error: 'Demo conversation limit reached. Sign out and sign in to reset.',
        });
      window.push(body.message);
      session.chats.set(body.sessionId, window);
      return send(200, { reply: demoReply(body.message), sessionId: body.sessionId });
    }
    return send(404, { error: 'This endpoint does not exist.' });
  });
}
