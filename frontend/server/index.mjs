import { createPortalServer } from './app.mjs';
const server = createPortalServer();
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(3001, '127.0.0.1', () =>
  console.log('NovaMart local demo API: http://127.0.0.1:3001 (no AWS calls)'),
);
