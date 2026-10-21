# Mastra Model Router

**File:** `src/mastra/model-router.ts` · **Tests:** `src/test/mastra-model-router.test.ts` (14) · **Date:** 2026-10-20

A shared, env-driven router that selects a language model **by task complexity**, so CRM, Marketing, Finance, HR and Dashboard agents can each use the right-sized model. It keeps the local **Qwen3.5:2B behind a flag** and **never** as the global default.

## Core rule
- **`diagnostic` / `simple`** → may use the local small model (2B) **only when explicitly enabled**; otherwise a stronger configured model. `diagnostic` additionally has a deterministic **mock** fallback so it always works offline/CI.
- **`complex`** → requires a `standard`/`advanced` model. The local 2B is **not eligible**. If none is configured the router returns a typed **`{status:"blocked", reason}`** — it must never silently downgrade a complex decision to 2B.

## Model classes & env config
No model is hardcoded; everything comes from env.

| Class | Env prefix | Example use | Eligible for |
|---|---|---|---|
| `advanced` | `MASTRA_ADVANCED_LLM_*` | hosted 70B / frontier / gateway | complex, simple, diagnostic |
| `standard` | `MASTRA_STANDARD_LLM_*` | self-hosted 7B–14B OSS | complex, simple, diagnostic |
| `small` | `LOCAL_LLM_*` **+ `MASTRA_ENABLE_LOCAL_SMALL=1`** | local Qwen3.5:2B dev/diagnostic | simple, diagnostic only |

Each prefix reads `_BASE_URL`, `_MODEL`, `_API_KEY`, and optional `_REASONING_EFFORT`.

Selection within eligibility: `complex` picks the **strongest** available; `simple`/`diagnostic` pick the **cheapest** eligible (reserving the strong model for complex work).

## Resolution outcomes (verified)
| Complexity | Nothing configured | Only local 2B (flagged) | Standard configured | Standard + Advanced |
|---|---|---|---|---|
| diagnostic | ok → **mock** | ok → 2B | ok → standard | ok → standard (cheapest) |
| simple | **blocked** | ok → 2B | ok → standard | ok → standard |
| complex | **blocked** | **blocked** (2B not eligible) | ok → standard | ok → **advanced** |

Live-verified: with the flag + `LOCAL_LLM_*`, `resolveModel("simple")` routed to 2B and returned "pong"; `resolveModel("complex")` returned `blocked` ("only the local small model (2B) is available … no silent downgrade").

## How to attach a stronger open-source model later

The router speaks the **OpenAI-compatible** API, so any OSS model served behind such an endpoint works with zero code change — just env.

**Option A — self-hosted OSS (e.g. Qwen2.5-14B / Llama-3.1-70B via vLLM, Ollama, or TGI):**
```bash
# vLLM exposes /v1 natively; Ollama exposes http://host:11434/v1
export MASTRA_STANDARD_LLM_BASE_URL="http://gpu-host:8000/v1"
export MASTRA_STANDARD_LLM_MODEL="Qwen/Qwen2.5-14B-Instruct"
export MASTRA_STANDARD_LLM_API_KEY="<token-or-empty>"
# non-thinking model → leave reasoning untouched (default ""); set "none" only for Qwen3.x thinking models
```
`complex` tasks immediately resolve to it instead of returning blocked.

**Option B — a frontier/advanced tier (hosted or gateway):**
```bash
export MASTRA_ADVANCED_LLM_BASE_URL="https://<gateway>/v1"
export MASTRA_ADVANCED_LLM_MODEL="<model-id>"
export MASTRA_ADVANCED_LLM_API_KEY="<key>"
```
`complex` then prefers advanced over standard automatically.

**Hardware note:** a 7B–14B needs ~8–16 GB RAM (or a GPU); 70B needs a GPU server. The current 8 GB Intel dev machine can only run the 2B — hence 2B is confined to `simple`/`diagnostic`.

No model needs any Mastra code change — the router builds the AI-SDK model from env via `@ai-sdk/openai-compatible`.

## Department usage pattern
```ts
import { resolveModelForTask } from "@/mastra/model-router";

const r = resolveModelForTask("crm.deal.strategy"); // complex
if (r.status === "blocked") {
  // surface BLOCKED to the owner — do NOT fall back to 2B
  return { status: "blocked", reason: r.reason };
}
const agent = new Agent({ /* … */, model: r.model });
```
`DEFAULT_TASK_COMPLEXITY` maps known task kinds; unknown kinds default to `complex` (safe — won't silently use 2B).

## Boundaries (unchanged)
The router only decides **which model** an agent reasons with. It does **not** touch the Supabase **Action Registry**, approvals, **RLS**, **tenant isolation**, or **audit** — all external writes still go through the server-side registry exactly as before. No production change, no deploy, no push.
