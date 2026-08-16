# Platform Overview (CRM + HR)

## Structure
- CRM frontend: `src/`
- CRM backend: `server/`
- HRMS (Django): `hr/`

## Data ownership
- CRM owns: leads, deals, tasks, activities, inbox, calendar.
- HRMS owns: employee/HR data within `hr/`.

## Integration intent
These systems run independently. Shared SSO/integration can be added later without changing ownership boundaries.

