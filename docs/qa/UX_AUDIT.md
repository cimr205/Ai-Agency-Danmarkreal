# AI Agency Danmark — UX Audit

_Evidence-based. A module is scored **only if it was actually exercised**. Unreachable (auth-blocked) modules are listed as NOT ASSESSED — no score is invented._
_Last updated: 2026-10-17 · Branch: `feature/frontend-operating-system`_

---

## Scored modules (exercised with evidence)

| Module | Score | Basis |
|---|---:|---|
| **auth** (login / signup / forgot / join / register) | **91 / 100** | Clean render on desktop/tablet/mobile; 0 console errors; 0 critical a11y after BUG-001/002 fixes; clear invalid-login feedback; full keyboard operability (focus order, visible ring, Enter submits); Google + email paths present. Deductions: residual serious/moderate axe items; no inline password-strength meter on signup. |
| **legal** (privacy / terms / dpa) | **90 / 100** | Clean render on 3 viewports; 0 console errors; 0 critical a11y; readable long-form. Deductions: no in-page anchor nav / table of contents; print styling unverified. |

All other modules: **NOT ASSESSED** — behind authentication (QA-BLOCK-001). No UX score is asserted for a surface that was not run.

---

## Product-level observations (from code + reachable surface)

These are heuristics a business owner would care about, grounded in the code and the public surface — not a substitute for authenticated testing.

1. **Trust / security (P0).** The email viewer rendered attacker-controlled `body_html` without sanitization (QA-001). Beyond the security hole, raw third-party HTML in-page is a UX/brand risk (layout-breaking emails). Fixed by isolating email content in a sandboxed iframe — also the correct UX containment. _Needs authenticated visual confirmation._
2. **Information architecture is broad.** ~17 modules / ~62 routes (CRM, finance, HR, email, marketing, AI, workspace, admin). Strong "Business OS" ambition. Risk: discoverability and "what do I do next?" — can't be judged without the authenticated dashboard/onboarding. Flagged for the authenticated pass.
3. **i18n discipline is good.** EN/DA/DE message catalogs exist and locale integrity passed (da/de resilience specs). CLAUDE.md mandates no hardcoded strings; spot-checks in EmailsPage show some inline `locale === 'da' ? …` ternaries (e.g. "Kontakt"/"Contact") rather than `t()` keys — minor i18n debt (P3), not user-blocking.
4. **Onboarding exists** (`app/onboarding`, GuidedTour) and a recent fix addressed "blank form after company exists" — suggests first-run UX has been iterated. Needs authenticated verification of the empty→first-value path.
5. **Accessibility baseline is healthy** on the public surface (critical a11y clean after fixes). Recommend extending axe checks into authenticated pages once reachable.

---

## Recommended UX checks for the authenticated pass (once unblocked)
- Dashboard: is the primary next action obvious within 5s? Are AI recommendations grounded in real tenant data or placeholders?
- Empty states across CRM/finance/HR: helpful "create your first …" guidance vs blank tables.
- Error actionability: do failed mutations show a clear, recoverable message (not just a toast with a raw error)?
- Flow continuity: Lead→Deal→Quote→Invoice→Payment without dead-ends or manual re-navigation.
- Mobile layout of data-dense tables (finance, HR payroll).
