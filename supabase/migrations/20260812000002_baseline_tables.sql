-- Baseline: tables
-- Consolidated from schema-recon reconstruction, verified applied against vbxlpxhvojlaisxcipyh

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    user_id uuid NOT NULL,
    action_type text NOT NULL,
    entity_type text,
    entity_id text,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_generations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    generation_type text DEFAULT 'image'::text NOT NULL,
    prompt text NOT NULL,
    negative_prompt text,
    model_used text,
    status text DEFAULT 'pending'::text NOT NULL,
    output_url text,
    output_storage_path text,
    thumbnail_url text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE TABLE public.attendance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_profile_id uuid NOT NULL,
    company_id uuid NOT NULL,
    check_in timestamp with time zone DEFAULT now() NOT NULL,
    check_out timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    break_minutes integer DEFAULT 0
);

CREATE TABLE public.autopilot_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    action_id text NOT NULL,
    action_type text NOT NULL,
    category text NOT NULL,
    entity_id text,
    entity_type text,
    headline text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    execution_function text,
    execution_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_at timestamp with time zone,
    rationale text,
    payload jsonb DEFAULT '{}'::jsonb,
    result jsonb,
    triggered_by_event uuid,
    suggested_by text DEFAULT 'autopilot'::text,
    reviewed_by uuid
);

CREATE TABLE public.bulk_email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    body_preview text,
    total_recipients integer DEFAULT 0 NOT NULL,
    total_sent integer DEFAULT 0 NOT NULL,
    total_errors integer DEFAULT 0 NOT NULL,
    total_opened integer DEFAULT 0 NOT NULL,
    total_unsubscribed integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'sending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    total_replied integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.bulk_email_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    name text,
    status text DEFAULT 'sent'::text NOT NULL,
    opened_at timestamp with time zone,
    open_count integer DEFAULT 0 NOT NULL,
    unsubscribed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    replied_at timestamp with time zone
);

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    employee_profile_id uuid,
    title text NOT NULL,
    description text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    is_private boolean DEFAULT false,
    event_type text DEFAULT 'meeting'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);

CREATE TABLE public.cold_caller_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL,
    session_started_at timestamp with time zone DEFAULT now(),
    session_ended_at timestamp with time zone,
    duration_seconds integer DEFAULT 0,
    calls_made integer DEFAULT 0,
    leads_created integer DEFAULT 0
);

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    cvr text,
    address text,
    phone text,
    email text,
    website text,
    onboarding_completed boolean DEFAULT false NOT NULL,
    onboarding_step integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activation_code text,
    status text DEFAULT 'setup'::text,
    mode text DEFAULT 'setup'::text,
    industry text,
    company_size text,
    compliance_checklist jsonb DEFAULT '{"hr_module": false, "admin_setup": false, "company_info": false, "roles_defined": false, "first_employee": false}'::jsonb,
    stripe_customer_id text,
    stripe_subscription_id text,
    trial_ends_at timestamp with time zone,
    seat_limit_trial integer DEFAULT 5,
    purchased_seats integer DEFAULT 0,
    subscription_status text DEFAULT 'none'::text,
    logo_url text,
    automation_rules jsonb DEFAULT '[]'::jsonb,
    lead_scoring_config jsonb DEFAULT '{"deal_created": 10, "email_opened": 1, "email_clicked": 2, "email_replied": 5, "website_visited": 3}'::jsonb,
    disabled boolean DEFAULT false NOT NULL
);

CREATE TABLE public.consent_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    anonymous_id text,
    consent_type text NOT NULL,
    consent_value boolean NOT NULL,
    ip_address text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contact_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    message text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    address text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    country text DEFAULT 'DK'::text,
    customer_type text DEFAULT 'business'::text,
    vat_number text
);

CREATE TABLE public.cvr_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    cvr text NOT NULL,
    name text NOT NULL,
    address text,
    zipcode text,
    city text,
    phone text,
    email text,
    website text,
    industry text,
    industrycode text,
    employees text,
    companyform text,
    cvr_status text,
    source text DEFAULT 'cvrapi'::text,
    imported_as_lead boolean DEFAULT false,
    imported_lead_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL
);

