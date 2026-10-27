import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalServer } from './app.mjs';
async function fixture(t, options = {}) {
  const server = createPortalServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { cookie, body, ...options } = {}) =>
    fetch(url + '/api' + path, {
      ...options,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...options.headers,
      },
      ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
  const login = async () => {
    const response = await call('/login', {
      body: { email: 'demo@novamart.local', password: 'NovaMartDemo!' },
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { call, login };
}
test('requires authentication and ignores forged customer IDs', async (t) => {
  const { call, login } = await fixture(t);
  assert.equal((await call('/orders')).status, 401);
  assert.equal(
    (await call('/login', { body: { email: 'wrong@local', password: 'wrong' } })).status,
    401,
  );
  const cookie = await login();
  assert.equal((await (await call('/me', { cookie })).json()).id, 'DEMO-CUSTOMER');
  const orders = await (await call('/orders?customer_id=CUST-001', { cookie })).json();
  assert.ok(orders.every((o) => o.id.startsWith('DEMO-')));
  assert.equal(orders.length, 2);
});
test('rotates sessions and clears server authorization on logout', async (t) => {
  const { call, login } = await fixture(t);
  const cookie = await login();
  const response = await call('/login', {
    cookie,
    body: { email: 'demo@novamart.local', password: 'NovaMartDemo!' },
  });
  const next = response.headers.get('set-cookie');
  assert.match(next, /HttpOnly; SameSite=Strict/);
  assert.notEqual(next.split(';')[0], cookie);
  assert.equal((await call('/me', { cookie })).status, 401);
  await call('/logout', { cookie: next.split(';')[0], body: {} });
  assert.equal((await call('/orders', { cookie: next.split(';')[0] })).status, 401);
});
test('rejects cross-origin writes, malformed bodies, and oversized requests', async (t) => {
  const { call } = await fixture(t);
  assert.equal(
    (await call('/login', { body: {}, headers: { Origin: 'https://untrusted.example' } })).status,
    403,
  );
  assert.equal((await call('/login', { body: [] })).status, 400);
  assert.equal((await call('/login', { body: { password: 'x'.repeat(9000) } })).status, 413);
});
test('expires sessions after thirty minutes', async (t) => {
  let time = 100;
  const { call, login } = await fixture(t, { now: () => time });
  const cookie = await login();
  time += 30 * 60 * 1000;
  assert.equal((await call('/me', { cookie })).status, 401);
});
test('chat is a bounded local simulation and never initiates a real return', async (t) => {
  const { call, login } = await fixture(t);
  const cookie = await login();
  const chat = (message, sessionId = 'test-session') =>
    call('/chat', { cookie, body: { message, sessionId } });
  assert.equal((await chat('')).status, 400);
  assert.equal((await chat('hello', '../bad')).status, 400);
  const reply = await (await chat('Where is DEMO-1042?')).json();
  assert.match(reply.reply, /on the way/);
  assert.equal(reply.sessionId, 'test-session');
  assert.match(
    (await (await chat('Return DEMO-1038')).json()).reply,
    /cannot evaluate actual eligibility, create a return, or issue a refund/,
  );
  assert.match((await (await chat('Track ORD-12142')).json()).reply, /No real order lookup/);
});
test('limits login attempts and resets after a minute', async (t) => {
  let time = 0;
  const { call } = await fixture(t, { now: () => time });
  for (let i = 0; i < 10; i++) await call('/login', { body: { email: 'bad', password: 'bad' } });
  assert.equal((await call('/login', { body: {} })).status, 429);
  time += 60_000;
  assert.equal((await call('/login', { body: {} })).status, 401);
});
