# Integrations Roadmap (No Telephony)

## Goals
Increase stickiness and justify higher pricing by connecting CRM + HR to
the daily workflows of customers. This excludes telephony by design.

## Phase 1 - Core Productivity (0-2 months)
- Email + calendar bi-directional sync (Google Workspace, Microsoft 365).
- Email tracking and activity logging to CRM activities.
- Basic webhooks for lead/deal/task events.

## Phase 2 - Finance (2-4 months)
- Accounting/ERP integrations:
  - e-conomic (DK)
  - Dinero (DK)
  - QuickBooks/Xero (international option)
- Use cases: invoice status, payment sync, customer status flags.

## Phase 3 - HR + Payroll (4-6 months)
- HR sync with internal HRMS:
  - employee_id mapping and org structure sync
  - user provisioning (non-SSO fallback)
- Payroll exports (CSV/JSON) and activity-based reporting.

## Phase 4 - Documents + Storage (6-8 months)
- Document templates and signature flows:
  - Oneflow, DocuSign, or a lightweight in-house template flow
- File storage integrations:
  - Google Drive, OneDrive

## Integration Packaging
- "Integrations Pack" includes Phase 1 + one Phase 2 connector.
- "Enterprise Pack" includes Phase 1-4 plus API access.

## Dependencies
- Audit log for data changes (enterprise features).
- RBAC for integration permissions.
- Admin settings pages for integration setup.


