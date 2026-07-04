# Model bake-off — how the two examiners were chosen

VERITAS runs two model tiers on **Vultr Serverless Inference**: a fast *junior
examiner* for the statistical sweep and evaluation, and a *senior examiner* for the
deep investigation, verification, and reporting. Neither was chosen by reputation.

Every candidate on Vultr was run against a fixed 4-task harness that exercises the
exact shapes VERITAS depends on — a simple completion, a tool-call decision, a
multi-step tool chain, and a SQL-generation task — scored on correctness and p50
latency. Results:

| Model | Score | p50 latency | Notes |
|-------|:-----:|:-----------:|-------|
| **moonshotai/Kimi-K2.6** | **4/4** | 1950 ms | Chosen as **senior examiner** — best reasoning + tool discipline |
| **nvidia/Nemotron-Cascade-2-30B-A3B** | **4/4** | **1320 ms** | Chosen as **junior examiner + independent verifier** — fastest clean 4/4 |
| MiniMaxAI/MiniMax-M2.7 | 4/4 | 1282 ms | Strong, but weaker on the SQL task under load |
| deepseek-ai/DeepSeek-V4-Flash | 4/4 | 3023 ms | Correct but slow |
| nvidia/Nemotron-3-Nano-Omni | 2/4 | 2510 ms | Dropped tool calls on the chain + SQL tasks |
| zai-org/GLM-5.2-FP8 | 2/4 | 2049 ms | 504 timeouts under load |

**Senior = Kimi-K2.6** (deep reasoning, holds the investigation).
**Junior + verifier = Nemotron-Cascade-2** (fastest clean pass — cheap triage, and a
different model family for the independent second opinion, so the verifier's blind
spots are not correlated with the examiner's).