CREATE TABLE public.data_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by uuid,
    notes text
);

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid,
    title text NOT NULL,
    value numeric(15,2) DEFAULT 0 NOT NULL,
    stage text DEFAULT 'discovery'::text NOT NULL,
    owner_id uuid,
    expected_close_date date,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    email_address text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    token_expires_at timestamp with time zone,
    scopes text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_synced_at timestamp with time zone,
    status text DEFAULT 'connected'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    template_name text NOT NULL,
    recipient_email text NOT NULL,
    status text NOT NULL,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_send_state (
    id integer DEFAULT 1 NOT NULL,
    retry_after_until timestamp with time zone,
    batch_size integer DEFAULT 10 NOT NULL,
    send_delay_ms integer DEFAULT 200 NOT NULL,
    auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
    transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'general'::text,
    variables jsonb DEFAULT '[]'::jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_unsubscribe_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);

CREATE TABLE public.emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_account_id uuid NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    gmail_id text NOT NULL,
    thread_id text,
    from_address text NOT NULL,
    from_name text,
    to_addresses jsonb DEFAULT '[]'::jsonb,
    cc_addresses jsonb DEFAULT '[]'::jsonb,
    subject text,
    snippet text,
    body_text text,
    body_html text,
    labels jsonb DEFAULT '[]'::jsonb,
    is_read boolean DEFAULT false,
    is_starred boolean DEFAULT false,
    is_important boolean DEFAULT false,
    has_attachments boolean DEFAULT false,
    ai_priority text,
    ai_suggested_todo text,
    received_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.employee_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    company_id uuid NOT NULL,
    employee_id text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    position text,
    department text,
    phone text,
    avatar_url text,
    start_date date DEFAULT CURRENT_DATE,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone
);

CREATE TABLE public.event_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_pattern text NOT NULL,
    action_type text NOT NULL,
    action_ref text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.icp_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    name text NOT NULL,
    description text,
    industry text[] DEFAULT '{}'::text[],
    sub_industries text[] DEFAULT '{}'::text[],
    target_countries text[] DEFAULT '{}'::text[],
    target_regions text[] DEFAULT '{}'::text[],
    target_cities text[] DEFAULT '{}'::text[],
    min_employees integer,
    max_employees integer,
    min_revenue numeric,
    max_revenue numeric,
    business_types text[] DEFAULT '{}'::text[],
    target_roles text[] DEFAULT '{}'::text[],
    pain_points text[] DEFAULT '{}'::text[],
    desired_services text[] DEFAULT '{}'::text[],
    preferred_languages text[] DEFAULT '{}'::text[],
    budget_level text DEFAULT 'medium'::text,
    technology_signals text[] DEFAULT '{}'::text[],
    exclude_industries text[] DEFAULT '{}'::text[],
    exclude_keywords text[] DEFAULT '{}'::text[],
    must_have_criteria text[] DEFAULT '{}'::text[],
    nice_to_have_criteria text[] DEFAULT '{}'::text[],
    weight_industry integer DEFAULT 3 NOT NULL,
    weight_location integer DEFAULT 3 NOT NULL,
    weight_company_size integer DEFAULT 3 NOT NULL,
    weight_role_fit integer DEFAULT 2 NOT NULL,
    weight_pain_points integer DEFAULT 2 NOT NULL,
    weight_budget_fit integer DEFAULT 2 NOT NULL,
    weight_service_fit integer DEFAULT 2 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.icp_search_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    icp_profile_id uuid NOT NULL,
    created_by uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    search_query text,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    requested_lead_count integer DEFAULT 50 NOT NULL,
    found_count integer DEFAULT 0 NOT NULL,
    scored_count integer DEFAULT 0 NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    progress_label text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    account_label text,
    scopes text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    connected_by uuid,
    connected_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    role app_role DEFAULT 'employee'::app_role NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone
);

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    invoice_number text NOT NULL,
    amount numeric(15,2) NOT NULL,
    status invoice_status DEFAULT 'draft'::invoice_status NOT NULL,
    due_date date,
    issued_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lines jsonb DEFAULT '[]'::jsonb,
    subtotal numeric DEFAULT 0,
    vat_rate numeric DEFAULT 25,
    vat_amount numeric DEFAULT 0,
    customer_country text DEFAULT 'DK'::text,
    customer_type text DEFAULT 'business'::text,
    vat_note text
);

