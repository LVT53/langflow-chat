# Sandbox — Sandboxed File Production

Sandboxed container execution for AI-generated file production. Isolated Python/Node runtime with no network access.

## Structure

| File | Purpose |
|------|---------|
| `config.ts` | Docker container lifecycle, image warmup, exec monitoring |
| `config.test.ts` | Container lifecycle tests |

## Key Behavior (not in parent)

- **Image warmup**: `ensureSandboxImage()` runs at startup and first use; warms `python:3.11-slim` and `node:22-bookworm-slim`
- **Security model**: `NetworkMode: 'none'`, non-root UID 1000:1000, readonly rootfs with writable tmpfs for `/output` and `/tmp`
- **Exec monitoring**: Polls Docker exec inspect for `Running === false` before reading output — prevents race with early stream close
- **Output collection**: Tries Docker archive path first, falls back to in-container readback for tmpfs-backed outputs
- **Cleanup**: Kills throwaway container immediately instead of waiting through idle stop timeout (~10s saving)

## Log Prefixes

| Prefix | Source |
|--------|--------|
| `[FILE_PRODUCTION]` | Sandbox runtime, image warmup, readback warnings |
| `[SANDBOX]` | Container lifecycle events |

## Anti-Patterns

- **No network in containers**: Network access was explicitly removed; do not re-enable
- **No root in containers**: Containers run as UID 1000; root access is blocked
- **No host disk writes**: Archive contents are collected in-memory only; never write to host filesystem
