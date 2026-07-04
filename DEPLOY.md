# Deploy VERITAS to Cloudflare Pages (public demo URL)

The public demo is 100% client-side (replays the recorded investigation from
`web/public/demo-run.json`) — no backend, cannot break in front of judges.

## One-time build + deploy

```bash
# 1. build the static site
cd web && STATIC_EXPORT=1 pnpm build      # → web/out/

# 2. deploy to Cloudflare Pages (needs `wrangler login` once)
npx wrangler pages deploy out --project-name veritas
```

That prints a `https://veritas-xxx.pages.dev` URL — the live demo.

## Local full-agent (live Vultr runs)

```bash
pnpm --filter @veritas/server start &     # engine on :8787
pnpm --filter @veritas/web dev            # console on :3000 (live mode)
```
