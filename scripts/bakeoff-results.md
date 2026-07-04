# Model bake-off — how the examiners were chosen

Every model VERITAS ships was chosen by measurement, not reputation. The harness
(`scripts/bakeoff-vultr.mjs`) runs each candidate on **Vultr Serverless Inference**
against a fixed 4-task suite exercising the exact shapes the agent depends on —
a tool-call decision, a multi-step tool chain, argument correctness, and SQL
generation — scored on correctness and p50 latency.

Final results (re-run July 5, 2026, on the shipped stack):

| Model | Score | p50 latency | Role |
|-------|:-----:|:-----------:|------|
| **Qwen/Qwen3.6-27B** | **4/4** | 2100 ms | **Senior examiner** — plans, hypothesizes, decides every verdict |
| **nvidia/Nemotron-Cascade-2-30B-A3B** | **4/4** | **1601 ms** | **Independent verifier panel + extraction fleet** — a second model family, so no finding rests on one model's judgment |
| Qwen/Qwen3.5-397B-A17B | 4/4 | 5918 ms | Fallback senior (correct but ~3× slower) |
| moonshotai/Kimi-K2.6 | 4/4 | 1729 ms | Not shipped — Qwen3.6-27B matches it at a fraction of the price |

Retrieval is separate: all document ranking runs on the **VultronRetriever**
family (`Prime-8B` for decisive questions, `Core-4.5B` for routine reranks) via
`/v1/rerank` — see `server/src/retriever.ts`.

Reproduce: `node scripts/bakeoff-vultr.mjs` (needs `VULTR_INFERENCE_API_KEY` in `.env`).
