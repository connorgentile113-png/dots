# Dots Cloud

A single-file Firebase Web SDK frontend with a durable Node.js agent backend. Gmail is intentionally absent. This is an original Dots-style interface; an official OpenAI Dots reference was not available to verify a pixel-identical replica.

## Files

- `index.html`: complete built frontend, including the Firebase SDK. No runtime CDNs or external fonts.
- `public/index.html`: identical Firebase Hosting artifact.
- `server/`: Koyeb worker, provider adapters, scheduling, context/memory, recovery, and authenticated runner callbacks.
- `firestore.rules` and `firestore.indexes.json`: Spark-compatible data access configuration.
- `.github/workflows/`: scheduled wake-up and isolated terminal runner.
- `.env.example`: all backend environment variable names, without credentials.

## Architecture and limits

The frontend communicates only with Firebase Authentication and Firestore. It never contacts Koyeb, NVIDIA, browser providers, or GitHub directly. All secrets remain in the backend. The public Firebase web API key identifies the project and is intentionally in the HTML; Firestore rules enforce authorization.

The backend uses Firestore transactions, durable run records, expiring leases, and immutable client commands. A worker restart resumes from checkpoints. Repeated failures stop; recovery has a shared budget across continuations. Missed recurring schedules coalesce into one current decision rather than producing a burst of duplicate jobs.

Firebase stays on Spark: no Functions, Cloud Scheduler, Cloud Tasks, paid Storage, or Realtime Database. Compressed screenshots and terminal output use bounded Firestore documents. Browser frames are captured after actions only while a viewer is present. They are not a continuous video stream. Each browser tool call is a fresh session, supports up to five actions, and closes its browser afterward. Authenticated browsing and persistent browser profiles are not implemented.

Koyeb's free web instance may sleep. A signed GitHub Actions request wakes it at minutes 17 and 47. GitHub scheduling can be delayed and is not an exact clock. When the worker is asleep, a newly submitted task may wait for the next scheduled wake. A healthy worker polls commands every 30 seconds and checks schedules every five minutes. No claim of an always-on or guaranteed-free service is made.

The default budgets target one personal workspace: one active run, 16 model steps per task, 100 model requests per UTC day, two identical tool failures, one recovery review, 20 dots, 20 schedules, and 100 memory items. Cloudflare reserves at most 540 seconds/day, leaving headroom within its 600-second allowance. Reservations are conservative and are not automatically refunded. Browserless remains disabled until its actual monthly units and unit duration are configured; premium features are not assumed.

## Firebase setup (Spark)

1. Keep email/password Authentication enabled for project `dots-300de`.
2. Add the deployed Firebase Hosting domain to Authentication's authorized domains.
3. Deploy `firestore.rules` and `firestore.indexes.json`; wait for composite indexes to finish building.
4. Host `public/index.html` using Firebase Hosting. Firebase web configuration is already supplied in `firebase-config.json`.
5. Store the service account JSON in Koyeb's secret configuration as `FIREBASE_SERVICE_ACCOUNT_JSON`, never in the repository. The account needs Firestore data access and Firebase Authentication read access for owner verification.
6. Set `OWNER_EMAIL` to the verified owner email. After the owner signs up and verifies their Firebase email, the worker enables only that matching account. Other accounts remain blocked. Alternatively, an operator can create `users/{uid}` with `{ "enabled": true }` in the Firestore console; optionally restrict `ALLOWED_USER_UIDS` too.

Client commands are immutable and ownership-checked. All user-data mutations are performed by the backend. Admin SDK access bypasses Firestore rules, so backend authorization and scoped service-account access are required as well.

Deploy with a properly authorized Firebase CLI session:

```sh
npm ci
npm run build
firebase deploy --project dots-300de --only firestore,hosting
```

## Koyeb setup

Create a **free** web service from this repository's Dockerfile, port 8000, HTTP health check `/health`, minimum 0 and maximum 1 instance. Never silently select a paid instance when the free allowance is occupied. Preserve unrelated existing services.

Set the variables in `.env.example` using Koyeb's secret controls. `PUBLIC_BACKEND_URL` must be the service's HTTPS URL. `GITHUB_WAKE_SECRET` must match the Actions secret `DOTS_WAKE_SECRET`. `FIREBASE_PROJECT_ID` must match the service account project. Configure only hosted NVIDIA model IDs that pass tool-calling checks for your key.

The following hosted models passed a real tool-calling request during this build:

- `nvidia/nemotron-3.5-lightning-30b-a3b`
- `deepseek-ai/deepseek-v4.1-flash`
- `z-ai/glm-5.3-flash`

Auto routing uses capability categories and task content. Users can pin a configured model in dot settings. This initial router does not claim to benchmark every available NVIDIA model dynamically. Model availability and free entitlement can change.

## GitHub workflows and encrypted state

Use a **private** repository for agent commands and user-data backups. The frontend/source repository can be public because it contains no provider credentials. Copy both workflow files into the private runner repository's default branch, enable Actions, and set:

- `DOTS_BACKEND_URL`: Koyeb HTTPS origin.
- `DOTS_WAKE_SECRET`: the same random signing secret used by the backend.

Configure the backend's `GITHUB_REPOSITORY` to that private repository and supply a narrowly scoped token with the necessary Actions/Contents permissions. GitHub tokens and credentials never enter the command container.

Commands require explicit approval in the UI. They run inside a non-root container with no network, no capabilities, a read-only filesystem, a bounded temporary directory, and a two-minute execution timeout. Output is posted to an authenticated backend callback. The terminal is a log view, not an interactive shell. An uncertain dispatch is never automatically repeated. Docker isolation is useful but is not a security guarantee against all kernel vulnerabilities; do not expose this personal runner as a public arbitrary-code service.

To enable repository backups, set `GITHUB_BACKUP_ENABLED=true` and `BACKUP_KEY_BASE64` to 32 cryptographically random bytes encoded as base64. Backups are encrypted with AES-256-GCM and written to `data/dots-backup.enc.json` at most every six hours. They contain dot settings, schedules, and memories—not credentials, browser frames, full conversations, or in-flight execution state. The encryption key must be retained separately to recover the data. Git history retains previous encrypted snapshots; deleting a memory from the app does not erase old Git history.

The private repository requirement is verified before dispatch or backup. Initial free allowance calculations must include all existing Actions usage in the account. Twice-hourly wakes alone produce roughly 1,440 runner jobs in a 30-day month; depending on job duration, other workflows, and billing rules, this can use most or all of a free allowance. Disable paid overages and monitor usage.

## Development and verification

```sh
npm ci
npm run build
npm test
npm run test:ui
```

The UI tests use an installed Chromium at `/usr/bin/chromium` or `CHROMIUM_PATH`. They exercise an explicitly labelled preview with no model requests, then verify that the production page only requests Firebase destinations. Opening `index.html?demo=1` from a local HTTP server shows the sample-data preview. Normal mode uses the real supplied Firebase project. Serve over HTTP locally or HTTPS in production; do not rely on `file://` authentication behavior.

For security/integration tests, start the official Firestore emulator on `127.0.0.1:8088` with project `demo-dots`, then:

```sh
npm run test:rules
npm run test:integration
```

Integration tests clear **only the local demo emulator** and use a model test double. The rules tests verify tenant isolation, disabled-user rejection, immutable commands, private data, and server timestamps. Backend tests cover recovery, cooldowns, stopping loops, leasing, command approval, cancellation, encryption, and SSRF destination checks.

## Delivery and operational status

See `DELIVERY.md` for the actual deployment and live-test results. A passing local test does not establish provider entitlement, GitHub execution, Koyeb uptime, or a published deployment.
