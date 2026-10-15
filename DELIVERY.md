# Dots Cloud — Delivery & Operational Verification

## Live Deployments & Repositories

- **Firebase Hosting (Single-File Frontend)**: [https://dots-300de.web.app](https://dots-300de.web.app)
- **Firebase Project**: `dots-300de` (Spark Plan — Firestore security rules and Hosting deployed; zero Cloud Functions, Storage, or paid services used)
- **Primary Source Repository**: [https://github.com/connorgentile113-png/dots](https://github.com/connorgentile113-png/dots)
- **Private Agent Runner & Backup Repository**: `connorgentile113-png/dots-agent-run` (`private: true`)

## Architecture & Provider Status

1. **Single-File Firebase Web SDK Frontend (`index.html` & `public/index.html`)**
   - Built with esbuild (~385 KiB) embedding the Firebase Web SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`) with strict SHA-256 script Content-Security-Policy (`connect-src` restricted strictly to `https://firestore.googleapis.com`, `https://identitytoolkit.googleapis.com`, and `https://securetoken.googleapis.com`).
   - Communicates exclusively with Firebase Authentication and Firestore. Never contacts Koyeb, NVIDIA, Cloudflare, Browserless, or GitHub directly.

2. **NVIDIA NIM Model Switchboard**
   - Verified live tool-calling across:
     - `nvidia/nemotron-3.5-lightning-30b-a3b`
     - `deepseek-ai/deepseek-v4.1-flash`
     - `z-ai/glm-5.3-flash`
   - Automatic task-aware routing selects coding, reasoning, or fast models and respects per-dot pinned models, daily quotas, and `Retry-After` rate-limit cooldowns.

3. **Cloud Browser Automation & Live Cursor Inspector**
   - **Cloudflare Browser Rendering**: Verified active token and remote DevTools session creation; enforces a 540s/day budget (leaving a 60s safety reserve under the 10-minute/day free tier).
   - **Browserless**: Verified WebSocket CDP connection (`wss://production-sfo.browserless.io`); configured as automatic fallback with monthly unit budgeting.
   - **Live Cursor & Frame Stream**: Captures compressed JPEG frames and normalized cursor coordinates (`x`, `y`) into `users/{uid}/streams/{runId}` when a user is actively viewing a run.

4. **GitHub Actions CLI Sandbox & Scheduled Worker (`dots-agent-run`)**
   - **CLI Commands (`agent-command.yml` & `scripts/runner-command.mjs`)**: Runs agent shell commands inside an isolated, network-disabled, read-only, non-root `python:3.12-slim` Docker container on GitHub Actions. Supports both automatic execution (`autoApproveTerminal` / `AUTO_APPROVE_TERMINAL=true`) and manual approval in the UI, streaming terminal output back to Firestore and continuing the agent run automatically.
   - **Scheduled Worker (`wake.yml` & `scripts/run-once.mjs`)**: Because the Koyeb account's single free service slot is currently occupied by an existing service (`minor-albertine/proxyv`), the existing Koyeb service was preserved untouched and `wake.yml` runs the worker directly against Firestore on schedule (`17,47 * * * *`) and via `workflow_dispatch`, while remaining ready to wake a Koyeb HTTPS URL whenever `DOTS_BACKEND_URL` is set.
   - **Encrypted GitHub State Backups**: Writes AES-256-GCM encrypted user dot definitions, schedules, and memories to `data/dots-backup.enc.json` in the private `connorgentile113-png/dots-agent-run` repository.

5. **Google Docs Export Note**
   - The target Google Doc (`1AKaQA-LIIR6ADzrCmMUOLfwaor4n6iqGOBsDH-dSk3Y`) requires an interactive Google account sign-in and is not shared with the Firebase service account. The complete single-file HTML is published at `https://dots-300de.web.app/index.html` and committed at `index.html` in the repository.

## Verification Summary

- **Unit & Engine Tests (`npm test`)**: 28/28 passing (durable runs, idempotency, schedule coalescing, cron validation, rate-limit deferral, recovery review, truncation safety, loop prevention, manual & auto-approved GitHub Actions terminal dispatch, lease exclusivity, cancellation, memory scoring, context compaction, AES-256-GCM backup encryption, SSRF protection, signed wake verification).
- **UI & Security Tests (`npm run test:ui`)**: Passing in headless Chrome across desktop (`1440x1080`) and mobile (`390x844`) viewports, verifying zero non-Firebase network requests, CSP enforcement, XSS neutralization, dot creation, scheduling, memory management, and dark/light themes.
- **Firestore Rules & Emulator Integration (`npm run test:rules` & `npm run test:integration`)**: 19/19 security rule checks passing and full emulator integration passing.
- **Live Cloud End-to-End Verification**: Verified live Firestore command ingestion, NVIDIA NIM model execution, Cloudflare/Browserless browser tool execution, encrypted GitHub backup to `data/dots-backup.enc.json`, and live GitHub Actions sandbox CLI execution (`agent-command.yml`).
