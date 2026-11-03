# Personal development restoration — November 2, 2026

The October submission screenshots describe a historical deployment. On November
2, authenticated inspection found no foundation stack, DynamoDB tables, or
AgentCore Runtime. The original Knowledge Bases were `DELETE_UNSUCCESSFUL`.
Refreshing credentials could not restore those resources. The audit did not
establish who or what removed them.

## Restored resources

All resources are in the configured lab account, `us-east-1`.

| Component | Current resource |
|---|---|
| Foundation stack | `udacity-agentcore` |
| Runtime stack | `AgentCore-udacity-default` |
| Runtime | `udacity_agentcore_runtime-XeHhmH6qjh` |
| Native vector bucket | `udacity-agentcore-vectors-075465184677` |
| Returns KB | `YBWA03E0BW` |
| Shipping KB | `XXGNLMTKMD` |
| Warranty KB | `XL6NUAU37T` |
| Guardrail | `dhsre1hqpmik`, published version `1` |
| Summary Memory | `udacity_agentcore_memory-k1tU65CfPL` |

Each replacement KB uses its matching `*-policy-index`, Titan Text Embeddings
V2 with 1024 dimensions, and its corresponding `policies/<domain>/` prefix.
Each ingestion job completed with two documents indexed and zero failures.
The old failed-deletion KBs and old vector bucket were left untouched; they are
not used by the restored application. Review them separately before cleanup.

The foundation template now creates native S3 Vectors storage and exports the
bucket ARN and index names required by `config.py`. It also grants the runtime
role permission to discover CloudFormation exports. KBs are configured separately
as described in the root README; deploying the foundation alone does not create
them. The original Guardrail's published policy was reused without lowering
filter strengths or changing denied topics.

## Data and behavior

The two recreated orders are fictional development fixtures, not recovered
records. `ORD-12142` is a Wireless Headphones Pro return already requested;
`ORD-59651` is a delivered Bluetooth Speaker. Both belong to `CUST-001`.
Dates are relative to first seeding. There is no recorded carrier history or
tracking number, so the portal does not manufacture either.

Seeding now uses conditional inserts to preserve existing order/customer
records, resolves the policy bucket from exports, and does not create a Cognito
user. Policy document contents are unchanged.

A live diagnostic found that the Inventory handoff's developer-written commands
were classified as `PROMPT_ATTACK` by the unchanged guardrail. Those commands,
and the analogous Refund and Communication commands, now live in their respective
system prompts. Customer text remains in user messages without stripping
potential attacks. Models, temperatures, tools, eligibility checks, and workflow
updates are unchanged.

The portal remains a local, single-owner application. Authentication uses its
private local account files; no frontend AWS hosting or Cognito was created.
Summary Memory is provisioned, but conversation recall is still not integrated.
Refund validation does not execute payments or implement refund processing.

## Verification

- Compatibility: 38 tests passed, including trusted-handoff placement; its AWS
  transport guard reported zero real requests.
- Bridge: 6 tests passed; its AWS transport guard reported zero real requests.
- Seed safety: 4 mocked tests passed, including preservation of existing records
  and propagation of write failures. Import constructs no AWS clients.
- UI: 9 tests passed. API/provider/subprocess: 12 tests passed.
- Frontend production build, formatting, Python compilation, and diff whitespace
  checks passed.
- Actual portal login and DynamoDB order loading returned HTTP 200.
- Login and order loading also passed through the React server's Vite proxy.
- The deployed agent answered the Premium return-policy question via the portal
  with HTTP 200 and the 60-day policy window.
- After the handoff correction, deployed Inventory routing returned the actual
  delivered status of `ORD-59651` through the portal with HTTP 200. Both order
  records retained their seeded status and eligibility after these read-only
  checks. No refund or return action was requested.

Run the compatibility suite directly:
`.venv/bin/python tests/test_compatibility_offline.py`.
Generic `unittest discover` bypasses that file's guarded setup and is not its
supported runner. An attempted discovery run failed; the documented direct run
passed. API tests need permission to bind a loopback port.

Browser automation was unavailable during this restoration. HTTP checks and UI
tests do not establish that every browser interaction or model-driven route
succeeds. Historical screenshots are not new deployment evidence.

Final official Udacity run: **120/120**. Earlier runs were 115/120 while
Memory was creating and 110/120 during the tracing repair; these were
intermediate deployment states. Transaction Search is now `CloudWatchLogs/ACTIVE`
with 100% indexing and the reserved spans group present. A fresh X-Ray trace
was retrieved with `NovaMart-Orchestrator`, `InventoryAgent`, `check_order_status`,
and `CommunicationAgent`/`get_full_workflow_context` subsegments. Chat through
Vite's proxy also returned HTTP 200 from the deployed runtime.

One live model response called the recorded estimated date a "Delivery Date".
The structured order view correctly labels it as estimated. Generated prose
is not guaranteed to preserve that distinction; no confirmed delivery timestamp
or carrier evidence was added. Further response grounding and production
customer authorization remain separate work.

Local `.env` was updated with restored deployment identifiers. It is now
untracked and gitignored; the local file is preserved. Its eight variables are
deployment settings, not AWS authentication credentials. Removing it from the
current branch does not erase previously committed versions from Git history.
Private portal account files remain ignored and are not committed.
