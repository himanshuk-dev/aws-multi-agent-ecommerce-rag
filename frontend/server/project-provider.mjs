import { spawn } from 'node:child_process';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bridgePath = fileURLToPath(new URL('../../src/portal_bridge.py', import.meta.url));

/** Run the existing Python Runtime adapter. All SDK credentials stay server-side. */
export function runBridge(
  request,
  {
    python = process.env.PORTAL_PYTHON || `${root}.venv/bin/python`,
    script = bridgePath,
    timeout = 180_000,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    let output = '';
    let settled = false;
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            'Project backend unavailable. Check AWS authentication and runtime configuration.',
          ),
        );
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      fail();
    }, timeout);
    child.on('error', () => {
      clearTimeout(timer);
      fail();
    });
    child.stdin.on('error', () => {
      /* close/error determines the request outcome */
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (Buffer.byteLength(output) > 1_000_000) {
        child.kill();
        clearTimeout(timer);
        fail();
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.ok !== true) {
          fail();
          return;
        }
        settled = true;
        resolve(result.data);
      } catch {
        fail();
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export function createProjectProvider({ env = process.env, bridge = runBridge } = {}) {
  const email = env.PORTAL_LOGIN_EMAIL?.trim().toLowerCase();
  const customerId = env.PORTAL_CUSTOMER_ID?.trim();
  const encodedHash = env.PORTAL_PASSWORD_HASH;
  const [salt, hash] = (encodedHash || '').split(':');
  if (
    !email ||
    !customerId ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(hash || '')
  ) {
    throw new Error(
      'Configure PORTAL_LOGIN_EMAIL, PORTAL_CUSTOMER_ID and PORTAL_PASSWORD_HASH in frontend/.portal.env. See npm run setup:account.',
    );
  }
  if (customerId.startsWith('DEMO-'))
    throw new Error('Live mode requires an actual project customer ID.');
  return {
    mode: 'agentcore',
    authenticate(loginEmail, password) {
      const valid = timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
      return loginEmail.toLowerCase().trim() === email && valid;
    },
    customer: () => bridge({ action: 'customer', customerId }),
    orders: () => bridge({ action: 'orders', customerId }),
    chat: (message, sessionId) => bridge({ action: 'chat', customerId, message, sessionId }),
  };
}

export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
