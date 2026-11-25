// ORIGIN explainable trend score (0-10). Pure, deterministic, no dependencies, so the same
// code can run in an n8n Code node and in tests.
//
// Rules that keep it honest:
//  - Metric features (views, shares, retention, ...) must come from an official API ('api') or be
//    computed from API numbers ('derived'). A model can never supply them; such input is discarded.
//  - A missing feature is left out and lowers evidence quality. It is never filled in.
//  - Judgement features (hook, clarity, ...) need a model score and an independent evaluator score.
//    The lower of the two is used, so one optimistic model cannot push a video over the bar.
//  - A video passes only with total >= 8.0, enough evidence, confidence, brand safety and low copyright risk.

export const SCORING_VERSION = 'origin-score-v1';

export const FEATURES = {
  hook:                { weight: 0.12, kind: 'judgement' },
  first_3s:            { weight: 0.10, kind: 'judgement' },
  retention:           { weight: 0.10, kind: 'metric' },
  novelty:             { weight: 0.07, kind: 'judgement' },
  emotion:             { weight: 0.06, kind: 'judgement' },
  clarity:             { weight: 0.06, kind: 'judgement' },
  visual_pattern:      { weight: 0.06, kind: 'judgement' },
  audience_match:      { weight: 0.12, kind: 'judgement' },
  engagement_velocity: { weight: 0.09, kind: 'metric' },
  shares:              { weight: 0.07, kind: 'metric' },
  comments:            { weight: 0.04, kind: 'metric' },
  replays:             { weight: 0.03, kind: 'metric' },
  trend_growth:        { weight: 0.08, kind: 'metric' },
};
// Gates: scored 0-10 where 10 = safe / no risk. They do not add to the total; they can only block.
export const GATES = { brand_safety: 7, copyright_risk: 7 };

export const THRESHOLDS = { pass: 8.0, minCoverage: 0.6, minConfidence: 0.6, maxDisagreement: 2.5 };

const isScore = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10;
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * input = {
 *   features:  { [name]: { score, source: 'api'|'derived'|'model', evidence } },   // analyst / metrics
 *   evaluator: { [name]: { score, evidence } },                                    // independent model
 *   gates:     { brand_safety: { score, evidence }, copyright_risk: { score, evidence } },
 *   analystModel, evaluatorModel
 * }
 */
