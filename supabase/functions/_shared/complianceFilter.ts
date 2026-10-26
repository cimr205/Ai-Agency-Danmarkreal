// Compliance mapping + gating for lead-gen chat. See DECISIONS.md section 4/6 and the
// (new, appended) "cvrapi.dk field verification" section for how this was derived, and
// supabase/functions/_shared/leadSource.ts for the ComplianceFlags contract.
//
// Governs future UI copy/gating ONLY. This repo must never grow an email-sender: per
// markedsføringsloven §10, cold B2C/B2B email is not permitted without prior consent, and the
// mission brief forbids building one. Phone calls to businesses are legal in Denmark without
// prior consent (§10 targets email/SMS/automated calls, not a human placing a business call),
// so `callsAllowed` below is not itself the controversial bit — `emailAllowed` always being
// false is the point of this file.

import type { ComplianceFlags } from "./leadSource.ts";

/**
 * Shape of the subset of cvrapi.dk's response (https://cvrapi.dk/api?...&version=6) this cares
 * about. Verified via a live call to https://cvrapi.dk/api?search=novozymes&country=dk&format=json&version=6
 * on 2026-10-26: the API DOES return an explicit boolean `protected` field (both `true` and
 * `false` observed across a company's productionunits in the same response) — this is Denmark's
 * "reklamebeskyttelse" / "navne- og adressebeskyttelse" flag. There is no separate top-level
 * "status" string; liveness is inferred from `enddate` (null = still active).
 */
export interface CvrApiResponseSubset {
  vat?: number | string;
  name?: string;
  protected?: boolean | null; // reklamebeskyttelse, when cvrapi.dk includes it
  startdate?: string | null;
  enddate?: string | null; // non-null => the unit/company has ceased
  companycode?: number;
  companydesc?: string; // virksomhedsform, e.g. "Aktieselskab", "Enkeltmandsvirksomhed"
}

/**
 * Maps a cvrapi.dk response into our ComplianceFlags. Critical rule: `reklamebeskyttet` is only
 * ever `false` when the source EXPLICITLY returned `protected === false`. Any other case
 * (field absent, response missing, lookup failed, non-boolean) must map to `null` (unknown) —
 * never assume "not protected" by default, because that would make it look safe to contact
 * when we simply don't know.
 */
export function getComplianceFlags(cvrResponse: CvrApiResponseSubset | null | undefined): ComplianceFlags {
  let reklamebeskyttet: boolean | null = null;
  if (cvrResponse && typeof cvrResponse.protected === "boolean") {
    reklamebeskyttet = cvrResponse.protected;
  }

  let cvrStatus: string | null = null;
  if (cvrResponse) {
    if (cvrResponse.enddate === null || cvrResponse.enddate === undefined) {
      // Only infer "aktiv" when we actually have a response to infer it from.
      if (cvrResponse.vat !== undefined) cvrStatus = "aktiv";
    } else if (typeof cvrResponse.enddate === "string" && cvrResponse.enddate.trim() !== "") {
      // cvrapi.dk cannot distinguish voluntary closure from tvangsopløsning — "ophørt" is the
      // honest, non-overclaiming label for any non-null enddate.
      cvrStatus = "ophørt";
    }
  }

  return {
    reklamebeskyttet,
    // cvrapi.dk never returns marketing-consent data — this is always "ukendt" from this source.
    // A future consent-capture flow (e.g. the lead replying to an inbound call) is the only
    // legitimate way to move this to "givet"/"nej"; never set it heuristically.
    samtykke_status: "ukendt",
    cvr_status: cvrStatus,
  };
}

export type OutboundChannel = "call" | "email";

export interface OutboundPermission {
  allowed: boolean;
  reason: string;
}

/**
 * Pure decision function: given a lead's compliance flags, is a given outbound channel
 * permitted? This governs future UI copy/gating (e.g. disabling an "send email" button that
 * does not and must not exist, or showing a reklamebeskyttelse warning badge before a call) —
 * it is NOT wired to any sender, because no email-sender exists or should ever be built here.
 */
export function getOutboundPermission(flags: ComplianceFlags, channel: OutboundChannel): OutboundPermission {
  if (channel === "email") {
    // Markedsføringsloven §10: unsolicited commercial email requires prior consent. We never
    // capture consent before first contact, so cold email is categorically disallowed —
    // independent of reklamebeskyttelse/cvr_status. There is intentionally no path that
    // returns allowed: true here.
    return { allowed: false, reason: "cold_email_forbidden_markedsfoeringsloven_10" };
  }

  // channel === "call": phone calls to businesses don't require prior opt-in under §10 the way
  // email does, but a dissolved/ceased company and explicit reklamebeskyttelse both warrant a
  // warning-level gate in the UI (not a hard legal block — reklamebeskyttelse chiefly covers
  // registry-sourced direct mail/address use, not voice calls by a human).
  if (flags.cvr_status === "ophørt") {
    return { allowed: false, reason: "company_ceased_per_cvr" };
  }
  if (flags.reklamebeskyttet === true) {
    return { allowed: true, reason: "allowed_but_flag_reklamebeskyttelse_in_ui" };
  }
  if (flags.reklamebeskyttet === null) {
    return { allowed: true, reason: "allowed_but_protection_status_unknown" };
  }
  return { allowed: true, reason: "allowed" };
}

/**
 * Convenience batch helper mirroring the per-lead function above, for call sites that already
 * hold parallel (lead, complianceFlags) arrays.
 */
export function applyComplianceFilter<T>(
  leads: T[],
  flags: ComplianceFlags[],
  channel: OutboundChannel,
): { lead: T; flags: ComplianceFlags; permission: OutboundPermission }[] {
  return leads.map((lead, i) => ({
    lead,
    flags: flags[i],
    permission: getOutboundPermission(flags[i], channel),
  }));
}

export interface LeadComplianceInput {
  cvrNumber?: string;
  activeStatus?: string;
}

/**
 * Adapter for the chat lead-gen pipeline, which only has lead-derived fields (a CVR number and a
 * free-text active-status), NOT a full cvrapi.dk response. Without the `protected` field we can
 * never claim "not reklamebeskyttet", so reklamebeskyttet stays `null` (unknown — never treated as
 * safe to contact). cvr_status is inferred from the free-text status only when unambiguous.
 */
export function mapComplianceFlags(input: LeadComplianceInput): ComplianceFlags {
  let cvr_status: string | null = null;
  const s = (input.activeStatus || "").toLowerCase();
  if (/(aktiv|active|normal)/.test(s)) cvr_status = "aktiv";
  else if (/(ophørt|ceased|lukket|tvangs|konkurs)/.test(s)) cvr_status = "ophørt";
  return { reklamebeskyttet: null, samtykke_status: "ukendt", cvr_status };
}
