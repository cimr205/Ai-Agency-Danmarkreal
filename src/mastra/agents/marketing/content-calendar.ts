/**
 * 30-day content-calendar generator (read-only planning, propose-only).
 *
 * Deterministically lays out a content plan from supplied company-knowledge facts
 * and a channel rotation + weekly cadence, reusing the channel-adapted drafter. Each
 * entry is a dated DRAFT post; the plan is editable (the owner can reorder / drag-drop
 * in the UI) and each entry is proposed as a `marketing.campaign.create` DRAFT — never
 * published, no live AI generation, no fabricated metrics.
 *
 * PERSISTENCE IS DEFERRED: there is no content-calendar table yet (OWNER_DECISIONS #7).
 * This generates and proposes the plan; storing/editing it needs that schema.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";
import { draftPost, type Channel, type CompanyKnowledge } from "./post-drafter.ts";

export interface CalendarOptions {
  /** Start of the 30-day window (ms). */
  startMs: number;
  /** Channels to rotate through, in order. */
  channels: Channel[];
  /** Posts per week (spread across the week). Default 3. */
  postsPerWeek?: number;
  /** Number of days to plan. Default 30. */
  days?: number;
}

export interface CalendarEntry {
  date: string; // YYYY-MM-DD
  channel: Channel;
  text: string;
  hashtags: string[];
  publishSupported: boolean;
}

const DAY_MS = 86_400_000;

/** The day-of-week offsets to post on, spread as evenly as possible for a given weekly cadence. */
function postDaysOfWeek(postsPerWeek: number): number[] {
  const n = Math.max(1, Math.min(7, postsPerWeek));
  const step = 7 / n;
  const days: number[] = [];
  for (let i = 0; i < n; i++) days.push(Math.round(i * step) % 7);
  return [...new Set(days)];
}

/** Deterministically build the content plan. Pure; same inputs → same plan. */
export function generateCalendar(knowledge: CompanyKnowledge, opts: CalendarOptions): CalendarEntry[] {
  const days = opts.days ?? 30;
  const postsPerWeek = opts.postsPerWeek ?? 3;
  const postDays = postDaysOfWeek(postsPerWeek);
  const channels = opts.channels.length ? opts.channels : (["facebook"] as Channel[]);

  const entries: CalendarEntry[] = [];
  let channelIdx = 0;
  for (let d = 0; d < days; d++) {
    const dayMs = opts.startMs + d * DAY_MS;
    const dow = new Date(dayMs).getUTCDay();
    if (!postDays.includes(dow)) continue;
    const channel = channels[channelIdx % channels.length];
    channelIdx++;
    const draft = draftPost(knowledge, channel);
    entries.push({
      date: new Date(dayMs).toISOString().slice(0, 10),
      channel,
      text: draft.text,
      hashtags: draft.hashtags,
      publishSupported: draft.publishSupported,
    });
  }
  return entries;
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose each planned post as a marketing.campaign.create DRAFT. Never publishes. */
export async function proposeCalendar(proposer: Proposer, knowledge: CompanyKnowledge, opts: CalendarOptions) {
  const entries = generateCalendar(knowledge, opts);
  const results = [];
  for (const e of entries) {
    results.push(
      await proposer.propose({
        actionName: "marketing.campaign.create",
        input: {
          name: `${knowledge.name} — ${e.channel} ${e.date}`,
          channel: e.channel,
          scheduled_date: e.date,
          body: e.text,
          hashtags: e.hashtags,
          publish_supported: e.publishSupported,
        },
        reason: `Content calendar draft for ${e.channel} on ${e.date} (draft only, no publish)`,
        idempotencyKey: `mkt-calendar-${knowledge.name}-${e.date}-${e.channel}`.toLowerCase().replace(/\s+/g, "-"),
      }),
    );
  }
  return results;
}
