import { readFileSync } from 'node:fs';
import { createPortalServer, demoProvider } from './app.mjs';
import { createProjectProvider } from './project-provider.mjs';
const demo = process.argv.includes('--demo');
const provider = demo ? demoProvider : createProjectProvider();
// Explicit local-only convenience: authenticate normally without sending the password to the UI.
const testCredentials =
  !demo && process.argv.includes('--test-login') && process.env.NODE_ENV !== 'production'
    ? () => ({
        email: process.env.PORTAL_LOGIN_EMAIL,
        password: readFileSync(new URL('../.portal-password', import.meta.url), 'utf8').trim(),
      })
    : undefined;
const server = createPortalServer({ provider, testCredentials });
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(3001, '127.0.0.1', () =>
  console.log(
    `NovaMart local API: http://127.0.0.1:3001 (${demo ? 'scripted demo, no AWS calls' : 'deployed AgentCore Runtime; real AWS inference and workflow writes'})`,
  ),
);
