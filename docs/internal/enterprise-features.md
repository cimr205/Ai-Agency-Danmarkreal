# Enterprise Feature Spec (No Telephony)

## Purpose
Define the enterprise capabilities required to justify premium pricing and
reduce churn risk. This spec is aligned with the CRM/HR ownership boundaries.

## RBAC / Permissions
- Role types: Owner, Admin, Manager, Agent, ReadOnly.
- Scope: company, team, pipeline, record-level (lead/deal/task/activity).
- Permission matrix:
  - CRUD on leads/deals/tasks/activities.
  - Export permissions separated from read.
  - Admin-only settings (integrations, domains, branding, SSO).
- Audit requirement: all permission changes are logged.

## Audit Log
- Events: create/update/delete for leads, deals, tasks, activities, emails, calls
  (calls only as data objects, not telephony features).
- Metadata: actor, timestamp, before/after diff, source (UI/API).
- Export: CSV and JSON with filters (user, date, object).

## SSO (SAML/OIDC)
- Support: Azure AD, Okta, Google Workspace.
- Enforce SSO for all users in Enterprise tier.
- SCIM (optional phase 2): user provisioning/deprovisioning.

## Compliance Pack
- Data retention policies per company (e.g., 6, 12, 24 months).
- GDPR tooling: data export, data delete, legal hold.
- DPA and documentation templates for enterprise sales.

## White-Label
- Custom domain per tenant.
- Branding: logo, primary colors, favicon, email footer.
- No provider exposure in UI (aligns with internal architecture constraints).

## Security Baseline
- MFA for admins and optional for all users.
- IP allowlist for Enterprise tenants.
- Access logs for login and session activity.

## Release Sequencing
1. RBAC + Audit Log (foundation)
2. SSO enforcement
3. Compliance Pack
4. White-Label + custom domain
5. Security baseline (MFA + IP allowlist)


