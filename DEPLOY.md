# Deploying VERITAS on Vultr

VERITAS runs entirely on Vultr: retrieval on **VultronRetriever**, reasoning on **Vultr
Serverless Inference**, and the agent backend on a **Vultr Cloud Compute** VM. The console
is a static bundle you can host anywhere (Vultr Object Storage, Cloudflare Pages, etc.).

## 1. Vultr Serverless Inference (models)

Nothing to provision — the models are already served. You only need an inference key.

1. In the Vultr console, open **Serverless Inference** and create an API key.
2. The agent uses (all on `api.vultrinference.com`):
   - **Retrieval:** `vultr/VultronRetrieverPrime-Qwen3.5-8B` · `…Core-Qwen3.5-4.5B` · `…Flash-Qwen3.5-0.8B` (`/v1/rerank`)
   - **Reasoning:** `Qwen/Qwen3.6-27B` (senior + junior), `Qwen/Qwen3.5-397B-A17B` (fallback) (`/v1/chat/completions`)
   - **Independent verifier:** `nvidia/Nemotron-Cascade-2-30B-A3B`

## 2. Backend — Vultr Cloud Compute VM

```bash
# Provision: Vultr Cloud Compute, Ubuntu 24.04, 2 vCPU / 4 GB is plenty (no GPU needed).
ssh root@<VULTR_VM_IP>

# Node 22 + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
npm i -g pnpm

# Clone + install
git clone https://github.com/vidigoat/veritas.git && cd veritas
pnpm install   # root package.json approves esbuild/sharp build scripts
pnpm --filter @veritas/datagen generate            # build the demo company books

# Configure — put your inference key in .env
echo "VULTR_INFERENCE_API_KEY=<your-key>" > .env

# Run the forensic engine (Hono SSE server) on :8787
pnpm --filter @veritas/server start
```

Run it under a process manager so it survives reboots:

```ini
# /etc/systemd/system/veritas.service
[Unit]
Description=VERITAS forensic engine
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
ufw allow 8787/tcp     # open the port (or front it with nginx + TLS)
```

## 3. Console (static frontend)

```bash
cd web
STATIC_EXPORT=1 NEXT_PUBLIC_API_BASE=http://<VULTR_VM_IP>:8787 pnpm build
# → web/out/  — upload to Vultr Object Storage / Cloudflare Pages / any static host
```

The public demo replays a bundled recording (`web/public/demo-run.json`) with **zero backend
dependency**, so the demo URL works even if the engine is asleep. Add `?live=1` to run a live
examination against the VM.

## 4. Health check

```bash
curl http://<VULTR_VM_IP>:8787/api/health      # {"ok":true}
```
