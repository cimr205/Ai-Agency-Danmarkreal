# Finance & Ops — Owner Decisions (local, to avoid concurrent writes to the shared OWNER_DECISIONS.md)

The coordinator may later fold these into the shared `OWNER_DECISIONS.md`.

| # | Question | Why it matters | Blocks | Raised |
|---|---|---|---|---|
| FO-1 | Which tenant(s) have a connected e-conomic or Dinero account, and may their sandbox/test credentials be used for a live `push_invoice`/`push_customer` test? | These integrations are real and money-/record-affecting; no connected tenant/creds exist in this environment. | Live accounting push (stays NOT_TESTED without this) | 2026-10-18 |
| FO-2 | What automation level is permitted for `invoice.create` drafts and dunning (reminder) drafts — DRAFT_APPROVAL only, or AUTO for low amounts under a threshold? | Controls whether invoice/reminder drafts can be auto-proposed. Payments/sends always require approval. | Invoice/dunning automation level | 2026-10-18 |
| FO-3 | Customer-facing messages (delay notices, payment reminders) — may the agent draft them for approval, and through which channel (email.send vs manual)? | Customer contact is high-sensitivity. | Customer-message drafts | 2026-10-18 |
| FO-4 | Price changes: confirmed they remain proposals until a separate explicit owner decision. Who approves, and is there a pricing table to compare against? | Competitive pricing analysis needs a source of truth; price changes must not auto-apply. | Pricing recommendations → changes | 2026-10-18 |
| FO-5 | Selected country/market for competitive analysis (prices, currency, VAT, competitors) and which public sources are authorized? | Determines verifiable-source competitor comparison scope. | Competitive/new-market analysis | 2026-10-18 |
