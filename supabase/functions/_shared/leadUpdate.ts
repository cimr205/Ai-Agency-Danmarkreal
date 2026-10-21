export function validateLeadUpdate(input: Record<string, unknown>): void {
  const fields = ["last_touched_at", "next_followup_at", "notes", "status", "phone"];
  if (!fields.some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
    throw new Error("Der er ingen leadoplysninger at opdatere");
  }
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const value = input[field];
    if (field === "status") {
      if (typeof value !== "string" || !["new", "contacted", "qualified", "unqualified", "customer"].includes(value)) {
        throw new Error("Ugyldig leadstatus");
      }
    } else if (field.endsWith("_at")) {
      if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) {
        throw new Error(`${field} skal være et ISO-tidspunkt med tidszone eller null`);
      }
    } else if (value !== null && typeof value !== "string") {
      throw new Error(`${field} skal være tekst eller null`);
    }
  }
}
