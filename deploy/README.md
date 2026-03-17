# Langflow Chat Deployment Guide

This document provides step-by-step instructions for deploying the Langflow Chat application in a production environment using systemd and Apache.

## Prerequisites

- Node.js (v18+ recommended)
- Bun package manager
- Apache web server (with mod_proxy, mod_proxy_http, mod_ssl, mod_headers, mod_setenvif)
- SQLite3 (for database storage)
- Root/sudo access

## Environment Variables

Copy the `.env.example` file to `.env` and configure the following variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `LANGFLOW_API_URL` | URL of the Langflow API service | `http://localhost:7860` |
| `LANGFLOW_API_KEY` | API key for Langflow authentication | `your-api-key-here` |
| `LANGFLOW_FLOW_ID` | ID of the Langflow flow to use | `your-flow-id-here` |
| `LANGFLOW_WEBHOOK_SECRET` | Shared secret for Langflow sentence webhooks | `change-me-webhook-secret` |
| `NEMOTRON_URL` | URL of the Nemotron Nano service | `http://192.168.1.96:30001/v1` |
| `NEMOTRON_API_KEY` | API key for Nemotron/OpenAI-compatible auth | `your-api-key-here` |
| `NEMOTRON_MODEL` | Model name to use with Nemotron | `nemotron-nano` |
| `WEBHOOK_PORT` | Port for webhook endpoints | `8090` |
| `REQUEST_TIMEOUT_MS` | Request timeout in milliseconds | `120000` |
| `MAX_MESSAGE_LENGTH` | Maximum message length allowed | `10000` |
| `SESSION_SECRET` | Secret for session encryption (64+ chars) | `change-me-to-random-64-char-string` |
| `DATABASE_PATH` | Path to SQLite database file | `./data/chat.db` |

**Important:** Never commit actual secrets to version control. Use environment-specific `.env` files.

## Directory Structure

```
/opt/langflow-chat/
├── .env                 # Environment variables (not in git)
├── data/                # SQLite database directory
├── package.json         # Project dependencies
├── src/                 # Source code
├── .svelte-kit/         # SvelteKit build output
└── ...                  # Other project files
```

## Installation Steps

### 1. Create System User

```bash
# Create a dedicated system user for the application
sudo useradd --system --no-create-home --shell /usr/sbin/nologin langflow
```

### 2. Deploy Application Files

```bash
# Create deployment directory
sudo mkdir -p /opt/langflow-chat
sudo chown langflow:langflow /opt/langflow-chat

# Copy application files (adjust source path as needed)
sudo cp -r /path/to/source/* /opt/langflow-chat/
sudo chown -R langflow:langflow /opt/langflow-chat

# Install dependencies
cd /opt/langflow-chat
sudo -u langflow bun install

# Build production assets
sudo -u langflow bun run build
```

### 3. Configure Environment

```bash
# Copy environment template and configure
sudo -u langflow cp /opt/langflow-chat/.env.example /opt/langflow-chat/.env
# Edit .env with actual values (use nano, vi, or your preferred editor)
sudo -u langflow nano /opt/langflow-chat/.env
```

### 4. Install systemd Service

```bash
# Copy service file to systemd directory
sudo cp /opt/langflow-chat/deploy/langflow-chat.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable langflow-chat.service

# Start the service
sudo systemctl start langflow-chat.service

# Check service status
sudo systemctl status langflow-chat.service
```

### 5. Configure Apache

```bash
# Copy Apache virtual host template
sudo cp /opt/langflow-chat/deploy/apache-site.conf /etc/apache2/sites-available/langflow-chat.conf

# Edit the virtual host file to replace placeholders:
# - chat.example.com → your actual domain
# - SSL certificate paths → your actual certificate paths
sudo nano /etc/apache2/sites-available/langflow-chat.conf

# Enable the site and required modules
sudo a2ensite langflow-chat.conf
sudo a2enmod proxy proxy_http ssl headers setenvif

# Test Apache configuration and reload
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## Verification

### Check Application Health

```bash
# Verify the application is responding
curl -s http://localhost:3000/api/health
# Should return: {"status":"OK"}

# Verify through Apache proxy
curl -s https://your-domain.com/api/health
# Should return: {"status":"OK"}
```

### Check Service Logs

```bash
# View application logs
sudo journalctl -u langflow-chat.service -f

# Check for errors
sudo journalctl -u langflow-chat.service --since "10 minutes ago" -p err
```

### Check Database Initialization

```bash
# Verify database file exists and is accessible
sudo -u langflow ls -la /opt/langflow-chat/data/chat.db
```

## Maintenance Commands

```bash
# View service status
sudo systemctl status langflow-chat.service

# View logs
sudo journalctl -u langflow-chat.service

# Restart service
sudo systemctl restart langflow-chat.service

# Stop service
sudo systemctl stop langflow-chat.service

# Disable auto-start on boot
sudo systemctl disable langflow-chat.service

# Rebuild and restart after code changes
cd /opt/langflow-chat
sudo -u langflow bun run build
sudo systemctl restart langflow-chat.service
```

## Security Considerations

1. **Firewall**: Ensure only ports 80 (HTTP) and 443 (HTTPS) are exposed externally
2. **SSL**: Use strong SSL/TLS configurations (Let's Encrypt recommended)
3. **Updates**: Regularly update dependencies: `bun update`
4. **Backups**: Regularly backup the SQLite database file (`DATABASE_PATH`)
5. **Logs**: Monitor log files for suspicious activity

## Troubleshooting

### Application Fails to Start

1. Check service logs: `sudo journalctl -u langflow-chat.service -f`
2. Verify Node.js/Bun installation: `bun --version`
3. Check environment file: `sudo -u langflow cat /opt/langflow-chat/.env`
4. Verify build output exists: `ls -la /opt/langflow-chat/.svelte-kit/`

### Apache Proxy Issues

1. Check Apache error logs: `sudo tail -f /var/log/apache2/error.log`
2. Verify modules are enabled: `sudo a2enmod proxy proxy_http ssl headers setenvif`
3. Test proxy configuration: `sudo apache2ctl configtest`

### Database Errors

1. Verify directory permissions: `sudo -u langflow ls -la /opt/langflow-chat/data/`
2. Check disk space: `df -h`
3. Verify SQLite3 is installed: `sqlite3 --version`

## Health Check Endpoint

The application provides a health check endpoint at `/api/health` that returns:
- HTTP 200 OK
- JSON body: `{"status":"OK"}`

This endpoint can be used by load balancers, monitoring systems, or container orchestration platforms to verify application availability.

---
*Last updated: $(date)*
