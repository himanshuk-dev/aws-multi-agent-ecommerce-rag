# NovaMart customer portal

A local React + TypeScript + Material UI extension of the submitted NovaMart agent project. Sign in, browse and search orders, open shipment timelines, and ask Nova about an order in a responsive customer-care workspace.

**This version is a local demonstration.** It does not call the deployed AgentCore Runtime, Bedrock, Cognito, DynamoDB, or any AWS API. Nova uses scripted responses over explicitly fictional `DEMO-*` orders, not live model inference. It cannot create returns, issue refunds, or change an AWS order. Fixed October 2026 delivery dates are sample timelines, not current delivery promises.

## Preview

![NovaMart desktop customer portal](docs/portal-overview.jpg)

[Mobile portal preview](docs/portal-mobile.jpg) · Captured from the local fictional demo.

## Run locally

Use Node.js 22.12+ (tested with Node 24.6) and npm. From the repository root:

```bash
cd frontend
npm ci
```

Start the local API in one terminal:

```bash
npm run api
```

Start the frontend in a second terminal:

```bash
npm run dev -- --strictPort
```

Open **http://127.0.0.1:5173**. The API binds to **127.0.0.1:3001**. Vite proxies `/api` to that loopback address. Keep port 5173, or explicitly update the API's allowed origins when changing the frontend port.

Use **Fill demo credentials** on the login screen, then **Sign in**:

- Email: `demo@novamart.local`
- Password: `NovaMartDemo!`

These are public demonstration credentials, not AWS credentials or a real customer account. No `.env` is needed. The root project's `.env` is not imported or copied into the frontend bundle. Never put AWS secrets into `VITE_*` variables: those values become public browser code.

## Explore

1. Sign in and choose **Track order** on the headphones card.
2. Review the fictional timeline, then choose **Ask Nova about this order**.
3. The question is placed in the chat composer for review; press Send to submit it.
4. Open **My orders** to search by product or order number.
5. Open **Help & support** for project return-window information and demo limitations.
6. Start a new conversation or sign out to clear the visible chat.

The frontend handles loading, empty order results, failed sign-in, expired sessions, API errors, chat retries, duplicate-send prevention, and reduced-motion preferences. Chat displays plain text rather than interpreting model or customer text as HTML.

## Structure and design decisions

```text
src/
  app/                 # Composition root, theme, responsive dashboard, error boundary
  components/          # Shared brand and application shell
  features/
    auth/              # Authentication context, login view
    orders/            # Order query hook, reusable cards, tracking dialog
    chat/              # Conversation hook and chat view
  services/
    contracts.ts       # Customer, Order, PortalService contracts
    portalService.ts   # Same-origin HTTP adapter
server/
  app.mjs              # Loopback API, session authentication, validation
  data.mjs             # Fictional records and scripted assistant behavior
  index.mjs            # Process entry point
  app.test.mjs         # HTTP authorization and validation tests
```

The feature folders keep customer workflows separate. Hooks own asynchronous feature state; components render it. `PortalService` is the application port: the HTTP adapter implements it, and tests inject a fake service through `AuthProvider`. This keeps transport and AWS details out of the views. Shared Material UI theme tokens control colors, typography, and component styling. The authenticated dashboard is loaded lazily.

The local API derives its demo identity from its server-side session. It does not trust a customer ID sent by the browser. Session IDs are opaque random values carried in HttpOnly, SameSite=Strict cookies, with 30-minute expiry and invalidation on sign-out. The server rejects unapproved browser origins, limits request sizes and login attempts, validates chat payloads, and bounds demo conversations. No authentication tokens or conversations are saved in localStorage. Visible chat is discarded on reload or sign-out. All server sessions disappear when the API restarts.

This intentionally small in-memory server is **not production authentication**: it has one shared public account, no real identity verification, no registration/recovery, and no durable customer data. Its cookie omits `Secure` only because the loopback demo uses HTTP. Do not expose either development server publicly or use these credentials/session settings for real customers.

## HTTP contract

| Route | Purpose |
|---|---|
| `POST /api/login` | Accept `{email, password}`, issue a local session cookie, return `Customer`. |
| `GET /api/me` | Return the authenticated customer; 401 when absent/expired. |
| `POST /api/logout` | Invalidate the session and expire the cookie. |
| `GET /api/orders` | Return orders belonging to the server-derived demo identity. |
| `POST /api/chat` | Accept `{message, sessionId}`, return `{reply, sessionId}`. |

Errors use `{error: string}` with an appropriate non-2xx status. Chat messages are limited to 2,000 characters. The browser session ID groups conversation turns; it is not an authorization credential. The server session remains the authorization boundary.

A future real-agent connection belongs behind this API boundary. It must authenticate real users, map the trusted identity to an authorized customer on the server, enforce order and session ownership, and keep any AWS SDK credentials server-side. Replace the demo handlers and fixtures; preserve `PortalService` so the UI stays unchanged. No such live integration or AWS infrastructure is provisioned by this frontend.

## Verification

```bash
npm test                 # UI workflows with an injected fake service; no network
npm run test:api          # Local HTTP tests; binds ephemeral loopback ports
npm run build             # TypeScript checks and production bundle
npm run format:check      # Formatting consistency
npm audit                 # Dependency vulnerability report (requires registry access)
```

`npm run preview` serves the static production build; it does not supply the API proxy or a production backend. Use the development commands above for the full local demo. Hosting the build later requires a same-origin backend/reverse proxy for `/api`, HTTPS, and production identity and authorization controls.

The original Python agent code and AWS deployment configuration are independent of this extension. Its official AWS-backed suite is not needed to run this local frontend.

## Verified results

- UI regression tests: **7 passed**.
- Loopback API tests: **6 passed**.
- TypeScript and production build: **passed**.
- Formatting and `git diff --check`: **passed**.
- Dependency audit: **0 reported vulnerabilities** at verification time.
- Existing Python offline suite: **37 passed**, with its AWS transport guard reporting **0 real AWS requests**.
- Browser checks: desktop tracking and chat, demo login/sign-out, mobile order filtering, and a 390px viewport with no horizontal overflow.

The official AWS-backed suite and live agent were not run for this frontend extension.
