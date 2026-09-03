-- Removes the per-company OpenAI/Groq connection system entirely, per
-- explicit instruction to use only the approved open-source AI stack
-- (Ollama/llama.cpp — no hosted LLM APIs of any kind). AI now runs on one
-- shared, self-hosted Ollama instance configured via LOCAL_LLM_BASE_URL /
-- LOCAL_LLM_MODEL (see supabase/functions/_shared/aiConnection.ts) — there
-- is no more per-tenant "connect your AI provider" credential to store.
drop table if exists public.openai_accounts;
