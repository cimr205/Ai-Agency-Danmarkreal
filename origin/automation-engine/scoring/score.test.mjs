import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, percentileScore, velocityPerHour, FEATURES } from './score.mjs';

const judgement = Object.entries(FEATURES).filter(([, d]) => d.kind === 'judgement').map(([n]) => n);
const metrics = Object.entries(FEATURES).filter(([, d]) => d.kind === 'metric').map(([n]) => n);
const safeGates = { brand_safety: { score: 9, evidence: 'no unsafe content' }, copyright_risk: { score: 9, evidence: 'original audio' } };

function full(score, evalScore = score) {
  const features = {}, evaluator = {};
  for (const n of judgement) { features[n] = { score, source: 'model', evidence: `${n} seen at 0:01` }; evaluator[n] = { score: evalScore, evidence: 'agree' }; }
  for (const n of metrics) features[n] = { score, source: 'api', evidence: `${n} from ig insights` };
  return { features, evaluator, gates: safeGates, analystModel: 'a/model', evaluatorModel: 'b/model' };
}

test('strong, fully evidenced candidate passes', () => {
  const r = scoreCandidate(full(9));
  assert.equal(r.total_score, 9);
  assert.equal(r.passed, true);
  assert.equal(r.evidence_quality, 10);
  assert.deepEqual(r.gate_reasons, []);
});

test('7.9 does not pass', () => {
  const r = scoreCandidate(full(7.9));
  assert.equal(r.passed, false);
  assert.match(r.gate_reasons.join(), /score 7.9 < 8/);
});

test('metrics supplied by a model are discarded, never used', () => {
  const input = full(9);
  for (const n of metrics) input.features[n] = { score: 10, source: 'model', evidence: 'model guessed' };
  const r = scoreCandidate(input);
  for (const n of metrics) assert.equal(r.feature_scores[n].status, 'rejected_not_measured');
  assert.ok(r.evidence_quality < 10);
});

test('third-party video without retention data: missing features lower evidence, are not invented', () => {
  const input = full(9.5);
  delete input.features.retention; delete input.features.replays;
  const r = scoreCandidate(input);
  assert.equal(r.feature_scores.retention.status, 'missing');
  assert.equal(r.feature_scores.retention.score, null);
  assert.equal(r.evidence_quality, 8.7);
  assert.equal(r.passed, true);
});

test('too little evidence blocks a high score', () => {
  const input = { features: { hook: { score: 10, source: 'model', evidence: 'x' } }, evaluator: { hook: { score: 10, evidence: 'y' } }, gates: safeGates };
  const r = scoreCandidate(input);
  assert.equal(r.total_score, 10);
  assert.equal(r.passed, false);
  assert.match(r.gate_reasons.join(), /coverage/);
});

test('judgement without independent evaluator is ignored', () => {
  const input = full(9);
  input.evaluator = {};
  const r = scoreCandidate(input);
  for (const n of judgement) assert.equal(r.feature_scores[n].status, 'rejected_no_evaluator');
  assert.equal(r.passed, false);
});

test('evaluator disagreement uses the lower score and lowers confidence', () => {
  const r = scoreCandidate(full(10, 6));
  assert.equal(r.feature_scores.hook.score, 6);
  assert.ok(r.confidence < 1);
  assert.equal(r.passed, false);
});

test('brand safety and copyright gates block, and missing gates block', () => {
  const unsafe = full(9); unsafe.gates = { ...safeGates, brand_safety: { score: 4, evidence: 'violence' } };
  assert.match(scoreCandidate(unsafe).gate_reasons.join(), /brand_safety: 4 < 7/);
  const noGate = full(9); noGate.gates = {};
  assert.match(scoreCandidate(noGate).gate_reasons.join(), /copyright_risk: not assessed/);
});

test('features without evidence text are rejected', () => {
  const input = full(9); input.features.hook.evidence = '';
  assert.equal(scoreCandidate(input).feature_scores.hook.status, 'rejected_no_evidence');
});

test('deterministic: same input, same output', () => {
  assert.deepEqual(scoreCandidate(full(8.4)), scoreCandidate(full(8.4)));
});

test('percentileScore needs a real cohort', () => {
  assert.equal(percentileScore(5, [1, 2, 3]), null);
  assert.equal(percentileScore(100, [1, 2, 3, 4, 5]), 10);
  assert.equal(percentileScore(0, [1, 2, 3, 4, 5]), 0);
  assert.equal(percentileScore(3, [1, 2, 3, 4, 5]), 5);
});

test('velocityPerHour from two snapshots', () => {
  const a = { captured_at: '2026-11-25T10:00:00Z', metrics: { like_count: 100 } };
  const b = { captured_at: '2026-11-25T12:00:00Z', metrics: { like_count: 300 } };
  assert.equal(velocityPerHour(a, b, 'like_count'), 100);
  assert.equal(velocityPerHour(a, b, 'view_count'), null);
  assert.equal(velocityPerHour(b, a, 'like_count'), null);
});
