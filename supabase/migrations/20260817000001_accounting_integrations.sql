-- Dinero and e-conomic accounting integrations
-- Mirrors the meta_connections pattern: one connection row per company,
-- plus external-id columns on customers/invoices for two-way sync bookkeeping.

CREATE TABLE public.dinero_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    dinero_organization_id text NOT NULL,
    dinero_organization_name text,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'connected'::text NOT NULL,
    last_synced_at timestamp with time zone,
    last_sync_error text,
    connected_by uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (company_id)
);

CREATE TABLE public.economic_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agreement_grant_token text NOT NULL,
    agreement_number integer,
    company_name text,
    status text DEFAULT 'connected'::text NOT NULL,
    last_synced_at timestamp with time zone,
    last_sync_error text,
    connected_by uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (company_id)
);

ALTER TABLE public.dinero_connections
  ADD CONSTRAINT dinero_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.economic_connections
  ADD CONSTRAINT economic_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- External-id bookkeeping for two-way sync (nullable: not every customer/invoice is synced)
ALTER TABLE public.customers
  ADD COLUMN dinero_contact_guid text,
  ADD COLUMN economic_customer_number integer,
  ADD COLUMN accounting_synced_at timestamp with time zone;

ALTER TABLE public.invoices
  ADD COLUMN dinero_voucher_guid text,
  ADD COLUMN economic_invoice_number integer,
  ADD COLUMN accounting_synced_at timestamp with time zone;

CREATE UNIQUE INDEX customers_dinero_contact_guid_idx ON public.customers (company_id, dinero_contact_guid) WHERE dinero_contact_guid IS NOT NULL;
CREATE UNIQUE INDEX customers_economic_customer_number_idx ON public.customers (company_id, economic_customer_number) WHERE economic_customer_number IS NOT NULL;
CREATE UNIQUE INDEX invoices_dinero_voucher_guid_idx ON public.invoices (company_id, dinero_voucher_guid) WHERE dinero_voucher_guid IS NOT NULL;
CREATE UNIQUE INDEX invoices_economic_invoice_number_idx ON public.invoices (company_id, economic_invoice_number) WHERE economic_invoice_number IS NOT NULL;

ALTER TABLE public.dinero_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economic_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can delete their company dinero connection" ON public.dinero_connections AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can view their company dinero connection" ON public.dinero_connections AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can insert dinero connection for their company" ON public.dinero_connections AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can update their company dinero connection" ON public.dinero_connections AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));

CREATE POLICY "Admins can delete their company economic connection" ON public.economic_connections AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can view their company economic connection" ON public.economic_connections AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can insert economic connection for their company" ON public.economic_connections AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can update their company economic connection" ON public.economic_connections AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
