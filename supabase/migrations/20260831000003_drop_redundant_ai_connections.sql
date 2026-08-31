-- Correction: an existing per-company OpenAI connection table
-- (public.openai_accounts, backing the voice agent feature) already did
-- exactly what this new table was built for. Consolidating onto the
-- existing table rather than running two parallel "connect your AI
-- provider" systems.
drop table if exists public.ai_connections;