CREATE TABLE public.lead_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3B82F6'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_gen_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    company_id uuid NOT NULL,
    company_name text,
    registration_number text,
    website text,
    business_email text,
    email_status text DEFAULT 'missing'::text,
    phone text,
    address text,
    city text,
    country text,
    industry text,
    description text,
    social_links jsonb DEFAULT '[]'::jsonb,
    employee_count text,
    lead_score integer DEFAULT 0,
    active_status text DEFAULT 'uncertain'::text,
    source_url text,
    source_registry text,
    imported boolean DEFAULT false NOT NULL,
    imported_lead_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_person_name text,
    contact_role text,
    email_type text DEFAULT 'unknown'::text,
    email_confidence integer DEFAULT 0,
    domain_confidence integer DEFAULT 0,
    source_list text[] DEFAULT '{}'::text[],
    linkedin_url text,
    company_linkedin text,
    google_maps_url text,
    review_count integer DEFAULT 0,
    rating numeric(2,1),
    technologies_detected text[]
);

CREATE TABLE public.lead_gen_saved_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    query text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_gen_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    query text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    progress_label text,
    results_count integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE TABLE public.lead_icp_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    icp_profile_id uuid NOT NULL,
    total_score integer DEFAULT 0 NOT NULL,
    industry_score integer DEFAULT 0 NOT NULL,
    location_score integer DEFAULT 0 NOT NULL,
    company_size_score integer DEFAULT 0 NOT NULL,
    role_score integer DEFAULT 0 NOT NULL,
    pain_point_score integer DEFAULT 0 NOT NULL,
    service_fit_score integer DEFAULT 0 NOT NULL,
    budget_fit_score integer DEFAULT 0 NOT NULL,
    tech_fit_score integer DEFAULT 0 NOT NULL,
    confidence_score integer DEFAULT 50 NOT NULL,
    match_reasons text[] DEFAULT '{}'::text[],
    red_flags text[] DEFAULT '{}'::text[],
    recommended_action text,
    scored_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    status lead_status DEFAULT 'new'::lead_status NOT NULL,
    score integer DEFAULT 0,
    owner_id uuid,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    value numeric DEFAULT 0,
    company_name text,
    next_followup_at timestamp with time zone,
    last_touched_at timestamp with time zone DEFAULT now(),
    ai_recommendation text,
    ai_recommendation_at timestamp with time zone,
    currency text DEFAULT 'DKK'::text,
    import_batch_id uuid,
    tags text[] DEFAULT '{}'::text[],
    industry text,
    folder_id uuid,
    address text,
    city text
);

CREATE TABLE public.leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_profile_id uuid NOT NULL,
    type leave_type NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    status leave_status DEFAULT 'pending'::leave_status NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mcp_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text DEFAULT 'AI Client'::text NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    scopes text[] DEFAULT ARRAY['read'::text, 'write'::text] NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.meta_ad_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    meta_connection_id uuid NOT NULL,
    account_id text NOT NULL,
    account_name text,
    business_id text,
    business_name text,
    currency text,
    account_status integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.meta_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    meta_user_id text,
    meta_user_name text,
    access_token text NOT NULL,
    token_expires_at timestamp with time zone,
    status text DEFAULT 'connected'::text NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    read boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.openai_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    api_key text NOT NULL,
    status text DEFAULT 'connected'::text NOT NULL,
    last_tested_at timestamp with time zone,
    last_error text,
    connected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric(15,2) NOT NULL,
    status payment_status DEFAULT 'pending'::payment_status NOT NULL,
    payment_method text,
    paid_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payroll (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_profile_id uuid NOT NULL,
    period text NOT NULL,
    base_salary numeric(15,2) NOT NULL,
    bonus numeric(15,2) DEFAULT 0,
    deductions numeric(15,2) DEFAULT 0,
    net_salary numeric(15,2) NOT NULL,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.phone_provisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    phone_number text NOT NULL,
    twilio_sid text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    order_index integer NOT NULL,
    color text DEFAULT '#3B82F6'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    company_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    team_id uuid
);

CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    lead_id uuid,
    deal_id uuid,
    title text NOT NULL,
    lines jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    vat_rate numeric DEFAULT 25 NOT NULL,
    vat_amount numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    valid_until date,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recruitment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    position text NOT NULL,
    department text,
    description text,
    requirements text,
    salary_range text,
    status recruitment_status DEFAULT 'open'::recruitment_status NOT NULL,
    applicants_count integer DEFAULT 0,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.saved_lead_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plan_name text DEFAULT 'trial'::text NOT NULL,
    price_per_user numeric DEFAULT 0,
    billing_cycle text DEFAULT 'monthly'::text,
    active_user_count integer DEFAULT 0,
    status text DEFAULT 'trialing'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    renewal_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.suppressed_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status task_status DEFAULT 'pending'::task_status NOT NULL,
    priority text DEFAULT 'medium'::text,
    assigned_to uuid,
    due_date date,
    completed_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid,
    deal_id uuid
);

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    manager_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.twilio_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    account_sid text NOT NULL,
    auth_token text NOT NULL,
    friendly_name text,
    account_type text,
    status text DEFAULT 'active'::text,
    balance numeric DEFAULT 0,
    balance_currency text DEFAULT 'USD'::text,
    last_balance_check timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.usage_quotas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    quota_type text NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    max_count integer DEFAULT 1000 NOT NULL,
    period_start timestamp with time zone DEFAULT date_trunc('month'::text, now()) NOT NULL,
    period_end timestamp with time zone DEFAULT (date_trunc('month'::text, now()) + '1 mon'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role app_role DEFAULT 'employee'::app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    duration_seconds integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.voice_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    voice text DEFAULT 'alloy'::text NOT NULL,
    language text DEFAULT 'da'::text NOT NULL,
    system_prompt text NOT NULL,
    greeting text,
    max_duration_seconds integer DEFAULT 600 NOT NULL,
    temperature numeric DEFAULT 0.8 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.voice_call_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid NOT NULL,
    company_id uuid NOT NULL,
    event_type text NOT NULL,
    speaker text,
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    timestamp_ms integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.voice_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid,
    lead_id uuid,
    to_number text NOT NULL,
    from_number text,
    twilio_call_sid text,
    status text DEFAULT 'queued'::text NOT NULL,
    duration_seconds integer DEFAULT 0,
    recording_url text,
    summary text,
    cost_usd numeric DEFAULT 0,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    company_id uuid NOT NULL,
    event text NOT NULL,
    status text NOT NULL,
    status_code integer,
    response_body text,
    payload jsonb,
    attempt integer DEFAULT 1 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    event text NOT NULL,
    secret_key text,
    is_active boolean DEFAULT true NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    last_triggered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.work_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_profile_id uuid NOT NULL,
    title text,
    schedule_date date NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    break_minutes integer DEFAULT 0,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    status text DEFAULT 'scheduled'::text,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    trigger_event text NOT NULL,
    action_type text DEFAULT 'send_webhook'::text NOT NULL,
    webhook_url text,
    payload_fields text[] DEFAULT '{}'::text[],
    description text,
    is_active boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    run_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workforce_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    work_model text DEFAULT 'flexible'::text NOT NULL,
    default_start_time time without time zone DEFAULT '09:00:00'::time without time zone,
    default_end_time time without time zone DEFAULT '17:00:00'::time without time zone,
    weekly_hours numeric DEFAULT 37,
    track_breaks boolean DEFAULT false,
    overtime_threshold_daily numeric DEFAULT 9,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workspace_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    type text NOT NULL,
    source_module text NOT NULL,
    entity_type text,
    entity_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);