-- Baseline: enum types
-- Consolidated from schema-recon reconstruction, verified applied against vbxlpxhvojlaisxcipyh

CREATE TYPE public.app_role AS ENUM ('system_admin','company_admin','manager','employee','readonly','partner','owner');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','paid','overdue','cancelled');
CREATE TYPE public.lead_status AS ENUM ('new','contacted','qualified','unqualified','customer');
CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.leave_type AS ENUM ('vacation','sick','personal','other');
CREATE TYPE public.payment_status AS ENUM ('pending','completed','failed');
CREATE TYPE public.recruitment_status AS ENUM ('open','interviewing','closed','filled');
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','completed');
