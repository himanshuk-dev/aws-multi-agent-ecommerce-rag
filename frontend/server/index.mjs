import { createPortalServer, demoProvider } from './app.mjs';
import { createProjectProvider } from './project-provider.mjs';
const demo = process.argv.includes('--demo');
const provider = demo ? demoProvider : createProjectProvider();
const server = createPortalServer({ provider });
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(3001, '127.0.0.1', () =>
  console.log(
    `NovaMart local API: http://127.0.0.1:3001 (${demo ? 'scripted demo, no AWS calls' : 'deployed AgentCore Runtime; real AWS inference and workflow writes'})`,
  ),
);