export function scoreCandidate(input) {
  const features = input.features || {};
  const evaluator = input.evaluator || {};
  const gates = input.gates || {};
  const rows = {};
  const notes = [];
  const gateReasons = [];
  let weightUsed = 0, weighted = 0, disagreements = 0, judged = 0;

  for (const [name, def] of Object.entries(FEATURES)) {
    const f = features[name];
    const row = { weight: def.weight, kind: def.kind, score: null, source: null, evidence: null, contribution: 0, status: 'missing' };
    rows[name] = row;
    if (!f || !isScore(f.score)) continue;
    if (!f.evidence || typeof f.evidence !== 'string') { row.status = 'rejected_no_evidence'; notes.push(`${name}: no evidence, ignored`); continue; }

    if (def.kind === 'metric') {
      if (f.source !== 'api' && f.source !== 'derived') {
        row.status = 'rejected_not_measured';
        notes.push(`${name}: metric not from an official API, ignored (metrics are never estimated)`);
        continue;
      }
      Object.assign(row, { score: f.score, source: f.source, evidence: f.evidence, status: 'ok' });
    } else {
      const e = evaluator[name];
      if (!e || !isScore(e.score)) { row.status = 'rejected_no_evaluator'; notes.push(`${name}: no independent evaluation, ignored`); continue; }
      judged++;
      const gap = Math.abs(f.score - e.score);
      if (gap > THRESHOLDS.maxDisagreement) disagreements++;
      Object.assign(row, { score: Math.min(f.score, e.score), source: 'model', evidence: f.evidence,
        analyst_score: f.score, evaluator_score: e.score, evaluator_evidence: e.evidence || null, status: 'ok' });
    }
    weightUsed += def.weight;
    weighted += def.weight * row.score;
  }

  const totalWeight = Object.values(FEATURES).reduce((a, d) => a + d.weight, 0);
  const coverage = weightUsed / totalWeight;
  const total = weightUsed > 0 ? weighted / weightUsed : 0;
  for (const row of Object.values(rows)) if (row.status === 'ok') row.contribution = round1((row.weight / weightUsed) * row.score);

  const agreement = judged === 0 ? 0 : 1 - disagreements / judged;
  const confidence = Math.max(0, Math.min(1, coverage * (0.5 + 0.5 * agreement)));
  const evidenceQuality = round1(coverage * 10);

  const gateRows = {};
  for (const [g, min] of Object.entries(GATES)) {
    const v = gates[g];
    const ok = v && isScore(v.score) && typeof v.evidence === 'string' && v.evidence.length > 0;
    gateRows[g] = ok ? { score: v.score, evidence: v.evidence, min } : { score: null, evidence: null, min };
    if (!ok) gateReasons.push(`${g}: not assessed`);
    else if (v.score < min) gateReasons.push(`${g}: ${v.score} < ${min}`);
  }
  if (total < THRESHOLDS.pass) gateReasons.push(`score ${round1(total)} < ${THRESHOLDS.pass}`);
  if (coverage < THRESHOLDS.minCoverage) gateReasons.push(`evidence coverage ${Math.round(coverage * 100)}% < ${THRESHOLDS.minCoverage * 100}%`);
  if (confidence < THRESHOLDS.minConfidence) gateReasons.push(`confidence ${confidence.toFixed(2)} < ${THRESHOLDS.minConfidence}`);
  if (judged > 0 && disagreements > 0) notes.push(`analyst and evaluator disagreed by more than ${THRESHOLDS.maxDisagreement} on ${disagreements} feature(s); the lower score was used`);

  const top = Object.entries(rows).filter(([, r]) => r.status === 'ok').sort((a, b) => b[1].contribution - a[1].contribution).slice(0, 3);
  const explanation = [
    `total ${round1(total)}/10 from ${Object.values(rows).filter((r) => r.status === 'ok').length} of ${Object.keys(FEATURES).length} features (${Math.round(coverage * 100)}% of weight evidenced)`,
    ...top.map(([n, r]) => `${n}: ${r.score}/10 (${r.source}) - ${r.evidence}`),
    ...notes,
  ];

  return {
    scoring_version: SCORING_VERSION,
    analyst_model: input.analystModel || null,
    evaluator_model: input.evaluatorModel || null,
    total_score: round1(total),
    confidence: Math.round(confidence * 1000) / 1000,
    evidence_quality: evidenceQuality,
    passed: gateReasons.length === 0,
    gate_reasons: gateReasons,
    feature_scores: { ...rows, gates: gateRows },
    explanation,
  };
}

/** Deterministic 0-10 score for a raw API metric, relative to a cohort of the same metric
 *  (same platform, same source, same capture window). Returns null if there is no cohort. */
export function percentileScore(value, cohort) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const xs = (cohort || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (xs.length < 5) return null; // too little data to rank honestly
  const below = xs.filter((x) => x < value).length;
  const equal = xs.filter((x) => x === value).length;
  return round1(((below + 0.5 * equal) / xs.length) * 10);
}

/** Per-hour growth of a metric between two API snapshots. null when not computable. */
export function velocityPerHour(older, newer, metric) {
  if (!older || !newer) return null;
  const a = older.metrics && older.metrics[metric], b = newer.metrics && newer.metrics[metric];
  const hours = (new Date(newer.captured_at) - new Date(older.captured_at)) / 3.6e6;
  if (typeof a !== 'number' || typeof b !== 'number' || !(hours > 0)) return null;
  return (b - a) / hours;
}
