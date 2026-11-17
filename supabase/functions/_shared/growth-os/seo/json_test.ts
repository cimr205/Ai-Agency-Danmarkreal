// Ported from ~/seo-autopilot/src/json.test.ts.
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractJson, repairTruncatedJson } from "./json.ts";

Deno.test('extractJson: ren JSON', () => {
  assertEquals(extractJson('{"a":1}'), { a: 1 });
});

Deno.test('extractJson: ```json-fence', () => {
  const text = 'Her er resultatet:\n```json\n{"a": 1, "b": [1,2,3]}\n```\nTak.';
  assertEquals(extractJson(text), { a: 1, b: [1, 2, 3] });
});

Deno.test('extractJson: ```-fence uden json-label', () => {
  const text = '```\n{"ok": true}\n```';
  assertEquals(extractJson(text), { ok: true });
});

Deno.test('extractJson: prosa omkring et array', () => {
  const text = 'Her er listen: [1, 2, 3] - det var alt.';
  assertEquals(extractJson(text), [1, 2, 3]);
});

Deno.test('extractJson: kaster ved intet JSON', () => {
  assertThrows(() => extractJson('bare noget tekst uden json'));
});

Deno.test('extractJson: redder afbrudt JSON (truncated streng)', () => {
  const text = '{"title": "Hej med dig';
  assertEquals(extractJson(text), { title: 'Hej med dig' });
});

Deno.test('extractJson: redder afbrudt JSON (midt i nøgle)', () => {
  const text = '{"title": "Hej", "meta_desc';
  assertEquals(extractJson(text), { title: 'Hej' });
});

Deno.test('extractJson: redder afbrudt JSON (åbent array af objekter)', () => {
  const text = '{"items": [{"a": 1}, {"a": 2';
  assertEquals(extractJson(text), { items: [{ a: 1 }, { a: 2 }] });
});

Deno.test('repairTruncatedJson: lukker åben streng og objekt', () => {
  const repaired = repairTruncatedJson('{"a": "hej');
  assertEquals(repaired, '{"a": "hej"}');
});

Deno.test('repairTruncatedJson: dropper hængende komma', () => {
  const repaired = repairTruncatedJson('{"a": 1,');
  assertEquals(repaired, '{"a": 1}');
});

Deno.test('repairTruncatedJson: returnerer null for ikke-JSON', () => {
  assertEquals(repairTruncatedJson('bare tekst'), null);
});

Deno.test('repairTruncatedJson: returnerer null for allerede-gyldig JSON', () => {
  assertEquals(repairTruncatedJson('{"a": 1}'), null);
});
