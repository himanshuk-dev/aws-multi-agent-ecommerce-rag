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

test('live API scopes conversation IDs per authenticated login and does not leak failures', async (t) => {
  const calls = [];
  const provider = {
    mode: 'agentcore',
    authenticate: () => true,
    customer: async () => ({ id: 'CUST-001', name: 'Test customer', tier: 'Premium' }),
    orders: async () => [{ id: 'ORD-REAL' }],
    chat: async (message, sessionId) => {
      calls.push({ message, sessionId });
      if (message === 'fail') throw new Error('SECRET AWS DETAIL');
      return { reply: 'Deployed adapter answer' };
    },
  };
  const { call, login } = await fixture(t, { provider });
  assert.deepEqual(await (await call('/config')).json(), { mode: 'agentcore' });
  assert.equal(
    (await call('/chat', { body: { message: 'hello', sessionId: 'same-session' } })).status,
    401,
  );
  const cookie = await login();
  const chat = (message, auth = cookie) =>
    call('/chat', {
      cookie: auth,
      body: { message, sessionId: 'same-session', customerId: 'CUST-OTHER' },
    });
  assert.equal((await (await chat('hello')).json()).reply, 'Deployed adapter answer');
  await chat('next');
  assert.equal(calls[0].sessionId, calls[1].sessionId);
  const otherCookie = await login();
  await chat('other login', otherCookie);
  assert.notEqual(calls[0].sessionId, calls[2].sessionId);
  assert.notEqual(calls[0].sessionId, 'same-session');
  const failed = await chat('fail');
  assert.equal(failed.status, 502);
  const text = await failed.text();
  assert.ok(!text.includes('SECRET'));
  assert.ok(!text.includes('demo order'));
});

test('live API serializes turns and releases the lock after agent failure', async (t) => {
  let started;
  let reject;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  let attempts = 0;
  const provider = {
    mode: 'agentcore',
    authenticate: () => true,
    customer: async () => ({ id: 'CUST-001' }),
    orders: async () => [],
    chat: async () => {
      if (++attempts === 1) {
        started();
        return new Promise((_resolve, rejectCall) => {
          reject = rejectCall;
        });
      }
      return { reply: 'Recovered' };
    },
  };
  const { call, login } = await fixture(t, { provider });
  const cookie = await login();
  const body = { message: 'hello', sessionId: 'same-session' };
  const first = call('/chat', { cookie, body });
  await entered;
  assert.equal((await call('/chat', { cookie, body })).status, 409);
  reject(new Error('runtime unavailable'));
  assert.equal((await first).status, 502);
  assert.equal((await (await call('/chat', { cookie, body })).json()).reply, 'Recovered');
});

test('test account shortcut is opt-in, local-origin only, and uses normal authentication', async (t) => {
  const disabled = await fixture(t);
  assert.equal((await disabled.call('/test-login', { body: {} })).status, 404);
  let credentialsRead = 0;
  const enabled = await fixture(t, {
    testCredentials: () => {
      credentialsRead++;
      return { email: 'demo@novamart.local', password: 'NovaMartDemo!' };
    },
  });
  assert.equal((await (await enabled.call('/config')).json()).testLogin, true);
  assert.equal((await enabled.call('/test-login', { body: {} })).status, 403);
  assert.equal(
    (
      await enabled.call('/test-login', {
        body: {},
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  assert.equal(credentialsRead, 0);
  const response = await enabled.call('/test-login', {
    body: { customerId: 'forged' },
    headers: { Origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const body = await response.json();
  assert.equal(body.id, 'DEMO-CUSTOMER');
  assert.equal(body.password, undefined);
  const invalid = await fixture(t, {
    testCredentials: () => ({ email: 'demo@novamart.local', password: 'wrong' }),
  });
  assert.equal(
    (await invalid.call('/test-login', { body: {}, headers: { Origin: 'http://127.0.0.1:5173' } }))
      .status,
    401,
  );
});
