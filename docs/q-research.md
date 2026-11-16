# Q Research — local build and activation

This change was prepared on `codex/q-research`, based on release `bbb53e9`. Publication was requested after local testing. The website deploys through the existing GitHub/Vercel connection; real research requires the separate worker to be connected. Quest's sidebar and page layout stay as they are. The new interface lives inside Q, alongside Chat.

The downloadable `Quest-Research-Preview.html` is a self-contained demonstration of the actual Q interface with simulated research and saves. Extract the preview ZIP and open that HTML file in a desktop browser. It needs no API key or installation, does not contact Quest, and clears sample saves when reloaded. The surrounding preview dashboard is illustrative; it is not a dashboard redesign.

## Included behaviour

- Research one question across one to three public HTTPS websites on the selected domains.
- Show progress, visited URLs, AI calls and token usage. Stop is confirmed by the worker; a disconnected UI does not claim a run was stopped.
- Keep unsent writing while Q is closed. Reopen the latest submitted run after closing the app. Questions/results are not stored in the service worker or browser storage.
- Download a text report. Review and edit findings before saving a private note or project note. Review a title, project and optional due date before creating a To do task assigned to the signed-in member. Tasks currently have no long description field, so full findings belong in notes or the report.
- Retry an uncertain start using the same run ID. Retry an uncertain save using the same reviewed content and deterministic record ID. This avoids a second paid run or duplicate saved item after a lost acknowledgement.
- Recheck current membership and project permissions for every read, Stop and save. Changed accounts/access clear the interface. A run's project scope never grants access to the project.

## Architecture and private data

`assistant-research.js` calls only the same-origin `api/research.mjs`. The gateway verifies the caller's Supabase JWT and membership, reads projects using that same JWT, and signs a request to the private worker. The worker receives an owner UUID, optional project UUID, the question and public source URLs. It receives no Quest JWT, Supabase key, messages, notes, uploaded files or workspace snapshot. It never receives a Supabase service-role key.

The browser worker runs outside Vercel's short-lived functions. It uses FastAPI, SQLite, local Chromium and the tested Browser Use source snapshot provided in `browser-use-main.zip`. That snapshot identifies itself as 0.13.13 but is not published on PyPI. The exact source and its MIT license are included under `worker/vendor/browser-use`, with a SHA-256 inventory in `worker/vendor/source-manifest.json`. Tested Linux/Python 3.12 dependency versions are recorded in `worker/constraints.txt`.

Browser Use cloud sync, extensions, telemetry, vision, planning and judge calls are disabled. Tools for typing, clicking, submitting forms, file access and uploading are removed. Navigation stays on the listed domains. A separate public-only HTTPS CONNECT proxy validates all Chromium connections, blocks private/metadata addresses and pins DNS to the checked public IP. Downloads and browser permissions are disabled. Temporary browser profiles and agent screenshot folders are removed on normal completion and cancellation. Questions, page text and raw provider errors are filtered out of the SDK's console output. The container launcher removes the SDK's automatic sandbox-disabling arguments, enables site isolation and gives Chromium an allowlisted environment without the worker's API keys or shared secret.

Jobs and reports remain in the worker's private SQLite volume for 14 days by default. Browser storage does not hold the reports. A worker restart cancels interrupted and queued work rather than restarting paid requests automatically. Cancelled and failed runs still count towards daily run limits. Back up or erase the worker volume according to the team's needs; it contains research questions and findings.

Saved notes/tasks use existing Supabase tables and RLS. No new database migration is required. Private notes require the existing personal workspace setup; project saves require current editing access. A selected project does not share the research job itself. Whole-account revocation blocks all further gateway access immediately; a previously submitted public-only run may finish within its time limit because the worker does not receive or retain the member's sign-in token.

## Prepared Render setup

The repository includes `render.yaml` for one Docker web service, a private 1 GB persistent disk and the pilot limits below. Open [Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fwhoiisxero%2Fteam-dashoard), sign in/create the hosting account and connect the Quest repository. Review the Standard service and disk charges shown by Render before creating it. No account or paid hosting subscription is created by publishing this repository.

Render asks for `OPENAI_API_KEY` privately and generates `Q_RESEARCH_WORKER_SECRET`. After its deployment is healthy, copy the HTTPS worker origin and that generated secret into the three Vercel Production variables shown below, and redeploy Quest. Leave `Q_RESEARCH_ENABLED` unset until the worker is ready. The in-app setup link goes to `/setup-guide.html#q-research`. A small real run, a real saved note and Stop must be verified after connection.

## Default pilot limits

| Setting | Default |
| --- | --- |
| Members | Owner only; optional explicit member UUID allowlist |
| Runs per member | 3 per Johannesburg calendar day |
| Runs across the worker | 12 per Johannesburg calendar day |
| Concurrent browsers | 1 |
| Maximum active/queued jobs | 4, with at most 1 per member |
| AI calls per run | 6, including extraction calls |
| Maximum completion tokens per call | 1,500 |
| Maximum serialized model context per call | 80,000 characters |
| Browser run time / steps | 180 seconds / 8 steps, plus bounded cleanup |
| Reports retained | 14 days |

These are request and token bounds, not a guaranteed rand/dollar spend cap. An in-flight request may still be billed after Stop. Keep an OpenAI project budget/alert and review actual API usage before expanding the pilot. The UI reports measured token usage; it does not invent a currency cost.

Studio-only accounts and guests of the private My Fragile space are excluded, even when included in the allowlist. Other members retain their current destination permissions. Personal-only members can save to their own notebook if their workspace is ready; they cannot create project tasks.

## Worker setup, when deployment is authorised

