import { describe, it, expect } from "vitest";
import { normalizeProfileUrl, clampNote, buildOutreachRows, type LeadGenResultForOutreach } from "../../supabase/functions/_shared/linkedinOutreach";

describe("normalizeProfileUrl", () => {
  it("accepts linkedin.com/in/ URLs and strips query strings/trailing path", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/jane-doe-12345/")).toBe("https://www.linkedin.com/in/jane-doe-12345");
    expect(normalizeProfileUrl("https://linkedin.com/in/jane-doe?trk=public_profile")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(normalizeProfileUrl("http://dk.linkedin.com/in/Jane-Doe")).toBe("https://www.linkedin.com/in/jane-doe");
  });

  it("lowercases the handle so case variants dedupe to the same profile", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/JaneDoe")).toBe(normalizeProfileUrl("https://www.linkedin.com/in/janedoe"));
  });

  it("treats a trailing slash and query string as the same profile", () => {
    const a = normalizeProfileUrl("https://www.linkedin.com/in/jane-doe/");
    const b = normalizeProfileUrl("https://www.linkedin.com/in/jane-doe?originalSubdomain=dk");
    expect(a).toBe(b);
  });

  it("rejects non-profile LinkedIn URLs and non-LinkedIn URLs", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/company/acme")).toBeNull();
    expect(normalizeProfileUrl("https://example.com/in/jane-doe")).toBeNull();
    expect(normalizeProfileUrl("not a url")).toBeNull();
  });

  it("handles null/undefined/empty input", () => {
    expect(normalizeProfileUrl(null)).toBeNull();
    expect(normalizeProfileUrl(undefined)).toBeNull();
    expect(normalizeProfileUrl("")).toBeNull();
    expect(normalizeProfileUrl("   ")).toBeNull();
  });
});

describe("clampNote", () => {
  it("leaves short notes untouched", () => {
    expect(clampNote("Hej Jane, ser frem til at forbinde!")).toBe("Hej Jane, ser frem til at forbinde!");
  });

  it("truncates to at most 300 characters including the ellipsis", () => {
    const long = "Hej ".repeat(100); // 400 chars
    const out = clampNote(long);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not cut a word in half — truncates at the last whole word", () => {
    const note = "a".repeat(295) + " helloworld";
    const out = clampNote(note);
    expect(out.length).toBeLessThanOrEqual(300);
    // the trailing partial word "hellow..." must not appear cut mid-word
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, -1).trimEnd().endsWith("helloworld")).toBe(false);
  });

  it("respects a custom max length", () => {
    expect(clampNote("hello world", 5).length).toBeLessThanOrEqual(5);
  });

  it("trims surrounding whitespace before measuring length", () => {
    expect(clampNote("  hi  ")).toBe("hi");
  });
});

describe("buildOutreachRows", () => {
  const base: LeadGenResultForOutreach = {
    id: "r1", company_name: "Acme ApS", contact_person_name: "Jane Doe",
    contact_role: "CTO", linkedin_url: "https://www.linkedin.com/in/jane-doe", imported_lead_id: null,
  };

  it("builds one row per result with a usable LinkedIn URL", () => {
    const { rows, noProfile } = buildOutreachRows([base], "company-1", "user-1");
    expect(rows).toHaveLength(1);
    expect(noProfile).toBe(0);
    expect(rows[0]).toMatchObject({
      company_id: "company-1",
      lead_gen_result_id: "r1",
      contact_name: "Jane Doe",
      contact_role: "CTO",
      company_name: "Acme ApS",
      linkedin_url: "https://www.linkedin.com/in/jane-doe",
      created_by: "user-1",
    });
  });

  it("counts results with no usable profile URL instead of producing a row", () => {
    const noUrl = { ...base, id: "r2", linkedin_url: null };
    const badUrl = { ...base, id: "r3", linkedin_url: "https://example.com/not-linkedin" };
    const { rows, noProfile } = buildOutreachRows([noUrl, badUrl], "company-1", "user-1");
    expect(rows).toHaveLength(0);
    expect(noProfile).toBe(2);
  });

  it("dedupes results that normalize to the same LinkedIn profile", () => {
    const variantCase = { ...base, id: "r2", linkedin_url: "https://linkedin.com/in/Jane-Doe?trk=x" };
    const { rows, noProfile } = buildOutreachRows([base, variantCase], "company-1", "user-1");
    expect(rows).toHaveLength(1);
    expect(noProfile).toBe(0);
    // first match wins
    expect(rows[0].lead_gen_result_id).toBe("r1");
  });

  it("keeps rows for distinct profiles separate", () => {
    const other = { ...base, id: "r2", contact_person_name: "John Smith", linkedin_url: "https://www.linkedin.com/in/john-smith" };
    const { rows } = buildOutreachRows([base, other], "company-1", "user-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.lead_gen_result_id).sort()).toEqual(["r1", "r2"]);
  });

  it("carries the imported_lead_id through as customer_id when present", () => {
    const linked = { ...base, imported_lead_id: "customer-42" };
    const { rows } = buildOutreachRows([linked], "company-1", "user-1");
    expect(rows[0].customer_id).toBe("customer-42");
  });

  it("returns empty output for an empty input list", () => {
    const { rows, noProfile } = buildOutreachRows([], "company-1", "user-1");
    expect(rows).toHaveLength(0);
    expect(noProfile).toBe(0);
  });
});
