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

It does **not** restart a running process manager automatically. If you use PM2, systemd, Docker, or another supervisor, restart or reload it yourself after the script completes.

## Optional Advanced Linux Setup

The files in this directory can still be used as examples for a more manual host-managed deployment:

- `deploy/langflow-chat.service`
- `deploy/apache-site.conf`
- `deploy/apache-modules.md`

Treat them as optional examples, not the canonical deployment path.

For a host-managed setup where Dockerized sidecars such as Langflow must reach the app over the host bridge network, set `HOST=0.0.0.0` and `PORT=3001` in the environment file that systemd loads at `/opt/langflow-chat/.env` rather than hardcoding those values into the unit file itself.

That keeps Apache reverse proxying to `127.0.0.1:3001` on the host while also allowing containers to reach the host at `http://172.17.0.1:3001` when the Docker bridge uses the default subnet.

## Runtime Expectations

- Node.js 20+
- npm
- a writable `data/` directory
- reachable Langflow and model endpoints from the app server
- a configured `.env`

## Health Check

The app exposes:

```bash
curl -s http://localhost:3001/api/health
```

Expected response:

```json
{"status":"OK"}
```

When Langflow runs in Docker on the same host, this should also work from inside the container once the service is restarted with `HOST=0.0.0.0` in `/opt/langflow-chat/.env`:

```bash
curl -s http://172.17.0.1:3001/api/health
```

## Upload Body Size

Production builds patch adapter-node so the default `BODY_SIZE_LIMIT` becomes `50M`.

You can still override it explicitly:

- `BODY_SIZE_LIMIT=50M` to match the current default
- a higher value if your deployment needs more headroom

Keep it at or above the application’s current 50MB upload cap so multipart requests are not rejected at the transport layer first.
