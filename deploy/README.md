# Advanced Deployment Notes

The primary public deployment path for AlfyAI is documented in the root [README.md](../README.md) and centered on `./scripts/deploy.sh`.

This file exists for operators who want to adapt AlfyAI to a more customized Linux setup, such as:

- systemd-managed application processes
- Apache reverse proxying
- custom host-level service management

## Primary Recommended Flow

For most deployments, use the root workflow:

```bash
cp .env.example .env
# edit .env
./scripts/deploy.sh
```

That script currently does exactly this:

1. `git pull origin main`
2. `npm install`
3. `npm run build`
4. `npm run db:prepare`
5. if `SYSTEMD_SERVICE_NAME` is set, activate restart-drain mode
6. wait for in-flight chat turns to finish
7. restart the configured systemd unit

It still does **not** restart PM2, Docker, or other non-systemd supervisors automatically.

If `SYSTEMD_SERVICE_NAME` is configured, the deploy script will:

- temporarily reject new chat turns
- wait for active generations to finish and persist
- restart the named systemd unit

Useful script-side variables:

- `SYSTEMD_SERVICE_NAME`
- `SYSTEMD_USE_SUDO`
- `DEPLOY_CONTROL_TOKEN`
- `RESTART_CONTROL_URL`
- `SAFE_RESTART_TIMEOUT_SECONDS`
- `SAFE_RESTART_POLL_INTERVAL_SECONDS`

## Optional Advanced Linux Setup

The files in this directory can still be used as examples for a more manual host-managed deployment:

- `deploy/langflow-chat.service`
- `deploy/apache-site.conf`
- `deploy/apache-modules.md`

Treat them as optional examples, not the canonical deployment path.

## Runtime Expectations

- Node.js 20+
- npm
- a writable `data/` directory
- reachable Langflow and model endpoints from the app server
- a configured `.env`

## Health Check

The app exposes:

```bash
curl -s http://localhost:3000/api/health
```

Expected response:

```json
{"status":"OK"}
```

## Upload Body Size

Production builds patch adapter-node so the default `BODY_SIZE_LIMIT` becomes `50M`.

You can still override it explicitly:

- `BODY_SIZE_LIMIT=50M` to match the current default
- a higher value if your deployment needs more headroom

Keep it at or above the application’s current 50MB upload cap so multipart requests are not rejected at the transport layer first.
