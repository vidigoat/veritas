# Deploying VERITAS on Vultr

VERITAS runs entirely on Vultr: retrieval on **VultronRetriever**, reasoning on **Vultr
Serverless Inference**, and one **Vultr Cloud Compute** VM that serves both the forensic
engine (Hono, SSE) and the static console — a single public URL, same-origin, no CORS or
mixed-content traps.

## 1. Vultr Serverless Inference (models)

Nothing to provision — the models are already served. You only need an inference key.

1. In the Vultr console, open **Serverless Inference** and create an API key.
2. The agent uses (all on `api.vultrinference.com`):
   - **Retrieval:** `vultr/VultronRetrieverPrime-Qwen3.5-8B` · `…Core-Qwen3.5-4.5B` (`/v1/rerank`)
   - **Reasoning:** `Qwen/Qwen3.6-27B` (senior), `Qwen/Qwen3.5-397B-A17B` (fallback) (`/v1/chat/completions`)
   - **Independent verifier + fleet:** `nvidia/Nemotron-Cascade-2-30B-A3B`

## 2. The VM — engine + console together

```bash
# Provision: Vultr Cloud Compute, Ubuntu 24.04, 1 vCPU / 2 GB is plenty (no GPU needed).
ssh root@<VULTR_VM_IP>

# Node 22 + pnpm  (VERITAS needs Node >= 22.13 for node:sqlite)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
npm i -g pnpm

# Clone + install + generate the demo books
git clone https://github.com/vidigoat/veritas.git && cd veritas
pnpm install
pnpm --filter @veritas/datagen corpus        # the 1,090-doc demo corpus

# Configure — your inference key
echo "VULTR_INFERENCE_API_KEY=<your-key>" > .env

# Build the console as a static bundle — the engine serves it at "/"
cd web && pnpm build && cd ..

# Run the engine (serves the API *and* the console on :8787)
pnpm --filter @veritas/server start
```

Run it under systemd so it survives reboots:

```ini
# /etc/systemd/system/veritas.service
[Unit]
Description=VERITAS forensic engine + console
After=network.target
[Service]
WorkingDirectory=/root/veritas
ExecStart=/usr/bin/pnpm --filter @veritas/server start
Restart=always
Environment=PORT=8787
[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now veritas
ufw allow 8787/tcp        # or front it with nginx on :80/:443
```

**Updating a running deployment:**

```bash
cd /root/veritas && git pull && pnpm install \
  && pnpm --filter @veritas/datagen corpus \
  && (cd web && pnpm build) && systemctl restart veritas
```

## 3. Resilience & abuse guards (already built in)

- **Live-run guards.** `/api/v2/run` is capped at 3 concurrent runs and 12 runs/IP/hour;
  a global spend kill-switch stops all inference at $150. A typical full examination
  costs ~$0.01.
- **Refresh-proof streams.** Every run event is journaled server-side; an SSE reconnect
  (or a page refresh) replays the log from the last-seen index, so a flaky network never
  loses a live examination.
- **Model resilience.** Chat calls retry with one pre-output failover; zero-token streams
  retry once; the Nemotron reviewers abstain (never uphold) on error; a lead whose models
  are unreachable resolves as *unproven — escalated*, never as an accusation.

## 4. Health check

```bash
curl http://<VULTR_VM_IP>:8787/api/health      # {"ok":true,"runs":0}
open http://<VULTR_VM_IP>:8787                 # the console
```
