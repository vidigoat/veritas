# GO-0 Model Bake-off — live results (Vultr Serverless Inference)
4 tool-calling tasks on VERITAS's real schemas: simple call, tool choice, 2-turn chain, SQL authoring.

| Model | Score | p50 latency | Verdict |
|---|---|---|---|
| moonshotai/Kimi-K2.6 | 4/4 | 1950ms | **SENIOR examiner** — investigation, verification, reporting |
| nvidia/Nemotron-Cascade-2-30B | 4/4 | **1320ms** (fastest) | **JUNIOR examiner** — sweep phase, triage, eval judge |
| MiniMaxAI/MiniMax-M2.7 | 4/4 | 1282ms | fallback senior |
| deepseek-ai/DeepSeek-V4-Flash | 4/4 | 3023ms | bench (slow) |
| nvidia/Nemotron-Nano-Reasoning | 2/4 | 2510ms | rejected — leaks reasoning instead of tool calls on chains |
| zai-org/GLM-5.2-FP8 | 2/4 | — | rejected — 504s (service overloaded) |

**Nemotron-Cascade-2 earned its role empirically**: perfect score, lowest latency of any
perfect scorer, at $0.15/$0.60 per M — it runs VERITAS's entire statistical sweep phase
and the evaluation judge. Native tool calling works on all top models → no text-protocol
fallback needed (kept in llm layer as a flag anyway).
