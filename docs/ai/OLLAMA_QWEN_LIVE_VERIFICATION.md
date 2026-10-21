# Live Local LLM Verification — Ollama + Qwen3.5 → Mastra

**Date:** 2026-10-20 · **Worktree:** `/Users/macbookpro/mastra-worktree` (`chore/mastra-install`)
**Goal:** install & test an open-weight LLM for Mastra with REAL inference; preserve `localhost:8080` and other agents' work; no push/deploy.
**Rule honored:** *LIVE_INFERENCE_PASS only when a real model actually generated and passed the tests; otherwise report precisely why.*

## Verdict

| Item | Status |
|---|---|
| **Real local inference wired into Mastra** | **LIVE_INFERENCE_PASS** — with `qwen3.5:2b` |
| Originally-requested `qwen3.5:9b` | **NOT RUN** — infeasible on this hardware (see below) |
| `qwen3.5:4b` | **REAL but UNUSABLE** — ran, but ~0.09 tok/s (swap-thrashing on 8 GB) |

Real inference was achieved and verified through the actual Mastra Agent runtime (not a mock, not the raw API only). The model that works in practice on this machine is **`qwen3.5:2b`**, not the 9b or 4b originally targeted.

## Hardware (measured)
- CPU: Intel Core i5-7360U — 2 cores / 4 threads, 2.3 GHz (2017). AVX2 present. **No discrete GPU → CPU-only inference.**
- RAM: **8 GB total**; with macOS + Vite dev server + browser, Ollama saw only ~2.1 GiB free at start.

## Install path (what actually happened)
1. Ollama **0.17.1** was already installed (GUI app + a brew formula 0.17.0). **Too old for any qwen3.5** — pull failed `412: requires a newer version of Ollama`.
2. `brew upgrade ollama` fell back to **compiling cmake + Ollama from source** (no bottle for this old Intel/macOS) → hours of CPU-pegged build. **Aborted** to protect the machine and `:8080`.
3. Downloaded the official prebuilt **`ollama-darwin.tgz` v0.40.6** (166 MB) to the scratchpad; verified it is a **universal binary incl. x86_64**; ran it directly (no system install, `/Applications/Ollama.app` untouched). Server on `127.0.0.1:11434`.
4. First `qwen3.5:4b` pull failed on a **transient DNS error** (Cloudflare R2 blob host); retried and succeeded.

## Model performance (measured on this machine)
| Model | Size | Cold load | Warm gen speed | Verdict |
|---|---|---|---|---|
| `qwen3.5:4b` | 3.3 GB | 82.5 s | **~0.09 tok/s** (60-tok request did not finish in 400 s) | Real, but **unusable** — doesn't fit 8 GB, swaps to disk |
| `qwen3.5:2b` | 2.7 GB | 17.9 s | **5.7–8.2 tok/s** | **Usable** — fits RAM, llama-server RSS ~741 MB |

Throughout, `curl localhost:8080` stayed **200** and swap peaked ~3.2 GB (manageable). No other agent's files or processes were touched.

## Mastra wiring (official OpenAI-compatible provider)
- `src/mastra/model.ts` → new `liveModel()` builds an AI-SDK model from `@ai-sdk/openai-compatible` pointing at Ollama's OpenAI-compatible endpoint. Env-driven (`LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY`) — **no hardcoded key/URL**.
- **Key fix:** Qwen3.5 is a *thinking* model. Via `/v1`, default thinking routes ALL tokens to a `reasoning` channel and leaves `content` **empty** → the agent saw blank replies. Ollama's `/v1` honors **`reasoning_effort:"none"`**; `liveModel()` injects it via a `fetch` wrapper (configurable with `LOCAL_LLM_REASONING_EFFORT`). `/no_think` and `chat_template_kwargs` did **not** work on this endpoint; `reasoning_effort:"none"` did.
- Scripts: `src/mastra/live-verify.ts` (7-step battery), `src/mastra/live-verify2.ts` (tuned retries).

## Live battery results (real model, through Mastra Agent)
| Step | Result | Note |
|---|---|---|
| Registry loads + diagnostic agent | PASS | structural |
| Live diagnostic ping | **PASS** | real reply "pong", 1.9 s |
| Marketing — Danish draft | **PASS** | grammatical Danish, 247 chars, ~8.6 s |
| Finance — factual reasoning | **PASS** | correctly picked overdue `INV-2` |
| HR — reasoning | **PASS** | correctly picked unassigned shift `S2` |
| CRM — structured JSON | **PASS (with firm prompt)** | loose prompt → malformed JSON (duplicate `ranked` key); firm prompt → valid `{"ranked":["a","b","c"]}`. **Ordering imperfect** (ranked small lead above larger) — a 2b reasoning limit |
| Tool-calling | **PASS (with unambiguous tool)** | optional-arg tool → model asked a clarifying question; no-arg tool + firm instruction → called `count_leads`, answered "There are 42 leads" |

Regression: full suite **177 passed / 2 skipped**; `src/mastra` typecheck clean; mock `verify.ts` still PASS.

## Limitations & honest blockers
- **Model quality (2b):** structured JSON needs firm prompting; multi-criteria ranking is mediocre; tool-calling reliable only with unambiguous tools. These are real small-model limits — a 7B/9B would do better but cannot run on 8 GB here.
- **9b/4b:** not viable on this hardware (RAM). To run them: a machine with ≥16 GB RAM (ideally Apple Silicon / GPU).
- **Access rights & tenant isolation between test companies (mission step 7):** **BLOCKED / NOT TESTED.** This is enforced at Supabase RLS + the Action Registry, not by the model; it needs safe non-production auth test accounts (QA-1). Not simulated, not marked PASS.
- **Full agent→tool→approval→DB→UI chain:** still BLOCKED on the same auth accounts.
- **Persistence:** Mastra logged "no `storage` configured → in-memory" — fine for verification, not for production.

## Mocks vs live
Mocks (`mockModel`) return fixed deterministic text for CI without creds/network — unchanged and still green. Live (`liveModel`) now proves the same Mastra Agent wiring produces real reasoning, Danish, JSON and tool-calls against a local open-weight model. Both coexist; the registry still defaults to the mock so importing it needs no creds.

## How to reproduce
```bash
# start the prebuilt server (scratchpad binary; does not touch /Applications/Ollama.app)
DYLD_LIBRARY_PATH=<scratchpad>/ollama-new OLLAMA_HOST=127.0.0.1:11434 <scratchpad>/ollama-new/ollama serve &
# run the live battery through Mastra
LOCAL_LLM_BASE_URL=http://localhost:11434/v1 LOCAL_LLM_MODEL=qwen3.5:2b LOCAL_LLM_API_KEY=ollama \
  node src/mastra/live-verify.ts
```

**No push, no deploy. `localhost:8080` preserved (200 throughout). Other agents' files/processes untouched.**
