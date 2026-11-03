import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectProvider, passwordHash } from './project-provider.mjs';
const env = {
  PORTAL_LOGIN_EMAIL: 'owner@example.com',
  PORTAL_CUSTOMER_ID: 'CUST-001',
  PORTAL_PASSWORD_HASH: passwordHash('private-test-password'),
};
test('live provider requires private credentials and never accepts the public demo login', () => {
  assert.throws(() => createProjectProvider({ env: {} }), /Configure PORTAL_LOGIN_EMAIL/);
  const provider = createProjectProvider({ env, bridge: async () => ({}) });
  assert.equal(provider.authenticate('owner@example.com', 'private-test-password'), true);
  assert.equal(provider.authenticate('demo@novamart.local', 'NovaMartDemo!'), false);
  assert.equal(provider.authenticate('owner@example.com', 'wrong'), false);
});
test('maps every bridge operation to the configured customer and forwards actual agent text', async () => {
  const calls = [];
  const provider = createProjectProvider({
    env,
    bridge: async (request) => {
      calls.push(request);
      return request.action === 'chat'
        ? { reply: 'Real adapter response', sessionId: request.sessionId }
        : {};
    },
  });
  await provider.customer();
  await provider.orders();
  const result = await provider.chat('Track ORD-12142', 'scoped-session');
  assert.equal(result.reply, 'Real adapter response');
  assert.deepEqual(calls, [
    { action: 'customer', customerId: 'CUST-001' },
    { action: 'orders', customerId: 'CUST-001' },
    {
      action: 'chat',
      customerId: 'CUST-001',
      message: 'Track ORD-12142',
      sessionId: 'scoped-session',
    },
  ]);
});
test('propagates runtime failure instead of returning a scripted answer', async () => {
  const provider = createProjectProvider({
    env,
    bridge: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(provider.chat('Where is my order?', 'scoped-session'), /offline/);
});

test('subprocess adapter validates its JSON protocol, timeouts, and output bounds', async (t) => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runBridge } = await import('./project-provider.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'novamart-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, 'fixture.mjs');
  await writeFile(
    script,
    `let input=''; for await (const chunk of process.stdin) input+=chunk; const r=JSON.parse(input); if(r.action==='timeout') { setInterval(()=>{},1000); await new Promise(()=>{}); } else if(r.action==='bad') console.log('not JSON'); else if(r.action==='large') console.log('x'.repeat(1000001)); else console.log(JSON.stringify({ok:true,data:{reply:'Réponse — verified', sessionId:r.sessionId}}));`,
  );
  const options = { python: process.execPath, script, timeout: 1000 };
  assert.deepEqual(await runBridge({ action: 'chat', sessionId: 'server-session' }, options), {
    reply: 'Réponse — verified',
    sessionId: 'server-session',
  });
  for (const action of ['bad', 'large', 'timeout']) {
    await assert.rejects(
      runBridge({ action }, { ...options, timeout: 100 }),
      /Project backend unavailable/,
    );
  }
  await assert.rejects(
    runBridge({}, { python: join(directory, 'missing-python'), timeout: 100 }),
    /Project backend unavailable/,
  );
});
