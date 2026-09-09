-- External-id bookkeeping for the Composio-backed CRM sync (HubSpot / Pipedrive /
-- Salesforce). Mirrors the accounting integrations pattern
-- (20260817000001_accounting_integrations.sql): nullable external-id columns on
-- customers, plus a per-company unique index so repeat syncs can never create
-- duplicate leads for the same external contact.

ALTER TABLE public.customers
  ADD COLUMN hubspot_contact_id text,
  ADD COLUMN pipedrive_person_id text,
  ADD COLUMN salesforce_contact_id text,
  ADD COLUMN crm_sync_synced_at timestamp with time zone;

CREATE UNIQUE INDEX customers_hubspot_contact_id_idx ON public.customers (company_id, hubspot_contact_id) WHERE hubspot_contact_id IS NOT NULL;
CREATE UNIQUE INDEX customers_pipedrive_person_id_idx ON public.customers (company_id, pipedrive_person_id) WHERE pipedrive_person_id IS NOT NULL;
CREATE UNIQUE INDEX customers_salesforce_contact_id_idx ON public.customers (company_id, salesforce_contact_id) WHERE salesforce_contact_id IS NOT NULL;
