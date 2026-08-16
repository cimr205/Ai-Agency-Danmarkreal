# CRM + HR Platform

This repository combines two systems:

1) **CRM Platform (frontend + backend)**
2) **HRMS Platform (Django)**

Both are kept in the same repo so the owner can manage a full business platform in one place.

---

## CRM Platform

### Frontend (Vite + React)
- Source: `src/`
- Run:
  ```bash
  npm install
  npm run dev
  ```

### Backend (Node + TypeScript)
- Source: `server/`
- Run:
  ```bash
  cd server
  npm install
  npm run dev
  ```

### Core features
- Auth, admin overview, invitations
- Leads, deals, pipeline, tasks
- Inbox (messages + notifications)
- Calendar (personal + company)

---

## HRMS Platform (Django)

The HR system lives at repo root (Django project).  
Main entrypoint: `manage.py`

### Run locally
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.dist .env
python manage.py migrate
python manage.py runserver
```

### Notes
- Django apps: `employee`, `recruitment`, `payroll`, `attendance`, etc.
- Static assets: `static/`
- Templates: `templates/`

---

## Repo Rules
- `.env` files are ignored and must never be committed.
- CRM and HR systems run independently for now.