Use one persistent Linux worker instance with Python 3.12, Chromium, HTTPS ingress and a persistent private `/data` disk. The host must support Chromium's non-root sandbox/user namespaces. The implementation does not automatically disable the production sandbox. Set max instances and worker processes to one; the SQLite queue is not a multi-replica coordinator.

Build from the repository root:

```sh
docker build -f worker/Dockerfile -t quest-q-research .
```

Set secrets through the host's secret settings. Do not put them in the repository, frontend, screenshot or chat:

- `OPENAI_API_KEY`: the dedicated OpenAI project key for research.
- `Q_RESEARCH_WORKER_SECRET`: a newly generated random secret of at least 32 characters; use the identical value on the Vercel gateway.
- Optional: `Q_RESEARCH_MODEL` (default `gpt-4.1-mini`), `Q_RESEARCH_MEMBER_DAILY`, `Q_RESEARCH_GLOBAL_DAILY`, `Q_RESEARCH_QUEUE_LIMIT`, `Q_RESEARCH_RETENTION_DAYS`.
- `Q_RESEARCH_DATA=/data`, and `QUEST_BROWSER_EXECUTABLE=/usr/bin/chromium` (set by the Dockerfile).

The container starts `python -m worker.start`. It checks private storage and starts sandboxed Chromium on an empty page before it starts Uvicorn on `PORT` (8080 by default), with one process and no request-access logs. An unsupported sandbox or unwritable volume fails deployment before the API becomes healthy. Mount `/data` writable by UID 10001. `/healthz` returns only a basic health acknowledgement; every `/v1/...` operation requires an HMAC signature, timestamp, unique nonce and member UUID. Do not log signed request bodies or secret headers at the hosting proxy.

Set Vercel's server-only variables:

```text
Q_RESEARCH_ENABLED=true
Q_RESEARCH_WORKER_URL=https://YOUR-PRIVATE-WORKER-HOST
Q_RESEARCH_WORKER_SECRET=THE-SAME-WORKER-SECRET
```

`Q_RESEARCH_MEMBER_IDS` is an optional comma-separated UUID allowlist. Start with the owner. The worker URL must be a plain HTTPS origin with no path or credentials. `Q_RESEARCH_LOCAL_WORKER=true` permits only a loopback HTTP worker for development; do not enable it in production. The existing public Supabase configuration continues to be used. No service-role key or database password is needed.

The environment in which this build was prepared has no OpenAI key or hosting credentials. A paid model call and the chosen deployment host still need verification. Before activation, verify the host's sandbox/Chromium startup and persistent disk, run one small paid research request with a dedicated low-budget key, save/reopen a real note/task in the preview workspace, test Stop/restart and access revocation, then explicitly authorise production publication.

To disable new Research access, set `Q_RESEARCH_ENABLED=false` and redeploy the gateway. Stop active worker jobs or stop the worker process separately; toggling the gateway flag does not refund or cancel already submitted requests. Roll back the frontend to the prior release if needed. Existing saved notes/tasks remain ordinary Quest records.

## Local checks

From the repository root, using a virtual environment rather than system Python:

```sh
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r worker/requirements.txt -c worker/constraints.txt
.venv/bin/python tests/test_research_worker.py
.venv/bin/python tests/test_research_hosting.py
.venv/bin/python tests/research-engine-smoke.py
node tests/research-server.mjs
node tests/assistant-server.mjs
node tests/assistant-tools-server.mjs
node scripts/build-research-preview.mjs
node scripts/build.mjs
node tests/research-build.mjs
```

The engine smoke test needs Chromium and OpenSSL. It uses an actual temporary HTTPS server, Chromium, public-only proxy and OpenAI SDK, with a simulated provider response. It asserts real DOM extraction, denial of a metadata subresource, source capture, token accounting and normal/cancelled browser, profile and screenshot cleanup. No paid model request is made.

The browser tests also need Playwright Python and Chromium in a development environment (not in the production worker):

```sh
python tests/research-browser.py
python tests/research-app-browser.py
python tests/assistant-browser.py
python tests/assistant-tools-browser.py
```

Those tests use explicit Quest/worker fixtures; they do not claim live Supabase or email delivery verification. The actual Quest build must include the hashed research module and CSS, while the simulated preview transport must remain outside the production build. Research API requests/results must remain excluded from PWA caches.

## Recorded local validation — 16 November 2026

Passed the research gateway suite; six real FastAPI/HMAC/SQLite/proxy tests; the actual Chromium/HTTPS/Browser Use/OpenAI-adapter smoke test; the downloadable preview's UI suite; integration inside Quest's actual `index.html`; the existing Q chat and voice/calendar browser suites; the existing chat/voice/event server suites; and the release/cache/vendor-integrity checks. The quota reset was also checked across 23:59 → 00:01 in Africa/Johannesburg. Worker tests ran from a separate fresh installation of the included source and pinned dependencies.

Static release identifier: `37130dda14b00e10`. The static build and its API-cache exclusion passed locally. Real paid API delivery, deployment-host behaviour and live Supabase saves remain activation checks; those services were simulated in the local tests.

The publication preparation adds a Render blueprint, an owner setup link in Q, private key entry/generation, a single persistent worker, startup checks, a separate Chromium launcher with a clean environment, and CI coverage for research. Hosting must be created by the account owner; no hosting subscription has been purchased and no real API key is available in this environment. The gateway also accepts pasted shared secrets with surrounding whitespace, matching the worker's trimming behaviour.

The worker Docker image builds successfully. The local production-container check has not passed its Chromium sandbox startup in this managed environment; this is not recorded as a working hosted service. Its entrypoint correctly refuses readiness. Verify sandbox support on the selected host before enabling the gateway. Current web release prepared for publication: `88cbb05283af749b`.
