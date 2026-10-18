/**
 * Channel-adapted post DRAFTER (read-only, propose-only).
 *
 * Takes a company-knowledge object + a channel and deterministically shapes a
 * channel-appropriate DRAFT (length cap, hashtag count, CTA). This is NOT live AI
 * generation — the real generator (`ai-generate`) needs gateway credentials that
 * are BLOCKED here; this module produces a structured draft/brief from supplied
 * facts so the pipeline is testable without a model and without inventing claims.
 *
 * Drafts are surfaced as `marketing.campaign.create` DRAFT proposals through the
 * propose-only bridge. Nothing is published. Channels without a real connector
 * (LinkedIn/TikTok) are draft-only and must be flagged BLOCKED for publishing.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export type Channel = "facebook" | "instagram" | "linkedin" | "tiktok" | "shorts";

export interface CompanyKnowledge {
  name: string;
  valueProposition: string;
  services?: string[];
  tone?: string; // e.g. "professional", "friendly"
  url?: string;
}

/** Per-channel formatting constraints (conservative, well-known limits). */
export const CHANNEL_SPEC: Readonly<Record<Channel, { maxChars: number; hashtags: number; publishSupported: boolean }>> =
  Object.freeze({
    facebook: { maxChars: 2000, hashtags: 3, publishSupported: true }, // via Meta (ads); organic BLOCKED (see MARKETING_STATUS)
    instagram: { maxChars: 2200, hashtags: 10, publishSupported: false },
    linkedin: { maxChars: 3000, hashtags: 3, publishSupported: false },
    tiktok: { maxChars: 2200, hashtags: 5, publishSupported: false },
    shorts: { maxChars: 1000, hashtags: 3, publishSupported: false },
  });

export interface PostDraft {
  channel: Channel;
  text: string;
  hashtags: string[];
  truncated: boolean;
  publishSupported: boolean;
}

function hashtagsFrom(k: CompanyKnowledge, n: number): string[] {
  const words = [k.name, ...(k.services ?? [])]
    .join(" ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const w of words) {
    const tag = "#" + w.toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
    if (tags.length >= n) break;
  }
  return tags;
}

/** Deterministically shape a channel draft from supplied facts only (no invented claims). */
export function draftPost(k: CompanyKnowledge, channel: Channel): PostDraft {
  const spec = CHANNEL_SPEC[channel];
  const base = `${k.valueProposition}${k.services?.length ? ` — ${k.services.join(", ")}.` : "."}`;
  const cta = k.url ? ` Læs mere: ${k.url}` : "";
  const full = `${base}${cta}`;
  const truncated = full.length > spec.maxChars;
  const text = truncated ? full.slice(0, spec.maxChars - 1).trimEnd() + "…" : full;
  return { channel, text, hashtags: hashtagsFrom(k, spec.hashtags), truncated, publishSupported: spec.publishSupported };
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a `marketing.campaign.create` DRAFT for the given channels. Never publishes. */
export async function proposePostDrafts(proposer: Proposer, k: CompanyKnowledge, channels: Channel[]) {
  const results = [];
  for (const channel of channels) {
    const draft = draftPost(k, channel);
    results.push(
      await proposer.propose({
        actionName: "marketing.campaign.create",
        input: {
          name: `${k.name} — ${channel} draft`,
          channel,
          body: draft.text,
          hashtags: draft.hashtags,
          publish_supported: draft.publishSupported,
        },
        reason: `Channel-adapted draft for ${channel} (draft only, no publish)`,
        idempotencyKey: `mkt-draft-${k.name}-${channel}`.toLowerCase().replace(/\s+/g, "-"),
      }),
    );
  }
  return results;
}
